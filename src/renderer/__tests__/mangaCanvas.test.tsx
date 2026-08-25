// @vitest-environment jsdom
/**
 * L6's Gate on its fifth and last reading surface — the manga reader. A RUN of
 * `helpers/readingCanvasSurface`: no plumbing, no new probe, no new harness.
 *
 * THE DEFECT HERE IS NOT THE ONE IT LOOKS LIKE, and the distinction is the whole
 * reason this file exists. `.ocr-panel` was `position: fixed; right: 0; width:
 * min(380px, 44vw)` over a `.manga-stage` that never inset for it, which reads
 * like a cover — and a live probe REFUTED that: `overlapWithPage` was 0 and
 * `elementFromPoint` under the panel returned the page image, because that page
 * was height-bound. What is actually wrong is that the reader MIS-MEASURES.
 * `stageSize` is `stageRef.current.clientWidth`, fed straight to
 * `mangaPageFitStyles`; with the panel over the stage that width included the
 * ~300px behind the panel, so at a 1264px reader the fit math emitted
 * `max-width: 1264px` for 964px of visible stage and centred the page at 632
 * against a visible centre of 482 — 150px off-centre, toward the panel. Any page
 * wider than the visible strip then is a real cover.
 *
 * So the assertion that matters below is a STRUCTURAL one — the stage lives
 * inside the document region and the tool is its sibling — plus the
 * `data-content-width` the resolver hands it. jsdom lays nothing out, so the
 * pixel half is measured live through the bridge and recorded in
 * `L6_READING_ECOSYSTEM.md`; asserting a clientWidth here would be asserting 0.
 *
 * FILL policy, like Novels and Immersion: a manga page has its own aspect and
 * the user sets its width in this reader's own settings (`pageFit`,
 * `maxPageWidthPct`, zoom). A 760px prose clamp would letterbox every page.
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
import type { LibraryItem } from '../../shared/types';
import type { MokuroPage } from '../../shared/mokuroTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM: LibraryItem = {
  id: 'manga-1',
  title: 'ワンパンマン 01',
  kind: 'manga',
  createdAt: 1_700_000_000_000,
  pageCount: 3,
};

const PAGES = ['media://p/000.jpg', 'media://p/001.jpg', 'media://p/002.jpg'];

/** A real two-block page, so `ocrStatus` lands on `done` rather than `error`. */
const PAGE: MokuroPage = {
  version: '1.01',
  img_width: 1114,
  img_height: 1600,
  blocks: [
    { box: [820, 120, 980, 460], vertical: true, lines: ['サイタマ', 'だろ'], regionId: 'r1', kind: 'text' },
    { box: [180, 900, 340, 1240], vertical: true, lines: ['ワンパン'], regionId: 'r2', kind: 'text' },
  ],
};

const TOGGLE = '.manga-ocr-toggle';
const TOOL = 'manga-ocr';

let harness: ReadingSurfaceHarness | null = null;

async function mountReader(width: number): Promise<ReadingSurfaceHarness> {
  // Dynamic, after the stub: this view pulls in `keyboardShortcuts` and
  // `DictionaryPopup`, both of which touch `window.api` at module-eval time.
  const { default: MangaReader } = await import('../views/MangaReader');
  harness = createReadingSurfaceHarness({
    render: () => createElement(MangaReader, { item: ITEM, onClose: () => undefined }),
    ready: (container) => container.querySelector('.manga-stage') !== null,
  });
  await harness.mount(width);
  return harness;
}

/** Opening the panel is a scan; there is no separate "show panel" control. */
async function openOcrPanel(h: ReadingSurfaceHarness): Promise<void> {
  await h.click(TOGGLE);
  await h.flush();
}

