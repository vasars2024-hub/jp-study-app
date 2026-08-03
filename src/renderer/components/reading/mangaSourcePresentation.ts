import type { ReadingChapter } from '../../../shared/readingModel';

export type MangaChapterOrder = 'latest' | 'earliest';

export interface VisibleMangaChapters {
  items: ReadingChapter[];
  matchedCount: number;
  hiddenCount: number;
}

export function mangaChapterSourceKey(providerId: string, chapterId: string): string {
  return `${providerId}\u0000${chapterId}`;
}

export function visibleMangaChapters(
  chapters: ReadingChapter[],
  query: string,
  order: MangaChapterOrder,
  limit: number,
): VisibleMangaChapters {
  const needle = query.trim().toLocaleLowerCase();
  const matched = needle
    ? chapters.filter((chapter) => [
      chapter.number,
      chapter.title,
      chapter.scanlator,
      chapter.language,
    ].some((value) => value.toLocaleLowerCase().includes(needle)))
    : [...chapters];
  matched.sort((a, b) => (
    order === 'latest'
      ? b.index - a.index
      : a.index - b.index
  ));
  const safeLimit = Math.max(1, Math.trunc(limit) || 1);
  return {
    items: matched.slice(0, safeLimit),
    matchedCount: matched.length,
    hiddenCount: Math.max(0, matched.length - safeLimit),
  };
}

export function isEmptyProviderResult(message: string): boolean {
  return /no results found|no chapters|not found for this media/i.test(message);
}

/**
 * Providers that only serve what is already on this disk.
 *
 * Seanime ships `local-manga` as a built-in and always reports it installed, so
 * "a manga provider is installed" is true on a machine with no online source at
 * all. Asking it to enumerate an arbitrary catalogue title is not a request it
 * can answer — measured 2026-08-02 against Seanime 3.10.2 and AniList 31668
 * (Black Jack ni Yoroshiku): `/api/v1/manga/chapters` does not return empty, it
 * panics with a nil-pointer dereference in `GetMangaChapterContainer`, and the
 * dialog rendered the resulting `HTTP 500: fatal error occurred` verbatim.
 *
 * So the local provider is excluded from the *chapter* shelf. It stays valid
 * everywhere the reader opens something already downloaded.
 */
const LOCAL_ONLY_MANGA_PROVIDERS = new Set(['local-manga']);

export function isLocalOnlyMangaProvider(providerId: string): boolean {
  return LOCAL_ONLY_MANGA_PROVIDERS.has(providerId.trim().toLowerCase());
}

/**
 * A sidecar crash, as opposed to a provider that simply has nothing.
 *
 * Worth telling apart: "this provider lists no chapters" is a fact about the
 * title, and a 500 is a fact about the sidecar. Rendering the second as the
 * first would quietly blame the manga.
 */
export function isProviderCrash(message: string): boolean {
  return /HTTP 5\d\d|fatal error occurred|panic/i.test(message);
}

export function mangaChapterSecondaryTitle(chapter: ReadingChapter): string {
  const title = chapter.title.trim();
  const number = chapter.number.trim();
  if (!title || !number) return title;
  const escapedNumber = number.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return title
    .replace(new RegExp(`^chapter\\s*${escapedNumber}(?:\\s*[-—:：]\\s*|\\s+)?`, 'i'), '')
    .trim();
}
