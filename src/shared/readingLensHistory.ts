/**
 * Reading Lens capture history — the shared, pure half.
 *
 * A capture is worth keeping past the moment it is read: the same VN line comes
 * back, a sentence read on a video is worth mining an hour later, and "what was
 * that word I looked at yesterday" is otherwise unanswerable. This module owns
 * the entry shape, the bounded insert, and the search — all pure, so the store
 * in main and any renderer surface agree by construction rather than by comment.
 *
 * **Screenshots are deliberately not retained.** `ReadingLensCapture` can carry
 * a bounded JPEG (up to ~900 KB) and every scan now produces one, so persisting
 * them would put hundreds of megabytes of pictures of the user's screen on disk
 * under a feature that never asked to be a screen recorder. Retention of image
 * evidence needs an explicit privacy and disk-ownership decision; text plus
 * source metadata needs none, and is what makes the history searchable. The
 * screenshot still reaches the Agent and the visual-novel card in-session, which
 * is where it was already going.
 */

import type { ReadingLensCapture, ReadingLensEngine, ReadingLensSource } from './readingLens';
import { READING_LENS_SOURCES } from './readingLens';

export const READING_LENS_HISTORY_VERSION = 1 as const;

/**
 * The file under `userData` that holds this history.
 *
 * Here rather than beside its main-process owner because read-only catalogues
 * — the Files index — need the location without importing `electron`, and a
 * second copy of the filename is how two readers end up pointed at different
 * files. The owner re-exports it, so its own callers are unaffected.
 */
export const READING_LENS_HISTORY_FILE = 'reading-lens-history.json';

/**
 * How many captures are kept. A lens scan is cheap and frequent, so this is a
 * ring rather than an archive: enough to cover a reading session and the days
 * around it, small enough that the whole file is read and searched in one go
 * without an index. Explicitly pinned rows are retained in addition to this
 * rolling window.
 */
export const READING_LENS_HISTORY_LIMIT = 200;

/**
 * How long a capture may sit on disk, in days.
 *
 * The rolling limit above is a *size* bound, not a *time* bound, and the two
 * answer different questions. 200 entries is a few days for someone reading a
 * VN nightly and half a year for someone who scans a word a week — so the limit
 * alone cannot promise anyone that what they read is gone by Friday. Retention
 * is the time half, and it is the control a user actually reaches for.
 *
 * `0` means "no age bound": the rolling limit is the only thing that evicts,
 * which is exactly today's behaviour. It is the default deliberately — turning
 * a real bound on at upgrade would delete history the user never agreed to lose,
 * and a privacy feature whose first act is silent deletion is not one. Pinned
 * entries are exempt at every setting, for the same reason they are exempt from
 * the rolling limit: pinning is the user saying "keep this one".
 */
export const READING_LENS_RETENTION_CHOICES = [0, 1, 7, 30, 90] as const;

export type ReadingLensRetentionDays = (typeof READING_LENS_RETENTION_CHOICES)[number];

export const READING_LENS_RETENTION_DEFAULT: ReadingLensRetentionDays = 0;

const DAY_MS = 86_400_000;

/** Longest text kept per entry; the full passage is available while reading. */
const MAX_ENTRY_TEXT = 2_000;
const MAX_LABEL = 240;
const MAX_REF = 1_000;
const MAX_ID = 160;
const MAX_QUERY = 200;

export interface ReadingLensHistoryEntry {
  captureId: string;
  source: ReadingLensSource;
  sourceLabel: string;
  sourceRef: string;
  /** Most recent time this capture was seen; a repeat scan refreshes it. */
  capturedAt: number;
  language: string;
  engine: ReadingLensEngine;
  hash: string;
  text: string;
  /** OCR line count at capture time; 0 for a text/clipboard capture. */
  lineCount: number;
  /** How many times this capture has been recorded, including the first. */
  seenCount: number;
  /** Pinned entries survive the rolling history limit until explicitly unpinned. */
  pinned: boolean;
}

export interface ReadingLensHistoryQuery {
  /** Free text; matched case- and width-insensitively against text + labels. */
  query?: string;
  /** Restrict to one capture source. */
  source?: ReadingLensSource | 'all';
  /**
   * Restrict to pinned entries only.
   *
   * Pinning is what exempts a capture from the rolling limit, so the set of
   * pinned rows is the part of the history the user chose to keep. Without a
   * way to ask for just that set, they can only be found by scrolling past the
   * ~200 unpinned rows they were pinned to outlive.
   */
  pinnedOnly?: boolean;
  /** Max entries returned; clamped to the history limit. */
  limit?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function text(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\r\n?/g, '\n').normalize('NFKC').trim().slice(0, limit);
}

function count(value: unknown, fallback: number): number {
  return finite(value) && value >= 0 ? Math.min(Math.floor(value), Number.MAX_SAFE_INTEGER) : fallback;
}

/**
 * Project a live capture onto the entry that is safe to persist. The screenshot
 * is dropped here — the one place it can be — so no caller has to remember to.
 */
