/**
 * Rubric category 4 — the two example-sentence lists reflow into the width a
 * maximized Dictionary gives them, and do not change at the width it already had.
 *
 * The measurement that drove this (`probes/l1-use-of-space.js` + a text-extent walk,
 * Liquid Dictionary maximized to 1264x765 on 食べる with every panel loaded):
 * `.lexicon-examples-list` was 1186 px wide with its longest text run at 269 px —
 * **951 px of dead width over 1082 px of height**; `.dict-ex-list` was 1188 px wide
 * with its run at 408 px — **813 px over 528 px**.
 *
 * The floor is the load-bearing part and is what this file pins. `auto-fill` with a
 * 30 rem (480 px) minimum needs 2x480 + 8 = 968 px before a second column can form.
 * The default 820 px window offers 772 px of content width, so it stays single-column
 * and the sizes that already measured clean are untouched; maximized offers 1186 px,
 * so it becomes two. Lowering the floor would silently start splitting sentences in
 * the default window, which is the regression this test exists to catch — not the
 * presence of the rule.
 *
 * Media queries are deliberately not used: these are floating windows on a fake
 * desktop, so viewport `@media (max-width:)` never fires for them (css-measure §5).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHEETS = {
  '.lexicon-examples-list': resolve(__dirname, '..', 'components', 'lexicon', 'lexiconExamples.css'),
  '.dict-ex-list': resolve(__dirname, '..', 'styles.css'),
  // The result list itself: eight entries were eight full-width rows, and the empty
  // right-hand column they left was the largest single contributor to the maximized
  // dead region (21.3% of the viewport -> 18.3% once they pair up).
  '.dict-entries': resolve(__dirname, '..', 'styles.css'),
} as const;

/** The declaration block for a top-level rule whose selector is exactly `sel`. */
function blockFor(css: string, sel: string): string {
  const escaped = sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|\\})\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm').exec(css);
  if (!m) throw new Error(`no rule with selector exactly "${sel}"`);
  return m[1];
}

/** Content width a window of `winW` offers these lists, from the live measurements above. */
const CONTENT_WIDTH = { default820: 772, maximized1264: 1186 };

/** The gap a second column has to clear, read from the rule rather than assumed. */
function columnGapOf(block: string): number {
  const m = /(?:^|;|\{)\s*(?:column-)?gap:\s*([\d.]+)px/.exec(block);
  if (!m) throw new Error('no gap declared — the two-column arithmetic would be a guess');
  return Number(m[1]);
}

describe('wide windows get columns, default windows do not', () => {
  for (const [sel, path] of Object.entries(SHEETS)) {
    const block = blockFor(readFileSync(path, 'utf8'), sel);

    it(`${sel} lays out on an auto-filling column grid`, () => {
      expect(block).toMatch(/display:\s*grid/);
      expect(block).toMatch(/grid-template-columns:\s*repeat\(auto-fill,\s*minmax\(/);
      // A column grid whose items stretch would make every row as tall as its
      // tallest sentence, trading dead width for dead height.
      expect(block).toMatch(/align-items:\s*start/);
    });

    it(`${sel} keeps one column at the default window width and gains one when maximized`, () => {
      // `min(<n>rem, 100%)` is the clamped form — a bare rem floor is a HARD minimum and
      // overflowed the 260px window the product allows (2026-08-22, `L1_USE_OF_SPACE.md`).
      // The arithmetic below is unchanged: at 772px and 1186px of content the `100%` term
      // never wins, so the floor that decides the column count is still the rem one.
      const m = /minmax\(\s*(?:min\(\s*)?([\d.]+)rem\s*[,)]/.exec(block);
      if (!m) throw new Error(`${sel} should declare a rem floor`);
      const floorPx = Number(m[1]) * 16;
      const twoColumns = 2 * floorPx + columnGapOf(block);
      expect(twoColumns, 'a second column must not fit at the default width').toBeGreaterThan(
        CONTENT_WIDTH.default820,
      );
      expect(twoColumns, 'a second column must fit when maximized').toBeLessThanOrEqual(
        CONTENT_WIDTH.maximized1264,
      );
    });
  }
});
