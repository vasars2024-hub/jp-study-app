/**
 * Metadata for the watch library — titles imported from Letterboxd or
 * MyAnimeList, or added by hand, which often have no file on disk at all.
 *
 * The media sweep (`mediaMetadata.ts`) only sees library *files*; a Letterboxd
 * diary of 800 films arrives here as 800 titles with a name, a year and a
 * Letterboxd URI, and nothing to show on a poster wall. This pass fills them
 * through `setWatchTitleMetadata`, which only fills gaps (never overwrites an
 * id, respects a user's own `kind`/`year`/`episodeCount`):
 *
 *   MAL titles (have `malId`)   AniList by MAL id — cover, banner, AniList id,
 *                               genres, episodes, runtime; Jikan if AniList
 *                               has no entry. One request per title.
 *   films (Letterboxd)          TMDB title+year search, then details — poster,
 *                               backdrop, runtime, genres, TMDB and IMDb ids.
 *                               Needs the user's TMDB key; without one the
 *                               title is left alone until a key is added.
 *   TV series                   TVmaze search (no key), plus TMDB's backdrop
 *                               when a key exists.
 *   anime added by hand         MyAnimeList, then AniList, by title.
 *
 * Throttling is the providers' own: every request goes through the same
 * module-level limiters the media sweep uses (Jikan 3/s·60/min, AniList
 * 2/s·60/min, TVmaze 2/s, TMDB 4/s, images 4/s), so the two passes can never
 * together exceed a provider's budget. The pass also waits while a media sweep
 * is running, so files the user is looking at get looked up first.
 *
 * A title that found nothing (or that no provider can serve) is not asked
 * again for {@link UNMATCHED_RETRY_MS}, unless a new provider appears — the
 * attempts live in `<userData>/watch-metadata-attempts.json` rather than on the
 * title, so the watch library's own document stays the tracking module's.
 */

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  METADATA_ACCEPT_CONFIDENCE,
  pickMetadataMatch,
  type MetadataMatch,
  type MetadataTarget,
} from '../shared/mediaMetadataMatch';
import { UNMATCHED_RETRY_MS, type MediaMetadataProviderId } from '../shared/mediaMetadataIpc';
import { watchTitleNeedsLookup, type WatchMetadataPatch, type WatchTitle } from '../shared/watchLibrary';
import {
  anilistById,
  anilistByMalId,
  anilistSearch,
  artworkName,
  downloadArtwork,
  jikanById,
  jikanSearch,
  type ProviderWork,
} from './mediaProviderClients';
import { findTvmazeShow, tvmazeShowById } from './providers/tvmaze';
import { findTmdbMovie, findTmdbTv, tmdbAvailable, tmdbMovieById } from './providers/tmdb';
import {
  listWatchTitlesNeedingLookup,
  mergeWatchLibraryDuplicates,
  onWatchLibraryChanged,
  readWatchLibrary,
  setWatchTitleMetadata,
} from './watchLibrary';

// ---------------------------------------------------------------------------
// Planning (pure)
// ---------------------------------------------------------------------------

export type WatchLookupStep =
  | 'anilist-by-mal'
  | 'anilist-by-id'
  | 'tvmaze-by-id'
  | 'tmdb-movie-by-id'
  | 'tmdb-movie-search'
  | 'tvmaze-search'
  | 'anime-search'
  | 'anime-film-search';

export interface WatchLookupPlan {
  step: WatchLookupStep;
  /** The providers the step can use — the attempt signature. */
  providers: MediaMetadataProviderId[];
}

/** Whether a title lacks anything a lookup could fill: an id, a poster, a wide image. */
export function watchTitleWantsMetadata(title: WatchTitle): boolean {
  return watchTitleNeedsLookup(title) || !title.posterPath || (!title.bannerPath && !title.backdropPath);
}

/**
 * How to look a title up, or `null` when nothing can: a film without a TMDB
 * key, or a title whose only id is one no provider here resolves (IMDb alone).
 * Ids first — a known id is exact; a title search is a guess to be scored.
 */
