// Durable review log (IndexedDB) — see shared/reviewLog.ts for the row shape.
//
// Every graded review and practice answer is appended here and counted into
// the day's statistics (`stats.recordReviewActivity`), which is what makes a
// day of reviewing keep the streak alive and gives Statistics its Reviews card.
//
// The log is loaded lazily. Rows appended before the load finishes are held
// and merged afterwards, so the first write of a session can never replace a
// year of history with the handful of rows this window has seen.

import { kvGet, kvSet } from './storage/db';
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
let heldAppends: ReviewLogEntry[] = [];
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

export function loadReviewLog(): Promise<ReviewLogEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = (async () => {
      let stored: ReviewLogEntry[] = [];
      try {
        stored = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY));
      } catch {
        stored = [];
      }
      const merged = normalizeReviewLog([...stored, ...heldAppends])
        .filter((entry) => !heldRemovals.has(entry.id));
      const hadHeld = heldAppends.length > 0 || heldRemovals.size > 0;
      heldAppends = [];
      heldRemovals = new Set();
      cache = merged;
      if (hadHeld) persist();
      return merged;
    })();
  }
  return loading;
}

function persist(): void {
  const snapshot = cache ? cache.slice(-REVIEW_LOG_LIMIT) : null;
  if (!snapshot) return;
  writeChain = writeChain
    .then(() => kvSet(REVIEW_LOG_IDB_KEY, { version: 1, entries: snapshot }))
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
  if (cache) {
    cache.push(entry);
    if (cache.length > REVIEW_LOG_LIMIT) cache = cache.slice(cache.length - REVIEW_LOG_LIMIT);
    persist();
  } else {
    heldAppends.push(entry);
    void loadReviewLog();
  }
  emit();
  return entry;
}

/** Take back one answer (review undo). */
export function removeReviewLogEntry(entry: ReviewLogEntry): void {
  recordReviewActivity(entry.mode === 'review' ? 'review' : 'practice', entry.correct, entry.at, true);
  if (cache) {
    cache = cache.filter((row) => row.id !== entry.id);
    persist();
  } else {
    heldAppends = heldAppends.filter((row) => row.id !== entry.id);
    heldRemovals.add(entry.id);
    void loadReviewLog();
  }
  emit();
}

export function onReviewLogChanged(cb: () => void): () => void {
  window.addEventListener(REVIEW_LOG_EVENT, cb);
  return () => window.removeEventListener(REVIEW_LOG_EVENT, cb);
}
