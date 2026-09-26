// Durable review log (IndexedDB) — see shared/reviewLog.ts for the row shape.
//
// Every graded review and practice answer is appended here and counted into
// the day's statistics (`stats.recordReviewActivity`), which is what makes a
// day of reviewing keep the streak alive and gives Statistics its Reviews card.
//
// Append-only. Each row is its own IndexedDB record (`review-log-row:<id>`), so
// recording an answer is one small put. It used to be a read-modify-write of the
// whole log in one value — 19,721 rows read, merged, sorted and written back on
// every grade, a large share of a grade's 0.35–0.63 s. The value that older
// builds wrote (`review-log-v1`) stays as the frozen head of the history; rows
// are only ever added beside it, and an undo deletes its own row.
//
// The log is loaded lazily. Rows appended before the load finishes are held
// and written as soon as possible, so the first write of a session can never
// replace a year of history with the handful of rows this window has seen —
// and nothing is ever written over the stored history at all, so a failed read
// or two windows answering at once cannot lose rows either. A stored v1 value
// that is not a review log is never written over.

import { kvBatch, kvGet, kvScanPrefix, kvUpdate } from './storage/db';
import { recordReviewActivity } from './stats';
import {
  normalizeReviewLog,
  normalizeReviewLogEntry,
  REVIEW_LOG_LIMIT,
  type ReviewLogEntry,
} from '../shared/reviewLog';

/** The whole-log value older builds wrote. Not in IDB_KEYS on purpose: the migration runner owns those. */
export const REVIEW_LOG_IDB_KEY = 'review-log-v1';
/** One record per row, appended. */
export const REVIEW_LOG_ROW_PREFIX = 'review-log-row:';
export const REVIEW_LOG_EVENT = 'jp-review-log-changed';

let cache: ReviewLogEntry[] | null = null;
let loading: Promise<ReviewLogEntry[]> | null = null;
/** Rows this window added that are not stored yet. */
let heldAppends: ReviewLogEntry[] = [];
/** Row ids this window undid that may still be stored. */
let heldRemovals = new Set<string>();
/**
 * Every row this window added, and every row it undid, this session. The first
 * load can race the first writes (a row stored between the load's read and its
 * return), so what the window shows is always what it read plus these.
 */
let ownRows: ReviewLogEntry[] = [];
let ownRemoved = new Set<string>();
/** Row ids stored in the v1 value (an undo of one of those rewrites it). */
let legacyIds = new Set<string>();
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
  return normalizeReviewLog([...rows, ...ownRows]).filter((entry) => !ownRemoved.has(entry.id));
}

/** A stored value this module may merge into: nothing yet, or a review log. */
function isReviewLogValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return true;
  return typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries);
}

async function readStored(): Promise<ReviewLogEntry[]> {
  const legacy = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY));
  legacyIds = new Set(legacy.map((entry) => entry.id));
  const rows: ReviewLogEntry[] = [];
  for (const [, value] of await kvScanPrefix(REVIEW_LOG_ROW_PREFIX)) {
    const entry = normalizeReviewLogEntry(value);
    if (entry) rows.push(entry);
  }
  return normalizeReviewLog([...legacy, ...rows]);
}

export function loadReviewLog(): Promise<ReviewLogEntry[]> {
  if (cache) return Promise.resolve(cache);
  if (!loading) {
    loading = (async () => {
      let stored: ReviewLogEntry[] = [];
      try {
        stored = await readStored();
      } catch {
        // Shown as what this window has; the history is untouched, because
        // nothing is ever written over it.
        stored = [];
      }
      cache = withHeld(stored);
      if (heldAppends.length || heldRemovals.size) persist();
      if (stored.length >= REVIEW_LOG_LIMIT) void pruneReviewLog().catch(() => undefined);
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
      await kvBatch([
        ...appends.map((entry) => ({ type: 'put' as const, key: `${REVIEW_LOG_ROW_PREFIX}${entry.id}`, value: entry })),
        ...[...removals].map((id) => ({ type: 'delete' as const, key: `${REVIEW_LOG_ROW_PREFIX}${id}` })),
      ]);
      const legacyRemovals = [...removals].filter((id) => legacyIds.has(id));
      if (legacyRemovals.length) {
        // A row an older build stored in the whole-log value: take it out of
        // that value, in one read-modify-write, never over an unreadable one.
        await kvUpdate(REVIEW_LOG_IDB_KEY, (current) => {
          if (!isReviewLogValue(current)) return undefined;
          const drop = new Set(legacyRemovals);
          return { version: 1, entries: normalizeReviewLog(current).filter((entry) => !drop.has(entry.id)) };
        });
        for (const id of legacyRemovals) legacyIds.delete(id);
      }
      heldAppends = heldAppends.filter((entry) => !appends.includes(entry));
      for (const id of removals) heldRemovals.delete(id);
      emit();
    })
    .catch((error) => {
      // The rows stay held and go with the next write.
      console.error('[review-log] IndexedDB write failed:', error);
    });
}

/**
 * Drop the oldest stored rows beyond `REVIEW_LOG_LIMIT` (the whole-log value
 * capped itself on every write). Run once in a while, not per answer.
 */
export async function pruneReviewLog(limit = REVIEW_LOG_LIMIT): Promise<number> {
  const rows = await kvScanPrefix(REVIEW_LOG_ROW_PREFIX);
  const legacyCount = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY)).length;
  const excess = rows.length + legacyCount - limit;
  if (excess <= 0) return 0;
  const oldest = rows
    .map(([key, value]) => ({ key, at: normalizeReviewLogEntry(value)?.at ?? 0 }))
    .sort((a, b) => a.at - b.at)
    .slice(0, excess);
  await kvBatch(oldest.map(({ key }) => ({ type: 'delete' as const, key })));
  return oldest.length;
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
  ownRows = [];
  ownRemoved = new Set();
  legacyIds = new Set();
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
  ownRows.push(entry);
  if (cache) {
    cache.push(entry);
    if (cache.length > REVIEW_LOG_LIMIT) cache = cache.slice(cache.length - REVIEW_LOG_LIMIT);
  } else {
    void loadReviewLog();
  }
  // Written now either way: an append needs nothing from the stored log.
  persist();
  emit();
  return entry;
}

/** Take back one answer (review undo). */
export function removeReviewLogEntry(entry: ReviewLogEntry): void {
  recordReviewActivity(entry.mode === 'review' ? 'review' : 'practice', entry.correct, entry.at, true);
  heldAppends = heldAppends.filter((row) => row.id !== entry.id);
  ownRows = ownRows.filter((row) => row.id !== entry.id);
  ownRemoved.add(entry.id);
  if (cache) cache = cache.filter((row) => row.id !== entry.id);
  // Deleted even if it may not be stored yet: its put could be in flight, and
  // the delete is queued after it.
  heldRemovals.add(entry.id);
  persist();
  emit();
}

export function onReviewLogChanged(cb: () => void): () => void {
  window.addEventListener(REVIEW_LOG_EVENT, cb);
  return () => window.removeEventListener(REVIEW_LOG_EVENT, cb);
}
