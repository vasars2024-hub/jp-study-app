// @vitest-environment jsdom
/**
 * The index over the capture history — search, source chips, sort order.
 *
 * `lensHistoryList` returns up to 60 rows and Captures rendered every one of
 * them in capture order with no way to reach a particular passage except
 * scrolling; measured live at 42 stored captures. Settings already searched the
 * same store, so the surface that is FOR reading a captured passage was the one
 * place without an index.
 *
 * Four properties hold this together, and each has cost this repo a defect
 * somewhere else:
 *
 *  1. filtering narrows the LIST and never the reader. A capture you are in the
 *     middle of reading survives a search that excludes it, because `selected`
 *     resolves against every row rather than the visible projection;
 *  2. a filtered-to-nothing list says so, and says how many captures are behind
 *     the filter. "Nothing captured yet" there would be the same confident lie
 *     `readingCapturesStates.test.tsx` exists to prevent, aimed at a different
 *     cause;
 *  3. a source chip is only offered when it can return something — the rule the
 *     Library's eleven dead filter chips were removed under;
 *  4. sort reorders the projection and leaves identity alone, so a flip cannot
 *     move the selection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import type { ReadingLensHistoryEntry } from '../../shared/readingLensHistory';
import ReadingCapturesView from '../views/ReadingCapturesView';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const entry = (
  id: string,
  source: string,
  sourceLabel: string,
  text: string,
  capturedAt: number,
): ReadingLensHistoryEntry =>
  ({ captureId: id, text, source, sourceLabel, capturedAt } as ReadingLensHistoryEntry);

/** Three sources, so "only what can match" is distinguishable from "everything". */
const ENTRIES: ReadingLensHistoryEntry[] = [
  entry('cap-1', 'screen', 'Screen', '彼は図書館で本を読んでいた。', 1_700_000_003_000),
  entry('cap-2', 'clipboard', 'Clipboard', 'コーヒーを飲みながら待つ。', 1_700_000_002_000),
  entry('cap-3', 'screen', 'Screen', '駅前の書店に寄った。', 1_700_000_001_000),
];

const LOADING = 'Loading captures…';
const EMPTY = 'Nothing captured yet.';

let harness: ReadingSurfaceHarness | null = null;

async function mount(entries: ReadingLensHistoryEntry[]): Promise<ReadingSurfaceHarness> {
  installReadingSurfaceApi({ lensHistoryList: () => Promise.resolve(entries) });
  harness = createReadingSurfaceHarness({
    render: () => <ReadingCapturesView passage={null} />,
    ready: (container) => !(container.textContent ?? '').includes(LOADING),
  });
  await harness.mount(1200);
  return harness;
}

const titles = (h: ReadingSurfaceHarness): string[] =>
  [...h.container.querySelectorAll('.reading-captures-row-title')].map((e) => e.textContent ?? '');
const chips = (h: ReadingSurfaceHarness): string[] =>
  [...h.container.querySelectorAll('.reading-captures-chip')].map((e) => e.textContent ?? '');
const readerHead = (h: ReadingSurfaceHarness): string =>
  h.container.querySelector('.reading-captures-reader-head h2')?.textContent ?? '';

/** Type into the search field the way React's onChange sees it. */
async function search(h: ReadingSurfaceHarness, value: string): Promise<void> {
  const input = h.container.querySelector<HTMLInputElement>('.reading-captures-search');
  if (!input) throw new Error('no search field');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await h.flush();
}

beforeEach(() => {
  installResizeObserver();
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  vi.restoreAllMocks();
});

describe('Captures index', () => {
  it('narrows the list on a search and leaves the reader where it was', async () => {
    const h = await mount(ENTRIES);
    expect(titles(h)).toHaveLength(3);
    const before = readerHead(h);

    await search(h, '書店');

    expect(titles(h)).toHaveLength(1);
    // The filter is over the index, not the passage. A capture being read is not
    // thrown away because it stopped matching.
    expect(readerHead(h)).toBe(before);
  });

  it('says no capture matches and offers the way out, rather than claiming an empty store', async () => {
    const h = await mount(ENTRIES);

    await search(h, 'ぜったいにない');

    expect(titles(h)).toHaveLength(0);
    const note = h.container.textContent ?? '';
    expect(note).toContain('No capture matches this filter');
    // The count is the whole point of the sentence: 3 captures are still there.
    expect(note).toContain('3');
    expect(note).not.toContain(EMPTY);

    await h.click('.reading-captures-clear');
    expect(titles(h)).toHaveLength(3);
  });

  it('offers a chip only for a source that is actually present', async () => {
    const h = await mount(ENTRIES);
    // All sources + screen + clipboard. `image` and `text` exist in the lens'
    // vocabulary and must NOT appear: a chip that can only return nothing is a
    // dead control, not a filter.
    expect(chips(h)).toEqual(['All sources', 'Screen', 'Clipboard']);

    await h.click('.reading-captures-chip', 2);
    expect(titles(h)).toHaveLength(1);

    await h.click('.reading-captures-chip', 0);
    expect(titles(h)).toHaveLength(3);
  });

  it('keeps the disclosure collapsed so the default view is not the clutter', async () => {
    const h = await mount(ENTRIES);
    const details = h.container.querySelector<HTMLDetailsElement>('.reading-captures-more');
    expect(details).not.toBe(null);
    expect(details?.open).toBe(false);
  });

  it('flips the order without touching identity or selection', async () => {
    const h = await mount(ENTRIES);
    expect(titles(h)).toEqual(['Screen', 'Clipboard', 'Screen']);
    const before = readerHead(h);

    const select = h.container.querySelector<HTMLSelectElement>('.reading-captures-order select');
    if (!select) throw new Error('no order control');
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value')?.set;
      setter?.call(select, 'oldest');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await h.flush();

    // Same three rows, reversed — a sort, not a filter.
    expect(h.container.querySelectorAll('.reading-captures-row')).toHaveLength(3);
    expect(readerHead(h)).toBe(before);
  });

  it('renders no index at all when there is nothing to index', async () => {
    const h = await mount([]);
    expect(h.container.querySelector('.reading-captures-filter')).toBe(null);
    expect(h.container.textContent ?? '').toContain(EMPTY);
  });
});
