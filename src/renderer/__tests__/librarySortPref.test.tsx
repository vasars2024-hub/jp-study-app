// @vitest-environment jsdom
/**
 * The Library remembers its sort choice between visits: pick "Title", leave,
 * come back, and the list is still sorted by title (it used to reset to
 * "newest first" on every mount).
 */
import { act, createElement } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_SORT_STORAGE_KEY,
  readLibrarySort,
  writeLibrarySort,
  type LibrarySort,
} from '../librarySortPref';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeEach(() => localStorage.clear());

describe('librarySortPref', () => {
  it('defaults to newest first', () => {
    expect(readLibrarySort()).toBe(DEFAULT_LIBRARY_SORT);
    expect(DEFAULT_LIBRARY_SORT).toBe('date-desc');
  });

  it('round-trips a choice', () => {
    expect(writeLibrarySort('title')).toBe(true);
    expect(localStorage.getItem(LIBRARY_SORT_STORAGE_KEY)).toBe('title');
    expect(readLibrarySort()).toBe('title');
  });

  it('ignores an unknown stored or written value', () => {
    localStorage.setItem(LIBRARY_SORT_STORAGE_KEY, 'by-mood');
    expect(readLibrarySort()).toBe(DEFAULT_LIBRARY_SORT);
    expect(writeLibrarySort('by-mood' as LibrarySort)).toBe(false);
    expect(localStorage.getItem(LIBRARY_SORT_STORAGE_KEY)).toBe('by-mood');
  });

  it('falls back to the default when storage is denied', () => {
    const spy = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied');
    });
    try {
      expect(readLibrarySort()).toBe(DEFAULT_LIBRARY_SORT);
    } finally {
      spy.mockRestore();
    }
  });
});

const BOOKS = ['こころ', '吾輩は猫である', '坊っちゃん'].map((title, i) => ({
  id: `book-${i}`,
  title,
  kind: 'book',
  createdAt: 1_700_000_000_000 + i,
  epubFile: 'original.epub',
}));

let harness: ReadingSurfaceHarness | null = null;

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function mountLibrary(): Promise<ReadingSurfaceHarness> {
  installResizeObserver();
  installReadingSurfaceApi({
    syncLibrary: async () => BOOKS,
    getWatchFolder: async () => null,
    getLibraryFolders: async () => [],
    onLibraryChanged: () => () => undefined,
    bookFileKeys: async (ids: string[]) => Object.fromEntries(ids.map((id) => [id, `1:${id}`])),
    sampleBookText: () => new Promise<string>(() => undefined),
    updateLevelMetaMany: async () => [],
  });
  const { default: LibraryView } = await import('../views/LibraryView');
  const h = createReadingSurfaceHarness({
    render: () => createElement(LibraryView, { onOpen: () => undefined }),
    ready: (container) => BOOKS.every((b) => container.textContent?.includes(b.title)),
  });
  await h.mount(1200);
  return h;
}

function sortSelect(container: Element): HTMLSelectElement {
  const select = container.querySelector<HTMLSelectElement>('#lib-sort, #aero-lib-sort');
  if (!select) throw new Error('no sort picker');
  return select;
}

describe('LibraryView sort is remembered between visits', () => {
  it('a sort picked on one visit is the sort of the next', async () => {
    harness = await mountLibrary();
    const first = sortSelect(harness.container);
    expect(first.value).toBe('date-desc');
    await act(async () => {
      first.value = 'title';
      first.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(sortSelect(harness.container).value).toBe('title');
    expect(localStorage.getItem(LIBRARY_SORT_STORAGE_KEY)).toBe('title');
    harness.teardown();
    harness = null;
    document.body.replaceChildren();

    harness = await mountLibrary();
    expect(sortSelect(harness.container).value).toBe('title');
  });
});
