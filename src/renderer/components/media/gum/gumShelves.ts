/**
 * What each Home section holds, and which title the hero features.
 *
 * Pure over the `GumTitle` list plus the two "live" inputs Home has: the resume
 * rows (`useContinueWatchingRows`, which already joins the workspace's resume store
 * with the library) and the ingest arrivals. Every function returns an empty list
 * rather than a placeholder, because an empty section hides itself.
 */

import type { MediaItem } from '../../../../shared/types';
import { isWatched } from '../../../../shared/mediaLibraryEntries';
import type { ContinueWatchingRow } from '../ContinueWatchingShelf';
import {
  filterGumTitles,
  isEpisodeSeen,
  matchesType,
  nextEpisodeOf,
  orderedEpisodes,
  sortGumTitles,
  type GumTitle,
  type GumTypeTab,
} from './gumModel';
import { FRESH_IMPORT_MS, JUST_ADDED_WINDOW_MS, type GumArrival, type GumSavedView } from './gumLayout';

/** mediaItemId → the title that owns it. */
export function titleIndex(titles: readonly GumTitle[]): Map<string, GumTitle> {
  const map = new Map<string, GumTitle>();
  for (const title of titles) for (const item of title.items) map.set(item.id, title);
  return map;
}

export interface GumContinueCard {
  row: ContinueWatchingRow;
  title?: GumTitle;
}

/**
 * Resume rows whose file is still in the library. A row whose file has gone (deleted,
 * or removed from the library) has nothing to resume and used to stay first in line
 * for the hero, which kept offering to play a file that no longer existed.
 */
export function continueCards(rows: readonly ContinueWatchingRow[], index: ReadonlyMap<string, GumTitle>): GumContinueCard[] {
  const out: GumContinueCard[] = [];
  for (const row of rows) {
    if (!row.item) continue;
    out.push({ row, title: index.get(row.item.id) });
  }
  return out;
}

/**
 * A tracked show you are watching whose next episode is not on this PC — a MAL row at
 * 12/26 with no files, or with files only up to where you are. Only local resume
 * positions used to count as "in progress", so such a show appeared nowhere on Home.
 */
export interface GumTrackedNextCard {
  title: GumTitle;
  /** The next episode number, one past the tracker's progress. */
  episode: number;
}

export function trackedNextCards(
  titles: readonly GumTitle[],
  covered: ReadonlySet<string>,
): GumTrackedNextCard[] {
  const out: GumTrackedNextCard[] = [];
  for (const title of titles) {
    if (!title.tracked || !isWatchingStatus(title) || title.kind === 'film' || covered.has(title.id)) continue;
    const episode = Math.max(0, title.progress) + 1;
    if (title.episodeCount !== undefined && episode > title.episodeCount) continue;
    // A file for that episode is Up next's (or Continue watching's) to offer.
    if (title.items.some((item) => item.episode === episode && (item.season ?? 1) === (title.seasons[0] ?? 1))) continue;
    out.push({ title, episode });
  }
  return out.sort((a, b) => (b.title.lastWatchedAt ?? b.title.addedAt) - (a.title.lastWatchedAt ?? a.title.addedAt));
}

export interface GumUpNextCard {
  title: GumTitle;
  item: MediaItem;
}

function isWatchingStatus(title: GumTitle): boolean {
  return title.status === 'watching' || title.status === 'rewatching';
}

/**
 * The next unwatched episode of every show you are watching. An episode already
 * started is Continue watching's, not Up next's, so a show whose next episode is
 * in progress does not appear twice. "Watched" includes what the tracker counts
 * (`isEpisodeSeen`), so a MAL show at 12/26 offers episode 13, not episode 1.
 */
export function upNextCards(titles: readonly GumTitle[]): GumUpNextCard[] {
  const out: GumUpNextCard[] = [];
  for (const title of titles) {
    if (!isWatchingStatus(title) || title.kind === 'film' || !title.onDisk) continue;
    const ordered = orderedEpisodes(title);
    if (ordered.some((item) => (item.positionSec ?? 0) > 0 && !isWatched(item))) continue;
    let lastSeen = -1;
    ordered.forEach((item, index) => {
      if (isEpisodeSeen(title, item)) lastSeen = index;
    });
    const next = ordered.slice(lastSeen + 1).find((item) => !isEpisodeSeen(title, item));
    if (next) out.push({ title, item: next });
  }
  return out.sort((a, b) => (b.title.lastWatchedAt ?? 0) - (a.title.lastWatchedAt ?? 0));
}

export type GumArrivalBadge = 'newEpisode' | 'new' | 'film' | 'season';

export interface GumJustAddedCard {
  title: GumTitle;
  item: MediaItem;
  at: number;
  badge: GumArrivalBadge;
  season?: number;
}

/**
 * Arrivals first (the ingest pipeline's own announcements), then anything else
 * added to the library inside the window, newest first, one card per title.
 */
