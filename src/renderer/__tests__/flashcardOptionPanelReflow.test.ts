/**
 * Rubric category 4 (use of space), Flashcards — the deck-overview option panels.
 *
 * Two defects, both measured live on 2026-09-03 through `cat4-use-of-space.cjs` against the
 * running app, at the three sizes that harness drives:
 *
 *   - 260x170 (the product's own window minimum): `.fwin-body` reported scrollWidth 255 against
 *     clientWidth 248, and `.fwin-body` is `overflow-x: hidden` — 7px of panel with no scrollbar
 *     to reach it. Cause: a `fieldset`'s UA `min-inline-size` is `min-content`, so these panels
 *     refused to shrink below their widest label. `min-inline-size: 0` moved 255 -> 248 live.
 *   - 1264x773 (maximized): the largest empty rectangle on the surface was 536x480, **24.8 %** of
 *     the window, and it was these panels' unused right-hand side — one column of short
 *     label-plus-control rows stretched across 1,216px. After: **13.5 %** against a 15 bar.
 *     The default 820x580 improved too, 10.5 % -> 5.5 %, and the panel stack shortened
 *     3,186 -> 2,557px at maximized.
 *
 * The property pinned here is not "18rem" or "grid". It is that (a) the panel can shrink to any
 * width its window can reach, and (b) its track floor is small enough that a wide window is
 * actually divided, while `min(100%, ...)` keeps a narrow one at a single column that cannot
 * overflow. A rewrite that keeps the class names and restores a single stretched column fails
 * the column model below.
 *
 * TRAP, and it has already cost this repo two false results: the fix's own comment names
 * `min-inline-size` and `overflow-x: hidden` in prose, and a raw text search finds the comment
 * first. Every lookup here runs on a comment-stripped copy.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW = readFileSync(resolve(__dirname, '../components/flashcards/autoAudio.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** The declarations of the LAST rule whose selector list matches exactly, as property->value. */
function ruleOf(selector: string): Record<string, string> {
  const needle = `\n${selector} {`;
  const at = CSS.lastIndexOf(needle);
  expect(at, `${selector} is not declared`).toBeGreaterThan(-1);
  const open = at + needle.length;
  const close = CSS.indexOf('}', open);
  const out: Record<string, string> = {};
  for (const decl of CSS.slice(open, close).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

const BASE = ruleOf('.auto-audio-options,\n.auto-reading-options');
const REFLOW_SELECTOR = [
  '.flash-view-decks > .auto-audio-options',
  '.flash-view-decks > .auto-reading-options',
  '.flash-deck-prefs-body > .auto-audio-options',
  '.flash-deck-prefs-body > .auto-reading-options',
].join(',\n');
const REFLOW = ruleOf(REFLOW_SELECTOR);

/** `repeat(auto-fit, minmax(min(100%, <floor>), 1fr))` — the floor, in px. */
function trackFloorPx(): number {
  const cols = REFLOW['grid-template-columns'] ?? '';
  expect(cols, 'the panel declares no auto-fit track list').toMatch(/repeat\(\s*auto-fit\s*,/);
  // `min(100%, X)` is what makes the floor collapse inside a narrow container instead of
  // overflowing it; without it auto-fit still asks for the whole floor and the panel spills.
  const guarded = /minmax\(\s*min\(\s*100%\s*,\s*([0-9.]+)(rem|px)\s*\)\s*,\s*1fr\s*\)/.exec(cols);
  expect(guarded, `track floor is not guarded by min(100%, ...): ${cols}`).not.toBeNull();
  const [, n, unit] = guarded as RegExpExecArray;
  return unit === 'rem' ? Number(n) * 16 : Number(n);
}

/**
 * Used track count for `repeat(auto-fit, minmax(min(100%, F), 1fr))` in a container of
 * `availablePx`, with `gapPx` between tracks. `min(100%, F)` is the per-track floor, so a
 * container narrower than F resolves the floor to the container and yields exactly one track.
 */
function columns(availablePx: number, gapPx: number): number {
  const floor = Math.min(availablePx, trackFloorPx());
  return Math.max(1, Math.floor((availablePx + gapPx) / (floor + gapPx)));
}

describe('flashcards: the deck-overview option panels use the width they are given', () => {
  it('lets the panel shrink to any width its own window can reach', () => {
    // `DesktopShell.tsx` MIN_W is 260px; the body's client width there is 248 and `.flash-view`
    // spends 36 of it on padding. A fieldset that will not go below its min-content clips.
    expect(BASE['min-inline-size']).toBe('0');
  });

  it('divides a wide window and never overflows a narrow one', () => {
    const gap = 4; // --space-xs
    // The three widths the category-4 harness actually drives, as content width inside
    // `.flash-view` (window width, minus the frame, minus 36px of view padding).
    const compact = 212;
    const dflt = 748;
    const maximized = 1192;

    expect(columns(compact, gap)).toBe(1);
    expect(columns(dflt, gap)).toBeGreaterThan(1);
    // Two columns was measured and was NOT enough: 442x424 of the maximized window was still
    // one contiguous empty rectangle, 18.1 % against a 15 bar. The bar is what the floor is
    // chosen against, so the model asserts the count that cleared it.
    expect(columns(maximized, gap)).toBeGreaterThanOrEqual(4);
    // Gap-agnostic: the conclusion must not rest on one token's current value.
    expect(columns(maximized, 0)).toBeGreaterThanOrEqual(4);
    expect(columns(compact, 0)).toBe(1);
  });

  it('keeps whole-panel text on its own row rather than in a column', () => {
    // Lead copy, the aria-live status line and the disk row describe the panel, not one option.
    // Both hosts: the overview's own children, and the same panels once `flash.deckPreferences`
    // folded them behind a disclosure.
    for (const host of ['.flash-view-decks', '.flash-deck-prefs-body']) {
      for (const selector of [
        `${host} > .auto-audio-options > .muted`,
        `${host} > .auto-reading-options > .muted`,
        `${host} > .auto-audio-options > .auto-audio-options__report`,
        `${host} > .auto-reading-options > .auto-reading-options__report`,
        `${host} > .auto-audio-options > .auto-audio-options__disk`,
      ]) {
        expect(CSS, `${selector} does not span the panel`).toContain(selector);
      }
    }
    const span = CSS.slice(CSS.indexOf('.flash-view-decks > .auto-audio-options > .muted'));
    expect(span.slice(0, span.indexOf('}'))).toContain('grid-column: 1 / -1');
  });

  it('reaches the panels by direct child, so single-task modes stay one column', () => {
    // `.auto-reading-options` is also the shell of Learn, Write, Match and Test — a prompt, its
    // input and its verdict — and all four render INSIDE `.flash-view-decks`. A descendant
    // selector would split them into columns, which is a different surface's defect.
    const head = REFLOW_SELECTOR.split(',\n');
    for (const part of head) {
      expect(part.trim(), 'an unscoped selector would reflow Learn/Write/Match/Test too').toMatch(
        /^\.(flash-view-decks|flash-deck-prefs-body) > \.auto-(audio|reading)-options$/,
      );
    }
    expect(BASE['grid-template-columns']).toBeUndefined();
  });
});
