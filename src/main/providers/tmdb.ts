/**
 * TMDB (The Movie Database) — films, and the better backdrop for series.
 *
 * The only provider here that needs a key, and the key is the user's own: they
 * register at themoviedb.org and paste it into Settings ▸ API keys, where it is
 * held by the credential vault (`credentialRegistry.ts` entry `tmdb`). Nothing
 * here ever asks for a password or creates an account. Both of TMDB's formats
 * are accepted in the one field — a v3 "API key" (32 hex characters, sent as
 * `api_key=`) and a v4 "API read access token" (a JWT, sent as a Bearer
 * header) — because the settings page shows both and users paste either.
 *
 * Without a key every function here answers `null` without touching the
 * network, and the sweep treats that as "not available" rather than "no such
 * film", so adding a key later re-opens every film it skipped.
 *
 * Images come from `image.tmdb.org`: posters at `w500` (2:3), backdrops at
 * `w1280` (16:9). The response shapes follow TMDB's v3 reference; the test
 * fixtures are built to that reference, since recording live answers needs a
 * key the repository must not hold.
 */

import type { ProviderWork } from '../mediaProviderClients';
import { readSecret } from '../credentials/vault';
import {
  METADATA_ACCEPT_CONFIDENCE,
  pickMetadataMatch,
  type MetadataMatch,
  type MetadataTarget,
} from '../../shared/mediaMetadataMatch';
import {
  RateLimiter,
  num,
  readCache,
  requestJsonStatus,
  text,
  writeCache,
  yearOf,
} from './providerHttp';

const TMDB = 'https://api.themoviedb.org/3';
const IMAGE = 'https://image.tmdb.org/t/p';

/** TMDB's documented soft ceiling is ~50/s; a sweep has no reason to go near it. */
const limiter = new RateLimiter(4, 150);

/** The vault id and field the key lives under. */
export const TMDB_CREDENTIAL_ID = 'tmdb';

export interface TmdbAuth {
  /** Appended to the query string (v3 key). */
  query?: string;
  /** Sent as headers (v4 read token). */
  headers?: Record<string, string>;
}

/**
 * How to authenticate with a pasted value.
 *
 * A v4 read access token is a JWT — three base64url segments, starting `eyJ` —
 * and goes in `Authorization: Bearer`. Anything else is treated as a v3 API
 * key. Pure, so the split is tested without a network.
 */
export function tmdbAuth(key: string | null | undefined): TmdbAuth | null {
  const value = (key ?? '').trim();
  if (!value) return null;
  if (/^eyJ[\w-]*\.[\w-]+\.[\w-]+$/.test(value)) {
    return { headers: { Authorization: `Bearer ${value}` } };
  }
  return { query: `api_key=${encodeURIComponent(value)}` };
}

function currentAuth(): TmdbAuth | null {
  try {
    return tmdbAuth(readSecret(TMDB_CREDENTIAL_ID, 'apiKey'));
  } catch {
    return null;
  }
}

/** Whether a key is configured, so the sweep knows TMDB is in play at all. */
export function tmdbAvailable(): boolean {
  return currentAuth() !== null;
}

/** A full image URL for a TMDB image path, or undefined for a missing one. */
export function tmdbImageUrl(filePath: unknown, size: 'w500' | 'w780' | 'w1280' | 'original'): string | undefined {
  const value = text(filePath);
  return value && value.startsWith('/') ? `${IMAGE}/${size}${value}` : undefined;
}

/** TMDB's fixed genre ids (movie and TV lists merged; the ids do not clash). */
const GENRES: Record<number, string> = {
  28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime',
  99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History',
  27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance',
  878: 'Science Fiction', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War',
  37: 'Western', 10759: 'Action & Adventure', 10762: 'Kids', 10763: 'News',
  10764: 'Reality', 10765: 'Sci-Fi & Fantasy', 10766: 'Soap', 10767: 'Talk',
  10768: 'War & Politics',
};
const ANIMATION_GENRE = 16;

export interface TmdbMovie {
  id: number;
  title?: string | null;
  original_title?: string | null;
  original_language?: string | null;
  overview?: string | null;
  release_date?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  /** Search results carry ids … */
  genre_ids?: number[] | null;
  /** … details carry names. */
  genres?: Array<{ id?: number; name?: string | null }> | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  /** Details only. */
  runtime?: number | null;
  imdb_id?: string | null;
  status?: string | null;
  production_countries?: Array<{ iso_3166_1?: string | null }> | null;
  origin_country?: string[] | null;
}

export interface TmdbTv {
  id: number;
  name?: string | null;
  original_name?: string | null;
  original_language?: string | null;
  overview?: string | null;
  first_air_date?: string | null;
  poster_path?: string | null;
  backdrop_path?: string | null;
  genre_ids?: number[] | null;
  popularity?: number | null;
  vote_average?: number | null;
  vote_count?: number | null;
  origin_country?: string[] | null;
}

