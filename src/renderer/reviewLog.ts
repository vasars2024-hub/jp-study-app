// Durable review log (IndexedDB) — see shared/reviewLog.ts for the row shape.
//
// Every graded review and practice answer is appended here and counted into
// the day's statistics (`stats.recordReviewActivity`), which is what makes a
// day of reviewing keep the streak alive and gives Statistics its Reviews card.
//
// The log is loaded lazily. Rows appended before the load finishes are held
// and merged afterwards, so the first write of a session can never replace a
// year of history with the handful of rows this window has seen.
//
// Writes never store this window's copy. They send only what this window
// changed (rows added, rows undone) and merge it by id into whatever is stored,
// in the same IndexedDB transaction that reads it (`kvUpdate`). Before, a read
// that failed became [] and the next save replaced the history with it, and
// two windows each saved their own cache over the other's rows. A stored value
// that is not a review log at all is never written over.

import { kvGet, kvUpdate } from './storage/db';
import { recordReviewActivity } from './stats';
import {
  normalizeReviewLog,
  REVIEW_LOG_LIMIT,
  type ReviewLogEntry,
} from '../shared/reviewLog';

/** IndexedDB key. Not in IDB_KEYS on purpose: the migration runner owns those. */
export const REVIEW_LOG_IDB_KEY = 'review-log-v1';
export const REVIEW_LOG_EVENT = 'jp-review-log-changed';

let cache: ReviewLogEntry[] | null = null;
let loading: Promise<ReviewLogEntry[]> | null = null;
/** Rows this window added that are not stored yet. */
let heldAppends: ReviewLogEntry[] = [];
/** Row ids this window undid that may still be stored. */
let heldRemovals = new Set<string>();
let writeChain: Promise<void> = Promise.resolve();

function newId(): string {
  return `rv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function emit(): void {
  try {
    window.dispatchEvent(new CustomEvent(REVIEW_LOG_EVENT));
  } catch {
    /* non-browser context */
  }
}

function withHeld(rows: readonly ReviewLogEntry[]): ReviewLogEntry[] {
  return normalizeReviewLog([...rows, ...heldAppends]).filter((entry) => !heldRemovals.has(entry.id));
}

/** A stored value this module may merge into: nothing yet, or a review log. */
function isReviewLogValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return true;
  return typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries);
}

export function loadReviewLog(): Promise<ReviewLogEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = (async () => {
      let stored: ReviewLogEntry[] = [];
      try {
        stored = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY));
      } catch {
        // Shown as what this window has; the history is untouched, because a
        // write merges into what is stored instead of replacing it.
        stored = [];
      }
      cache = withHeld(stored);
      if (heldAppends.length || heldRemovals.size) persist();
      return cache;
    })();
  }
  return loading;
}

function persist(): void {
  writeChain = writeChain
    .then(async () => {
      const appends = heldAppends.slice();
      const removals = new Set(heldRemovals);
      if (!appends.length && !removals.size) return;
      let merged = null as ReviewLogEntry[] | null;
      await kvUpdate(REVIEW_LOG_IDB_KEY, (current) => {
        if (!isReviewLogValue(current)) return undefined;
        merged = normalizeReviewLog([...normalizeReviewLog(current), ...appends])
          .filter((entry) => !removals.has(entry.id));
        return { version: 1, entries: merged };
      });
      if (!merged) {
        console.warn('[review-log] stored log is unreadable; keeping new rows in memory instead of overwriting it');
        return;
      }
      heldAppends = heldAppends.filter((entry) => !appends.includes(entry));
      for (const id of removals) heldRemovals.delete(id);
      // Rows other windows stored meanwhile are in `merged` too.
      cache = withHeld(merged);
      emit();
    })
    .catch((error) => {
      console.error('[review-log] IndexedDB write failed:', error);
    });
}

/** Test seam: wait for queued writes. */
export function flushReviewLogWrites(): Promise<void> {
  return writeChain;
}

/** Test seam: forget the in-memory copy. */
export function resetReviewLogForTests(): void {
  cache = null;
  loading = null;
  heldAppends = [];
  heldRemovals = new Set();
  writeChain = Promise.resolve();
}

/**
 * Record one answer. Returns the row, whose id `removeReviewLogEntry` takes
 * when the answer is undone.
 */
export function appendReviewLog(input: Omit<ReviewLogEntry, 'id' | 'at'> & { at?: number }): ReviewLogEntry {
  const entry: ReviewLogEntry = { ...input, id: newId(), at: input.at ?? Date.now() };
  recordReviewActivity(entry.mode === 'review' ? 'review' : 'practice', entry.correct, entry.at);
  heldAppends.push(entry);
  if (cache) {
    cache.push(entry);
    if (cache.length > REVIEW_LOG_LIMIT) cache = cache.slice(cache.length - REVIEW_LOG_LIMIT);
    persist();
  } else {
    void loadReviewLog();
  }
  emit();
  return entry;
}

/** Take back one answer (review undo). */
export function removeReviewLogEntry(entry: ReviewLogEntry): void {
  recordReviewActivity(entry.mode === 'review' ? 'review' : 'practice', entry.correct, entry.at, true);
  heldAppends = heldAppends.filter((row) => row.id !== entry.id);
  heldRemovals.add(entry.id);
  if (cache) {
    cache = cache.filter((row) => row.id !== entry.id);
    persist();
  } else {
    void loadReviewLog();
  }
  emit();
}

export function onReviewLogChanged(cb: () => void): () => void {
  window.addEventListener(REVIEW_LOG_EVENT, cb);
  return () => window.removeEventListener(REVIEW_LOG_EVENT, cb);
}
