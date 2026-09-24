// @vitest-environment jsdom
/**
 * The Convert panel checks for an engine before it offers to convert, offers
 * the install when there is none, and offers the way back to the original once
 * an item has been converted.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AssetStatus } from '../../shared/assetRegistry';
import type { LibraryItem } from '../../shared/types';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

import BookOcrPanel from '../components/library/BookOcrPanel';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
let statuses: AssetStatus[] = [];
const api = {
  assetsList: vi.fn(async () => ({ assets: [], statuses })),
  onAssetStatus: vi.fn(() => () => undefined),
  assetsStart: vi.fn(async () => ({ ok: true })),
  assetsCancel: vi.fn(async () => undefined),
  bookOcrStatus: vi.fn(async () => ({ running: false })),
  onBookOcrProgress: vi.fn(() => () => undefined),
  bookOcrRun: vi.fn(async () => ({ ok: true })),
  librarySetOcrView: vi.fn(async () => null),
};

const installed = (id: string): AssetStatus => ({
  id, state: 'installed', receivedBytes: 1, totalBytes: 1, bytesPerSecond: 0,
});
const missing = (id: string, totalBytes = 5_000_000): AssetStatus => ({
  id, state: 'not-installed', receivedBytes: 0, totalBytes, bytesPerSecond: 0,
});

beforeEach(() => {
  (window as unknown as { api: unknown }).api = api;
  for (const fn of Object.values(api)) fn.mockClear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

async function render(item: LibraryItem): Promise<void> {
  await act(async () => {
    root.render(createElement(BookOcrPanel, { item }));
  });
  await act(async () => {
    await new Promise((done) => setTimeout(done, 0));
  });
}

const manga = { id: 'm', title: 't', kind: 'manga', createdAt: 1, pageCount: 3 } as LibraryItem;

describe('BookOcrPanel', () => {
  it('offers the model install and no Convert when nothing can read Japanese', async () => {
    statuses = ['paddle-ocr-det', 'paddle-ocr-ja', 'paddle-ocr-ja-keys'].map((id) => missing(id));
    await render(manga);
    const convert = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'bookOcr.convert');
    expect(convert?.disabled).toBe(true);
    const prompt = host.querySelector('.asset-install-prompt');
    expect(prompt?.textContent).toContain('bookOcr.needsModel');
    await act(async () => prompt!.querySelector('button')!.click());
    // The parent of the requires-group, once — the manager queues its companions.
    expect(api.assetsStart.mock.calls).toEqual([['paddle-ocr-ja']]);
  });

  it('converts once the Japanese web OCR set is installed', async () => {
    statuses = ['paddle-ocr-det', 'paddle-ocr-ja', 'paddle-ocr-ja-keys'].map(installed);
    await render(manga);
    expect(host.querySelector('.asset-install-prompt')).toBeNull();
    const convert = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'bookOcr.convert')!;
    expect(convert.disabled).toBe(false);
    await act(async () => convert.click());
    expect(api.bookOcrRun).toHaveBeenCalledWith(expect.objectContaining({ itemId: 'm' }));
  });

  it('switches a converted manga back to its pages', async () => {
    statuses = ['paddle-ocr-det', 'paddle-ocr-ja', 'paddle-ocr-ja-keys'].map(installed);
    await render({
      ...manga,
      kind: 'book',
      epubFile: 'ocr.epub',
      ocrEpubFile: 'ocr.epub',
      ocrOriginal: { kind: 'manga' },
    });
    const group = host.querySelector('.book-ocr-view')!;
    const [original, text] = Array.from(group.querySelectorAll('button'));
    expect(text.getAttribute('aria-pressed')).toBe('true');
    await act(async () => original.click());
    expect(api.librarySetOcrView).toHaveBeenCalledWith('m', 'original');
  });
});
