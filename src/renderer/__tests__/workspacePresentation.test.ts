// @vitest-environment jsdom
/**
 * Liquid Workplace — L3.2/L12, the FOURTH presentation host: the Media
 * workspace overlay.
 *
 * What this suite is for, stated as the defect it pins rather than the feature
 * it covers. All six `mediaWorkspace` rows in
 * `src/.coordination/liquid-workplace/parity-ledger.json` — the ONLY six of its
 * fifty rows that are not `both` — carried the same recorded blocker:
 * `.seanime-host` has no window chrome, no `Make Liquid` control and no
 * `data-presentation`, so per-window presentation state could not reach it at
 * all. That is an enable flow whose destination does not exist, which is the
 * same defect the pop-out and the reader each fixed one host earlier.
 *
 * The round-trip cases are the ones that matter: a Liquid presentation you
 * cannot leave, or that survives as a half-parsed blob, is worse than none.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  WORKSPACE_PRESENTATION_KEY,
  readWorkspacePresentation,
  toggleWorkspacePresentation,
  writeWorkspacePresentation,
} from '../workspacePresentation';

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

/**
 * `liveWindowRect` reads `outerWidth`/`outerHeight`/`screenX`/`screenY`, and the
 * jsdom defaults are 1024x768 at 0,0. Set them explicitly rather than relying on
 * that: the whole point of the refusal path below is that these globals are
 * INTERMITTENT in the real renderer, and a test that inherits a default cannot
 * tell a measured 1024 from an unmeasured one.
 */
function setRect(w: number, h: number, x = 0, y = 0): void {
  Object.defineProperty(window, 'outerWidth', { value: w, configurable: true });
  Object.defineProperty(window, 'outerHeight', { value: h, configurable: true });
  Object.defineProperty(window, 'screenX', { value: x, configurable: true });
  Object.defineProperty(window, 'screenY', { value: y, configurable: true });
}

describe('the Media workspace presentation store', () => {
  beforeEach(() => {
    localStorage.clear();
    setRect(1280, 860, 320, 86);
  });

  it('absence is conventional, and is not stored as a standard blob', () => {
    // Decision: clearing REMOVES the key. Two states that must be
    // indistinguishable — never toggled, and toggled back — are what makes the
    // round trip byte-identical rather than merely equivalent.
    expect(readWorkspacePresentation()).toBeUndefined();
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).toBeNull();

    const on = toggleWorkspacePresentation(undefined);
    expect(on?.mode).toBe('liquid');
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).not.toBeNull();

    const off = toggleWorkspacePresentation(on);
    expect(off).toBeUndefined();
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).toBeNull();
  });

  it('the enter stores the LIVE rect, never a clamped 1x1', () => {
    /**
     * The regression this exists for is recorded in `liquidWindowPresentation.ts`
     * and was found on disk, not in a test: the pop-out and the reader each
     * clamped an unmeasurable size with `Math.max(1, …)`, `parseRect` rejects
     * `w <= 0`, and 1 is the smallest value that clears it — so the clamp
     * STEPPED OVER the guard and stored a geometry nothing can come back to.
     */
    const state = toggleWorkspacePresentation(undefined);
    expect(state?.standardRect).toEqual({ x: 320, y: 86, w: 1280, h: 860 });
    expect(state?.standardRect).not.toEqual({ x: 0, y: 0, w: 1, h: 1 });
  });

  it('an unmeasurable rect REFUSES the enter rather than storing a fake one', () => {
    setRect(0, 0);
    Object.defineProperty(window, 'innerWidth', { value: 0, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 0, configurable: true });
    expect(toggleWorkspacePresentation(undefined)).toBeUndefined();
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).toBeNull();
    // ...and the RETURN never needs one: the rect is already inside the blob.
    Object.defineProperty(window, 'innerWidth', { value: 1264, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 821, configurable: true });
  });

  it('a blob the schema cannot vouch for reads as conventional, not as half liquid', () => {
    for (const bad of ['{"mode":"liquid"}', '{"mode":"nonsense"}', 'not json', '[]', 'null']) {
      localStorage.setItem(WORKSPACE_PRESENTATION_KEY, bad);
      expect(readWorkspacePresentation(), bad).toBeUndefined();
    }
  });

  it('a write that throws costs the toggle nothing', () => {
    const setItem = vi
      .spyOn(Storage.prototype, 'setItem')
      .mockImplementation(() => {
        throw new Error('QuotaExceededError');
      });
    try {
      expect(() => writeWorkspacePresentation({
        mode: 'liquid',
        standardRect: { x: 0, y: 0, w: 100, h: 100 },
      })).not.toThrow();
    } finally {
      setItem.mockRestore();
    }
  });

  it('write(read()) after a full round trip leaves storage byte-identical', () => {
    const before = localStorage.getItem(WORKSPACE_PRESENTATION_KEY);
    const on = toggleWorkspacePresentation(undefined);
    const stored = localStorage.getItem(WORKSPACE_PRESENTATION_KEY);
    writeWorkspacePresentation(readWorkspacePresentation());
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).toBe(stored);
    toggleWorkspacePresentation(on);
    expect(localStorage.getItem(WORKSPACE_PRESENTATION_KEY)).toBe(before);
  });
});

