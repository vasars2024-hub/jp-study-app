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
//
// Beyond `REVIEW_LOG_LIMIT` rows the oldest are ARCHIVED, not deleted: moved, in
// the same IndexedDB transaction that removes them, into chunk records
// (`review-log-archive:`). Statistics reads the live window; the FSRS optimiser
// and the memory replay read everything (`loadFullReviewLog`).

import { kvBatch, kvGet, kvScanPrefix, kvUpdate } from './storage/db';
import { recordReviewActivity } from './stats';
import {
  isRecallReview,
  mergeNormalizedReviewLog,
  normalizeReviewLog,
  normalizeReviewLogArchiveChunk,
  normalizeReviewLogEntry,
  REVIEW_LOG_ARCHIVE_CHUNK,
  REVIEW_LOG_LIMIT,
  type ReviewLogEntry,
} from '../shared/reviewLog';

/** The whole-log value older builds wrote. Not in IDB_KEYS on purpose: the migration runner owns those. */
export const REVIEW_LOG_IDB_KEY = 'review-log-v1';
/** One record per row, appended. */
export const REVIEW_LOG_ROW_PREFIX = 'review-log-row:';
/** Archived rows, `REVIEW_LOG_ARCHIVE_CHUNK` per record, oldest first by key. */
export const REVIEW_LOG_ARCHIVE_PREFIX = 'review-log-archive:';
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

/** `rows` are normalised already (`readStored`); only this window's own rows still need it. */
function withHeld(rows: readonly ReviewLogEntry[]): ReviewLogEntry[] {
  const own = ownRows.map(normalizeReviewLogEntry).filter((entry): entry is ReviewLogEntry => entry !== null);
  return mergeNormalizedReviewLog([...rows, ...own]).filter((entry) => !ownRemoved.has(entry.id));
}

/** A stored value this module may merge into: nothing yet, or a review log. */
function isReviewLogValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (Array.isArray(value)) return true;
  return typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries);
}

async function readStored(limit = REVIEW_LOG_LIMIT): Promise<ReviewLogEntry[]> {
  const legacy = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY), limit);
  legacyIds = new Set(legacy.map((entry) => entry.id));
  const rows: ReviewLogEntry[] = [];
  for (const [, value] of await kvScanPrefix(REVIEW_LOG_ROW_PREFIX)) {
    const entry = normalizeReviewLogEntry(value);
    if (entry) rows.push(entry);
  }
  // Both lists are normalised entries already: merge, do not re-validate.
  return mergeNormalizedReviewLog([...legacy, ...rows], limit);
}

async function readArchive(): Promise<ReviewLogEntry[]> {
  const rows: ReviewLogEntry[] = [];
  for (const [, value] of await kvScanPrefix(REVIEW_LOG_ARCHIVE_PREFIX)) {
    for (const entry of normalizeReviewLogArchiveChunk(value)) rows.push(entry);
  }
  return rows;
}

/**
 * The whole history: archived rows, every stored row and this window's own,
 * uncapped. For the FSRS optimiser and the memory replay, which need each
 * card's reviews back to its first; Statistics uses `loadReviewLog`.
 */
