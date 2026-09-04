/**
 * Rubric category 1/4, Files — the collapsed rail's non-tree controls.
 *
 * Measured live 2026-09-04 through the debug bridge, in the state the app opens in (Files
 * window 820x580 -> scaffold 782 -> `medium` -> `data-rail-collapsed='true'`, a 72px rail
 * over a 52px `.fa-tree` box). Against the RAIL's own right edge, not the window's:
 *
 *   button.fa-smart-save              "Save this search"   108px wide, 105px past the rail
 *   button.fa-collections-new         "New folder"          46px wide,  33px past
 *   button.fa-action.fa-folder-delete "Delete folder"       90px wide,  25px past
 *   label.fa-folder-move + its select                       77px wide,  12px past
 *
 * `.lq-scaffold-rail` itself read scrollWidth 60 against clientWidth 60 — the rail does not
 * overflow, these five controls inside it do, and `.fa-tree` was clipping them: it reported
 * scrollWidth **172** against clientWidth **52**, a 120px sideways scroll region with no
 * scrollbar containing nothing but the chopped halves of those labels. After the repair the
 * same three readings are **0 controls past the rail** and `.fa-tree` **59/52**.
 *
 * The 2026-09-03 repair above these rules gave `.fa-tree-node` the collapsed contract and
 * stopped there; every other control in the rail has an intrinsic min-content width and got
 * none of it. This file pins the second half so it cannot silently revert.
 *
 * TRAP, already paid for twice in this repo: the fix's own comment names `overflow-x: hidden`
 * and `min-width` in prose, and a raw text search finds the comment first. Every lookup here
 * runs on a comment-stripped copy. (`css-comment-fails-css-test`.)
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

const COLLAPSED = ".lq-scaffold[data-rail-collapsed='true']";

describe('files app — the collapsed rail contains its own controls', () => {
  it('the tree never scrolls sideways, and says so rather than inheriting `auto`', () => {
    const tree = ruleOf('.fa-tree');
    // Declaring one axis makes the other compute to `auto`, not `visible`. `overflow-y: auto`
    // alone is what made this element a horizontal scroller, which is both the 120px phantom
    // region above and the thing that shadowed `.lq-scaffold-rail` for any scroll-parent walk.
    expect(tree['overflow-y']).toBe('auto');
    expect(tree['overflow-x'], 'the second axis is left to compute to auto').toBe('hidden');
  });

  it('every rail control that has a min-content width can shrink and ellipsize', () => {
    const contained = ruleOf(
      [
        `${COLLAPSED} .fa-collections-title`,
        `${COLLAPSED} .fa-smart-save`,
        `${COLLAPSED} .fa-collections-new`,
        `${COLLAPSED} .fa-folder-actions .fa-action`,
        `${COLLAPSED} .fa-folder-move`,
        `${COLLAPSED} .fa-folder-move select`,
      ].join(',\n'),
    );
    // All four together, and each one is load-bearing: `min-width: 0` is what lets a flex item
    // go under its own min-content width at all, `max-width: 100%` is what stops a block one,
    // and the ellipsis pair is what turns the result into a readable stub rather than a
    // mid-word chop. Drop any single one and one of the five controls above overflows again.
    expect(contained['min-width']).toBe('0');
    expect(contained['max-width']).toBe('100%');
    expect(contained.overflow).toBe('hidden');
    expect(contained['text-overflow']).toBe('ellipsis');
    expect(contained['white-space']).toBe('nowrap');
  });

  it('a 52px row stacks its heading and its button instead of splitting the width', () => {
    for (const sel of [`${COLLAPSED} .fa-collections-head`, `${COLLAPSED} .fa-folder-actions`]) {
      const rule = ruleOf(sel);
      expect(rule['flex-direction'], `${sel} still lays out in a row`).toBe('column');
      // `stretch`, not `flex-start`: an action that shrank to its ellipsis would clear the
      // width bar and fail the 32px pointer floor the row above it was widened to satisfy.
      expect(rule['align-items'], `${sel} does not stretch its children`).toBe('stretch');
    }
  });

  it('the containment is scoped to the collapsed rail and does not reach the expanded one', () => {
    // The expanded rail is 232px and these labels fit; ellipsizing them there would be damage,
    // not repair. Every rule this file pins carries the attribute selector.
    const scoped = CSS.split('\n').filter(
      (line) => line.includes('.fa-collections-title') || line.includes('.fa-folder-actions'),
    );
    const unscoped = scoped.filter(
      (line) => !line.includes('data-rail-collapsed') && !line.trimStart().startsWith('.fa-'),
    );
    expect(unscoped, `unscoped selector lines: ${unscoped.join(' | ')}`).toEqual([]);
  });
});
