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
    expect(h.container.querySelectorAll('.immersion-site-list li').length).toBe(2);
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
    expect(h.container.querySelectorAll('.immersion-site-list li').length).toBe(2);
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
