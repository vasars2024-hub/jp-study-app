/**
 * "Push changes to MAL" — what differs between the watch library and the
 * user's MAL list as last fetched (`mal-library.json`).
 *
 * The watch library is where edits happen now: Gum, the player's 90% rule,
 * the tracking dashboard, merged Letterboxd rows. Until this existed those
 * edits only ever reached the local file. The diff here is what a push would
 * send — status, score and episodes watched per title — and nothing is sent
 * until the user clicks (MAL plan gate 13: no automatic writes).
 *
 * Pure: titles and stored rows in, a change list out.
 */

import type { MalLibraryEntry } from './malLibrary';
import type { MalListStatus, MalListStatusUpdate } from './malSync';
import { malStatusFromWatch, type WatchTitle, type WatchSource } from './watchLibrary';

export interface MalPushChange {
  animeId: number;
  titleId: string;
  title: string;
  /** Absent from the stored MAL list: the push would add it. */
  added: boolean;
  /** What would be sent — only the fields that differ. */
  update: MalListStatusUpdate;
  /** The stored MAL values those fields replace, for the preview. */
  before: MalListStatusUpdate;
}

export interface MalPushPreview {
  changes: MalPushChange[];
  /** The stored MAL list has never been fetched: nothing can be compared. */
  needsFetch: boolean;
}

/** Sources that mean the user put the title on their list in this app. */
const LOCAL_INTENT: readonly WatchSource[] = ['manual', 'local'];

function malScore(title: WatchTitle): number {
  return title.score === undefined ? 0 : Math.max(0, Math.min(10, Math.round(title.score)));
}

/**
 * Episodes to send. Capped at MAL's OWN count for the series — the library's
 * `episodeCount` can come from another provider (TMDB, TVmaze) that splits or
 * counts a show differently and is lower than MAL's, and capping at it sent
 * MAL fewer episodes than were watched. Unknown to MAL (0 / absent): no cap.
 */
function malEpisodes(title: WatchTitle, malTotal: number | undefined): number {
  const progress = Math.max(0, Math.trunc(title.progress ?? 0));
  return malTotal && malTotal > 0 ? Math.min(progress, malTotal) : progress;
}

/**
 * The per-title differences. A title only on the library is offered as an
 * addition when the user put it there in this app (a manual add, a Discover
 * plan, something played) — a Letterboxd film that merely gained a MAL id is
 * not the user asking for it on their MAL list.
 */
export function diffWatchLibraryAgainstMal(
  titles: readonly WatchTitle[],
  malEntries: readonly MalLibraryEntry[],
  malLastSyncAt: number | null,
): MalPushPreview {
  if (malLastSyncAt === null) return { changes: [], needsFetch: true };
  const rows = new Map<number, MalLibraryEntry>();
  for (const entry of malEntries) {
    if (entry.media === 'anime' && entry.origin === 'list') rows.set(entry.malId, entry);
  }
  const changes: MalPushChange[] = [];
  const seen = new Set<number>();
  for (const title of titles) {
    if (title.malId === undefined || seen.has(title.malId)) continue;
    seen.add(title.malId);
    const status: MalListStatus = malStatusFromWatch(title.status);
    const rewatching = title.status === 'rewatching';
    const score = malScore(title);
    const row = rows.get(title.malId);
    const episodes = malEpisodes(title, row?.totalEpisodes);
    if (!row) {
      if (!title.sources.some((source) => LOCAL_INTENT.includes(source))) continue;
      const update: MalListStatusUpdate = { status, episodesWatched: episodes };
      if (score) update.score = score;
      if (rewatching) update.rewatching = true;
      changes.push({ animeId: title.malId, titleId: title.id, title: title.title, added: true, update, before: {} });
      continue;
    }
    const update: MalListStatusUpdate = {};
    const before: MalListStatusUpdate = {};
    if (row.status !== status) {
      update.status = status;
      before.status = row.status;
    }
    if (row.rewatching !== rewatching) {
      update.rewatching = rewatching;
      before.rewatching = row.rewatching;
    }
    // Never "unrate" on MAL because the library has no score: an import that
    // said nothing about a rating is not the user clearing it.
    if (score && row.score !== score) {
      update.score = score;
      before.score = row.score;
    }
    if (row.episodesWatched !== episodes && !(episodes === 0 && title.progress === undefined)) {
      update.episodesWatched = episodes;
      before.episodesWatched = row.episodesWatched;
    }
    if (Object.keys(update).length) {
      changes.push({ animeId: title.malId, titleId: title.id, title: title.title, added: false, update, before });
    }
  }
  changes.sort((a, b) => a.title.localeCompare(b.title));
  return { changes, needsFetch: false };
}

/**
 * The stored MAL row after a successful push, so the next preview no longer
 * lists it. `syncedAt` is left alone on purpose: bumping it would make the
 * watch library fold these rows back in as fresh MAL data.
 */
export function applyPushedUpdate(
  entries: readonly MalLibraryEntry[],
  change: MalPushChange,
  confirmed: MalListStatusUpdate,
  now: number,
): MalLibraryEntry[] {
  const merged: MalListStatusUpdate = { ...change.update, ...confirmed };
  const index = entries.findIndex((entry) => entry.malId === change.animeId && entry.media === 'anime' && entry.origin === 'list');
  if (index < 0) {
    return [...entries, {
      malId: change.animeId,
      media: 'anime',
      title: change.title,
      status: merged.status,
      episodesWatched: merged.episodesWatched ?? 0,
      score: merged.score ?? 0,
      rewatching: merged.rewatching ?? false,
      origin: 'list',
      addedAt: now,
      syncedAt: now,
    }];
  }
  const next = [...entries];
  const row = next[index];
  next[index] = {
    ...row,
    status: merged.status ?? row.status,
    episodesWatched: merged.episodesWatched ?? row.episodesWatched,
    score: merged.score ?? row.score,
    rewatching: merged.rewatching ?? row.rewatching,
  };
  return next;
}
