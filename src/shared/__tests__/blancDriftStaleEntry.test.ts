/**
 * Every check in `tools/blanc-drift.cjs` is a `.filter()` over the LIVE section
 * list, so a manifest entry keyed on a section that no longer exists is
 * structurally invisible: nothing iterates it, and it can claim `covered`
 * forever.
 *
 * That was not hypothetical. The Files app absorbed the Notebook section, so
 * `notebook` left `DESKTOP_WIN_SECTIONS` and became a
 * `LEGACY_WIN_SECTION_ALIASES` entry pointing at `files` — while its manifest
 * entry still read `status: covered`. Persisted desktop windows carrying
 * `section: 'notebook'` resolve to `files`, which is `pending`. So the manifest
 * asserted coverage for a surface the user lands on that is NOT covered, and
 * the tool could not see it. A previous turn described this in prose in the
 * `files` note, which is precisely where a check belongs instead.
 *
 * Pinned here: an orphan is reported, an orphan that misdirects coverage is
 * fatal, an alias whose target really is covered stays quiet, and an alias map
 * that parses to nothing REFUSES rather than reporting no orphans.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'blanc-drift.cjs');

const made: string[] = [];
afterEach(() => {
  while (made.length) fs.rmSync(made.pop() as string, { recursive: true, force: true });
});

interface Fixture {
  sections: string[];
  aliases?: Record<string, string> | null;
  manifest: Record<string, { status: string; blancToolId?: string; blancSurface?: string }>;
}

/** A minimal tree the tool can run end to end against. */
function build({ sections, aliases = {}, manifest }: Fixture): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-stale-'));
  made.push(dir);
  const blancDir = path.join(dir, 'src', 'renderer', 'components', 'blanc');
  fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'shared'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'src', 'renderer', 'views'), { recursive: true });
  fs.mkdirSync(blancDir, { recursive: true });
  fs.copyFileSync(TOOL, path.join(dir, 'tools', 'blanc-drift.cjs'));

  const aliasBlock =
    aliases === null
      ? ''
      : `export const LEGACY_WIN_SECTION_ALIASES: Readonly<Record<string, DesktopWinSection>> = {\n` +
        Object.entries(aliases)
          .map(([from, to]) => `  ${from}: '${to}',`)
          .join('\n') +
        `\n};\n`;

  fs.writeFileSync(
    path.join(dir, 'src', 'shared', 'desktop.ts'),
    `export const DESKTOP_WIN_SECTIONS = [\n` +
      sections.map((s) => `  '${s}',`).join('\n') +
      `\n] as const;\n\nexport type DesktopWinSection = (typeof DESKTOP_WIN_SECTIONS)[number];\n\n${aliasBlock}`,
  );

  // Only what the tool parses: the tool id list and one render branch per id.
  const ids = [...new Set(Object.values(manifest).flatMap((e) => (e.blancToolId ? [e.blancToolId] : [])))];
  fs.writeFileSync(
    path.join(blancDir, 'BlancShell.tsx'),
    `const BLANC_TOOL_IDS: BlancToolId[] = [\n` +
      ids.map((id) => `  '${id}',`).join('\n') +
      `\n];\n\nfunction renderBlancTool(tool) {\n` +
      ids.map((id) => `  if (tool === '${id}') return <BlancPanel${id.replace(/-/g, '')} />;`).join('\n') +
      `\n  return <BlancCalculatorPanel />;\n}\n`,
  );

  fs.writeFileSync(path.join(dir, 'blanc-coverage.json'), JSON.stringify({ sections: manifest }, null, 2));
  return dir;
}

function run(dir: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [path.join(dir, 'tools', 'blanc-drift.cjs'), '--json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

const COVERED = { status: 'covered', blancToolId: 'dictionary' };

describe('blanc-drift sees manifest entries for sections that no longer exist', () => {
  it('reports an entry that names neither a live section nor an alias', () => {
    const { status, stdout } = run(
      build({
        sections: ['dictionary'],
        manifest: { dictionary: COVERED, ghost: { status: 'covered', blancToolId: 'dictionary' } },
      }),
    );
    const report = JSON.parse(stdout) as { staleEntries: string[] };
    expect(report.staleEntries).toEqual(['ghost']);
    expect(status).toBe(1);
  });

  it('is FATAL when a retired section claims coverage its replacement lacks', () => {
    // The exact `notebook -> files` shape: the alias target is pending.
    const { status, stdout } = run(
      build({
        sections: ['files'],
        aliases: { notebook: 'files' },
        manifest: { files: { status: 'pending' }, notebook: COVERED },
      }),
    );
    const report = JSON.parse(stdout) as { misleadingAliases: string[]; staleEntries: string[] };
    expect(report.misleadingAliases).toEqual(['notebook → files (claims covered; files is pending)']);
    // It is an alias, so it must NOT also be reported as an unresolved orphan.
    expect(report.staleEntries).toEqual([]);
    expect(status).toBe(1);
  });

  it('stays quiet when the alias target really is covered', () => {
    // The negative control: same shape, only the target's status differs. If
    // this failed too, the check would just be flagging every alias.
    const { status, stdout } = run(
      build({
        sections: ['files'],
        aliases: { notebook: 'files' },
        manifest: { files: COVERED, notebook: COVERED },
      }),
    );
    const report = JSON.parse(stdout) as { misleadingAliases: string[]; benignAliases: string[] };
    expect(report.misleadingAliases).toEqual([]);
    expect(report.benignAliases).toEqual(['notebook → files']);
    expect(status).toBe(0);
  });

  it('REFUSES an alias map it can see but cannot parse, rather than reporting no orphans', () => {
    const dir = build({
      sections: ['files'],
      aliases: { notebook: 'files' },
      manifest: { files: COVERED, notebook: COVERED },
    });
    const desktop = path.join(dir, 'src', 'shared', 'desktop.ts');
    fs.writeFileSync(
      desktop,
      fs
        .readFileSync(desktop, 'utf8')
        .replace("  notebook: 'files',", '  ...RETIRED_SECTION_MAP,'),
    );
    const { status, stderr } = run(dir);
    expect(stderr).toMatch(/ZERO aliases/);
    expect(status).not.toBe(0);
  });

  it('accepts a genuinely EMPTY alias map, which is not the same as an unparseable one', () => {
    // The discriminator for the refusal above. A tree that has retired nothing
    // yet writes `= {};` — refusing on that would be a false alarm, so the
    // refusal keys on the body having content, not on the pair count alone.
    const { status, stdout } = run(
      build({ sections: ['dictionary'], aliases: {}, manifest: { dictionary: COVERED } }),
    );
    const report = JSON.parse(stdout) as { staleEntries: string[]; aliasCheckDisabled: boolean };
    expect(report.staleEntries).toEqual([]);
    expect(report.aliasCheckDisabled).toBe(false);
    expect(status).toBe(0);
  });

  it('leaves this repo with no stale entries', () => {
    // Guards the `notebook` removal itself: reintroducing a dead-section entry
    // turns this red rather than sitting invisible in the manifest.
    const out = execFileSync(process.execPath, [TOOL, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const report = JSON.parse(out) as {
      staleEntries: string[];
      misleadingAliases: string[];
      aliasCheckDisabled: boolean;
    };
    expect(report.staleEntries).toEqual([]);
    expect(report.misleadingAliases).toEqual([]);
    // If this flipped true the two assertions above would be vacuous.
    expect(report.aliasCheckDisabled).toBe(false);
  });
});
