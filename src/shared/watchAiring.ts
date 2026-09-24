/**
 * Airing schedule for the watch library — the pure half.
 *
 * `main/watchAiring.ts` asks AniList, in batches, when the next episode of each
 * Watching / Plan-to-watch anime airs, and stores it on the title as
 * `nextAiring`. The tracking dashboard and its calendar read that; nothing is
 * typed in by hand. When a stored `nextAiring` of a title the user is watching
 * passes, that episode has aired: one notification, once per episode.
 *
 * Pure: titles and AniList rows in, decisions out. No clock (`now` is passed).
 */

import type { WatchNextAiring, WatchStatus, WatchTitle } from './watchLibrary';

/** Statuses whose schedule is worth asking about. */
export const AIRING_TRACKED_STATUSES: readonly WatchStatus[] = ['watching', 'rewatching', 'plan'];
/** Statuses that get a "new episode" notification. */
export const AIRING_NOTIFY_STATUSES: readonly WatchStatus[] = ['watching', 'rewatching'];

/** AniList answers at most 50 media per page. */
export const AIRING_BATCH_SIZE = 50;

export interface AiringRow {
  anilistId: number;
  malId?: number;
  /** AniList `status`: RELEASING, FINISHED, NOT_YET_RELEASED, CANCELLED, HIATUS. */
  status?: string;
  nextEpisode?: number;
  /** Epoch ms. */
  nextAiringAt?: number;
}

/** Titles to ask about: tracked statuses, and an id AniList can look up. */
export function airingCandidates(titles: readonly WatchTitle[]): WatchTitle[] {
  return titles.filter((title) => AIRING_TRACKED_STATUSES.includes(title.status)
    && (title.malId !== undefined || title.anilistId !== undefined)
    // A film has no "next episode"; a finished run with a known count is done.
    && title.kind !== 'film');
}

/** Ids split into AniList request batches: by MAL id where known, else by AniList id. */
export function airingBatches(titles: readonly WatchTitle[], size = AIRING_BATCH_SIZE): { by: 'mal' | 'anilist'; ids: number[] }[] {
  const mal = [...new Set(titles.filter((t) => t.malId !== undefined).map((t) => t.malId as number))];
  const anilist = [...new Set(titles.filter((t) => t.malId === undefined && t.anilistId !== undefined).map((t) => t.anilistId as number))];
  const out: { by: 'mal' | 'anilist'; ids: number[] }[] = [];
  for (let i = 0; i < mal.length; i += size) out.push({ by: 'mal', ids: mal.slice(i, i + size) });
  for (let i = 0; i < anilist.length; i += size) out.push({ by: 'anilist', ids: anilist.slice(i, i + size) });
  return out;
}

/**
 * What to store per title. A row with a next episode sets it; a row without
 * one (finished, cancelled, or not scheduled yet) clears it. A title AniList
 * did not answer about keeps what it had — an absent row is not evidence.
 */
export function planAiringUpdates(
  titles: readonly WatchTitle[],
  rows: readonly AiringRow[],
): Map<string, WatchNextAiring | null> {
  const byMal = new Map<number, AiringRow>();
  const byAnilist = new Map<number, AiringRow>();
  for (const row of rows) {
    byAnilist.set(row.anilistId, row);
    if (row.malId !== undefined) byMal.set(row.malId, row);
  }
  const updates = new Map<string, WatchNextAiring | null>();
  for (const title of titles) {
    const row = (title.malId !== undefined ? byMal.get(title.malId) : undefined)
      ?? (title.anilistId !== undefined ? byAnilist.get(title.anilistId) : undefined);
    if (!row) continue;
    const next: WatchNextAiring | null = row.nextEpisode && row.nextAiringAt
      ? { episode: row.nextEpisode, at: row.nextAiringAt }
      : null;
    const current = title.nextAiring ?? null;
    if (next?.episode === current?.episode && next?.at === current?.at) continue;
    updates.set(title.id, next);
  }
  return updates;
}

export interface AiredEpisode {
  titleId: string;
  title: string;
  episode: number;
  at: number;
}

/**
 * Episodes that have aired since they were scheduled, for titles being
 * watched, not yet announced. `notified` maps title id → the last episode
 * announced; the caller records what it announces there.
 */
/**
 * The keys an announcement is remembered under: the MAL and AniList ids, which
 * survive a dedupe merge, and the title id as a fallback (and for state written
 * before the ids were used). Keyed by title id alone, a merge that removed the
 * announced copy made the survivor announce the same episode again.
 */
export function airingNotifyKeys(title: Pick<WatchTitle, 'id' | 'malId' | 'anilistId'>): string[] {
  const keys: string[] = [];
  if (title.malId !== undefined) keys.push(`mal:${title.malId}`);
  if (title.anilistId !== undefined) keys.push(`anilist:${title.anilistId}`);
  keys.push(title.id);
  return keys;
}

/** The last episode announced for `title` under any of its keys. */
export function lastAnnouncedEpisode(title: Pick<WatchTitle, 'id' | 'malId' | 'anilistId'>, notified: Readonly<Record<string, number>>): number {
  return Math.max(0, ...airingNotifyKeys(title).map((key) => notified[key] ?? 0));
}

export function airedEpisodesToAnnounce(
  titles: readonly WatchTitle[],
  notified: Readonly<Record<string, number>>,
  now: number,
): AiredEpisode[] {
  const out: AiredEpisode[] = [];
  for (const title of titles) {
    const next = title.nextAiring;
    if (!next || next.at > now || !AIRING_NOTIFY_STATUSES.includes(title.status)) continue;
    if (lastAnnouncedEpisode(title, notified) >= next.episode) continue;
    // Already watched that far (a fast viewer, or a delayed check): nothing new.
    if ((title.progress ?? 0) >= next.episode) continue;
    out.push({ titleId: title.id, title: title.title, episode: next.episode, at: next.at });
  }
  return out;
}
