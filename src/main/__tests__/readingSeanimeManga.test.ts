// @vitest-environment node

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  AL_ListManga,
  Manga_ChapterContainer,
  Manga_Entry,
  Manga_PageContainer,
} from '../../../vendor/seanime/generated/types';

const api = vi.hoisted(() => ({
  calls: [] as { route: string; method: string | undefined; body: unknown }[],
  handler: async (route: string, body: unknown): Promise<unknown> => {
    void route;
    void body;
    return undefined;
  },
}));

vi.mock('../seanime/client', () => ({
  SeanimeUnavailableError: class SeanimeUnavailableError extends Error {},
  seanimeApi: async (route: string, options?: { method?: string; body?: unknown }) => {
    api.calls.push({ route, method: options?.method, body: options?.body });
    return api.handler(route, options?.body);
  },
}));

import {
  fetchMangaCatalogue,
  fetchMangaChapterPages,
  fetchMangaChapters,
  fetchMangaEntry,
  fetchMangaProviders,
  mangaEditionId,
  readingChapterFromDetails,
  readingEditionFromMangaEntry,
  readingPageFromChapterPage,
  readingWorkFromMangaEntry,
} from '../reading/seanimeManga';

function entry(overrides: Partial<Manga_Entry['media']> = {}): Manga_Entry {
  return {
    mediaId: 30_002,
    media: {
      id: 30_002,
      idMal: 44,
      title: { userPreferred: 'Berserk', native: 'ベルセルク', romaji: 'Berserk' },
      coverImage: { extraLarge: 'https://cdn/xl.jpg', large: 'https://cdn/l.jpg' },
      ...overrides,
    },
  } as Manga_Entry;
}

beforeEach(() => {
  api.calls.length = 0;
  api.handler = async () => undefined;
});

describe('manga entry projection', () => {
  it('projects a work with both titles and both external ids', () => {
    expect(readingWorkFromMangaEntry(entry())).toEqual({
      contentType: 'manga',
      workId: 'seanime-manga:30002',
      title: 'Berserk',
      titleNative: 'ベルセルク',
      aniListId: 30_002,
      malId: 44,
    });
  });

  it('walks the AniList title preference order when userPreferred is unset', () => {
    const romajiOnly = readingWorkFromMangaEntry(
      entry({ title: { romaji: 'Vinland Saga' } } as Partial<Manga_Entry['media']>),
    );
    expect(romajiOnly.title).toBe('Vinland Saga');
    expect(romajiOnly.titleNative).toBe('');
  });

  it('survives an entry with no media at all', () => {
    const bare = readingWorkFromMangaEntry({ mediaId: 7 } as Manga_Entry);
    expect(bare).toMatchObject({ workId: 'seanime-manga:7', title: '', malId: null });
  });

  it('keys the edition by provider so two providers are two editions', () => {
    const a = readingEditionFromMangaEntry(entry(), 'mangadex', 'MangaDex');
    const b = readingEditionFromMangaEntry(entry(), 'comick', 'ComicK');

    expect(a.editionId).not.toBe(b.editionId);
    expect(a.workId).toBe(b.workId);
    expect(a).toMatchObject({
      format: 'image-series',
      origin: 'provider',
      providerId: 'mangadex',
      providerLabel: 'MangaDex',
      coverRef: 'https://cdn/xl.jpg',
      // A chapter feed has no page count until a chapter is opened.
      unitCount: 0,
    });
  });

  it('falls back to the provider id when the label is missing', () => {
    expect(readingEditionFromMangaEntry(entry(), 'comick', '').providerLabel).toBe('comick');
  });
});

describe('chapter projection', () => {
  it('carries scanlator and language, and leaves volume unset', () => {
    expect(
      readingChapterFromDetails(
        {
          provider: 'mangadex',
          id: 'ch-9',
          url: 'https://example/ch-9',
          title: 'The Golden Age',
          chapter: '9',
          index: 8,
          scanlator: 'Group',
          language: 'en',
        },
        'edition-1',
      ),
    ).toEqual({
      chapterId: 'ch-9',
      editionId: 'edition-1',
      volumeId: null,
      number: '9',
      title: 'The Golden Age',
      index: 8,
      scanlator: 'Group',
      language: 'en',
    });
  });

  it('normalizes absent optional fields to empty strings', () => {
    const chapter = readingChapterFromDetails(
      { provider: 'p', id: 'c', url: '', title: '', chapter: '', index: 0 },
      'edition-1',
    );
    expect(chapter).toMatchObject({ number: '', title: '', scanlator: '', language: '' });
  });
});

describe('page projection', () => {
  it('keeps request headers — a page without them is a URL that 403s', () => {
    const page = readingPageFromChapterPage(
      {
        provider: 'p',
        url: 'https://cdn/1.jpg',
        index: 0,
        headers: { Referer: 'https://provider', 'User-Agent': 'Seanime' },
      },
      undefined,
    );
    expect(page.headers).toEqual({ Referer: 'https://provider', 'User-Agent': 'Seanime' });
  });

  it('copies headers rather than aliasing the provider response', () => {
    const source = { provider: 'p', url: 'u', index: 0, headers: { Referer: 'a' } };
    const page = readingPageFromChapterPage(source, undefined);
    source.headers.Referer = 'mutated';
    expect(page.headers.Referer).toBe('a');
  });

  it('reports unknown dimensions as 0 so a reader measures instead of trusting', () => {
    const dimensions: Manga_PageContainer['pageDimensions'] = { 1: { width: 800, height: 1200 } };
    expect(readingPageFromChapterPage({ provider: 'p', url: 'u', index: 0 }, dimensions)).toMatchObject(
      { width: 0, height: 0 },
    );
    expect(readingPageFromChapterPage({ provider: 'p', url: 'u', index: 1 }, dimensions)).toMatchObject(
      { width: 800, height: 1200 },
    );
  });
});

