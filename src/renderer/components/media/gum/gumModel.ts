/**
 * The media library's one view model: a "title" the viewer thinks in — a show, a
 * film, an anime — whether it is tracked (MyAnimeList / Letterboxd / by hand), on
 * disk, or both.
 *
 * Two stores feed it and neither is rewritten here:
 *  - the watch-tracking library (`shared/watchLibrary.ts`, `watch:list`) answers
 *    "what have I watched / am I watching / do I want to watch", and already knows
 *    which local files belong to which of its titles (`WatchTitleView.mediaItemIds`);
 *  - the media library (`window.api.listMedia()`) answers "what can I play".
 *
 * Local files no tracked title claims become their own untracked titles, grouped
 * into series by `buildLibraryEntries` exactly as the old library grid did, so a
 * folder of episodes is still one card. Everything below is pure and synchronous
 * so filtering and sorting stay instant over a 1,400-title MAL import.
 */

import type { MediaItem } from '../../../../shared/types';
import {
  watchKindForMediaCategory,
  type WatchKind,
  type WatchSource,
  type WatchStatus,
  type WatchTitleView,
} from '../../../../shared/watchLibrary';
import {
  buildLibraryEntries,
  isWatched,
  watchedFraction,
} from '../../../../shared/mediaLibraryEntries';

// ---------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------

/** The type switch: All · Anime · TV · Films · Other. */
export const GUM_TYPES = ['all', 'anime', 'tv', 'film', 'other'] as const;
export type GumTypeTab = (typeof GUM_TYPES)[number];

/** The status tabs. `watching` includes `rewatching`. */
export const GUM_STATUS_TABS = ['all', 'watching', 'plan', 'completed', 'on_hold', 'dropped'] as const;
export type GumStatusTab = (typeof GUM_STATUS_TABS)[number];

export const GUM_SORT_KEYS = [
  'title',
  'year',
  'score',
  'provider',
  'added',
  'lastWatched',
  'finished',
  'progress',
  'runtime',
  'episodes',
] as const;
export type GumSortKey = (typeof GUM_SORT_KEYS)[number];
export type GumSortDir = 'asc' | 'desc';

/** Where a title came from. `files` = on disk and not tracked anywhere yet. */
export type GumSource = WatchSource | 'files';
export const GUM_SOURCES: readonly GumSource[] = ['files', 'local', 'mal-export', 'mal-sync', 'letterboxd', 'manual'];

export type GumWatchState = 'unwatched' | 'progress' | 'finished';
export type GumLanguage = 'ja' | 'other' | 'unknown';
export type GumRuntimeBucket = 'short' | 'feature' | 'long';
export type GumEpisodeBucket = 'single' | 'short' | 'season' | 'long';
export type GumDatePreset = '7d' | '30d' | '90d' | '365d';

export const GUM_RUNTIME_BUCKETS: readonly GumRuntimeBucket[] = ['short', 'feature', 'long'];
export const GUM_EPISODE_BUCKETS: readonly GumEpisodeBucket[] = ['single', 'short', 'season', 'long'];
export const GUM_DATE_PRESETS: readonly GumDatePreset[] = ['7d', '30d', '90d', '365d'];
export const GUM_WATCH_STATES: readonly GumWatchState[] = ['unwatched', 'progress', 'finished'];
export const GUM_LANGUAGES: readonly GumLanguage[] = ['ja', 'other', 'unknown'];

