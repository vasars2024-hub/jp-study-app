/**
 * Rubric category 4 — a grid track floor may never exceed the window it lives in.
 *
 * `repeat(auto-fill | auto-fit, minmax(30rem, 1fr))` reads like "at least 480 px, more if
 * there is room". It is not: the 480 px is a HARD minimum, so in a container narrower than
 * it the track keeps its 480 px and the row leaves the frame. In this shell there is not
 * even a scrollbar to reach it — `.fwin-body` is `overflow-y: auto; overflow-x: hidden` —
 * so the content is simply gone.
 *
 * Measured live, 2026-08-22, on the Liquid Dictionary at 食べる with 8 entries, at the
 * 260x170 the product itself allows (`DesktopShell.tsx` `MIN_W`/`MIN_H`): every
 * `.dict-entry` was 480 px wide in a 258 px body, 268 px of it unreachable. Identical in
 * standard presentation, so the Liquid sheet was not the cause — three of these floors had
 * been landed by this plan's own earlier category-4 slices, unscoped.
 *
 * `min(<n>rem, 100%)` clamps the floor to the container, which is what a floor was for.
 * Nothing changes where nothing was wrong: maximized 1264x765 re-measured at the same
 * 8.7% dead region, 55.0% canvas, clipped 0.
 *
 * This is a source assertion, and a source assertion alone is exactly what the rubric warns
 * about. Its job is only to stop the pattern coming back; the number that scores the
 * category is the live one in `L1_USE_OF_SPACE.md`.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const SHEETS = [
  'src/renderer/styles.css',
  'src/renderer/theme/liquid-window.css',
  'src/renderer/components/lexicon/lexiconExamples.css',
  'src/renderer/components/lexicon/lexiconWorkbench.css',
];

/** The narrowest content box the shell can produce: `MIN_W` 260 minus the body's padding. */
const NARROWEST_CONTENT_PX = 212;

describe('grid track floors fit the narrowest window the product allows', () => {
  for (const sheet of SHEETS) {
    it(`${sheet} clamps every rem track floor wider than the window minimum`, () => {
      const css = readFileSync(resolve(process.cwd(), sheet), 'utf8').replace(
        /\/\*[\s\S]*?\*\//g,
        '',
      );
      const offenders: string[] = [];
      // Only the bare-rem form. `minmax(min(30rem, 100%), …)` is the fixed shape and the
      // inner `min(` is what tells the two apart.
      const re = /minmax\(\s*([0-9.]+)rem\s*,/g;
      let m = re.exec(css);
      while (m) {
        const px = Number(m[1]) * 16;
        if (px > NARROWEST_CONTENT_PX) offenders.push(`${m[0]} = ${px}px`);
        m = re.exec(css);
      }
      expect(offenders, `bare rem floors wider than ${NARROWEST_CONTENT_PX}px`).toEqual([]);
    });
  }

  it('the four rules the 2026-08-22 measurement named are all clamped', () => {
    const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
    const styles = read('src/renderer/styles.css');
    expect(styles).toMatch(
      /\.dict-entries\s*\{[^}]*minmax\(min\(30rem,\s*100%\),\s*1fr\)/,
    );
    expect(styles).toMatch(
      /\.dict-ex-list\s*\{[^}]*minmax\(min\(30rem,\s*100%\),\s*1fr\)/,
    );
    expect(read('src/renderer/components/lexicon/lexiconExamples.css')).toMatch(
      /\.lexicon-examples-list\s*\{[^}]*minmax\(min\(30rem,\s*100%\),\s*1fr\)/,
    );
    expect(read('src/renderer/theme/liquid-window.css')).toMatch(
      /\.fwin\.fwin-liquid \.dict-view\s*\{[^}]*minmax\(min\(28rem,\s*100%\),\s*1fr\)/,
    );
  });

  it('the two nowrap control rows that left the frame at 260px now wrap', () => {
    // `form.dict-search` measured 324px and `.lexicon-lens-picker` 297px, both in a 258px
    // body: the Search button and the "Interlinear" lens were unreachable, not merely tight.
    expect(read('src/renderer/styles.css')).toMatch(
      /\.dict-search\s*\{[^}]*flex-wrap:\s*wrap/,
    );
    expect(read('src/renderer/components/lexicon/lexiconWorkbench.css')).toMatch(
      /\.lexicon-lens-picker\s*\{[^}]*flex-wrap:\s*wrap/,
    );
  });
});

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}
