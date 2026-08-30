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

describe('L8 YouTube — category 3 roles', () => {
  const view = () => read('views', 'YouTubePlaylistsView.tsx');

  it('declares the rail and both headers contextual, from the shared primitive', () => {
    const src = view();
    expect(src).toContain('<ContextualSurface as="aside" className="yt-side">');
    expect(src.match(/<ContextualSurface as="header" className="yt-header">/g)).toHaveLength(2);
    // The raw landmarks must be gone, or one branch renders an untreated region and the
    // category scores 1 of 2 while the source still reads as migrated.
    expect(src).not.toContain('<aside className="yt-side">');
    expect(src).not.toContain('<header className="yt-header">');
  });

  it('keeps every form off the contextual material', () => {
    const src = view();
    // The preference form is a sibling of the header, not a child: a `<header>` is the
    // translucent role, and ten controls inside it measured as dense work on glass.
    expect(src).not.toMatch(/className="yt-header"[\s\S]*?yt-prefs[\s\S]*?<\/ContextualSurface>/);
    for (const field of ['yt-prefs', 'yt-add', 'yt-folder-add']) {
      expect(src).toContain(`<AnchorSurface bare className="${field}">`);
    }
  });

  it('compensates for the primitives unconditional min-height reset', () => {
    // `.lq-contextual`/`.lq-anchor` set `min-height: 0` so a primitive can be a scroll
    // container. In this column flex that lets the chrome be crushed by the video list.
    const css = read('styles.css');
    expect(ruleBody(css, '.yt-header')).toContain('flex: 0 0 auto;');
    expect(ruleBody(css, '.yt-prefs')).toContain('flex: 0 0 auto;');
  });

  it('restores the app box at three classes, not by import order', () => {
    const css = read('styles.css');
    // `.lq-anchor[data-bare]` zeroes padding and radius, and it is (0,2,0). A two-class
    // restore only TIES with it, so which one wins is decided by which sheet the bundler
    // emitted last — the restore has to outweigh it, as `.scr-drawer-search` does.
    for (const sel of [
      '.yt-side .lq-anchor.yt-add',
      '.yt-side .lq-anchor.yt-folder-add',
      '.yt-main .lq-anchor.yt-prefs',
    ]) {
      expect(css, `missing three-class restore for ${sel}`).toContain(sel);
    }
    expect(ruleBody(css, '.yt-main .lq-anchor.yt-prefs')).toContain('padding: 10px 12px;');
  });
});

describe('L8 YouTube — category 4 narrow layout', () => {
  it('queries a wrapper, because a container cannot answer its own condition', () => {
    const src = read('views', 'YouTubePlaylistsView.tsx');
    expect(src).toContain('<div className="yt-shell">');
    const css = read('styles.css');
    expect(ruleBody(css, '.yt-shell')).toContain('container-type: inline-size;');
    expect(ruleBody(css, '.yt-shell')).toContain('container-name: yt-shell;');
  });

  it('places the query AFTER the rules it overrides', () => {
    // A `@container` block adds no specificity. Written above `.yt-row`/`.yt-side` it lost on
    // source order and moved nothing — measured: the row stayed 330px wide in a 202px list
    // while the block was live and matching.
    const css = read('styles.css');
    const query = css.indexOf('@container yt-shell (max-width: 560px)');
    expect(query).toBeGreaterThan(-1);
    for (const sel of ['\n.yt-row {', '\n.yt-side {', '\n.yt-thumb {', '\n.yt-row-actions {']) {
      expect(css.indexOf(sel), `${sel.trim()} must precede the container query`).toBeLessThan(query);
    }
  });

  it('narrows without deleting anything', () => {
    const css = read('styles.css');
    // The `@media (max-width: 720px)` block this replaced set `display: none` on the status
    // chips — and never fired anyway, because a media query reads the OS viewport while this
    // surface lives in a floating window.
    expect(css).not.toMatch(/@media \(max-width: 720px\) \{\s*\.yt-root/);
    const block = css.slice(css.indexOf('@container yt-shell (max-width: 560px)'));
    const body = block.slice(0, block.indexOf('\n}\n') + 2);
    expect(body).not.toContain('display: none');
  });
});
