// @vitest-environment jsdom
/**
 * L6's Gate on its fourth surface — the Immersion browser. A RUN of
 * `helpers/readingCanvasSurface`: no plumbing, no new probe.
 *
 * This surface's defect is a degree worse than the first three, and the
 * difference is worth naming because it changes what the regression latch has to
 * watch. Captures and Library were broken by a `@media` query that reads the
 * WINDOW and so never fired inside a pane. `.immersion-rail` had no responsive
 * rule AT ALL — `width: 220px; flex-shrink: 0` beside a `flex: 1` stage. There
 * was no query to fire, so the stage absorbed the whole shortfall at every width:
 * at a 500px body it was left 280px, below the 384 floor the rest of L6 holds,
 * with a real web page reflowing inside it.
 *
 * FILL policy, not the prose default. The document here is the stage, and in
 * `live` mode that stage is an Electron `<webview>` whose guest lays itself out;
 * a 760px measure clamp would letterbox a browser. Reader Mode brings its own
 * measure one level down (`.immersion-reader` is `max-width: 42rem; margin: 0
 * auto`), so the prose half of the Gate is owned by the element that renders the
 * prose. The `--lq-reading-measure: none` assertion below is what proves the fill
 * policy is actually the one in force rather than the default.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import {
  createReadingSurfaceHarness,
  expectDismissRestoresDocument,
  expectPlacement,
  expectToolSurvivesPlacementChange,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SITES = {
  sites: [
    { id: 's-1', url: 'https://www3.nhk.or.jp/news/', title: 'NHK ニュース', lang: 'ja', visitCount: 12, favorite: true, lastVisit: 1_700_000_000_000 },
    { id: 's-2', url: 'https://note.com/', title: 'note', lang: 'ja', visitCount: 3, favorite: false, lastVisit: 1_700_000_001_000 },
  ],
};

const TOGGLE = '.immersion-sites-toggle';

let harness: ReadingSurfaceHarness | null = null;

async function mountImmersion(width: number): Promise<ReadingSurfaceHarness> {
  // Imported dynamically, after the `window.api` stub exists: `useImmersion`
  // reaches for it inside a mount effect, but the modules this view pulls in
  // touch it at module-eval time.
  const { default: ImmersionView } = await import('../views/ImmersionView');
  harness = createReadingSurfaceHarness({
    render: () => createElement(ImmersionView),
    ready: (container) => container.querySelector('.lq-reading.immersion-body') !== null,
  });
  await harness.mount(width);
  return harness;
}

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    immersionListSites: async () => SITES,
    onImmersionSitesChanged: () => () => undefined,
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the Immersion browser through the L6 reading canvas', () => {
  it('renders the immersion body as the canvas, under the fill policy', async () => {
    const h = await mountImmersion(1200);
    const canvas = h.container.querySelector<HTMLElement>('.immersion-body');
    expect(canvas).not.toBe(null);
    expect(canvas!.classList.contains('lq-reading')).toBe(true);
    // A bounded stage, not a page-scrolled catalogue: the guest page scrolls
    // inside the webview, and the shell column around it does not move.
    expect(canvas!.dataset.scroll).toBe('contained');
    // The fill policy, observable: an infinite `maxContentWidth` emits `none`
    // rather than a pixel clamp, so a `<webview>` is never letterboxed.
    expect(h.doc().style.getPropertyValue('--lq-reading-measure')).toBe('none');
  });

  it('docks the sites rail beside the stage on a wide canvas', async () => {
    const h = await mountImmersion(1200);
    // 1200 - 220 - 12 gutter. The stage keeps 968, far above its 384 floor.
    expectPlacement(h, 'sites', { placement: 'docked', contentWidth: 968, toolWidth: 220 });
    expect(h.container.querySelectorAll('.immersion-site-row').length).toBe(2);
  });

  it('gives the stage the whole pane at the width the old rule could not see', async () => {
    // The case `width: 220px; flex-shrink: 0` got wrong at EVERY window size,
    // because there was no query that could have fired: 500 - 12 - 384 = 104,
    // under the rail's 180 floor, so the rail is a sheet and the stage keeps
    // all 500 rather than being squeezed to 280.
    const h = await mountImmersion(500);
    expectPlacement(h, 'sites', { placement: 'sheet', contentWidth: 500 });
    await expectDismissRestoresDocument(h, 'sites');
  });

  it('keeps the rail subtree when the canvas narrows under it', async () => {
    // The rail is windowed -- 20 rendered rows of 883 after 5c477856 -- so its
    // scroll offset IS the user's place in it, and a remount is a jump to the top.
    const h = await mountImmersion(1200);
    await expectToolSurvivesPlacementChange(h, 'sites', { docked: 1200, sheet: 500 });
  });

  it('docks at exactly the width where the rail still fits, and not below it', async () => {
    // The boundary, both sides, because a floor asserted only from far away is
    // not asserted. 576 - 12 - 384 = 180, exactly the rail's minimum: it docks
    // at 180 rather than its preferred 220, and the stage keeps precisely 384.
    const h = await mountImmersion(576);
    expectPlacement(h, 'sites', { placement: 'docked', contentWidth: 384, toolWidth: 180 });
    // One pixel narrower there is no longer room, and the answer is a sheet
    // rather than a 179px column of wrapped site titles.
    await h.resize(575);
    expectPlacement(h, 'sites', { placement: 'sheet', contentWidth: 575 });
  });

  it('places no tool when the rail is closed, however wide the canvas is', async () => {
    // The negative control: the canvas is measured at a width that docks
    // comfortably, and it still places nothing, because the user closed the
    // rail. A surface that rendered a tool here would be inventing one.
    const h = await mountImmersion(1200);
    expect(h.tool('sites')).not.toBe(null);
    await h.click(TOGGLE);
    expect(h.tool('sites')).toBe(null);
    expect(h.doc().hasAttribute('inert')).toBe(false);
    // The stage takes the width back rather than leaving a 232px hole.
    expect(h.doc().dataset.contentWidth).toBe('1200');
  });

  it('reports the tool state on the toolbar trigger, and reopens from it', async () => {
    const h = await mountImmersion(1200);
    const toggle = h.container.querySelector<HTMLButtonElement>(TOGGLE)!;
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await h.click(TOGGLE);
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await h.click(TOGGLE);
    expect(h.tool('sites')!.dataset.placement).toBe('docked');
    expect(h.container.querySelectorAll('.immersion-site-row').length).toBe(2);
  });

  /**
   * L6's Gate, "no tool obscures the document", in the direction the first four
   * surfaces could not see: not a tool over the document, but a control of the
   * HOST floated over whatever the canvas placed there.
   *
   * Found by running the category-4 harness live rather than by reading, and both
   * placements were broken. `.visual-novel-open` was `position: absolute; right:
   * 12px; top: 46px; z-index: 4` on `.immersion-root`, a SIBLING of the canvas,
   * so nothing the canvas did could get out from under it:
   *   - sheet, canvas 342 px — button 409,240 136x26 inside a sheet of 215,238
   *     342x469, on its header, `elementFromPoint` at the button's centre
   *     returning the button while the document was `inert`;
   *   - docked, canvas 550 px — button 849,240 136x26 over a rail of 777,238
   *     220x469, overlapping the rail's close control (952,247 32x32) by 32x19,
   *     and `elementFromPoint` at that control's own centre returned `button.btn`.
   *     The rail's × was DEAD, in the surface's default state.
   *
   * jsdom lays nothing out, so a rect assertion here would compare two zeroes.
   * What it can hold is the structural fact that makes the collision impossible
   * at every width — the control is in the toolbar row, not in the overlay layer
   * beside the canvas — and the stylesheet no longer carries the rule that put it
   * there.
   */
  it('keeps the Visual Novel control in the toolbar row at every placement', async () => {
    const h = await mountImmersion(1200);
    const vnButton = () => h.container.querySelector('.visual-novel-open');
    expectPlacement(h, 'sites', { placement: 'docked', contentWidth: 968, toolWidth: 220 });
    // Present at all — the half of the assertion that stops the fix from being
    // "delete the button".
    expect(vnButton()).not.toBe(null);
    // …and inside the toolbar, not a floating sibling of `.lq-reading`.
    expect(vnButton()!.closest('.immersion-toolbar')).not.toBe(null);
    expect(vnButton()!.closest('.lq-reading')).toBe(null);
    // A label, not a bare glyph: it is an icon button now.
    expect(vnButton()!.getAttribute('aria-label')).toBeTruthy();

    // The placement that used to put it on a sheet header over an inert document.
    await h.resize(500);
    expectPlacement(h, 'sites', { placement: 'sheet', contentWidth: 500 });
    expect(h.doc().hasAttribute('inert')).toBe(true);
    expect(vnButton()!.closest('.immersion-toolbar')).not.toBe(null);
    // The sheet does not contain it, and — the point of the whole slice — the
    // toolbar it does live in is outside the canvas entirely.
    expect(h.tool('sites')!.contains(vnButton())).toBe(false);
    expect(h.container.querySelector('.lq-reading')!.contains(vnButton())).toBe(false);
  });

  it('has no absolute positioning left on the Visual Novel control to float it back over the canvas', () => {
    // Comments are stripped first: the replacement comment quotes the deleted
    // declarations verbatim, so an un-stripped read passes for the wrong reason.
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(css).not.toMatch(/^\.visual-novel-open\s*\{/m);
  });

  it('has no fixed rail width left in the stylesheet to reintroduce the bug', () => {
    // Comments are stripped first: the replacement comment quotes the deleted
    // declarations verbatim, so an un-stripped read passes for the wrong reason.
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    const rule = /^\.immersion-rail \{([^}]*)\}/m.exec(css);
    expect(rule, '.immersion-rail rule not found').not.toBe(null);
    expect(rule![1]).not.toMatch(/\bwidth\s*:/);
    expect(rule![1]).not.toMatch(/flex-shrink/);
    // `.immersion-body` no longer lays the row out either; `readingCanvas.css` does.
    const body = /^\.immersion-body \{([^}]*)\}/m.exec(css);
    expect(body, '.immersion-body rule not found').not.toBe(null);
    expect(body![1]).not.toMatch(/display\s*:\s*flex/);
  });
});