describe('sidecar calls', () => {
  it('searches the Seanime AniList manga catalogue and projects its page', async () => {
    const response: AL_ListManga = {
      Page: {
        media: [{
          id: 30_002,
          idMal: 2,
          title: { userPreferred: 'Berserk', native: 'ベルセルク' },
          format: 'MANGA',
          chapters: 380,
          meanScore: 92,
          genres: ['Action', 'Drama'],
          startDate: { year: 1989 },
          coverImage: { extraLarge: 'https://cdn/berserk.jpg' },
        }],
        pageInfo: { currentPage: 1, hasNextPage: true, total: 40 },
      },
    };
    api.handler = async () => response;

    const result = await fetchMangaCatalogue({ search: 'Berserk', page: 1, perPage: 25 });

    expect(api.calls[0]).toMatchObject({
      route: '/api/v1/manga/anilist/list',
      method: 'POST',
      body: {
        search: 'Berserk',
        page: 1,
        perPage: 25,
        sort: ['SEARCH_MATCH'],
        isAdult: false,
      },
    });
    expect(result).toMatchObject({
      page: 1,
      hasNextPage: true,
      total: 40,
      items: [{
        mediaId: 30_002,
        malId: 2,
        title: 'Berserk',
        titleNative: 'ベルセルク',
        chapterCount: 380,
        meanScore: 92,
      }],
    });
  });

  it('uses the popular manga catalogue when the search box is empty', async () => {
    api.handler = async () => ({ Page: { media: [] } } as AL_ListManga);
    await fetchMangaCatalogue({ search: '   ', page: 0, perPage: 500 });
    expect(api.calls[0].body).toEqual({
      page: 1,
      perPage: 50,
      sort: ['POPULARITY_DESC'],
      isAdult: false,
    });
  });

  it('reads an entry from the path route', async () => {
    api.handler = async () => entry();
    await fetchMangaEntry(30_002);
    expect(api.calls[0]).toMatchObject({ route: '/api/v1/manga/entry/30002', method: undefined });
  });

  it('POSTs the chapter list and returns it in reading order', async () => {
    const container: Manga_ChapterContainer = {
      mediaId: 30_002,
      provider: 'mangadex',
      chapters: [
        { provider: 'mangadex', id: 'c2', url: '', title: '', chapter: '2', index: 1 },
        { provider: 'mangadex', id: 'c1', url: '', title: '', chapter: '1', index: 0 },
      ],
    };
    api.handler = async () => container;

    const chapters = await fetchMangaChapters(30_002, 'mangadex');

    expect(api.calls[0]).toMatchObject({
      route: '/api/v1/manga/chapters',
      method: 'POST',
      body: { mediaId: 30_002, provider: 'mangadex' },
    });
    // The provider listed newest-first; the model orders by index.
    expect(chapters.map((c) => c.chapterId)).toEqual(['c1', 'c2']);
    expect(chapters[0].editionId).toBe(mangaEditionId(30_002, 'mangadex'));
  });

  it('treats a chapter list with no chapters as empty, not as a failure', async () => {
    api.handler = async () => ({ mediaId: 1, provider: 'p' } as Manga_ChapterContainer);
    await expect(fetchMangaChapters(1, 'p')).resolves.toEqual([]);
  });

  it('lists installed manga providers by display name', async () => {
    api.handler = async () => [
      { id: 'mangapill', name: 'Mangapill', lang: 'en' },
      { id: 'comick', name: 'ComicK', lang: 'en' },
    ];

    const providers = await fetchMangaProviders();

    expect(api.calls[0]).toMatchObject({ route: '/api/v1/extensions/list/manga-provider' });
    // The route's own order follows the extension registry, which means
    // nothing to a reader.
    expect(providers.map((p) => p.id)).toEqual(['comick', 'mangapill']);
  });

  it('falls back to the provider id when an extension has no display name', async () => {
    api.handler = async () => [{ id: 'local-fixture', name: '', lang: '' }];
    await expect(fetchMangaProviders()).resolves.toEqual([
      { id: 'local-fixture', name: 'local-fixture', lang: '' },
    ]);
  });

  it('treats no installed providers as empty, not as a failure', async () => {
    api.handler = async () => undefined;
    await expect(fetchMangaProviders()).resolves.toEqual([]);
  });

  it('POSTs the page request and returns pages in index order', async () => {
    const container: Manga_PageContainer = {
      mediaId: 30_002,
      provider: 'mangadex',
      chapterId: 'c1',
      isDownloaded: false,
      pages: [
        { provider: 'mangadex', url: 'https://cdn/2.jpg', index: 1 },
        { provider: 'mangadex', url: 'https://cdn/1.jpg', index: 0 },
      ],
    };
    api.handler = async () => container;

    const pages = await fetchMangaChapterPages(30_002, 'mangadex', 'c1');

    expect(api.calls[0]).toMatchObject({
      route: '/api/v1/manga/pages',
      method: 'POST',
      body: { mediaId: 30_002, provider: 'mangadex', chapterId: 'c1', doublePage: false },
    });
    expect(pages.map((p) => p.index)).toEqual([0, 1]);
  });

  it('passes doublePage through, since dimensions only arrive when it is set', async () => {
    api.handler = async () => ({ mediaId: 1, provider: 'p', chapterId: 'c', isDownloaded: false });
    await fetchMangaChapterPages(1, 'p', 'c', true);
    expect(api.calls[0].body).toMatchObject({ doublePage: true });
  });
});
