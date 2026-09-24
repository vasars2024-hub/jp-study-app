// @vitest-environment node
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// library.ts is a large module with many IPC registrations, but the two
// functions under test here (pickCoverPage, importMangaFromImageUrls) only
// need electron's nativeImage + app.getPath — stub just enough for the
// module to load, with app.getPath pointing at a REAL temp directory since
// importMangaFromImageUrls does real fs writes (page files + library.json).
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'library-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
  protocol: { registerSchemesAsPrivileged: () => undefined, handle: () => undefined },
  nativeImage: {
    createFromPath: (p: string) => {
      const isBlank = p.includes('blank');
      const isEmpty = p.includes('corrupt');
      return {
        isEmpty: () => isEmpty,
        resize: () => ({
          getSize: () => ({ width: 4, height: 4 }),
          toBitmap: () => {
            const n = 16;
            const buf = Buffer.alloc(n * 4);
            for (let i = 0; i < n; i++) {
              const o = i * 4;
              if (isBlank) {
                // Uniform near-white — low variance, high blank-penalty.
                buf[o] = 250;
                buf[o + 1] = 250;
                buf[o + 2] = 250;
                buf[o + 3] = 255;
              } else {
                // Deliberately varied colors — high variance, no blank penalty.
                buf[o] = (i * 37) % 256;
                buf[o + 1] = (i * 91) % 256;
                buf[o + 2] = (i * 53) % 256;
                buf[o + 3] = 255;
              }
            }
            return buf;
          },
        }),
      };
    },
  },
}));
vi.mock('./readabilityExtract', () => ({ extractReadableFromUrl: () => Promise.resolve(null) }));
vi.mock('./readingFetch', () => ({ fetchReadingContent: () => Promise.resolve(null) }));
vi.mock('./i18n', () => ({ mt: (k: string) => k }));
vi.mock('./epubMeta', () => ({ extractEpubTitleFromOpf: () => undefined }));

const {
  pickCoverPage,
  importMangaFromImageUrls,
  importProviderMangaChapter,
  attachGeneratedEpub,
  setLibraryOcrView,
  getLibraryItem,
} = await import('../library');

afterEach(() => {
  vi.unstubAllGlobals();
});
afterAll(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

describe('pickCoverPage', () => {
  it('keeps page 1 when it already scores well (colorful)', () => {
    const names = ['0001-colorful.jpg', '0002-colorful.jpg', '0003-colorful.jpg'];
    expect(pickCoverPage('/pages', names)).toBe('0001-colorful.jpg');
  });

  it('picks a later colorful page over a blank page 1', () => {
    const names = ['0001-blank.jpg', '0002-blank.jpg', '0003-colorful.jpg', '0004-blank.jpg'];
    expect(pickCoverPage('/pages', names)).toBe('0003-colorful.jpg');
  });

  it('only considers the first 8 candidates', () => {
    const names = [
      '0001-blank.jpg',
      '0002-blank.jpg',
      '0003-blank.jpg',
      '0004-blank.jpg',
      '0005-blank.jpg',
      '0006-blank.jpg',
      '0007-blank.jpg',
      '0008-blank.jpg',
      '0009-colorful.jpg', // outside the first-8 window — must NOT be picked
    ];
    expect(pickCoverPage('/pages', names)).toBe('0001-blank.jpg');
  });

  it('falls back to page 1 when every candidate fails to decode', () => {
    const names = ['0001-corrupt.jpg', '0002-corrupt.jpg'];
    expect(pickCoverPage('/pages', names)).toBe('0001-corrupt.jpg');
  });

  it('returns empty string for an empty page list', () => {
    expect(pickCoverPage('/pages', [])).toBe('');
  });
});

function fakeImageResponse(bytes = 1024): Response {
  return {
    ok: true,
    headers: { get: (h: string) => (h.toLowerCase() === 'content-type' ? 'image/jpeg' : null) },
    arrayBuffer: async () => new ArrayBuffer(bytes),
  } as unknown as Response;
}

describe('importMangaFromImageUrls', () => {
  it('imports all pages when every URL succeeds', async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse());
    vi.stubGlobal('fetch', fetchMock);
    const out = await importMangaFromImageUrls({
      url: 'https://example.com/manga/ch1',
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg', 'https://cdn.example.com/3.jpg'],
    });
    expect(out.ok).toBe(true);
    expect(out.pageCount).toBe(3);
    expect(out.failed).toBe(0);
    expect(typeof out.id).toBe('string');
    expect(fs.existsSync(path.join(tmpRoot, 'library', String(out.id), 'pages', '0001.jpg'))).toBe(true);
  });

  it('tolerates partial failure — keeps the successful pages, reports the rest as failed', async () => {
    let call = 0;
    const fetchMock = vi.fn(async () => {
      call++;
      if (call === 2) return { ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) } as unknown as Response;
      return fakeImageResponse();
    });
    vi.stubGlobal('fetch', fetchMock);
    const out = await importMangaFromImageUrls({
      url: 'https://example.com/manga/ch2',
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg', 'https://cdn.example.com/3.jpg'],
    });
    expect(out.ok).toBe(true);
    expect(out.pageCount).toBe(2);
    expect(out.failed).toBe(1);
  });

  it('hard-fails only when every image fails', async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, headers: { get: () => null }, arrayBuffer: async () => new ArrayBuffer(0) }) as unknown as Response);
    vi.stubGlobal('fetch', fetchMock);
    const out = await importMangaFromImageUrls({
      url: 'https://example.com/manga/ch3',
      images: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    });
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/failed/i);
  });

  it('rejects an empty image list without calling fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const out = await importMangaFromImageUrls({ url: 'https://example.com/manga/ch4', images: [] });
    expect(out.ok).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('SSRF guard: skips loopback/private-network image URLs even if listed', async () => {
    const fetchMock = vi.fn(async () => fakeImageResponse());
    vi.stubGlobal('fetch', fetchMock);
    const out = await importMangaFromImageUrls({
      url: 'https://example.com/manga/ch5',
      images: [
        'http://127.0.0.1:9999/steal.jpg',
        'http://10.0.0.5/internal.jpg',
        'http://192.168.1.1/router.jpg',
        'https://cdn.example.com/real.jpg',
      ],
    });
    expect(out.ok).toBe(true);
    expect(out.pageCount).toBe(1); // only the one public URL
    // fetch should never have been called with a private/loopback target
    for (const call of fetchMock.mock.calls) {
      expect(String(call[0])).not.toMatch(/127\.0\.0\.1|10\.0\.0\.5|192\.168\.1\.1/);
    }
  });
});