export function watchLookupPlan(title: WatchTitle, context: { tmdb: boolean }): WatchLookupPlan | null {
  const tmdb: MediaMetadataProviderId[] = context.tmdb ? ['tmdb'] : [];
  if (title.malId) return { step: 'anilist-by-mal', providers: ['anilist', 'jikan'] };
  if (title.anilistId) return { step: 'anilist-by-id', providers: ['anilist'] };
  if (title.tvmazeId) return { step: 'tvmaze-by-id', providers: ['tvmaze', ...tmdb] };
  if (title.tmdbId && title.tmdbType !== 'tv') return context.tmdb ? { step: 'tmdb-movie-by-id', providers: ['tmdb'] } : null;
  if (!watchTitleNeedsLookup(title)) return null;
  switch (title.kind) {
    case 'film':
      if (context.tmdb) return { step: 'tmdb-movie-search', providers: ['tmdb'] };
      if (title.anime) return { step: 'anime-search', providers: ['jikan', 'anilist'] };
      // No TMDB key: a Letterboxd film may still be an anime film ("Spirited
      // Away", "Your Name."), which AniList knows under every name — and that
      // is what lets it merge with the same film from a MAL list. Only an
      // exact year and a MOVIE format are accepted; anything else rests.
      return title.year ? { step: 'anime-film-search', providers: ['anilist'] } : null;
    case 'tv':
      return { step: 'tvmaze-search', providers: ['tvmaze', ...tmdb] };
    case 'anime':
      return { step: 'anime-search', providers: ['jikan', 'anilist'] };
    default:
      return null;
  }
}

export interface WatchAttempt {
  at: number;
  providers: string[];
}

/** Whether a previous attempt still covers this plan, so the title rests. */
export function watchAttemptRests(attempt: WatchAttempt | undefined, plan: WatchLookupPlan, now: number): boolean {
  if (!attempt) return false;
  if (plan.providers.some((provider) => !attempt.providers.includes(provider))) return false;
  return now - attempt.at < UNMATCHED_RETRY_MS;
}

/**
 * Minutes as the watch library means them: a film's length, a series' total
 * (the view derives the same total from linked files' durations).
 */
export function watchRuntimeMinutes(kind: WatchTitle['kind'], work: ProviderWork): number | undefined {
  if (!work.runtimeMin) return undefined;
  if (kind === 'film') return work.runtimeMin;
  return work.episodeCount ? work.runtimeMin * work.episodeCount : undefined;
}

// ---------------------------------------------------------------------------
// Attempt store
// ---------------------------------------------------------------------------

const ATTEMPTS_FILE = 'watch-metadata-attempts.json';

function attemptsPath(): string {
  return path.join(app.getPath('userData'), ATTEMPTS_FILE);
}

function readAttempts(): Record<string, WatchAttempt> {
  try {
    const raw = JSON.parse(fs.readFileSync(attemptsPath(), 'utf-8')) as { titles?: Record<string, WatchAttempt> };
    return raw && typeof raw.titles === 'object' && raw.titles ? raw.titles : {};
  } catch {
    return {};
  }
}

function writeAttempts(titles: Record<string, WatchAttempt>): void {
  try {
    const target = attemptsPath();
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, JSON.stringify({ version: 1, titles }), 'utf-8');
    fs.renameSync(temp, target);
  } catch {
    /* an unwritten attempt only means the title is asked again next time */
  }
}

// ---------------------------------------------------------------------------
// Looking one title up
// ---------------------------------------------------------------------------

interface Found {
  work: ProviderWork | null;
  /** The provider never answered: say nothing, so the next pass asks again. */
  down: boolean;
}

const confident = (match: MetadataMatch<ProviderWork> | null): ProviderWork | null =>
  match && match.confidence >= METADATA_ACCEPT_CONFIDENCE ? match.candidate : null;

async function findAnimeByTitle(target: MetadataTarget): Promise<Found> {
  const jikan = await jikanSearch(target.title);
  const fromJikan = confident(jikan?.length ? pickMetadataMatch(target, jikan) : null);
  if (fromJikan) return { work: fromJikan, down: false };
  const anilist = await anilistSearch(target.title);
  const fromAnilist = confident(anilist?.length ? pickMetadataMatch(target, anilist) : null);
  if (fromAnilist) return { work: fromAnilist, down: false };
  return { work: null, down: jikan === null || anilist === null };
}

