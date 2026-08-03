// @vitest-environment node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { shellZIndex, viewOverlayZIndex } from '../theme/tokens';

/**
 * The shell layer scale (theme/tokens.css, "Shell layer scale").
 *
 * This exists because the ordering it encodes was wrong for months in a way
 * nothing could catch: `.palette` sat at 1201 and `.seanime-host` — the adopted
 * media workspace, an OPAQUE full-screen view — at 9999, so opening the command
 * palette over the player mounted it, moved focus into its input and swallowed
 * every keystroke while it was completely invisible. Slice 7 had just put the
 * Continue-watching group in that palette, i.e. the one surface whose entire job
 * is to reach the player from somewhere else.
 *
 * Nothing failed. Two independent magic numbers simply disagreed, and the
 * symptom was "the palette does nothing here". These assertions turn the
 * ordering into something a change can break loudly:
 *
 *   1. the tokens are declared, and their VALUES sort the way the scale claims;
 *   2. the surfaces that depend on the ordering reference the tokens, so a raw
 *      number cannot quietly reintroduce a second opinion.
 *
 * The tests read the stylesheets as text on purpose. jsdom does not do stacking,
 * and a render test would assert that two elements exist — which was already
 * true while the bug was live.
 */

const RENDERER = resolve(__dirname, '..');
const TOKENS_CSS = readFileSync(resolve(RENDERER, 'theme', 'tokens.css'), 'utf8');
const STYLES_CSS = readFileSync(resolve(RENDERER, 'styles.css'), 'utf8');

/** Value of a `--name: <value>;` declaration in tokens.css, as a number. */
function tokenValue(name: string): number {
  const match = TOKENS_CSS.match(new RegExp(`${name}\\s*:\\s*([0-9]+)\\s*;`));
  if (!match) throw new Error(`${name} is not declared in tokens.css`);
  return Number(match[1]);
}

/**
 * The `z-index` declared for a selector in styles.css. Deliberately reads the
 * FIRST declaration inside the rule block rather than a global search, so a
 * z-index belonging to a neighbouring rule cannot be mistaken for this one.
 */
function zIndexOf(css: string, selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`selector ${selector} not found`);
  const end = css.indexOf('}', start);
  const block = css.slice(start, end);
  const match = block.match(/z-index:\s*([^;]+);/);
  if (!match) throw new Error(`${selector} declares no z-index`);
  return match[1].trim();
}

/** Declaration order in `shellZIndex` is the stacking order, lowest first. */
const SCALE: readonly (keyof typeof shellZIndex)[] = [
  'viewAffordance',
  'view',
  'overlayBackdrop',
  'overlay',
  'feedback',
  'blocking',
  'lock',
  'chrome',
  'chromeRaised',
  'windowChrome',
];

const CSS_NAME: Record<keyof typeof shellZIndex, string> = {
  viewAffordance: '--z-shell-view-affordance',
  view: '--z-shell-view',
  overlayBackdrop: '--z-shell-overlay-backdrop',
  overlay: '--z-shell-overlay',
  feedback: '--z-shell-feedback',
  blocking: '--z-shell-blocking',
  lock: '--z-shell-lock',
  chrome: '--z-shell-chrome',
  chromeRaised: '--z-shell-chrome-raised',
  windowChrome: '--z-window-chrome',
};

