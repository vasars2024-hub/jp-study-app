/**
 * Metadata provider clients: Jikan (the unofficial MyAnimeList API) and AniList.
 * TVmaze and TMDB live beside them in `providers/`, sharing the same plumbing
 * (`providers/providerHttp.ts`) and returning the same {@link ProviderWork}.
 *
 * Execution lives here rather than in `src/shared` on purpose. The shared layer is
 * contractually pure — no I/O, no clock, no network — and a previous phase
 * deliberately removed HTTP code that had leaked into it. So the pure layer scores
 * matches (`shared/mediaMetadataMatch.ts`) and this file does the talking.
 *
 * Neither provider needs a key. Jikan publishes a rate limit (3 requests/second,
 * 60/minute) and enforces it with 429s, so the limiter below is not optional
 * politeness — without it a sweep over a large library gets throttled into
 * failure part-way through.
 *
 * Responses are cached on disk under `<userData>/metadata-cache`, keyed by the
 * normalized query, so re-running a sweep or re-opening the app does not re-ask.
 */

import { app, net } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import type { MediaMetadataProviderId } from '../shared/mediaMetadataIpc';
import type { RelatedWork } from '../shared/mediaSeasons';
import {
  FEED_CACHE_TTL_MS,
  RateLimiter,
  REQUEST_TIMEOUT_MS,
  USER_AGENT,
  clearMetadataCache,
  num,
  readCache,
  requestJson,
  text,
  writeCache,
} from './providers/providerHttp';

// Re-exported so existing importers keep one door into the provider layer.
export { clearMetadataCache };

/** One episode of a run, as a provider lists it. */
export interface ProviderEpisode {
  /** Season number; absent when the provider numbers the run absolutely. */
  season?: number;
  number: number;
  title?: string;
  /** Original air date, epoch ms. */
  airedAt?: number;
  runtimeMin?: number;
  /** Remote still. Downloaded into the artwork cache, never persisted as a URL. */
  stillUrl?: string;
}

