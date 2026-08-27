// @vitest-environment jsdom
/**
 * The manga reader's progressive disclosure, which is rubric category 5 Q4:
 * "are advanced tools discoverable without cluttering the default view?"
 *
 * This reader answered NO with 29 chrome controls on screen at once and ZERO
 * disclosures — a five-way view-mode segment, a zoom stepper, settings, the lens,
 * and an OCR toolbar that mixed display options, whole-volume batch jobs and
 * per-page drawing tools in one flat row. It now answers YES at 11 scanned
 * controls behind 5 collapsed disclosures (`baselines/cat5-l6-manga.json`).
 *
 * WHAT THESE TESTS DEFEND, and it is not the count. The count is measured live;
 * jsdom lays nothing out and cannot tell a painted control from a hidden one. What
 * a suite CAN hold is the two properties a relapse would break first:
 *
 *   1. every tucked control is STILL THERE and still reachable — nothing was
 *      deleted to make a number, which is the failure mode the rubric names by
 *      name ("do not delete a feature because it is absent from the concept");
 *   2. the disclosures are CLOSED at rest, because a `<details open>` is not a
 *      disclosure at all and the live scan would count its contents again.
 *
 * The view-mode menu gets a third: its summary carries the ACTIVE mode's own
 * label. A menu whose current value is only readable once you open it is the
 * defect the Immersion pass avoided by leaving its stateful toggles in the open,
 * and it would be invisible to a control count.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import {
  createReadingSurfaceHarness,
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

const PAGE: MokuroPage = {
  version: '1.01',
  img_width: 1114,
  img_height: 1600,
  blocks: [
    { box: [820, 120, 980, 460], vertical: true, lines: ['サイタマ'], regionId: 'r1', kind: 'text' },
  ],
};

let harness: ReadingSurfaceHarness | null = null;

async function mountReader(): Promise<ReadingSurfaceHarness> {
  const { default: MangaReader } = await import('../views/MangaReader');
  harness = createReadingSurfaceHarness({
    render: () => createElement(MangaReader, { item: ITEM, onClose: () => undefined }),
    ready: (container) => container.querySelector('.manga-stage') !== null,
  });
  await harness.mount(1200);
  return harness;
}

/** Opening the panel is a scan; there is no separate "show panel" control. */
async function openOcrPanel(h: ReadingSurfaceHarness): Promise<void> {
  await h.click('.manga-ocr-toggle');
  await h.flush();
}

const labels = (root: ParentNode, sel: string): string[] =>
  [...root.querySelectorAll(sel)].map((e) => (e.textContent ?? '').trim());

