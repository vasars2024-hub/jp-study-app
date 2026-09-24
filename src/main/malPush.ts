/**
 * Write-back to MyAnimeList — only ever on an explicit click.
 *
 * `mal:pushPreview` compares the watch library with the MAL list as last
 * fetched and says what differs. `mal:pushChanges` sends exactly that diff (or
 * the ids the user picked), one PATCH per title through the audited client
 * (`MalSyncClient.updateListStatus`), stopping at the first failure that
 * would repeat for every title (signed out, MAL down). Nothing here runs on a
 * timer or after an import: gate 13 of the MAL plan.
 */

import { diffWatchLibraryAgainstMal, applyPushedUpdate, type MalPushChange, type MalPushPreview } from '../shared/malPush';
import type { MalListStatusUpdate } from '../shared/malSync';
import { readMalLibrary, writeMalLibrary } from './malLibrary';
import { listWatchTitlesNeedingLookup, readWatchLibrary } from './watchLibrary';

/** The one method the push needs — `MalSyncClient` satisfies it; tests pass a fake. */
export interface MalListWriter {
  updateListStatus(animeId: number, update: MalListStatusUpdate): Promise<MalListStatusUpdate>;
}

/** Errors that would fail every remaining title the same way. */
const FATAL_CODES = new Set(['not-configured', 'not-authenticated', 'reauth-required', 'transient']);

/** At most this many PATCHes per click; the rest wait for the next one. */
export const MAL_PUSH_LIMIT = 300;

export function malPushPreview(): MalPushPreview {
  // Folds any freshly stored MAL rows into the library first, so the diff is
  // against the merged state rather than stale local values.
  listWatchTitlesNeedingLookup();
  const mal = readMalLibrary();
  return diffWatchLibraryAgainstMal(readWatchLibrary().titles, mal.entries, mal.lastSyncAt);
}

export interface MalPushResult {
  sent: number;
  failed: { animeId: number; title: string; code?: string; message: string }[];
  /** Changes not attempted: over the per-click limit, or after a fatal error. */
  remaining: number;
  /** The code that stopped the run early, if one did. */
  stoppedBy?: string;
}

export async function pushWatchChangesToMal(
  writer: MalListWriter,
  onlyIds?: readonly number[],
  now: () => number = Date.now,
): Promise<MalPushResult> {
  const preview = malPushPreview();
  const wanted = onlyIds?.length ? new Set(onlyIds) : null;
  const changes: MalPushChange[] = preview.changes.filter((change) => !wanted || wanted.has(change.animeId));
  const result: MalPushResult = { sent: 0, failed: [], remaining: 0 };
  let document = readMalLibrary();
  let attempted = 0;
  for (const change of changes) {
    if (attempted >= MAL_PUSH_LIMIT || result.stoppedBy) {
      result.remaining += 1;
      continue;
    }
    attempted += 1;
    try {
      const confirmed = await writer.updateListStatus(change.animeId, change.update);
      document = { ...document, entries: applyPushedUpdate(document.entries, change, confirmed, now()) };
      result.sent += 1;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? String((error as { code: unknown }).code) : undefined;
      result.failed.push({ animeId: change.animeId, title: change.title, code, message: error instanceof Error ? error.message : String(error) });
      if (code && FATAL_CODES.has(code)) result.stoppedBy = code;
    }
  }
  if (result.sent) writeMalLibrary(document);
  return result;
}
