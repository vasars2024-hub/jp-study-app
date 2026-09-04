/**
 * Rubric category 1, Files — the three rows that kept `targets32` FAILING, pinned.
 *
 * Measured live 2026-09-04 through the debug bridge (pid 13316, `@.fwin:has(.fa-shell)`,
 * 820x580). `cat1-accessibility.cjs` read `belowFloorByHit 3` and the three rows were:
 *
 *   button.fa-cell.fa-cell-size   rect 30.92x32   pointer 31.92x33.01
 *   div.fa-row                    rect 364x32     pointer 52.05x31.05   (n = 1, the FIRST row)
 *   input.fa-bulk-check           rect 32x32      pointer 32.99x30.55   (n = 1, that row's)
 *
 * Three separate causes, one per rule guarded below, and none of them is "the walk is too
 * strict" — that hypothesis was raised by two previous entries and is disproved by the fact
 * that the same walk now reads all 103 controls at or over the floor with the plants still
 * caught 2 of 2.
 *
 * 1. `minmax(0, Nfr)` lets a column collapse to nothing, and every header cell is a SORT
 *    BUTTON. `fa-cell-size` was the narrowest track at 30.92px — its own RECT under the floor.
 * 2. `border-bottom` inside `box-sizing: border-box` left a 31px CONTENT box, so
 *    `align-items: center` put the 32px `.fa-bulk-check` on a half-pixel: box [273.5, 305.5]
 *    inside a row at [274, 306]. An inset shadow paints the same rule and costs no height.
 * 3. Chromium's hit rect for a box starts ~1px ABOVE the box. Reproduced on a throwaway stack
 *    of four plain 32px divs on `document.body` — every one `up 16.96 / down 15.01` — so it is
 *    the engine, not this stylesheet. Rows absorb it (take one from above, lose one below,
 *    read 32.02); the first row has a later-painted `z-index: 1` sticky header above it
 *    instead, which keeps the overlap. 1px of separation gives it back.
 *
 * After all three: `belowFloorByHit 0`, `stolenCount 0`, `occludedCount 0`, `stable: true`,
 * verdict PASS 10/10.
 *
 * TRAP, paid for twice in this repo already: the comments in the stylesheet name
 * `border-bottom` and `minmax(0,` in PROSE, and a raw text search finds the comment first.
 * Every lookup here runs on a comment-stripped copy. (`css-comment-fails-css-test`.)
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW = readFileSync(resolve(__dirname, '../components/filesapp/filesApp.css'), 'utf8');
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

describe('files list — the 32px pointer floor', () => {
  it('floors every flexible column at the hit target, so no sort button can collapse', () => {
    const row = ruleOf('.fa-row');
    const tracks = row['grid-template-columns'];
    expect(tracks, '.fa-row declares no grid-template-columns').toBeTruthy();
    // The regression this catches is literally `minmax(0, 0.8fr)` coming back on the size
    // column — 30.92px wide live, the only row of cat1 whose own rect was under the floor.
    expect(tracks).not.toMatch(/minmax\(\s*0/);
    const flexible = tracks.match(/minmax\(/g) ?? [];
    expect(flexible.length, 'five flexible columns are declared').toBe(5);
    expect(tracks.match(/minmax\(\s*var\(--lq-hit-target\)/g)?.length).toBe(5);
  });

  it('separates rows with an inset shadow, so a 32px control in one lands on a whole pixel', () => {
    const row = ruleOf('.fa-row');
    // A border here is inside `box-sizing: border-box` and takes the content box to 31px.
    expect(row['border-bottom'], '.fa-row must not re-declare border-bottom').toBeUndefined();
    expect(row['box-shadow']).toMatch(/^inset\s+0\s+-1px\s+0\s+var\(--lq-work-border\)$/);
    expect(row.height).toBe('32px');
  });

  it('keeps one pixel between the sticky header and the first row', () => {
    const head = ruleOf('.fa-head');
    expect(head['margin-bottom']).toBe('1px');
    // The margin only matters because the header paints ABOVE the list; if that ever stops
    // being true the pixel is no longer load-bearing and this test should be revisited, not
    // silently kept.
    expect(head['z-index']).toBe('1');
    expect(head.position).toBe('sticky');
  });

  it('leaves the compact view its own three-column template', () => {
    const compact = ruleOf(".fa-list[data-view='compact'] .fa-row");
    expect(compact['grid-template-columns']).toBeTruthy();
    expect(compact.height).toBe('24px');
  });
});
