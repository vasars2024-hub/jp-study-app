/**
 * Main-side registration for the Phase 5 reading boundary.
 *
 * Mirrors `scraper/index.ts`: one handler per channel, each returning a
 * `ReadingResult` rather than rejecting, so a reader can distinguish "the
 * sidecar is offline" from "this chapter has no pages" without catching.
 */

import { ipcMain } from 'electron';
import {
  READING_CHANNELS,
  type ReadingChaptersResponse,
  type ReadingEntryResponse,
  type ReadingMangaChaptersInput,
  type ReadingMangaDownloadInput,
  type ReadingMangaDownloadResponse,
  type ReadingMangaEntryInput,
  type ReadingMangaPagesInput,
  type ReadingMangaSearchInput,
  type ReadingMangaSearchResponse,
  type ReadingPageImageInput,
  type ReadingPageImageResponse,
  type ReadingPagesResponse,
  type ReadingProvidersResponse,
  type ReadingResult,
} from '../../shared/readingIpc';
import { SeanimeUnavailableError } from '../seanime/client';
import { fetchReadingPageImage } from './pageImage';
import { downloadMangaChapter } from './downloadChapter';
import {
  fetchMangaCatalogue,
  fetchMangaChapterPages,
  fetchMangaChapters,
  fetchMangaEntry,
  fetchMangaProviders,
  readingEditionFromMangaEntry,
  readingWorkFromMangaEntry,
} from './seanimeManga';

function failure<T>(error: unknown): ReadingResult<T> {
  const message = error instanceof Error ? error.message : String(error);
  return {
    state: error instanceof SeanimeUnavailableError
      ? /disabled/i.test(message) ? 'disabled' : 'offline'
      : 'error',
    message,
    data: null,
  };
}

function success<T>(data: T): ReadingResult<T> {
  return { state: 'ready', message: '', data };
}

export function registerReadingIpc(): void {
  ipcMain.handle(
    READING_CHANNELS.mangaSearch,
    async (_event, input: ReadingMangaSearchInput): Promise<ReadingMangaSearchResponse> => {
      try {
        return success(await fetchMangaCatalogue(input));
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaEntry,
    async (_event, input: ReadingMangaEntryInput): Promise<ReadingEntryResponse> => {
      try {
        const entry = await fetchMangaEntry(input.mediaId);
        return success({
          work: readingWorkFromMangaEntry(entry),
          edition: readingEditionFromMangaEntry(entry, input.providerId, input.providerLabel),
        });
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaChapters,
    async (_event, input: ReadingMangaChaptersInput): Promise<ReadingChaptersResponse> => {
      try {
        return success(await fetchMangaChapters(input.mediaId, input.providerId));
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaProviders,
    async (): Promise<ReadingProvidersResponse> => {
      try {
        return success(await fetchMangaProviders());
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaPageImage,
    async (_event, input: ReadingPageImageInput): Promise<ReadingPageImageResponse> => {
      try {
        return success(await fetchReadingPageImage(input));
      } catch (error) {
        // Not a sidecar call: this reaches the provider's CDN directly, so a
        // failure here is always `error`, never `offline`/`disabled`.
        return {
          state: 'error',
          message: error instanceof Error ? error.message : String(error),
          data: null,
        };
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaChapterPages,
    async (_event, input: ReadingMangaPagesInput): Promise<ReadingPagesResponse> => {
      try {
        return success(
          await fetchMangaChapterPages(
            input.mediaId,
            input.providerId,
            input.chapterId,
            input.doublePage,
          ),
        );
      } catch (error) {
        return failure(error);
      }
    },
  );

  ipcMain.handle(
    READING_CHANNELS.mangaDownloadChapter,
    async (_event, input: ReadingMangaDownloadInput): Promise<ReadingMangaDownloadResponse> => {
      try {
        return success(await downloadMangaChapter(input));
      } catch (error) {
        return failure(error);
      }
    },
  );
}
