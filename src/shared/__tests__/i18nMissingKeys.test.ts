import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `tools/i18n-missing-key-check.cjs` had no caller.
 *
 * It is the only check in this repo that answers "does the text the app asks for
 * exist?" — `i18n-check.cjs` compares the four catalogs against each other, so a
 * key absent from all four is absent from both sides of every comparison and
 * passes; `i18n-hardcoded-check.cjs` skips any file that adopts i18n at all. The
 * tool's own header declares itself a hard zero with no baseline and no ratchet.
 * Nothing ran it: `grep -rn i18n-missing-key-check` over the repo returned the
 * tool itself and nothing else, no npm script, no test, no gate list.
 *
 * So it drifted off zero and stayed there. Found 2026-09-03: the Deck Workbench
 * tray asked for `ankiWorkbench.tray.stale.mode`, which is the PREFIX of the two
 * option keys beneath it and not a key — the label's own key is `modes`. Since
 * `translate()` returns the key itself on a total miss (`shared/i18n/core.ts:94`),
 * the literal ASCII string `ankiWorkbench.tray.stale.mode` rendered above that
 * select in Japanese, Chinese and Russian too, while the four translations
 * written for it sat unreachable in the catalogs.
 *
 * The scan is imported rather than reimplemented, so the CLI and this gate cannot
 * drift apart — the same arrangement `i18n.test.ts` uses for the other two tools.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires -- CJS tool, intentionally shared
const { scan } = require('../../../tools/i18n-missing-key-check.cjs') as {
  scan: (opts?: { dirs?: string[] }) => { file: string; missing: string[] }[];
};

let offenders: { file: string; missing: string[] }[] = [];

/**
 * The whole-tree read is a FIXTURE, not an assertion, and it is charged to the
 * hook that incurs it — the shape this repo adopted for `deletedPlayerDependents`
 * after boss-audit Finding 7, where a ~1,900-file walk paid for out of a per-case
 * budget timed out under full-suite load and read as a product regression.
 *
 * Measured on this machine 2026-09-03: 1,510 files / 19.5 MB across src/renderer,
 * src/media, src/main, src/shared, src/main.ts and src/preload.ts. Reading them is
 * the entire cost — 8.4 s warm standalone, 3.7 s under vitest's warm cache. The
 * two comment-stripping regexes are 8 ms and 37 ms for the whole tree and the
 * esbuild bundle of the catalogs is 587 ms, so there is nothing algorithmic to
 * remove here; the budget is generous because a fixture's is allowed to be, and a
 * walk that genuinely hangs still fails at 180 s.
 */
beforeAll(() => {
  offenders = scan();
}, 180_000);

describe('every t() key the app asks for by name is defined', () => {
  it('no source file references a key that exists in no catalog', () => {
    expect(
      offenders.map((o) => `${o.file}: ${o.missing.join(', ')}`),
      'these render as the bare key on screen in all four languages — add them to ' +
        'src/shared/i18n/catalogs/en.ts and run tools/i18n-check.cjs, or fix the call site',
    ).toEqual([]);
  });

  /*
   * A scanner asserted to return `[]` against the real tree is indistinguishable
   * from one that returns `[]` because it read nothing, and this repo has banked
   * that exact false pass. The control is a fixture the scan has never seen: one
   * key that is genuinely undefined, and one that is genuinely defined — the very
   * key whose prefix produced the finding above, so the control also pins that
   * `modes` is real and `mode` is not.
   */
  describe('CONTROL: the scan fires on a planted key and stays quiet on a real one', () => {
    let dir = '';
    beforeAll(() => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-missing-'));
      fs.writeFileSync(
        path.join(dir, 'Planted.tsx'),
        [
          'export const Planted = () => (',
          '  <p>',
          "    {t('ankiWorkbench.tray.stale.modes')}",
          "    {t('zzz.planted.definitely.missing')}",
          '  </p>',
          ');',
        ].join('\n'),
        'utf8',
      );
    });
    afterAll(() => {
      if (dir) fs.rmSync(dir, { recursive: true, force: true });
    });

    it('reports exactly the undefined key, and not the defined one beside it', () => {
      const planted = scan({ dirs: [dir] });
      expect(planted).toHaveLength(1);
      expect(planted[0].missing).toEqual(['zzz.planted.definitely.missing']);
    });

    /*
     * `src/main` is a directory and `src/main.ts` is a file, so widening the scan
     * to reach the latter added a file-vs-directory branch. Passing a single file
     * as the whole scan is the only thing that exercises it: if the branch were
     * wrong the entry would silently contribute nothing, and a scan that reads
     * nothing returns the same `[]` as a clean one.
     */
    it('scans an entry that is a single FILE, not only a directory', () => {
      const fileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-missing-file-'));
      const single = path.join(fileDir, 'Single.tsx');
      try {
        fs.writeFileSync(single, "export const S = () => t('zzz.planted.single.file');\n", 'utf8');
        const found = scan({ dirs: [single] });
        expect(found).toHaveLength(1);
        expect(found[0].missing).toEqual(['zzz.planted.single.file']);
      } finally {
        fs.rmSync(fileDir, { recursive: true, force: true });
      }
    });

    /*
     * The tool skips dynamic keys deliberately, and the concatenation form is the
     * subtle one: in `t('lens.mode.' + item)` the prefix is itself a quoted
     * literal, so an unguarded match reports `lens.mode.` as a key rendered raw at
     * the user. It is not — only the built arms are. Pinned here because the
     * guard above would otherwise make that a hard failure across the app.
     */
    it('skips a key built by concatenation rather than reporting its prefix', () => {
      const skipDir = fs.mkdtempSync(path.join(os.tmpdir(), 'i18n-missing-dyn-'));
      try {
        fs.writeFileSync(
          path.join(skipDir, 'Dynamic.tsx'),
          "export const D = (i: string) => t('zzz.planted.prefix.' + i);\n",
          'utf8',
        );
        expect(scan({ dirs: [skipDir] })).toEqual([]);
      } finally {
        fs.rmSync(skipDir, { recursive: true, force: true });
      }
    });
  });
});
