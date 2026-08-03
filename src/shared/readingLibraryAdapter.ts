/**
 * Study OS's own library, projected onto the canonical reading contracts.
 *
 * `LibraryItem` predates the model and is not changed by it: the readers, the
 * import paths and the on-disk layout all keep working exactly as they do. This
 * is a projection, so the retained Study OS readers can be addressed through
 * the same types as an adopted Seanime manga source without either side being
 * rewritten (Phase 5, "Study OS readers kept").
 *
 * The interesting direction is `progress` — a `LibraryItem` stores a page index
 * *or* a `p:<part>:<frac>` string *or* a bare percent in one loose struct, and
 * which field is meaningful is implied by `kind`. The model makes that explicit,
 * which is the point of the locator union.
 */

import {
  isLocatorValidFor,
  locatorKindFor,
  type ReadingEdition,
  type ReadingFormat,
  type ReadingLocator,
  type ReadingProgress,
  type ReadingWork,
} from './readingModel';
import type { LibraryItem, Progress } from './types';

/**
 * An imported article is a `book` on disk but reads as text, so `kind` alone
 * cannot decide the format — `inboxMeta` is what distinguishes the two.
 */
export function readingFormatOf(item: LibraryItem): ReadingFormat {
  if (item.kind === 'manga') return 'image-series';
  return item.epubFile ? 'epub' : 'text';
}

export function readingWorkFromLibraryItem(item: LibraryItem): ReadingWork {
  const source = item.readingSource;
  return {
    contentType: item.kind === 'manga' ? 'manga' : item.inboxMeta ? 'article' : 'novel',
    workId: source?.workId ?? item.id,
    title: source?.workTitle ?? item.title,
    titleNative: source?.workTitleNative ?? '',
    aniListId: source?.mediaId ?? null,
    malId: source?.malId ?? null,
  };
}

export function readingEditionFromLibraryItem(item: LibraryItem): ReadingEdition {
  const source = item.readingSource;
  return {
    editionId: source?.editionId ?? item.id,
    workId: source?.workId ?? item.id,
    format: readingFormatOf(item),
    origin: 'local',
    providerId: source?.providerId ?? '',
    providerLabel: source?.providerLabel ?? '',
    language: source?.language ?? item.levelMeta?.lang ?? item.inboxMeta?.lang ?? '',
    coverRef: item.coverPath ?? '',
    unitCount: item.kind === 'manga' ? item.pageCount ?? 0 : 0,
  };
}

/**
 * `Progress` is permissive by design — every field is optional and older items
 * predate some of them. Rather than guess, this returns null when the stored
 * shape cannot address the item's format, and the caller starts from the
 * beginning. A wrong locator is worse than no locator: it reopens the reader at
 * a position that does not mean what it says.
 */
export function readingLocatorFromProgress(
  item: LibraryItem,
  progress: Progress | undefined,
): ReadingLocator | null {
  if (!progress) return null;
  const kind = locatorKindFor(readingFormatOf(item));
  if (kind === 'page') {
    return Number.isInteger(progress.page) && (progress.page as number) >= 0
      ? { kind: 'page', index: progress.page as number }
      : null;
  }
  // The novel reader's saved position. A very old save is a bare number — a
  // fraction of the *whole book* — which cannot be turned into a part index
  // without the chapter weights the reader alone has. Returning null hands that
  // case back to the reader's existing legacy path instead of guessing a part.
  const match = progress.location ? STORED_PART_LOCATION.exec(progress.location) : null;
  if (!match) return null;
  const part = Number(match[1]);
  const fraction = Number(match[2]);
  return Number.isInteger(part) &&
    part >= 0 &&
    Number.isFinite(fraction) &&
    fraction >= 0 &&
    fraction <= 1
    ? { kind: 'part', part, fraction }
    : null;
}

/** Mirrors `parseLoc` in `NovelReader.tsx` — the only producer of this field. */
const STORED_PART_LOCATION = /^p:(\d+):([\d.]+)$/;

export function readingProgressFromLibraryItem(item: LibraryItem): ReadingProgress | null {
  const locator = readingLocatorFromProgress(item, item.progress);
  if (!locator) return null;
  return {
    editionId: item.readingSource?.editionId ?? item.id,
    chapterId: item.readingSource?.chapterId ?? null,
    locator,
    percent: clampPercent(item.progress?.percent),
    updatedAt: item.lastReadAt ?? item.createdAt,
  };
}

/**
 * The reverse projection, so a reader that has been moved onto the model can
 * still write back the shape the existing library, badges and sync already
 * read. Nothing downstream has to change at the same time as the reader.
 */
export function progressFromReadingLocator(
  item: LibraryItem,
  locator: ReadingLocator,
  percent: number,
): Progress {
  if (!isLocatorValidFor(readingFormatOf(item), locator)) {
    throw new Error(
      `Locator "${locator.kind}" cannot address a ${readingFormatOf(item)} edition.`,
    );
  }
  const next: Progress = { percent: clampPercent(percent) };
  if (locator.kind === 'page') next.page = locator.index;
  // `toFixed(4)` is not cosmetic: it reproduces byte-for-byte what
  // `NovelReader.saveNow` already writes, so moving the reader onto the model
  // does not change a single stored value.
  if (locator.kind === 'part') next.location = `p:${locator.part}:${locator.fraction.toFixed(4)}`;
  return next;
}

function clampPercent(value: number | undefined): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
