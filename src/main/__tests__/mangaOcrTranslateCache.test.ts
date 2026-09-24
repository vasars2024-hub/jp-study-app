// @vitest-environment node
/**
 * A page that translated nothing must not be cached as a translation.
 *
 * The bug this pins: `translateMokuroPage` returned the page *unchanged* when no
 * region came back translated, and `analyzeMangaVolume` wrote that unchanged
 * page to `_ocr/<stem>.tr.<lang>.json` anyway. `refreshMangaOcrMeta` counts that
 * file's existence as a translated page, so the reader offered "Show
 * translation" for a page whose translation was its own Japanese — with nothing
 * reported, because `runTranslationBatch` signals a failed item as an empty
 * string rather than by throwing.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { MOKURO_EMIT_VERSION, type MokuroPage } from '../../shared/mokuroTypes';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-tr-cache-test-'));
const ITEM = 'item-under-test';
const PAGES = ['0001', '0002'];

/** Filled per test to decide what the batch translator "returns". */
let batchImpl: (
  items: Array<{ id: string; text: string }>,
) => Array<{ id: string; text: string; reason?: string; detail?: string }> = () => [];
const batchCalls: Array<Array<{ id: string; text: string }>> = [];

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
  nativeImage: { createFromPath: () => ({ isEmpty: () => true }) },
}));
vi.mock('../downloads', () => ({
  assetPath: () => null,
  isInstalled: () => false,
  registerAssetUnloadHandler: () => undefined,
}));
vi.mock('../library', () => ({
  itemDir: (id: string) => path.join(tmpRoot, id),
  listMangaPageUrls: () => PAGES.map((stem) => `media://${ITEM}/pages/${stem}.png`),
  updateLibraryOcrMeta: () => undefined,
}));
vi.mock('../translate', () => ({
  isTranslateAvailable: () => true,
  runTranslationBatch: async (items: Array<{ id: string; text: string }>) => {
    batchCalls.push(items);
    return batchImpl(items);
  },
}));

const { analyzeMangaVolume } = await import('../mangaOcr');

const ocrDir = path.join(tmpRoot, ITEM, '_ocr');

function ocrPage(text: string): MokuroPage {
  return {
    version: MOKURO_EMIT_VERSION,
    img_width: 1200,
    img_height: 1700,
    blocks: [
      {
        box: [100, 100, 200, 400],
        vertical: true,
        font_size: 40,
        lines: [text],
        rawLines: [text],
        regionId: `region-${text}`,
        confidence: 0.99,
        kind: 'text',
      },
    ],
  };
}

/**
 * Seed real page files plus their OCR caches, so `scanMangaPage` answers from
 * cache and the ONNX models are never needed. `resolveMediaPath` requires the
 * page file to exist on disk, so it is written even though it is never decoded.
 */
function seedItem(): void {
  fs.rmSync(path.join(tmpRoot, ITEM), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpRoot, ITEM, 'pages'), { recursive: true });
  fs.mkdirSync(ocrDir, { recursive: true });
  const texts = ['猫が窓辺で寝ている。', 'とても静かだね。'];
  PAGES.forEach((stem, i) => {
    fs.writeFileSync(path.join(tmpRoot, ITEM, 'pages', `${stem}.png`), 'not-a-real-png');
    fs.writeFileSync(path.join(ocrDir, `${stem}.json`), JSON.stringify(ocrPage(texts[i])));
  });
}

function translateCaches(): string[] {
  return fs.readdirSync(ocrDir).filter((f) => f.includes('.tr.'));
}

beforeEach(() => {
  seedItem();
  batchCalls.length = 0;
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('analyzeMangaVolume translation caching', () => {
  it('writes no translation cache when nothing translated, and says so', async () => {
    batchImpl = (items) => items.map((i) => ({ id: i.id, text: '' }));

    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });

    expect(res.ok).toBe(true);
    expect(translateCaches()).toEqual([]);
    expect(res.warning).toMatch(/could not be translated|nothing usable/i);
    // Both pages were still attempted — the guard is about persistence, not
    // about giving up after the first failure.
    expect(batchCalls).toHaveLength(2);
  });

  it('writes the cache when regions do translate', async () => {
    batchImpl = (items) => items.map((i) => ({ id: i.id, text: 'A cat sleeps by the window.' }));

    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });

    expect(res.ok).toBe(true);
    expect(res.warning).toBeUndefined();
    expect(translateCaches().sort()).toEqual(['0001.tr.en.json', '0002.tr.en.json']);

    const cached = JSON.parse(await fsp.readFile(path.join(ocrDir, '0001.tr.en.json'), 'utf8')) as {
      page: MokuroPage;
    };
    expect(cached.page.blocks[0].lines).toEqual(['A cat sleeps by the window.']);
    // A translated line is horizontal, whatever the original orientation was.
    expect(cached.page.blocks[0].vertical).toBe(false);
  });

  it('never caches a page whose "translation" equals its source text', async () => {
    // The exact shape of the original defect: the translator hands back the
    // input. Even though every item is non-empty, none of it is a translation,
    // so nothing may be persisted.
    batchImpl = (items) => items.map((i) => ({ id: i.id, text: i.text }));

    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });

    expect(res.ok).toBe(true);
    expect(translateCaches()).toEqual([]);
    expect(res.warning).toBeTruthy();
  });

  it('reports a partial failure without discarding the pages that worked', async () => {
    let call = 0;
    batchImpl = (items) => {
      call += 1;
      return items.map((i) => ({ id: i.id, text: call === 1 ? 'It is very quiet.' : '' }));
    };

    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });

    expect(res.ok).toBe(true);
    expect(translateCaches()).toEqual(['0001.tr.en.json']);
    expect(res.warning).toMatch(/1 of 2/);
  });

  /*
   * The reader could only say "Translation failed." — the reason was dropped
   * with the empty string. It now travels from the batch to the run's result,
   * localizable, so the reader can offer the fix that goes with it.
   */
  it('says why nothing translated, as a catalog key the reader can word', async () => {
    batchImpl = (items) => items.map((i) => ({
      id: i.id,
      text: '',
      reason: 'model-missing',
      detail: 'model not found',
    }));

    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });

    expect(res).toMatchObject({
      ok: true,
      warningKey: 'manga.translate.warning.none',
      warningVars: { failed: 2, total: 2 },
      failure: { reason: 'model-missing', detail: 'model not found' },
    });
  });

  it('keeps a partial run key distinct from a total failure', async () => {
    let call = 0;
    batchImpl = (items) => {
      call += 1;
      return items.map((i) => (call === 1
        ? { id: i.id, text: 'It is very quiet.' }
        : { id: i.id, text: '', reason: 'timeout' }));
    };
    const res = await analyzeMangaVolume({ itemId: ITEM, translate: true, targetLang: 'en' });
    expect(res).toMatchObject({
      warningKey: 'manga.translate.warning.some',
      warningVars: { failed: 1, total: 2 },
      failure: { reason: 'timeout' },
    });
  });
});
