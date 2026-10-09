/**
 * Where in a book a card was mined — the pure half of the book round-trip
 * (`renderer/bookRoundTrip.ts` does the opening).
 *
 * The novel reader's locator is `p:<part>:<fraction>` (its bookmark and saved
 * progress format). It is validated here before anything can steer a reader
 * with it.
 */
import type { StudyContextRef } from './mediaStudyOrchestrator';

export interface BookPosition {
  bookId: string;
  /** The reader's locator: `p:<part>:<fraction>`. */
  loc: string;
  /** Whole-book fraction 0..1, for display only. */
  percent?: number;
}

const LOCATION = /^p:(\d{1,6}):(0(?:\.\d{1,8})?|1(?:\.0{1,8})?)$/;

export function isBookLocation(value: unknown): value is string {
  return typeof value === 'string' && LOCATION.test(value);
}

/** `p:<part>:<fraction>` for a reader position; the fraction is clamped and fixed to 4 places. */
export function bookLocation(part: number, fraction: number): string {
  const p = Math.max(0, Math.floor(Number.isFinite(part) ? part : 0));
  const f = Math.min(1, Math.max(0, Number.isFinite(fraction) ? fraction : 0));
  return `p:${p}:${f.toFixed(4)}`;
}

/** The `sourceRef` a novel-reader mine carries, or undefined for an invalid position. */
export function bookLocationRef(
  bookId: string,
  loc: string,
  percent?: number,
  sentence?: string,
): StudyContextRef | undefined {
  if (!bookId || !isBookLocation(loc)) return undefined;
  return {
    mediaId: bookId,
    bookLocation: loc,
    ...(typeof percent === 'number' && Number.isFinite(percent)
      ? { bookPercent: Math.min(1, Math.max(0, percent)) }
      : {}),
    ...(sentence?.trim() ? { sentence: sentence.trim().slice(0, 400) } : {}),
  };
}

type BookCard = { source?: string; bookId?: string; sourceRef?: StudyContextRef };

/** Where a deck card was mined in a book, or null when it was not mined in the novel reader. */
export function cardBookPosition(card: BookCard): BookPosition | null {
  const ref = card.sourceRef;
  if (card.source !== 'epub' || !ref || !isBookLocation(ref.bookLocation)) return null;
  const bookId = ref.mediaId || card.bookId;
  if (!bookId) return null;
  return {
    bookId,
    loc: ref.bookLocation,
    ...(typeof ref.bookPercent === 'number' && Number.isFinite(ref.bookPercent) ? { percent: ref.bookPercent } : {}),
  };
}
