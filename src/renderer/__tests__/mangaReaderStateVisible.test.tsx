// @vitest-environment jsdom
/**
 * The manga reader shows the state it is in (audit P4-D1/D2/D3).
 *
 * D1 — "Download Manga OCR (530 MB)" was a plain button for the whole 530 MB:
 *      no progress, no cancel, though the download manager reports both.
 * D2 — a volume run that finished OCR but translated nothing stored its warning
 *      in `ocrError`, marked the page done, and `ocrError` only renders in the
 *      OCR error state — so the warning was never on screen.
 * D3 — every translation failure read "Translation failed.": the reason was
 *      dropped in main, and auto-translate is on by default.
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
import type { AssetStatus } from '../../shared/assetRegistry';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ITEM: LibraryItem = { id: 'manga-1', title: 'テスト', kind: 'manga', createdAt: 1, pageCount: 2 };
const PAGES = ['media://p/000.jpg', 'media://p/001.jpg'];

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

const status = (id: string, patch: Partial<AssetStatus> = {}): AssetStatus => ({
  id, state: 'not-installed', receivedBytes: 0, totalBytes: 1000, bytesPerSecond: 0, ...patch,
});

afterEach(() => {
  harness?.teardown();
  harness = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('Manga OCR download', () => {
  beforeEach(() => {
    installResizeObserver();
    localStorage.setItem('jp-manga-reader-settings', JSON.stringify({ autoTranslate: false }));
  });

  it('shows the running download with progress and Cancel, not a plain button', async () => {
    const cancel = vi.fn(async () => undefined);
    installReadingSurfaceApi({
      getMangaPages: async () => PAGES,
      mangaOcrAvailable: async () => false,
      onAssetStatus: () => () => undefined,
      assetsCancel: cancel,
      assetsList: async () => ({
        assets: [],
        statuses: [
          status('manga-ocr', { state: 'downloading', receivedBytes: 500 }),
          status('manga-ocr-decoder', { state: 'queued' }),
          status('manga-ocr-vocab', { state: 'installed' }),
          status('comic-text-detector', { state: 'queued' }),
        ],
      }),
    });
    const h = await mountReader();
    await h.click('.manga-ocr-toggle');
    await h.flush();
    const prompt = h.container.querySelector('.asset-install-prompt');
    expect(prompt, 'no install prompt in the OCR panel').not.toBe(null);
    expect(prompt!.getAttribute('data-asset-state')).toBe('busy');
    // 500 of 3,000 outstanding bytes: the companions count, not just the encoder.
    expect(prompt!.querySelector('[role="progressbar"]')?.getAttribute('aria-valuenow')).toBe('17');
    const cancelButton = prompt!.querySelector<HTMLButtonElement>('button')!;
    await act(async () => cancelButton.click());
    expect(cancel.mock.calls.map((c: unknown[]) => c[0]).sort()).toEqual(
      ['comic-text-detector', 'manga-ocr', 'manga-ocr-decoder'],
    );
  });
});

describe('whole-volume translation outcome', () => {
  beforeEach(() => {
    installResizeObserver();
    // Auto-translate is the default; a fresh reader runs the volume on open.
    localStorage.setItem('jp-manga-reader-settings', JSON.stringify({ autoTranslate: true }));
  });

  it('shows the no-translation warning in its own slot, with the reason and its fix', async () => {
    installReadingSurfaceApi({
      getMangaPages: async () => PAGES,
      mangaOcrAvailable: async () => true,
      onAssetStatus: () => () => undefined,
      assetsList: async () => ({ assets: [], statuses: [] }),
      mangaOcrLoadCache: async () => null,
      mangaOcrLoadTranslateCache: async () => null,
      onMangaOcrVolumeProgress: () => () => undefined,
      mangaOcrAnalyzeVolume: async () => ({
        ok: true,
        warning: 'OCR finished, but the translation model produced nothing usable',
        warningKey: 'manga.translate.warning.none',
        warningVars: { failed: 2, total: 2 },
        failure: { reason: 'model-missing' },
      }),
    });
    const h = await mountReader();
    await h.flush();
    const notice = h.container.querySelector('.ocr-warning');
    expect(notice, 'the volume warning is not on screen').not.toBe(null);
    expect(notice!.getAttribute('role')).toBe('status');
    expect(notice!.textContent).toContain('0 of 2');
    expect(notice!.textContent).toContain('The translation model is not installed.');
    const fix = [...notice!.querySelectorAll('button')].find((b) => b.textContent === 'Open model settings');
    expect(fix, 'no fix offered with the reason').toBeTruthy();
  });

  it('names why a failed run failed instead of a bare "failed"', async () => {
    installReadingSurfaceApi({
      getMangaPages: async () => PAGES,
      mangaOcrAvailable: async () => true,
      onAssetStatus: () => () => undefined,
      assetsList: async () => ({ assets: [], statuses: [] }),
      mangaOcrLoadCache: async () => null,
      onMangaOcrVolumeProgress: () => () => undefined,
      mangaOcrAnalyzeVolume: async () => ({ ok: false, error: 'boom', failure: { reason: 'timeout' } }),
    });
    const h = await mountReader();
    await h.flush();
    const notice = h.container.querySelector('.ocr-msg.ocr-error[role="alert"]');
    expect(notice?.textContent).toContain('The translation model took too long to answer.');
    expect([...notice!.querySelectorAll('button')].some((b) => b.textContent === 'Try again')).toBe(true);
  });
});
