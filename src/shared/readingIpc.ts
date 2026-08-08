/**
 * Wire contract for provider-backed reading (Phase 5).
 *
 * The same split as `scraperIpc.ts`: this pins down *how* the reading boundary
 * crosses processes, while `readingModel.ts` describes *what* is carried. It
 * lives in shared/ because both sides import it and neither may import the
 * other.
 *
 * Read-only by design. Study OS keeps ownership of reading progress and of the
 * readers themselves, so there is deliberately no channel here that writes
 * progress, downloads a chapter, or changes a Seanime preference.
 */

import type { ReadingChapter, ReadingEdition, ReadingPage, ReadingWork } from './readingModel';
import type { LibraryItem } from './types';

// Keep the workspace route contract reachable from the existing Reading
// boundary so future main/preload handoffs do not invent a second route shape.
export {
  READING_WORKSPACE_SCHEMA_VERSION,
  normalizeReadingWorkspaceRoute,
  serializeReadingWorkspaceRoute,
} from './readingWorkspace';
export type {
  ReadingWorkspaceEntry,
  ReadingWorkspaceIntent,
  ReadingWorkspaceRoute,
  ReadingWorkspaceSection,
} from './readingWorkspace';

export const READING_CHANNELS = {
  mangaEntry: 'reading:mangaEntry',
  mangaChapters: 'reading:mangaChapters',
  mangaChapterPages: 'reading:mangaChapterPages',
  mangaProviders: 'reading:mangaProviders',
  mangaPageImage: 'reading:mangaPageImage',
  mangaSearch: 'reading:mangaSearch',
  mangaDownloadChapter: 'reading:mangaDownloadChapter',
} as const;

/** An installed manga provider extension, as offered to a chapter browser. */
export interface ReadingMangaProvider {
  id: string;
  name: string;
  /** ISO 639-1 language code. */
  lang: string;
}

export interface ReadingMangaCatalogueItem {
  mediaId: number;
  malId: number | null;
  title: string;
  titleNative: string;
  description: string;
  year: number | null;
  format: string;
  status: string;
  chapterCount: number | null;
  genres: string[];
  /** AniList score on a 0–100 scale. */
  meanScore: number | null;
  coverUrl: string;
}

export interface ReadingMangaCataloguePage {
  items: ReadingMangaCatalogueItem[];
  page: number;
  hasNextPage: boolean;
  total: number | null;
}

export interface ReadingMangaSearchInput {
  search: string;
  page: number;
  perPage: number;
}

export interface ReadingPageImageInput {
  url: string;
  headers: Record<string, string>;
}

/**
 * A fetched page, as bytes rather than as a URL.
 *
 * The renderer cannot display a provider page itself: an `<img src>` sends no
 * custom headers, and the Referer/User-Agent pair on `ReadingPage.headers` is
 * exactly what the CDN checks. Fetching in main and handing back the bytes
 * keeps every provider credential on the main side — the same reason
 * `stripReadingPageSecrets` exists — instead of moving headers into a renderer
 * that would then have to be trusted with them.
 */
export interface ReadingPageImage {
  /** `data:` URL, directly assignable to an `<img>`. */
  dataUrl: string;
  byteLength: number;
  contentType: string;
}

export interface ReadingMangaEntryInput {
  mediaId: number;
  providerId: string;
  providerLabel: string;
}

export interface ReadingMangaEntryResult {
  work: ReadingWork;
  edition: ReadingEdition;
}

export interface ReadingMangaChaptersInput {
  mediaId: number;
  providerId: string;
}

export interface ReadingMangaPagesInput {
  mediaId: number;
  providerId: string;
  chapterId: string;
  /** Seanime only measures page dimensions when double-page mode is requested. */
  doublePage: boolean;
}

export interface ReadingMangaDownloadInput {
  mediaId: number;
  providerId: string;
  providerLabel: string;
  chapterId: string;
  chapterNumber: string;
  chapterTitle: string;
  language: string;
}

export interface ReadingMangaDownloadResult {
  item: LibraryItem;
  pageCount: number;
  alreadyPresent: boolean;
}

/**
 * Every reading call can fail because the sidecar is down or the provider
 * answered badly, and a reader has to tell those apart from "this chapter is
 * genuinely empty". So results carry their own state rather than throwing
 * across the boundary, matching `AcquisitionProviderInventory`.
 */
export type ReadingBackendState = 'ready' | 'disabled' | 'offline' | 'error';

export interface ReadingResult<T> {
  state: ReadingBackendState;
  message: string;
  data: T | null;
}

export type ReadingChaptersResponse = ReadingResult<ReadingChapter[]>;
export type ReadingPagesResponse = ReadingResult<ReadingPage[]>;
export type ReadingEntryResponse = ReadingResult<ReadingMangaEntryResult>;
export type ReadingProvidersResponse = ReadingResult<ReadingMangaProvider[]>;
export type ReadingPageImageResponse = ReadingResult<ReadingPageImage>;
export type ReadingMangaSearchResponse = ReadingResult<ReadingMangaCataloguePage>;
export type ReadingMangaDownloadResponse = ReadingResult<ReadingMangaDownloadResult>;
