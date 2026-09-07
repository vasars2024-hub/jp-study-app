/**
 * D237 — a ratchet baseline is only a gate while its entries still describe the
 * tree. Two ways an entry stops describing it, both silent:
 *
 *   1. **The path is gone.** The file was renamed, split or deleted. The entry
 *      then guards nothing, and the count it carries inflates every "how much
 *      is left" figure anyone reads off the baseline.
 *   2. **The ceiling outgrew the file.** `i18n-hardcoded-baseline.json` allowed
 *      `settings/pages/ScraperPage.tsx` **184** untranslated strings. That page
 *      was split in `5c06446e` and is now **108 lines long** — it cannot hold
 *      184 strings, so the entry had stopped being a ceiling and become a
 *      blanket exemption. The whole page could have gone back to English and
 *      every gate would have stayed green.
 *
 * Neither is caught by the tools themselves: each one asks "did this file grow
 * past its number", and a stale number always answers no.
 *
 * Four baselines, one check, per RULE 1 — the shape is identical across them,
 * so this is parameterised rather than four copies. `i18n-orphan-key-baseline`
 * is keyed by NAMESPACE rather than path and is excluded by construction, not
 * by omission.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const REPO = resolve(__dirname, '../../..');

/**
 * `prefix` is the difference between the tools: `i18n-partial-check` stores
 * repo-relative-to-`src/` paths, the other three store repo-relative ones. A
 * test that guessed wrong would report every entry missing — which is exactly
 * what a first pass at this did, and it read as a catastrophic finding.
 */
const BASELINES: Array<{ file: string; prefix: string }> = [
  { file: 'tools/i18n-hardcoded-baseline.json', prefix: '' },
  { file: 'tools/i18n-partial-baseline.json', prefix: 'src/' },
  { file: 'tools/i18n-shadow-baseline.json', prefix: 'src/' },
  { file: 'tools/i18n-locale-arg-baseline.json', prefix: '' },
];

function entriesOf(file: string): Array<[string, number]> {
  const raw = JSON.parse(readFileSync(resolve(REPO, file), 'utf8')) as Record<string, unknown>;
  return Object.entries(raw).filter((e): e is [string, number] => typeof e[1] === 'number');
}

describe.each(BASELINES)('$file describes the tree it gates', ({ file, prefix }) => {
  it('is a non-empty map of path to count', () => {
    const entries = entriesOf(file);
    expect(entries.length, `${file} carries no path entries`).toBeGreaterThan(0);
    for (const [path, count] of entries) {
      expect(count, `${file}: ${path} has a negative count`).toBeGreaterThanOrEqual(0);
    }
  });

  it('names no file that has been renamed, split or deleted', () => {
    const gone = entriesOf(file)
      .map(([path]) => path)
      .filter((path) => !existsSync(resolve(REPO, prefix + path)));
    expect(gone, `${file} exempts paths that no longer exist`).toEqual([]);
  });

  /**
   * The ScraperPage shape. A count above the file's line count cannot be a real
   * measurement of that file — one line cannot carry two user-facing literals
   * and also be counted twice — so it is a ceiling left behind by a shrink.
   * Deliberately generous: this is a staleness alarm, not a density rule.
   */
  it('carries no ceiling larger than the file it gates', () => {
    const stale: string[] = [];
    for (const [path, count] of entriesOf(file)) {
      const full = resolve(REPO, prefix + path);
      if (!existsSync(full)) continue;
      const lines = readFileSync(full, 'utf8').split('\n').length;
      if (count > lines) stale.push(`${path}: ${count} parked in ${lines} lines`);
    }
    expect(stale, `${file} has entries the file can no longer contain — re-run its --update-baseline`).toEqual(
      [],
    );
  });
});

describe('the orphan-key baseline keeps its own shape', () => {
  /**
   * Keyed by namespace, not by path, so the checks above cannot apply. What it
   * CAN go stale in is its `total` drifting from the sum of its namespaces —
   * this repo has a recorded case of exactly that in a merged JSON, where the
   * rows unioned correctly while the computed block silently did not.
   */
  it('agrees with itself about the total', () => {
    const raw = JSON.parse(
      readFileSync(resolve(REPO, 'tools/i18n-orphan-key-baseline.json'), 'utf8'),
    ) as { total: number; namespaces: Record<string, number> };
    const summed = Object.values(raw.namespaces).reduce((a, b) => a + b, 0);
    expect(raw.total, 'the recorded total no longer matches the namespaces under it').toBe(summed);
    expect(Object.keys(raw.namespaces).length).toBeGreaterThan(0);
  });
});
