// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * The Media shell's blanket button reset must not outrank a component's own
 * colour, which is a cascade fact rather than a style opinion.
 *
 * `.mc-root button { color: inherit }` scores (0,1,1) — identical to every
 * component rule of the form `.some-block button { color: … }` — and
 * `mediaCenter.css` loads after those files, so source order handed the shell
 * every tie. Measured live 2026-08-25 through the debug bridge, in BOTH
 * presentations: `.medialib-view-toggle button`'s `color: var(--muted)`
 * (#7fa08e) never reached the screen, so the INACTIVE view button painted
 * #d8ebe0 — byte-identical to the active one — and which view was on rested on
 * a single low-contrast background fill. After `:where()`, inactive reads
 * rgb(127,160,142) at 6.77:1 and active rgb(216,235,224) at 12.21:1.
 *
 * Read from the stylesheet, not a rendered window: this is a specificity
 * relationship between two files, and jsdom does not resolve the cascade across
 * them. `\r` is stripped with the comments — this repo is `core.autocrlf=true`
 * with no `.gitattributes`, so the shared tree is LF and a fresh worktree is
 * CRLF, and a raw substring test otherwise passes only where it was written.
 */
const strip = (css: string) => css.replace(/\r/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
const SHELL = strip(readFileSync(resolve(__dirname, '..', 'views', 'mediaCenter.css'), 'utf8'));
const LIBRARY = strip(
  readFileSync(
    resolve(__dirname, '..', 'components', 'media', 'library', 'mediaLibrary.css'),
    'utf8',
  ),
);

/** The declaration block of the first rule whose selector list matches exactly. */
const declarationsFor = (css: string, selector: string) => {
  const blocks = css.split('}');
  const hit = blocks.find((block) => {
    const head = block.slice(block.lastIndexOf('{') === -1 ? 0 : 0, block.indexOf('{'));
    return head.replace(/\s+/g, ' ').trim() === selector;
  });
  return hit ? hit.slice(hit.indexOf('{') + 1).replace(/\s+/g, ' ').trim() : '';
};

describe('Media shell button colour cascade', () => {
  it('carries the shell reset at zero specificity', () => {
    // `:where()` contributes nothing, so the reset lands at (0,0,1): still above
    // the UA's `buttontext`, which is all it was ever for, and below any class.
    expect(declarationsFor(SHELL, ':where(.mc-root) button')).toMatch(/color:\s*inherit/);
    // The mutation control for this whole file: the un-wrapped form is the bug.
    expect(SHELL).not.toMatch(/(^|\n)\s*\.mc-root button\s*\{[^}]*color\s*:/);
  });

  it('lets the view toggle state its own inactive colour', () => {
    expect(declarationsFor(LIBRARY, '.medialib-view-toggle button')).toMatch(
      /color:\s*var\(--muted\)/,
    );
  });

  it('keeps the active view distinguished by more than a background fill', () => {
    // Two signals, not one: the pressed rule restates the colour as well as the
    // fill, so the toggle survives a surface whose fill is close to --surface-2.
    const pressed = declarationsFor(LIBRARY, ".medialib-view-toggle button[aria-pressed='true']");
    expect(pressed).toMatch(/background:\s*var\(--surface-2\)/);
    expect(pressed).toMatch(/color:\s*var\(--text\)/);
  });
});
