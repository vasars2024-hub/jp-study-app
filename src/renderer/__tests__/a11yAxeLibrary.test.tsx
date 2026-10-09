// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Library shelf and the
 * chrome of the two readers it opens (novel and manga): toolbar, tool triggers,
 * an opened tool, and the page stage. Mounted through the reading-surface
 * harness, which gives the canvas a width so its tools actually place.
 */
import { createElement } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import { a11yViolations } from './helpers/axeAudit';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BOOKS = ['吾輩は猫である', '坊っちゃん', 'こころ'].map((title, i) => ({
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

describe('Library and readers — axe-core', () => {
  it('the Library shelf', async () => {
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
    harness = createReadingSurfaceHarness({
      render: () => createElement(LibraryView, { onOpen: () => undefined }),
      ready: (container) => BOOKS.every((b) => container.textContent?.includes(b.title)),
    });
    await harness.mount(1200);
    expect(await a11yViolations(harness.container)).toEqual([]);
  });

  it('the novel reader chrome, with a tool open', async () => {
    installResizeObserver();
    installReadingSurfaceApi({ readBook: async () => null, setProgress: vi.fn() });
    const { default: NovelReader } = await import('../views/NovelReader');
    const item = {
      id: 'book-1', title: 'クビシメロマンチスト', kind: 'book', createdAt: 0,
      epubFile: 'original.epub', progress: { location: 'p:0:0', percent: 0 },
    } as unknown as LibraryItem;
    harness = createReadingSurfaceHarness({
      render: () => createElement(NovelReader, { item, onClose: () => undefined }),
      ready: (container) => container.querySelector('.settings-anchor') !== null,
    });
    await harness.mount(1200);
    expect(await a11yViolations(harness.container)).toEqual([]);
    await harness.click('.settings-anchor button', 0);
    expect(await a11yViolations(document.body)).toEqual([]);
  });

  it('the manga reader chrome', async () => {
    installResizeObserver();
    installReadingSurfaceApi({
      getMangaPages: async () => ['media://p/000.jpg', 'media://p/001.jpg'],
      mangaOcrAvailable: async () => false,
      onAssetStatus: () => () => undefined,
      assetsList: async () => ({ assets: [], statuses: [] }),
    });
    const { default: MangaReader } = await import('../views/MangaReader');
    const item = { id: 'manga-1', title: 'ワンパンマン 01', kind: 'manga', createdAt: 0, pageCount: 2 } as LibraryItem;
    harness = createReadingSurfaceHarness({
      render: () => createElement(MangaReader, { item, onClose: () => undefined }),
      ready: (container) => container.querySelector('.manga-stage') !== null,
    });
    await harness.mount(1200);
    expect(await a11yViolations(harness.container)).toEqual([]);
  });
});
