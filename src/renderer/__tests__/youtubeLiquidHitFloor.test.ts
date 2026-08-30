/**
 * L8 YouTube — rubric category 1's 32px pointer floor, pinned at source.
 *
 * The live harness measured 54 of this surface's 84 controls under the floor and 0 after
 * the fix, but the fix is two CSS declarations and one class, each of which is silently
 * revertible by an unrelated edit. What this guard pins is the *shape* of the fix, because
 * both halves have a documented way of reading as landed while moving nothing:
 *
 * 1. `.lq-hit-scope` deliberately lists only `button, a[href], [role=button], [role=tab]`.
 *    `input` and `select` are replaced elements — `::after` generates no box on them — so a
 *    scope that appeared to cover them would leave every `.yt-pref` control under the floor.
 *    Their floor is a `min-height` on the label, which is the box a pointer aims at.
 * 2. `.yt-folder-head` needs the floor on the ROW. Its delete button's expander is 32px, but
 *    at the row's old 22px the pointer walk left the header and entered the playlist button
 *    4px below, so the control measured 31 with the scope already applied.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const RENDERER = resolve(__dirname, '..');
const read = (...parts: string[]) => readFileSync(resolve(RENDERER, ...parts), 'utf8');

/** The declarations of one top-level rule, addressed by its exact selector line. */
function ruleBody(css: string, selector: string): string {
  const at = css.indexOf(`\n${selector} {\n`);
  expect(at, `no rule for ${selector}`).toBeGreaterThan(-1);
  const start = at + selector.length + 4;
  const end = css.indexOf('\n}', start);
  return css.slice(start, end);
}

describe('L8 YouTube — 32px pointer floor', () => {
  it('puts the hit-area scope on the app root, not on ~40 call sites', () => {
    const view = read('views', 'YouTubePlaylistsView.tsx');
    expect(view).toContain('className="yt-root lq-hit-scope"');
    expect(view).not.toContain('className="yt-root"');
  });

  it('gives the replaced-element labels their own floor, because the scope cannot reach them', () => {
    const scope = read('theme', 'liquid-controls.css');
    const selector = scope.slice(scope.indexOf('.lq-hit-scope :is('));
    const list = selector.slice(0, selector.indexOf(')'));
    // If this ever grows `input`/`select`, the `.yt-pref` rule below is no longer the floor
    // and this test would otherwise keep passing while the controls sat at 21px.
    expect(list).not.toMatch(/\binput\b/);
    expect(list).not.toMatch(/\bselect\b/);

    const css = read('styles.css');
    expect(ruleBody(css, '.yt-pref')).toContain('min-height: var(--lq-hit-target);');
  });

  it('floors the folder header row so its delete button does not reach over the list', () => {
    const css = read('styles.css');
    expect(ruleBody(css, '.yt-folder-head')).toContain('min-height: var(--lq-hit-target);');
  });
});
