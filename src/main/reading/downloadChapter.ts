import type {
  ReadingMangaDownloadInput,
  ReadingMangaDownloadResult,
} from '../../shared/readingIpc';
import { importProviderMangaChapter } from '../library';
import { fetchReadingPageBytes, type ReadingPageBytes } from './pageImage';
import {
  fetchMangaChapterPages,
  fetchMangaEntry,
  mangaEditionId,
  mangaWorkId,
  readingWorkFromMangaEntry,
} from './seanimeManga';

const DOWNLOAD_CONCURRENCY = 4;
const MAX_CHAPTER_BYTES = 400 * 1024 * 1024;

export interface MangaChapterDownloadDependencies {
  fetchEntry: typeof fetchMangaEntry;
  fetchPages: typeof fetchMangaChapterPages;
  fetchPage: typeof fetchReadingPageBytes;
  importChapter: typeof importProviderMangaChapter;
}

const DEFAULT_DEPENDENCIES: MangaChapterDownloadDependencies = {
  fetchEntry: fetchMangaEntry,
  fetchPages: fetchMangaChapterPages,
  fetchPage: fetchReadingPageBytes,
  importChapter: importProviderMangaChapter,
};

function safeText(value: string, limit: number): string {
  return typeof value === 'string' ? value.trim().slice(0, limit) : '';
}

export async function downloadMangaChapter(
  raw: ReadingMangaDownloadInput,
  deps: MangaChapterDownloadDependencies = DEFAULT_DEPENDENCIES,
): Promise<ReadingMangaDownloadResult> {
  const mediaId = Math.trunc(raw.mediaId);
  const providerId = safeText(raw.providerId, 160);
  const providerLabel = safeText(raw.providerLabel, 160) || providerId;
  const chapterId = safeText(raw.chapterId, 500);
  if (!Number.isInteger(mediaId) || mediaId <= 0) throw new Error('Invalid manga media ID.');
  if (!providerId) throw new Error('A manga provider is required.');
  if (!chapterId) throw new Error('A manga chapter is required.');

  const [entry, pages] = await Promise.all([
    deps.fetchEntry(mediaId),
    deps.fetchPages(mediaId, providerId, chapterId, false),
  ]);
  if (!pages.length) throw new Error('The provider returned no pages for this chapter.');

  const fetched: ReadingPageBytes[] = new Array(pages.length);
  let cursor = 0;
  let totalBytes = 0;
  const workers = Array.from({ length: Math.min(DOWNLOAD_CONCURRENCY, pages.length) }, async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= pages.length) return;
      try {
        const page = await deps.fetchPage({
          url: pages[index].url,
          headers: pages[index].headers,
        });
        totalBytes += page.byteLength;
        if (totalBytes > MAX_CHAPTER_BYTES) {
          throw new Error(`Chapter is over the ${MAX_CHAPTER_BYTES}-byte download limit.`);
        }
        fetched[index] = page;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new Error(`Could not download page ${index + 1} of ${pages.length}: ${message}`);
      }
    }
  });
  const downloads = await Promise.allSettled(workers);
  const failed = downloads.find((result): result is PromiseRejectedResult => result.status === 'rejected');
  if (failed) throw failed.reason;

  const work = readingWorkFromMangaEntry(entry);
  const number = safeText(raw.chapterNumber, 80);
  const chapterTitle = safeText(raw.chapterTitle, 200);
  const numberLabel = number ? `Chapter ${number}` : 'Chapter';
  const chapterLabel = chapterTitle
    && chapterTitle.toLocaleLowerCase().startsWith(numberLabel.toLocaleLowerCase())
    ? chapterTitle
    : [numberLabel, chapterTitle].filter(Boolean).join(' — ');
  const imported = deps.importChapter({
    title: `${work.title} — ${chapterLabel}`,
    pages: fetched.map((page) => ({ bytes: page.bytes, contentType: page.contentType })),
    source: {
      kind: 'seanime-manga-chapter',
      mediaId,
      ...(work.malId ? { malId: work.malId } : {}),
      workId: mangaWorkId(mediaId),
      workTitle: work.title,
      workTitleNative: work.titleNative,
      editionId: mangaEditionId(mediaId, providerId),
      providerId,
      providerLabel,
      chapterId,
      chapterNumber: number,
      chapterTitle,
      language: safeText(raw.language, 24),
    },
  });

  return {
    item: imported.item,
    pageCount: imported.item.pageCount ?? fetched.length,
    alreadyPresent: imported.alreadyPresent,
  };
}