export function readingLensHistoryEntryOf(
  capture: ReadingLensCapture,
  now = Date.now(),
): ReadingLensHistoryEntry | null {
  const body = text(capture.text, MAX_ENTRY_TEXT);
  if (!body) return null;
  const capturedAt = finite(capture.capturedAt) && capture.capturedAt > 0 ? capture.capturedAt : now;

  return {
    captureId: text(capture.captureId, MAX_ID) || `reading-lens:${capture.source}:${Math.round(capturedAt)}`,
    source: capture.source,
    sourceLabel: text(capture.sourceLabel, MAX_LABEL),
    sourceRef: text(capture.sourceRef, MAX_REF),
    capturedAt,
    language: text(capture.language, 24) || 'ja',
    engine: capture.engine,
    hash: text(capture.hash, 128),
    text: body,
    lineCount: Array.isArray(capture.lines) ? capture.lines.length : 0,
    seenCount: 1,
    pinned: false,
  };
}

/** Validate one untrusted entry read back off disk. */
export function normalizeReadingLensHistoryEntry(value: unknown): ReadingLensHistoryEntry | null {
  if (!isRecord(value)) return null;
  const body = text(value.text, MAX_ENTRY_TEXT);
  if (!body) return null;
  const capturedAt = finite(value.capturedAt) && value.capturedAt > 0 ? value.capturedAt : 0;
  if (!capturedAt) return null;
  const captureId = text(value.captureId, MAX_ID);
  if (!captureId) return null;

  const source = READING_LENS_SOURCES.includes(value.source as ReadingLensSource)
    ? (value.source as ReadingLensSource)
    : 'screen';
  const engineRaw = value.engine;
  const engine: ReadingLensEngine =
    engineRaw === 'auto' || engineRaw === 'manga' || engineRaw === 'web' || engineRaw === 'none' || engineRaw === 'import'
      ? engineRaw
      : 'auto';

  return {
    captureId,
    source,
    sourceLabel: text(value.sourceLabel, MAX_LABEL),
    sourceRef: text(value.sourceRef, MAX_REF),
    capturedAt,
    language: text(value.language, 24) || 'ja',
    engine,
    hash: text(value.hash, 128),
    text: body,
    lineCount: count(value.lineCount, 0),
    seenCount: Math.max(1, count(value.seenCount, 1)),
    pinned: value.pinned === true,
  };
}

function boundedHistoryLimit(limit: number): number {
  return Math.max(1, Math.min(limit, READING_LENS_HISTORY_LIMIT));
}

/** Keep every pinned entry in the bounded store, evicting the oldest unpinned rows first. */
function trimReadingLensHistory(
  entries: readonly ReadingLensHistoryEntry[],
  limit: number,
): ReadingLensHistoryEntry[] {
  const cap = boundedHistoryLimit(limit);
  if (entries.length <= cap) return entries as ReadingLensHistoryEntry[];

  const pinned = entries.filter((entry) => entry.pinned);
  if (pinned.length >= cap) return pinned;

  const keepUnpinned = entries
    .filter((entry) => !entry.pinned)
    .slice(0, cap - pinned.length);
  const keepIds = new Set(keepUnpinned.map((entry) => entry.captureId));
  return entries.filter((entry) => entry.pinned || keepIds.has(entry.captureId));
}

/**
 * Validate a retention setting read off disk or across IPC.
 *
 * Anything that is not one of the offered choices becomes the default rather
 * than being clamped to the nearest one: the file is user-writable JSON, and
 * silently rounding a typo'd `3` down to `1` would delete two days of history
 * the user did not ask to lose. An unrecognised value means "we do not know
 * what was intended", and the safe reading of that is "do not prune".
 */
export function normalizeReadingLensRetentionDays(value: unknown): ReadingLensRetentionDays {
  return (READING_LENS_RETENTION_CHOICES as readonly number[]).includes(value as number)
    ? (value as ReadingLensRetentionDays)
    : READING_LENS_RETENTION_DEFAULT;
}

/**
 * Drop unpinned entries older than the retention window.
 *
 * Returns the same array reference when nothing was old enough to drop, so a
 * caller can use identity to decide whether the file needs rewriting — the
 * common case is a load that prunes nothing, and that must not cost a write.
 *
 * The comparison is `capturedAt`, which a repeat sighting refreshes. That is
 * intentional: a line re-read today is a thing the user is still reading, and
 * expiring it on the date it was *first* seen would delete the entry mid-session.
 */
export function pruneReadingLensHistory(
  entries: readonly ReadingLensHistoryEntry[],
  retentionDays: ReadingLensRetentionDays,
  now = Date.now(),
): ReadingLensHistoryEntry[] {
  if (!retentionDays) return entries as ReadingLensHistoryEntry[];
  const cutoff = now - retentionDays * DAY_MS;
  const next = entries.filter((entry) => entry.pinned || entry.capturedAt >= cutoff);
  return next.length === entries.length ? (entries as ReadingLensHistoryEntry[]) : next;
}

