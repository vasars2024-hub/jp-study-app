// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * A WINDOW-ENTRY ANIMATION MAY NOT ANIMATE `opacity` FROM 0.
 *
 * Measured live 2026-09-05 on the shared instance (bridge 39273, pid 36988, window 1). A `.fwin`
 * opened through `os:open` while the OS window was occluded reported:
 *
 *     document.querySelector('.fwin').getAnimations()  ->  ["fwinIn:running:0"]
 *     getComputedStyle(w).opacity                      ->  0
 *     document.hasFocus()                              ->  true
 *
 * `playState` is `running` and `currentTime` is `0`, and it stays there: the compositor does not
 * advance an animation in a window it is not painting. `fwinIn` had `from { opacity: 0 }` and no
 * fill-mode, and `.fwin` declares no `opacity` of its own, so the window was invisible ONLY while
 * the animation was running — and the animation never finished. Re-focusing did not recover it,
 * measured twice: after an explicit `/focus`, and after close-and-reopen while focused. To a user
 * whose app sits behind another window, that is a permanently blank desk.
 *
 * The control that assigned the cause, run in the same session: setting `animation: none` on the
 * stuck window read opacity `0 -> 1` and painted text runs `0 -> 56 of 68`; removing the plant
 * read opacity back to `0`. So the base style is visible and the frozen animation was the whole
 * of it.
 *
 * The rule this guards: an entry animation may move `transform`, which degrades to a 2% shrink
 * when frozen, but never `opacity`, which degrades to an invisible window. Raising the `from`
 * opacity to a nonzero value does not satisfy it — "faint forever" is the same defect, so the
 * assertion is on the PROPERTY, not on the value.
 *
 * Comments are stripped first: this file's own explanation quotes `opacity: 0` and a substring
 * test over the raw stylesheet reads its own prose as the defect (`css-comment-fails-css-test`).
 */

const RAW = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8');
const CSS = RAW.replace(/\/\*[\s\S]*?\*\//g, '');

/** The body of `@keyframes <name>`, brace-matched so a nested block cannot truncate it. */
function keyframeBody(name: string): string {
  const at = CSS.indexOf(`@keyframes ${name}`);
  if (at < 0) return '';
  const open = CSS.indexOf('{', at);
  if (open < 0) return '';
  let depth = 0;
  for (let i = open; i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1;
    else if (CSS[i] === '}') {
      depth -= 1;
      if (depth === 0) return CSS.slice(open + 1, i);
    }
  }
  return '';
}

describe('an entry animation cannot leave a window invisible', () => {
  it('still declares fwinIn, so a rename cannot make this suite vacuous', () => {
    expect(keyframeBody('fwinIn').trim().length).toBeGreaterThan(0);
  });

  it('fwinIn animates transform and never opacity', () => {
    const body = keyframeBody('fwinIn');
    expect(body).toMatch(/transform\s*:/);
    expect(body).not.toMatch(/(^|[\s;{])opacity\s*:/);
  });

  it('the surfaces that use fwinIn are the window shell and the start menu', () => {
    // If a third caller appears, it inherits the same guarantee — which is the point of fixing
    // this in the keyframes rather than at either call site.
    const users = CSS.match(/animation:\s*fwinIn/g) ?? [];
    expect(users.length).toBeGreaterThanOrEqual(2);
  });

  it('.fwin declares no opacity of its own, so its resting state is visible', () => {
    // The fix relies on the base style resting at 1. A later `.fwin { opacity: ... }` would
    // reintroduce the defect from the other side, and this is the cheapest place to catch it.
    const at = CSS.search(/(^|\})\s*\.fwin\s*\{/);
    expect(at).toBeGreaterThanOrEqual(0);
    const open = CSS.indexOf('{', at);
    const close = CSS.indexOf('}', open);
    expect(CSS.slice(open + 1, close)).not.toMatch(/(^|[\s;])opacity\s*:/);
  });
});
