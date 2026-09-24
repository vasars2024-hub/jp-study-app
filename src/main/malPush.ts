/**
 * Write-back to MyAnimeList — only ever on an explicit click.
 *
 * `mal:pushPreview` compares the watch library with the MAL list as last
 * fetched and says what differs. `mal:pushChanges` sends exactly that diff (or
 * the ids the user picked), one PATCH per title through the audited client
 * (`MalSyncClient.updateListStatus`), stopping at the first failure that
 * would repeat for every title (signed out, MAL down). Nothing here runs on a
 * timer or after an import: gate 13 of the MAL plan.
 *
 * The diff is against the list as last FETCHED, which can be days old. Right
 * before each PATCH the title's row is re-read from MAL; if it no longer
 * matches that snapshot (edited on the MAL site since), the title is skipped
 * and reported as changed on MAL instead of being overwritten.
 */

import { diffWatchLibraryAgainstMal, applyPushedUpdate, type MalPushChange, type MalPushPreview } from '../shared/malPush';
import type { MalLibraryEntry } from '../shared/malLibrary';
import type { MalListStatusUpdate, MalLiveListStatus } from '../shared/malSync';
import { readMalLibrary, writeMalLibrary } from './malLibrary';
import { listWatchTitlesNeedingLookup, readWatchLibrary } from './watchLibrary';

/** What the push needs — `MalSyncClient` satisfies it; tests pass a fake. */
export interface MalListWriter {
  updateListStatus(animeId: number, update: MalListStatusUpdate): Promise<MalListStatusUpdate>;
  /** The title's list row on MAL right now; the push checks it before each PATCH. */
  readListStatus?(animeId: number): Promise<MalLiveListStatus>;
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
  /** Changed on MAL since the last fetch: not overwritten. Fetch again to see them. */
  changedOnMal?: { animeId: number; title: string }[];
  /** Changes not attempted: over the per-click limit, or after a fatal error. */
  remaining: number;
  /** The code that stopped the run early, if one did. */
  stoppedBy?: string;
}

/** Whether MAL's row moved away from the snapshot the diff was made against. */
export function changedSinceSnapshot(change: MalPushChange, snapshot: MalLibraryEntry | undefined, live: MalLiveListStatus): boolean {
  const now = live.listStatus;
  if (change.added || !snapshot) return now !== null;
  if (!now) return true;
  if (snapshot.malUpdatedAt && now.updatedAt) {
    const before = Date.parse(snapshot.malUpdatedAt);
    const after = Date.parse(now.updatedAt);
    if (Number.isFinite(before) && Number.isFinite(after) && after > before) return true;
  }
  return (snapshot.status ?? undefined) !== (now.status ?? undefined)
    || snapshot.episodesWatched !== now.episodesWatched
    || snapshot.score !== now.score
    || snapshot.rewatching !== now.rewatching;
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
      let update = change.update;
      if (writer.readListStatus) {
        const live = await writer.readListStatus(change.animeId);
        const snapshot = document.entries.find((entry) => entry.malId === change.animeId && entry.media === 'anime' && entry.origin === 'list');
        if (changedSinceSnapshot(change, snapshot, live)) {
          (result.changedOnMal ??= []).push({ animeId: change.animeId, title: change.title });
          continue;
        }
        if (update.episodesWatched !== undefined && live.numEpisodes > 0 && update.episodesWatched > live.numEpisodes) {
          update = { ...update, episodesWatched: live.numEpisodes };
        }
      }
      const confirmed = await writer.updateListStatus(change.animeId, update);
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