/**
 * Originals whose original title is the native one worth showing: the East
 * Asian languages, and Russian — a Russian learner's film is «Брат», not its
 * English release title.
 */
const NATIVE_LANGUAGES = new Set(['ja', 'zh', 'ko', 'cn', 'ru']);

function genreNames(ids: readonly number[] | null | undefined, named?: TmdbMovie['genres']): string[] {
  const fromNames = (named ?? []).map((genre) => text(genre?.name)).filter((name): name is string => Boolean(name));
  if (fromNames.length > 0) return fromNames;
  return (ids ?? []).map((id) => GENRES[id]).filter((name): name is string => Boolean(name));
}

function isAnimation(ids: readonly number[] | null | undefined, named?: TmdbMovie['genres']): boolean {
  return (ids ?? []).includes(ANIMATION_GENRE)
    || (named ?? []).some((genre) => genre?.id === ANIMATION_GENRE);
}

const rating = (average: unknown, count: unknown): number | undefined =>
  (num(count) ?? 0) > 0 ? num(average) : undefined;

/** A TMDB movie (search row or details) in the shape every provider shares. */
export function tmdbMovieToWork(movie: TmdbMovie): ProviderWork {
  const title = text(movie.title) ?? text(movie.original_title) ?? '';
  const original = text(movie.original_title);
  const language = text(movie.original_language)?.toLowerCase();
  return {
    provider: 'tmdb',
    id: movie.id,
    tmdbId: movie.id,
    tmdbType: 'movie',
    titles: [...new Set([title, original].filter((value): value is string => Boolean(value)))],
    displayTitle: title,
    nativeTitle: original && original !== title && language && NATIVE_LANGUAGES.has(language) ? original : undefined,
    synopsis: text(movie.overview),
    year: yearOf(movie.release_date),
    format: 'Movie',
    status: text(movie.status),
    genres: genreNames(movie.genre_ids, movie.genres),
    rating: rating(movie.vote_average, movie.vote_count),
    popularity: num(movie.popularity ?? undefined),
    posterUrl: tmdbImageUrl(movie.poster_path, 'w500'),
    backdropUrl: tmdbImageUrl(movie.backdrop_path, 'w1280'),
    imdbId: text(movie.imdb_id),
    runtimeMin: num(movie.runtime ?? undefined) || undefined,
    language,
    country: text(movie.production_countries?.[0]?.iso_3166_1)?.toUpperCase()
      ?? text(movie.origin_country?.[0])?.toUpperCase(),
    animation: isAnimation(movie.genre_ids, movie.genres),
  };
}

/** A TMDB TV search row in the shared shape. Used for art and ids, not episodes. */
export function tmdbTvToWork(show: TmdbTv): ProviderWork {
  const title = text(show.name) ?? text(show.original_name) ?? '';
  const original = text(show.original_name);
  const language = text(show.original_language)?.toLowerCase();
  return {
    provider: 'tmdb',
    id: show.id,
    tmdbId: show.id,
    tmdbType: 'tv',
    titles: [...new Set([title, original].filter((value): value is string => Boolean(value)))],
    displayTitle: title,
    nativeTitle: original && original !== title && language && NATIVE_LANGUAGES.has(language) ? original : undefined,
    synopsis: text(show.overview),
    year: yearOf(show.first_air_date),
    format: 'TV',
    genres: genreNames(show.genre_ids),
    rating: rating(show.vote_average, show.vote_count),
    popularity: num(show.popularity ?? undefined),
    posterUrl: tmdbImageUrl(show.poster_path, 'w500'),
    backdropUrl: tmdbImageUrl(show.backdrop_path, 'w1280'),
    language,
    country: text(show.origin_country?.[0])?.toUpperCase(),
    animation: isAnimation(show.genre_ids),
  };
}

/**
 * GET a TMDB path. `status` 0 means unanswered; 401 means the key was refused.
 * Neither is a fact about the title, so both come back as `down`.
 */
async function get<T>(pathAndQuery: string, auth: TmdbAuth): Promise<{ data: T | null; down: boolean }> {
  const separator = pathAndQuery.includes('?') ? '&' : '?';
  const url = auth.query ? `${TMDB}${pathAndQuery}${separator}${auth.query}` : `${TMDB}${pathAndQuery}`;
  const answer = await requestJsonStatus<T>(url, limiter, { headers: auth.headers });
  if (answer.status === 0 || answer.status === 401) return { data: null, down: true };
  return { data: answer.data, down: false };
}

