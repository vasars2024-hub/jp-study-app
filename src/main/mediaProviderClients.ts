/**
 * Metadata provider clients: Jikan (the unofficial MyAnimeList API) and AniList.
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

/** What a provider hands back, normalized across the two. */
export interface ProviderWork {
  provider: MediaMetadataProviderId;
  id: number;
  /** Every name the provider knows, for the pure matcher to score. */
  titles: string[];
  displayTitle: string;
  nativeTitle?: string;
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
  posterUrl?: string;
  bannerUrl?: string;
  malId?: number;
  anilistId?: number;
}

// ---------------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------------

/**
 * Token-bucket-ish limiter honouring both a per-second and a per-minute budget.
 * Jikan enforces 3/s and 60/min; exceeding either returns 429, so both windows
 * have to be respected rather than just the tighter one.
 */
class RateLimiter {
  private recent: number[] = [];

  constructor(
    private readonly perSecond: number,
    private readonly perMinute: number,
  ) {}

  async take(): Promise<void> {
    for (;;) {
      const now = Date.now();
      this.recent = this.recent.filter((at) => now - at < 60_000);
      const inLastSecond = this.recent.filter((at) => now - at < 1_000).length;
      if (inLastSecond < this.perSecond && this.recent.length < this.perMinute) {
        this.recent.push(now);
        return;
      }
      // Wait for whichever window frees a slot first.
      const oldestInSecond = this.recent.filter((at) => now - at < 1_000)[0] ?? now;
      const waitSecond = inLastSecond >= this.perSecond ? 1_000 - (now - oldestInSecond) : 0;
      const waitMinute = this.recent.length >= this.perMinute
        ? 60_000 - (now - (this.recent[0] ?? now))
        : 0;
      await delay(Math.max(50, waitSecond, waitMinute));
    }
  }
}

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const jikanLimiter = new RateLimiter(3, 60);
// AniList publishes 90/min; kept well under, and it is only a fallback.
const anilistLimiter = new RateLimiter(2, 60);

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const USER_AGENT = 'jp-study-app (personal media library)';
const REQUEST_TIMEOUT_MS = 15_000;

/**
 * Fetch through Electron's `net` module rather than global `fetch`.
 *
 * `net` uses Chromium's stack, so it inherits the app's proxy configuration and
 * system certificate store — which a user behind a corporate proxy needs, and
 * Node's fetch does not do.
 */
function request(
  url: string,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };

    const req = net.request({ url, method: options.method ?? 'GET' });
    req.setHeader('User-Agent', USER_AGENT);
    req.setHeader('Accept', 'application/json');
    for (const [key, value] of Object.entries(options.headers ?? {})) req.setHeader(key, value);

    const timer = setTimeout(() => {
      finish(() => {
        try {
          req.abort();
        } catch {
          /* already finished */
        }
        reject(new Error('The metadata provider took too long to respond.'));
      });
    }, REQUEST_TIMEOUT_MS);

    req.on('response', (response) => {
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => {
        // Bounded so a hostile or broken response cannot exhaust memory.
        if (chunks.reduce((n, c) => n + c.length, 0) < 8_000_000) chunks.push(chunk);
      });
      response.on('end', () => {
        finish(() => resolve({
          status: response.statusCode ?? 0,
          body: Buffer.concat(chunks).toString('utf-8'),
        }));
      });
      response.on('error', (error: Error) => finish(() => reject(error)));
    });
    req.on('error', (error) => finish(() => reject(error)));

    if (options.body !== undefined) req.write(options.body, 'utf-8');
    req.end();
  });
}

