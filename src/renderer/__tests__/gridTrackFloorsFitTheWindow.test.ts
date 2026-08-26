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
    // The host list widened when the pop-out became a Liquid destination
    // (`popoutPresentation.ts`); the CLAMP is what this asserts, so match the
    // rule by its `.dict-view {` tail rather than pinning one host spelling.
    expect(read('src/renderer/theme/liquid-window.css')).toMatch(
      /\.fwin-liquid[^{}]*\.dict-view\s*\{[^}]*minmax\(min\(28rem,\s*100%\),\s*1fr\)/,
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
   * `.view-head`, 2026-08-25, and this one is thirteen views wide rather than one.
   *
   * Measured on Library at the 380px Blanc allows: the header is a nowrap flex row holding
   * `p.muted` (114px) and `.actions` (642px), `.actions` was `flex-shrink: 0`, so the row
   * floored at 726px min-content inside a 368px body and `.fwin-body`'s `overflow-x: hidden`
   * ate 358px of it — `clipped` 8, three of them buttons, `hiddenOverflowX` 1 at `726>368`.
   * After: 0 / 0, `bodySW` 368, and the largest dead region fell 22.4% -> 9.4% of the window.
   *
   * Both halves are load-bearing and the intermediate state proves it: with the header
   * wrapping but `.actions` still `flex-shrink: 0`, `.actions` moved onto its own line and
   * stayed 642px wide — `clipped` 8 -> 5 and `hiddenOverflowX` still 1 at `660>368`. A wrap
   * container only wraps when its own box is constrained.
   */
  it('the thirteen-view header and its action row both wrap at a 380px host', () => {
    const styles = strip(read('src/renderer/styles.css'));
    expect(styles).toMatch(/\.view-head\s*\{[^}]*flex-wrap:\s*wrap/);
    expect(styles).toMatch(/\.view-head\s*\{[^}]*min-width:\s*0/);
    expect(styles).toMatch(/^\.actions\s*\{[^}]*flex-wrap:\s*wrap/m);
    // The removal is the half that made the numbers move, so it is asserted as an absence.
    expect(/^\.actions\s*\{[^}]*flex-shrink:\s*0/m.test(styles)).toBe(false);
  });

  /**
   * The SAME category on the vertical axis, and this file's first: content below the frame
   * with no scroller, rather than content past the right edge with no scrollbar.
   *
   * `.reading-workspace-panel` was `overflow: hidden` with `> * { height: 100% }` — a bet
   * that every section scrolls itself. Measured 2026-08-25 through the category-4 harness:
   * five of the eight sections do not. Discover at the default 820x580 held `scrollHeight`
   * 740 in a `clientHeight` of 460, i.e. 280px painted below the frame, 41 boxes unreachable
   * (77 at 380x580, still 3 at 1100x700); the Library section was far worse at 2118 in 460.
   * The window's own `.fwin-body` is `overflow-y: auto` and never saw any of it, because the
   * panel clamps first and its `scrollHeight` never propagates.
   *
   * Negative control, live and required: with the fix in place all eight sections report 0
   * unreachable boxes; forcing `overflow-y: hidden` back on inline, on the Library section,
   * returns **193**; removing the inline property returns to 0.
   */
  it('the reading workspace panel can reach the sections that do not scroll themselves', () => {
    const css = strip(read('src/renderer/views/readingWorkspace.css'));
    const rule = /\.reading-workspace-panel\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule, '.reading-workspace-panel rule').not.toBe('');
    expect(rule).toMatch(/overflow-y:\s*auto/);
    // The shorthand is what shipped the defect: it sets BOTH axes, so a later `overflow:
    // hidden` here silently re-clamps the y axis and this latch must see that.
    expect(/overflow:\s*hidden/.test(rule)).toBe(false);
    // `> * { height: 100% }` is the other half of the mechanism and stays — it is what makes
    // the self-scrolling sections fill the frame. Asserted so its removal is a deliberate act.
    expect(css).toMatch(/\.reading-workspace-panel\s*>\s*\*\s*\{[^}]*height:\s*100%/);
  });

  it('the novels workbench asks its host for the width, not the OS viewport', () => {
    // The same family as the track floors above, arriving by a different route: the three
    // tracks are `220px minmax(360px, 1fr) 300px` with two 10px gaps, a hard 900px floor,
    // and the narrow layout that rescues it was written as `@media (max-width: 980px)`.
    // Inside a floating window that media query can never fire — it reads the OS viewport
    // (1264px) while the panel hosting the workbench is 782px. Measured live on the Novels
    // window: `main.reading-workspace-panel` scrollWidth 900 against clientWidth 782, and it
    // is `overflow-x: hidden`, so 118px of the inspector was unreachable.
    const css = strip(read('src/renderer/styles.css'));

    const wrapper = /\.jiten-novels\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(wrapper, '.jiten-novels rule').not.toBe('');
    // An element cannot answer a `@container` condition against itself, so the container has
    // to be the wrapper. If this moves onto `.jiten-workbench` the query silently stops
    // matching and the clip comes back looking like nothing changed.
    expect(wrapper).toMatch(/container-type:\s*(inline-size|size)/);

    const container = /@container[^{]*\(max-width:\s*980px\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? '';
    expect(container, 'the @container narrow layout').not.toBe('');
    expect(container).toMatch(/\.jiten-workbench\s*\{[^}]*grid-template-columns:\s*1fr/);
    // Stacking alone is not the fix and shipping it alone made the surface worse: with
    // `flex: 1` the grid stayed clamped to the window, `.jiten-table-wrap`'s own 360px
    // min-height took most of it, and the two asides were left 26px each — the inspector
    // showed 24px of 863px of content. Rubric category 1 went 1 stolen pointer region to 17.
    expect(container).toMatch(/\.jiten-workbench\s*\{[^}]*flex:\s*0\s+0\s+auto/);
    // …and the asides must give up their own scrollers, or each is a nested scroll region
    // inside a page that is already scrolling.
    expect(container).toMatch(/\.jiten-filters\s*\{[^}]*overflow:\s*visible/);
    expect(container).toMatch(/\.jiten-inspector\s*\{[^}]*overflow:\s*visible/);

    // The `@media` twin stays. Blanc hosts the same workbench outside `.jiten-novels`
    // (`.blanc-jiten-workbench`) in a full-page shell, where the viewport IS the width —
    // converting rather than duplicating would silently drop Blanc's narrow layout.
    expect(css).toMatch(/@media\s*\(max-width:\s*980px\)\s*\{[^@]*\.jiten-workbench\s*\{[^}]*grid-template-columns:\s*1fr/);
  });

  it('the manga OCR overlay sizes its type in the page it is drawn on, not in image pixels', () => {
    const css = strip(read('src/renderer/styles.css'));
    // Half one: the layer must be a query container, or every `cqw` below resolves against
    // the viewport and the type detaches from the art in the other direction.
    const layer = /\.manga-ocr-layer\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(layer, '.manga-ocr-layer rule').not.toBe('');
    expect(layer).toMatch(/container-type:\s*(inline-size|size)/);

    // Half two: the emitted font size is a `cqw` fraction of `img_width`, never a raw px.
    // Both call sites — the transparent Japanese alignment layer and the painted
    // translation — read the same `fontSize`, so one assertion covers both.
    const tsx = strip(read('src/renderer/components/MangaOcrOverlay.tsx'));
    expect(tsx).toMatch(/const fontCqw = \(fontPx \/ \(page\.img_width \|\| 1\)\) \* 100;/);
    expect(tsx).toMatch(/const fontSize = `\$\{fontCqw\.toFixed\(4\)\}cqw`;/);
    // The defect itself: a px font against a %-sized box. Measured 2026-08-25 at a 0.214
    // render scale, four of five bubbles lost 198/20/224/544 px of text behind
    // `overflow: hidden`. If this comes back, it comes back exactly like this.
    expect(/fontSize: `\$\{fontPx\}px`/.test(tsx)).toBe(false);
  });

  it('the painted manga translation can be reached when it outgrows its bubble', () => {
    const css = strip(read('src/renderer/styles.css'));
    const rule = /\.manga-ocr-block\.translated \.manga-ocr-text\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(rule, '.manga-ocr-block.translated .manga-ocr-text rule').not.toBe('');
    // `.manga-ocr-text` is `overflow: hidden` — correct for the transparent alignment layer,
    // wrong for text meant to be read. A translation is routinely longer than the line it
    // replaces: after the `cqw` fix one of five measured blocks still ran 32 px in a 24 px box.
    expect(rule).toMatch(/overflow-y:\s*auto/);
    expect(/overflow:\s*hidden/.test(rule)).toBe(false);
    // And the base rule keeps hiding the x axis, so a long word cannot produce a sideways
    // scrollbar inside a speech bubble.
    const base = /\.manga-ocr-text\s*\{([^}]*)\}/.exec(css)?.[1] ?? '';
    expect(base).toMatch(/overflow:\s*hidden/);
  });

  it('a paged reader that claims its content is elsewhere publishes the numbers that prove it', () => {
    const tsx = strip(read('src/renderer/views/NovelReader.tsx'));
    // The claim. `.novel-scroller` is `overflow: hidden` on both axes over a multi-page
    // buffer, so its off-screen pages are indistinguishable from lost content by CSS alone.
    expect(tsx).toMatch(/data-paged=\{paged \? 'true' : undefined\}/);
    // The affordance, on BOTH directions — Prev alone leaves the forward buffer unreachable
    // and would still satisfy a one-sided check.
    expect(tsx).toMatch(/data-paged-control="prev"/);
    expect(tsx).toMatch(/data-paged-control="next"/);
    // The arithmetic. `(pages - 1) * step + clientWidth >= scrollWidth` is what makes the
    // claim checkable rather than a free pass; both numbers have to be published for the
    // category-4 probe to be able to test it, and it scores the surface as loss if they are
    // absent, wrong, or the controls are gone. Both halves negative-controlled live
    // 2026-08-25: each falsification took clipped 0 -> 66 and hiddenOverflowX 0 -> 1.
    expect(tsx).toMatch(/el\.setAttribute\('data-paged-pages', String\(pages\)\);/);
    expect(tsx).toMatch(/el\.setAttribute\('data-paged-step', String\(Math\.round\(step\)\)\);/);

    const probe = strip(read('src/.coordination/liquid-workplace/probes/l1-use-of-space.js'));
    expect(probe).toMatch(/\(pages - 1\) \* step \+ n\.clientWidth >= n\.scrollWidth - 2/);
    expect(probe).toMatch(/if \(pagerControls\(win\) < 1\) return false;/);
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

  /**
   * The px twin of the rem sweep at the top of this file, and it is NOT the same check with a
   * different unit — the scope has to be narrower, for a reason worth writing down once.
   *
   * A bare px floor appears in two shapes. In an EXPLICIT template — `minmax(320px, 1fr)
   * minmax(0, 1fr)` — the floor names one of a fixed number of columns and clamping it with
   * `min()` is not the fix; that shape wants `minmax(0, …)` or a narrow-layout rule, decided
   * per surface. Counted 2026-08-26 against HEAD's own blobs rather than the shared tree, which
   * carries other tracks' edits: 69 bare px floors over 212px across the 67 tracked sheets under
   * `src/renderer`, and only 17 of them are the `repeat()` shape. Sweeping all 69 would have
   * demanded 52 unrelated layout decisions in one slice.
   *
   * In a `repeat(auto-fill | auto-fit, …)` the floor does something the rem sweep's own header
   * describes and something extra: it is a hard minimum that leaves the frame in a narrower
   * container, AND it is what decides the column COUNT, so a floor well under the card's
   * comfortable width spends extra width on more, thinner columns instead of on the content.
   * Both halves measured live on the Reading Finder through `probes/cat4-use-of-space.cjs`:
   * at the 260x170 compact leg the 280px `.res-grid` track read `280>202` through
   * `.reading-workspace-panel`'s `overflow-x: hidden` and clipped 40 boxes with no scrollbar
   * to reach them; at maximized the same rule took four 296px columns in a 1226px pane — the
   * card is NARROWER at maximized than the 380px it gets at the shipped 820x580 — leaving a
   * 1262x164 dead band under the last row, 20% of the viewport against a bar of 15, with the
   * dominant canvas FALLING 42.9 -> 35.7%.
   *
   * After: clipped 40 -> 0, hiddenOverflowX 1 -> 0, dead 20 -> 7.2%, canvas 35.7 -> 50.6%,
   * verdict FAIL -> PASS 10/10 at all three sizes with the injected clip firing 0 -> 1 -> 0.
   */
  it('every auto-fill card grid clamps a track floor wider than the window minimum', () => {
    const offenders: string[] = [];
    for (const sheet of SHEETS) {
      const css = strip(read(sheet));
      // The `min(` that tells a clamped floor from a bare one sits INSIDE `minmax(`, so the
      // two forms differ by their fourth token, not by anything the rem sweep's regex sees.
      const re = /repeat\(\s*auto-fi(?:ll|t)\s*,\s*minmax\(\s*(\d+(?:\.\d+)?)px\s*,/g;
      let m = re.exec(css);
      while (m) {
        if (Number(m[1]) > NARROWEST_CONTENT_PX) offenders.push(`${sheet} ${m[0]}`);
        m = re.exec(css);
      }
    }
    expect(
      offenders,
      `bare px auto-fill floors wider than ${NARROWEST_CONTENT_PX}px`,
    ).toEqual([]);
  });

  it('the shared card grid keeps a floor the card is actually comfortable at', () => {
    const styles = strip(read('src/renderer/styles.css'));
    const rule = /\.res-grid\s*\{([^}]*)\}/.exec(styles)?.[1] ?? '';
    expect(rule, '.res-grid rule').not.toBe('');
    // Both halves, because each one alone leaves half the defect. The clamp is what stops the
    // 40 clipped boxes at a 202px pane; the 320px floor is what stops the fourth thin column
    // at a 1226px one. A `min(280px, 100%)` would pass a clamp-only check and still score the
    // maximized leg FAIL on dead region and on the canvas share.
    expect(rule).toMatch(/repeat\(auto-fill,\s*minmax\(min\(320px,\s*100%\),\s*1fr\)\)/);
  });
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