async function lookupTitle(title: WatchTitle, plan: WatchLookupPlan, context: { tmdb: boolean }): Promise<Found> {
  const names = [title.originalTitle, ...(title.altTitles ?? [])];
  switch (plan.step) {
    case 'anilist-by-mal': {
      const malId = title.malId ?? 0;
      const anilist = await anilistByMalId(malId);
      if (anilist) return { work: anilist, down: false };
      // Not every MyAnimeList entry is on AniList; MAL itself has the poster.
      const jikan = await jikanById(malId);
      return { work: jikan, down: jikan === null };
    }
    case 'anilist-by-id': {
      const work = await anilistById(title.anilistId ?? 0);
      return { work, down: work === null };
    }
    case 'tvmaze-by-id': {
      const work = await tvmazeShowById(title.tvmazeId ?? 0);
      return { work: work ? await withTmdbBackdrop(work, title, context) : null, down: work === null };
    }
    case 'tmdb-movie-by-id': {
      const work = await tmdbMovieById(title.tmdbId ?? 0);
      return { work, down: work === null };
    }
    case 'tmdb-movie-search': {
      const found = await findTmdbMovie({ title: title.title, year: title.year ?? null, format: 'movie' }, names);
      return { work: confident(found.match), down: found.down };
    }
    case 'tvmaze-search': {
      const found = await findTvmazeShow({ title: title.title, year: title.year ?? null, format: 'tv' }, names);
      const work = confident(found.match);
      return { work: work ? await withTmdbBackdrop(work, title, context) : null, down: found.down };
    }
    case 'anime-film-search': {
      const found = await anilistSearch(title.title);
      const target: MetadataTarget = { title: title.title, year: title.year ?? null, format: 'movie' };
      const films = (found ?? []).filter((work) => work.year === title.year && /^movie$/i.test(work.format ?? ''));
      const work = confident(films.length ? pickMetadataMatch(target, films) : null);
      return { work, down: found === null };
    }
    case 'anime-search':
      return findAnimeByTitle({
        title: title.title,
        year: title.year ?? null,
        format: title.kind === 'film' ? 'movie' : 'tv',
        episodeCount: title.episodeCount ?? null,
      });
  }
}

/** A series' TMDB backdrop, which is curated where TVmaze's is not. */
async function withTmdbBackdrop(work: ProviderWork, title: WatchTitle, context: { tmdb: boolean }): Promise<ProviderWork> {
  if (!context.tmdb) return work;
  const found = await findTmdbTv({ title: work.displayTitle || title.title, year: work.year ?? title.year ?? null, format: 'tv' }, [title.title]);
  const tv = confident(found.match);
  if (!tv) return work;
  return {
    ...work,
    backdropUrl: tv.backdropUrl ?? work.backdropUrl,
    posterUrl: work.posterUrl ?? tv.posterUrl,
    tmdbId: work.tmdbId ?? tv.tmdbId,
    tmdbType: work.tmdbId ? work.tmdbType : tv.tmdbType,
  };
}

/** Downloads what the title lacks and builds the fill-only patch. */
async function patchFor(title: WatchTitle, work: ProviderWork): Promise<WatchMetadataPatch> {
  const meta: WatchMetadataPatch = {
    malId: work.malId,
    anilistId: work.anilistId,
    tvmazeId: work.tvmazeId,
    tmdbId: work.tmdbId,
    tmdbType: work.tmdbId !== undefined ? work.tmdbType : undefined,
    imdbId: work.imdbId,
  };
  if (!title.genres?.length && work.genres?.length) meta.genres = work.genres;
  if (!title.runtimeMinutes) meta.runtimeMinutes = watchRuntimeMinutes(title.kind, work);
  if (!title.episodeCount && title.kind !== 'film' && work.episodeCount) meta.episodeCount = work.episodeCount;
  if (!title.year && work.year) meta.year = work.year;
  if (!title.originalTitle && work.nativeTitle) meta.originalTitle = work.nativeTitle;
  // Every name the provider knows — English, romaji, native, synonyms — so the
  // matcher (and the re-merge after this pass) can see that MAL's "Sen to
  // Chihiro no Kamikakushi" is Letterboxd's "Spirited Away".
  if (work.englishTitle) meta.englishTitle = work.englishTitle;
  if (work.romajiTitle) meta.romajiTitle = work.romajiTitle;
  if (work.titles.length) meta.altTitles = work.titles;
  if ((work.provider === 'anilist' || work.provider === 'jikan') && !title.anime) meta.anime = true;

  const workKey = `${work.provider}:${work.id}`;
  const download = async (prefix: string, url: string | undefined): Promise<string | undefined> =>
    url ? (await downloadArtwork(url, artworkName(prefix, `watch:${title.id}`, `${workKey}|${url}`))) ?? undefined : undefined;
  if (!title.posterPath) meta.posterPath = await download('watch-poster', work.posterUrl);
  const backdrop = title.backdropPath ? undefined : await download('watch-backdrop', work.backdropUrl);
  if (backdrop) meta.backdropPath = backdrop;
  if (!title.bannerPath) {
    const banner = await download('watch-banner', work.bannerUrl);
    meta.bannerPath = banner ?? backdrop ?? title.backdropPath;
  }
  for (const key of Object.keys(meta) as Array<keyof WatchMetadataPatch>) {
    if (meta[key] === undefined) delete meta[key];
  }
  return meta;
}

