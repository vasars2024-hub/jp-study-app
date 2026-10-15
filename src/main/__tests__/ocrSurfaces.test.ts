// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EngineLine, OcrProvider, RouterDeps } from '../ocrRouter';
import type { SurfaceOcrOptions } from '../ocrSurface';

const h = vi.hoisted(() => {
  function image(width = 200, height = 100) {
    return {
      isEmpty: () => false, getSize: () => ({ width, height }),
      toDataURL: () => `data:image/png;base64,${width}x${height}`,
      toBitmap: () => Buffer.alloc(width * height * 4), toJPEG: () => Buffer.from('picture'),
      crop: (rect: { width: number; height: number }) => image(rect.width, rect.height),
      resize: (rect: { width: number; height: number }) => image(rect.width, rect.height),
    };
  }
  return { image, handlers: new Map<string, (...args: unknown[]) => unknown>(), lang: 'ja', deps: null as unknown as RouterDeps, calls: [] as SurfaceOcrOptions[], books: [] as unknown[] };
});
vi.mock('electron', () => ({
  BrowserWindow: { getAllWindows: () => [] }, ipcMain: { handle: (name: string, fn: (...args: unknown[]) => unknown) => h.handlers.set(name, fn) },
  nativeImage: {
    createFromDataURL: () => h.image(), createFromPath: () => h.image(),
    createFromBitmap: (_pixels: unknown, size: { width: number; height: number }) => h.image(size.width, size.height),
  },
  desktopCapturer: { getSources: async () => [{ display_id: '1', thumbnail: h.image(800, 600) }] },
  screen: { getAllDisplays: () => [{ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 800, height: 600 } }],
    getPrimaryDisplay: () => ({ id: 1, scaleFactor: 1, bounds: { x: 0, y: 0, width: 800, height: 600 } }) },
}));
vi.mock('../studyLanguage', () => ({ getMainStudyLang: () => h.lang }));
vi.mock('../downloads', () => ({ isInstalled: () => true, assetPath: () => null, registerAssetUnloadHandler: () => undefined }));
vi.mock('../paddleOcr', () => ({
  PADDLE_LANGS: ['ja', 'zh', 'ru'], paddleOcrAvailable: () => true,
  installedPaddleLangs: () => ['ja', 'zh', 'ru'], isInstalledPaddleDetector: () => true,
}));
vi.mock('../translate', () => ({ isTranslateAvailable: () => false }));
vi.mock('../library', () => ({
  itemDir: () => '', getLibraryItem: () => ({ id: 'book', title: 'Book', kind: 'manga' }),
  listItemPagePaths: () => ['page-1.png'], attachGeneratedEpub: () => undefined,
}));
vi.mock('../bookEpub', () => ({ buildBookEpub: (pages: unknown) => { h.books.push(pages); return Buffer.from('epub'); } }));
vi.mock('../pdfRasterize', () => ({}));
vi.mock('../ocrSurface', async (original) => {
  const real = await original<typeof import('../ocrSurface')>();
  return { ...real, readOcrSurface: (image: Electron.NativeImage, opts: SurfaceOcrOptions) => {
    h.calls.push(opts); return real.readOcrSurface(image, opts, h.deps);
  } };
});
import { __mangaOcrRoutingTestables as manga, applyCorrections, registerMangaOcrIpc } from '../mangaOcr';
import { __screenOcrTestables, ocrClipboardImage, ocrRegion } from '../screenOcr';
import { runBookOcr } from '../bookOcrJob';
import { createCaptureSession } from '../immersion/visualNovelCaptureSession';
import { defaultScriptOf } from '../ocrRouter';
import { memoWordOracle } from '../../shared/ocrDictionaryDecode';
import { ocrUnsureOf } from '../../shared/ocrSurfaceCorrections';

function line(text: string, confidence = 0.95, vertical = false): EngineLine {
  return { text, confidence, vertical, box: [10, 10, 150, 50],
    chars: [...text].map((ch) => ({ ch, p: confidence, alts: ch === '後' ? [{ ch: '竜', p: 0.2 }] : [] })) };
}
function provider(id: string, lang: string, read: EngineLine, tier: number): OcrProvider {
  return { id, langs: [lang], tier, available: () => true,
    readPage: vi.fn(async () => [read]), readLine: vi.fn(async () => read) };
}
function readers(lang = 'ja') {
  const text = lang === 'zh' ? '今天后天' : lang === 'ru' ? 'Сегодня' : '彼後';
  const primary = provider('manga', lang, line(text, 0.45), 0);
  const fallback = provider('web', lang, line(lang === 'ja' ? '恐竜' : text, 0.96), 1);
  h.deps.providers = [primary, fallback];
  return { primary, fallback };
}
beforeEach(() => {
  h.lang = 'ja'; h.calls = []; h.books = []; __screenOcrTestables.clearOcrCache();
  h.deps = { providers: [], now: () => 0, wordOracle: () => null, detectLang: (_text, langs) => langs[0],
    scriptOf: defaultScriptOf, assetsFor: () => [] };
});

