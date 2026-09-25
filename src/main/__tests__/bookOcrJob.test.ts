// @vitest-environment node
/**
 * The bulk book-OCR job must never turn a readable item into a blank book.
 *
 * The defect this pins: with no OCR model installed every page threw
 * `web-models-missing`, the per-page catch kept an empty page, the job reported
 * `done`, and `attachGeneratedEpub` re-filed the manga as a book of blank pages
 * with no way back. The job now refuses without an engine and fails a run whose
 * pages mostly came back empty — and in both cases the library is not touched.
 *
 * Every collaborator is stubbed: the engines, the EPUB builder and the library
 * are what the job DECIDES about, so they are the observation points.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runBookOcr } from '../bookOcrJob';

const h = vi.hoisted(() => ({
  installed: new Set<string>(),
  /** Per-page OCR behaviour, by page index. */
  pages: [] as Array<{ text?: string; throws?: string }>,
  ocrCalls: [] as Array<{ engine?: string; forceLang?: string }>,
  attached: [] as string[],
  broadcasts: [] as Array<Record<string, unknown>>,
}));

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: () => [
      { isDestroyed: () => false, webContents: { send: (_c: string, p: Record<string, unknown>) => h.broadcasts.push(p) } },
    ],
  },
  ipcMain: { handle: () => undefined },
  nativeImage: {
    createFromPath: (file: string) => ({ isEmpty: () => false, toDataURL: () => `data:${file}` }),
  },
}));

vi.mock('../downloads', () => ({ isInstalled: (id: string) => h.installed.has(id) }));

vi.mock('../ocrAuto', () => ({
  ocrAuto: async (dataUrl: string, opts: { engine?: string; forceLang?: string }) => {
    h.ocrCalls.push({ engine: opts.engine, forceLang: opts.forceLang });
    const index = Number(/page-(\d+)/.exec(dataUrl)?.[1] ?? 0);
    const page = h.pages[index] ?? {};
    if (page.throws) throw new Error(page.throws);
    const text = page.text ?? '';
    return {
      engine: 'web',
      lang: 'ja',
      lines: text ? [{ text, box: [0, 0, 1, 1], vertical: true, confidence: 0.95 }] : [],
      text,
      mangaConsidered: false,
    };
  },
}));

vi.mock('../bookEpub', () => ({ buildBookEpub: () => Buffer.from('epub') }));

vi.mock('../library', () => ({
  getLibraryItem: (id: string) => ({ id, title: 'テスト', kind: 'manga', createdAt: 1 }),
  itemDir: (id: string) => `/lib/${id}`,
  listItemPagePaths: () => h.pages.map((_, i) => `/lib/x/pages/page-${i}.png`),
  attachGeneratedEpub: (id: string) => {
    h.attached.push(id);
    return { id };
  },
}));

vi.mock('../pdfRasterize', () => ({ rasterizePdf: async () => undefined }));
vi.mock('../translate', () => ({ translateForBook: async () => '' }));

const WEB = ['paddle-ocr-det', 'paddle-ocr-ja', 'paddle-ocr-ja-keys'];
const MANGA = ['manga-ocr', 'manga-ocr-decoder', 'manga-ocr-vocab', 'comic-text-detector'];

beforeEach(() => {
  h.installed = new Set();
  h.pages = [];
  h.ocrCalls = [];
  h.attached = [];
  h.broadcasts = [];
});

