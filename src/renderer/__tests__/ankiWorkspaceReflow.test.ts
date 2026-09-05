/**
 * The Anki workspace reflows instead of deleting its own editing column.
 *
 * Measured 2026-09-05 by the rubric category 4 harness against the live Anki window
 * (AnkiConnect answering, 84 decks / 35 note types), which returned FAIL on three bars:
 *
 *   compact 260x170  five `section.collapse-section` at `182>0`, `83>0`, `92>0`, `74>0`,
 *                    `64>0` — a client width of ZERO for the deck, note-type, field-mapping,
 *                    note-CSS, manual-card and deck-workbench controls;
 *                    `div.fwin-body 362>248`, i.e. 114 px outside a frame whose
 *                    `overflow-x` is `hidden`, so nothing could scroll to it;
 *                    six clipped nodes, the whole `.card-preview-*` cluster among them.
 *   default 820x580  tracks resolved to `328px 420px` — the read-only preview wider than
 *                    the entire editing column.
 *
 * Cause: `minmax(320px, 420px)` is unshrinkable, so the grid floors at 320 + 24 = 344 while
 * the track beside it is `minmax(0, 1fr)` and is free to reach 0. The repair is the same
 * container-query idiom `.visual-novel-workspace` already uses two screens up in this file.
 *
 * jsdom performs no layout, so this reads the RULE from the stylesheet rather than a pixel —
 * exactly as `libraryShelfLayout.test.ts` reads its geometry contract. Comments are stripped
 * first: the rule above is documented in prose that names every token this test matches on,
 * and a raw-text search would score that prose as the declaration.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const CSS_PATH = resolve(__dirname, '../styles.css');
const RAW = readFileSync(CSS_PATH, 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declaration block of the first rule whose selector list is exactly `selector`. */
function ruleBody(css: string, selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp(`(?:^|[};])\\s*${escaped}\\s*\\{([^{}]*)\\}`, 'm').exec(css);
  return m ? m[1] : null;
}

describe('anki workspace reflow', () => {
  it('makes .anki-view a size container, because a floating window is not the viewport', () => {
    const body = ruleBody(CSS, '.anki-view');
    expect(body).not.toBeNull();
    // A `@media` query here would answer the DESK width, not this window's, so the workspace
    // would reflow on a resize of something else entirely.
    expect(body).toMatch(/container-type:\s*inline-size/);
    expect(body).toMatch(/container-name:\s*ankiview/);
  });

  it('collapses the workspace to one column when the split has stopped paying', () => {
    // The query must name `ankiview`; an unnamed `@container` would resolve to the nearest
    // container ancestor, which elsewhere in this sheet is a different surface's.
    const query = /@container\s+ankiview\s*\(max-width:\s*(\d+)px\)\s*\{\s*\.anki-workspace\s*\{([^{}]*)\}/.exec(
      CSS,
    );
    expect(query).not.toBeNull();
    expect(query![2]).toMatch(/grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s*;/);

    // 866 is the derived floor: `.anki-selects label` min-width 180 x2 + its 14 gap + the
    // 48 px `.anki-card` pads = 422 for the main column, + 24 gap + the preview's 420 max.
    // Anything below that and the two-column split cannot seat the main column's own primary
    // control row, which is the whole reason the split exists.
    expect(Number(query![1])).toBeGreaterThanOrEqual(866);
  });

  it('places the query AFTER the base rule, so it is not lost on source order', () => {
    // Equal specificity: `@container` adds none. A query written above the rule it overrides
    // matches, runs, and moves nothing — a failure this repo has already paid for twice.
    const base = CSS.indexOf('.anki-workspace {');
    const query = CSS.indexOf('@container ankiview');
    expect(base).toBeGreaterThan(-1);
    expect(query).toBeGreaterThan(base);
  });

  it('keeps a floor on the preview only where the container can honour it', () => {
    // The wide layout still guarantees the preview a readable width — the fix is a reflow,
    // not a deletion of the preview's minimum.
    const body = ruleBody(CSS, '.anki-workspace');
    expect(body).not.toBeNull();
    expect(body).toMatch(/grid-template-columns:\s*minmax\(\s*0\s*,\s*1fr\s*\)\s+minmax\(\s*320px\s*,\s*420px\s*\)/);
  });

  it('reads the rule, not the prose that documents it', () => {
    // The negative control for this file's own instrument. The comment above the query names
    // `grid-template-columns`, `minmax(320px, 420px)` and `@container ankiview` in prose; if
    // comment-stripping ever regressed, every assertion here would pass off that prose.
    expect(RAW).toMatch(/Cause: `minmax\(320px, 420px\)` cannot shrink/);
    expect(CSS).not.toMatch(/Cause: `minmax/);
  });
});