beforeEach(() => {
  installResizeObserver();
  /*
   * `autoTranslate` ships ON, and it makes the reader scan the first page by
   * itself — so with the default settings the panel is already open at mount and
   * "the user has not opened it" is not a state this surface has. The negative
   * control needs that state to exist, so it is turned off here and the panel is
   * opened by the click the shipped app uses. Everything else stays default.
   */
  localStorage.setItem('jp-manga-reader-settings', JSON.stringify({ autoTranslate: false }));
  installReadingSurfaceApi({
    getMangaPages: async () => PAGES,
    mangaOcrAvailable: async () => true,
    mangaOcrScanPage: async () => PAGE,
    onAssetStatus: () => () => undefined,
    // `useAssetInstalled` destructures this, so the inert `null` is not enough.
    // Empty rather than populated on purpose: the four OCR models report as NOT
    // installed and `engineReady` still comes from `mangaOcrAvailable`, which is
    // the branch the shipped app takes when the models live outside the store.
    assetsList: async () => ({ statuses: [] }),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('the manga reader through the L6 reading canvas', () => {
  it('renders the stage inside the canvas document region, under the fill policy', async () => {
    const h = await mountReader(1200);
    const canvas = h.container.querySelector<HTMLElement>('.manga-canvas');
    expect(canvas).not.toBe(null);
    expect(canvas!.classList.contains('lq-reading')).toBe(true);
    // A bounded stage: the page scrolls inside it, the reader column does not.
    expect(canvas!.dataset.scroll).toBe('contained');
    // The fill policy, observable: an infinite `maxContentWidth` emits `none`
    // rather than a pixel clamp, so no page is letterboxed by the canvas.
    expect(h.doc().style.getPropertyValue('--lq-reading-measure')).toBe('none');
  });

  it('keeps the stage a descendant of the document region, not a sibling of the tool', async () => {
    // The structural form of the mis-measure fix. `stageSize` is read off this
    // node's own box, so it has to be the node the resolver sized — if the
    // stage were a sibling of the tool, or the tool were fixed over it again,
    // this reader would measure width it does not have.
    const h = await mountReader(1200);
    await openOcrPanel(h);
    const stage = h.container.querySelector<HTMLElement>('.manga-stage')!;
    expect(h.doc().contains(stage)).toBe(true);
    const tool = h.tool(TOOL)!;
    expect(tool.contains(stage)).toBe(false);
    expect(stage.contains(tool)).toBe(false);
  });

  it('docks the OCR panel beside the page on a wide reader', async () => {
    const h = await mountReader(1200);
    await openOcrPanel(h);
    // Overlay mode with a scanned page is the compact panel: 300 preferred,
    // which is what `min(300px, 36vw)` meant before the viewport unit went.
    // 1200 - 300 - 12 gutter leaves the stage 888, far above its 384 floor.
    expectPlacement(h, TOOL, { placement: 'docked', contentWidth: 888, toolWidth: 300 });
    expect(h.container.querySelector('.ocr-panel-content')).not.toBe(null);
  });

  it('covers the page honestly, and gives it back, when the reader is too narrow', async () => {
    // 620 - 12 - 384 = 224, under the panel's 240 floor. The old rule would have
    // put a fixed 272px panel (44vw) over a stage still measuring 620.
    const h = await mountReader(620);
    await openOcrPanel(h);
    expectPlacement(h, TOOL, { placement: 'sheet', contentWidth: 620 });
    await expectDismissRestoresDocument(h, TOOL);
  });

  it('docks at exactly the width where the panel still fits, and not one pixel below', async () => {
    // The boundary from both sides, because a floor asserted only from far away
    // is not asserted. 636 - 12 - 384 = 240, exactly the panel's minimum: it
    // docks at 240 rather than its preferred 300 and the stage keeps precisely
    // its 384 floor.
    const h = await mountReader(636);
    await openOcrPanel(h);
    expectPlacement(h, TOOL, { placement: 'docked', contentWidth: 384, toolWidth: 240 });
    await h.resize(635);
    expectPlacement(h, TOOL, { placement: 'sheet', contentWidth: 635 });
  });

  it('places no tool while the panel is closed, however wide the reader is', async () => {
    // The negative control: measured at a width that docks comfortably, and it
    // still places nothing, because the user has not scanned. A surface that
    // rendered a tool here would be inventing one.
    const h = await mountReader(1200);
    expect(h.tool(TOOL)).toBe(null);
    expect(h.doc().hasAttribute('inert')).toBe(false);
    expect(h.doc().dataset.contentWidth).toBe('1200');
    expect(h.container.querySelector('.ocr-panel-content')).toBe(null);
  });

  it('reports the panel state on the toolbar toggle, and closes from it', async () => {
    const h = await mountReader(1200);
    const toggle = h.container.querySelector<HTMLButtonElement>(TOGGLE)!;
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await openOcrPanel(h);
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await h.click(TOGGLE);
    expect(h.tool(TOOL)).toBe(null);
    expect(h.doc().dataset.contentWidth).toBe('1200');
  });

  it('has no fixed panel left in the stylesheet to reintroduce the bug', () => {
    // Comments stripped first: the replacement comment quotes the deleted
    // declarations verbatim, so an un-stripped read passes for the wrong reason.
    const css = readFileSync(resolve(__dirname, '..', 'styles.css'), 'utf8').replace(
      /\/\*[\s\S]*?\*\//g,
      '',
    );
    expect(css).not.toMatch(/^\.ocr-panel \{/m);
    expect(css).not.toMatch(/^\.ocr-panel-compact \{/m);
    const rule = /^\.ocr-panel-content \{([^}]*)\}/m.exec(css);
    expect(rule, '.ocr-panel-content rule not found').not.toBe(null);
    expect(rule![1]).not.toMatch(/position\s*:\s*fixed/);
    expect(rule![1]).not.toMatch(/\bwidth\s*:/);
    expect(rule![1]).not.toMatch(/\bvw\b/);
  });
});
