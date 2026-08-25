// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * §10.4 Q6 of `src/LIQUID_UI_RUBRIC.md` — "Liquid motion explains a real relationship".
 *
 * `.mc-sidebar` and `.mc-topbar` are the Media shell's only backdrop-filtered
 * regions, and both were measured live carrying a `backdrop-filter` and
 * `transitionProperty: all 0s` — translucent panels that never respond to
 * anything, which is decoration rather than language. The probe's bar is "every
 * Liquid-treated region carries a state-change transition and none loops
 * forever", and Video read `carryingATransition: 0` of 2 against it.
 *
 * The relationship is focus: tabbing into one of the two floating regions
 * colours its edge, so a keyboard user can see which one they are inside.
 *
 * Read from the stylesheet rather than from a rendered window because the state
 * is a pseudo-class jsdom does not resolve, and because the live reading is the
 * one that already exists — this file exists to stop the rule being deleted
 * between live runs. Comments are stripped first, and `\r` with them: this
 * repo is `core.autocrlf=true` with no `.gitattributes`, so the shared tree is
 * LF and every fresh worktree is CRLF, and a raw substring test passes only
 * where it was written.
 */
const CSS = readFileSync(resolve(__dirname, '..', 'views', 'mediaCenter.css'), 'utf8')
  .replace(/\r/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function declarationsFor(selector: string): string {
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m: RegExpExecArray | null;
  let found = '';
  while ((m = re.exec(CSS))) {
    if (m[1].trim().replace(/\s+/g, ' ') === selector) found += m[2];
  }
  return found;
}

describe('the Media shell\'s two Liquid regions', () => {
  it('transitions the material rather than snapping it', () => {
    const decls = declarationsFor('.mc-sidebar, .mc-topbar');
    expect(decls).toMatch(/transition:/);
    expect(decls).toMatch(/border-color/);
    expect(decls).toMatch(/box-shadow/);
  });

  it('has a state to transition INTO, on both of them', () => {
    // A transition with no state change is a number that satisfies a probe and
    // nothing else. Each region must actually repaint an edge when focus enters.
    expect(declarationsFor('.mc-sidebar:focus-within')).toMatch(/border-right-color:/);
    expect(declarationsFor('.mc-topbar:focus-within')).toMatch(/border-bottom-color:/);
  });

  it('never loops — the bar rejects an infinite animation on a Liquid region', () => {
    for (const selector of ['.mc-sidebar', '.mc-topbar', '.mc-sidebar, .mc-topbar']) {
      expect(declarationsFor(selector)).not.toMatch(/animation[^;]*infinite/);
    }
  });
});
