/**
 * Discovery IPC for the Scraper app.
 *
 * A thin adapter, on purpose. The provider clients already own HTTP, rate
 * limiting, retries and the disk cache; `shared/mediaDiscovery.ts` owns the
 * ranking. This file does one thing: turn a renderer request into provider calls
 * and project the result down to the wire type the console renders.
 *
 * Both public metadata APIs are used — Jikan (MyAnimeList) as the primary,
 * AniList as a widener on search only. Neither needs a key, and both are
 * catalogue APIs: this module reads published metadata, it does not fetch,
 * enumerate, or resolve media streams.
 */

import { ipcMain } from 'electron';
import {
  anilistBrowse,
  anilistSearch,
  jikanBrowse,
  jikanById,
  jikanSearch,
  seasonForMonth,
  type AnilistBrowseResult,
  type JikanFeedId,
  type ProviderWork,
} from './mediaProviderClients';
import {
  dedupeDiscoveryCandidates,
  isDiscoveryFeed,
  type DiscoveryCandidate,
  type DiscoveryFeedId,
  type DiscoveryFeedResult,
  type DiscoveryProviderId,
} from '../shared/mediaDiscovery';

/** How many hits each provider contributes to one search. */
const SEARCH_LIMIT = 12;
/** One Jikan page. Enough to rank meaningfully without a second round-trip. */
const FEED_LIMIT = 25;

/** Projects a provider record down to the fields the console shows or scores. */
function toCandidate(work: ProviderWork): DiscoveryCandidate {
  return {
    provider: work.provider,
    id: work.id,
    mediaType: 'anime',
    title: work.displayTitle || work.titles[0] || '',
    nativeTitle: work.nativeTitle,
    synopsis: work.synopsis,
    year: work.year,
    format: work.format,
    status: work.status,
    episodeCount: work.episodeCount,
    genres: work.genres ?? [],
    studio: work.studio,
    rating: work.rating,
    popularity: work.popularity,
    posterUrl: work.posterUrl,
  };
}

/** Titles with no name are unrenderable and unrankable — drop them at the seam. */
function usable(candidate: DiscoveryCandidate): boolean {
  return candidate.title.trim().length > 0;
}

/**
 * Searches both providers and merges the results.
 *
 * Failures are swallowed per provider rather than per call: if AniList is down,
 * a Jikan-only list is a materially better answer than an error, and the
 * console has no way to act on "one of two providers failed" anyway.
 */
export async function searchDiscovery(query: string): Promise<DiscoveryCandidate[]> {
  const trimmed = typeof query === 'string' ? query.trim() : '';
  if (!trimmed) return [];
  const [jikan, anilist] = await Promise.all([
    jikanSearch(trimmed, SEARCH_LIMIT).catch(() => [] as ProviderWork[]),
    anilistSearch(trimmed, SEARCH_LIMIT).catch(() => [] as ProviderWork[]),
  ]);
  return dedupeDiscoveryCandidates([...jikan, ...anilist].map(toCandidate).filter(usable));
}

/**
 * Pulls one curated feed — the "find me something" path, with no query.
 *
 * MyAnimeList is asked first and AniList is the understudy. That fallback is
 * silent by design at the transport layer, which was the problem: Jikan answers
 * a MyAnimeList outage with a 504, `jikanBrowse` turns that into an empty list,
 * and the shelf filled with AniList rows under a header that still said
 * MyAnimeList. The provenance returned here is what lets the UI tell the truth
 * about which catalogue answered and which season the rows are really from.
 */
export async function browseDiscovery(feed: DiscoveryFeedId, page = 1): Promise<DiscoveryFeedResult> {
  const failures: DiscoveryProviderId[] = [];
  const primary = await jikanBrowse(feed as JikanFeedId, page, FEED_LIMIT)
    .catch(() => [] as ProviderWork[]);

  let works = primary;
  let servedBy: DiscoveryProviderId | null = 'jikan';
  let fallbackSeason: { season: string; year: number } | undefined;

  if (primary.length === 0) {
    failures.push('jikan');
    const secondary: AnilistBrowseResult = await anilistBrowse(feed as JikanFeedId, page, FEED_LIMIT)
      .catch(() => ({ works: [] as ProviderWork[] }));
    works = secondary.works;
    servedBy = 'anilist';
    if (secondary.works.length === 0) {
      failures.push('anilist');
      servedBy = null;
    } else if (secondary.season && !isCurrentSeason(secondary.season)) {
      fallbackSeason = secondary.season;
    }
  }

  return {
    candidates: dedupeDiscoveryCandidates(works.map(toCandidate).filter(usable)),
    provenance: { servedBy, failures, fallbackSeason, fetchedAt: Date.now() },
  };
}

/** True when a season descriptor is the one we are actually living in. */
function isCurrentSeason(value: { season: string; year: number }): boolean {
  const now = new Date();
  return value.year === now.getUTCFullYear()
    && value.season === seasonForMonth(now.getUTCMonth() + 1);
}

/** Full record for the inspector pane, where the list's summary is not enough. */
export async function discoveryDetail(id: number): Promise<DiscoveryCandidate | null> {
  if (!Number.isFinite(id)) return null;
  const work = await jikanById(Math.trunc(id)).catch(() => null);
  if (!work) return null;
  const candidate = toCandidate(work);
  return usable(candidate) ? candidate : null;
}

export function registerMediaDiscoveryIpc(): void {
  ipcMain.handle('discovery:search', async (_event, query: unknown) =>
    searchDiscovery(typeof query === 'string' ? query : ''));

  ipcMain.handle('discovery:browse', async (_event, feed: unknown, page: unknown) =>
    browseDiscovery(
      isDiscoveryFeed(feed) ? feed : 'seasonal',
      typeof page === 'number' && Number.isFinite(page) ? page : 1,
    ));

  ipcMain.handle('discovery:detail', async (_event, id: unknown) =>
    discoveryDetail(typeof id === 'number' ? id : Number.NaN));
}
