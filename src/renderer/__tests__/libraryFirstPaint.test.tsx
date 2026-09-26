// @vitest-environment jsdom
/**
 * The Library shows its books before any of them is scored.
 *
 * `LibraryView` used to `setItems(await enrichInboxItems(list))`: the list
 * waited for every book to be sampled and tokenized, so a 200-book shelf stayed
 * blank for 30–52 s. Here the samples never arrive at all, and the shelf must
 * still render every book; the scores fill in later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEMS = ['吾輩は猫である', '坊っちゃん', 'こころ'].map((title, i) => ({
  id: `book-${i}`,
  title,
  kind: 'book',
  createdAt: 1_700_000_000_000 + i,
  epubFile: 'original.epub',
}));

let harness: ReadingSurfaceHarness | null = null;
const sampleBookText = vi.fn(() => new Promise<string>(() => undefined));

beforeEach(() => {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => ITEMS,
    getWatchFolder: async () => null,
    getLibraryFolders: async () => [],
    onLibraryChanged: () => () => undefined,
    bookFileKeys: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `1:${id}`])),
    sampleBookText,
    updateLevelMetaMany: async () => [],
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
});

describe('Library first paint', () => {
  it('renders every book while their level samples are still pending', async () => {
    const { default: LibraryView } = await import('../views/LibraryView');
    harness = createReadingSurfaceHarness({
      render: () => createElement(LibraryView, { onOpen: () => undefined }),
      ready: (container) => ITEMS.every((it) => container.textContent?.includes(it.title)),
    });
    await harness.mount(1200);
    for (const it of ITEMS) expect(harness.container.textContent).toContain(it.title);
    // Scoring did start — it just is not what the list waits for.
    await harness.flush();
    await new Promise((r) => setTimeout(r, 50));
    expect(sampleBookText).toHaveBeenCalled();
    expect(sampleBookText.mock.calls[0][1]).toBe(2_000);
  });
});