export function isGumSortKey(value: unknown): value is GumSortKey {
  return typeof value === 'string' && (GUM_SORT_KEYS as readonly string[]).includes(value);
}
export function isGumStatusTab(value: unknown): value is GumStatusTab {
  return typeof value === 'string' && (GUM_STATUS_TABS as readonly string[]).includes(value);
}
export function isGumTypeTab(value: unknown): value is GumTypeTab {
  return typeof value === 'string' && (GUM_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export interface GumTitle {
  /** The watch id, or `local:<library entry id>` for files nothing tracks. */
  id: string;
  /** Null for an untracked local title — setting a status on it creates one. */
  watchId: string | null;
  kind: WatchKind;
  /** Anime whatever its kind: an anime film is `kind: 'film'`, `anime: true`. */
  anime: boolean;
  title: string;
  originalTitle?: string;
  year?: number;
  /**
   * Tracked status, or — for an untracked title — what its files say: some progress
   * reads `watching`, every episode watched reads `completed`, otherwise null.
   */
  status: WatchStatus | null;
  tracked: boolean;
  /** 0–10. */
  score?: number;
  /** 0.5–5 when rated in stars (Letterboxd). */
  stars?: number;
  /** Provider (MAL / AniList / TVmaze) score, 0–10. */
  providerScore?: number;
  genres: string[];
  /** A film's length, or a typical episode's, in minutes. */
  runtimeMin?: number;
  /** Total length: a film's runtime, or episode runtime × episodes. Sort key. */
  totalRuntimeMin?: number;
  episodeCount?: number;
  /** Episodes watched. */
  progress: number;
  /** 0–1 when the episode count is known. */
  progressRatio?: number;
  addedAt: number;
  lastWatchedAt?: number;
  /** Epoch ms. */
  finishedAt?: number;
  onDisk: boolean;
  /** Linked local video files, in library order. */
  items: MediaItem[];
  /** The media item whose artwork stands for the title, when there is a file. */
  artworkId: string | null;
  /** Poster path/URL the tracking library knows about (used when there is no file). */
  posterRef?: string;
  sources: GumSource[];
  /** Letterboxd lists, the user's own shelves and the file collections, merged. */
  lists: string[];
  liked: boolean;
  favorite: boolean;
  hasJa: boolean;
  hasEn: boolean;
  language: GumLanguage;
  watchState: GumWatchState;
  synopsis?: string;
  format?: string;
  malId?: number;
  anilistId?: number;
  /** Season numbers present on disk, ascending. */
  seasons: number[];
  /** A file that is started and not finished, if any — the "resume" target. */
  inProgressItem?: MediaItem;
  /** The tracking record behind a tracked title: history, ids, lists as stored. */
  view?: WatchTitleView;
}

const JAPANESE = /[\u3040-\u30ff\u3400-\u9fff]/u;

function isVideo(item: MediaItem): boolean {
  return item.kind !== 'audio' && item.kind !== 'audiobook';
}

/**
 * A local file the library shows: every video. Anime, TV and films are typed by
 * their category; lessons, personal clips and anything unsorted land under
 * "Other" rather than disappearing. Audio stays in Music and in All files.
 */
export function isWatchableItem(item: MediaItem): boolean {
  return isVideo(item);
}

function subtitleLangs(items: readonly MediaItem[]): { ja: boolean; en: boolean } {
  let ja = false;
  let en = false;
  for (const item of items) {
    for (const record of item.subtitles ?? []) {
      const lang = (record.lang ?? '').trim().toLowerCase();
      if (lang.startsWith('ja') || lang === 'jpn') ja = true;
      else if (lang.startsWith('en') || lang === 'eng') en = true;
    }
  }
  return { ja, en };
}

function average(values: number[]): number | undefined {
  if (!values.length) return undefined;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** Minutes of one unit (film, or a typical episode), from provider data first, then durations. */
function unitRuntime(kind: WatchKind, items: readonly MediaItem[], fallback?: number, episodeCount?: number): number | undefined {
  const provider = items.map((item) => item.runtimeMin).find((value): value is number => typeof value === 'number' && value > 0);
  if (provider) return provider;
  const durations = items
    .map((item) => item.durationSec)
    .filter((value): value is number => typeof value === 'number' && value > 0);
  if (durations.length) {
    const value = kind === 'film' ? Math.max(...durations) / 60 : (average(durations) ?? 0) / 60;
    return Math.round(value) || undefined;
  }
  if (fallback && kind !== 'film' && episodeCount) return Math.round(fallback / episodeCount) || undefined;
  return fallback;
}

function languageOf(anime: boolean, originalTitle: string | undefined, items: readonly MediaItem[]): GumLanguage {
  if (anime) return 'ja';
  if (originalTitle && JAPANESE.test(originalTitle)) return 'ja';
  const nativeTitle = items.find((item) => item.nativeTitle)?.nativeTitle;
  if (nativeTitle && JAPANESE.test(nativeTitle)) return 'ja';
  const langs = items.map((item) => (item.lang ?? '').trim().toLowerCase()).filter(Boolean);
  if (langs.some((lang) => lang.startsWith('ja') || lang === 'jpn')) return 'ja';
  if (langs.length) return 'other';
  return 'unknown';
}

function dateMs(value: string | undefined): number | undefined {
  if (!value) return undefined;
  const ms = Date.parse(value.length === 4 ? `${value}-01-01` : value.length === 7 ? `${value}-01` : value);
  return Number.isFinite(ms) ? ms : undefined;
}

function seasonsOf(items: readonly MediaItem[]): number[] {
  const seasons = new Set<number>();
  for (const item of items) if (typeof item.season === 'number') seasons.add(item.season);
  return [...seasons].sort((a, b) => a - b);
}

function inProgressOf(items: readonly MediaItem[]): MediaItem | undefined {
  return items
    .filter((item) => (item.positionSec ?? 0) > 0 && !isWatched(item))
    .sort((a, b) => (b.lastPlayedAt ?? 0) - (a.lastPlayedAt ?? 0))[0];
}

function watchStateOf(status: WatchStatus | null, progress: number, ratio: number | undefined, items: readonly MediaItem[]): GumWatchState {
  if (status === 'completed' || (ratio !== undefined && ratio >= 1)) return 'finished';
  if (progress > 0 || items.some((item) => (watchedFraction(item) ?? 0) > 0)) return 'progress';
  return 'unwatched';
}

function metadataItem(items: readonly MediaItem[]): MediaItem | undefined {
  return items.find((item) => item.metadataSource && item.metadataSource !== 'unmatched') ?? items[0];
}

function fromView(view: WatchTitleView, byId: ReadonlyMap<string, MediaItem>): GumTitle {
  const items = view.mediaItemIds
    .map((id) => byId.get(id))
    .filter((item): item is MediaItem => item !== undefined && isVideo(item));
  const meta = metadataItem(items);
  const subs = subtitleLangs(items);
  const anime = view.kind === 'anime' || view.anime === true;
  const episodeCount = view.episodeCount ?? meta?.episodeCount ?? (view.kind === 'film' ? 1 : undefined);
  const progress = view.progress ?? 0;
  const runtimeMin = unitRuntime(view.kind, items, view.runtime, episodeCount);
  const collections = items.flatMap((item) => item.collections ?? []);
  const providerScores = items.map((item) => item.rating).filter((value): value is number => typeof value === 'number' && value > 0);
  const status = view.status;
  const lastWatched = view.lastWatched ?? view.lastWatchedAt;
  const artwork = items.find((item) => item.posterPath) ?? items[0];
  return {
    id: view.id,
    watchId: view.id,
    kind: view.kind,
    anime,
    title: view.title,
    originalTitle: view.originalTitle ?? meta?.nativeTitle,
    year: view.year ?? meta?.year,
    status,
    tracked: true,
    score: view.score,
    stars: view.stars,
    providerScore: providerScores.length ? Math.max(...providerScores) : undefined,
    genres: view.allGenres,
    runtimeMin,
    totalRuntimeMin: view.kind === 'film' ? runtimeMin : view.runtime ?? (runtimeMin && episodeCount ? runtimeMin * episodeCount : undefined),
    episodeCount,
    progress,
    progressRatio: view.progressRatio,
    addedAt: view.addedAt,
    lastWatchedAt: lastWatched,
    finishedAt: dateMs(view.finishedAt),
    onDisk: items.length > 0,
    items,
    artworkId: artwork?.id ?? null,
    posterRef: view.poster ?? view.posterUrl,
    sources: [...view.sources],
    lists: uniq([...view.lists, ...collections]),
    liked: view.liked === true,
    favorite: view.favorite === true || items.some((item) => item.favorite === true),
    hasJa: subs.ja,
    hasEn: subs.en,
    language: languageOf(anime, view.originalTitle, items),
    watchState: watchStateOf(status, progress, view.progressRatio, items),
    synopsis: meta?.synopsis,
    format: view.format ?? meta?.format,
    malId: view.malId ?? meta?.malId,
    anilistId: view.anilistId ?? meta?.anilistId,
    seasons: seasonsOf(items),
    inProgressItem: inProgressOf(items),
    view,
  };
}

function uniq(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const key = value.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(value.trim());
  }
  return out;
}

/** Untracked titles: every watchable file no tracked title claims, grouped into series. */
function fromLocal(items: readonly MediaItem[]): GumTitle[] {
  return buildLibraryEntries(items).map((entry) => {
    const all = [...entry.items, ...entry.extras];
    const kind: WatchKind = watchKindForMediaCategory(entry.category, entry.primary.episodeKind) ?? 'other';
    const meta = metadataItem(all);
    const anime = kind === 'anime' || entry.category === 'anime';
    const subs = subtitleLangs(all);
    const watchedCount = entry.watchedCount;
    const episodeCount = meta?.episodeCount ?? entry.episodeCount;
    const started = all.some((item) => (item.positionSec ?? 0) > 0);
    const status: WatchStatus | null = entry.episodeCount > 0 && watchedCount >= entry.episodeCount
      ? 'completed'
      : started || watchedCount > 0
        ? 'watching'
        : null;
    const ratio = episodeCount ? Math.min(1, watchedCount / episodeCount) : undefined;
    const runtimeMin = unitRuntime(kind, all);
    const lastPlayed = all.reduce((max, item) => Math.max(max, item.lastPlayedAt ?? 0), 0) || undefined;
    const providerScores = all.map((item) => item.rating).filter((value): value is number => typeof value === 'number' && value > 0);
    return {
      id: `local:${entry.id}`,
      watchId: null,
      kind,
      anime,
      title: entry.title,
      originalTitle: meta?.nativeTitle,
      year: entry.year ?? undefined,
      status,
      tracked: false,
      providerScore: providerScores.length ? Math.max(...providerScores) : undefined,
      genres: uniq(all.flatMap((item) => item.genres ?? [])),
      runtimeMin,
      totalRuntimeMin: kind === 'film' ? runtimeMin : runtimeMin && episodeCount ? runtimeMin * episodeCount : undefined,
      episodeCount,
      progress: watchedCount,
      progressRatio: ratio,
      addedAt: entry.addedAt,
      lastWatchedAt: lastPlayed,
      finishedAt: status === 'completed' ? lastPlayed : undefined,
      onDisk: true,
      items: all,
      artworkId: entry.artworkItem.id,
      sources: ['files'],
      lists: uniq(all.flatMap((item) => item.collections ?? [])),
      liked: false,
      favorite: entry.favorite,
      hasJa: subs.ja,
      hasEn: subs.en,
      language: languageOf(anime, meta?.nativeTitle, all),
      watchState: watchStateOf(status, watchedCount, ratio, all),
      synopsis: meta?.synopsis,
      format: meta?.format,
      malId: meta?.malId,
      anilistId: meta?.anilistId,
      seasons: entry.seasons,
      inProgressItem: inProgressOf(all),
    };
  });
}

/**
 * Every title the library shows: tracked titles (with their files) plus the files
 * nothing tracks. A file is never in two titles.
 */
export function buildGumTitles(views: readonly WatchTitleView[], items: readonly MediaItem[]): GumTitle[] {
  const byId = new Map(items.map((item) => [item.id, item]));
  const claimed = new Set<string>();
  const tracked = views.map((view) => {
    for (const id of view.mediaItemIds) claimed.add(id);
    return fromView(view, byId);
  });
  const loose = items.filter((item) => !claimed.has(item.id) && isWatchableItem(item));
  return [...tracked, ...fromLocal(loose)];
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

/** Every combinable filter. Absent / empty = no constraint. */
export interface GumFilters {
  genres?: string[];
  yearMin?: number;
  yearMax?: number;
  /** My rating, 0–10, inclusive. */
  scoreMin?: number;
  scoreMax?: number;
  /** Only titles I have not rated. Overrides the score range. */
  unrated?: boolean;
  /** Provider rating floor, 0–10. */
  providerMin?: number;
  runtime?: GumRuntimeBucket[];
  episodes?: GumEpisodeBucket[];
  language?: GumLanguage[];
  sources?: GumSource[];
  /** true = on this PC, false = not downloaded. */
  onDisk?: boolean;
  watch?: GumWatchState[];
  subsJa?: boolean;
  subsEn?: boolean;
  liked?: boolean;
  favorite?: boolean;
  lists?: string[];
  added?: GumDatePreset;
  watched?: GumDatePreset;
}

export interface GumQuery {
  status: GumStatusTab;
  type: GumTypeTab;
  search?: string;
  filters: GumFilters;
}

const PRESET_MS: Record<GumDatePreset, number> = {
  '7d': 7 * 86_400_000,
  '30d': 30 * 86_400_000,
  '90d': 90 * 86_400_000,
  '365d': 365 * 86_400_000,
};

export function runtimeBucket(minutes: number | undefined): GumRuntimeBucket | undefined {
  if (!minutes) return undefined;
  if (minutes < 45) return 'short';
  if (minutes <= 150) return 'feature';
  return 'long';
}

export function episodeBucket(count: number | undefined): GumEpisodeBucket | undefined {
  if (!count) return undefined;
  if (count === 1) return 'single';
  if (count <= 13) return 'short';
  if (count <= 26) return 'season';
  return 'long';
}

export function matchesType(title: GumTitle, type: GumTypeTab): boolean {
  switch (type) {
    case 'all':
      return true;
    case 'anime':
      return title.anime;
    case 'tv':
      return title.kind === 'tv' && !title.anime;
    case 'film':
      return title.kind === 'film';
    case 'other':
      return title.kind === 'other' && !title.anime;
    default:
      return true;
  }
}

export function matchesStatus(title: GumTitle, status: GumStatusTab): boolean {
  if (status === 'all') return true;
  if (status === 'watching') return title.status === 'watching' || title.status === 'rewatching';
  return title.status === status;
}

/** Folded for search: case, width and diacritics. */
export function foldSearch(value: string): string {
  return value.normalize('NFKC').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').trim();
}

function searchHaystack(title: GumTitle): string {
  return foldSearch([title.title, title.originalTitle ?? '', ...title.items.slice(0, 1).map((item) => item.seriesTitle ?? '')].join('\n'));
}

function anyOf<T>(wanted: readonly T[] | undefined, value: T | undefined): boolean {
  if (!wanted?.length) return true;
  return value !== undefined && wanted.includes(value);
}

export function matchesGumFilters(title: GumTitle, filters: GumFilters, now: number): boolean {
  if (filters.genres?.length) {
    const want = new Set(filters.genres.map((genre) => genre.toLowerCase()));
    if (!title.genres.some((genre) => want.has(genre.toLowerCase()))) return false;
  }
  if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
    if (title.year === undefined) return false;
    if (filters.yearMin !== undefined && title.year < filters.yearMin) return false;
    if (filters.yearMax !== undefined && title.year > filters.yearMax) return false;
  }
  if (filters.unrated) {
    if (title.score !== undefined) return false;
  } else if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
    if (title.score === undefined) return false;
    if (filters.scoreMin !== undefined && title.score < filters.scoreMin) return false;
    if (filters.scoreMax !== undefined && title.score > filters.scoreMax) return false;
  }
  if (filters.providerMin !== undefined && (title.providerScore === undefined || title.providerScore < filters.providerMin)) return false;
  if (!anyOf(filters.runtime, runtimeBucket(title.runtimeMin))) return false;
  if (!anyOf(filters.episodes, episodeBucket(title.episodeCount))) return false;
  if (!anyOf(filters.language, title.language)) return false;
  if (filters.sources?.length && !title.sources.some((source) => filters.sources?.includes(source))) return false;
  if (filters.onDisk !== undefined && title.onDisk !== filters.onDisk) return false;
  if (!anyOf(filters.watch, title.watchState)) return false;
  if (filters.subsJa !== undefined && title.hasJa !== filters.subsJa) return false;
  if (filters.subsEn !== undefined && title.hasEn !== filters.subsEn) return false;
  if (filters.liked !== undefined && title.liked !== filters.liked) return false;
  if (filters.favorite !== undefined && title.favorite !== filters.favorite) return false;
  if (filters.lists?.length) {
    const want = new Set(filters.lists.map((list) => list.toLowerCase()));
    if (!title.lists.some((list) => want.has(list.toLowerCase()))) return false;
  }
  if (filters.added && title.addedAt < now - PRESET_MS[filters.added]) return false;
  if (filters.watched && (title.lastWatchedAt ?? 0) < now - PRESET_MS[filters.watched]) return false;
  return true;
}

/** Filter by status tab, type, search and every filter together. */
export function filterGumTitles(titles: readonly GumTitle[], query: GumQuery, now: number): GumTitle[] {
  const search = query.search ? foldSearch(query.search) : '';
  return titles.filter((title) => matchesStatus(title, query.status)
    && matchesType(title, query.type)
    && (!search || searchHaystack(title).includes(search))
    && matchesGumFilters(title, query.filters, now));
}

/** How many titles each status tab holds under the current type (and search), for the tab counts. */
export function countByStatus(titles: readonly GumTitle[], type: GumTypeTab, search?: string): Record<GumStatusTab, number> {
  const counts: Record<GumStatusTab, number> = { all: 0, watching: 0, plan: 0, completed: 0, on_hold: 0, dropped: 0 };
  const folded = search ? foldSearch(search) : '';
  for (const title of titles) {
    if (!matchesType(title, type)) continue;
    if (folded && !searchHaystack(title).includes(folded)) continue;
    counts.all += 1;
    for (const tab of GUM_STATUS_TABS) if (tab !== 'all' && matchesStatus(title, tab)) counts[tab] += 1;
  }
  return counts;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

const COLLATOR = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

function sortValue(title: GumTitle, key: GumSortKey): number | string | undefined {
  switch (key) {
    case 'title':
      return title.title;
    case 'year':
      return title.year;
    case 'score':
      return title.score;
    case 'provider':
      return title.providerScore;
    case 'added':
      return title.addedAt || undefined;
    case 'lastWatched':
      return title.lastWatchedAt;
    case 'finished':
      return title.finishedAt;
    case 'progress':
      return title.progressRatio ?? (title.progress > 0 ? 0 : undefined);
    case 'runtime':
      return title.totalRuntimeMin;
    case 'episodes':
      return title.episodeCount;
    default:
      return undefined;
  }
}

/**
 * A title with no value for the key sorts last in both directions — "unrated" is
 * not the lowest score — matching `queryWatchLibrary`'s rule. Ties fall back to the
 * title and then the id, so the order is total and stable.
 */
export function compareGumTitles(a: GumTitle, b: GumTitle, key: GumSortKey, dir: GumSortDir): number {
  const va = sortValue(a, key);
  const vb = sortValue(b, key);
  if (va === undefined && vb !== undefined) return 1;
  if (vb === undefined && va !== undefined) return -1;
  if (va !== undefined && vb !== undefined) {
    const cmp = typeof va === 'string' && typeof vb === 'string' ? COLLATOR.compare(va, vb) : (va as number) - (vb as number);
    if (cmp !== 0) return dir === 'desc' ? -cmp : cmp;
  }
  return COLLATOR.compare(a.title, b.title) || a.id.localeCompare(b.id);
}

export function sortGumTitles(titles: readonly GumTitle[], key: GumSortKey, dir: GumSortDir): GumTitle[] {
  return [...titles].sort((a, b) => compareGumTitles(a, b, key, dir));
}

/** The direction a key reads most naturally in, used when the viewer picks a new key. */
export function naturalDirection(key: GumSortKey): GumSortDir {
  return key === 'title' ? 'asc' : 'desc';
}

// ---------------------------------------------------------------------------
// Facets and active-filter chips
// ---------------------------------------------------------------------------

export interface GumFacets {
  genres: Array<{ name: string; count: number }>;
  lists: Array<{ name: string; count: number }>;
  years: { min: number; max: number } | null;
}

export function gumFacets(titles: readonly GumTitle[]): GumFacets {
  const genres = new Map<string, { name: string; count: number }>();
  const lists = new Map<string, { name: string; count: number }>();
  let min = Infinity;
  let max = -Infinity;
  const tally = (map: Map<string, { name: string; count: number }>, name: string): void => {
    const key = name.toLowerCase();
    const entry = map.get(key);
    if (entry) entry.count += 1;
    else map.set(key, { name, count: 1 });
  };
  for (const title of titles) {
    for (const genre of title.genres) tally(genres, genre);
    for (const list of title.lists) tally(lists, list);
    if (title.year !== undefined) {
      min = Math.min(min, title.year);
      max = Math.max(max, title.year);
    }
  }
  const byCount = (a: { name: string; count: number }, b: { name: string; count: number }): number =>
    b.count - a.count || COLLATOR.compare(a.name, b.name);
  return {
    genres: [...genres.values()].sort(byCount),
    lists: [...lists.values()].sort(byCount),
    years: Number.isFinite(min) ? { min, max } : null,
  };
}

/** One removable chip for one active constraint. `key`/`vars` resolve through i18n. */
export interface GumFilterChip {
  id: string;
  /** i18n key; absent when `label` is the text itself (a genre name is study content). */
  key?: string;
  vars?: Record<string, string | number>;
  label?: string;
}

export function activeFilterChips(filters: GumFilters): GumFilterChip[] {
  const chips: GumFilterChip[] = [];
  for (const genre of filters.genres ?? []) chips.push({ id: `genre:${genre}`, label: genre });
  if (filters.yearMin !== undefined || filters.yearMax !== undefined) {
    chips.push({ id: 'year', key: 'gum.chip.years', vars: { from: filters.yearMin ?? '…', to: filters.yearMax ?? '…' } });
  }
  if (filters.unrated) chips.push({ id: 'score', key: 'gum.chip.unrated' });
  else if (filters.scoreMin !== undefined || filters.scoreMax !== undefined) {
    chips.push({ id: 'score', key: 'gum.chip.myScore', vars: { from: filters.scoreMin ?? 0, to: filters.scoreMax ?? 10 } });
  }
  if (filters.providerMin !== undefined) chips.push({ id: 'provider', key: 'gum.chip.provider', vars: { min: filters.providerMin } });
  for (const bucket of filters.runtime ?? []) chips.push({ id: `runtime:${bucket}`, key: `gum.filter.runtime.${bucket}` });
  for (const bucket of filters.episodes ?? []) chips.push({ id: `episodes:${bucket}`, key: `gum.filter.episodes.${bucket}` });
  for (const lang of filters.language ?? []) chips.push({ id: `language:${lang}`, key: `gum.filter.language.${lang}` });
  for (const source of filters.sources ?? []) chips.push({ id: `source:${source}`, key: `gum.filter.source.${source}` });
  if (filters.onDisk !== undefined) chips.push({ id: 'onDisk', key: filters.onDisk ? 'gum.filter.onDisk' : 'gum.filter.notDownloaded' });
  for (const state of filters.watch ?? []) chips.push({ id: `watch:${state}`, key: `gum.filter.watch.${state}` });
  if (filters.subsJa !== undefined) chips.push({ id: 'subsJa', key: filters.subsJa ? 'gum.filter.subsJa' : 'gum.filter.noSubsJa' });
  if (filters.subsEn !== undefined) chips.push({ id: 'subsEn', key: filters.subsEn ? 'gum.filter.subsEn' : 'gum.filter.noSubsEn' });
  if (filters.liked !== undefined) chips.push({ id: 'liked', key: 'gum.filter.liked' });
  if (filters.favorite !== undefined) chips.push({ id: 'favorite', key: 'gum.filter.favorite' });
  for (const list of filters.lists ?? []) chips.push({ id: `list:${list}`, key: 'gum.chip.list', vars: { name: list } });
  if (filters.added) chips.push({ id: 'added', key: 'gum.chip.added', vars: { period: filters.added } });
  if (filters.watched) chips.push({ id: 'watched', key: 'gum.chip.watched', vars: { period: filters.watched } });
  return chips;
}

function without<T>(values: readonly T[] | undefined, value: T): T[] | undefined {
  const next = (values ?? []).filter((entry) => entry !== value);
  return next.length ? next : undefined;
}

/** Drops the constraint one chip stands for. Unknown ids are a no-op. */
export function removeFilterChip(filters: GumFilters, chipId: string): GumFilters {
  const [head, ...rest] = chipId.split(':');
  const value = rest.join(':');
  const next: GumFilters = { ...filters };
  switch (head) {
    case 'genre':
      next.genres = without(filters.genres, value);
      break;
    case 'year':
      delete next.yearMin;
      delete next.yearMax;
      break;
    case 'score':
      delete next.scoreMin;
      delete next.scoreMax;
      delete next.unrated;
      break;
    case 'provider':
      delete next.providerMin;
      break;
    case 'runtime':
      next.runtime = without(filters.runtime, value as GumRuntimeBucket);
      break;
    case 'episodes':
      next.episodes = without(filters.episodes, value as GumEpisodeBucket);
      break;
    case 'language':
      next.language = without(filters.language, value as GumLanguage);
      break;
    case 'source':
      next.sources = without(filters.sources, value as GumSource);
      break;
    case 'watch':
      next.watch = without(filters.watch, value as GumWatchState);
      break;
    case 'list':
      next.lists = without(filters.lists, value);
      break;
    case 'onDisk':
    case 'subsJa':
    case 'subsEn':
    case 'liked':
    case 'favorite':
    case 'added':
    case 'watched':
      delete next[head];
      break;
    default:
      return filters;
  }
  return compactFilters(next);
}

/** Drops empty arrays and undefined keys so "no filters" is always `{}`. */
export function compactFilters(filters: GumFilters): GumFilters {
  const out: GumFilters = {};
  for (const [key, value] of Object.entries(filters) as Array<[keyof GumFilters, unknown]>) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function hasGumFilters(filters: GumFilters): boolean {
  return Object.keys(compactFilters(filters)).length > 0;
}

/** Toggle one value in a multi-select filter. */
export function toggleFilterValue<K extends 'genres' | 'runtime' | 'episodes' | 'language' | 'sources' | 'watch' | 'lists'>(
  filters: GumFilters,
  key: K,
  value: NonNullable<GumFilters[K]>[number],
): GumFilters {
  const current = (filters[key] ?? []) as Array<typeof value>;
  const next = current.includes(value) ? current.filter((entry) => entry !== value) : [...current, value];
  return compactFilters({ ...filters, [key]: next });
}

// ---------------------------------------------------------------------------
// Presentation helpers
// ---------------------------------------------------------------------------

/** Episodes, by season, for a title's files — the title page's episode list. */
export function episodesBySeasonOf(title: GumTitle): Array<{ season: number; items: MediaItem[] }> {
  const map = new Map<number, MediaItem[]>();
  for (const item of title.items) {
    const season = item.season ?? 1;
    const list = map.get(season);
    if (list) list.push(item);
    else map.set(season, [item]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([season, items]) => ({
      season,
      items: [...items].sort((a, b) => (a.episode ?? Number.MAX_SAFE_INTEGER) - (b.episode ?? Number.MAX_SAFE_INTEGER)
        || COLLATOR.compare(a.fileName, b.fileName)),
    }));
}

/** The episode to play next: the in-progress one, else the first unwatched, else the first. */
export function nextEpisodeOf(title: GumTitle): MediaItem | undefined {
  if (title.inProgressItem) return title.inProgressItem;
  const ordered = episodesBySeasonOf(title).flatMap((season) => season.items);
  return ordered.find((item) => !isWatched(item)) ?? ordered[0];
}

/** "S1 · E3" / "E4" / null. */
export function gumEpisodeLabel(item: MediaItem | undefined): string | null {
  if (!item || typeof item.episode !== 'number') return null;
  return item.season && item.season > 1 ? `S${item.season} · E${item.episode}` : `E${item.episode}`;
}
