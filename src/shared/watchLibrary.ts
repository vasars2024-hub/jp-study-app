/**
 * The watch-tracking library — the pure half.
 *
 * One `WatchTitle` is one work the user tracks, whether or not a file for it
 * exists on disk: a MyAnimeList row, a Letterboxd film, a series the player saw
 * them finish. It is the MyAnimeList/Letterboxd model rather than the media
 * library's file model — the media library answers "what can I play", this one
 * answers "what have I watched, what am I watching, what do I want to watch".
 * The two meet through `linkMediaToTitles`, which is computed, never stored
 * (except for links the user pinned by hand), so neither store can drift out of
 * step with the other.
 *
 * Everything here is total and synchronous: no I/O, no clock (`now`/`today` are
 * parameters), no Electron. The store is `main/watchLibrary.ts`; the export
 * parsers are `shared/imports/*`.
 *
 * ## Merge rules — how a re-import behaves
 *
 * Every importer produces `WatchObservation`s: "source S says, as of time T,
 * these fields have these values". `mergeWatchObservations` applies them field
 * by field with three rules, in this order:
 *
 *  1. **Imports never erase.** A field the source says nothing about is left
 *     alone. MAL's `my_score` 0 means "not rated", not "clear my rating".
 *  2. **A manual edit survives anything older than itself.** `watch:update`
 *     stamps the field with the edit time and marks it manual. An observation
 *     only replaces it when its `asOf` is strictly later — a MAL export made
 *     after the edit is newer knowledge, the same export re-imported is not.
 *  3. **Otherwise newer data wins.** Each field remembers the `asOf` of its
 *     value (`fieldAt`); an observation older than that is ignored, so importing
 *     last year's export after this year's cannot roll progress back.
 *
 * Collections (`tags`, `lists`, `watchDates`, `altTitles`, `sources`) union
 * rather than replace, because they are routinely fed by more than one source.
 * Identity (external ids, original title, year) only ever fills gaps.
 *
 * Re-importing the same file is therefore a fixed point: every field is offered
 * the value it already holds, and `added` is 0.
 */

import { normalizeMediaTitleKey } from './mediaIdentity';
import type { MalLibraryEntry } from './malLibrary';
import type { MalListStatus } from './malSync';
import { WATCH_FINISHED_FRACTION } from './watchFinished';

export const WATCH_LIBRARY_SCHEMA_VERSION = 1;

/** Main-owned document, relative to Electron userData. */
export const WATCH_LIBRARY_STORE_FILE = 'watch-library.json';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

export const WATCH_KINDS = ['anime', 'tv', 'film', 'other'] as const;
export type WatchKind = (typeof WATCH_KINDS)[number];

export const WATCH_STATUSES = ['watching', 'completed', 'plan', 'on_hold', 'dropped', 'rewatching'] as const;
export type WatchStatus = (typeof WATCH_STATUSES)[number];

export const WATCH_SOURCES = ['mal-export', 'mal-sync', 'letterboxd', 'local', 'manual'] as const;
export type WatchSource = (typeof WATCH_SOURCES)[number];

export const WATCH_SORT_KEYS = [
  'title',
  'year',
  'score',
  'added',
  'lastWatched',
  'finished',
  'progress',
  'runtime',
  'updated',
] as const;
export type WatchSortKey = (typeof WATCH_SORT_KEYS)[number];

/**
 * Which scale the user rated on. `score` is always 0–10; `stars` keeps the
 * Letterboxd half-star value verbatim so 3.5★ never round-trips to "7/10" and
 * back as something else.
 */
export type WatchScoreScale = 'ten' | 'stars';

/** i18n keys for the vocabulary above, for the UI to resolve with `t()`. */
export const watchStatusLabelKey = (status: WatchStatus): string => `watchLibrary.status.${status}`;
export const watchKindLabelKey = (kind: WatchKind): string => `watchLibrary.kind.${kind}`;
export const watchSourceLabelKey = (source: WatchSource): string => `watchLibrary.source.${source}`;
export const watchSortLabelKey = (sort: WatchSortKey): string => `watchLibrary.sort.${sort}`;

