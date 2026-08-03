/**
 * Seanime manga adapter for Phase 5.
 *
 * The same narrow shape as `scraper/seanimeSources.ts` is for streams: it reads
 * an entry, its chapters and a chapter's pages, and projects them onto the
 * canonical reading contracts. It does not install extensions, change Seanime
 * preferences, download chapters, or write reading progress — Study OS keeps
 * ownership of progress, and the retained readers keep ownership of rendering.
 *
 * Both list routes are POST with a JSON body, which is Seanime's convention for
 * these two rather than an oversight.
 */

import type {
  AL_BaseManga,
  AL_ListManga,
  ExtensionRepo_MangaProviderExtensionItem,
  HibikeManga_ChapterDetails,
  HibikeManga_ChapterPage,
  Manga_ChapterContainer,
  Manga_Entry,
  Manga_PageContainer,
} from '../../../vendor/seanime/generated/types';
import type {
  ReadingMangaCatalogueItem,
  ReadingMangaCataloguePage,
  ReadingMangaProvider,
  ReadingMangaSearchInput,
} from '../../shared/readingIpc';
import {
  sortReadingChapters,
  type ReadingChapter,
  type ReadingEdition,
  type ReadingPage,
  type ReadingWork,
} from '../../shared/readingModel';
import { seanimeApi } from '../seanime/client';

const ENTRY_ROUTE = '/api/v1/manga/entry';
const CHAPTERS_ROUTE = '/api/v1/manga/chapters';
const PAGES_ROUTE = '/api/v1/manga/pages';
const PROVIDERS_ROUTE = '/api/v1/extensions/list/manga-provider';
const CATALOGUE_ROUTE = '/api/v1/manga/anilist/list';

/** Study OS identity for a provider-backed manga edition. Stable per provider. */
export function mangaEditionId(mediaId: number, providerId: string): string {
  return `seanime:${providerId}:${mediaId}`;
}

export function mangaWorkId(mediaId: number): string {
  return `seanime-manga:${mediaId}`;
}

export function readingWorkFromMangaEntry(entry: Manga_Entry): ReadingWork {
  const media: AL_BaseManga | undefined = entry.media;
  const title = media?.title;
  return {
    contentType: 'manga',
    workId: mangaWorkId(entry.mediaId),
    // AniList leaves any of these unset per title, so this walks the same
    // preference order the Study OS catalogue already uses.
    title: title?.userPreferred || title?.english || title?.romaji || title?.native || '',
    titleNative: title?.native || '',
    aniListId: entry.mediaId || null,
    malId: media?.idMal ?? null,
  };
}

export function readingEditionFromMangaEntry(
  entry: Manga_Entry,
  providerId: string,
  providerLabel: string,
): ReadingEdition {
  const media = entry.media;
  return {
    editionId: mangaEditionId(entry.mediaId, providerId),
    workId: mangaWorkId(entry.mediaId),
    format: 'image-series',
    origin: 'provider',
    providerId,
    providerLabel: providerLabel || providerId,
    language: '',
    coverRef: media?.coverImage?.extraLarge || media?.coverImage?.large || '',
    // Chapters, not pages: a provider chapter feed has no fixed page count
    // until a chapter is opened.
    unitCount: 0,
  };
}

export function readingChapterFromDetails(
  chapter: HibikeManga_ChapterDetails,
  editionId: string,
): ReadingChapter {
  return {
    chapterId: chapter.id,
    editionId,
    // Seanime's chapter feed is flat; volumes are not modelled upstream.
    volumeId: null,
    number: chapter.chapter || '',
    title: chapter.title || '',
    index: chapter.index,
    scanlator: chapter.scanlator || '',
    language: chapter.language || '',
  };
}

/**
 * Page dimensions arrive in a separate map keyed by page number, and only when
 * the caller asked for double-page mode. A missing entry means "unknown", which
 * readers must treat as "measure it yourself" rather than as zero-sized.
 */