/**
 * Validate a whole persisted history: drop unusable entries, collapse duplicate
 * ids, and return newest-first within the rolling limit plus any pinned rows. A
 * corrupt file degrades to the entries that survive rather than to nothing.
 */
export function normalizeReadingLensHistory(
  value: unknown,
  limit = READING_LENS_HISTORY_LIMIT,
): ReadingLensHistoryEntry[] {
  const raw = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.entries)
      ? value.entries
      : [];

  const byId = new Map<string, ReadingLensHistoryEntry>();
  for (const item of raw) {
    const entry = normalizeReadingLensHistoryEntry(item);
    if (!entry) continue;
    const existing = byId.get(entry.captureId);
    if (!existing || entry.capturedAt > existing.capturedAt) byId.set(entry.captureId, entry);
  }

  return trimReadingLensHistory(
    [...byId.values()].sort((a, b) => b.capturedAt - a.capturedAt),
    limit,
  );
}

/**
 * Insert one entry, newest first.
 *
 * Re-reading the same line is the common case, not an edge case — a VN scan
 * repeated three times is one thing seen three times, not three things. So an
 * entry matching an existing `captureId` (or a non-empty `hash`, which is how
 * two scans of identical text agree) updates that entry in place: newest
 * timestamp, incremented `seenCount`, and the fresher metadata, then moves to
 * the front. The unpinned portion is never longer than `limit`.
 */
export function recordReadingLensHistory(
  entries: readonly ReadingLensHistoryEntry[],
  entry: ReadingLensHistoryEntry,
  limit = READING_LENS_HISTORY_LIMIT,
): ReadingLensHistoryEntry[] {
  const matches = (candidate: ReadingLensHistoryEntry): boolean =>
    candidate.captureId === entry.captureId || (!!entry.hash && candidate.hash === entry.hash);

  const previous = entries.find(matches);
  const merged: ReadingLensHistoryEntry = previous
    ? {
        ...entry,
        captureId: previous.captureId,
        capturedAt: Math.max(previous.capturedAt, entry.capturedAt),
        seenCount: previous.seenCount + entry.seenCount,
        pinned: previous.pinned || entry.pinned,
      }
    : entry;

  return trimReadingLensHistory([merged, ...entries.filter((candidate) => !matches(candidate))], limit);
}

/** Set one capture's retention policy without changing its text or timestamp. */
export function setReadingLensHistoryPinned(
  entries: readonly ReadingLensHistoryEntry[],
  captureId: string,
  pinned: boolean,
): ReadingLensHistoryEntry[] {
  const id = text(captureId, MAX_ID);
  if (!id) return entries as ReadingLensHistoryEntry[];

  let changed = false;
  const next = entries.map((entry) => {
    if (entry.captureId !== id || entry.pinned === pinned) return entry;
    changed = true;
    return { ...entry, pinned };
  });
  return changed ? next : (entries as ReadingLensHistoryEntry[]);
}

/** Remove one entry by id. Returns the same array reference when nothing matched. */
export function removeReadingLensHistoryEntry(
  entries: readonly ReadingLensHistoryEntry[],
  captureId: string,
): ReadingLensHistoryEntry[] {
  const id = text(captureId, MAX_ID);
  if (!id) return entries as ReadingLensHistoryEntry[];
  const next = entries.filter((entry) => entry.captureId !== id);
  return next.length === entries.length ? (entries as ReadingLensHistoryEntry[]) : next;
}

/**
 * Search the history.
 *
 * Japanese has no word boundaries to tokenize on here, so this is substring
 * matching over an NFKC-folded, case-folded haystack — which is what makes
 * "ka" find "Ka", "ｶﾀｶﾅ" find "カタカナ", and a kanji fragment find the line it
 * came from. Text, label and ref are all searched: "youtube" should find the
 * captures taken from a video even though the word appears in none of them.
 *
 * The three filters intersect rather than widen: a pinned-only search inside
 * one source for a word returns the entries that satisfy all three. `limit` is
 * applied last, so it bounds the result and never the candidate set — a match
 * ranked below the limit is excluded because it is older, never because a
 * non-matching row consumed its slot.
 */
export function searchReadingLensHistory(
  entries: readonly ReadingLensHistoryEntry[],
  query: ReadingLensHistoryQuery = {},
): ReadingLensHistoryEntry[] {
  const needle = text(query.query, MAX_QUERY).toLowerCase();
  const source = query.source && query.source !== 'all' ? query.source : null;
  const limit = finite(query.limit) && query.limit > 0
    ? Math.min(Math.floor(query.limit), READING_LENS_HISTORY_LIMIT)
    : READING_LENS_HISTORY_LIMIT;

  const matched = entries.filter((entry) => {
    if (source && entry.source !== source) return false;
    if (query.pinnedOnly === true && !entry.pinned) return false;
    if (!needle) return true;
    const haystack = `${entry.text}\n${entry.sourceLabel}\n${entry.sourceRef}`.toLowerCase();
    return haystack.includes(needle);
  });

  return matched.slice(0, limit);
}