async function search<T extends { id: number }>(
  kind: 'movie' | 'tv',
  title: string,
  year: number | null | undefined,
): Promise<T[] | null> {
  const auth = currentAuth();
  const query = title.trim();
  if (!auth) return null;
  if (!query) return [];
  const yearParam = kind === 'movie' ? 'year' : 'first_air_date_year';
  const yearPart = typeof year === 'number' ? `&${yearParam}=${year}` : '';
  // The cache key names the query, never the credential.
  const key = `tmdb:search:${kind}:${query.toLowerCase()}:${year ?? ''}`;
  const cached = readCache<T[]>(key);
  if (cached) return cached;
  const { data, down } = await get<{ results?: T[] }>(
    `/search/${kind}?query=${encodeURIComponent(query)}${yearPart}&include_adult=false&language=en-US&page=1`,
    auth,
  );
  if (down) return null;
  const rows = (data?.results ?? []).filter((row) => num(row?.id) !== undefined).slice(0, 10);
  writeCache(key, rows);
  return rows;
}

/** Movie search rows as works; `null` without a key or an answer. */
export async function tmdbSearchMovie(title: string, year?: number | null): Promise<ProviderWork[] | null> {
  const rows = await search<TmdbMovie>('movie', title, year);
  return rows ? rows.map(tmdbMovieToWork) : null;
}

/** TV search rows as works; `null` without a key or an answer. */
export async function tmdbSearchTv(title: string, year?: number | null): Promise<ProviderWork[] | null> {
  const rows = await search<TmdbTv>('tv', title, year);
  return rows ? rows.map(tmdbTvToWork) : null;
}

/** Full movie details: genres by name, runtime and the IMDb id. */
export async function tmdbMovieById(id: number): Promise<ProviderWork | null> {
  const auth = currentAuth();
  if (!auth || !Number.isInteger(id) || id <= 0) return null;
  const key = `tmdb:movie:${id}`;
  const cached = readCache<TmdbMovie>(key);
  if (cached && num(cached.id) !== undefined) return tmdbMovieToWork(cached);
  const { data } = await get<TmdbMovie>(`/movie/${id}?language=en-US`, auth);
  if (!data || num(data.id) === undefined) return null;
  writeCache(key, data);
  return tmdbMovieToWork(data);
}

export interface TmdbFindResult {
  match: MetadataMatch<ProviderWork> | null;
  /** No key, a refused key, or no answer: say nothing about the title. */
  down: boolean;
}

/**
 * The best TMDB film for a target, with full details on a match.
 *
 * Searched with the year first (`search/movie?year=`), which is what separates
 * `Dune (1984)` from `Dune (2021)`; a year off by one between a file name and
 * TMDB's release date returns nothing, so an empty dated search is repeated
 * without the year.
 */
export async function findTmdbMovie(
  target: MetadataTarget,
  titles: ReadonlyArray<string | undefined> = [],
): Promise<TmdbFindResult> {
  let rows = await tmdbSearchMovie(target.title, target.year ?? null);
  if (rows === null) return { match: null, down: true };
  if (rows.length === 0 && typeof target.year === 'number') {
    rows = await tmdbSearchMovie(target.title, null);
    if (rows === null) return { match: null, down: true };
  }
  const match = bestOf(target, titles, rows);
  if (!match) return { match: null, down: false };
  const details = await tmdbMovieById(match.candidate.id);
  return { match: details ? { ...match, candidate: details } : match, down: false };
}

/** The best-scoring row against the target title and any other known names. */
function bestOf(
  target: MetadataTarget,
  titles: ReadonlyArray<string | undefined>,
  rows: readonly ProviderWork[],
): MetadataMatch<ProviderWork> | null {
  let best: MetadataMatch<ProviderWork> | null = null;
  const names = [...new Set([target.title, ...titles].map((title) => (title ?? '').trim()).filter(Boolean))];
  for (const title of names) {
    const match = pickMetadataMatch({ ...target, title }, rows);
    if (match && (!best || match.confidence > best.confidence)) best = match;
  }
  return best;
}

/**
 * The best TMDB series for a target, for its backdrop and id. `titles` are the
 * other names the primary provider knows the show by; the first two names are
 * searched, and every name is scored, so an English TMDB row can match a
 * series the file names in romaji.
 */
export async function findTmdbTv(
  target: MetadataTarget,
  titles: ReadonlyArray<string | undefined> = [],
): Promise<TmdbFindResult> {
  let best: MetadataMatch<ProviderWork> | null = null;
  let down = false;
  const queries = [...new Set([target.title, ...titles].map((title) => (title ?? '').trim()).filter(Boolean))].slice(0, 2);
  for (const query of queries) {
    const rows = await tmdbSearchTv(query, null);
    if (rows === null) {
      down = true;
      continue;
    }
    const match = bestOf(target, titles, rows);
    if (match && (!best || match.confidence > best.confidence)) best = match;
    if (best && best.confidence >= METADATA_ACCEPT_CONFIDENCE) break;
  }
  return { match: best, down: best ? false : down };
}