export function isWatchKind(value: unknown): value is WatchKind {
  return typeof value === 'string' && (WATCH_KINDS as readonly string[]).includes(value);
}
export function isWatchStatus(value: unknown): value is WatchStatus {
  return typeof value === 'string' && (WATCH_STATUSES as readonly string[]).includes(value);
}
export function isWatchSource(value: unknown): value is WatchSource {
  return typeof value === 'string' && (WATCH_SOURCES as readonly string[]).includes(value);
}
export function isWatchSortKey(value: unknown): value is WatchSortKey {
  return typeof value === 'string' && (WATCH_SORT_KEYS as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

/** One viewing: a Letterboxd diary entry, or a film the player saw finish. */
export interface WatchDate {
  /** `YYYY-MM-DD`, or a partial `YYYY-MM` / `YYYY` when the source only knows that much. */
  date: string;
  rewatch?: boolean;
  /** The half-star rating given at that viewing (Letterboxd diary), 0.5–5. */
  stars?: number;
  source: WatchSource;
}

/** Fields governed by the merge rules in the header. `score` covers score+scale+stars together. */
export const WATCH_TRACKED_FIELDS = [
  'kind',
  'status',
  'score',
  'progress',
  'episodeCount',
  'rewatchCount',
  'startedAt',
  'finishedAt',
  'liked',
  'favorite',
  'notes',
  'review',
  'tags',
  'lists',
  'watchDates',
  'title',
  'year',
] as const;
export type WatchTrackedField = (typeof WATCH_TRACKED_FIELDS)[number];

export interface WatchTitle {
  /** Stable, derived once from the first identity seen (`mal:5081`, `lb:boxd.it/2a1m`, …). */
  id: string;
  kind: WatchKind;
  /** True for anime whatever its kind — an anime film is `kind: 'film'` with `anime: true`. */
  anime?: boolean;
  /** The source's own format label (MAL `series_type`: TV, Movie, OVA, ONA, Special, …). */
  format?: string;
  title: string;
  /** The native-script title (`千と千尋の神隠し`). */
  originalTitle?: string;
  /** The official English title (AniList `title.english`, Jikan `title_english`). */
  englishTitle?: string;
  /** The romanised title (AniList `title.romaji`, MAL's main title). */
  romajiTitle?: string;
  /**
   * Every other name the sources know it by — MAL English/native/synonyms, and
   * the English/romaji/native/synonyms a metadata lookup returned. The matcher
   * reads these, which is how "Sen to Chihiro no Kamikakushi" (MAL) and
   * "Spirited Away" (Letterboxd) find each other.
   */
  altTitles?: string[];
  year?: number;

  // External ids — each is a key the matcher and the metadata lookup can use.
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  /** TMDB numbers films and series separately; absent means "infer from kind". */
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number;
  /** `tt0123456`. */
  imdbId?: string;
  /** The film's Letterboxd URI as the export gives it (`https://boxd.it/2a1m`). */
  letterboxdUri?: string;

  status: WatchStatus;
  /** Normalised 0–10 (Letterboxd stars × 2). Absent = not rated. */
  score?: number;
  scoreScale?: WatchScoreScale;
  /** 0.5–5 when rated in stars. */
  stars?: number;
  /**
   * Ratings this title no longer shows. Two copies of one work merged with
   * different ratings keep the newer; the other lands here rather than vanishing.
   */
  scoreHistory?: WatchScoreHistoryEntry[];
  /** Episodes watched. A film reads 1 once completed. */
  progress?: number;
  episodeCount?: number;
  /** Times re-watched (MAL `my_times_watched`; Letterboxd rewatch diary entries). */
  rewatchCount?: number;
  /** `YYYY-MM-DD` or partial. */
  startedAt?: string;
  finishedAt?: string;
  watchDates: WatchDate[];
  /**
   * Episodes the local player saw finish, as `s<season>e<episode>` keys — how a
   * whole-show TV title counts progress across seasons.
   */
  watchedEpisodes?: string[];
  liked?: boolean;
  favorite?: boolean;
  tags: string[];
  /** Letterboxd lists or the user's own shelves. */
  lists: string[];
  notes?: string;
  /** The latest Letterboxd review text. */
  review?: string;

  // Filled by metadata lookups (see `WatchMetadataPatch`), never by imports.
  genres?: string[];
  runtimeMinutes?: number;
  /** userData-relative, like `MediaItem.posterPath`. */
  posterPath?: string;
  /** Remote poster URL (MAL sync carries one). */
  posterUrl?: string;
  /** userData-relative wide hero image (AniList banner, else the backdrop), like `MediaItem.bannerPath`. */
  bannerPath?: string;
  /** userData-relative 16:9 backdrop (TMDB / TVmaze), like `MediaItem.backdropPath`. */
  backdropPath?: string;

  /**
   * The next episode to air, from the airing-schedule job (`main/watchAiring.ts`,
   * AniList). Absent when nothing is scheduled or the title has not been checked.
   */
  nextAiring?: WatchNextAiring;

  /** Media item ids the user linked by hand; always linked, whatever the matcher says. */
  pinnedMediaItemIds?: string[];
  /** Epoch ms of the last local playback that counted. */
  lastWatchedAt?: number;
  sources: WatchSource[];
  /** Epoch ms: the earliest date a source says the user had it, else first import. */
  addedAt: number;
  /** Epoch ms of the last change to anything user-visible. */
  updatedAt: number;
  /** As-of time of each tracked field's current value. Bookkeeping for the merge rules. */
  fieldAt?: Partial<Record<WatchTrackedField, number>>;
  /** Tracked fields whose current value came from the user. */
  manual?: WatchTrackedField[];
}

/** A rating a merge displaced (see `WatchTitle.scoreHistory`). */
export interface WatchScoreHistoryEntry {
  score: number;
  scale?: WatchScoreScale;
  stars?: number;
  /** Where the displaced rating came from. */
  sources: WatchSource[];
  /** When it was given (its `fieldAt.score`), if known. */
  at?: number;
  /** When it was displaced. */
  replacedAt: number;
}

export interface WatchNextAiring {
  episode: number;
  /** Epoch ms. */
  at: number;
}

/** A removed title, so a re-import of older data does not resurrect it. */
export interface WatchTombstone {
  keys: string[];
  title: string;
  at: number;
}

export interface WatchImportRecord {
  at: number;
  source: WatchSource;
  fileName: string;
  exportedAt?: number;
  added: number;
  updated: number;
  unchanged: number;
}

export interface WatchLibraryDocument {
  version: number;
  titles: WatchTitle[];
  removed: WatchTombstone[];
  /** `mal-library.json`'s `lastSyncAt` when it was last folded in; null = never. */
  malLibraryLastSyncAt: number | null;
  /** Newest first, capped at `WATCH_IMPORT_HISTORY_LIMIT`. */
  imports: WatchImportRecord[];
}

export const WATCH_IMPORT_HISTORY_LIMIT = 50;

export function emptyWatchLibrary(): WatchLibraryDocument {
  return { version: WATCH_LIBRARY_SCHEMA_VERSION, titles: [], removed: [], malLibraryLastSyncAt: null, imports: [] };
}

// ---------------------------------------------------------------------------
// Observations — what an importer hands the merge
// ---------------------------------------------------------------------------

export interface WatchIdentity {
  kind: WatchKind;
  title: string;
  originalTitle?: string;
  altTitles?: string[];
  year?: number;
  anime?: boolean;
  format?: string;
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number;
  imdbId?: string;
  letterboxdUri?: string;
  posterUrl?: string;
}

export interface WatchObservedScore {
  /** 0–10. */
  score: number;
  scale: WatchScoreScale;
  stars?: number;
}

/** Values a source asserts. Absent = the source says nothing about that field. */
export interface WatchObservedFields {
  /** Only when the source is sure (MAL `series_type`), not a default guess. */
  kind?: WatchKind;
  status?: WatchStatus;
  score?: WatchObservedScore;
  progress?: number;
  episodeCount?: number;
  rewatchCount?: number;
  startedAt?: string;
  finishedAt?: string;
  liked?: boolean;
  favorite?: boolean;
  notes?: string;
  review?: string;
  tags?: string[];
  lists?: string[];
  watchDates?: WatchDate[];
  lastWatchedAt?: number;
}

export interface WatchObservation {
  source: WatchSource;
  /** When the source's data was true (export time, MAL `updated_at`). Drives "newer wins". */
  asOf?: number;
  /** Earliest date the source says the user had the title (epoch ms). */
  addedAt?: number;
  identity: WatchIdentity;
  fields: WatchObservedFields;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function positiveInt(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  const n = Math.trunc(value);
  return n > 0 ? n : undefined;
}

function nonNegativeInt(value: unknown): number | undefined {
  if (!isFiniteNumber(value)) return undefined;
  const n = Math.trunc(value);
  return n >= 0 ? n : undefined;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

/** Order-preserving, case-insensitive de-duplication of non-empty strings. */
export function uniqueStrings(values: readonly unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const s = nonEmptyString(value);
    if (!s) continue;
    const key = s.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Clamps to 0–10 and keeps one decimal (7.5 from 3.75★ is not a thing, but 7 from 3.5★ is). */
export function clampScore(value: number): number {
  return Math.round(Math.min(10, Math.max(0, value)) * 10) / 10;
}

/** Snaps to the half-star grid, 0.5–5. */
export function clampStars(value: number): number {
  return Math.min(5, Math.max(0.5, Math.round(value * 2) / 2));
}

/**
 * Normalises a date to `YYYY-MM-DD`, `YYYY-MM` or `YYYY`.
 *
 * MAL writes an unknown date as `0000-00-00` and an unknown day or month as
 * `00` (`2019-05-00`); those become the partial form rather than a fabricated
 * first-of-the-month. Also accepts a full ISO timestamp and keeps its date part.
 */
export function normalizeWatchDate(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const match = /^\s*(\d{4})(?:-(\d{1,2})(?:-(\d{1,2}))?)?/.exec(raw);
  if (!match) return undefined;
  const year = Number(match[1]);
  if (year < 1800 || year > 2999) return undefined;
  const month = match[2] === undefined ? 0 : Number(match[2]);
  const day = match[3] === undefined ? 0 : Number(match[3]);
  if (month < 0 || month > 12 || day < 0 || day > 31) return undefined;
  const yyyy = String(year);
  if (month === 0) return yyyy;
  const mm = String(month).padStart(2, '0');
  if (day === 0) return `${yyyy}-${mm}`;
  return `${yyyy}-${mm}-${String(day).padStart(2, '0')}`;
}

/** Epoch ms (UTC midnight) of a normalised date; partial dates read as their first day. */
export function watchDateToMs(date: string | undefined): number | undefined {
  if (!date) return undefined;
  const [y, m, d] = date.split('-').map(Number);
  if (!y) return undefined;
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** `YYYY-MM-DD` of an epoch-ms instant, in UTC. The store passes a local `today` instead where it matters. */
export function isoDateUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** `YYYY-MM-DD` of an epoch-ms instant on the machine's local calendar — what "today" means to the learner. */
export function isoDateLocal(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The key the matcher compares titles by — the same fold `MediaItem.seriesKey` uses. */
export function watchTitleKey(title: unknown): string {
  return normalizeMediaTitleKey(title);
}

/**
 * Canonical form of a Letterboxd URI: host + path, no scheme, no trailing slash.
 * The path keeps its case — `boxd.it` short codes are case-sensitive.
 */
export function normalizeLetterboxdUri(raw: unknown): string | undefined {
  const s = nonEmptyString(raw);
  if (!s) return undefined;
  const match = /^(?:https?:\/\/)?(?:www\.)?([^/\s]+)(\/[^\s?#]*)?/i.exec(s);
  if (!match) return undefined;
  const host = match[1].toLowerCase();
  if (host !== 'boxd.it' && host !== 'letterboxd.com') return undefined;
  const pathPart = (match[2] ?? '').replace(/\/+$/, '');
  if (!pathPart) return undefined;
  return `${host}${pathPart}`;
}

function normalizeImdbId(raw: unknown): string | undefined {
  const s = nonEmptyString(raw);
  if (!s) return undefined;
  const match = /tt\d{5,10}/i.exec(s);
  return match ? match[0].toLowerCase() : undefined;
}

function numericId(raw: unknown): number | undefined {
  if (typeof raw === 'string' && /^\d+$/.test(raw.trim())) return positiveInt(Number(raw.trim()));
  return positiveInt(raw);
}

function tmdbTypeFor(kind: WatchKind, explicit?: 'movie' | 'tv'): 'movie' | 'tv' {
  return explicit ?? (kind === 'film' ? 'movie' : 'tv');
}

/** A stable JSON serialisation (sorted keys) for change detection. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Everything user-visible about a title, for "did this change". Excludes bookkeeping. */
function visibleSignature(title: WatchTitle): string {
  const { updatedAt: _u, fieldAt: _f, manual: _m, ...rest } = title;
  void _u;
  void _f;
  void _m;
  return stableStringify(rest);
}

function compactTitle(title: WatchTitle): WatchTitle {
  const out = { ...title } as unknown as Record<string, unknown>;
  for (const key of Object.keys(out)) {
    const value = out[key];
    if (value === undefined) delete out[key];
    else if (Array.isArray(value) && value.length === 0 && !['watchDates', 'tags', 'lists', 'sources'].includes(key)) delete out[key];
  }
  if (out.fieldAt && Object.keys(out.fieldAt as object).length === 0) delete out.fieldAt;
  return out as unknown as WatchTitle;
}

function cloneTitle(title: WatchTitle): WatchTitle {
  return {
    ...title,
    altTitles: title.altTitles ? [...title.altTitles] : undefined,
    watchDates: title.watchDates.map((entry) => ({ ...entry })),
    watchedEpisodes: title.watchedEpisodes ? [...title.watchedEpisodes] : undefined,
    tags: [...title.tags],
    lists: [...title.lists],
    genres: title.genres ? [...title.genres] : undefined,
    pinnedMediaItemIds: title.pinnedMediaItemIds ? [...title.pinnedMediaItemIds] : undefined,
    scoreHistory: title.scoreHistory ? title.scoreHistory.map((entry) => ({ ...entry, sources: [...entry.sources] })) : undefined,
    nextAiring: title.nextAiring ? { ...title.nextAiring } : undefined,
    sources: [...title.sources],
    fieldAt: title.fieldAt ? { ...title.fieldAt } : undefined,
    manual: title.manual ? [...title.manual] : undefined,
  };
}

function addSource(title: WatchTitle, source: WatchSource): void {
  if (title.sources.includes(source)) return;
  title.sources = WATCH_SOURCES.filter((s) => s === source || title.sources.includes(s));
}

// ---------------------------------------------------------------------------
// Identity: keys, ids, matching
// ---------------------------------------------------------------------------

/** The subset of identity the matcher reads — satisfied by `WatchTitle` and `WatchIdentity`. */
export interface WatchIdentityLike {
  kind: WatchKind;
  title: string;
  originalTitle?: string;
  altTitles?: string[];
  year?: number;
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number;
  imdbId?: string;
  letterboxdUri?: string;
}

/** Strong keys: an external id each. Two identities sharing one are the same work. */
export function watchIdKeys(identity: WatchIdentityLike): string[] {
  const keys: string[] = [];
  if (identity.malId !== undefined) keys.push(`mal:${identity.malId}`);
  if (identity.anilistId !== undefined) keys.push(`anilist:${identity.anilistId}`);
  if (identity.tmdbId !== undefined) keys.push(`tmdb:${tmdbTypeFor(identity.kind, identity.tmdbType)}:${identity.tmdbId}`);
  if (identity.tvmazeId !== undefined) keys.push(`tvmaze:${identity.tvmazeId}`);
  if (identity.imdbId) keys.push(`imdb:${identity.imdbId}`);
  const lb = normalizeLetterboxdUri(identity.letterboxdUri);
  if (lb) keys.push(`lb:${lb}`);
  return keys;
}

/** Weak keys: every normalised name. Matching on these also checks kind and year. */
export function watchTitleKeys(identity: Pick<WatchIdentityLike, 'title' | 'originalTitle' | 'altTitles'>): string[] {
  const keys = new Set<string>();
  for (const name of [identity.title, identity.originalTitle, ...(identity.altTitles ?? [])]) {
    const key = watchTitleKey(name);
    if (key) keys.add(key);
  }
  return [...keys];
}

type KindFamily = 'film' | 'series' | 'any';

function kindFamily(kind: WatchKind): KindFamily {
  if (kind === 'film') return 'film';
  if (kind === 'anime' || kind === 'tv') return 'series';
  return 'any';
}

function familiesCompatible(a: KindFamily, b: KindFamily): boolean {
  return a === 'any' || b === 'any' || a === b;
}

export function watchKindsCompatible(a: WatchKind, b: WatchKind): boolean {
  return familiesCompatible(kindFamily(a), kindFamily(b));
}

function yearsCompatible(a: number | undefined, b: number | undefined): boolean {
  return a === undefined || b === undefined || a === b;
}

function letterboxdConflict(a: string | undefined, b: string | undefined): boolean {
  const x = normalizeLetterboxdUri(a);
  const y = normalizeLetterboxdUri(b);
  if (!x || !y || x === y) return false;
  // `boxd.it/2a1m` and `letterboxd.com/film/spirited-away` can be the same film;
  // only two URIs of the same form that differ are proof of two films.
  return x.split('/')[0] === y.split('/')[0];
}

/** True when the two carry different values for the same external id — provably different works. */
export function watchIdentitiesConflict(a: WatchIdentityLike, b: WatchIdentityLike): boolean {
  if (a.malId !== undefined && b.malId !== undefined && a.malId !== b.malId) return true;
  if (a.anilistId !== undefined && b.anilistId !== undefined && a.anilistId !== b.anilistId) return true;
  if (a.tmdbId !== undefined && b.tmdbId !== undefined
    && `${tmdbTypeFor(a.kind, a.tmdbType)}:${a.tmdbId}` !== `${tmdbTypeFor(b.kind, b.tmdbType)}:${b.tmdbId}`) return true;
  if (a.tvmazeId !== undefined && b.tvmazeId !== undefined && a.tvmazeId !== b.tvmazeId) return true;
  if (a.imdbId && b.imdbId && a.imdbId !== b.imdbId) return true;
  return letterboxdConflict(a.letterboxdUri, b.letterboxdUri);
}

export interface WatchIndex {
  byKey: Map<string, WatchTitle>;
  byTitle: Map<string, WatchTitle[]>;
}

export function buildWatchIndex(titles: readonly WatchTitle[]): WatchIndex {
  const index: WatchIndex = { byKey: new Map(), byTitle: new Map() };
  for (const title of titles) indexTitle(index, title);
  return index;
}

function indexTitle(index: WatchIndex, title: WatchTitle, previous?: WatchTitle): void {
  if (previous) unindexTitle(index, previous);
  for (const key of watchIdKeys(title)) if (!index.byKey.has(key)) index.byKey.set(key, title);
  for (const key of watchTitleKeys(title)) {
    const list = index.byTitle.get(key);
    if (list) {
      if (!list.includes(title)) list.push(title);
    } else index.byTitle.set(key, [title]);
  }
}

function unindexTitle(index: WatchIndex, title: WatchTitle): void {
  for (const key of watchIdKeys(title)) if (index.byKey.get(key) === title) index.byKey.delete(key);
  for (const key of watchTitleKeys(title)) {
    const list = index.byTitle.get(key);
    if (!list) continue;
    const next = list.filter((entry) => entry !== title);
    if (next.length) index.byTitle.set(key, next);
    else index.byTitle.delete(key);
  }
}

/**
 * The stored title an identity refers to, or undefined.
 *
 * External ids first — any shared id is decisive unless another id contradicts
 * it. Then names: a title whose normalised name matches, whose kind family is
 * compatible (a film never matches a series), whose year agrees when both know
 * one, and which carries no contradicting id. Two or more such candidates with
 * no year to split them is ambiguity, and ambiguity is answered with "no match"
 * rather than a guess — a duplicate row is recoverable, a merged-away one is not.
 */
export function findWatchTitle(index: WatchIndex, identity: WatchIdentityLike): WatchTitle | undefined {
  for (const key of watchIdKeys(identity)) {
    const hit = index.byKey.get(key);
    if (hit && !watchIdentitiesConflict(hit, identity)) return hit;
  }
  const candidates = new Set<WatchTitle>();
  for (const key of watchTitleKeys(identity)) {
    for (const title of index.byTitle.get(key) ?? []) {
      if (watchIdentitiesConflict(title, identity)) continue;
      if (!watchKindsCompatible(title.kind, identity.kind)) continue;
      if (!yearsCompatible(title.year, identity.year)) continue;
      candidates.add(title);
    }
  }
  if (candidates.size === 0) return undefined;
  if (candidates.size === 1) return [...candidates][0];
  if (identity.year !== undefined) {
    const sameYear = [...candidates].filter((title) => title.year === identity.year);
    if (sameYear.length === 1) return sameYear[0];
  }
  return undefined;
}

function hashString(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/** The id a new title gets: its strongest external key, else a hash of kind+name+year. */
export function watchTitleIdFor(identity: WatchIdentityLike): string {
  const [strongest] = watchIdKeys(identity);
  if (strongest) return strongest;
  const name = watchTitleKey(identity.title) || identity.title.trim().toLowerCase();
  return `t:${kindFamily(identity.kind)}:${hashString(`${name}|${identity.year ?? ''}`)}`;
}

function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}~${n}`)) n += 1;
  return `${base}~${n}`;
}

/** Keys a tombstone records: the ids, or — for a title with none — its name key. */
function tombstoneKeys(identity: WatchIdentityLike): string[] {
  const ids = watchIdKeys(identity);
  if (ids.length) return ids;
  const name = watchTitleKey(identity.title);
  return name ? [`t:${kindFamily(identity.kind)}:${name}:${identity.year ?? ''}`] : [];
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

function mergeWatchDates(stored: readonly WatchDate[], incoming: readonly WatchDate[]): WatchDate[] {
  const byKey = new Map<string, WatchDate>();
  for (const entry of stored) byKey.set(`${entry.date}|${entry.rewatch ? 1 : 0}`, { ...entry });
  for (const entry of incoming) {
    const date = normalizeWatchDate(entry.date);
    if (!date) continue;
    const key = `${date}|${entry.rewatch ? 1 : 0}`;
    const existing = byKey.get(key);
    if (existing) {
      if (existing.stars === undefined && entry.stars !== undefined) existing.stars = entry.stars;
      continue;
    }
    byKey.set(key, compactDate({ ...entry, date }));
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || Number(!!a.rewatch) - Number(!!b.rewatch));
}

function compactDate(entry: WatchDate): WatchDate {
  const out: WatchDate = { date: entry.date, source: entry.source };
  if (entry.rewatch) out.rewatch = true;
  if (entry.stars !== undefined) out.stars = entry.stars;
  return out;
}

interface FieldGate {
  /** Whether an observation stamped `at` may write `field`. */
  accept(field: WatchTrackedField): boolean;
  /** Records that `field` now holds a value as of `at`. */
  stamp(field: WatchTrackedField): void;
}

function fieldGate(title: WatchTitle, at: number | undefined, now: number): FieldGate {
  return {
    accept(field) {
      const storedAt = title.fieldAt?.[field];
      if (title.manual?.includes(field)) {
        return at !== undefined && storedAt !== undefined && at > storedAt;
      }
      return !(at !== undefined && storedAt !== undefined && at < storedAt);
    },
    stamp(field) {
      title.fieldAt = { ...(title.fieldAt ?? {}), [field]: at ?? now };
      if (title.manual?.includes(field)) {
        title.manual = title.manual.filter((entry) => entry !== field);
        if (title.manual.length === 0) delete title.manual;
      }
    },
  };
}

/** Applies an observation's identity gap-fills and asserted fields onto a (cloned) title. */
function applyObservation(title: WatchTitle, obs: WatchObservation, now: number): void {
  const id = obs.identity;
  // Identity: fill gaps only. An id that is already set is never replaced —
  // a different value would have been a conflict and never matched.
  if (title.malId === undefined && id.malId !== undefined) title.malId = id.malId;
  if (title.anilistId === undefined && id.anilistId !== undefined) title.anilistId = id.anilistId;
  if (title.tmdbId === undefined && id.tmdbId !== undefined) {
    title.tmdbId = id.tmdbId;
    if (id.tmdbType) title.tmdbType = id.tmdbType;
  }
  if (title.tvmazeId === undefined && id.tvmazeId !== undefined) title.tvmazeId = id.tvmazeId;
  if (!title.imdbId && id.imdbId) title.imdbId = id.imdbId;
  if (!title.letterboxdUri && id.letterboxdUri) title.letterboxdUri = id.letterboxdUri;
  if (!title.originalTitle && id.originalTitle) title.originalTitle = id.originalTitle;
  if (id.anime) title.anime = true;
  if (id.format) title.format = id.format;
  if (id.posterUrl) title.posterUrl = id.posterUrl;
  if (id.altTitles?.length || id.title !== title.title) {
    const own = watchTitleKey(title.title);
    const alt = uniqueStrings([...(title.altTitles ?? []), ...(id.altTitles ?? []), id.title])
      .filter((name) => watchTitleKey(name) !== own);
    title.altTitles = alt.length ? alt : undefined;
  }

  const gate = fieldGate(title, obs.asOf, now);
  if (id.year !== undefined && title.year === undefined && gate.accept('year')) {
    title.year = id.year;
    gate.stamp('year');
  }

  const f = obs.fields;
  const scalar = <K extends WatchTrackedField & keyof WatchTitle>(field: K, value: WatchTitle[K] | undefined): void => {
    if (value === undefined) return;
    if (!gate.accept(field)) return;
    title[field] = value;
    gate.stamp(field);
  };
  scalar('kind', f.kind);
  scalar('status', f.status);
  scalar('progress', f.progress);
  scalar('episodeCount', f.episodeCount);
  scalar('rewatchCount', f.rewatchCount);
  scalar('startedAt', f.startedAt);
  scalar('finishedAt', f.finishedAt);
  scalar('liked', f.liked);
  scalar('favorite', f.favorite);
  scalar('notes', f.notes);
  scalar('review', f.review);
  if (f.score && gate.accept('score')) {
    title.score = clampScore(f.score.score);
    title.scoreScale = f.score.scale;
    title.stars = f.score.stars;
    gate.stamp('score');
  }
  if (f.tags?.length && gate.accept('tags')) {
    title.tags = uniqueStrings([...title.tags, ...f.tags]);
    gate.stamp('tags');
  }
  if (f.lists?.length && gate.accept('lists')) {
    title.lists = uniqueStrings([...title.lists, ...f.lists]);
    gate.stamp('lists');
  }
  if (f.watchDates?.length && gate.accept('watchDates')) {
    title.watchDates = mergeWatchDates(title.watchDates, f.watchDates);
    gate.stamp('watchDates');
  }
  if (f.lastWatchedAt !== undefined && (title.lastWatchedAt ?? 0) < f.lastWatchedAt) {
    title.lastWatchedAt = f.lastWatchedAt;
  }
  if (obs.addedAt !== undefined && obs.addedAt < title.addedAt) title.addedAt = obs.addedAt;
  addSource(title, obs.source);
}

function newTitleFrom(obs: WatchObservation, id: string, now: number): WatchTitle {
  const identity = obs.identity;
  const title: WatchTitle = {
    id,
    kind: obs.fields.kind ?? identity.kind,
    title: identity.title,
    status: obs.fields.status ?? 'plan',
    watchDates: [],
    tags: [],
    lists: [],
    sources: [],
    addedAt: obs.addedAt ?? now,
    updatedAt: now,
  };
  if (identity.tmdbType && identity.tmdbId !== undefined) title.tmdbType = identity.tmdbType;
  applyObservation(title, obs, now);
  return compactTitle(title);
}

/** `removed`: skipped because the user removed that title; `invalid`: no name and no id. */
export type WatchMergeOutcome = 'added' | 'updated' | 'unchanged' | 'removed' | 'invalid';

export interface WatchMergeResult {
  document: WatchLibraryDocument;
  added: number;
  updated: number;
  unchanged: number;
  /** Observations skipped because the user removed that title after the data was true. */
  skippedRemoved: number;
  /** Per observation, in order: what happened and to which title id. */
  outcomes: { outcome: WatchMergeOutcome; titleId?: string }[];
}

/**
 * Applies observations to the document. See the header for the rules.
 *
 * Observations are applied in order against a live index, so two rows for the
 * same work inside one import merge into one title rather than racing.
 */
export function mergeWatchObservations(
  document: WatchLibraryDocument,
  observations: readonly WatchObservation[],
  now: number,
): WatchMergeResult {
  const titles = [...document.titles];
  const positions = new Map(titles.map((title, index) => [title.id, index]));
  const index = buildWatchIndex(titles);
  const ids = new Set(titles.map((title) => title.id));
  let removed = [...document.removed];
  const result: Omit<WatchMergeResult, 'document'> = {
    added: 0,
    updated: 0,
    unchanged: 0,
    skippedRemoved: 0,
    outcomes: [],
  };

  for (const obs of observations) {
    if (!obs.identity.title.trim() && watchIdKeys(obs.identity).length === 0) {
      result.outcomes.push({ outcome: 'invalid' });
      continue;
    }
    const stored = findWatchTitle(index, obs.identity);
    if (!stored) {
      const keys = tombstoneKeys(obs.identity);
      const tomb = removed.find((entry) => entry.keys.some((key) => keys.includes(key)));
      if (tomb) {
        if (obs.asOf === undefined || obs.asOf <= tomb.at) {
          result.skippedRemoved += 1;
          result.outcomes.push({ outcome: 'removed' });
          continue;
        }
        removed = removed.filter((entry) => entry !== tomb);
      }
      const id = uniqueId(watchTitleIdFor(obs.identity), ids);
      const created = newTitleFrom(obs, id, now);
      ids.add(id);
      positions.set(id, titles.length);
      titles.push(created);
      indexTitle(index, created);
      result.added += 1;
      result.outcomes.push({ outcome: 'added', titleId: id });
      continue;
    }

    const next = cloneTitle(stored);
    applyObservation(next, obs, now);
    const compacted = compactTitle(next);
    const changed = visibleSignature(stored) !== visibleSignature(compacted);
    if (changed) compacted.updatedAt = now;
    titles[positions.get(stored.id) as number] = compacted;
    indexTitle(index, compacted, stored);
    if (changed) result.updated += 1;
    else result.unchanged += 1;
    result.outcomes.push({ outcome: changed ? 'updated' : 'unchanged', titleId: stored.id });
  }

  return {
    ...result,
    document: { ...document, version: WATCH_LIBRARY_SCHEMA_VERSION, titles, removed },
  };
}

/** Removes a title and leaves a tombstone so older data cannot bring it back. */
export function removeWatchTitle(
  document: WatchLibraryDocument,
  id: string,
  now: number,
): { document: WatchLibraryDocument; removed: WatchTitle | undefined } {
  const target = document.titles.find((title) => title.id === id);
  if (!target) return { document, removed: undefined };
  const keys = [...new Set([...tombstoneKeys(target), ...watchIdKeys(target)])];
  return {
    removed: target,
    document: {
      ...document,
      titles: document.titles.filter((title) => title.id !== id),
      removed: keys.length ? [...document.removed, { keys, title: target.title, at: now }] : document.removed,
    },
  };
}

// ---------------------------------------------------------------------------
// Re-merge: two titles that turned out to be one work
// ---------------------------------------------------------------------------

/**
 * Whether two stored titles are the same work: they share an external id, or a
 * normalised name (any of title / original / English / romaji / alternates)
 * with the *same known year* and a compatible kind — and no id contradicts it.
 * The name rule needs both years: "Your Name." with no year is not enough to
 * swallow another title, because a wrong merge loses a row and a missed one
 * only shows it twice.
 */
export function watchTitlesAreSameWork(a: WatchTitle, b: WatchTitle): boolean {
  if (watchIdentitiesConflict(a, b)) return false;
  const aIds = new Set(watchIdKeys(a));
  if (watchIdKeys(b).some((key) => aIds.has(key))) return true;
  if (a.year === undefined || b.year === undefined || a.year !== b.year) return false;
  if (!watchKindsCompatible(a.kind, b.kind)) return false;
  const aNames = new Set(watchTitleKeys(allNames(a)));
  return watchTitleKeys(allNames(b)).some((key) => aNames.has(key));
}

function allNames(title: WatchTitle): Pick<WatchIdentityLike, 'title' | 'originalTitle' | 'altTitles'> {
  return {
    title: title.title,
    originalTitle: title.originalTitle,
    altTitles: [...(title.altTitles ?? []), ...(title.englishTitle ? [title.englishTitle] : []), ...(title.romajiTitle ? [title.romajiTitle] : [])],
  };
}

/** The title whose id survives a merge: an id derived from an external key, then the oldest. */
function mergePrimary(group: readonly WatchTitle[]): WatchTitle {
  return [...group].sort((a, b) =>
    Number(a.id.startsWith('t:')) - Number(b.id.startsWith('t:'))
    || a.addedAt - b.addedAt
    || a.id.localeCompare(b.id))[0];
}

/**
 * The member whose value of `field` should win: the most recent `fieldAt`,
 * then a user edit, then the primary. Only members that hold a value compete.
 *
 * Same rule as `fieldGate`, which lets newer data replace a manual edit: a 2024
 * manual "episode 3" must not beat MAL's 2026 "24/24" just because it was typed
 * by hand. The manual flag only breaks a tie.
 */
function fieldWinner(group: readonly WatchTitle[], primary: WatchTitle, field: WatchTrackedField, has: (title: WatchTitle) => boolean): WatchTitle | undefined {
  const holders = group.filter(has);
  if (!holders.length) return undefined;
  return [...holders].sort((a, b) =>
    (b.fieldAt?.[field] ?? 0) - (a.fieldAt?.[field] ?? 0)
    || Number(!!b.manual?.includes(field)) - Number(!!a.manual?.includes(field))
    || Number(b === primary) - Number(a === primary))[0];
}

const SCALAR_MERGE_FIELDS = [
  'kind', 'status', 'progress', 'episodeCount', 'rewatchCount', 'startedAt', 'finishedAt',
  'liked', 'favorite', 'title', 'year',
] as const satisfies readonly (WatchTrackedField & keyof WatchTitle)[];

/** Free text a merge joins instead of picking one: a user's writing is never dropped. */
const TEXT_MERGE_FIELDS = ['notes', 'review'] as const satisfies readonly (WatchTrackedField & keyof WatchTitle)[];

/**
 * The winner's text first, then every other member's distinct text, newest
 * first, separated by a blank line. Text already contained in what is kept is
 * not repeated, so re-merging is stable.
 */
function joinMergedText(group: readonly WatchTitle[], winner: WatchTitle, field: (typeof TEXT_MERGE_FIELDS)[number]): string | undefined {
  const ordered = [winner, ...group
    .filter((title) => title !== winner)
    .sort((a, b) => (b.fieldAt?.[field] ?? 0) - (a.fieldAt?.[field] ?? 0))];
  const parts: string[] = [];
  for (const title of ordered) {
    const text = title[field]?.trim();
    if (!text || parts.some((kept) => kept.includes(text))) continue;
    parts.push(text);
  }
  return parts.length ? parts.join('\n\n') : undefined;
}

/** Folds a group of titles for one work into the primary. Pure. */
export function mergeWatchTitleGroup(group: readonly WatchTitle[], now: number): WatchTitle {
  const primary = mergePrimary(group);
  const next = cloneTitle(primary);
  const others = group.filter((title) => title !== primary);
  const fieldAt: Partial<Record<WatchTrackedField, number>> = {};
  const manual = new Set<WatchTrackedField>();
  const take = (field: WatchTrackedField, winner: WatchTitle | undefined): void => {
    if (!winner) return;
    const at = winner.fieldAt?.[field];
    if (at !== undefined) fieldAt[field] = at;
    if (winner.manual?.includes(field)) manual.add(field);
  };

  // Identity: fill gaps from every member.
  for (const other of others) {
    if (next.malId === undefined && other.malId !== undefined) next.malId = other.malId;
    if (next.anilistId === undefined && other.anilistId !== undefined) next.anilistId = other.anilistId;
    if (next.tmdbId === undefined && other.tmdbId !== undefined) {
      next.tmdbId = other.tmdbId;
      next.tmdbType = other.tmdbType;
    }
    if (next.tvmazeId === undefined && other.tvmazeId !== undefined) next.tvmazeId = other.tvmazeId;
    if (!next.imdbId && other.imdbId) next.imdbId = other.imdbId;
    if (!next.letterboxdUri && other.letterboxdUri) next.letterboxdUri = other.letterboxdUri;
    if (!next.originalTitle && other.originalTitle) next.originalTitle = other.originalTitle;
    if (!next.englishTitle && other.englishTitle) next.englishTitle = other.englishTitle;
    if (!next.romajiTitle && other.romajiTitle) next.romajiTitle = other.romajiTitle;
    if (other.anime) next.anime = true;
    if (!next.format && other.format) next.format = other.format;
    for (const key of ['posterPath', 'posterUrl', 'bannerPath', 'backdropPath', 'runtimeMinutes', 'nextAiring'] as const) {
      if (next[key] === undefined && other[key] !== undefined) (next as unknown as Record<string, unknown>)[key] = other[key];
    }
  }

  // Scalars: the most recent user edit, else the most recent data.
  for (const field of SCALAR_MERGE_FIELDS) {
    const winner = fieldWinner(group, primary, field, (title) => title[field] !== undefined);
    if (!winner) continue;
    (next as unknown as Record<string, unknown>)[field] = winner[field];
    take(field, winner);
  }

  // Notes and reviews: the winner's text leads, and a differing text from the
  // other copy is joined in rather than dropped with the removed title.
  for (const field of TEXT_MERGE_FIELDS) {
    const winner = fieldWinner(group, primary, field, (title) => !!title[field]?.trim());
    if (!winner) continue;
    next[field] = joinMergedText(group, winner, field);
    take(field, winner);
  }

  // Score: never lost. The winner shows; every other distinct rating is kept.
  const rated = group.filter((title) => title.score !== undefined);
  const scoreWinner = fieldWinner(group, primary, 'score', (title) => title.score !== undefined);
  const history = group.flatMap((title) => title.scoreHistory ?? []);
  if (scoreWinner) {
    next.score = scoreWinner.score;
    next.scoreScale = scoreWinner.scoreScale;
    next.stars = scoreWinner.stars;
    take('score', scoreWinner);
    for (const loser of rated) {
      if (loser === scoreWinner || loser.score === scoreWinner.score) continue;
      history.push({
        score: loser.score as number,
        scale: loser.scoreScale,
        stars: loser.stars,
        sources: [...loser.sources],
        at: loser.fieldAt?.score,
        replacedAt: now,
      });
    }
  }
  const seenHistory = new Set<string>();
  next.scoreHistory = history.filter((entry) => {
    const key = `${entry.score}|${entry.stars ?? ''}|${entry.at ?? ''}`;
    if (seenHistory.has(key)) return false;
    seenHistory.add(key);
    return true;
  }).slice(-20);

  // Collections: union.
  const own = watchTitleKey(next.title);
  next.altTitles = uniqueStrings([
    ...group.flatMap((title) => [title.title, ...(title.altTitles ?? [])]),
  ]).filter((name) => watchTitleKey(name) !== own);
  next.tags = uniqueStrings(group.flatMap((title) => title.tags));
  next.lists = uniqueStrings(group.flatMap((title) => title.lists));
  next.genres = uniqueStrings(group.flatMap((title) => title.genres ?? []));
  next.watchDates = group.reduce<WatchDate[]>((acc, title) => mergeWatchDates(acc, title.watchDates), []);
  const episodes = new Set(group.flatMap((title) => title.watchedEpisodes ?? []));
  next.watchedEpisodes = episodes.size ? [...episodes].sort((a, b) => a.localeCompare(b, 'en', { numeric: true })) : undefined;
  next.pinnedMediaItemIds = uniqueStrings(group.flatMap((title) => title.pinnedMediaItemIds ?? []));
  next.sources = WATCH_SOURCES.filter((source) => group.some((title) => title.sources.includes(source)));
  for (const field of ['tags', 'lists', 'watchDates'] as const) {
    const at = Math.max(0, ...group.map((title) => title.fieldAt?.[field] ?? 0));
    if (at) fieldAt[field] = at;
    if (group.some((title) => title.manual?.includes(field))) manual.add(field);
  }
  next.addedAt = Math.min(...group.map((title) => title.addedAt || Infinity).filter(Number.isFinite), now);
  const lastWatched = Math.max(0, ...group.map((title) => title.lastWatchedAt ?? 0));
  next.lastWatchedAt = lastWatched || undefined;
  next.fieldAt = fieldAt;
  next.manual = manual.size ? WATCH_TRACKED_FIELDS.filter((field) => manual.has(field)) : undefined;
  next.updatedAt = now;
  return compactTitle(next);
}

export interface WatchDuplicateMergeResult {
  document: WatchLibraryDocument;
  /** Surviving id → ids folded into it. */
  merged: { into: string; from: string[] }[];
}

/**
 * Folds every set of titles that are one work (see {@link watchTitlesAreSameWork})
 * into one. Runs after metadata lookups, which is when a MAL row learns its
 * English name and a Letterboxd film its AniList id. Idempotent: a document
 * with nothing to merge comes back unchanged (same object).
 */
export function mergeDuplicateWatchTitles(document: WatchLibraryDocument, now: number): WatchDuplicateMergeResult {
  const titles = document.titles;
  const parent = titles.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const members = new Map<number, number[]>(titles.map((_, index) => [index, [index]]));
  const tryUnion = (i: number, j: number): void => {
    const a = find(i);
    const b = find(j);
    if (a === b) return;
    const groupA = members.get(a) ?? [];
    const groupB = members.get(b) ?? [];
    // Every pair across the two groups must be free of contradicting ids.
    if (groupA.some((x) => groupB.some((y) => watchIdentitiesConflict(titles[x], titles[y])))) return;
    parent[b] = a;
    members.set(a, [...groupA, ...groupB]);
    members.delete(b);
  };

  // Candidate pairs through the same buckets the index uses, not n².
  const buckets = new Map<string, number[]>();
  titles.forEach((title, index) => {
    const keys = [
      ...watchIdKeys(title),
      ...(title.year !== undefined ? watchTitleKeys(allNames(title)).map((key) => `name:${key}|${title.year}`) : []),
    ];
    for (const key of keys) {
      const list = buckets.get(key);
      if (list) list.push(index);
      else buckets.set(key, [index]);
    }
  });
  for (const list of buckets.values()) {
    if (list.length < 2) continue;
    for (let i = 1; i < list.length; i += 1) {
      for (let j = 0; j < i; j += 1) {
        if (watchTitlesAreSameWork(titles[list[j]], titles[list[i]])) tryUnion(list[j], list[i]);
      }
    }
  }

  const groups = [...members.values()].filter((group) => group.length > 1);
  if (!groups.length) return { document, merged: [] };
  const replaced = new Map<number, WatchTitle | null>();
  const merged: WatchDuplicateMergeResult['merged'] = [];
  for (const group of groups) {
    const combined = mergeWatchTitleGroup(group.map((index) => titles[index]), now);
    const keep = group.find((index) => titles[index].id === combined.id) ?? group[0];
    for (const index of group) replaced.set(index, index === keep ? combined : null);
    merged.push({ into: combined.id, from: group.map((index) => titles[index].id).filter((id) => id !== combined.id) });
  }
  const next = titles
    .map((title, index) => (replaced.has(index) ? replaced.get(index) : title))
    .filter((title): title is WatchTitle => !!title);
  return { document: { ...document, titles: next }, merged };
}

export function recordWatchImport(document: WatchLibraryDocument, record: WatchImportRecord): WatchLibraryDocument {
  return { ...document, imports: [record, ...document.imports].slice(0, WATCH_IMPORT_HISTORY_LIMIT) };
}

// ---------------------------------------------------------------------------
// Manual edits
// ---------------------------------------------------------------------------

/**
 * A user edit. `null` clears a field (and the clearing is itself a manual edit
 * that older imports will not undo); absent leaves it alone.
 */
export interface WatchTitlePatch {
  status?: WatchStatus;
  /** 0–10. Sets `scoreScale: 'ten'` and clears `stars`. */
  score?: number | null;
  /** 0.5–5. Sets `score = stars × 2` and `scoreScale: 'stars'`. Wins over `score` when both are given. */
  stars?: number | null;
  progress?: number | null;
  episodeCount?: number | null;
  rewatchCount?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  favorite?: boolean;
  liked?: boolean;
  notes?: string | null;
  tags?: string[];
  lists?: string[];
  kind?: WatchKind;
  title?: string;
  year?: number | null;
  /** Replaces the viewing log. */
  watchDates?: WatchDate[];
  /** Appends one viewing (source `manual`). */
  addWatchDate?: { date: string; rewatch?: boolean; stars?: number };
  /** Media item ids to always link to this title. Replaces the pinned set. */
  pinnedMediaItemIds?: string[];
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function nullableNumber(value: unknown): number | null | undefined {
  if (value === null) return null;
  return isFiniteNumber(value) ? value : undefined;
}

function nullableDate(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  return normalizeWatchDate(value);
}

function sanitizeWatchDates(value: unknown, fallbackSource: WatchSource): WatchDate[] {
  if (!Array.isArray(value)) return [];
  const out: WatchDate[] = [];
  for (const row of value) {
    const record = asRecord(row);
    const date = normalizeWatchDate(record.date);
    if (!date) continue;
    out.push(compactDate({
      date,
      rewatch: record.rewatch === true,
      stars: isFiniteNumber(record.stars) ? clampStars(record.stars) : undefined,
      source: isWatchSource(record.source) ? record.source : fallbackSource,
    }));
  }
  return out;
}

function stringList(value: unknown): string[] | undefined {
  return Array.isArray(value) ? uniqueStrings(value) : undefined;
}

/**
 * Re-validates a patch that crossed the IPC bridge. Unknown keys and
 * ill-typed values are dropped, never coerced into something the user did not
 * ask for.
 */
export function sanitizeWatchTitlePatch(value: unknown): WatchTitlePatch {
  const r = asRecord(value);
  const patch: WatchTitlePatch = {};
  if (isWatchStatus(r.status)) patch.status = r.status;
  if (nullableNumber(r.score) !== undefined) patch.score = nullableNumber(r.score);
  if (nullableNumber(r.stars) !== undefined) patch.stars = nullableNumber(r.stars);
  if (nullableNumber(r.progress) !== undefined) patch.progress = nullableNumber(r.progress);
  if (nullableNumber(r.episodeCount) !== undefined) patch.episodeCount = nullableNumber(r.episodeCount);
  if (nullableNumber(r.rewatchCount) !== undefined) patch.rewatchCount = nullableNumber(r.rewatchCount);
  if (nullableNumber(r.year) !== undefined) patch.year = nullableNumber(r.year);
  if ('startedAt' in r && nullableDate(r.startedAt) !== undefined) patch.startedAt = nullableDate(r.startedAt);
  if ('finishedAt' in r && nullableDate(r.finishedAt) !== undefined) patch.finishedAt = nullableDate(r.finishedAt);
  if (typeof r.favorite === 'boolean') patch.favorite = r.favorite;
  if (typeof r.liked === 'boolean') patch.liked = r.liked;
  if (r.notes === null) patch.notes = null;
  else if (typeof r.notes === 'string') patch.notes = r.notes;
  const tags = stringList(r.tags);
  if (tags) patch.tags = tags;
  const lists = stringList(r.lists);
  if (lists) patch.lists = lists;
  if (isWatchKind(r.kind)) patch.kind = r.kind;
  if (nonEmptyString(r.title)) patch.title = nonEmptyString(r.title);
  if (Array.isArray(r.watchDates)) patch.watchDates = sanitizeWatchDates(r.watchDates, 'manual');
  const add = asRecord(r.addWatchDate);
  const addDate = normalizeWatchDate(add.date);
  if (addDate) {
    patch.addWatchDate = {
      date: addDate,
      rewatch: add.rewatch === true || undefined,
      stars: isFiniteNumber(add.stars) ? clampStars(add.stars) : undefined,
    };
  }
  const pinned = stringList(r.pinnedMediaItemIds);
  if (pinned) patch.pinnedMediaItemIds = pinned;
  return patch;
}

export interface WatchEditContext {
  now: number;
  /** Local `YYYY-MM-DD`, for the MAL-style conveniences below. */
  today: string;
}

/**
 * Applies a user edit. Every touched tracked field is stamped `now` and marked
 * manual, which is what keeps it through a re-import of older data.
 *
 * Two MAL-style conveniences, both skipped when the patch sets the field itself:
 * marking a title completed fills progress to the episode count and
 * `finishedAt` to today; moving it to watching fills `startedAt`. And setting
 * progress to the episode count of a title being watched completes it.
 */
export function applyWatchTitlePatch(title: WatchTitle, patch: WatchTitlePatch, context: WatchEditContext): WatchTitle {
  const next = cloneTitle(title);
  const touched = new Set<WatchTrackedField>();
  const set = <K extends WatchTrackedField & keyof WatchTitle>(field: K, value: WatchTitle[K] | undefined): void => {
    if (value === undefined) delete (next as unknown as Record<string, unknown>)[field];
    else next[field] = value;
    touched.add(field);
  };
  const clearable = <T>(value: T | null | undefined, map: (v: T) => WatchTitle[WatchTrackedField & keyof WatchTitle] | undefined, field: WatchTrackedField & keyof WatchTitle): void => {
    if (value === undefined) return;
    set(field, value === null ? undefined : map(value));
  };

  if (patch.kind) set('kind', patch.kind);
  if (patch.title) set('title', patch.title);
  clearable(patch.year, (v) => positiveInt(v), 'year');
  clearable(patch.episodeCount, (v) => positiveInt(v), 'episodeCount');
  clearable(patch.rewatchCount, (v) => nonNegativeInt(v), 'rewatchCount');
  clearable(patch.progress, (v) => nonNegativeInt(v), 'progress');
  clearable(patch.startedAt, (v) => normalizeWatchDate(v), 'startedAt');
  clearable(patch.finishedAt, (v) => normalizeWatchDate(v), 'finishedAt');
  clearable(patch.notes, (v) => (v.trim() ? v : undefined), 'notes');
  if (patch.favorite !== undefined) set('favorite', patch.favorite || undefined);
  if (patch.liked !== undefined) set('liked', patch.liked || undefined);
  if (patch.tags) {
    next.tags = uniqueStrings(patch.tags);
    touched.add('tags');
  }
  if (patch.lists) {
    next.lists = uniqueStrings(patch.lists);
    touched.add('lists');
  }

  if (patch.stars !== undefined) {
    if (patch.stars === null) {
      delete next.score;
      delete next.scoreScale;
      delete next.stars;
    } else {
      const stars = clampStars(patch.stars);
      next.stars = stars;
      next.score = clampScore(stars * 2);
      next.scoreScale = 'stars';
    }
    touched.add('score');
  } else if (patch.score !== undefined) {
    if (patch.score === null) {
      delete next.score;
      delete next.scoreScale;
      delete next.stars;
    } else {
      next.score = clampScore(patch.score);
      next.scoreScale = 'ten';
      delete next.stars;
    }
    touched.add('score');
  }

  if (patch.watchDates) {
    next.watchDates = mergeWatchDates([], patch.watchDates);
    touched.add('watchDates');
  }
  if (patch.addWatchDate) {
    next.watchDates = mergeWatchDates(next.watchDates, [{ ...patch.addWatchDate, source: 'manual' }]);
    touched.add('watchDates');
  }

  if (patch.status) {
    const from = next.status;
    set('status', patch.status);
    if (patch.status === 'completed' && from !== 'completed') {
      if (patch.progress === undefined && next.episodeCount !== undefined && (next.progress ?? 0) < next.episodeCount) {
        set('progress', next.episodeCount);
      }
      if (patch.progress === undefined && next.kind === 'film' && next.progress === undefined) set('progress', 1);
      if (patch.finishedAt === undefined && !next.finishedAt) set('finishedAt', context.today);
    }
    if ((patch.status === 'watching' || patch.status === 'rewatching') && patch.startedAt === undefined && !next.startedAt) {
      set('startedAt', context.today);
    }
  } else if (
    patch.progress !== undefined && patch.progress !== null
    && next.episodeCount !== undefined && (next.progress ?? 0) >= next.episodeCount
    && (next.status === 'watching' || next.status === 'plan' || next.status === 'on_hold')
  ) {
    set('status', 'completed');
    if (patch.finishedAt === undefined && !next.finishedAt) set('finishedAt', context.today);
  } else if (patch.progress !== undefined && patch.progress !== null && patch.progress > 0 && next.status === 'plan') {
    set('status', 'watching');
    if (patch.startedAt === undefined && !next.startedAt) set('startedAt', context.today);
  }

  if (patch.pinnedMediaItemIds) {
    next.pinnedMediaItemIds = patch.pinnedMediaItemIds.length ? [...patch.pinnedMediaItemIds] : undefined;
  }

  if (touched.size) {
    next.fieldAt = { ...(next.fieldAt ?? {}) };
    for (const field of touched) next.fieldAt[field] = context.now;
    next.manual = WATCH_TRACKED_FIELDS.filter((field) => touched.has(field) || next.manual?.includes(field));
    addSource(next, 'manual');
  }
  const compacted = compactTitle(next);
  if (visibleSignature(compacted) !== visibleSignature(title) || touched.size) compacted.updatedAt = context.now;
  return compacted;
}

/** What `watch:add` accepts. `kind` and `title` are required unless built from a media item. */
export interface WatchAddInput {
  kind?: WatchKind;
  title?: string;
  status?: WatchStatus;
  year?: number;
  originalTitle?: string;
  episodeCount?: number;
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number;
  imdbId?: string;
  letterboxdUri?: string;
  /** Build the identity from this local media item (its series, ids and year). */
  fromMediaItemId?: string;
}

/** Validates the identity half of a `watch:add` request. */
export function sanitizeWatchAddInput(value: unknown): WatchAddInput {
  const r = asRecord(value);
  const out: WatchAddInput = {};
  if (isWatchKind(r.kind)) out.kind = r.kind;
  if (nonEmptyString(r.title)) out.title = nonEmptyString(r.title);
  if (isWatchStatus(r.status)) out.status = r.status;
  if (positiveInt(r.year)) out.year = positiveInt(r.year);
  if (nonEmptyString(r.originalTitle)) out.originalTitle = nonEmptyString(r.originalTitle);
  if (positiveInt(r.episodeCount)) out.episodeCount = positiveInt(r.episodeCount);
  if (numericId(r.malId)) out.malId = numericId(r.malId);
  if (numericId(r.anilistId)) out.anilistId = numericId(r.anilistId);
  if (numericId(r.tmdbId)) out.tmdbId = numericId(r.tmdbId);
  if (r.tmdbType === 'movie' || r.tmdbType === 'tv') out.tmdbType = r.tmdbType;
  if (numericId(r.tvmazeId)) out.tvmazeId = numericId(r.tvmazeId);
  if (normalizeImdbId(r.imdbId)) out.imdbId = normalizeImdbId(r.imdbId);
  if (normalizeLetterboxdUri(r.letterboxdUri)) out.letterboxdUri = nonEmptyString(r.letterboxdUri);
  if (nonEmptyString(r.fromMediaItemId)) out.fromMediaItemId = nonEmptyString(r.fromMediaItemId);
  return out;
}

/** A manual add as an observation, so it goes through the same matcher (no duplicates). */
export function watchObservationFromAdd(input: WatchAddInput & { kind: WatchKind; title: string }, now: number): WatchObservation {
  return {
    source: 'manual',
    asOf: now,
    addedAt: now,
    identity: {
      kind: input.kind,
      title: input.title,
      originalTitle: input.originalTitle,
      year: input.year,
      malId: input.malId,
      anilistId: input.anilistId,
      tmdbId: input.tmdbId,
      tmdbType: input.tmdbType,
      tvmazeId: input.tvmazeId,
      imdbId: input.imdbId,
      letterboxdUri: input.letterboxdUri,
      anime: input.kind === 'anime' || input.malId !== undefined || input.anilistId !== undefined || undefined,
    },
    fields: {
      status: input.status ?? 'plan',
      episodeCount: input.episodeCount,
    },
  };
}

// ---------------------------------------------------------------------------
// Metadata lookups (for the metadata engineer's TMDB/TVmaze pass)
// ---------------------------------------------------------------------------

/**
 * What a metadata lookup may write. Ids fill gaps only (a conflicting id is
 * refused, never overwritten); descriptive fields replace. None of these are
 * user data, so none of them are manual-tracked — except `kind`, which a user
 * edit outranks.
 */
export interface WatchMetadataPatch {
  kind?: WatchKind;
  /** The provider says this is anime (an AniList/MAL match for a Letterboxd film). */
  anime?: boolean;
  year?: number;
  originalTitle?: string;
  englishTitle?: string;
  romajiTitle?: string;
  altTitles?: string[];
  episodeCount?: number;
  genres?: string[];
  runtimeMinutes?: number;
  posterPath?: string;
  posterUrl?: string;
  bannerPath?: string;
  backdropPath?: string;
  malId?: number;
  anilistId?: number;
  tmdbId?: number;
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number;
  imdbId?: string;
}

export function applyWatchMetadata(title: WatchTitle, meta: WatchMetadataPatch, now: number): WatchTitle {
  const next = cloneTitle(title);
  const fill = <K extends 'malId' | 'anilistId' | 'tvmazeId'>(key: K, value: number | undefined): void => {
    const id = positiveInt(value);
    if (id !== undefined && next[key] === undefined) next[key] = id;
  };
  fill('malId', meta.malId);
  fill('anilistId', meta.anilistId);
  fill('tvmazeId', meta.tvmazeId);
  if (positiveInt(meta.tmdbId) !== undefined && next.tmdbId === undefined) {
    next.tmdbId = positiveInt(meta.tmdbId);
    if (meta.tmdbType) next.tmdbType = meta.tmdbType;
  }
  const imdb = normalizeImdbId(meta.imdbId);
  if (imdb && !next.imdbId) next.imdbId = imdb;
  if (isWatchKind(meta.kind) && !next.manual?.includes('kind')) next.kind = meta.kind;
  if (positiveInt(meta.year) !== undefined && !next.manual?.includes('year')) next.year = positiveInt(meta.year);
  if (meta.anime === true) next.anime = true;
  if (nonEmptyString(meta.originalTitle)) next.originalTitle = nonEmptyString(meta.originalTitle);
  if (nonEmptyString(meta.englishTitle)) next.englishTitle = nonEmptyString(meta.englishTitle);
  if (nonEmptyString(meta.romajiTitle)) next.romajiTitle = nonEmptyString(meta.romajiTitle);
  if (meta.altTitles?.length) {
    const own = watchTitleKey(next.title);
    next.altTitles = uniqueStrings([...(next.altTitles ?? []), ...meta.altTitles]).filter((name) => watchTitleKey(name) !== own);
  }
  if (positiveInt(meta.episodeCount) !== undefined && !next.manual?.includes('episodeCount')) next.episodeCount = positiveInt(meta.episodeCount);
  if (meta.genres?.length) next.genres = uniqueStrings(meta.genres);
  if (isFiniteNumber(meta.runtimeMinutes) && meta.runtimeMinutes > 0) next.runtimeMinutes = Math.round(meta.runtimeMinutes);
  if (nonEmptyString(meta.posterPath)) next.posterPath = nonEmptyString(meta.posterPath);
  if (nonEmptyString(meta.posterUrl)) next.posterUrl = nonEmptyString(meta.posterUrl);
  if (nonEmptyString(meta.bannerPath)) next.bannerPath = nonEmptyString(meta.bannerPath);
  if (nonEmptyString(meta.backdropPath)) next.backdropPath = nonEmptyString(meta.backdropPath);
  const compacted = compactTitle(next);
  if (visibleSignature(compacted) !== visibleSignature(title)) compacted.updatedAt = now;
  return compacted;
}

/** True when a title has no id a metadata provider can look up directly — it needs a title+year search. */
export function watchTitleNeedsLookup(title: WatchTitle): boolean {
  return title.tmdbId === undefined && title.tvmazeId === undefined && title.imdbId === undefined
    && title.malId === undefined && title.anilistId === undefined;
}

// ---------------------------------------------------------------------------
// MAL library (OAuth sync) → observations
// ---------------------------------------------------------------------------

export function watchStatusFromMal(status: MalListStatus | undefined, rewatching = false): WatchStatus | undefined {
  if (rewatching && (status === 'completed' || status === 'watching' || status === undefined)) return 'rewatching';
  switch (status) {
    case 'watching':
      return 'watching';
    case 'completed':
      return 'completed';
    case 'on_hold':
      return 'on_hold';
    case 'dropped':
      return 'dropped';
    case 'plan_to_watch':
      return 'plan';
    default:
      return undefined;
  }
}

export function malStatusFromWatch(status: WatchStatus): MalListStatus {
  switch (status) {
    case 'plan':
      return 'plan_to_watch';
    case 'rewatching':
      return 'completed';
    default:
      return status;
  }
}

/**
 * The user's own MAL list rows (from `mal-library.json`) as observations.
 *
 * Derivative rows — titles reached through `related_anime`, not on the user's
 * list — are skipped: they are discovery, not tracking, and adding 300 sequels
 * the user never listed as "plan to watch" would be inventing intent. Manga
 * rows are skipped too; this is a watch library.
 */
export function malLibraryEntriesToObservations(entries: readonly MalLibraryEntry[]): WatchObservation[] {
  const out: WatchObservation[] = [];
  for (const entry of entries) {
    if (entry.origin !== 'list' || entry.media !== 'anime') continue;
    const status = watchStatusFromMal(entry.status, entry.rewatching);
    if (!status) continue;
    const updated = entry.malUpdatedAt ? Date.parse(entry.malUpdatedAt) : Number.NaN;
    out.push({
      source: 'mal-sync',
      asOf: Number.isFinite(updated) ? updated : entry.syncedAt || undefined,
      addedAt: entry.addedAt || undefined,
      identity: {
        kind: 'anime',
        anime: true,
        title: entry.title,
        altTitles: entry.altTitles,
        malId: entry.malId,
        posterUrl: entry.posterUrl,
      },
      fields: {
        status,
        progress: entry.episodesWatched,
        episodeCount: positiveInt(entry.totalEpisodes),
        score: entry.score > 0 ? { score: entry.score, scale: 'ten' } : undefined,
      },
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Local media: linking and progress
// ---------------------------------------------------------------------------

/**
 * The fields of a local media item the linker reads. `MediaItem` satisfies it
 * structurally; the TMDB/TVmaze/IMDb ids are read when the metadata pass has
 * put them there and ignored when it has not.
 */
export interface WatchLinkableMedia {
  id: string;
  title?: string;
  seriesTitle?: string;
  seriesKey?: string;
  nativeTitle?: string;
  year?: number;
  category?: string;
  kind?: string;
  malId?: number;
  anilistId?: number;
  tmdbId?: number | string;
  /** Which TMDB namespace `tmdbId` is in; inferred from the category when absent. */
  tmdbType?: 'movie' | 'tv';
  tvmazeId?: number | string;
  imdbId?: string;
  season?: number;
  episode?: number;
  episodeKind?: string;
  episodeCount?: number;
  genres?: string[];
  durationSec?: number;
  positionSec?: number;
  lastPlayedAt?: number;
  posterPath?: string;
  path?: string;
}

/** How a media item was tied to a title. `title-base` = by name, but the file is a later season. */
export type WatchLinkVia = 'pinned' | 'id' | 'title' | 'title-season' | 'title-base';

export interface WatchMediaLink {
  item: WatchLinkableMedia;
  via: WatchLinkVia;
}

/** The watch kind a media category implies, or null for things that are not watched (music, podcasts…). */
export function watchKindForMediaCategory(category: string | undefined, episodeKind?: string): WatchKind | null | undefined {
  if (episodeKind === 'movie') return 'film';
  switch (category) {
    case 'anime':
      return 'anime';
    case 'movie':
      return 'film';
    case 'tv':
    case 'drama':
      return 'tv';
    case 'music':
    case 'podcast':
    case 'audiobook':
    case 'learning':
    case 'personal':
      return null;
    default:
      return undefined;
  }
}

function isLinkableMedia(item: WatchLinkableMedia): boolean {
  if (item.kind === 'audio' || item.kind === 'audiobook') return false;
  return watchKindForMediaCategory(item.category, item.episodeKind) !== null;
}

function mediaIdentity(item: WatchLinkableMedia): WatchIdentityLike & { kind: WatchKind } {
  const kind = watchKindForMediaCategory(item.category, item.episodeKind) ?? 'other';
  const tmdbId = numericId(item.tmdbId);
  return {
    kind,
    title: item.seriesTitle || item.title || '',
    originalTitle: item.nativeTitle,
    year: item.year,
    malId: positiveInt(item.malId),
    anilistId: positiveInt(item.anilistId),
    tmdbId,
    tmdbType: item.tmdbType === 'movie' || item.tmdbType === 'tv' ? item.tmdbType : undefined,
    tvmazeId: numericId(item.tvmazeId),
    imdbId: normalizeImdbId(item.imdbId),
  };
}

function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;
}

/** Name keys a season-N file of a series is filed under on MAL-style per-season lists. */
function seasonKeys(base: string, season: number): string[] {
  return [
    `${base} season ${season}`,
    `${base} ${ordinal(season)} season`,
    `${base} ${season}`,
    `${base} part ${season}`,
    `${base} s${season}`,
  ];
}

/** The title a media item belongs to, and how it was found. */
export function findWatchTitleForMedia(
  index: WatchIndex,
  item: WatchLinkableMedia,
): { title: WatchTitle; via: WatchLinkVia } | undefined {
  if (!isLinkableMedia(item)) return undefined;
  const identity = mediaIdentity(item);
  // Ids first. TMDB's type follows the file: a movie release asks for a movie,
  // and a file whose category is unknown asks for both.
  const idKeys = watchIdKeys(identity);
  if (identity.kind === 'other' && identity.tmdbId !== undefined && !identity.tmdbType) idKeys.push(`tmdb:movie:${identity.tmdbId}`);
  for (const key of idKeys) {
    const hit = index.byKey.get(key);
    if (hit) return { title: hit, via: 'id' };
  }
  const baseKeys = uniqueStrings([
    item.seriesKey,
    watchTitleKey(item.seriesTitle),
    watchTitleKey(item.nativeTitle),
    item.seriesKey || item.seriesTitle ? undefined : watchTitleKey(item.title),
  ]);
  const pick = (key: string): WatchTitle | undefined => {
    const hits = (index.byTitle.get(key) ?? []).filter((title) =>
      watchKindsCompatible(title.kind, identity.kind)
      && yearsCompatible(title.year, identity.year)
      && !watchIdentitiesConflict(title, identity));
    if (hits.length === 1) return hits[0];
    if (hits.length > 1 && identity.year !== undefined) {
      const sameYear = hits.filter((title) => title.year === identity.year);
      if (sameYear.length === 1) return sameYear[0];
    }
    return undefined;
  };
  const season = item.season ?? 1;
  if (season > 1) {
    for (const base of baseKeys) {
      for (const key of seasonKeys(base, season)) {
        const hit = pick(key);
        if (hit) return { title: hit, via: 'title-season' };
      }
    }
  }
  for (const base of baseKeys) {
    const hit = pick(base);
    if (hit) return { title: hit, via: season > 1 ? 'title-base' : 'title' };
  }
  return undefined;
}

/** Every title's local files. Pinned links win over the matcher. */
export function linkMediaToTitles(
  titles: readonly WatchTitle[],
  items: readonly WatchLinkableMedia[],
  index: WatchIndex = buildWatchIndex(titles),
): Map<string, WatchMediaLink[]> {
  const links = new Map<string, WatchMediaLink[]>();
  const pinnedOwner = new Map<string, string>();
  for (const title of titles) for (const id of title.pinnedMediaItemIds ?? []) pinnedOwner.set(id, title.id);
  const push = (titleId: string, link: WatchMediaLink): void => {
    const list = links.get(titleId);
    if (list) list.push(link);
    else links.set(titleId, [link]);
  };
  for (const item of items) {
    const pinned = pinnedOwner.get(item.id);
    if (pinned) {
      push(pinned, { item, via: 'pinned' });
      continue;
    }
    const found = findWatchTitleForMedia(index, item);
    if (found) push(found.title.id, { item, via: found.via });
  }
  return links;
}

/** A title built from a local file, for when the player finishes something the library does not track yet. */
export function watchObservationFromMedia(item: WatchLinkableMedia, now: number): WatchObservation | undefined {
  if (!isLinkableMedia(item)) return undefined;
  const kind = watchKindForMediaCategory(item.category, item.episodeKind);
  if (!kind) return undefined;
  const identity = mediaIdentity(item);
  if (!identity.title.trim()) return undefined;
  return {
    source: 'local',
    asOf: now,
    addedAt: now,
    identity: {
      ...identity,
      kind,
      anime: kind === 'anime' || identity.malId !== undefined || identity.anilistId !== undefined || undefined,
    },
    fields: { episodeCount: kind === 'film' ? undefined : positiveInt(item.episodeCount) },
  };
}

/**
 * Fraction of a file that counts as "watched" — the Trakt/Plex convention, and the one
 * app-wide rule (`./watchFinished`), so the tracker and the library tick agree.
 */
export const WATCH_COMPLETE_FRACTION = WATCH_FINISHED_FRACTION;

/** How long a repeat play of an already-counted file waits before it re-stamps `lastWatchedAt`. */
export const WATCH_LAST_WATCHED_REFRESH_MS = 30 * 60 * 1000;

export interface WatchPlaybackEvent {
  positionSec: number;
  durationSec: number;
  season?: number;
  episode?: number;
  /** The file's release kind; only a normal episode or a movie advances progress. */
  episodeKind?: string;
  /** How the file was linked; `title-base` means season ambiguity. */
  via?: WatchLinkVia;
  at: number;
  /** Local `YYYY-MM-DD`. */
  today: string;
}

export type WatchPlaybackReason =
  | 'below-threshold'
  | 'no-episode'
  | 'not-an-episode'
  | 'season-ambiguous'
  | 'already-counted';

export interface WatchPlaybackOutcome {
  title: WatchTitle;
  changed: boolean;
  /** True when the play crossed the watched threshold. */
  counted: boolean;
  reason?: WatchPlaybackReason;
  statusFrom: WatchStatus;
  statusTo: WatchStatus;
}

/** A title whose progress is per-season (MAL/AniList list entries) rather than whole-show. */
function isPerSeasonEntry(title: WatchTitle): boolean {
  return title.malId !== undefined || title.anilistId !== undefined;
}

/**
 * What finishing (≥90% of) a local file does to its title.
 *
 * - A film (or a one-episode title) completes: progress 1, `finishedAt` today,
 *   and a viewing in `watchDates` — a rewatch when it was already completed.
 * - An episode advances progress to at least its number (per-season entries,
 *   like MAL's) or to the count of distinct episodes seen (whole-show TV), moves
 *   plan / on-hold / dropped to watching, and completes the title when progress
 *   reaches the episode count. A rewatch that reaches the last episode completes
 *   again and counts one more rewatch.
 * - Progress never goes down, and a completed series is left alone by a replay.
 *
 * Stamped as a dated observation at `event.at`, so it outranks a manual edit
 * made before the play — the play is the newer fact.
 */
export function applyLocalPlayback(title: WatchTitle, event: WatchPlaybackEvent): WatchPlaybackOutcome {
  const statusFrom = title.status;
  const unchanged = (reason: WatchPlaybackReason, counted = false): WatchPlaybackOutcome => ({
    title, changed: false, counted, reason, statusFrom, statusTo: statusFrom,
  });
  const fraction = event.durationSec > 0 ? event.positionSec / event.durationSec : 0;
  if (!(fraction >= WATCH_COMPLETE_FRACTION)) return unchanged('below-threshold');
  if (event.episodeKind && event.episodeKind !== 'episode' && event.episodeKind !== 'movie') {
    return unchanged('not-an-episode', true);
  }

  const next = cloneTitle(title);
  const touched = new Set<WatchTrackedField>();
  const set = <K extends WatchTrackedField & keyof WatchTitle>(field: K, value: WatchTitle[K]): void => {
    if (next[field] === value) return;
    next[field] = value;
    touched.add(field);
  };
  const addViewing = (rewatch: boolean): void => {
    const before = next.watchDates.length;
    next.watchDates = mergeWatchDates(next.watchDates, [{ date: event.today, rewatch: rewatch || undefined, source: 'local' }]);
    if (next.watchDates.length !== before) touched.add('watchDates');
  };
  const single = next.kind === 'film' || next.episodeCount === 1 || event.episodeKind === 'movie';
  let reason: WatchPlaybackReason | undefined;

  if (single) {
    if (next.status === 'completed' || next.status === 'rewatching') {
      // A film watched again. One viewing per day, so a player that reports
      // 91%, 95% and 100% of the same play records it once.
      const already = next.watchDates.some((entry) => entry.date === event.today);
      if (!already) {
        addViewing(true);
        set('rewatchCount', (next.rewatchCount ?? 0) + 1);
      } else reason = 'already-counted';
      if (next.status === 'rewatching') set('status', 'completed');
    } else {
      set('status', 'completed');
      if ((next.progress ?? 0) < 1) set('progress', 1);
      if (!next.finishedAt) set('finishedAt', event.today);
      if (!next.startedAt) set('startedAt', event.today);
      addViewing(false);
    }
  } else if (event.episode === undefined) {
    reason = 'no-episode';
    if (next.status === 'plan' || next.status === 'on_hold' || next.status === 'dropped') {
      set('status', 'watching');
      if (!next.startedAt) set('startedAt', event.today);
    }
  } else if (event.via === 'title-base' && isPerSeasonEntry(next)) {
    // A season-2 file matched only by the franchise's base name: advancing the
    // season-1 entry's progress to "episode 5" would be wrong both ways.
    return unchanged('season-ambiguous', true);
  } else {
    const episodeKey = `s${event.season ?? 1}e${event.episode}`;
    const seen = new Set(next.watchedEpisodes ?? []);
    if (!seen.has(episodeKey)) {
      seen.add(episodeKey);
      next.watchedEpisodes = [...seen].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
    }
    if (next.status === 'completed') {
      reason = 'already-counted';
    } else if (next.status === 'rewatching') {
      if (next.episodeCount !== undefined && event.episode >= next.episodeCount) {
        set('status', 'completed');
        set('rewatchCount', (next.rewatchCount ?? 0) + 1);
        addViewing(true);
      }
    } else {
      const reached = isPerSeasonEntry(next) ? event.episode : seen.size;
      const progress = Math.max(next.progress ?? 0, reached);
      if (progress !== (next.progress ?? 0)) set('progress', progress);
      else reason = 'already-counted';
      if (next.status !== 'watching') set('status', 'watching');
      if (!next.startedAt) set('startedAt', event.today);
      if (next.episodeCount !== undefined && progress >= next.episodeCount) {
        set('status', 'completed');
        if (!next.finishedAt) set('finishedAt', event.today);
        addViewing(false);
      }
    }
  }

  const episodesChanged = stableStringify(next.watchedEpisodes ?? []) !== stableStringify(title.watchedEpisodes ?? []);
  const meaningful = touched.size > 0 || episodesChanged;
  const stale = event.at - (title.lastWatchedAt ?? 0) >= WATCH_LAST_WATCHED_REFRESH_MS;
  if (!meaningful && !stale) {
    return { title, changed: false, counted: true, reason: reason ?? 'already-counted', statusFrom, statusTo: statusFrom };
  }
  next.lastWatchedAt = Math.max(title.lastWatchedAt ?? 0, event.at);
  if (touched.size) {
    next.fieldAt = { ...(next.fieldAt ?? {}) };
    for (const field of touched) next.fieldAt[field] = event.at;
    if (next.manual) {
      next.manual = next.manual.filter((field) => !touched.has(field));
      if (next.manual.length === 0) delete next.manual;
    }
  }
  addSource(next, 'local');
  const compacted = compactTitle(next);
  compacted.updatedAt = event.at;
  return { title: compacted, changed: true, counted: true, reason, statusFrom, statusTo: compacted.status };
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

export interface WatchQuery {
  kinds?: WatchKind[];
  statuses?: WatchStatus[];
  sources?: WatchSource[];
  /** true = anime only, false = non-anime only. */
  anime?: boolean;
  /** Any-of, case-insensitive, over the title's genres and its linked files' genres. */
  genres?: string[];
  yearMin?: number;
  yearMax?: number;
  /** 0–10 inclusive; unrated titles are excluded when either bound is set. */
  scoreMin?: number;
  scoreMax?: number;
  /** true = at least one local file linked; false = none. */
  onDisk?: boolean;
  favorite?: boolean;
  liked?: boolean;
  /** Any-of. */
  lists?: string[];
  /** Any-of. */
  tags?: string[];
  /** Folded substring match over every name. */
  search?: string;
  /** Restrict to these ids (e.g. a detail view refreshing a handful). */
  ids?: string[];
  sort?: WatchSortKey;
  direction?: 'asc' | 'desc';
  offset?: number;
  limit?: number;
}

export interface WatchTitleView extends WatchTitle {
  /** Linked local media item ids, pinned first. */
  mediaItemIds: string[];
  onDisk: boolean;
  /** Distinct normal episodes on disk. */
  episodesOnDisk: number;
  /** Title genres ∪ linked files' genres. */
  allGenres: string[];
  /** `runtimeMinutes`, else derived from the linked files' durations. */
  runtime?: number;
  /** max(title, linked files' last play, latest viewing). */
  lastWatched?: number;
  /** `posterPath`, else the first linked file's. */
  poster?: string;
  /** 0–1 when the episode count is known (completed reads 1). */
  progressRatio?: number;
}

export interface WatchFacets {
  total: number;
  byKind: Partial<Record<WatchKind, number>>;
  byStatus: Partial<Record<WatchStatus, number>>;
  bySource: Partial<Record<WatchSource, number>>;
  onDisk: number;
  genres: { name: string; count: number }[];
  lists: { name: string; count: number }[];
  tags: { name: string; count: number }[];
  years: { min: number; max: number } | null;
}

export interface WatchQueryResult {
  /** Matches before offset/limit. */
  total: number;
  offset: number;
  items: WatchTitleView[];
  /** Over the whole library, not the filtered set — what the filter chips count. */
  facets: WatchFacets;
}

function viewFor(title: WatchTitle, links: readonly WatchMediaLink[]): WatchTitleView {
  const ordered = [...links].sort((a, b) => Number(b.via === 'pinned') - Number(a.via === 'pinned'));
  const items = ordered.map((link) => link.item);
  const episodes = new Set<string>();
  let durationTotal = 0;
  let durationCount = 0;
  let longest = 0;
  let lastPlayed = 0;
  let poster: string | undefined;
  for (const item of items) {
    if ((item.episodeKind === undefined || item.episodeKind === 'episode') && item.episode !== undefined) {
      episodes.add(`s${item.season ?? 1}e${item.episode}`);
    }
    if (isFiniteNumber(item.durationSec) && item.durationSec > 0) {
      durationTotal += item.durationSec;
      durationCount += 1;
      longest = Math.max(longest, item.durationSec);
    }
    if (isFiniteNumber(item.lastPlayedAt)) lastPlayed = Math.max(lastPlayed, item.lastPlayedAt);
    if (!poster && item.posterPath) poster = item.posterPath;
  }
  let runtime = title.runtimeMinutes;
  if (runtime === undefined && durationCount > 0) {
    const episodeTotal = title.episodeCount ?? (episodes.size || durationCount);
    runtime = title.kind === 'film'
      ? Math.round(longest / 60)
      : Math.round(((durationTotal / durationCount) * episodeTotal) / 60);
    if (runtime === 0) runtime = undefined;
  }
  // A finish date is a viewing too: an imported MAL row with only
  // `my_finish_date` was last watched then, whatever else is unknown.
  const latestViewing = title.watchDates.length ? watchDateToMs(title.watchDates[title.watchDates.length - 1].date) : undefined;
  const finished = watchDateToMs(title.finishedAt);
  const lastWatched = Math.max(title.lastWatchedAt ?? 0, lastPlayed, latestViewing ?? 0, finished ?? 0) || undefined;
  let progressRatio: number | undefined;
  if (title.status === 'completed') progressRatio = 1;
  else if (title.episodeCount) progressRatio = Math.min(1, (title.progress ?? 0) / title.episodeCount);
  return {
    ...title,
    mediaItemIds: items.map((item) => item.id),
    onDisk: items.length > 0,
    episodesOnDisk: episodes.size,
    allGenres: uniqueStrings([...(title.genres ?? []), ...items.flatMap((item) => item.genres ?? [])]),
    runtime,
    lastWatched,
    poster: title.posterPath ?? poster,
    progressRatio,
  };
}

const COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

function sortValue(view: WatchTitleView, key: WatchSortKey): number | string | undefined {
  switch (key) {
    case 'title':
      return view.title;
    case 'year':
      return view.year;
    case 'score':
      return view.score;
    case 'added':
      return view.addedAt;
    case 'lastWatched':
      return view.lastWatched;
    case 'finished':
      return view.finishedAt;
    case 'progress':
      return view.progressRatio;
    case 'runtime':
      return view.runtime;
    case 'updated':
      return view.updatedAt;
    default:
      return undefined;
  }
}

/**
 * Sort comparator. A title with no value for the key sorts last in *both*
 * directions — "unrated" is not the lowest score, and flipping to descending
 * should not bury every rated title under 800 unrated ones. Ties fall back to
 * the title, then the id, so the order is total and stable.
 */
function compareViews(a: WatchTitleView, b: WatchTitleView, key: WatchSortKey, direction: 'asc' | 'desc'): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === undefined && vb !== undefined) return 1;
  if (vb === undefined && va !== undefined) return -1;
  if (va !== undefined && vb !== undefined) {
    let cmp = typeof va === 'string' && typeof vb === 'string' ? COLLATOR.compare(va, vb) : (va as number) - (vb as number);
    if (key === 'progress' && cmp === 0) cmp = (a.progress ?? 0) - (b.progress ?? 0);
    if (cmp !== 0) return direction === 'desc' ? -cmp : cmp;
  }
  return COLLATOR.compare(a.title, b.title) || a.id.localeCompare(b.id);
}

function countInto<K extends string>(record: Partial<Record<K, number>>, key: K): void {
  record[key] = (record[key] ?? 0) + 1;
}

function tally(map: Map<string, { name: string; count: number }>, name: string): void {
  const key = name.toLowerCase();
  const entry = map.get(key);
  if (entry) {
    entry.count += 1;
    // Show "Drama" rather than whichever of "drama"/"Drama" was seen first.
    if (entry.name === entry.name.toLowerCase() && name !== name.toLowerCase()) entry.name = name;
  } else map.set(key, { name, count: 1 });
}

function facetsFor(views: readonly WatchTitleView[]): WatchFacets {
  const facets: WatchFacets = {
    total: views.length,
    byKind: {},
    byStatus: {},
    bySource: {},
    onDisk: 0,
    genres: [],
    lists: [],
    tags: [],
    years: null,
  };
  const genres = new Map<string, { name: string; count: number }>();
  const lists = new Map<string, { name: string; count: number }>();
  const tags = new Map<string, { name: string; count: number }>();
  let minYear = Infinity;
  let maxYear = -Infinity;
  for (const view of views) {
    countInto(facets.byKind, view.kind);
    countInto(facets.byStatus, view.status);
    for (const source of view.sources) countInto(facets.bySource, source);
    if (view.onDisk) facets.onDisk += 1;
    for (const genre of view.allGenres) tally(genres, genre);
    for (const list of view.lists) tally(lists, list);
    for (const tag of view.tags) tally(tags, tag);
    if (view.year !== undefined) {
      minYear = Math.min(minYear, view.year);
      maxYear = Math.max(maxYear, view.year);
    }
  }
  const byCount = (a: { name: string; count: number }, b: { name: string; count: number }): number =>
    b.count - a.count || COLLATOR.compare(a.name, b.name);
  facets.genres = [...genres.values()].sort(byCount);
  facets.lists = [...lists.values()].sort(byCount);
  facets.tags = [...tags.values()].sort(byCount);
  facets.years = Number.isFinite(minYear) ? { min: minYear, max: maxYear } : null;
  return facets;
}

function lowerSet(values: readonly string[] | undefined): Set<string> | undefined {
  if (!values?.length) return undefined;
  return new Set(values.map((value) => value.toLowerCase()));
}

function matchesQuery(view: WatchTitleView, query: WatchQuery, search: string, sets: {
  genres?: Set<string>; lists?: Set<string>; tags?: Set<string>; ids?: Set<string>;
}): boolean {
  if (sets.ids && !sets.ids.has(view.id)) return false;
  if (query.kinds?.length && !query.kinds.includes(view.kind)) return false;
  if (query.statuses?.length && !query.statuses.includes(view.status)) return false;
  if (query.sources?.length && !view.sources.some((source) => query.sources?.includes(source))) return false;
  if (query.anime !== undefined && !!view.anime !== query.anime) return false;
  if (query.onDisk !== undefined && view.onDisk !== query.onDisk) return false;
  if (query.favorite !== undefined && !!view.favorite !== query.favorite) return false;
  if (query.liked !== undefined && !!view.liked !== query.liked) return false;
  if (query.yearMin !== undefined || query.yearMax !== undefined) {
    if (view.year === undefined) return false;
    if (query.yearMin !== undefined && view.year < query.yearMin) return false;
    if (query.yearMax !== undefined && view.year > query.yearMax) return false;
  }
  if (query.scoreMin !== undefined || query.scoreMax !== undefined) {
    if (view.score === undefined) return false;
    if (query.scoreMin !== undefined && view.score < query.scoreMin) return false;
    if (query.scoreMax !== undefined && view.score > query.scoreMax) return false;
  }
  if (sets.genres && !view.allGenres.some((genre) => sets.genres?.has(genre.toLowerCase()))) return false;
  if (sets.lists && !view.lists.some((list) => sets.lists?.has(list.toLowerCase()))) return false;
  if (sets.tags && !view.tags.some((tag) => sets.tags?.has(tag.toLowerCase()))) return false;
  if (search) {
    const names = [view.title, view.originalTitle, ...(view.altTitles ?? [])];
    if (!names.some((name) => watchTitleKey(name).includes(search))) return false;
  }
  return true;
}

/** Re-validates a query that crossed the IPC bridge. */
export function sanitizeWatchQuery(value: unknown): WatchQuery {
  const r = asRecord(value);
  const q: WatchQuery = {};
  const list = <T>(raw: unknown, guard: (v: unknown) => v is T): T[] | undefined => {
    if (!Array.isArray(raw)) return undefined;
    const out = raw.filter(guard);
    return out.length ? out : undefined;
  };
  q.kinds = list(r.kinds, isWatchKind);
  q.statuses = list(r.statuses, isWatchStatus);
  q.sources = list(r.sources, isWatchSource);
  if (typeof r.anime === 'boolean') q.anime = r.anime;
  if (typeof r.onDisk === 'boolean') q.onDisk = r.onDisk;
  if (typeof r.favorite === 'boolean') q.favorite = r.favorite;
  if (typeof r.liked === 'boolean') q.liked = r.liked;
  for (const key of ['yearMin', 'yearMax', 'scoreMin', 'scoreMax'] as const) {
    if (isFiniteNumber(r[key])) q[key] = r[key] as number;
  }
  const strings = (raw: unknown): string[] | undefined => {
    const out = Array.isArray(raw) ? uniqueStrings(raw) : [];
    return out.length ? out : undefined;
  };
  q.genres = strings(r.genres);
  q.lists = strings(r.lists);
  q.tags = strings(r.tags);
  q.ids = strings(r.ids);
  if (nonEmptyString(r.search)) q.search = nonEmptyString(r.search);
  if (isWatchSortKey(r.sort)) q.sort = r.sort;
  if (r.direction === 'asc' || r.direction === 'desc') q.direction = r.direction;
  if (nonNegativeInt(r.offset) !== undefined) q.offset = nonNegativeInt(r.offset);
  if (positiveInt(r.limit) !== undefined) q.limit = positiveInt(r.limit);
  for (const key of Object.keys(q) as (keyof WatchQuery)[]) if (q[key] === undefined) delete q[key];
  return q;
}

/** Views for every title, linked to the local media. The query and `watch:get` share this. */
export function buildWatchViews(
  titles: readonly WatchTitle[],
  media: readonly WatchLinkableMedia[],
): WatchTitleView[] {
  const links = linkMediaToTitles(titles, media);
  return titles.map((title) => viewFor(title, links.get(title.id) ?? []));
}

/**
 * The UI's one read: filter, sort, page — plus facets over the whole library.
 *
 * Default sort is `title` ascending; `score`, `added`, `lastWatched`,
 * `finished`, `updated` and `year` read more naturally descending, but the
 * caller says so explicitly — a default direction that depends on the key is a
 * surprise in a sort menu.
 */
export function queryWatchLibrary(
  titles: readonly WatchTitle[],
  media: readonly WatchLinkableMedia[],
  query: WatchQuery = {},
): WatchQueryResult {
  const views = buildWatchViews(titles, media);
  const search = query.search ? watchTitleKey(query.search) : '';
  const sets = {
    genres: lowerSet(query.genres),
    lists: lowerSet(query.lists),
    tags: lowerSet(query.tags),
    ids: query.ids?.length ? new Set(query.ids) : undefined,
  };
  const matched = views.filter((view) => matchesQuery(view, query, search, sets));
  const key = query.sort ?? 'title';
  const direction = query.direction ?? 'asc';
  matched.sort((a, b) => compareViews(a, b, key, direction));
  const offset = Math.max(0, query.offset ?? 0);
  const items = query.limit !== undefined ? matched.slice(offset, offset + query.limit) : matched.slice(offset);
  return { total: matched.length, offset, items, facets: facetsFor(views) };
}

// ---------------------------------------------------------------------------
// Reading a stored document back
// ---------------------------------------------------------------------------

function optionalNumber(value: unknown): number | undefined {
  return isFiniteNumber(value) ? value : undefined;
}

function parseScoreHistory(value: unknown): WatchScoreHistoryEntry[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: WatchScoreHistoryEntry[] = [];
  for (const row of value) {
    const r = asRecord(row);
    if (!isFiniteNumber(r.score)) continue;
    out.push({
      score: clampScore(r.score),
      scale: r.scale === 'ten' || r.scale === 'stars' ? r.scale : undefined,
      stars: isFiniteNumber(r.stars) ? clampStars(r.stars) : undefined,
      sources: Array.isArray(r.sources) ? WATCH_SOURCES.filter((s) => (r.sources as unknown[]).includes(s)) : [],
      at: optionalNumber(r.at),
      replacedAt: optionalNumber(r.replacedAt) ?? 0,
    });
  }
  return out.length ? out.slice(-20) : undefined;
}

function parseNextAiring(value: unknown): WatchNextAiring | undefined {
  const r = asRecord(value);
  const episode = positiveInt(r.episode);
  const at = optionalNumber(r.at);
  return episode !== undefined && at !== undefined ? { episode, at } : undefined;
}

function parseTitle(value: unknown): WatchTitle | undefined {
  const r = asRecord(value);
  const id = nonEmptyString(r.id);
  const title = typeof r.title === 'string' ? r.title : undefined;
  if (!id || title === undefined) return undefined;
  const fieldAtRaw = asRecord(r.fieldAt);
  const fieldAt: Partial<Record<WatchTrackedField, number>> = {};
  for (const field of WATCH_TRACKED_FIELDS) {
    const at = optionalNumber(fieldAtRaw[field]);
    if (at !== undefined) fieldAt[field] = at;
  }
  const manual = Array.isArray(r.manual)
    ? WATCH_TRACKED_FIELDS.filter((field) => (r.manual as unknown[]).includes(field))
    : [];
  const sources = Array.isArray(r.sources) ? WATCH_SOURCES.filter((s) => (r.sources as unknown[]).includes(s)) : [];
  const tmdbType = r.tmdbType === 'movie' || r.tmdbType === 'tv' ? r.tmdbType : undefined;
  const scoreScale = r.scoreScale === 'ten' || r.scoreScale === 'stars' ? r.scoreScale : undefined;
  const watchedEpisodes = Array.isArray(r.watchedEpisodes)
    ? r.watchedEpisodes.filter((key): key is string => typeof key === 'string' && /^s\d+e\d+$/.test(key))
    : undefined;
  return compactTitle({
    id,
    kind: isWatchKind(r.kind) ? r.kind : 'other',
    anime: r.anime === true || undefined,
    format: nonEmptyString(r.format),
    title,
    originalTitle: nonEmptyString(r.originalTitle),
    englishTitle: nonEmptyString(r.englishTitle),
    romajiTitle: nonEmptyString(r.romajiTitle),
    altTitles: stringList(r.altTitles),
    year: positiveInt(r.year),
    malId: positiveInt(r.malId),
    anilistId: positiveInt(r.anilistId),
    tmdbId: positiveInt(r.tmdbId),
    tmdbType,
    tvmazeId: positiveInt(r.tvmazeId),
    imdbId: normalizeImdbId(r.imdbId),
    letterboxdUri: nonEmptyString(r.letterboxdUri),
    status: isWatchStatus(r.status) ? r.status : 'plan',
    score: isFiniteNumber(r.score) ? clampScore(r.score) : undefined,
    scoreScale,
    stars: isFiniteNumber(r.stars) ? clampStars(r.stars) : undefined,
    scoreHistory: parseScoreHistory(r.scoreHistory),
    progress: nonNegativeInt(r.progress),
    episodeCount: positiveInt(r.episodeCount),
    rewatchCount: nonNegativeInt(r.rewatchCount),
    startedAt: normalizeWatchDate(r.startedAt),
    finishedAt: normalizeWatchDate(r.finishedAt),
    watchDates: sanitizeWatchDates(r.watchDates, 'manual'),
    watchedEpisodes: watchedEpisodes?.length ? watchedEpisodes : undefined,
    liked: r.liked === true || undefined,
    favorite: r.favorite === true || undefined,
    tags: stringList(r.tags) ?? [],
    lists: stringList(r.lists) ?? [],
    notes: typeof r.notes === 'string' && r.notes ? r.notes : undefined,
    review: typeof r.review === 'string' && r.review ? r.review : undefined,
    genres: stringList(r.genres),
    runtimeMinutes: positiveInt(r.runtimeMinutes),
    posterPath: nonEmptyString(r.posterPath),
    posterUrl: nonEmptyString(r.posterUrl),
    bannerPath: nonEmptyString(r.bannerPath),
    backdropPath: nonEmptyString(r.backdropPath),
    nextAiring: parseNextAiring(r.nextAiring),
    pinnedMediaItemIds: stringList(r.pinnedMediaItemIds),
    lastWatchedAt: optionalNumber(r.lastWatchedAt),
    sources: sources.length ? sources : ['manual'],
    addedAt: optionalNumber(r.addedAt) ?? 0,
    updatedAt: optionalNumber(r.updatedAt) ?? 0,
    fieldAt: Object.keys(fieldAt).length ? fieldAt : undefined,
    manual: manual.length ? manual : undefined,
  });
}

/**
 * Reads a stored document back, tolerantly: a malformed title costs that
 * title, never the library. A duplicate id keeps the first occurrence.
 */
export function parseWatchLibraryDocument(value: unknown): WatchLibraryDocument {
  const root = asRecord(value);
  const titles: WatchTitle[] = [];
  const seen = new Set<string>();
  for (const row of Array.isArray(root.titles) ? root.titles : []) {
    const title = parseTitle(row);
    if (!title || seen.has(title.id)) continue;
    seen.add(title.id);
    titles.push(title);
  }
  const removed: WatchTombstone[] = [];
  for (const row of Array.isArray(root.removed) ? root.removed : []) {
    const r = asRecord(row);
    const keys = stringList(r.keys);
    const at = optionalNumber(r.at);
    if (!keys?.length || at === undefined) continue;
    removed.push({ keys, title: typeof r.title === 'string' ? r.title : '', at });
  }
  const imports: WatchImportRecord[] = [];
  for (const row of Array.isArray(root.imports) ? root.imports : []) {
    const r = asRecord(row);
    const at = optionalNumber(r.at);
    if (at === undefined || !isWatchSource(r.source)) continue;
    imports.push({
      at,
      source: r.source,
      fileName: typeof r.fileName === 'string' ? r.fileName : '',
      exportedAt: optionalNumber(r.exportedAt),
      added: nonNegativeInt(r.added) ?? 0,
      updated: nonNegativeInt(r.updated) ?? 0,
      unchanged: nonNegativeInt(r.unchanged) ?? 0,
    });
  }
  return {
    version: optionalNumber(root.version) ?? WATCH_LIBRARY_SCHEMA_VERSION,
    titles,
    removed,
    malLibraryLastSyncAt: optionalNumber(root.malLibraryLastSyncAt) ?? null,
    imports: imports.slice(0, WATCH_IMPORT_HISTORY_LIMIT),
  };
}

/** Counts by status over a set of titles — the import summary's `byStatus`. */
export function countWatchStatuses(titles: readonly WatchTitle[]): Partial<Record<WatchStatus, number>> {
  const out: Partial<Record<WatchStatus, number>> = {};
  for (const title of titles) countInto(out, title.status);
  return out;
}
