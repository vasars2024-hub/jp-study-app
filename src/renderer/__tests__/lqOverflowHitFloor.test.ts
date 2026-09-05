/**
 * Rubric category 1, the shared `.lq-overflow` menu — the row that read below the floor while
 * carrying the class that is supposed to lift it.
 *
 * Measured live 2026-09-05 through the debug bridge (pid 20540, `@.fwin[data-section="immersion"]`,
 * 820x580, the More menu disclosed by the harness). `cat1-accessibility.cjs` read
 * `belowFloorByHit 7` and every one of the seven was an item of that one menu:
 *
 *   button.btn.small                      rect 204x26   pointer 52.05x30.02   (n = 6)
 *   button.btn.small.immersion-close-page rect 204x26   pointer 52.05x30.02   (n = 1)
 *
 * One cause, and it is NOT a missing `.lq-hit-scope`. The scope class is present on the
 * toolbar and its 32px `::after` expander computes as landed. The body is a COLUMN with
 * `gap: 4px` and 26px rows, so each expander overruns its own row by 3px top and bottom and
 * meets its neighbour's inside the 4px gap. `elementFromPoint` in that overlap answers with
 * the sibling, so each row keeps only its own box plus the gap: 26 + 4 = 30.02px, under the
 * floor. Two expanders that overlap cannot both own the overlap.
 *
 * The fix is geometric rather than another expander: `min-height: var(--lq-hit-target)` on the
 * row itself. A 32px row has nothing to be stolen from it. After it, on the same surface and
 * the same walk: `belowFloorByHit` 7 -> 0, `stolenCount` 0, `stable: true`, verdict PASS 10/10,
 * with the harness's own plant still caught 2 of 2 and every bar moved by the control.
 *
 * The exemption is deliberate and is the second half of the fix. `.reader-anno-menu`'s body is
 * the one that opts back into a wrapped ROW, and its children are 14x14 colour chips with an
 * explicit `height`. `min-height` beats `height`, so the shared rule would have stretched each
 * chip into a 14x32 bar on a surface already certified at 80/80. Its floor keeps coming from
 * the expander, which in a wrapped row has somewhere to land.
 *
 * TRAP, already paid for in this repo: the stylesheet discusses `min-height` and the 32px floor
 * in PROSE several times in this same region, so a raw text search finds a comment before it
 * finds a declaration. Every lookup below runs on a comment-stripped copy.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RAW = readFileSync(resolve(__dirname, '../styles.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/**
 * The declarations of the LAST rule whose selector list matches exactly, as property->value.
 * The selector is given with its commas; whitespace between selectors is normalised so the
 * multi-line lists in this stylesheet can be named on one line here.
 */
function ruleOf(selectorList: string): Record<string, string> {
  const wanted = selectorList
    .split(',')
    .map((s) => s.trim())
    .join(',');
  let found: string | null = null;
  // Everything since the previous brace is the selector. Consuming a delimiter instead would
  // skip every other rule in a run of adjacent ones, which is exactly how the first draft of
  // this helper reported `.reader-anno-swatch` undeclared while it sat in the file.
  const re = /([^{}]*)\{([^{}]*)\}/g;
  for (let m = re.exec(CSS); m; m = re.exec(CSS)) {
    const sel = m[1]
      .split(',')
      .map((s) => s.trim().replace(/\s+/g, ' '))
      .join(',');
    if (sel === wanted) found = m[2];
  }
  expect(found, `${selectorList} is not declared`).not.toBe(null);
  const out: Record<string, string> = {};
  for (const decl of (found as string).split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    out[decl.slice(0, i).trim()] = decl.slice(i + 1).trim();
  }
  return out;
}

describe('the shared overflow menu — the 32px pointer floor', () => {
  it('gives every menu row the floor on its own box, not on an expander a neighbour can steal', () => {
    const row = ruleOf('.immersion-overflow-body > button, .lq-overflow-body > button, .lq-overflow-body > label');
    expect(row['min-height'], 'a menu row must carry the floor itself').toBe('var(--lq-hit-target)');
  });

  it('keeps the floor a token, so one edit still moves every surface that uses the menu', () => {
    const tokens = readFileSync(resolve(__dirname, '../theme/liquid-tokens.css'), 'utf8');
    expect(tokens).toMatch(/--lq-hit-target:\s*32px/);
  });

  it('states the floor once, for the primitive, rather than per surface', () => {
    // `.immersion-*` is an alias on the same rule, so the count of rules declaring this
    // floor for a menu row stays one. A second copy is how the manga and novel menus drift.
    const declaring = CSS.split('}').filter(
      (block) => /lq-overflow-body\s*>\s*(button|label)/.test(block) && /min-height:\s*var\(--lq-hit-target\)/.test(block),
    );
    expect(declaring).toHaveLength(1);
  });

  it('exempts the highlight palette, whose chips carry their own 14x14 geometry', () => {
    const chip = ruleOf('.reader-anno-swatch');
    expect(chip.height, 'the exemption only makes sense while the chip fixes its height').toBe('14px');
    const exempt = ruleOf('.reader-anno-menu > .lq-overflow-body > button');
    expect(exempt['min-height'], 'min-height beats height and would stretch the chip into a bar').toBe('0');
  });

  it('keeps the palette body the wrapped row the exemption assumes', () => {
    // If this body ever became a column the exemption would leave its chips in exactly the
    // overlap this fix exists to remove, and the exemption would have to go with it.
    const body = ruleOf('.reader-anno-menu > .lq-overflow-body');
    expect(body['flex-direction']).toBe('row');
    expect(body['flex-wrap']).toBe('wrap');
  });
});