describe('the workspace host is wired to the sheet', () => {
  const HOSTS =
    ':is(.fwin.fwin-liquid, .popout-root.popout-liquid, .reader.reader-liquid, .seanime-host.workspace-liquid)';

  it('the overlay renders the opt-in class and data-presentation', () => {
    const source = src('src/media/MediaWorkspaceHost.tsx');
    expect(source).toMatch(/presentation\.liquid \? ' workspace-liquid' : ''/);
    expect(source).toMatch(/data-presentation=\{presentation\.dataPresentation\}/);
    expect(source).toMatch(/useWorkspacePresentation\(\)/);
  });

  it('the bar routes through the shared contextual primitive and keeps its landmark', () => {
    /**
     * `as="header"` and not a bare div, for the reason the reader's own pin
     * gives: the rubric classifier's landmark list is what makes this the region
     * Liquid is FOR, and a `div.lq-contextual` would pass the harness while
     * telling assistive tech nothing. Category 3 scores `eligibleTotal: 0` — an
     * unscoreable surface, not a badly scoring one — when no region declares it.
     */
    const source = src('src/media/MediaWorkspaceHost.tsx');
    expect(source).toMatch(/<ContextualSurface as="header" className="seanime-host-bar">/);
    expect(source).toMatch(
      /import \{ ContextualSurface \} from '\.\.\/renderer\/components\/liquid\/LiquidSurface'/,
    );
    // §2 non-negotiable 1: the strip must not carry its own translucency, or a
    // conventional workspace stops rendering the conventional pixels.
    expect(source).not.toMatch(/backdrop-filter/);
  });

  it('the toggle is reversible from the same chrome that entered it', () => {
    // An enable flow whose disable path lives somewhere else is one-way from
    // inside the surface that entered it — the plan's reversibility clause.
    const source = src('src/media/MediaWorkspaceHost.tsx');
    expect(source).toMatch(/aria-pressed=\{presentation\.liquid\}/);
    expect(source).toMatch(/onClick=\{presentation\.toggle\}/);
    expect(source).toMatch(
      /presentation\.liquid[\s\S]{0,80}t\('desktop\.returnToStandard'\)[\s\S]{0,60}t\('desktop\.makeLiquid'\)/,
    );
    // Reuses the other three hosts' strings, so four hosts cannot drift apart —
    // and adds no key to the four catalogs.
    expect(source).not.toMatch(/'(Make Liquid|Return to standard)'/);
  });

  it('the sheet paints the interior on the workspace and the frame on nothing', () => {
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const region of ['.lq-contextual', '.agent-rail.lq-contextual', '.dict-view']) {
      expect(sheet, region).toContain(`${HOSTS} ${region}`);
    }
    /**
     * NEGATIVE, and the reason the widening was not a blanket find-and-replace.
     * `.seanime-host` is `inset: 0` and OPAQUE ON PURPOSE — its own comment in
     * `styles.css` records that everything numbered below it must be hidden
     * rather than merely behind. A `backdrop-filter` there would sample the
     * desktop compositor and paint nothing (inert glass that still measures as a
     * pass), and a translucent fill would put the desktop grid back on screen
     * underneath an `aria-modal` dialog.
     */
    expect(sheet).not.toMatch(/\.seanime-host\.workspace-liquid\s*\{/);
    expect(sheet).not.toMatch(/seanime-host-body/);
    expect(sheet).not.toMatch(/seanime-host-pane/);
  });

  it('the bar takes the flush-strip exception, not the floating card', () => {
    // It meets three of the overlay's four edges. The card geometry would round
    // it against all four and drop a shadow into a seam nothing can see — the
    // same exception `.medialib-rail` takes, host-scoped so a conventional
    // workspace is untouched.
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sheet).toContain(`${HOSTS} .seanime-host-bar.lq-contextual`);
    const block = sheet.slice(sheet.indexOf('.seanime-host-bar.lq-contextual'));
    const body = block.slice(block.indexOf('{'), block.indexOf('}'));
    for (const decl of ['border-radius: 0', 'border-width: 0 0 1px 0', 'box-shadow: none']) {
      expect(body, decl).toContain(decl);
    }
  });

  it('the toggle shares the measured accent fill rather than restating it', () => {
    // The 16% fill is a contrast sweep across thirteen palettes, recorded in the
    // sheet. A fourth rule for a fourth host is a fourth measurement waiting to
    // disagree with the first three.
    const sheet = src('src/renderer/theme/liquid-window.css').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(sheet).toMatch(
      /\.reader-btn-liquid\.is-liquid,\s*\.seanime-host-liquid\.is-liquid\s*\{/,
    );
    expect(sheet.match(/\.seanime-host-liquid/g)?.length).toBe(2);
  });
});