export async function loadFullReviewLog(): Promise<ReviewLogEntry[]> {
  let stored: ReviewLogEntry[] = [];
  let archived: ReviewLogEntry[] = [];
  try {
    [stored, archived] = await Promise.all([readStored(Number.POSITIVE_INFINITY), readArchive()]);
  } catch {
    return loadReviewLog();
  }
  const own = ownRows.map(normalizeReviewLogEntry).filter((entry): entry is ReviewLogEntry => entry !== null);
  return mergeNormalizedReviewLog([...stored, ...own, ...archived], Number.POSITIVE_INFINITY)
    .filter((entry) => !ownRemoved.has(entry.id));
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
 * Move the oldest stored rows beyond `REVIEW_LOG_LIMIT` into archive chunks.
 * (The whole-log value capped itself on every write, and this used to DELETE
 * the excess, taking the oldest history out from under the optimiser.) The
 * chunk puts and the row deletes are one transaction, so a row is never in
 * neither. Run once in a while, not per answer. Returns the rows archived.
 */
export async function pruneReviewLog(limit = REVIEW_LOG_LIMIT): Promise<number> {
  const rows = await kvScanPrefix(REVIEW_LOG_ROW_PREFIX);
  const legacyCount = normalizeReviewLog(await kvGet<unknown>(REVIEW_LOG_IDB_KEY)).length;
  const excess = rows.length + legacyCount - limit;
  if (excess <= 0) return 0;
  const oldest = rows
    .map(([key, value]) => ({ key, entry: normalizeReviewLogEntry(value) }))
    .sort((a, b) => (a.entry?.at ?? 0) - (b.entry?.at ?? 0))
    .slice(0, excess);
  const kept = oldest.map(({ entry }) => entry).filter((entry): entry is ReviewLogEntry => entry !== null);
  const puts: Array<{ type: 'put'; key: string; value: unknown }> = [];
  for (let i = 0; i < kept.length; i += REVIEW_LOG_ARCHIVE_CHUNK) {
    const chunk = kept.slice(i, i + REVIEW_LOG_ARCHIVE_CHUNK);
    // Keyed by the chunk's first time (zero-padded, so key order is time
    // order) and its first id, so two windows archiving at once never collide.
    const first = String(Math.max(0, Math.floor(chunk[0].at))).padStart(15, '0');
    puts.push({ type: 'put', key: `${REVIEW_LOG_ARCHIVE_PREFIX}${first}-${chunk[0].id}`, value: { version: 1, entries: chunk } });
  }
  await kvBatch([...puts, ...oldest.map(({ key }) => ({ type: 'delete' as const, key }))]);
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
  // A due card graded from a game moved a schedule, but it is not a recall
  // test: the day counts it as practice, so it never enters a review pass rate.
  recordReviewActivity(isRecallReview(entry) ? 'review' : 'practice', entry.correct, entry.at);
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
  notifyEntryListeners('appended', entry);
  return entry;
}

/** Take back one answer (review undo). */
export function removeReviewLogEntry(entry: ReviewLogEntry): void {
  recordReviewActivity(isRecallReview(entry) ? 'review' : 'practice', entry.correct, entry.at, true);
  heldAppends = heldAppends.filter((row) => row.id !== entry.id);
  ownRows = ownRows.filter((row) => row.id !== entry.id);
  ownRemoved.add(entry.id);
  if (cache) cache = cache.filter((row) => row.id !== entry.id);
  // Deleted even if it may not be stored yet: its put could be in flight, and
  // the delete is queued after it.
  heldRemovals.add(entry.id);
  persist();
  emit();
  notifyEntryListeners('removed', entry);
}

export interface ReviewLogMergeResult {
  /** Rows written. */
  added: number;
  /** Rows already in the log (same id, or the same card answered at the same moment). */
  duplicates: number;
  /** Rows that are not review-log rows at all. */
  invalid: number;
  /** Ids of the rows written, for an undo of the import. */
  ids: string[];
}

/** Rows per IndexedDB batch while merging: one transaction per chunk, not one per row. */
const MERGE_CHUNK = 5_000;

/**
 * Run `work` after every queued write, in order with them. The caller sees a
 * failure; the chain does not, so one failed batch never stops later appends
 * from being written.
 */
function queueWrite(work: () => Promise<void>): Promise<void> {
  const run = writeChain.then(work);
  writeChain = run.catch((error) => {
    console.error('[review-log] IndexedDB write failed:', error);
  });
  return run;
}

/**
 * Merge a batch of history from elsewhere (an Anki package's review log) into
 * the log, once.
 *
 * Not `appendReviewLog` in a loop, on purpose: these answers were not given
 * today, so they are not counted into today's statistics, and they must not
 * reach the row listeners — the Anki review sync would otherwise queue a
 * year of Anki's own answers to be sent back to Anki.
 *
 * Deduplicated against EVERYTHING already kept, the archive included: by row
 * id (an imported Anki answer's id is derived from its revlog id, so importing
 * the same deck twice adds nothing), and by card and moment (the same answer
 * that came back through an export and a re-import under another id). Rows
 * older than the live window go where old rows belong: the archive pass runs
 * after the merge, exactly as it does for a log that outgrew its window.
 */
export async function mergeReviewLogRows(rows: readonly unknown[]): Promise<ReviewLogMergeResult> {
  const result: ReviewLogMergeResult = { added: 0, duplicates: 0, invalid: 0, ids: [] };
  const incoming: ReviewLogEntry[] = [];
  for (const row of rows) {
    const entry = normalizeReviewLogEntry(row);
    if (entry) incoming.push(entry);
    else result.invalid += 1;
  }
  if (!incoming.length) return result;
  const existing = await loadFullReviewLog();
  const ids = new Set(existing.map((entry) => entry.id));
  const moment = (entry: ReviewLogEntry): string => `${entry.cardId ?? ''}\u0000${entry.at}`;
  const moments = new Set(existing.filter((entry) => entry.cardId).map(moment));
  const fresh: ReviewLogEntry[] = [];
  for (const entry of incoming) {
    if (ids.has(entry.id) || (entry.cardId && moments.has(moment(entry)))) {
      result.duplicates += 1;
      continue;
    }
    ids.add(entry.id);
    if (entry.cardId) moments.add(moment(entry));
    fresh.push(entry);
  }
  if (!fresh.length) return result;

  await queueWrite(async () => {
    for (let i = 0; i < fresh.length; i += MERGE_CHUNK) {
      await kvBatch(fresh.slice(i, i + MERGE_CHUNK).map((entry) => ({
        type: 'put' as const,
        key: `${REVIEW_LOG_ROW_PREFIX}${entry.id}`,
        value: entry,
      })));
    }
  });
  // A load racing the write may have read the store before these rows: once
  // it lands, the window's copy takes them in (the merge dedupes by id, and
  // keeps only the live window, exactly as a load does).
  if (!cache && loading) await loading.catch(() => undefined);
  if (cache) cache = mergeNormalizedReviewLog([...cache, ...fresh]);
  result.added = fresh.length;
  result.ids = fresh.map((entry) => entry.id);
  if (existing.length + fresh.length > REVIEW_LOG_LIMIT) await pruneReviewLog().catch(() => 0);
  emit();
  return result;
}

/**
 * Take back rows a merge wrote (the undo of an import), wherever they are now:
 * live rows are deleted; rows the archive pass moved are filtered out of their
 * chunk. Nothing is counted out of the day's statistics, because the merge
 * never counted them in.
 */
export async function removeMergedReviewLogRows(ids: readonly string[]): Promise<number> {
  if (!ids.length) return 0;
  const drop = new Set(ids);
  let removed = 0;
  await queueWrite(async () => {
    const live = await kvScanPrefix(REVIEW_LOG_ROW_PREFIX);
    const deletes = live
      .filter(([key]) => drop.has(key.slice(REVIEW_LOG_ROW_PREFIX.length)))
      .map(([key]) => ({ type: 'delete' as const, key }));
    removed += deletes.length;
    const archivePuts: Array<{ type: 'put'; key: string; value: unknown }> = [];
    for (const [key, value] of await kvScanPrefix(REVIEW_LOG_ARCHIVE_PREFIX)) {
      const entries = normalizeReviewLogArchiveChunk(value);
      const kept = entries.filter((entry) => !drop.has(entry.id));
      if (kept.length === entries.length) continue;
      removed += entries.length - kept.length;
      archivePuts.push({ type: 'put', key, value: { version: 1, entries: kept } });
    }
    if (deletes.length || archivePuts.length) await kvBatch([...deletes, ...archivePuts]);
  });
  ownRows = ownRows.filter((row) => !drop.has(row.id));
  if (cache) cache = cache.filter((row) => !drop.has(row.id));
  if (removed) emit();
  return removed;
}

/**
 * Row-level hook: who needs the answer itself, not just "the log changed" —
 * the Anki review sync queues each graded answer and drops it again on undo.
 * Synchronous with the append; a listener that throws is logged and skipped,
 * never allowed to fail the review that called it.
 */
export interface ReviewLogEntryListener {
  appended?(entry: ReviewLogEntry): void;
  removed?(entry: ReviewLogEntry): void;
}

const entryListeners = new Set<ReviewLogEntryListener>();

function notifyEntryListeners(kind: 'appended' | 'removed', entry: ReviewLogEntry): void {
  for (const listener of [...entryListeners]) {
    try {
      listener[kind]?.(entry);
    } catch (error) {
      console.error('[review-log] entry listener threw:', error);
    }
  }
}

export function onReviewLogEntry(listener: ReviewLogEntryListener): () => void {
  entryListeners.add(listener);
  return () => {
    entryListeners.delete(listener);
  };
}

export function onReviewLogChanged(cb: () => void): () => void {
  window.addEventListener(REVIEW_LOG_EVENT, cb);
  return () => window.removeEventListener(REVIEW_LOG_EVENT, cb);
}
