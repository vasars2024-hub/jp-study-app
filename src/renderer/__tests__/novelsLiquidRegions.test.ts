/**
 * L9 — which Novels regions adopted the contextual primitive, and which deliberately did not.
 *
 * Measured live on 2026-09-04 before this file existed: with the Novels window in Liquid
 * presentation, `cat3-liquid-utilization.cjs` classified **4** regions Liquid-eligible and found
 * **1** treated. The three it named were `div.ui-toolbar.jiten-novels-toolbar` (7.3% of the
 * window), `aside.jiten-filters` (22.7%) and `aside.jiten-inspector` (94.1%) — all three
 * `contextual=true`, all three fully opaque inside a window painting at alpha 0.72 with
 * `backdrop-filter: blur(8px)`. After adopting the primitive the same walk reads **4 of 4**
 * with `untreatedEligible` empty.
 *
 * `main.jiten-table-wrap` is the deliberate exclusion and it is pinned here as a DECISION, not
 * left as an omission for someone to later "complete": a results table is one of the four things
 * §2.3 names as belonging on a stable opaque anchor, and the same walk classifies it `Anchor`.
 *
 * Read from source text rather than by mounting, for the same reason `desktopNoteChromeInk` and
 * `liquidChromeContrast` do: the regions are a static authoring decision, and mounting
 * `NovelsView` costs eight module mocks to assert three class names. Comments are stripped
 * before every match — a repo rule learned twice, once when a CSS comment mentioning
 * `display: none` failed a CSS guard and once when a comment naming a helper scored as a
 * fourth call site.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (...parts: string[]): string =>
  readFileSync(join(__dirname, '..', ...parts), 'utf8');

/** Block and line comments out, so prose about a selector can never satisfy a rule about it. */
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');

const view = stripComments(read('views', 'NovelsView.tsx'));
const css = stripComments(read('styles.css'));

describe('Novels — contextual regions', () => {
  it.each([
    ['jiten-novels-toolbar', 'the command strip'],
    ['jiten-filters', 'the filter rail'],
    ['jiten-inspector', 'the detail inspector'],
  ])('%s carries lq-contextual (%s)', (region) => {
    const found = new RegExp(`className="${region} lq-contextual"`).test(view);
    expect(found, `${region} must adopt the contextual primitive`).toBe(true);
  });

  it('the results table stays a plain anchor', () => {
    expect(view).toContain('className="jiten-table-wrap"');
    expect(view).not.toContain('jiten-table-wrap lq-contextual');
  });

  /**
   * The regression this file exists to stop coming back.
   *
   * `.lq-contextual` relaxes `min-height` to 0 (`theme/liquid-surfaces.css`) so a migrated
   * region can shrink inside whatever host it was placed in, and that base rule is NOT gated on
   * Liquid. The toolbar is a flex ITEM of a height-constrained column, so the permission let the
   * column squeeze it: measured 772x45 -> **772x18** the moment the class went on, in BOTH
   * presentations. `contextual-surface-min-height-zero` records the same primitive collapsing a
   * flex item on another surface, so this is the second instance, not a one-off.
   */
  it('the toolbar refuses the primitive`s min-height relaxation', () => {
    const rule = /\.jiten-novels-toolbar\.lq-contextual\s*\{([^}]*)\}/.exec(css);
    expect(rule, 'the toolbar needs its own rule or the column collapses it').not.toBeNull();
    expect(rule?.[1]).toMatch(/min-height:\s*auto/);
    expect(rule?.[1]).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  /**
   * The non-negotiable the repair had to hold: conventional windows stay the default. Every
   * paint the primitive contributes is gated on a Liquid host in `theme/liquid-window.css`, and
   * `theme/liquid-surfaces.css` carries no paint for `.lq-contextual` at all — so adding the
   * class changes nothing until a window is explicitly put in Liquid presentation. Verified live
   * as well as here: in standard presentation the three regions measured 772x140 / 772x870 /
   * 772x45 with `rgb(26, 24, 35)`, `rgb(26, 24, 35)` and `rgba(0, 0, 0, 0)` — identical to the
   * readings taken before the class was added.
   */
  it('the primitive itself paints nothing outside a Liquid host', () => {
    const surfaces = stripComments(read('theme', 'liquid-surfaces.css'));
    // The role primitives share one geometry rule, so `.lq-contextual` is the LAST selector of a
    // five-way comma group. Matching it as if it stood alone found nothing and read as "the
    // primitive was deleted"; the selector list is what has to be matched.
    const bodies = [...surfaces.matchAll(/([^{}]+)\{([^}]*)\}/g)]
      .filter(([, sel]) => /(^|,)\s*\.lq-contextual\s*(,|$)/.test(sel.trim()))
      .map(([, , body]) => body);
    expect(bodies.length, '.lq-contextual must still declare a base rule').toBeGreaterThan(0);
    for (const paint of ['background', 'border', 'box-shadow', 'backdrop-filter', 'padding']) {
      for (const body of bodies) {
        expect(body, `${paint} in the base rule would glass every conventional window`)
          .not.toMatch(new RegExp(`(^|;|\\s)${paint}\\s*:`));
      }
    }
  });
});