describe('importProviderMangaChapter', () => {
  it('commits a complete local manga item with provider identity', () => {
    const source = {
      kind: 'seanime-manga-chapter' as const,
      mediaId: 30_002,
      malId: 2,
      workId: 'seanime-manga:30002',
      workTitle: 'Berserk',
      workTitleNative: 'ベルセルク',
      editionId: 'seanime:fixture:30002',
      providerId: 'fixture',
      providerLabel: 'Fixture',
      chapterId: 'chapter-1',
      chapterNumber: '1',
      chapterTitle: '第一話',
      language: 'ja',
    };
    const result = importProviderMangaChapter({
      title: 'Berserk — Chapter 1',
      source,
      pages: [
        { bytes: Buffer.alloc(128, 1), contentType: 'image/png' },
        { bytes: Buffer.alloc(128, 2), contentType: 'image/webp' },
      ],
    });

    expect(result.alreadyPresent).toBe(false);
    expect(result.item).toMatchObject({
      title: 'Berserk — Chapter 1',
      kind: 'manga',
      pageCount: 2,
      readingSource: source,
    });
    const pagesDir = path.join(tmpRoot, 'library', result.item.id, 'pages');
    expect(fs.readdirSync(pagesDir).sort()).toEqual(['0001.png', '0002.webp']);
  });

  it('is idempotent for the same provider chapter', () => {
    const source = {
      kind: 'seanime-manga-chapter' as const,
      mediaId: 30_002,
      workId: 'seanime-manga:30002',
      workTitle: 'Berserk',
      editionId: 'seanime:fixture:30002',
      providerId: 'fixture',
      providerLabel: 'Fixture',
      chapterId: 'chapter-1',
      chapterNumber: '1',
      chapterTitle: '',
      language: 'ja',
    };
    const result = importProviderMangaChapter({
      title: 'Duplicate',
      source,
      pages: [{ bytes: Buffer.alloc(128), contentType: 'image/jpeg' }],
    });
    expect(result.alreadyPresent).toBe(true);
    expect(result.item.title).toBe('Berserk — Chapter 1');
  });
});

/**
 * Re-capturing a url must update the chapter it already made, not add another.
 *
 * Found live 2026-09-06 in the user's own library, from the Reading workspace's
 * Home tab: Continue reading listed **One Punch-Man : The Koi Pond | Chapter 229**
 * twice, at **47%** and **29%**. `listLibrary()` had THREE rows for it —
 * `25e40727`, `7138778b`, `f303fe4c` — created 89 s and 158 s apart on
 * 2026-07-17, all with the identical `sourcePath`
 * `https://cubari.moe/read/gist/cmF0L0tva2lLb2k...`, and each carrying its own
 * `ocrMeta` (17/18/18 pages OCR'd). One chapter, captured three times, downloaded
 * and OCR'd three times, with the reader's position split across the copies so
 * "continue reading" could not say where they actually were.
 *
 * `importEpubBufferToLibrary` had always keyed on `sourcePath` (library.ts:443).
 * `importMangaFromImageUrls` called `crypto.randomUUID()` unconditionally.
 *
 * What is pinned is the pair of properties that make the fix worth anything: the
 * row count does not grow, AND the user's half of the record survives the update.
 * A dedupe that overwrote progress would satisfy the first and fail the second.
 */
