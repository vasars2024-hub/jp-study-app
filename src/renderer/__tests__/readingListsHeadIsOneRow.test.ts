/**
 * Reading lists' header must not stack its own toolbar.
 *
 * MEASURED LIVE 2026-09-06 through the debug bridge, on the running app's reading
 * window at its DEFAULT 820x580 size. `.rlv__head` is a wrapping flex row holding
 * a title, a spacer, two selects and the New list button. `.ui-select` is a form-
 * COLUMN primitive and carries `width: 100%` (`components/ui/ui.css:263`), so in
 * that row each select demanded the whole 748px container and no two controls
 * could share a line:
 *
 *     head 748x155   selects 748x39 @y188 and 748x39 @y231
 *
 * 155px of header on a 470px panel — a quarter of the surface gone before a
 * single list is on screen, on the default window, for every user.
 *
 * The fix was verified live by injecting exactly the rule below into the running
 * renderer and then removing it again:
 *
 *     before   head 748x155   selects 748x39 @y188, 748x39 @y231
 *     after    head 748x40    selects 124x39 @y160, 155x39 @y160
 *     restored head 748x155   (identical to before)
 *
 * WHY THIS TEST IS SHAPED THIS WAY. jsdom computes no layout, so the 155 -> 40 is
 * not reproducible here and a rendered test would assert nothing. What IS testable
 * is the COUPLING the live measurement identified: the shared primitive sets a
 * full-bleed width, and this toolbar overrides it. Both halves are asserted, so if
 * someone later drops `width: 100%` from `.ui-select` this test fails and says the
 * override is now redundant, rather than passing while quietly guarding nothing.
 *
 * Comments are stripped before matching. This file's own prose names the very
 * declarations under test, and a raw-text scan would otherwise match itself.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (relative: string): string => {
  const text = fs.readFileSync(path.join(process.cwd(), relative), 'utf8');
  return text.replace(/\/\*[\s\S]*?\*\//g, '');
};

/**
 * The declaration block for an exact selector, or null.
 *
 * Anchored on a rule boundary rather than split on `}`: this stylesheet contains
 * `@media` blocks, whose braces make a naive split misalign every rule after the
 * first one and report a perfectly present selector as missing.
 */
const blockFor = (css: string, selector: string): string | null => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s*');
  const match = css.match(new RegExp(`(?:^|[};{])\\s*${escaped}\\s*\\{([^{}]*)\\}`));
  return match ? match[1] : null;
};

const declaration = (block: string, property: string): string | null => {
  const match = block.match(new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, 'i'));
  return match ? match[1].trim() : null;
};

describe('Reading lists — the header toolbar stays one row', () => {
  const ui = read('src/renderer/components/ui/ui.css');
  const lists = read('src/renderer/views/readingLists.css');

  // Half one: the primitive really is full-bleed. This is the cause, and pinning
  // it is what makes the override below meaningful rather than cargo-culted.
  it('the shared select primitive is still full-width, which is why the override exists', () => {
    const block = blockFor(ui, '.ui-input, .ui-textarea, .ui-select');
    expect(block, '.ui-select is no longer declared alongside .ui-input/.ui-textarea').not.toBeNull();
    expect(declaration(block as string, 'width')).toBe('100%');
  });

  // Half two: the regression. Without this the header measured 155px live.
  it('the toolbar gives its selects an intrinsic width', () => {
    const block = blockFor(lists, '.rlv__head > .ui-select');
    expect(block, 'the toolbar override is gone — the header will stack again').not.toBeNull();
    expect(declaration(block as string, 'width')).toBe('auto');
  });

  // The header is only allowed to wrap as a last resort, so the spacer must not
  // be the thing that fills a line. Pinned because `flex-wrap` plus a growing
  // spacer is what turned one over-wide item into four stacked rows.
  it('the header is still a wrapping row with a growing spacer', () => {
    const head = blockFor(lists, '.rlv__head');
    const spacer = blockFor(lists, '.rlv__spacer');
    expect(head).not.toBeNull();
    expect(spacer).not.toBeNull();
    expect(declaration(head as string, 'display')).toBe('flex');
    expect(declaration(head as string, 'flex-wrap')).toBe('wrap');
    expect(declaration(spacer as string, 'flex')).toBe('1 1 auto');
  });
});