export function justAddedCards(
  titles: readonly GumTitle[],
  arrivals: readonly GumArrival[],
  now: number,
): GumJustAddedCard[] {
  const index = titleIndex(titles);
  const seen = new Set<string>();
  const out: GumJustAddedCard[] = [];
  const push = (item: MediaItem, at: number): void => {
    const title = index.get(item.id);
    if (!title || seen.has(title.id)) return;
    seen.add(title.id);
    const badge: GumArrivalBadge = title.kind === 'film'
      ? 'film'
      : title.tracked && isWatchingStatus(title) && typeof item.episode === 'number'
        ? 'newEpisode'
        : (item.season ?? 1) > 1
          ? 'season'
          : 'new';
    out.push({ title, item, at, badge, season: item.season });
  };
  const byId = new Map<string, MediaItem>();
  for (const title of titles) for (const item of title.items) byId.set(item.id, item);
  for (const arrival of arrivals) {
    for (const id of arrival.itemIds) {
      const item = byId.get(id);
      if (item) push(item, arrival.at);
    }
  }
  const recent = [...byId.values()]
    .filter((item) => now - item.addedAt <= JUST_ADDED_WINDOW_MS)
    .sort((a, b) => b.addedAt - a.addedAt);
  for (const item of recent) push(item, item.addedAt);
  return out.sort((a, b) => b.at - a.at);
}

export function hasFreshImport(arrivals: readonly GumArrival[], now: number): boolean {
  return arrivals.some((arrival) => now - arrival.at <= FRESH_IMPORT_MS);
}

export function planTitles(titles: readonly GumTitle[]): GumTitle[] {
  return sortGumTitles(titles.filter((title) => title.status === 'plan'), 'added', 'desc');
}

export function completedTitles(titles: readonly GumTitle[]): GumTitle[] {
  const done = titles.filter((title) => title.status === 'completed');
  return [...done].sort((a, b) => (b.finishedAt ?? b.lastWatchedAt ?? 0) - (a.finishedAt ?? a.lastWatchedAt ?? 0));
}

/** A shelf for one type: in progress first, then recently watched, then recently added. */
export function typeShelf(titles: readonly GumTitle[], type: GumTypeTab): GumTitle[] {
  const matching = titles.filter((title) => matchesType(title, type) && title.status !== 'dropped');
  return [...matching].sort((a, b) => {
    const pa = a.watchState === 'progress' ? 1 : 0;
    const pb = b.watchState === 'progress' ? 1 : 0;
    if (pa !== pb) return pb - pa;
    return (b.lastWatchedAt ?? b.addedAt) - (a.lastWatchedAt ?? a.addedAt);
  });
}

export interface GumListRow {
  name: string;
  titles: GumTitle[];
}

export function listRows(titles: readonly GumTitle[], limit = 6): GumListRow[] {
  const map = new Map<string, GumListRow>();
  for (const title of titles) {
    for (const name of title.lists) {
      const key = name.toLowerCase();
      const row = map.get(key);
      if (row) row.titles.push(title);
      else map.set(key, { name, titles: [title] });
    }
  }
  return [...map.values()].sort((a, b) => b.titles.length - a.titles.length).slice(0, limit);
}

/** The viewer's own top genres, each as a row of titles not yet finished first. */
export function genreRows(titles: readonly GumTitle[], limit = 3): GumListRow[] {
  const counts = new Map<string, { name: string; titles: GumTitle[] }>();
  for (const title of titles) {
    for (const genre of title.genres) {
      const key = genre.toLowerCase();
      const row = counts.get(key);
      if (row) row.titles.push(title);
      else counts.set(key, { name: genre, titles: [title] });
    }
  }
  return [...counts.values()]
    .filter((row) => row.titles.length >= 3)
    .sort((a, b) => b.titles.length - a.titles.length)
    .slice(0, limit)
    .map((row) => ({
      name: row.name,
      titles: [...row.titles].sort((a, b) => Number(a.watchState === 'finished') - Number(b.watchState === 'finished')
        || (b.score ?? 0) - (a.score ?? 0)),
    }));
}

export function savedViewTitles(titles: readonly GumTitle[], view: GumSavedView, now: number): GumTitle[] {
  const matched = filterGumTitles(titles, { status: view.status, type: view.type, filters: view.filters }, now);
  return sortGumTitles(matched, view.sort, view.dir);
}

export type GumHeroReason = 'continue' | 'newEpisode' | 'recent';

export interface GumHeroPick {
  reason: GumHeroReason;
  title?: GumTitle;
  item?: MediaItem;
  row?: ContinueWatchingRow;
}

/**
 * The hero features the most relevant thing: what you are in the middle of, else a
 * new episode of a show you are watching, else the latest arrival.
 *
 * Outside a resume, the episode offered is the title's NEXT one (`nextEpisodeOf`:
 * the lowest unseen episode on disk), never simply the file that arrived — a fresh
 * show whose third episode landed last used to read "Play E3" with E1 and E2 unwatched.
 */
export function pickHero(
  continueList: readonly GumContinueCard[],
  justAdded: readonly GumJustAddedCard[],
  titles: readonly GumTitle[],
): GumHeroPick | null {
  const resume = continueList.find((card) => card.row.item);
  if (resume) return { reason: 'continue', title: resume.title, item: resume.row.item, row: resume.row };
  const next = (title: GumTitle, fallback?: MediaItem): MediaItem | undefined => nextEpisodeOf(title) ?? fallback;
  const fresh = justAdded.find((card) => card.badge === 'newEpisode');
  if (fresh) return { reason: 'newEpisode', title: fresh.title, item: next(fresh.title, fresh.item) };
  const latest = justAdded[0];
  if (latest) return { reason: 'recent', title: latest.title, item: next(latest.title, latest.item) };
  const onDisk = [...titles].filter((title) => title.onDisk).sort((a, b) => b.addedAt - a.addedAt)[0];
  return onDisk ? { reason: 'recent', title: onDisk, item: next(onDisk, onDisk.items[0]) } : null;
}
