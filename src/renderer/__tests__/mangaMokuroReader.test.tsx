// @vitest-environment jsdom
/**
 * "Import .mokuro" in the manga reader, mounted: the picked file's text reaches
 * main for this item, the outcome is said, and the page's boxes come back from
 * the cache — WITHOUT the OCR engine, which a Mokuro volume does not need.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import {
  createReadingSurfaceHarness,
  installReadingSurfaceApi,
  installResizeObserver,
  type ReadingSurfaceHarness,
} from './helpers/readingCanvasSurface';
import type { LibraryItem } from '../../shared/types';
import type { MokuroPage } from '../../shared/mokuroTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM: LibraryItem = { id: 'manga-mk', title: 'よつばと！ 01', kind: 'manga', createdAt: 1, pageCount: 2 };
const PAGES = ['media://manga-mk/001.jpg', 'media://manga-mk/002.jpg'];
const IMPORTED: MokuroPage = {
  version: '1.01',
  img_width: 1000,
  img_height: 1500,
  blocks: [{ box: [100, 100, 200, 400], vertical: true, lines: ['とーちゃん'], regionId: '001:100,100,200,400', kind: 'text' }],
};

let harness: ReadingSurfaceHarness | null = null;
let imported = false;
const importMokuro = vi.fn(async () => {
  imported = true;
  return { ok: true as const, pages: 2, unmatched: 0, matchedBy: 'name' as const };
});

beforeEach(() => {
  imported = false;
  importMokuro.mockClear();
  installResizeObserver();
  localStorage.setItem('jp-manga-reader-settings', JSON.stringify({ autoTranslate: false }));
  installReadingSurfaceApi({
    getMangaPages: async () => PAGES,
    // No engine: the import must work without it.
    mangaOcrAvailable: async () => false,
    mangaOcrLoadCache: async () => (imported ? IMPORTED : null),
    mangaOcrLoadTranslateCache: async () => null,
    mangaOcrImportMokuro: importMokuro,
    onAssetStatus: () => () => undefined,
    assetsList: async () => ({ statuses: [] }),
  });
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function mountReader(): Promise<ReadingSurfaceHarness> {
  const { default: MangaReader } = await import('../views/MangaReader');
  harness = createReadingSurfaceHarness({
    render: () => createElement(MangaReader, { item: ITEM, onClose: () => undefined }),
    ready: (container) => container.querySelector('.manga-stage') !== null,
  });
  await harness.mount(1200);
  return harness;
}

describe('Import .mokuro', () => {
  it('imports the picked file for this item and shows the page from it, with no OCR engine', async () => {
    const h = await mountReader();
    await h.click('.manga-ocr-toggle');
    await h.flush();
    const button = h.container.querySelector<HTMLButtonElement>('[data-mokuro-import]');
    expect(button, 'the import control is missing without the engine').not.toBeNull();
    expect(button!.disabled).toBe(false);

    const input = h.container.querySelector<HTMLInputElement>('input[type="file"][accept*=".mokuro"]')!;
    const file = new File(['{"version":"0.2.1","pages":[]}'], 'yotsuba01.mokuro', { type: 'application/json' });
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await h.flush();
    for (let i = 0; i < 6; i += 1) await act(async () => { await Promise.resolve(); });

    expect(importMokuro).toHaveBeenCalledWith('manga-mk', '{"version":"0.2.1","pages":[]}');
    expect(h.container.textContent).toContain('Imported text boxes for 2 pages from Mokuro.');
    // The page reloads from the cache the import wrote: its box is on the page now.
    expect(h.container.querySelector('[data-region-id="001:100,100,200,400"]')).not.toBeNull();
  });
});
