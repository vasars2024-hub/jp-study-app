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