describe('importMangaFromImageUrls — a re-captured url updates its chapter', () => {
  const dbFile = (): string => path.join(tmpRoot, 'library.json');
  const rowsFor = (url: string): Array<Record<string, unknown>> => {
    const all = JSON.parse(fs.readFileSync(dbFile(), 'utf-8')) as Array<Record<string, unknown>>;
    return all.filter((row) => row.sourcePath === url);
  };
  /** Stand in for the reader having written a bookmark, which is IPC-only here. */
  const setProgressOn = (id: string, progress: Record<string, unknown>): void => {
    const all = JSON.parse(fs.readFileSync(dbFile(), 'utf-8')) as Array<Record<string, unknown>>;
    const row = all.find((entry) => entry.id === id);
    if (row) {
      row.progress = progress;
      row.folder = 'Shelf the user chose';
    }
    fs.writeFileSync(dbFile(), JSON.stringify(all, null, 2), 'utf-8');
  };
  const capture = async (url: string, pages: number) => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeImageResponse()));
    return importMangaFromImageUrls({
      url,
      images: Array.from({ length: pages }, (_, i) => `https://cdn.example.com/${i + 1}.jpg`),
    });
  };

  // The regression itself. Before the fix this was 2 rows with 2 different ids.
  it('keeps one row and one id across a second capture of the same url', async () => {
    const url = 'https://cubari.example/read/gist/dedupe-one';
    const first = await capture(url, 3);
    const second = await capture(url, 3);

    expect(first.ok && second.ok).toBe(true);
    expect(second.id).toBe(first.id);
    expect(rowsFor(url)).toHaveLength(1);
  });

  it('keeps the reader\'s position and shelf, which is what the duplicates were losing', async () => {
    const url = 'https://cubari.example/read/gist/dedupe-progress';
    const first = await capture(url, 4);
    setProgressOn(String(first.id), { page: 2, percent: 2 / 3 });

    await capture(url, 4);

    const [row] = rowsFor(url);
    expect(row.folder).toBe('Shelf the user chose');
    expect((row.progress as { page: number }).page).toBe(2);
    expect((row.progress as { percent: number }).percent).toBeCloseTo(2 / 3, 10);
  });

  it('clamps a bookmark that a shorter re-capture would strand past the last page', async () => {
    const url = 'https://cubari.example/read/gist/dedupe-shrink';
    const first = await capture(url, 5);
    setProgressOn(String(first.id), { page: 4, percent: 1 });

    const second = await capture(url, 3);

    const [row] = rowsFor(url);
    expect(second.pageCount).toBe(3);
    expect(row.pageCount).toBe(3);
    // Last page of the new capture, on the reader's own formula idx/(len-1).
    expect((row.progress as { page: number }).page).toBe(2);
    expect((row.progress as { percent: number }).percent).toBe(1);
  });

  it('sweeps pages the shorter re-capture did not overwrite', async () => {
    const url = 'https://cubari.example/read/gist/dedupe-sweep';
    const first = await capture(url, 5);
    const pagesDir = path.join(tmpRoot, 'library', String(first.id), 'pages');
    expect(fs.readdirSync(pagesDir)).toHaveLength(5);

    await capture(url, 2);

    const left = fs.readdirSync(pagesDir);
    expect(left).toHaveLength(2);
    expect(left).toContain('0001.jpg');
    expect(left).not.toContain('0005.jpg');
  });

  it('drops OCR boxes only when the page count moved under them', async () => {
    const sameUrl = 'https://cubari.example/read/gist/dedupe-ocr-same';
    const sameFirst = await capture(sameUrl, 3);
    const stamp = (id: string): void => {
      const all = JSON.parse(fs.readFileSync(dbFile(), 'utf-8')) as Array<Record<string, unknown>>;
      const row = all.find((entry) => entry.id === id);
      if (row) row.ocrMeta = { ocrPages: 3, translatedPages: 3, updatedAt: 1, targetLang: 'en' };
      fs.writeFileSync(dbFile(), JSON.stringify(all, null, 2), 'utf-8');
    };
    stamp(String(sameFirst.id));
    await capture(sameUrl, 3);
    expect(rowsFor(sameUrl)[0].ocrMeta, 'an identical re-capture must not throw the OCR away').toBeTruthy();

    const movedUrl = 'https://cubari.example/read/gist/dedupe-ocr-moved';
    const movedFirst = await capture(movedUrl, 3);
    stamp(String(movedFirst.id));
    await capture(movedUrl, 2);
    expect(rowsFor(movedUrl)[0].ocrMeta ?? null, 'boxes measured on other pages must not survive').toBeNull();
  });

  // The control: a DIFFERENT url is a different chapter and must still add a row.
  it('still adds a row for a url it has not seen', async () => {
    const a = 'https://cubari.example/read/gist/distinct-a';
    const b = 'https://cubari.example/read/gist/distinct-b';
    const first = await capture(a, 2);
    const second = await capture(b, 2);

    expect(second.id).not.toBe(first.id);
    expect(rowsFor(a)).toHaveLength(1);
    expect(rowsFor(b)).toHaveLength(1);
  });
});

