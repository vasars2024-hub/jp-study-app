/**
 * `tools/blanc-drift.cjs` is the entry point for the Blanc track: it turns
 * "update Blanc" into a deterministic work-list. Nothing tested it, and on
 * 2026-08-24 `6b490fc3` changed `DesktopWinSection` from a literal union to
 * `(typeof DESKTOP_WIN_SECTIONS)[number]`. The old parser still MATCHED that
 * declaration and extracted zero string literals from it, so `sections` was
 * `[]` — and unclassified/pending/brokenClaims are all `.filter()` over it.
 * Zero denominator, zero findings, exit 0, and the script printed
 * "Clean: Blanc covers every classified Study OS surface" for twelve days.
 *
 * Two properties are pinned here, and the second is the load-bearing one:
 *   1. the tool's section count equals the real `DESKTOP_WIN_SECTIONS` length;
 *   2. a tree it cannot parse makes it REFUSE, not report clean.
 *
 * (1) alone would not have caught the original defect on a future refactor that
 * also emptied the array. (2) is what makes a blind parser loud.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESKTOP_WIN_SECTIONS } from '../desktop';

const ROOT = path.join(__dirname, '..', '..', '..');
const TOOL = path.join(ROOT, 'tools', 'blanc-drift.cjs');

/** Run the tool at an arbitrary root by copying it into a fixture tree. */
function runAt(root: string): { status: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(process.execPath, [path.join(root, 'tools', 'blanc-drift.cjs')], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout, stderr: '' };
  } catch (err) {
    const e = err as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}

describe('blanc-drift denominator', () => {
  it('reports every DESKTOP_WIN_SECTIONS member, not zero', () => {
    const out = execFileSync(process.execPath, [TOOL, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const report = JSON.parse(out) as { totals: { studyOsSections: number } };

    // The count itself, and that it is not the vacuous zero.
    expect(report.totals.studyOsSections).toBe(DESKTOP_WIN_SECTIONS.length);
    expect(report.totals.studyOsSections).toBeGreaterThan(0);
  });

  it('REFUSES a desktop.ts it cannot extract sections from, instead of reporting clean', () => {
    // Only two files are needed: main() calls loadManifest() then
    // studyOsSections(), and the refusal fires before BlancShell is ever read.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-drift-'));
    try {
      fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'src', 'shared'), { recursive: true });
      fs.copyFileSync(TOOL, path.join(dir, 'tools', 'blanc-drift.cjs'));
      fs.writeFileSync(path.join(dir, 'blanc-coverage.json'), JSON.stringify({ sections: {} }));
      // The exact shape 6b490fc3 introduced: the old regex matches this line and
      // finds no string literals in it.
      fs.writeFileSync(
        path.join(dir, 'src', 'shared', 'desktop.ts'),
        'export type DesktopWinSection = (typeof DESKTOP_WIN_SECTIONS)[number];\n',
      );

      const { status, stdout, stderr } = runAt(dir);

      expect(status).not.toBe(0);
      expect(stderr).toMatch(/ZERO sections|Could not find DESKTOP_WIN_SECTIONS/);
      // The exact regression: it must never take the clean branch.
      expect(stdout).not.toMatch(/Clean:/);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('still reads a pre-6b490fc3 literal union, so the tool works on an older tree', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blanc-drift-'));
    try {
      fs.mkdirSync(path.join(dir, 'tools'), { recursive: true });
      fs.mkdirSync(path.join(dir, 'src', 'shared'), { recursive: true });
      fs.copyFileSync(TOOL, path.join(dir, 'tools', 'blanc-drift.cjs'));
      fs.writeFileSync(path.join(dir, 'blanc-coverage.json'), JSON.stringify({ sections: {} }));
      fs.writeFileSync(
        path.join(dir, 'src', 'shared', 'desktop.ts'),
        "export type DesktopWinSection = 'library' | 'dictionary' | 'grammar';\n",
      );

      const { status, stderr } = runAt(dir);

      // It gets PAST the section parser — it fails later, on the BlancShell this
      // fixture does not carry, which is a different error entirely.
      expect(stderr).not.toMatch(/ZERO sections/);
      expect(stderr).toMatch(/BLANC_TOOL_IDS|ENOENT/);
      expect(status).not.toBe(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