export function readingPageFromChapterPage(
  page: HibikeManga_ChapterPage,
  dimensions: Manga_PageContainer['pageDimensions'],
): ReadingPage {
  const size = dimensions?.[page.index];
  return {
    index: page.index,
    url: page.url,
    // Kept, for the same reason stream headers are: many provider CDNs 403 a
    // request without their Referer/User-Agent pair, so a page without them is
    // a URL no reader can display.
    headers: { ...(page.headers ?? {}) },
    width: size?.width ?? 0,
    height: size?.height ?? 0,
  };
}

export function readingProviderFromExtension(
  item: ExtensionRepo_MangaProviderExtensionItem,
): ReadingMangaProvider {
  return { id: item.id, name: item.name || item.id, lang: item.lang || '' };
}

export function readingCatalogueItemFromManga(media: AL_BaseManga): ReadingMangaCatalogueItem {
  const title = media.title;
  return {
    mediaId: media.id,
    malId: media.idMal ?? null,
    title: title?.userPreferred || title?.english || title?.romaji || title?.native || '',
    titleNative: title?.native || '',
    description: (media.description || '').replace(/<[^>]+>/g, '').trim(),
    year: media.startDate?.year ?? null,
    format: media.format || '',
    status: media.status || '',
    chapterCount: media.chapters ?? null,
    genres: [...(media.genres ?? [])],
    meanScore: media.meanScore ?? null,
    coverUrl: media.coverImage?.extraLarge || media.coverImage?.large || media.coverImage?.medium || '',
  };
}

export async function fetchMangaCatalogue(
  input: ReadingMangaSearchInput,
): Promise<ReadingMangaCataloguePage> {
  const page = Math.max(1, Math.trunc(input.page) || 1);
  const perPage = Math.max(1, Math.min(50, Math.trunc(input.perPage) || 25));
  const search = input.search.trim().slice(0, 160);
  const response = await seanimeApi<AL_ListManga>(CATALOGUE_ROUTE, {
    method: 'POST',
    body: {
      page,
      perPage,
      ...(search ? { search, sort: ['SEARCH_MATCH'] } : { sort: ['POPULARITY_DESC'] }),
      isAdult: false,
    },
  });
  const info = response.Page?.pageInfo;
  return {
    items: (response.Page?.media ?? [])
      .map(readingCatalogueItemFromManga)
      .filter((item) => item.title.length > 0),
    page: info?.currentPage ?? page,
    hasNextPage: info?.hasNextPage === true,
    total: info?.total ?? null,
  };
}

export async function fetchMangaEntry(mediaId: number): Promise<Manga_Entry> {
  return seanimeApi<Manga_Entry>(`${ENTRY_ROUTE}/${mediaId}`);
}

/**
 * The installed manga provider extensions.
 *
 * A chapter feed is meaningless without one, and the set is whatever the user
 * has installed — so this is read at call time rather than baked into a
 * catalogue. Sorted by display name because the route's order follows the
 * extension registry, which has no meaning to a reader.
 */
export async function fetchMangaProviders(): Promise<ReadingMangaProvider[]> {
  const items = await seanimeApi<ExtensionRepo_MangaProviderExtensionItem[]>(PROVIDERS_ROUTE);
  return (items ?? [])
    .map(readingProviderFromExtension)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function fetchMangaChapters(
  mediaId: number,
  providerId: string,
): Promise<ReadingChapter[]> {
  const container = await seanimeApi<Manga_ChapterContainer>(CHAPTERS_ROUTE, {
    method: 'POST',
    body: { mediaId, provider: providerId },
  });
  const editionId = mangaEditionId(mediaId, providerId);
  return sortReadingChapters(
    (container.chapters ?? []).map((chapter) => readingChapterFromDetails(chapter, editionId)),
  );
}

export async function fetchMangaChapterPages(
  mediaId: number,
  providerId: string,
  chapterId: string,
  doublePage = false,
): Promise<ReadingPage[]> {
  const container = await seanimeApi<Manga_PageContainer>(PAGES_ROUTE, {
    method: 'POST',
    body: { mediaId, provider: providerId, chapterId, doublePage },
  });
  return (container.pages ?? [])
    .map((page) => readingPageFromChapterPage(page, container.pageDimensions))
    .sort((a, b) => a.index - b.index);
}