/** GET/POST JSON with one retry on 429 or 5xx, honouring Retry-After crudely. */
async function requestJson<T>(
  url: string,
  limiter: RateLimiter,
  options: { method?: string; body?: string; headers?: Record<string, string> } = {},
): Promise<T | null> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await limiter.take();
    let response: { status: number; body: string };
    try {
      response = await request(url, options);
    } catch {
      if (attempt === 1) return null;
      await delay(1_000);
      continue;
    }
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 1) return null;
      await delay(2_000);
      continue;
    }
    if (response.status < 200 || response.status >= 300) return null;
    try {
      return JSON.parse(response.body) as T;
    } catch {
      return null;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Disk cache
// ---------------------------------------------------------------------------

/** Provider answers change rarely; a month keeps a sweep offline-fast. */
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

function cacheDir(): string {
  return path.join(app.getPath('userData'), 'metadata-cache');
}

function cacheFile(key: string): string {
  const hash = crypto.createHash('sha1').update(key).digest('hex');
  return path.join(cacheDir(), `${hash}.json`);
}

/**
 * Discovery feeds ("airing now", "top rated") are a view over a moving list
 * rather than a fact about one work, so they get their own short window. Long
 * enough that clicking between feed tabs is instant, short enough that a new
 * season shows up the same day.
 */
const FEED_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function readCache<T>(key: string, ttlMs: number = CACHE_TTL_MS): T | null {
  try {
    const file = cacheFile(key);
    const stat = fs.statSync(file);
    if (Date.now() - stat.mtimeMs > ttlMs) return null;
    return JSON.parse(fs.readFileSync(file, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function writeCache(key: string, value: unknown): void {
  try {
    fs.mkdirSync(cacheDir(), { recursive: true });
    fs.writeFileSync(cacheFile(key), JSON.stringify(value), 'utf-8');
  } catch {
    /* an uncacheable answer is still a usable answer */
  }
}

/** Clears cached provider answers, so a refresh really re-asks. */
export function clearMetadataCache(): void {
  try {
    fs.rmSync(cacheDir(), { recursive: true, force: true });
  } catch {
    /* nothing to clear */
  }
}

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
}

const text = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
};

const num = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

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
  };
}

export async function jikanSearch(title: string, limit = 8): Promise<ProviderWork[]> {
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
  if (!data) return [];
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
  genres
  averageScore
  popularity
  coverImage { extraLarge large }
  bannerImage
  studios(isMain: true) { nodes { name } }
  relations { edges { node { title { romaji english } } } }
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
  genres?: string[];
  averageScore?: number | null;
  popularity?: number | null;
  coverImage?: { extraLarge?: string | null; large?: string | null };
  bannerImage?: string | null;
  studios?: { nodes?: Array<{ name?: string | null }> };
  relations?: { edges?: Array<{ node?: { title?: { romaji?: string | null; english?: string | null } } }> };
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
    posterUrl: text(media.coverImage?.extraLarge) ?? text(media.coverImage?.large),
    bannerUrl: text(media.bannerImage),
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

export async function anilistSearch(title: string, limit = 8): Promise<ProviderWork[]> {
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
  return (data?.Page?.media ?? []).filter((media) => num(media?.id) !== undefined).map(anilistToWork);
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

// ---------------------------------------------------------------------------
// Artwork download
// ---------------------------------------------------------------------------

const ART_HOSTS = /^https:\/\/([a-z0-9-]+\.)*(myanimelist\.net|anilist\.co|cdn\.myanimelist\.net)\//i;

/**
 * Download provider artwork into the artwork cache and return the path relative
 * to userData — which is what `MediaItem` persists, because `playfile://` tokens
 * are per-session and would be dead on the next launch.
 *
 * The host allowlist means a hostile provider response cannot make the app fetch
 * from anywhere it likes.
 */
export async function downloadArtwork(url: string, name: string): Promise<string | null> {
  if (!ART_HOSTS.test(url)) return null;
  const extension = /\.(jpe?g|png|webp)(?:\?|$)/i.exec(url)?.[1]?.toLowerCase() ?? 'jpg';
  const relative = path.join('artwork', `${name}.${extension === 'jpeg' ? 'jpg' : extension}`);
  const absolute = path.join(app.getPath('userData'), relative);
  try {
    if (fs.existsSync(absolute) && fs.statSync(absolute).size > 0) return relative;
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    await anilistLimiter.take();
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
    if (!response || response.length === 0) return null;
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
