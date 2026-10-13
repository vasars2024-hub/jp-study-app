// @vitest-environment jsdom
/**
 * onb3 — raw English error text inside translated UI.
 *
 * Main authors its failure reasons in English (it has no locale). The manga
 * reader showed `err.message` from the OCR IPC as the page's error line, and the
 * visual-novel panels showed `response.error` wherever main sent one. Both now
 * map to catalog sentences: the manga reader by recognising the reasons main
 * writes, the VN panels through `visualNovelErrorKey` and the `errorCode` main
 * sends with every failure.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

vi.mock('tesseract.js', () => ({ createWorker: vi.fn() }));

import { mangaOcrErrorKey } from '../ocr';
import VisualNovelImportPanel from '../components/immersion/VisualNovelImportPanel';

const en = (key: string): string => {
  const entry = CATALOGS.en[key];
  return typeof entry === 'string' ? entry : entry ? entry.other : key;
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

describe('mangaOcrErrorKey', () => {
  const ipc = (message: string): Error =>
    new Error(`Error invoking remote method 'mangaOcr:scanPage': Error: ${message}`);

  it('maps the reasons main writes, through the IPC wrapper', () => {
    expect(mangaOcrErrorKey(ipc('Manga OCR models are not installed.'))).toBe('manga.ocr.modelsMissing');
    expect(mangaOcrErrorKey(ipc('Could not decode page image.'))).toBe('manga.ocr.readFailed');
    expect(mangaOcrErrorKey(ipc('Invalid manga page URL.'))).toBe('onb3.manga.pageMissing');
    expect(mangaOcrErrorKey(ipc('Region too small.'))).toBe('onb3.manga.regionTooSmall');
    // The progress event carries the bare message.
    expect(mangaOcrErrorKey('Detector not loaded')).toBe('manga.ocr.modelsMissing');
  });

  it('falls back to the generic sentence, and keeps the timeout one', () => {
    expect(mangaOcrErrorKey(ipc('onnxruntime: something deep failed'))).toBe('manga.ocr.failed');
    expect(mangaOcrErrorKey(undefined)).toBe('manga.ocr.failed');
    const timeout = new Error('slow');
    timeout.name = 'TimeoutError';
    expect(mangaOcrErrorKey(timeout)).toBe('manga.ocr.timedOut');
  });

  it('every key it can return exists in every catalog', () => {
    for (const key of ['manga.ocr.modelsMissing', 'manga.ocr.readFailed', 'onb3.manga.pageMissing', 'onb3.manga.regionTooSmall', 'manga.ocr.failed']) {
      for (const lang of ['en', 'ja', 'zh', 'ru'] as const) expect(CATALOGS[lang][key], `${lang} ${key}`).toBeTruthy();
    }
  });
});

describe('VisualNovelImportPanel errors', () => {
  async function mount(api: Record<string, unknown>) {
    (window as unknown as { api: unknown }).api = api;
    const onStatus = vi.fn();
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    await act(async () => {
      root?.render(<VisualNovelImportPanel onImported={() => undefined} onStatus={onStatus} />);
    });
    return onStatus;
  }
  const clickText = async (label: string): Promise<void> => {
    const target = [...host.querySelectorAll('button')].find((b) => b.textContent?.trim() === label);
    expect(target, label).toBeTruthy();
    await act(async () => {
      target?.click();
    });
  };

  it('says a failed scan in the UI language, not the thrown English', async () => {
    const onStatus = await mount({
      visualNovelDiscoverFolder: vi.fn(async () => {
        throw new Error("Error invoking remote method 'visual-novel:discoverFolder': Error: EPERM, operation not permitted");
      }),
    });
    await clickText(en('vnImport.scanFolder'));
    const [message, isError] = onStatus.mock.calls.at(-1) ?? [];
    expect(isError).toBe(true);
    expect(message).toBe(en('onb3.vn.scanFailed'));
  });

  it('turns main\'s errorCode into its sentence when importing the library fails', async () => {
    const onStatus = await mount({
      visualNovelImportLibrary: vi.fn(async () => ({
        ok: false,
        error: 'ENOENT: no such file or directory, open C:\\x.json',
        errorCode: 'file-missing',
      })),
    });
    await clickText(en('vnImport.importJson'));
    expect(onStatus).toHaveBeenLastCalledWith(en('vnError.fileMissing'), true);
  });
});
