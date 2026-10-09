// @vitest-environment node
/**
 * Importing a Mokuro `.mokuro` volume into an item's OCR cache: one page file per
 * matched page in our cache schema, readable by `loadMangaOcrCache` (the same
 * path the reader uses), and a stale translation of an overwritten page removed.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'manga-mokuro-import-test-'));
const ITEM = 'mokuro-item';
const STEMS = ['001', '002'];
const metaUpdates: unknown[] = [];

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
  listMangaPageUrls: () => STEMS.map((stem) => `media://${ITEM}/pages/${stem}.jpg`),
  updateLibraryOcrMeta: (_id: string, meta: unknown) => metaUpdates.push(meta),
}));
vi.mock('../translate', () => ({ isTranslateAvailable: () => false, runTranslationBatch: async () => [] }));

let importMokuroVolume: typeof import('../mangaOcr').importMokuroVolume;
let loadMangaOcrCache: typeof import('../mangaOcr').loadMangaOcrCache;
beforeAll(async () => {
  ({ importMokuroVolume, loadMangaOcrCache } = await import('../mangaOcr'));
});

const ocrDir = path.join(tmpRoot, ITEM, '_ocr');

function volume(imgPaths: string[]) {
  return JSON.stringify({
    version: '0.2.1',
    title: 'よつばと！',
    volume: '01',
    pages: imgPaths.map((img, i) => ({
      version: '0.2.1',
      img_width: 1000,
      img_height: 1500,
      img_path: img,
      blocks: [{ box: [100 + i, 100, 200, 400], vertical: true, font_size: 30, lines_coords: [], lines: [`ページ${i + 1}`] }],
    })),
  });
}

beforeEach(() => {
  fs.rmSync(path.join(tmpRoot, ITEM), { recursive: true, force: true });
  fs.mkdirSync(path.join(tmpRoot, ITEM, 'pages'), { recursive: true });
  for (const stem of STEMS) fs.writeFileSync(path.join(tmpRoot, ITEM, 'pages', `${stem}.jpg`), 'x');
  metaUpdates.length = 0;
});

afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('importMokuroVolume', () => {
  it('writes each matched page where the reader reads it, with region ids keyed by the page', async () => {
    const result = await importMokuroVolume(ITEM, volume(['001.jpg', '002.jpg']));
    expect(result).toEqual({ ok: true, pages: 2, unmatched: 0, matchedBy: 'name' });
    const page = await loadMangaOcrCache(ITEM, `media://${ITEM}/pages/002.jpg`);
    expect(page?.blocks[0]).toMatchObject({ lines: ['ページ2'], regionId: '002:101,100,200,400', kind: 'text' });
    expect(metaUpdates.at(-1)).toMatchObject({ ocrPages: 2 });
  });

  it('drops the stale translation of a page it overwrites', async () => {
    fs.mkdirSync(ocrDir, { recursive: true });
    fs.writeFileSync(path.join(ocrDir, '001.tr.en.json'), '{}');
    fs.writeFileSync(path.join(ocrDir, '0011.tr.en.json'), '{}');
    await importMokuroVolume(ITEM, volume(['001.jpg']));
    expect(fs.existsSync(path.join(ocrDir, '001.tr.en.json'))).toBe(false);
    // A different page whose name merely starts the same is left alone.
    expect(fs.existsSync(path.join(ocrDir, '0011.tr.en.json'))).toBe(true);
  });

  it('says why when it imports nothing', async () => {
    expect(await importMokuroVolume(ITEM, 'not json')).toEqual({ ok: false, reason: 'invalid' });
    expect(await importMokuroVolume(ITEM, volume([]))).toEqual({ ok: false, reason: 'noPages' });
    expect(await importMokuroVolume(ITEM, volume(['a.jpg', 'b.jpg', 'c.jpg']))).toEqual({ ok: false, reason: 'noMatch' });
    expect(fs.existsSync(path.join(ocrDir, '001.json'))).toBe(false);
  });
});