beforeEach(() => {
  installResizeObserver();
  localStorage.setItem('jp-manga-reader-settings', JSON.stringify({ autoTranslate: false }));
  installReadingSurfaceApi({
    getMangaPages: async () => PAGES,
    mangaOcrAvailable: async () => true,
    mangaOcrScanPage: async () => PAGE,
    onAssetStatus: () => () => undefined,
    assetsList: async () => ({ statuses: [] }),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('the manga reader tucks its adjustments behind disclosures', () => {
  it('keeps the toolbar overflow closed and holds zoom, settings and the lens inside it', async () => {
    const h = await mountReader();
    const overflow = h.container.querySelector<HTMLDetailsElement>('.reader-bar .lq-overflow');
    expect(overflow).not.toBe(null);
    expect(overflow!.open).toBe(false);

    // Still there, all three of them — the zoom stepper travelled with its own
    // readout rather than leaving a number behind with nothing to change it.
    const body = overflow!.querySelector('.lq-overflow-body')!;
    expect(body.querySelector('.sp-stepper')).not.toBe(null);
    expect(body.querySelector('.sp-value')!.textContent).toMatch(/%$/);
    expect(body.querySelectorAll('button').length).toBeGreaterThanOrEqual(4);
  });

  it('leaves transport and the presentation toggle in the open', async () => {
    // The line this reader is measured against: adjustments tuck, transport does
    // not, and the route back to a conventional window stays visible because the
    // plan's reversibility clause is worth nothing behind a menu.
    const h = await mountReader();
    const bar = h.container.querySelector('.reader-bar')!;
    const footer = h.container.querySelector('.reader-footer')!;
    expect(bar.querySelector('.manga-ocr-toggle')).not.toBe(null);
    expect(footer.querySelector('.reader-seek')).not.toBe(null);
    // First/last page jumps: two footer buttons outside any disclosure.
    expect([...footer.querySelectorAll('button')].filter((b) => !b.closest('details')).length)
      .toBeGreaterThanOrEqual(2);
    for (const el of [bar.querySelector('.manga-ocr-toggle'), footer.querySelector('.reader-seek')]) {
      expect(el!.closest('details')).toBe(null);
    }
  });

  it('marks the scan control as the surface primary', async () => {
    // The reader's only `primary` used to be "OCR and translate every page", a
    // whole-volume batch job inside the OCR panel — so the declared entry point
    // vanished the moment that group was tucked away, and Q1/Q3 fell back to a
    // palette-sensitive accent guess that answered differently in each theme.
    const h = await mountReader();
    const scan = h.container.querySelector<HTMLButtonElement>('.manga-ocr-toggle')!;
    expect(scan.className.split(' ')).toContain('primary');
  });

  it('shows the active view mode on the menu summary and keeps all five inside', async () => {
    const h = await mountReader();
    await openOcrPanel(h);
    const menu = h.container.querySelector<HTMLDetailsElement>('.manga-view-mode-switcher')!;
    expect(menu.tagName).toBe('DETAILS');
    expect(menu.open).toBe(false);

    const modes = [...menu.querySelectorAll<HTMLButtonElement>('.sp-seg-btn')];
    expect(modes).toHaveLength(5);
    const active = modes.find((b) => b.classList.contains('active'))!;
    expect(active).toBeDefined();
    expect(active.getAttribute('aria-pressed')).toBe('true');
    // The summary is the active mode, not a static word.
    expect(menu.querySelector('summary')!.textContent!.trim()).toBe(active.textContent!.trim());
  });

  it('closes the view-mode menu when a mode is chosen', async () => {
    const h = await mountReader();
    await openOcrPanel(h);
    const menu = h.container.querySelector<HTMLDetailsElement>('.manga-view-mode-switcher')!;
    menu.open = true;
    const other = [...menu.querySelectorAll<HTMLButtonElement>('.sp-seg-btn')]
      .find((b) => !b.classList.contains('active'))!;
    await h.click('.manga-view-mode-switcher .sp-seg-btn', [...menu.querySelectorAll('.sp-seg-btn')].indexOf(other));
    expect(menu.open).toBe(false);
  });

  it('groups the OCR panel into three closed groups and keeps every control', async () => {
    const h = await mountReader();
    await openOcrPanel(h);
    const groups = [...h.container.querySelectorAll<HTMLDetailsElement>('.manga-ocr-group')];
    expect(groups).toHaveLength(3);
    for (const g of groups) expect(g.open).toBe(false);

    // Nothing left the panel. The three checkboxes and the target-language
    // select are in the first group; the volume batch job and its ranges in the
    // second; handwriting, region drawing and rescan in the third.
    const [options, volume, tools] = groups;
    expect(options.querySelectorAll('input[type="checkbox"]')).toHaveLength(3);
    expect(options.querySelector('select')).not.toBe(null);
    expect(volume.querySelector('.manga-translate-range')).not.toBe(null);
    expect(volume.querySelector('.btn.primary')).not.toBe(null);
    expect(tools.querySelectorAll('button').length).toBeGreaterThanOrEqual(3);

    // And the two per-page actions the panel exists for stayed outside them.
    const loose = [...h.container.querySelectorAll('.ocr-toolbar > button')];
    expect(loose).toHaveLength(2);
    expect(labels(h.container, '.ocr-toolbar > button').every((s) => s.length > 0)).toBe(true);
  });

  it('every disclosure summary carries a non-empty label', async () => {
    // A `<summary>` with no text is a control the live scan counts and a user
    // cannot read; three of these are icon-free by design for exactly that reason.
    const h = await mountReader();
    await openOcrPanel(h);
    const summaries = [...h.container.querySelectorAll('details > summary')];
    expect(summaries.length).toBeGreaterThanOrEqual(5);
    for (const s of summaries) expect((s.textContent ?? '').trim().length).toBeGreaterThan(0);
  });
});