/*
 * Book OCR is reversible. Converting a manga used to flip `kind` to 'book' for
 * good, so the manga reader was never offered for it again — and when the run
 * had read nothing, the only way to the pages was gone with it.
 */
describe('OCR conversion keeps the original reachable', () => {
  function seed(item: Record<string, unknown>): void {
    const dbFile = path.join(tmpRoot, 'library.json');
    const items = fs.existsSync(dbFile) ? JSON.parse(fs.readFileSync(dbFile, 'utf8')) : [];
    items.push({ createdAt: 1, title: 'テスト', ...item });
    fs.writeFileSync(dbFile, JSON.stringify(items));
    const pages = path.join(tmpRoot, 'library', String(item.id), 'pages');
    fs.mkdirSync(pages, { recursive: true });
    fs.writeFileSync(path.join(pages, '0001.jpg'), 'x');
  }

  it('switches a converted manga back to its pages and forward again, keeping each position', () => {
    seed({ id: 'ocr-manga', kind: 'manga', pageCount: 1, progress: { page: 7, percent: 0.5 } });
    attachGeneratedEpub('ocr-manga', Buffer.from('epub'));
    let it = getLibraryItem('ocr-manga')!;
    expect(it).toMatchObject({ kind: 'book', epubFile: 'ocr.epub', ocrEpubFile: 'ocr.epub', ocrOriginal: { kind: 'manga' } });
    // The manga page index is not handed to the novel reader.
    expect(it.progress).toBeUndefined();

    setLibraryOcrView('ocr-manga', 'original');
    it = getLibraryItem('ocr-manga')!;
    expect(it.kind).toBe('manga');
    expect(it.epubFile).toBeUndefined();
    expect(it.progress).toEqual({ page: 7, percent: 0.5 });
    // Nothing was deleted on the way.
    expect(fs.existsSync(path.join(tmpRoot, 'library', 'ocr-manga', 'ocr.epub'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'library', 'ocr-manga', 'pages', '0001.jpg'))).toBe(true);

    setLibraryOcrView('ocr-manga', 'text');
    expect(getLibraryItem('ocr-manga')).toMatchObject({ kind: 'book', epubFile: 'ocr.epub' });
  });

  it('returns a scanned PDF to its PDF, and a re-run keeps the first record of the original', () => {
    seed({ id: 'ocr-pdf', kind: 'book', epubFile: 'original.pdf' });
    attachGeneratedEpub('ocr-pdf', Buffer.from('epub'));
    attachGeneratedEpub('ocr-pdf', Buffer.from('epub2'), { fileName: 'ocr-bilingual.epub' });
    expect(getLibraryItem('ocr-pdf')).toMatchObject({
      epubFile: 'ocr-bilingual.epub',
      ocrOriginal: { kind: 'book', epubFile: 'original.pdf' },
    });
    setLibraryOcrView('ocr-pdf', 'original');
    expect(getLibraryItem('ocr-pdf')).toMatchObject({ kind: 'book', epubFile: 'original.pdf' });
  });

  it('recovers an item converted before conversion was reversible', () => {
    seed({ id: 'ocr-legacy', kind: 'book', epubFile: 'ocr.epub', pageCount: 1 });
    fs.writeFileSync(path.join(tmpRoot, 'library', 'ocr-legacy', 'ocr.epub'), 'epub');
    setLibraryOcrView('ocr-legacy', 'original');
    expect(getLibraryItem('ocr-legacy')).toMatchObject({ kind: 'manga', ocrEpubFile: 'ocr.epub' });
  });

  it('refuses for an item that was never converted', () => {
    seed({ id: 'plain-book', kind: 'book', epubFile: 'original.epub' });
    expect(setLibraryOcrView('plain-book', 'original')).toBeUndefined();
    expect(getLibraryItem('plain-book')).toMatchObject({ kind: 'book', epubFile: 'original.epub' });
  });
});
