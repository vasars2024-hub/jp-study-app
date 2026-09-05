// @vitest-environment jsdom
/**
 * What the reader offers AFTER the passage, and why the surface needed it.
 *
 * Rubric category 4 scored Captures maximized at 1264x773 and found a **705x497
 * empty rectangle — 33.8% of the viewport against a 15% bar**: one short capture
 * and half a screen of nothing under it. The measurement is not fixable by
 * shrinking the reader, because the detector counts text and interactive nodes
 * and an emptier smaller panel leaves the identical rectangle. What it is really
 * reporting is a product gap — a reader that ends in nothing, on a surface whose
 * only other way onward is a 260px side list that a covering sheet removes
 * outright at a narrow canvas.
 *
 * So the assertions here are about the CONTRACT, not the pixels: the list is
 * derived from the visible (filtered, sorted) projection rather than from the
 * whole history, it never offers the capture already open, it rotates so the
 * last row of a list is not the one selection that gets an empty section, and
 * selecting from it actually moves the reader.
 *
 * The pixel half stays where it belongs, in the category 4 harness against the
 * running app; a jsdom mount lays nothing out and could only ever fake it.
 */
import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import ReadingCapturesView, {
  READING_CAPTURE_CONTINUE_LIMIT,
  continuationRows,
} from '../views/ReadingCapturesView';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const LOADING = 'Loading captures…';

/** `capturedAt` descends with the index, so index order IS "newest first". */
function entry(index: number): ReadingLensHistoryEntry {
  return {
    captureId: `cap-${index}`,
    text: `本文${index}\n二行目${index}`,
    source: index % 2 === 0 ? 'screen' : 'clipboard',
    sourceLabel: `Capture ${index}`,
    capturedAt: 1_700_000_000_000 - index * 1000,
  } as ReadingLensHistoryEntry;
}

const HISTORY = Array.from({ length: 12 }, (_, index) => entry(index));

let harness: ReadingSurfaceHarness | null = null;

async function mountWith(entries: ReadingLensHistoryEntry[]): Promise<ReadingSurfaceHarness> {
  installReadingSurfaceApi({ lensHistoryList: () => Promise.resolve(entries) });
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    ready: (container) => !(container.textContent ?? '').includes(LOADING),
  });
  // Wide enough that the capture list docks: a sheet covers the document and the
  // continuation would be measured on a surface the user cannot see.
  await harness.mount(1200);
  return harness;
}

const rows = (h: ReadingSurfaceHarness): HTMLElement[] => [
  ...h.container.querySelectorAll<HTMLElement>('.reading-captures-next-row'),
];

const titles = (h: ReadingSurfaceHarness): string[] =>
  rows(h).map((row) => row.querySelector('.reading-captures-next-title')?.textContent ?? '');

const openTitle = (h: ReadingSurfaceHarness): string =>
  h.container.querySelector('.reading-captures-reader-head h2')?.textContent ?? '';

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  vi.restoreAllMocks();
});

describe('continuationRows', () => {
  const projection = HISTORY.map((e) => ({
    captureId: e.captureId,
    title: e.sourceLabel,
    text: e.text,
    lines: [],
    source: e.source,
    sourceLabel: e.sourceLabel,
    capturedAt: e.capturedAt,
    live: false,
  }));

  it('starts after the selected row and never offers it back', () => {
    const out = continuationRows(projection, 'cap-3');
    expect(out).toHaveLength(READING_CAPTURE_CONTINUE_LIMIT);
    expect(out.map((r) => r.captureId)).toEqual([
      'cap-4',
      'cap-5',
      'cap-6',
      'cap-7',
      'cap-8',
      'cap-9',
      'cap-10',
      'cap-11',
    ]);
    expect(out.some((r) => r.captureId === 'cap-3')).toBe(false);
  });

  it('wraps at the end, so the last capture is not the one with nothing under it', () => {
    const out = continuationRows(projection, 'cap-11');
    expect(out.map((r) => r.captureId)).toEqual([
      'cap-0',
      'cap-1',
      'cap-2',
      'cap-3',
      'cap-4',
      'cap-5',
      'cap-6',
      'cap-7',
    ]);
  });

  it('offers nothing when there is nothing else to offer', () => {
    expect(continuationRows(projection.slice(0, 1), 'cap-0')).toEqual([]);
    expect(continuationRows([], null)).toEqual([]);
  });

  it('never exceeds the list, and stays de-duplicated on a short one', () => {
    const three = projection.slice(0, 3);
    const out = continuationRows(three, 'cap-1');
    expect(out.map((r) => r.captureId)).toEqual(['cap-2', 'cap-0']);
    expect(new Set(out.map((r) => r.captureId)).size).toBe(out.length);
  });
});

describe('the reader offers somewhere to go after the passage', () => {
  it('renders the other captures under the passage, outside the passage element', async () => {
    const h = await mountWith(HISTORY);
    expect(openTitle(h)).toBe('Capture 0');
    expect(rows(h)).toHaveLength(READING_CAPTURE_CONTINUE_LIMIT);
    expect(titles(h)[0]).toBe('Capture 1');

    // The passage stays exactly the capture. Two other suites assert this and it
    // is what keeps the continuation from being read as part of the text.
    const passage = h.container.querySelector('.reading-captures-passage')!;
    expect(passage.querySelector('.reading-captures-next')).toBeNull();
    expect(passage.textContent).toBe('本文0二行目0');

    // A preview, not just a label: the row is chosen by its content.
    expect(rows(h)[0].querySelector('.reading-captures-next-preview')?.textContent).toBe('本文1');
  });

  it('moves the reader when one is chosen', async () => {
    const h = await mountWith(HISTORY);
    await h.click('.reading-captures-next-row', 2);
    expect(openTitle(h)).toBe('Capture 3');
    // And the list re-derives around the new selection rather than freezing.
    expect(titles(h)[0]).toBe('Capture 4');
    expect(titles(h)).not.toContain('Capture 3');
  });

  it('respects the index filter, because offering a hidden capture makes it a lie', async () => {
    const h = await mountWith(HISTORY);
    const search = h.container.querySelector<HTMLInputElement>('.reading-captures-search')!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        'value',
      )!.set!;
      setter.call(search, 'Capture 1');
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await h.flush();

    // "Capture 1", "Capture 10", "Capture 11" match; the rest do not.
    const offered = titles(h);
    expect(offered.length).toBeGreaterThan(0);
    for (const title of offered) expect(title.startsWith('Capture 1')).toBe(true);
    expect(offered).not.toContain('Capture 2');
  });

  it('offers nothing at all when the history holds one capture', async () => {
    const h = await mountWith([entry(0)]);
    expect(h.container.querySelector('.reading-captures-next')).toBeNull();
    expect(rows(h)).toHaveLength(0);
  });
});