/**
 * The toolbar's two history buttons, which the category-8 sweep scored as MUTE
 * PAIRS: greyed out from the moment the surface mounts, icon-only, and carrying
 * `title="Back"` / `title="Forward"` — a name, never a reason.
 *
 * The fix hands `title` over to the reason while disabled, which would have
 * taken the accessible name with it on an icon-only button, so `aria-label` now
 * holds the name independently. Both halves are asserted here: a run that only
 * checked the title would pass a regression that left these buttons nameless.
 *
 * A RUN of the harness above, not a new one — the mount, the `window.api` stub
 * and the teardown are all shared with the Gate tests in this file.
 */
describe('the Immersion toolbar names why its history buttons are disabled', () => {
  it('carries a reason in title and the label in aria-label while disabled', async () => {
    const h = await mountImmersion(1200);
    const nav = [...h.container.querySelectorAll('.immersion-toolbar .icon-btn')]
      .filter((b): b is HTMLButtonElement => b instanceof HTMLButtonElement && b.disabled);
    // FOUR since 2026-08-26, not two. History starts empty on mount AND no page is
    // open, so Back, Forward, Reload and Close page are all disabled — the last two
    // by the same absent page. The loop below is what actually matters: every one of
    // them must explain itself and keep its name, however many there are.
    expect(nav.length, 'expected Back, Forward, Reload and Close page disabled on a fresh mount').toBe(4);
    for (const button of nav) {
      const title = button.getAttribute('title') ?? '';
      const label = button.getAttribute('aria-label') ?? '';
      expect(label, 'an icon-only button lost its accessible name').not.toBe('');
      expect(title, 'the title is still the label, not the reason').not.toBe(label);
      // The category-8 harness's own bar for what counts as an explanation.
      expect(title.length, `"${title}" is too short to be an explanation`)
        .toBeGreaterThanOrEqual(12);
    }
  });

  it('gives Reload the same reason treatment, because it is disabled with nothing to reload', async () => {
    const h = await mountImmersion(1200);
    // By position, not by label: the toolbar carries a dozen more `.icon-btn`
    // further along (save, capture, lens, rail) and their labels are localised.
    // Back, Forward, Reload and Close page are its first four direct children.
    const nav = [...h.container.querySelectorAll('.immersion-toolbar > .icon-btn')];
    expect(nav.length, 'the toolbar lost its icon buttons').toBeGreaterThanOrEqual(4);
    const reload = nav[2] as HTMLButtonElement;
    // REVISED 2026-08-26. This used to assert `disabled === false` and read "because
    // it is never disabled" — which described the shipped code rather than a decision.
    // `reload()` starts `if (!currentUrl) return;`, so in the starter state it was an
    // enabled control that did nothing and said nothing: the exact category-8 defect
    // its two neighbours had just been fixed for.
    expect(reload.disabled, 'Reload does nothing without a page, so it says so').toBe(true);
    expect(reload.getAttribute('aria-label')).toBe('Reload');
    expect(reload.getAttribute('title')).not.toBe(reload.getAttribute('aria-label'));
  });
});