describe('shell layer scale', () => {
  it('reads stylesheets that actually contain the surfaces under test', () => {
    // Guards every assertion below from passing vacuously on a moved file.
    expect(TOKENS_CSS).toContain('--z-shell-view');
    expect(STYLES_CSS).toContain('.seanime-host {');
    expect(STYLES_CSS).toContain('.palette {');
  });

  it('mirrors tokens.css values exactly', () => {
    for (const key of SCALE) {
      expect(shellZIndex[key], `${CSS_NAME[key]} drifted from tokens.ts`)
        .toBe(tokenValue(CSS_NAME[key]));
    }
  });

  it('sorts strictly ascending in declaration order', () => {
    const values = SCALE.map((key) => shellZIndex[key]);
    for (let i = 1; i < values.length; i += 1) {
      expect(values[i], `${SCALE[i]} must outrank ${SCALE[i - 1]}`)
        .toBeGreaterThan(values[i - 1]);
    }
  });

  it('keeps the shell-global overlays above a full-screen view', () => {
    // The defect, stated directly. An opaque full-screen view hides what is
    // under it, so "the palette is behind the workspace" means "gone".
    expect(shellZIndex.overlayBackdrop).toBeGreaterThan(shellZIndex.view);
    expect(shellZIndex.overlay).toBeGreaterThan(shellZIndex.view);
    expect(shellZIndex.feedback).toBeGreaterThan(shellZIndex.overlay);
  });

  it('keeps a blocking gate above every overlay a user can reach for', () => {
    // This is a regression check on THIS scale's own first cut. Raising the palette
    // from 1201 to 20001 moved it over `.consent` (9000), so one keystroke put a
    // working command surface on top of an unanswered first-launch gate. Toasts too.
    // An overlay is something you reach for; a gate is the one thing you may not
    // reach past. Only the lock screen goes higher.
    expect(shellZIndex.blocking).toBeGreaterThan(shellZIndex.overlay);
    expect(shellZIndex.blocking).toBeGreaterThan(shellZIndex.feedback);
    expect(shellZIndex.blocking).toBeGreaterThan(shellZIndex.view);
    expect(shellZIndex.lock).toBeGreaterThan(shellZIndex.blocking);
  });

  it('keeps OS chrome and the lock screen above every shell overlay', () => {
    // The other half of the ordering: raising the palette must not have raised
    // it over the taskbar, the window title bar or the lock screen.
    expect(shellZIndex.lock).toBeGreaterThan(shellZIndex.feedback);
    expect(shellZIndex.chrome).toBeGreaterThan(shellZIndex.feedback);
    expect(shellZIndex.windowChrome).toBeGreaterThan(shellZIndex.chromeRaised);
  });

  it('fills the room it left between the view tier and the shell tier', () => {
    // The gap 9999 -> 20000 exists for view-scoped overlays that already sit above
    // the ui/* tier. It used to hold exactly one raw number, `.reading-source-backdrop`
    // at 12500; it is now a named tier, at the same value so nothing moved.
    expect(viewOverlayZIndex.backdrop).toBe(tokenValue('--z-view-overlay-backdrop'));
    expect(viewOverlayZIndex.dialog).toBe(tokenValue('--z-view-overlay'));
    expect(viewOverlayZIndex.dialog).toBeGreaterThan(viewOverlayZIndex.backdrop);
    expect(shellZIndex.view).toBeLessThan(viewOverlayZIndex.backdrop);
    expect(shellZIndex.overlayBackdrop).toBeGreaterThan(viewOverlayZIndex.dialog);
  });

  it("keeps a view's own modal under every shell-global surface", () => {
    // The ordering claim, stated directly. `.lib-import` declared 300000/300001 — above
    // --z-window-chrome (250000) — so in the Focus shell, which puts no stacking context
    // between it and the root, an import dialog painted over this window's title bar and
    // the drag strip inside it. A dialog a view owns is not a gate on the app: the
    // palette, a toast and the taskbar all outrank it, and only --z-shell-blocking
    // (something you may not reach past) outranks those.
    expect(viewOverlayZIndex.dialog).toBeLessThan(shellZIndex.overlay);
    expect(viewOverlayZIndex.dialog).toBeLessThan(shellZIndex.feedback);
    expect(viewOverlayZIndex.dialog).toBeLessThan(shellZIndex.blocking);
    expect(viewOverlayZIndex.dialog).toBeLessThan(shellZIndex.windowChrome);
  });

  it('leaves no raw number behind on the surfaces in that tier', () => {
    const bound: [string, keyof typeof viewOverlayZIndex][] = [
      ['.reading-source-backdrop', 'backdrop'],
      ['.lib-import-backdrop', 'backdrop'],
      ['.lib-import', 'dialog'],
    ];
    const CSS: Record<keyof typeof viewOverlayZIndex, string> = {
      backdrop: '--z-view-overlay-backdrop',
      dialog: '--z-view-overlay',
    };
    for (const [selector, key] of bound) {
      const declared = zIndexOf(STYLES_CSS, selector);
      expect(declared, `${selector} should use var(${CSS[key]})`).toContain(`var(${CSS[key]}`);
      expect(declared, `${selector}'s fallback disagrees with ${CSS[key]}`)
        .toContain(String(viewOverlayZIndex[key]));
    }
  });

  it('makes every surface in the scale reference a token, not a number', () => {
    const bound: [string, keyof typeof shellZIndex][] = [
      ['.palette-backdrop', 'overlayBackdrop'],
      ['.palette', 'overlay'],
      ['.cbh-backdrop', 'overlayBackdrop'],
      ['.cbh-panel', 'overlay'],
      ['.os-toast-host', 'feedback'],
      ['.seanime-host', 'view'],
      ['.seanime-host-launcher', 'viewAffordance'],
      ['.consent', 'blocking'],
      ['.os-taskbar', 'chrome'],
      ['.lockscreen', 'lock'],
    ];
    for (const [selector, key] of bound) {
      const declared = zIndexOf(STYLES_CSS, selector);
      expect(declared, `${selector} should use var(${CSS_NAME[key]})`)
        .toContain(`var(${CSS_NAME[key]}`);
      // The literal fallback must match the token, or the two disagree the
      // moment tokens.css fails to load (a bare `styles.css` harness page).
      expect(declared, `${selector}'s fallback disagrees with ${CSS_NAME[key]}`)
        .toContain(String(shellZIndex[key]));
    }
  });
});