describe('surface routes with stub providers', () => {
  it('image and handwriting IPC helpers use page and crop routing respectively', async () => {
    readers(); registerMangaOcrIpc();
    expect(await h.handlers.get('mangaOcr:recognizeImage')!({}, 'data:image/png;base64,AA==')).toBe('恐竜');
    expect(h.calls.at(-1)).toMatchObject({ purpose: 'manga', langs: ['ja'] });
    expect(h.calls.at(-1)?.line).toBeUndefined();
    h.lang = 'zh'; readers('zh');
    expect(await h.handlers.get('ocr:recognizeGlyph')!({}, 'data:image/png;base64,AA==', 'zh')).toBe('今天后天');
    expect(h.calls.at(-1)).toMatchObject({ purpose: 'lens', langs: ['zh'], line: true });
  });
  it('manga grouped lines switch readers without entering a page detector', async () => {
    const { primary, fallback } = readers();
    const region = { box: [0, 0, 60, 90] as [number, number, number, number], score: 1, vertical: true,
      points: [], lines: [{ box: [0, 0, 30, 90], fontSize: 20, vertical: true, score: 1 }, { box: [30, 0, 60, 90], fontSize: 20, vertical: true, score: 1 }] };
    const read = await manga.readBlockLines(Buffer.alloc(100 * 100 * 4), 100, 100, region as never, 4);
    expect(read.lines.map((l) => l.text)).toEqual(['恐竜', '恐竜']);
    expect(h.calls.every((c) => c.purpose === 'manga' && c.line && c.langs[0] === 'ja')).toBe(true);
    expect(primary.readPage).not.toHaveBeenCalled();
    expect(fallback.readLine).toHaveBeenCalledTimes(2);
  });
  it.each(['zh', 'ru'])('non-Japanese manga uses only its %s candidates', async (lang) => {
    h.lang = lang; const { fallback } = readers(lang);
    const read = await manga.recognizeCrop(Buffer.alloc(100 * 100 * 4), 100, 100, [0, 0, 60, 90], []);
    expect(read.text).toBe(lang === 'zh' ? '今天后天' : 'Сегодня');
    expect(h.calls[0]).toMatchObject({ langs: [lang], purpose: 'manga', line: false });
    expect(fallback.readLine).toHaveBeenCalled();
  });
  it('manga crop decoding uses the dictionary and retains one-click undo candidates', async () => {
    const read = line('彼後', 0.6);
    read.chars = [
      { ch: '彼', p: 0.42, alts: [{ ch: '恐', p: 0.25 }] },
      { ch: '後', p: 0.4, alts: [{ ch: '竜', p: 0.3 }] },
    ];
    h.deps.providers = [provider('manga', 'ja', read, 0)];
    h.deps.wordOracle = () => memoWordOracle(async (word) => word === '恐竜');
    const result = await manga.recognizeCrop(Buffer.alloc(100 * 100 * 4), 100, 100, [0, 0, 60, 90], []);
    expect(result.text).toBe('恐竜');
    expect(result.unsure).toEqual(expect.arrayContaining([
      expect.objectContaining({ at: 0, ch: '恐', alts: ['彼'] }),
      expect.objectContaining({ at: 1, ch: '竜', alts: ['後'] }),
    ]));
  });
  it('manga unsure candidates survive cache reload and corrections', async () => {
    const weak = provider('manga', 'ja', line('彼後', 0.45), 0);
    h.deps.providers = [weak];
    const read = await manga.recognizeCrop(Buffer.alloc(100 * 100 * 4), 100, 100, [0, 0, 60, 90], []);
    const page = manga.parseCachedMangaPage({ version: '1.01', img_width: 100, img_height: 100,
      blocks: [{ box: [0, 0, 60, 90], vertical: true, lines: [read.text], regionId: 'r', unsure: read.unsure }] });
    expect(ocrUnsureOf(page.blocks[0], read.text)).toEqual(read.unsure);
    const corrected = applyCorrections(page, { r: { lines: ['彼竜'] } });
    expect(corrected.blocks[0].lines).toEqual(['彼竜']);
    expect(ocrUnsureOf(corrected.blocks[0], '彼竜')).toEqual([]);
  });
  it('Lens reads and clipboard images carry fallback candidates and preserve geometry', async () => {
    const { fallback } = readers();
    const result = await ocrRegion({ x: 0, y: 0, width: 200, height: 100 }, 1, { includeScreenshot: true });
    expect(result.alternate).toMatchObject({ engine: 'manga', text: '彼後' });
    expect(result.text).toBe('恐竜'); expect(result.lines[0].box).toEqual([10, 10, 140, 40]);
    expect(h.calls[0]).toMatchObject({ langs: ['ja'], purpose: 'lens' });
    expect(fallback.readLine).toHaveBeenCalled();
    h.deps.providers = [provider('web', 'ja', line('彼後', 0.6), 1)];
    const clip = await ocrClipboardImage(h.image() as unknown as Electron.NativeImage);
    expect(clip.lines?.[0].unsure).toEqual([{ at: 1, ch: '後', p: 0.6, alts: ['竜'] }]);
  });
  it('VN watch reads use the VN budget policy and retain session OCR deduplication', async () => {
    readers(); const saved: string[] = [];
    const session = createCaptureSession({ readClipboard: () => '', createSocket: () => { throw new Error('unused'); },
      saveLines: (_id, lines) => { saved.push(...lines.map((line) => line.japanese)); return lines.length; },
      broadcast: () => undefined, setInterval: () => 1, clearInterval: () => undefined,
      setTimeout: () => 1, clearTimeout: () => undefined });
    session.start('vn', { clipboard: false, websocket: false, test: false });
    const result = await ocrRegion({ x: 0, y: 0, width: 200, height: 100 }, 1, { purpose: 'vn' });
    session.receive(result.text, 'ocr'); session.receive(result.text, 'ocr');
    expect(h.calls[0]).toMatchObject({ purpose: 'vn', langs: ['ja'] });
    expect(saved).toEqual(['恐竜']); session.stop();
  });
  it('book pages use the book language and package the fallback read', async () => {
    readers();
    const result = await runBookOcr({ itemId: 'book', lang: 'ja', quality: 'heavy' });
    expect(result.ok).toBe(true);
    expect(h.calls[0]).toMatchObject({ purpose: 'book', langs: ['ja'], budgetMs: 20_000 });
    expect(h.books[0]).toMatchObject([{ lines: [{ text: '恐竜' }] }]);
  });
});
