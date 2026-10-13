/**
 * The orphan-key gate (`tools/i18n-orphan-key-check.cjs`), run by vitest.
 *
 * It went red with 21 namespace regressions (90 keys) and nobody noticed, because nothing ran
 * it: a `.cjs` under `tools/` is executed by whoever remembers to. Every other i18n gate in
 * this repo either lives in a test or is called from one (`i18n.test.ts` imports
 * `i18n-hardcoded-check.cjs`'s `scan`, `i18nShadowGate.test.ts` runs the shadow tool), so this
 * one now does too — in-process, through the tool's own exported `scan()`, so the CLI and this
 * test can never disagree about what an orphan is.
 *
 * What a regression means: a namespace whose count of keys with no consumer rose above the
 * number recorded in `tools/i18n-orphan-key-baseline.json`. Either a caller was lost (wire it
 * back up) or a surface was deliberately removed (delete its keys from all four catalogs). A
 * key reached through a template (`` t(`a.b.${x}`) ``) is credited by prefix; a key that
 * really is built some other way should be rewritten as a template the scan can see — that
 * is also what lets `dynamicI18nKeyGate.test.ts` bind its prefix to the union that feeds it.
 * Re-baselining (`--update-baseline`) is for the ratchet going DOWN, never for silencing a
 * regression.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

interface Orphan {
  key: string;
  namespace: string;
}
interface Regression {
  namespace: string;
  count: number;
  allowed: number;
}
interface ScanResult {
  declared: Map<string, string>;
  orphans: Orphan[];
  regressions: Regression[];
  improvements: Regression[];
}

const require = createRequire(import.meta.url);
const { scan } = require('../../../tools/i18n-orphan-key-check.cjs') as {
  scan: (opts?: { root?: string; baselinePath?: string }) => ScanResult;
};

describe('the repo has no orphan-key regression', () => {
  it('no namespace has more orphaned keys than its baseline allows', () => {
    const { declared, orphans, regressions } = scan();
    // Not vacuous: the scan read the real catalogs, and most keys have a consumer.
    expect(declared.size).toBeGreaterThan(10_000);
    expect(orphans.length).toBeLessThan(declared.size / 10);

    const detail = regressions.map((r) => {
      const keys = orphans.filter((o) => o.namespace === r.namespace).map((o) => o.key);
      return `${r.namespace}: ${r.count} orphaned, baseline allows ${r.allowed} (${keys.join(', ')})`;
    });
    expect(
      detail,
      'wire each key back to its surface, or delete it from all four catalogs if the surface is ' +
        'gone — `node tools/i18n-orphan-key-check.cjs --list <prefix>` lists them',
    ).toEqual([]);
    // 60s: a whole-src sweep, the same budget as the hardcoded-text gate in i18n.test.ts.
  }, 60_000);
});

/**
 * The gate fires on a planted orphan — proven on a temp tree shaped like the repo, because a
 * gate that has only ever been seen passing is not known to be a gate.
 */
describe('the gate fires on a planted orphan and credits real consumers', () => {
  let dir: string | null = null;
  afterEach(() => {
    if (dir !== null) rmSync(dir, { recursive: true, force: true });
    dir = null;
  });

  function tree(baseline: Record<string, number>): string {
    dir = mkdtempSync(join(tmpdir(), 'orphan-gate-'));
    mkdirSync(join(dir, 'src', 'shared', 'i18n', 'catalogs'), { recursive: true });
    mkdirSync(join(dir, 'src', 'renderer', '__tests__'), { recursive: true });
    mkdirSync(join(dir, 'tools'), { recursive: true });
    writeFileSync(
      join(dir, 'src', 'shared', 'i18n', 'catalogs', 'en.ts'),
      [
        'export const en = {',
        "  'demo.used.label': 'Used',",
        "  'demo.dyn.alpha': 'Alpha',",
        "  'demo.dyn.beta': 'Beta',",
        "  'demo.dead.label': 'Dead',",
        "  'demo.comment.label': 'Only named in a comment',",
        "  'demo.tested.label': 'Only named in a test',",
        '};',
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'src', 'renderer', 'Widget.tsx'),
      [
        "const label = t('demo.used.label');",
        'const dyn = t(`demo.dyn.${kind}`);',
        "// t('demo.comment.label') — a comment is not a consumer",
        "const url = 'image/*'; // a glob in a string must not open a block comment",
        '',
      ].join('\n'),
    );
    writeFileSync(
      join(dir, 'src', 'renderer', '__tests__', 'Widget.test.tsx'),
      "expect(t('demo.tested.label')).toBe('x');\n",
    );
    writeFileSync(join(dir, 'tools', 'i18n-orphan-key-baseline.json'), JSON.stringify({ namespaces: baseline }));
    return dir;
  }

  it('reports a key nothing asks for, a key only a comment names, and a key only a test names', () => {
    const root = tree({});
    const { orphans, regressions } = scan({ root });
    expect(orphans.map((o) => o.key).sort()).toEqual([
      'demo.comment.label',
      'demo.dead.label',
      'demo.tested.label',
    ]);
    expect(regressions.map((r) => r.namespace).sort()).toEqual(['demo.comment', 'demo.dead', 'demo.tested']);
  });

  it('credits a literal t() call and a template prefix', () => {
    const { orphans } = scan({ root: tree({}) });
    const keys = orphans.map((o) => o.key);
    expect(keys).not.toContain('demo.used.label');
    expect(keys).not.toContain('demo.dyn.alpha');
    expect(keys).not.toContain('demo.dyn.beta');
  });

  it('is a ratchet: a namespace at its recorded count passes, one past it fails', () => {
    const at = scan({ root: tree({ 'demo.dead': 1, 'demo.comment': 1, 'demo.tested': 1 }) });
    expect(at.regressions).toEqual([]);
    rmSync(dir as string, { recursive: true, force: true });
    const past = scan({ root: tree({ 'demo.dead': 0, 'demo.comment': 1, 'demo.tested': 1 }) });
    expect(past.regressions).toEqual([{ namespace: 'demo.dead', count: 1, allowed: 0 }]);
  });
});
