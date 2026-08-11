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
 * How many captures are kept. A lens scan is cheap and frequent, so this is a
 * ring rather than an archive: enough to cover a reading session and the days
 * around it, small enough that the whole file is read and searched in one go
 * without an index.
 */
export const READING_LENS_HISTORY_LIMIT = 200;

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
}

export interface ReadingLensHistoryQuery {
  /** Free text; matched case- and width-insensitively against text + labels. */
  query?: string;
  /** Restrict to one capture source. */
  source?: ReadingLensSource | 'all';
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
  };
}

/**
 * Validate a whole persisted history: drop unusable entries, collapse duplicate
 * ids, and return newest-first within the limit. A corrupt file degrades to the
 * entries that survive rather than to nothing.
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

  return [...byId.values()]
    .sort((a, b) => b.capturedAt - a.capturedAt)
    .slice(0, Math.max(1, Math.min(limit, READING_LENS_HISTORY_LIMIT)));
}

/**
 * Insert one entry, newest first.
 *
 * Re-reading the same line is the common case, not an edge case — a VN scan
 * repeated three times is one thing seen three times, not three things. So an
 * entry matching an existing `captureId` (or a non-empty `hash`, which is how
 * two scans of identical text agree) updates that entry in place: newest
 * timestamp, incremented `seenCount`, and the fresher metadata, then moves to
 * the front. The list is never longer than `limit`.
 */
export function recordReadingLensHistory(
  entries: readonly ReadingLensHistoryEntry[],
  entry: ReadingLensHistoryEntry,
  limit = READING_LENS_HISTORY_LIMIT,
): ReadingLensHistoryEntry[] {
  const cap = Math.max(1, Math.min(limit, READING_LENS_HISTORY_LIMIT));
  const matches = (candidate: ReadingLensHistoryEntry): boolean =>
    candidate.captureId === entry.captureId || (!!entry.hash && candidate.hash === entry.hash);

  const previous = entries.find(matches);
  const merged: ReadingLensHistoryEntry = previous
    ? {
        ...entry,
        captureId: previous.captureId,
        capturedAt: Math.max(previous.capturedAt, entry.capturedAt),
        seenCount: previous.seenCount + entry.seenCount,
      }
    : entry;

  return [merged, ...entries.filter((candidate) => !matches(candidate))].slice(0, cap);
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
    if (!needle) return true;
    const haystack = `${entry.text}\n${entry.sourceLabel}\n${entry.sourceRef}`.toLowerCase();
    return haystack.includes(needle);
  });

  return matched.slice(0, limit);
}