/** What a provider hands back, normalized across every provider. */
export interface ProviderWork {
  provider: MediaMetadataProviderId;
  id: number;
  /** Every name the provider knows, for the pure matcher to score. */
  titles: string[];
  displayTitle: string;
  nativeTitle?: string;
  /** The official English title, when the provider has one (AniList `title.english`, Jikan `title_english`). */
  englishTitle?: string;
  /** The romanised title (AniList `title.romaji`, MAL's own main title). */
  romajiTitle?: string;
  synopsis?: string;
  year?: number;
  format?: string;
  status?: string;
  episodeCount?: number;
  genres?: string[];
  studio?: string;
  rating?: number;
  rank?: number;
  popularity?: number;
  relatedTitles?: string[];
  /**
   * The same relations as `relatedTitles`, kept with their ids and episode
   * counts. AniList-only: Jikan's related list carries MAL ids, and mixing the
   * two id spaces is how a lookup silently asks about a different show.
   */
  relatedWorks?: RelatedWork[];
  posterUrl?: string;
  /** Wide hero art. AniList's banner strip; TV/film providers fill `backdropUrl`. */
  bannerUrl?: string;
  /** 16:9 background art (TMDB backdrop, TVmaze background). */
  backdropUrl?: string;
  malId?: number;
  anilistId?: number;
  /** TVmaze show id. */
  tvmazeId?: number;
  /** TMDB id, in the namespace `tmdbType` names — TMDB movie and TV ids collide. */
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  /** IMDb id (`tt0123456`). */
  imdbId?: string;
  /** Minutes: a film's running time, or a typical episode's. */
  runtimeMin?: number;
  /** Broadcaster or streaming service. */
  network?: string;
  /** Original language, lower-cased as the provider words it (`japanese`, `ja`). */
  language?: string;
  /** ISO 3166 country of origin (`JP`), when the provider states one. */
  country?: string;
  /**
   * Whether the provider says this is animation. `undefined` when it does not
   * say — Jikan and AniList list nothing else, so for them it is simply true.
   */
  animation?: boolean;
  /** TVmaze's show type, lower-cased: `scripted`, `animation`, `reality`, … */
  showType?: string;
  /** The episode run, when the provider lists one in the same answer (TVmaze). */
  episodes?: ProviderEpisode[];
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

const jikanLimiter = new RateLimiter(3, 60);
// AniList publishes 90/min; kept well under. Every anime match now costs one
// AniList request (the `idMal` enrichment), so this is the budget that bounds a
// large first sweep — 60/min is still a third below the published ceiling.
const anilistLimiter = new RateLimiter(2, 60);
/**
 * Image CDNs are not the rate-limited APIs, but a first sweep over a big library
 * downloads hundreds of posters and episode stills — kept polite and, above all,
 * off the AniList API budget it used to share.
 */
const artLimiter = new RateLimiter(4, 150);

// ---------------------------------------------------------------------------
// Jikan (MyAnimeList)
// ---------------------------------------------------------------------------

const JIKAN = 'https://api.jikan.moe/v4';

interface JikanAnime {
  mal_id: number;
  url?: string;
  images?: { jpg?: { large_image_url?: string; image_url?: string } };
  titles?: Array<{ type?: string; title?: string }>;
  title?: string;
  title_english?: string;
  title_japanese?: string;
  title_synonyms?: string[];
  type?: string;
  episodes?: number;
  status?: string;
  synopsis?: string;
  year?: number;
  aired?: { from?: string };
  score?: number;
  rank?: number;
  members?: number;
  genres?: Array<{ name?: string }>;
  studios?: Array<{ name?: string }>;
  relations?: Array<{ entry?: Array<{ name?: string }> }>;
  /** Free text: `24 min per ep`, `1 hr 45 min`, `Unknown`. */
  duration?: string;
}

/**
 * Minutes out of Jikan's prose duration (`24 min per ep`, `1 hr 45 min`,
 * `2 hr`), or undefined for `Unknown` and anything unreadable.
 */
export function parseJikanDuration(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined;
  const hours = /(\d+)\s*hr/i.exec(value);
  const minutes = /(\d+)\s*min/i.exec(value);
  if (!hours && !minutes) return undefined;
  const total = Number(hours?.[1] ?? 0) * 60 + Number(minutes?.[1] ?? 0);
  return total > 0 ? total : undefined;
}

function jikanToWork(anime: JikanAnime): ProviderWork {
  const titles = [
    ...(anime.titles ?? []).map((entry) => entry.title),
    anime.title,
    anime.title_english,
    anime.title_japanese,
    ...(anime.title_synonyms ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  const airedYear = anime.aired?.from ? Number(anime.aired.from.slice(0, 4)) : undefined;

  return {
    provider: 'jikan',
    id: anime.mal_id,
    malId: anime.mal_id,
    titles: [...new Set(titles.map((t) => t.trim()))],
    displayTitle: text(anime.title_english) ?? text(anime.title) ?? titles[0] ?? '',
    nativeTitle: text(anime.title_japanese),
    englishTitle: text(anime.title_english),
    romajiTitle: text(anime.title),
    synopsis: text(anime.synopsis),
    year: num(anime.year) ?? (Number.isFinite(airedYear) ? airedYear : undefined),
    format: text(anime.type),
    status: text(anime.status),
    episodeCount: num(anime.episodes),
    genres: (anime.genres ?? []).map((g) => text(g.name)).filter((v): v is string => !!v),
    studio: (anime.studios ?? []).map((s) => text(s.name)).filter((v): v is string => !!v)[0],
    rating: num(anime.score),
    rank: num(anime.rank),
    popularity: num(anime.members),
    relatedTitles: [...new Set(
      (anime.relations ?? [])
        .flatMap((relation) => relation.entry ?? [])
        .map((entry) => text(entry.name))
        .filter((v): v is string => !!v),
    )].slice(0, 12),
    posterUrl: text(anime.images?.jpg?.large_image_url) ?? text(anime.images?.jpg?.image_url),
    runtimeMin: parseJikanDuration(anime.duration),
    // MyAnimeList lists nothing but animation.
    animation: true,
  };
}

/**
 * Searches MyAnimeList through Jikan.
 *
 * `null` means **the provider did not answer** — a 504 (which is what a
 * MyAnimeList outage looks like from Jikan), a transport error, or unparseable
 * JSON. An empty array means it answered and had nothing. Collapsing the two,
 * which this used to do, is what let a total outage reach the user as
 * "Nothing matched": measured live on 2026-08-16 with Jikan at 504 and AniList
 * at 403, the Discover console told the user their query had no results.
 */
export async function jikanSearch(title: string, limit = 8): Promise<ProviderWork[] | null> {
  const query = title.trim();
  if (!query) return [];
  const key = `jikan:search:${query.toLowerCase()}:${limit}`;
  const cached = readCache<JikanAnime[]>(key);
  const data = cached
    ?? (await requestJson<{ data?: JikanAnime[] }>(
      `${JIKAN}/anime?q=${encodeURIComponent(query)}&limit=${limit}&sfw=false`,
      jikanLimiter,
    ))?.data
    ?? null;
  if (!data) return null;
  if (!cached) writeCache(key, data);
  return data.filter((entry) => num(entry?.mal_id) !== undefined).map(jikanToWork);
}

/** The unattended feeds the Scraper app browses when no query is typed. */
export type JikanFeedId = 'seasonal' | 'airing' | 'top' | 'upcoming';

const JIKAN_FEED_PATHS: Record<JikanFeedId, string> = {
  seasonal: 'seasons/now',
  // `filter=airing` on the top endpoint is what "currently airing, ranked" means
  // to Jikan; the plain `seasons/now` list is chronological, not ranked.
  airing: 'top/anime?filter=airing',
  top: 'top/anime?filter=bypopularity',
  upcoming: 'seasons/upcoming',
};

/**
 * A page of a curated Jikan feed — this is the "auto-find shows" path, where the
 * app proposes titles without the user naming one.
 *
 * `limit` is clamped to Jikan's own page maximum of 25. Asking for more silently
 * returns 25 anyway, and pretending otherwise would make the caller's paging
 * arithmetic wrong.
 */
export async function jikanBrowse(feed: JikanFeedId, page = 1, limit = 25): Promise<ProviderWork[]> {
  const size = Math.max(1, Math.min(25, Math.trunc(limit) || 25));
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const path = JIKAN_FEED_PATHS[feed] ?? JIKAN_FEED_PATHS.seasonal;
  const separator = path.includes('?') ? '&' : '?';
  const key = `jikan:feed:${feed}:${safePage}:${size}`;
  const cached = readCache<JikanAnime[]>(key, FEED_CACHE_TTL_MS);
  const data = cached
    ?? (await requestJson<{ data?: JikanAnime[] }>(
      `${JIKAN}/${path}${separator}page=${safePage}&limit=${size}&sfw=true`,
      jikanLimiter,
    ))?.data
    ?? null;
  if (!data) return [];
  if (!cached) writeCache(key, data);
  return data.filter((entry) => num(entry?.mal_id) !== undefined).map(jikanToWork);
}

export async function jikanById(malId: number): Promise<ProviderWork | null> {
  const key = `jikan:anime:${malId}`;
  const cached = readCache<JikanAnime>(key);
  const data = cached
    ?? (await requestJson<{ data?: JikanAnime }>(`${JIKAN}/anime/${malId}/full`, jikanLimiter))?.data
    ?? null;
  if (!data) return null;
  if (!cached) writeCache(key, data);
  return jikanToWork(data);
}

interface JikanEpisode {
  mal_id?: number;
  title?: string;
  title_japanese?: string;
  aired?: string;
}

/** Per-episode facts worth keeping, keyed by episode number. */
export interface JikanEpisodeInfo {
  title?: string;
  /** Original air date, epoch ms. */
  airedAt?: number;
}

/**
 * Per-episode titles and air dates, keyed by episode number.
 *
 * Both come from the same request, so capturing the air date is free — and it is
 * what turns "sort by air date" from a menu entry that silently falls back to the
 * series year into a sort that actually orders episodes.
 *
 * Paged 100 at a time by the API. Capped at five pages: a 500-episode run is a
 * long-runner whose per-episode data is not worth ten more rate-limited requests
 * during an import, and the numbered list still works without it.
 */
export async function jikanEpisodeInfo(malId: number): Promise<Record<string, JikanEpisodeInfo>> {
  const key = `jikan:episodeInfo:${malId}`;
  const cached = readCache<Record<string, JikanEpisodeInfo>>(key);
  if (cached) return cached;

  const info: Record<string, JikanEpisodeInfo> = {};
  for (let page = 1; page <= 5; page += 1) {
    const response = await requestJson<{ data?: JikanEpisode[]; pagination?: { has_next_page?: boolean } }>(
      `${JIKAN}/anime/${malId}/episodes?page=${page}`,
      jikanLimiter,
    );
    const rows = response?.data;
    if (!rows || rows.length === 0) break;
    for (const row of rows) {
      const number = num(row.mal_id);
      if (number === undefined) continue;
      const title = text(row.title) ?? text(row.title_japanese);
      const airedMs = row.aired ? Date.parse(row.aired) : Number.NaN;
      const entry: JikanEpisodeInfo = {};
      if (title) entry.title = title;
      if (Number.isFinite(airedMs)) entry.airedAt = airedMs;
      if (entry.title || entry.airedAt) info[String(number)] = entry;
    }
    if (!response?.pagination?.has_next_page) break;
  }
  writeCache(key, info);
  return info;
}

// ---------------------------------------------------------------------------
// AniList
// ---------------------------------------------------------------------------

const ANILIST = 'https://graphql.anilist.co';

const ANILIST_FIELDS = `
  id
  idMal
  title { romaji english native }
  synonyms
  description(asHtml: false)
  startDate { year }
  format
  status
  episodes
  duration
  countryOfOrigin
  genres
  averageScore
  popularity
  coverImage { extraLarge large }
  bannerImage
  studios(isMain: true) { nodes { name } }
  relations { edges { relationType node { id title { romaji english } format episodes } } }
`;

interface AnilistMedia {
  id: number;
  idMal?: number | null;
  title?: { romaji?: string | null; english?: string | null; native?: string | null };
  synonyms?: string[];
  description?: string | null;
  startDate?: { year?: number | null };
  format?: string | null;
  status?: string | null;
  episodes?: number | null;
  /** Minutes per episode (or the film's length). */
  duration?: number | null;
  /** ISO 3166 country (`JP`, `CN`, `KR`). */
  countryOfOrigin?: string | null;
  genres?: string[];
  averageScore?: number | null;
  popularity?: number | null;
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  studios?: { nodes?: Array<{ name?: string | null }> };
  relations?: {
    edges?: Array<{
      relationType?: string | null;
      node?: {
        id?: number | null;
        title?: { romaji?: string | null; english?: string | null };
        format?: string | null;
        episodes?: number | null;
      };
    }>;
  };
}

function anilistToWork(media: AnilistMedia): ProviderWork {
  const titles = [
    media.title?.romaji,
    media.title?.english,
    media.title?.native,
    ...(media.synonyms ?? []),
  ].filter((value): value is string => typeof value === 'string' && value.trim().length > 0);

  return {
    provider: 'anilist',
    id: media.id,
    anilistId: media.id,
    malId: num(media.idMal ?? undefined),
    titles: [...new Set(titles.map((t) => t.trim()))],
    displayTitle: text(media.title?.english) ?? text(media.title?.romaji) ?? titles[0] ?? '',
    nativeTitle: text(media.title?.native),
    englishTitle: text(media.title?.english),
    romajiTitle: text(media.title?.romaji),
    // AniList descriptions carry light HTML even with asHtml:false.
    synopsis: text(media.description?.replace(/<[^>]+>/g, '').replace(/\s+\n/g, '\n')),
    year: num(media.startDate?.year ?? undefined),
    format: text(media.format),
    status: text(media.status),
    episodeCount: num(media.episodes ?? undefined),
    genres: media.genres ?? [],
    studio: (media.studios?.nodes ?? []).map((node) => text(node?.name)).filter((v): v is string => !!v)[0],
    // AniList scores out of 100; normalized to the 10-point scale MAL uses so the
    // UI has one number to render regardless of which provider answered.
    rating: media.averageScore != null ? Math.round(media.averageScore) / 10 : undefined,
    popularity: num(media.popularity ?? undefined),
    relatedTitles: [...new Set(
      (media.relations?.edges ?? [])
        .map((edge) => text(edge?.node?.title?.english) ?? text(edge?.node?.title?.romaji))
        .filter((v): v is string => !!v),
    )].slice(0, 12),
    // The same edges kept structurally. `relatedTitles` above is display text
    // and cannot be queried with: a subtitle provider needs the id, and working
    // out which entry holds episode 26 of a two-season folder needs the episode
    // count. See `shared/mediaSeasons.ts` (D266).
    relatedWorks: (media.relations?.edges ?? [])
      .map((edge): RelatedWork | null => {
        const id = num(edge?.node?.id ?? undefined);
        const title = text(edge?.node?.title?.english) ?? text(edge?.node?.title?.romaji);
        const relationType = text(edge?.relationType);
        if (!id || !title || !relationType) return null;
        return {
          anilistId: id,
          relationType,
          title,
          format: text(edge?.node?.format),
          episodeCount: num(edge?.node?.episodes ?? undefined),
        };
      })
      .filter((work): work is RelatedWork => work !== null)
      .slice(0, 12),
    posterUrl: text(media.coverImage?.extraLarge) ?? text(media.coverImage?.large),
    bannerUrl: text(media.bannerImage),
    runtimeMin: num(media.duration ?? undefined),
    country: text(media.countryOfOrigin),
    // AniList's ANIME type is animation by definition.
    animation: true,
  };
}

/**
 * `ttlMs` exists because feeds and works age at completely different rates. A
 * work's metadata is a fact and keeps for a month; "this season" is a moving
 * list and must not. The AniList feed path used to inherit the month-long
 * default, which froze a whole season in place — see `anilistBrowse`.
 *
 * `cacheEmpty: false` is the other half of that fix. An empty page is what a
 * failing upstream looks like, and memorialising it turns a transient outage
 * into a persistent wrong answer.
 */
async function anilistQuery<T>(
  query: string,
  variables: Record<string, unknown>,
  cacheKey: string,
  options: { ttlMs?: number; cacheEmpty?: boolean } = {},
): Promise<T | null> {
  const cached = readCache<T>(cacheKey, options.ttlMs);
  if (cached) return cached;
  const response = await requestJson<{ data?: T }>(ANILIST, anilistLimiter, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const data = response?.data ?? null;
  if (data && (options.cacheEmpty !== false || anilistPageCount(data) > 0)) writeCache(cacheKey, data);
  return data;
}

/** Rows in an AniList `Page` response, for the "is this answer empty?" check. */
function anilistPageCount(data: unknown): number {
  const media = (data as { Page?: { media?: unknown[] } } | null)?.Page?.media;
  return Array.isArray(media) ? media.length : 0;
}

/** Same `null` versus `[]` contract as {@link jikanSearch}. */
export async function anilistSearch(title: string, limit = 8): Promise<ProviderWork[] | null> {
  const query = title.trim();
  if (!query) return [];
  const data = await anilistQuery<{ Page?: { media?: AnilistMedia[] } }>(
    `query ($q: String, $n: Int) {
      Page(page: 1, perPage: $n) {
        media(search: $q, type: ANIME) { ${ANILIST_FIELDS} }
      }
    }`,
    { q: query, n: limit },
    `anilist:search:${query.toLowerCase()}:${limit}`,
  );
  if (!data) return null;
  return (data.Page?.media ?? []).filter((media) => num(media?.id) !== undefined).map(anilistToWork);
}

/** Seasons in broadcast order, so "the season before this one" is an index step. */
const ANILIST_SEASONS = ['WINTER', 'SPRING', 'SUMMER', 'FALL'] as const;
export type AnilistSeason = (typeof ANILIST_SEASONS)[number];

/** The anime season a calendar month falls in. */
export function seasonForMonth(month: number): AnilistSeason {
  return ANILIST_SEASONS[Math.min(3, Math.max(0, Math.ceil(month / 3) - 1))] ?? 'WINTER';
}

/** One season earlier, wrapping the year at WINTER. */
export function previousSeason(season: AnilistSeason, year: number): { season: AnilistSeason; year: number } {
  const index = ANILIST_SEASONS.indexOf(season);
  return index <= 0
    ? { season: 'FALL', year: year - 1 }
    : { season: ANILIST_SEASONS[index - 1] as AnilistSeason, year };
}

export interface AnilistBrowseResult {
  works: ProviderWork[];
  /**
   * For `seasonal`: the season the rows actually describe, whether or not it is
   * the current one. The caller compares it against today to decide whether the
   * shelf may still be labelled "This season".
   */
  season?: { season: AnilistSeason; year: number };
}

/** AniList fallback for the four no-query discovery feeds. */
export async function anilistBrowse(
  feed: JikanFeedId,
  page = 1,
  limit = 25,
): Promise<AnilistBrowseResult> {
  const now = new Date();
  const month = now.getUTCMonth() + 1;
  const season = seasonForMonth(month);
  const safePage = Math.max(1, Math.trunc(page) || 1);
  const size = Math.max(1, Math.min(25, Math.trunc(limit) || 25));
  const baseVariables = { page: safePage, perPage: size };
  const run = (
    variableDefinitions: string,
    mediaArguments: string,
    variables: Record<string, unknown>,
    cacheSuffix: string,
  ) => anilistQuery<{ Page?: { media?: AnilistMedia[] } }>(
    `query ($page: Int, $perPage: Int${variableDefinitions}) {
      Page(page: $page, perPage: $perPage) {
        media(type: ANIME, isAdult: false${mediaArguments}) { ${ANILIST_FIELDS} }
      }
    }`,
    { ...baseVariables, ...variables },
    `anilist:feed:${feed}:${safePage}:${size}:${cacheSuffix}`,
    // A feed is a view over a moving list, not a fact about a work.
    { ttlMs: FEED_CACHE_TTL_MS, cacheEmpty: false },
  );

  let data: { Page?: { media?: AnilistMedia[] } } | null = null;
  let servedSeason: { season: AnilistSeason; year: number } | undefined;
  if (feed === 'seasonal') {
    // Walk backwards a season at a time rather than jumping a whole year. The
    // old fallback answered a request for SUMMER 2026 with SUMMER 2025 and said
    // nothing about it, which is how a shelf labelled "This season" ended up
    // full of titles a year old. The season before this one is at least still
    // recent, and whichever one answers is reported so the caller can relabel.
    let cursor = { season, year: now.getUTCFullYear() };
    for (let step = 0; step < 3; step += 1) {
      data = await run(
        ', $season: MediaSeason, $year: Int, $sort: [MediaSort]',
        ', season: $season, seasonYear: $year, sort: $sort',
        { season: cursor.season, year: cursor.year, sort: ['POPULARITY_DESC', 'SCORE_DESC'] },
        `${cursor.season}:${cursor.year}`,
      );
      if ((data?.Page?.media ?? []).length > 0) break;
      cursor = previousSeason(cursor.season, cursor.year);
    }
    servedSeason = cursor;
  } else if (feed === 'airing') {
    data = await run(
      ', $status: MediaStatus, $sort: [MediaSort]',
      ', status: $status, sort: $sort',
      { status: 'RELEASING', sort: ['POPULARITY_DESC', 'SCORE_DESC'] },
      'releasing',
    );
  } else if (feed === 'upcoming') {
    data = await run(
      ', $status: MediaStatus, $sort: [MediaSort]',
      ', status: $status, sort: $sort',
      { status: 'NOT_YET_RELEASED', sort: ['POPULARITY_DESC', 'START_DATE'] },
      'upcoming',
    );
  } else {
    data = await run(
      ', $sort: [MediaSort]',
      ', sort: $sort',
      { sort: ['SCORE_DESC', 'POPULARITY_DESC'] },
      'score',
    );
  }

  return {
    works: (data?.Page?.media ?? [])
      .filter((media) => num(media?.id) !== undefined)
      .map(anilistToWork),
    season: servedSeason,
  };
}

export async function anilistById(id: number): Promise<ProviderWork | null> {
  const data = await anilistQuery<{ Media?: AnilistMedia }>(
    `query ($id: Int) { Media(id: $id, type: ANIME) { ${ANILIST_FIELDS} } }`,
    { id },
    `anilist:media:${id}`,
  );
  return data?.Media ? anilistToWork(data.Media) : null;
}

/**
 * The AniList entry for a MyAnimeList id — the enrichment every Jikan match now
 * gets.
 *
 * Jikan answers with a poster and nothing wider, and AniList used to be asked
 * only when Jikan found nothing at all, so almost no title ever got a banner or
 * an AniList id (which is what Jimaku matches subtitles on). One request per
 * series, cached for a month like any other work. `null` covers both "not
 * listed" (AniList answers an unknown `idMal` with a 404) and "not answered":
 * either way the Jikan match stands on its own.
 */
export async function anilistByMalId(malId: number): Promise<ProviderWork | null> {
  if (!Number.isInteger(malId) || malId <= 0) return null;
  const data = await anilistQuery<{ Media?: AnilistMedia }>(
    `query ($idMal: Int) { Media(idMal: $idMal, type: ANIME) { ${ANILIST_FIELDS} } }`,
    { idMal: malId },
    `anilist:mal:${malId}`,
  );
  return data?.Media ? anilistToWork(data.Media) : null;
}

/**
 * Next-episode airing times for up to 50 anime at once, by MAL or AniList id —
 * the watch library's airing-schedule job (`watchAiring.ts`). One request per
 * batch through the shared AniList limiter; cached for 30 minutes, and an empty
 * page is not cached (it is what a failing upstream looks like). `null` means
 * AniList did not answer.
 */
export async function anilistAiringBatch(
  ids: readonly number[],
  by: 'mal' | 'anilist',
): Promise<import('../shared/watchAiring').AiringRow[] | null> {
  const clean = [...new Set(ids.filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50);
  if (!clean.length) return [];
  const argument = by === 'mal' ? 'idMal_in' : 'id_in';
  const data = await anilistQuery<{ Page?: { media?: Array<{
    id?: number; idMal?: number | null; status?: string | null;
    nextAiringEpisode?: { episode?: number | null; airingAt?: number | null } | null;
  }> } }>(
    `query ($ids: [Int]) {
      Page(page: 1, perPage: 50) {
        media(${argument}: $ids, type: ANIME) { id idMal status nextAiringEpisode { episode airingAt } }
      }
    }`,
    { ids: clean },
    `anilist:airing:${by}:${clean.join(',')}`,
    { ttlMs: 30 * 60_000, cacheEmpty: false },
  );
  if (!data) return null;
  return (data.Page?.media ?? [])
    .filter((media) => num(media?.id) !== undefined)
    .map((media) => ({
      anilistId: media.id as number,
      malId: num(media.idMal ?? undefined),
      status: text(media.status),
      nextEpisode: num(media.nextAiringEpisode?.episode ?? undefined),
      nextAiringAt: num(media.nextAiringEpisode?.airingAt ?? undefined) !== undefined
        ? (media.nextAiringEpisode?.airingAt as number) * 1000
        : undefined,
    }));
}

// ---------------------------------------------------------------------------
// Artwork download
// ---------------------------------------------------------------------------

/**
 * Hosts artwork may be downloaded from. TVmaze serves every image from
 * `static.tvmaze.com` and TMDB from `image.tmdb.org`; nothing wider is needed.
 */
const ART_HOSTS =
  /^https:\/\/([a-z0-9-]+\.)*(myanimelist\.net|anilist\.co|cdn\.myanimelist\.net)\/|^https:\/\/(static\.tvmaze\.com|image\.tmdb\.org)\//i;

/** Whether {@link downloadArtwork} would fetch this URL at all. */
export function artworkUrlAllowed(url: string): boolean {
  return typeof url === 'string' && ART_HOSTS.test(url);
}

/**
 * JPEG, PNG or WebP by magic number. A CDN answering 200 with an HTML error page
 * must not be written into the cache as `poster.jpg` — it would be served as a
 * broken image forever, because the download short-circuits on an existing file.
 */
export function looksLikeImage(bytes: Buffer): boolean {
  if (bytes.length < 12) return false;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return true;
  if (bytes[0] === 0x89 && bytes.toString('latin1', 1, 4) === 'PNG') return true;
  return bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
}

/**
 * Download provider artwork into the artwork cache and return the path relative
 * to userData — which is what `MediaItem` persists, because `playfile://` tokens
 * are per-session and would be dead on the next launch.
 *
 * The host allowlist means a hostile provider response cannot make the app fetch
 * from anywhere it likes.
 */
export async function downloadArtwork(url: string, name: string): Promise<string | null> {
  if (!artworkUrlAllowed(url)) return null;
  const extension = /\.(jpe?g|png|webp)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
  const relative = path.join('artwork', `${name}.${extension === 'jpeg' ? 'jpg' : extension}`);
  const absolute = path.join(app.getPath('userData'), relative);
  try {
    if (fs.existsSync(absolute) && fs.statSync(absolute).size > 0) return relative;
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    await artLimiter.take();
    const response = await new Promise<Buffer | null>((resolve) => {
      const chunks: Buffer[] = [];
      const req = net.request({ url, method: 'GET' });
      req.setHeader('User-Agent', USER_AGENT);
      const timer = setTimeout(() => {
        try {
          req.abort();
        } catch {
          /* already done */
        }
        resolve(null);
      }, REQUEST_TIMEOUT_MS);
      req.on('response', (res) => {
        if ((res.statusCode ?? 0) < 200 || (res.statusCode ?? 0) >= 300) {
          clearTimeout(timer);
          resolve(null);
          return;
        }
        res.on('data', (chunk: Buffer) => {
          if (chunks.reduce((n, c) => n + c.length, 0) < 12_000_000) chunks.push(chunk);
        });
        res.on('end', () => {
          clearTimeout(timer);
          resolve(chunks.length ? Buffer.concat(chunks) : null);
        });
        res.on('error', () => {
          clearTimeout(timer);
          resolve(null);
        });
      });
      req.on('error', () => {
        clearTimeout(timer);
        resolve(null);
      });
      req.end();
    });
    if (!response || !looksLikeImage(response)) return null;
    fs.writeFileSync(absolute, response);
    return relative;
  } catch {
    return null;
  }
}

/**
 * Filesystem-safe artwork base name.
 *
 * Keyed on the *matched work*, not just the series, because `downloadArtwork`
 * short-circuits when the file already exists. Naming it after the series key
 * alone meant a manual re-match to a different show updated the title, synopsis
 * and rating but silently kept the previous show's poster — the one thing the
 * user was most likely trying to correct.
 */
export function artworkName(prefix: string, seriesKey: string, workId?: string): string {
  const key = workId ? `${seriesKey}::${workId}` : seriesKey;
  return `${prefix}-${crypto.createHash('sha1').update(key).digest('hex').slice(0, 16)}`;
}