describe('runBookOcr — no engine installed', () => {
  it('refuses before reading a page and leaves the item alone', async () => {
    h.pages = [{ text: '吾輩は猫である。' }, { text: '名前はまだ無い。' }];
    const res = await runBookOcr({ itemId: 'm1' });
    expect(res).toMatchObject({ ok: false, error: 'models-missing', errorKey: 'bookOcr.error.modelsMissing' });
    expect(h.ocrCalls).toHaveLength(0);
    expect(h.attached).toEqual([]);
    // The panel hears it too, not only the caller that awaited the promise.
    expect(h.broadcasts.at(-1)).toMatchObject({ itemId: 'm1', phase: 'error', errorKey: 'bookOcr.error.modelsMissing' });
    expect(h.broadcasts.some((p) => p.phase === 'done')).toBe(false);
  });

  it('does not count a Chinese-only web pack as an engine for a Japanese book', async () => {
    h.installed = new Set(['paddle-ocr-det', 'paddle-ocr-zh', 'paddle-ocr-zh-keys']);
    h.pages = [{ text: 'あ' }];
    const res = await runBookOcr({ itemId: 'm2' });
    expect(res.error).toBe('models-missing');
    expect(h.attached).toEqual([]);
  });

  it('reads a Chinese book with the Chinese recognizer, and never with manga-ocr', async () => {
    h.installed = new Set(['paddle-ocr-det', 'paddle-ocr-zh', 'paddle-ocr-zh-keys', ...MANGA]);
    h.pages = [{ text: '今天天气很好' }, { text: '我们去公园' }];
    const res = await runBookOcr({ itemId: 'z1', lang: 'zh' });
    expect(res.ok).toBe(true);
    expect(h.ocrCalls.map((c) => [c.engine, c.forceLang])).toEqual([['auto', 'zh'], ['auto', 'zh']]);
    h.installed = new Set(MANGA);
    expect((await runBookOcr({ itemId: 'z2', lang: 'ru' })).error).toBe('models-missing');
  });

  it('runs on manga-ocr alone when that is what is installed', async () => {
    h.installed = new Set(MANGA);
    h.pages = [{ text: 'あいう' }, { text: 'えお' }];
    const res = await runBookOcr({ itemId: 'm3' });
    expect(res.ok).toBe(true);
    expect(h.ocrCalls.map((c) => c.engine)).toEqual(['manga', 'manga']);
  });
});

describe('runBookOcr — a run that read almost nothing', () => {
  it('fails when most pages come back empty, and does not re-file the item', async () => {
    h.installed = new Set(WEB);
    h.pages = [{ text: '本文' }, {}, {}, {}];
    const res = await runBookOcr({ itemId: 'm4' });
    expect(res).toMatchObject({
      ok: false,
      error: 'mostly-empty',
      errorKey: 'bookOcr.error.mostlyEmpty',
      errorVars: { read: 1, total: 4 },
    });
    expect(h.attached).toEqual([]);
    expect(h.broadcasts.at(-1)).toMatchObject({ phase: 'error', errorKey: 'bookOcr.error.mostlyEmpty' });
    expect(h.broadcasts.some((p) => p.phase === 'done' || p.phase === 'packaging')).toBe(false);
  });

  it('names the engine error when every page threw', async () => {
    h.installed = new Set(WEB);
    h.pages = [{ throws: 'onnx session died' }, { throws: 'onnx session died' }];
    const res = await runBookOcr({ itemId: 'm5' });
    expect(res).toMatchObject({
      ok: false,
      errorKey: 'bookOcr.error.engine',
      errorVars: { detail: 'onnx session died' },
    });
    expect(h.attached).toEqual([]);
  });
});

describe('runBookOcr — success', () => {
  it('attaches the EPUB when most pages have text, blank covers and all', async () => {
    h.installed = new Set(WEB);
    // Cover and an illustration plate are blank; the rest is text. Still a book.
    h.pages = [{}, { text: '一' }, { text: '二' }, {}, { text: '三' }];
    const res = await runBookOcr({ itemId: 'm6' });
    expect(res).toMatchObject({ ok: true, itemId: 'm6', pages: 5 });
    expect(h.ocrCalls.map((c) => c.engine)).toEqual(['auto', 'auto', 'auto', 'auto', 'auto']);
    expect(h.attached).toEqual(['m6']);
    expect(h.broadcasts.at(-1)).toMatchObject({ phase: 'done' });
  });

  it('survives one unreadable page among good ones', async () => {
    h.installed = new Set(WEB);
    h.pages = [{ text: '一' }, { throws: 'bad page' }, { text: '三' }];
    const res = await runBookOcr({ itemId: 'm7' });
    expect(res.ok).toBe(true);
    expect(h.attached).toEqual(['m7']);
  });
});
