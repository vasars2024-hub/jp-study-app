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

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every stylesheet under `src/renderer`, not a hand-listed four. The list was hand-written on
 * 2026-08-22 from the sheets that measurement happened to name, and on 2026-08-24 the same
 * pattern was measured again in `components/lexicon/conjugationTable.css` — a sheet nobody had
 * added, so the guard passed while the defect shipped. A guard that only covers the files a
 * previous defect touched cannot catch the next one.
 */
function allSheets(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(resolve(process.cwd(), dir))) {
    const rel = `${dir}/${name}`;
    if (statSync(resolve(process.cwd(), rel)).isDirectory()) allSheets(rel, out);
    else if (name.endsWith('.css')) out.push(rel);
  }
  return out;
}

const SHEETS = allSheets('src/renderer');

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

  it('the conjugation list the 2026-08-24 re-drive named is clamped', () => {
    // 26 clipped boxes at compact 260x170, `div.fwin-body 273>248` — the same defect class,
    // in the one lexicon sheet the SHEETS list did not cover.
    expect(read('src/renderer/components/lexicon/conjugationTable.css')).toMatch(
      /\.lexicon-conjugation-list\s*\{[^}]*minmax\(min\(15rem,\s*100%\),\s*1fr\)/,
    );
  });

  it('the sweep covers more sheets than the list it replaced', () => {
    // The hand-written list had four entries. If this ever drops back to four, the walk broke.
    expect(SHEETS.length).toBeGreaterThan(4);
    expect(SHEETS).toContain('src/renderer/components/lexicon/conjugationTable.css');
  });

  /**
   * The same defect on the other axis, and the one the 2026-08-25 NovelReader drive found.
   *
   * A grid with `grid-template-rows` and no `grid-template-columns` still HAS a column: one
   * implicit `auto` track. An `auto` track's base size is its items' min-content and it only
   * ever grows to absorb free space — it never shrinks below that floor. So a full-frame
   * shell whose widest row is a nowrap control strip is pinned to that strip's min-content
   * at every window size, and its own `overflow: hidden` cuts the remainder off with nothing
   * to scroll. Identical consequence to a `minmax(30rem, …)` floor; different mechanism, so
   * the sweep above cannot see it.
   *
   * Measured live on `.reader` at the 380px Blanc allows (`BLANC_MIN_W`, main.ts): the column
   * held 860.016px, `.reader-bar` with it, and fourteen of the eighteen bar controls sat
   * entirely past the right edge — translation, the lens, reader settings, all six annotation
   * swatches, Collect, both Ask-the-Agent buttons and the flashcard collection.
   */
  it('every full-frame grid shell clamps its column axis, not only its rows', () => {
    const offenders: string[] = [];
    for (const sheet of SHEETS) {
      const css = strip(read(sheet));
      const rules = /([^{}]+)\{([^{}]*)\}/g;
      let rule = rules.exec(css);
      while (rule) {
        const selector = rule[1].trim().replace(/\s+/g, ' ');
        const body = rule[2];
        const fullFrame =
          /display:\s*grid/.test(body) &&
          /overflow(-x)?:\s*hidden/.test(body) &&
          /grid-template-rows/.test(body) &&
          /height:\s*(100%|100vh)|inset:\s*0|position:\s*absolute/.test(body);
        // Presence is not the property. `grid-template-columns: auto` is a declaration and
        // floors at min-content exactly like the implicit track it replaced, which a
        // presence-only check passed — caught by mutating this rule to `auto` and watching
        // only the named-rule test below go red. Every track has to be able to reach zero:
        // `minmax(0, …)`, a `min(…)` clamp, or a percentage of the container.
        const columns = /grid-template-columns:([^;}]*)/.exec(body)?.[1] ?? '';
        const clamped = /minmax\(\s*0/.test(columns) || /min\(/.test(columns) || /%/.test(columns);
        if (fullFrame && !clamped) {
          offenders.push(`${sheet} ${selector} -> ${columns.trim() || '(no declaration)'}`);
        }
        rule = rules.exec(css);
      }
    }
    expect(offenders, 'full-frame grid shells with an unclamped implicit column').toEqual([]);
  });

  it('the reader shell and its two control strips survive a 380px host', () => {
    const styles = strip(read('src/renderer/styles.css'));
    // The cap on the track...
    expect(styles).toMatch(/\.reader\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)/);
    // ...and the four automatic minimums that would otherwise overflow the capped track
    // anyway. `min-width: 0` alone leaves the strips clipped rather than overflowing, so the
    // wrap is half of the fix and not a nicety.
    expect(styles).toMatch(/\.reader-bar\s*\{[^}]*min-width:\s*0[^}]*flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.reader-controls\s*\{[^}]*min-width:\s*0[^}]*flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.reader-footer\s*\{[^}]*min-width:\s*0[^}]*flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.reader-stage\s*\{[^}]*min-width:\s*0/);
  });

  it('the nowrap control rows that left the frame at their host minimum now wrap', () => {
    // `form.dict-search` measured 324px and `.lexicon-lens-picker` 297px, both in a 258px
    // body: the Search button and the "Interlinear" lens were unreachable, not merely tight.
    expect(read('src/renderer/styles.css')).toMatch(
      /\.dict-search\s*\{[^}]*flex-wrap:\s*wrap/,
    );
    expect(read('src/renderer/components/lexicon/lexiconWorkbench.css')).toMatch(
      /\.lexicon-lens-picker\s*\{[^}]*flex-wrap:\s*wrap/,
    );
    // `.immersion-toolbar`, 2026-08-25: `scrollWidth` 588 in a `clientWidth` of 342 at the
    // 380px Blanc allows — 246px of overflow, `overflow-x: visible`, and SEVEN of fourteen
    // children entirely past the right edge including `.immersion-sites-toggle`. The url
    // form's floor is half the fix and not a nicety: at `min-width: 0` it collapses to width
    // 0, the row still does not fit, and the shortfall moves onto the controls after it.
    const styles = strip(read('src/renderer/styles.css'));
    expect(styles).toMatch(/\.immersion-toolbar\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.immersion-url-form\s*\{[^}]*min-width:\s*(?!0[^a-z])/);
  });

  /**
   * Why this category's sweep is LIVE and not source-only, stated once so the next worker
   * does not spend a turn rediscovering it.
   *
   * The grid-track and column-axis checks above are real sweeps because a `minmax(30rem, …)`
   * floor is decidable from the stylesheet alone. A nowrap control row is not: whether it
   * overflows depends on how many children the TSX renders and how wide they are, and a
   * source predicate broad enough to catch `.immersion-toolbar` (`display: flex`,
   * `flex-shrink: 0`, no `flex-wrap`, no `overflow-x: auto`) flags 29 rules across
   * `src/renderer`, most of them two-button action pairs that must never wrap. Measured
   * 2026-08-25. So the instrument that SCORES this half of category 4 is the live one —
   * `l1-use-of-space.js`'s `clipped` and `hiddenOverflowX`, already parameterised by
   * surface — and the assertions here are named latches that stop a fixed rule regressing.
   */
});

function read(p: string): string {
  return readFileSync(resolve(process.cwd(), p), 'utf8');
}

/**
 * Comments out, newlines kept so a reported line number still means something. Both new
 * assertions need this: the `.reader` rule's own comment names `grid-template-columns` while
 * explaining why it is there, so a raw match would pass on the prose alone.
 */
function strip(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}
