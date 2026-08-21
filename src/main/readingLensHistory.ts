/**
 * Reading Lens capture history — persistence.
 *
 * The shape, the bounded insert and the search all live in
 * `shared/readingLensHistory.ts`; this file is only the disk half, so the store
 * and any renderer surface cannot disagree about what an entry is.
 *
 * Why main owns the file rather than the lens renderer owning localStorage: the
 * lens window is created and destroyed per capture, and captures arrive from a
 * window that is about to close. A store that lives in the lens renderer would
 * lose the last capture of every session. Main outlives every capture.
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  READING_LENS_HISTORY_LIMIT,
  READING_LENS_HISTORY_VERSION,
  READING_LENS_RETENTION_DEFAULT,
  normalizeReadingLensHistory,
  normalizeReadingLensRetentionDays,
  pruneReadingLensHistory,
  readingLensHistoryEntryOf,
  recordReadingLensHistory,
  removeReadingLensHistoryEntry,
  searchReadingLensHistory,
  setReadingLensHistoryPinned,
  type ReadingLensHistoryEntry,
  type ReadingLensHistoryQuery,
  type ReadingLensRetentionDays,
} from '../shared/readingLensHistory';
import { normalizeReadingLensCapture } from '../shared/readingLens';

const HISTORY_FILE = 'reading-lens-history.json';

/**
 * Loaded once and kept in memory. The file is at most a few hundred short
 * strings, and a capture must not pay a synchronous read to be recorded.
 */
let entries: ReadingLensHistoryEntry[] | null = null;

/**
 * The retention window, stored beside the entries it governs.
 *
 * It lives in this file rather than in `reading-lens.json` because it is a
 * property of the store, not of the hotkey/region settings — a user who deletes
 * the history file to start over should get the default window back with it,
 * and nothing in the capture path should have to remember to pass a policy in.
 */
let retentionDays: ReadingLensRetentionDays = READING_LENS_RETENTION_DEFAULT;

function historyPath(): string {
  return path.join(app.getPath('userData'), HISTORY_FILE);
}

function load(): ReadingLensHistoryEntry[] {
  if (entries) return entries;
  let loaded: ReadingLensHistoryEntry[];
  try {
    const parsed: unknown = JSON.parse(fs.readFileSync(historyPath(), 'utf8'));
    loaded = normalizeReadingLensHistory(parsed);
    retentionDays = normalizeReadingLensRetentionDays(
      parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>).retentionDays
        : undefined,
    );
  } catch {
    // No file yet, or a corrupt one: an empty history is the correct degraded
    // state — this feature must never block a capture from being read.
    loaded = [];
    retentionDays = READING_LENS_RETENTION_DEFAULT;
  }
  // Pruned on load, not only on the next capture: a window that has expired
  // while the app was closed must be honoured by the time anything can read the
  // history, or "keep for 7 days" would silently mean "until you next scan".
  const pruned = pruneReadingLensHistory(loaded, retentionDays);
  entries = pruned;
  if (pruned !== loaded) persist();
  return entries;
}

function persist(): void {
  try {
    fs.writeFileSync(
      historyPath(),
      JSON.stringify(
        { schemaVersion: READING_LENS_HISTORY_VERSION, retentionDays, entries: entries ?? [] },
        null,
        2,
      ),
      'utf8',
    );
  } catch (err) {
    console.error('[readingLensHistory] failed to persist', err);
  }
}

/**
 * Record a capture. The value crosses IPC from the lens renderer, so it is
 * re-validated through the same capture normalizer the renderer used rather
 * than trusted — and the screenshot is dropped by `readingLensHistoryEntryOf`.
 */
export function recordCapture(value: unknown): ReadingLensHistoryEntry | null {
  const capture = normalizeReadingLensCapture(value);
  if (!capture) return null;
  const entry = readingLensHistoryEntryOf(capture);
  if (!entry) return null;

  entries = pruneReadingLensHistory(
    recordReadingLensHistory(load(), entry, READING_LENS_HISTORY_LIMIT),
    retentionDays,
  );
  persist();
  return entries[0] ?? null;
}

/** The current retention window in days; `0` means the rolling limit only. */
export function getRetentionDays(): ReadingLensRetentionDays {
  load();
  return retentionDays;
}

/**
 * Change the retention window and apply it immediately.
 *
 * Applying it now rather than at the next capture is the honest reading of the
 * control: a user who picks "1 day" is asking for yesterday's captures to be
 * gone, not for them to linger until something else happens to write the file.
 * The removed count is returned so the surface can say how many rather than
 * claiming a number it did not measure.
 */
export function setRetentionDays(value: unknown): { retentionDays: ReadingLensRetentionDays; removed: number } {
  const before = load();
  retentionDays = normalizeReadingLensRetentionDays(value);
  const after = pruneReadingLensHistory(before, retentionDays);
  entries = after;
  persist();
  return { retentionDays, removed: before.length - after.length };
}

/** Search the persisted history. An absent/garbage query returns everything. */
export function listCaptures(query: unknown): ReadingLensHistoryEntry[] {
  const raw = (query ?? {}) as Partial<ReadingLensHistoryQuery>;
  return searchReadingLensHistory(load(), {
    query: typeof raw.query === 'string' ? raw.query : '',
    source: typeof raw.source === 'string' ? (raw.source as ReadingLensHistoryQuery['source']) : 'all',
    // Strict `=== true`, so an absent or garbage value from IPC widens the
    // result rather than narrowing it: a filter that switches itself on
    // because a renderer sent `"false"` would hide captures the user asked to
    // see, and silently.
    pinnedOnly: raw.pinnedOnly === true,
    limit: typeof raw.limit === 'number' ? raw.limit : undefined,
  });
}

/** Forget one capture. Returns the remaining count. */
export function removeCapture(captureId: unknown): number {
  const id = typeof captureId === 'string' ? captureId : '';
  const next = removeReadingLensHistoryEntry(load(), id);
  if (next !== entries) {
    entries = next;
    persist();
  }
  return (entries ?? []).length;
}

/** Pin or unpin one history row without recording another sighting. */
export function setCapturePinned(captureId: unknown, pinned: unknown): ReadingLensHistoryEntry | null {
  const id = typeof captureId === 'string' ? captureId : '';
  const next = setReadingLensHistoryPinned(load(), id, pinned === true);
  if (next !== entries) {
    entries = next;
    persist();
  }
  return (entries ?? []).find((entry) => entry.captureId === id) ?? null;
}

/** Forget everything. The file is rewritten empty rather than deleted, so the
 * next read does not have to distinguish "cleared" from "never used". */
export function clearCaptures(): void {
  entries = [];
  persist();
}

/** Test seam: drop the in-memory copy so the next call re-reads from disk. */
export function resetReadingLensHistoryCache(): void {
  entries = null;
  retentionDays = READING_LENS_RETENTION_DEFAULT;
}
