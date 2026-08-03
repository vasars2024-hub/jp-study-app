// @vitest-environment node

import { describe, expect, it, vi } from 'vitest';
import type { MangaChapterDownloadDependencies } from '../reading/downloadChapter';

vi.mock('../library', () => ({
  importProviderMangaChapter: vi.fn(),
}));
vi.mock('../reading/seanimeManga', () => ({
  fetchMangaEntry: vi.fn(),
  fetchMangaChapterPages: vi.fn(),
  mangaEditionId: (mediaId: number, providerId: string) => `seanime:${providerId}:${mediaId}`,
  mangaWorkId: (mediaId: number) => `seanime-manga:${mediaId}`,
  readingWorkFromMangaEntry: (entry: { mediaId: number; media?: { idMal?: number; title?: { userPreferred?: string } } }) => ({
    contentType: 'manga',
    workId: `seanime-manga:${entry.mediaId}`,
    title: entry.media?.title?.userPreferred ?? '',
    titleNative: '',
    aniListId: entry.mediaId,
    malId: entry.media?.idMal ?? null,
  }),
}));

import { downloadMangaChapter } from '../reading/downloadChapter';

function dependencies() {
  const fetchEntry = vi.fn(async () => ({
    mediaId: 30_002,
    media: { id: 30_002, idMal: 2, title: { userPreferred: 'Berserk' } },
  }));
  const fetchPages = vi.fn(async () => [
    { index: 0, url: 'https://cdn/1.jpg', headers: { Referer: 'https://provider' }, width: 0, height: 0 },
    { index: 1, url: 'https://cdn/2.jpg', headers: { Referer: 'https://provider' }, width: 0, height: 0 },
  ]);
  const fetchPage = vi.fn(async (input: { url: string }) => ({
    bytes: Buffer.alloc(128, input.url.endsWith('1.jpg') ? 1 : 2),
    byteLength: 128,
    contentType: 'image/jpeg',
  }));
  const importChapter = vi.fn((input: { title: string; pages: unknown[]; source: unknown }) => ({
    item: {
      id: 'library-item',
      title: input.title,
      kind: 'manga' as const,
      createdAt: 1,
      pageCount: input.pages.length,
      readingSource: input.source,
    },
    alreadyPresent: false,
  }));
  return { fetchEntry, fetchPages, fetchPage, importChapter } as unknown as MangaChapterDownloadDependencies;
}

const input = {
  mediaId: 30_002,
  providerId: 'fixture',
  providerLabel: 'Fixture provider',
  chapterId: 'chapter-1',
  chapterNumber: '1',
  chapterTitle: '第一話',
  language: 'ja',
};

describe('downloadMangaChapter', () => {
  it('preserves page order, headers and canonical provider identity', async () => {
    const deps = dependencies();
    const result = await downloadMangaChapter(input, deps);

    expect(deps.fetchPage).toHaveBeenNthCalledWith(1, {
      url: 'https://cdn/1.jpg',
      headers: { Referer: 'https://provider' },
    });
    expect(deps.importChapter).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Berserk — Chapter 1 — 第一話',
      source: expect.objectContaining({
        mediaId: 30_002,
        malId: 2,
        workId: 'seanime-manga:30002',
        workTitle: 'Berserk',
        editionId: 'seanime:fixture:30002',
        providerId: 'fixture',
        chapterId: 'chapter-1',
      }),
    }));
    expect(result).toMatchObject({ pageCount: 2, alreadyPresent: false });
  });

  it('does not repeat a provider title that already includes the chapter number', async () => {
    const deps = dependencies();
    await downloadMangaChapter({ ...input, chapterTitle: 'Chapter 1 - 第一話' }, deps);
    expect(deps.importChapter).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Berserk — Chapter 1 - 第一話',
    }));
  });

  it('does not import a partial chapter when one page fails', async () => {
    const deps = dependencies();
    vi.mocked(deps.fetchPage).mockImplementation(async (page) => {
      if (page.url.endsWith('2.jpg')) throw new Error('HTTP 403');
      return { bytes: Buffer.alloc(128), byteLength: 128, contentType: 'image/jpeg' };
    });

    await expect(downloadMangaChapter(input, deps)).rejects.toThrow(/page 2 of 2.*403/i);
    expect(deps.importChapter).not.toHaveBeenCalled();
  });

  it('rejects malformed renderer input before making a provider call', async () => {
    const deps = dependencies();
    await expect(downloadMangaChapter({ ...input, mediaId: -1 }, deps)).rejects.toThrow(/media ID/i);
    expect(deps.fetchEntry).not.toHaveBeenCalled();
  });
});