// ---------------------------------------------------------------------------
// The pass
// ---------------------------------------------------------------------------

let running = false;
let cancelled = false;
let timer: NodeJS.Timeout | null = null;
let busy: () => boolean = () => false;
let unsubscribe: (() => void) | null = null;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface WatchMetadataResult {
  /** Titles a provider was asked about. */
  looked: number;
  /** Titles that received anything. */
  filled: number;
}

export function watchLibraryMetadataRunning(): boolean {
  return running;
}

export function cancelWatchLibraryMetadata(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (running) cancelled = true;
}

/** Runs one pass over every title that lacks metadata. Never throws. */
export async function runWatchLibraryMetadata(now: () => number = Date.now): Promise<WatchMetadataResult> {
  if (running) return { looked: 0, filled: 0 };
  running = true;
  cancelled = false;
  let looked = 0;
  let filled = 0;
  const attempts = readAttempts();
  let dirty = false;
  try {
    // Files first: a media sweep in flight has the user's attention, and both
    // passes draw on the same provider budgets.
    while (busy() && !cancelled) await delay(3_000);

    const context = { tmdb: tmdbAvailable() };
    // Folds freshly synced MAL rows into the document before it is read.
    listWatchTitlesNeedingLookup();
    const titles = readWatchLibrary().titles.filter(watchTitleWantsMetadata);

    for (const title of titles) {
      if (cancelled) break;
      const plan = watchLookupPlan(title, context);
      if (!plan || watchAttemptRests(attempts[title.id], plan, now())) continue;
      looked += 1;
      try {
        const found = await lookupTitle(title, plan, context);
        if (found.work) {
          const meta = await patchFor(title, found.work);
          if (Object.keys(meta).length > 0 && setWatchTitleMetadata(title.id, meta)) filled += 1;
        }
        if (found.work || !found.down) {
          attempts[title.id] = { at: now(), providers: plan.providers };
          dirty = true;
        }
      } catch {
        // One title that fails must not abandon the pass; it is asked again later.
      }
      if (dirty && looked % 10 === 0) {
        writeAttempts(attempts);
        dirty = false;
      }
    }
    // What the lookups just learnt (AniList ids, English and romaji names,
    // years) is what reveals two titles as one work. Folded even when this
    // pass filled nothing: an import can have brought the second copy.
    mergeWatchLibraryDuplicates(now());
  } catch {
    /* an unreadable watch library is the tracking module's to report */
  } finally {
    if (dirty) writeAttempts(attempts);
    running = false;
    cancelled = false;
  }
  return { looked, filled };
}

/** Debounced: an import that writes in bursts schedules one pass. */
export function scheduleWatchLibraryMetadata(delayMs = 3_000): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void runWatchLibraryMetadata();
  }, delayMs);
}

/**
 * Wires the pass: after every import, hand-added title or MAL sync, and once
 * shortly after launch. `isBusy` reports a running media sweep.
 */
export function registerWatchLibraryMetadata(isBusy: () => boolean): void {
  busy = isBusy;
  unsubscribe?.();
  unsubscribe = onWatchLibraryChanged((event) => {
    if (event.reason === 'import' || event.reason === 'add' || event.reason === 'mal-sync') {
      scheduleWatchLibraryMetadata();
    }
  });
  scheduleWatchLibraryMetadata(20_000);
}
