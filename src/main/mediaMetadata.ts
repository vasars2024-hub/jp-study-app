/**
 * The metadata sweep: group the library into titles, ask a provider about each,
 * score the answer, and apply it.
 *
 * Structured after `bookOcrJob.ts` — module-level `running`/`cancelled` sets, a
 * broadcast to every live window, cooperative cancellation checked at the top of
 * each unit of work, and a `finally` that always clears state. The unit of work
 * here is a *title*, not a file: a 26-episode folder is one provider lookup, and
 * the `running` set keyed by title is what stops a re-import or a second click
 * from starting a duplicate sweep.
 *
 * Four providers, one shape (`ProviderWork`):
 *
 *   anime        MyAnimeList (Jikan) then AniList, and every MyAnimeList match
 *                is enriched from AniList by its MAL id — the large cover, the
 *                banner and the AniList id subtitle search matches on. TVmaze
 *                answers what neither lists, and supplies per-episode stills.
 *   tv, drama    TVmaze first (Japanese live-action dramas live there), then the
 *                anime databases; a TVmaze answer that turns out to be Japanese
 *                animation hands the primary role to MyAnimeList/AniList.
 *   movie        TMDB with the user's key; MyAnimeList/AniList (as a film) when
 *                the files look like an anime release. Without a key a film gets
 *                its own art only — sidecar images or its MKV cover.
 *   any series   TMDB (with a key) for a better 16:9 backdrop.
 *
 * Which searches run, when an `unmatched` title is asked again, how episodes map
 * onto files and when a match may correct a guessed category are all decided in
 * `shared/mediaMetadataPlan.ts`, pure and unit-tested; match scoring is
 * `shared/mediaMetadataMatch.ts`, so a low-confidence answer is *flagged* rather
 * than silently trusted.
 *
 * Every write is followed by a `media:metadataUpdated` push naming the items, so
 * the renderer drops the frame grabs it memoized before the real poster existed.
 */

import { BrowserWindow, ipcMain } from 'electron';
import { mediaCategory, type MediaCategory } from '../shared/mediaCategories';
import {
  METADATA_ACCEPT_CONFIDENCE,
  formatFromReleaseKind,
  metadataMatchDisposition,
  pickMetadataMatch,
  scoreMetadataCandidate,
  type MetadataMatch,
  type MetadataTarget,
} from '../shared/mediaMetadataMatch';
import {
  EPISODE_GUIDE_LIMIT,
  estimateEtaMs,
  type MediaEpisodeGuideEntry,
  type MediaMetadataAttempt,
  type MediaMetadataPhase,
  type MediaMetadataProgress,
  type MediaMetadataProviderId,
  type MediaMetadataRequest,
  type MediaMetadataResult,
  type MediaMetadataSearchHit,
  type MediaMetadataUpdate,
} from '../shared/mediaMetadataIpc';
import {
  LOOKUP_CATEGORIES,
  correctedCategory,
  episodeGuideOf,
  lookupProviders,
  lookupSteps,
  mapEpisodesToFiles,
  resolveSeasonForWork,
  sweepDecision,
  type LookupCategory,
  type LookupContext,
  type LookupStep,
} from '../shared/mediaMetadataPlan';
import type { MediaItem } from '../shared/types';
import {
  anilistById,
  anilistByMalId,
  anilistSearch,
  artworkName,
  clearMetadataCache,
  downloadArtwork,
  jikanById,
  jikanEpisodeInfo,
  jikanSearch,
  type JikanEpisodeInfo,
  type ProviderEpisode,
  type ProviderWork,
} from './mediaProviderClients';
import { findTvmazeShow, tvmazeSearch, tvmazeShowById } from './providers/tvmaze';
import { findTmdbMovie, findTmdbTv, tmdbAvailable, tmdbMovieById, tmdbSearchMovie } from './providers/tmdb';
import { findLocalArtwork } from './mediaArtwork';
import {
  cancelWatchLibraryMetadata,
  registerWatchLibraryMetadata,
  scheduleWatchLibraryMetadata,
} from './watchLibraryMetadata';
import {
  filmFolderIdentity,
  hasAnimeReleaseHints,
  inferMediaCategory,
  providerSearchTitle,
} from '../shared/mediaFileIdentity';
import { normalizeMediaTitleKey } from '../shared/mediaIdentity';

/** Injected by `media.ts`, which owns the JSON store and the change broadcast. */
export interface MediaMetadataHost {
  listItems: () => MediaItem[];
  /** Applies a patch to every given id, persists once, and broadcasts. */
  patchItems: (ids: readonly string[], patch: Partial<MediaItem>) => void;
  /** Applies a *different* patch per id, still persisting and broadcasting once. */
  patchEachItem: (entries: ReadonlyArray<readonly [string, Partial<MediaItem>]>) => void;
}

let host: MediaMetadataHost | null = null;

/** Title keys with a sweep in flight, so a double-run cannot duplicate work. */
const running = new Set<string>();
/** Title keys asked to stop. */
const cancelled = new Set<string>();
/** True while a whole-library sweep is active, for the status channel. */
let sweeping = false;

function broadcast(progress: MediaMetadataProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mediaMetadata:progress', progress);
  }
}

/**
 * Tells every window which items a sweep just wrote, and whether their art
 * changed. The library memoizes artwork per id for the session, so without
 * this a card kept the frame grab it resolved before the sweep downloaded the
 * real poster, until the next launch.
 */
function broadcastUpdated(update: MediaMetadataUpdate): void {
  if (update.ids.length === 0) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('media:metadataUpdated', update);
  }
}

const ART_FIELDS = ['posterPath', 'bannerPath', 'backdropPath', 'stillPath'] as const;

interface TitleGroup {
  /** Unique per title: the series key, or for a film the key plus its year. */
  key: string;
  seriesKey: string;
  title: string;
  ids: string[];
  paths: string[];
  year: number | null;
  episodeCount: number;
  format: string | null;
  /** The category the lookup runs under. */
  category: LookupCategory;
  /** The category stored on the files, which differs when `inbox` was re-read. */
  storedCategory: MediaCategory;
  /** The file names look like an anime release. */
  animeHint: boolean;
  /** An explicit TMDB id from a `[tmdbid-…]` folder tag. */
  tmdbId?: number;
}

/**
 * The category a file is looked up under, or null for none.
 *
 * `inbox` is re-read with the release classifier: it is where the importer put
 * whatever it could not place, and a file the classifier now recognises — a
 * film in a `Title (Year)` folder, most often — is worth one lookup and a move
 * out of the inbox. Every other stored category is taken as it is.
 */
function lookupCategoryOf(item: MediaItem): { category: LookupCategory | null; stored: MediaCategory } {
  const stored = mediaCategory(item);
  if (LOOKUP_CATEGORIES.has(stored)) return { category: stored as LookupCategory, stored };
  if (stored === 'inbox' && item.kind !== 'audio' && item.kind !== 'audiobook') {
    const inferred = inferMediaCategory({ ...item, category: undefined });
    if (LOOKUP_CATEGORIES.has(inferred)) return { category: inferred as LookupCategory, stored };
  }
  return { category: null, stored };
}

/** What the importer would call this file with no stored category. */
function automaticCategory(item: MediaItem): MediaCategory | null {
  try {
    return inferMediaCategory({ ...item, category: undefined });
  } catch {
    return null;
  }
}

/**
 * Collapses the library into the titles worth looking up.
 *
 * Keyed on `seriesKey` because that is what the import parser already produced
 * and what the library groups by — asking per file would mean 26 identical
 * lookups for one show. A film is keyed on its title *and* year, so `Dune
 * (1984)` and `Dune (2021)` are two lookups, and a film in a `Title (Year)`
 * folder is looked up by the folder's name, which is the curated one.
 */
function groupTitles(items: readonly MediaItem[], only?: Set<string>): TitleGroup[] {
  const groups = new Map<string, TitleGroup>();
  for (const item of items) {
    if (only && !only.has(item.id)) continue;
    const { category, stored } = lookupCategoryOf(item);
    if (!category) continue;
    const seriesKey = item.seriesKey?.trim();
    // The same stored-title defect the provider searches had: `seriesTitle` is
    // written by whatever parser ran at import, so an acquired file can carry an
    // episode range into the one lookup that would give it a `malId` — and
    // without a `malId` the alias walk, the episode floor and Jimaku's exact
    // match are all dead for exactly the files this app downloads itself.
    let title = providerSearchTitle(item.seriesTitle?.trim() || item.title?.trim() || '');
    let year = typeof item.year === 'number' ? item.year : null;
    let key = seriesKey ?? '';
    let tmdbId: number | undefined;
    if (category === 'movie') {
      const folder = filmFolderIdentity(item.path);
      if (folder) {
        title = folder.title;
        year = year ?? folder.year;
        tmdbId = folder.tmdbId;
      }
      key = `movie:${normalizeMediaTitleKey(title) || seriesKey || item.id}:${year ?? ''}`;
    }
    if (!seriesKey || !title || !key) continue;

    const existing = groups.get(key);
    if (existing) {
      existing.ids.push(item.id);
      existing.paths.push(item.path);
      existing.episodeCount += 1;
      if (existing.year === null && year !== null) existing.year = year;
      existing.animeHint = existing.animeHint || hasAnimeReleaseHints(item);
      continue;
    }
    groups.set(key, {
      key,
      seriesKey,
      title,
      ids: [item.id],
      paths: [item.path],
      year,
      episodeCount: 1,
      format: formatFromReleaseKind(category === 'movie' ? 'movie' : item.episodeKind),
      category,
      storedCategory: stored,
      animeHint: hasAnimeReleaseHints(item),
      tmdbId,
    });
  }
  return [...groups.values()];
}

/** Whether a group already has metadata, so a non-forced sweep can skip it. */
function alreadyFetched(items: readonly MediaItem[], group: TitleGroup): boolean {
  const first = items.find((item) => item.id === group.ids[0]);
  return Boolean(first?.metadataUpdatedAt && first.metadataSource);
}

/**
 * A matched series still missing per-episode data.
 *
 * This is the outage case, and it used to be permanent: Jikan goes down, AniList
 * answers, the series gets stamped as fetched — but AniList carries no episode
 * titles, and `alreadyFetched` then skips the title forever. Since AniList *does*
 * hand back a MyAnimeList id, the missing piece is recoverable on its own without
 * re-running the match.
 */
function needsEpisodeBackfill(items: readonly MediaItem[], group: TitleGroup): boolean {
  const first = items.find((item) => item.id === group.ids[0]);
  // Needs a MyAnimeList id (the only source of episode titles), a settled match,
  // and no titles yet. An unmatched series has nothing to top up. A film has one
  // "episode", which is not worth a request.
  if (group.category === 'movie') return false;
  if (!first?.malId) return false;
  if (!first.metadataUpdatedAt || !first.metadataSource) return false;
  if (first.metadataSource === 'unmatched') return false;
  return Object.keys(first.episodeTitles ?? {}).length === 0;
}

/** Re-attempts only the episode fetch for an already-matched series. */
async function backfillEpisodes(group: TitleGroup, malId: number): Promise<boolean> {
  if (!host) return false;
  const info = await jikanEpisodeInfo(malId);
  if (Object.keys(info).length === 0) return false;

  const titles: Record<string, string> = {};
  for (const [number, entry] of Object.entries(info)) {
    if (entry.title) titles[number] = entry.title;
  }
  if (Object.keys(titles).length > 0) host.patchItems(group.ids, { episodeTitles: titles });

  const wanted = new Set(group.ids);
  const perEpisode: Array<readonly [string, Partial<MediaItem>]> = [];
  for (const item of host.listItems()) {
    if (!wanted.has(item.id) || typeof item.episode !== 'number') continue;
    const airedAt = info[String(item.episode)]?.airedAt;
    if (airedAt !== undefined && item.airedAt !== airedAt) {
      perEpisode.push([item.id, { airedAt }] as const);
    }
  }
  host.patchEachItem(perEpisode);
  if (Object.keys(titles).length > 0 || perEpisode.length > 0) {
    broadcastUpdated({ ids: group.ids, artwork: false });
  }
  return Object.keys(titles).length > 0 || perEpisode.length > 0;
}

// ---------------------------------------------------------------------------
// Searching
// ---------------------------------------------------------------------------

interface FindResult {
  match: MetadataMatch<ProviderWork> | null;
  /** The provider never answered, so an empty match says nothing about the title. */
  down: boolean;
}

const accepted = (match: MetadataMatch<ProviderWork> | null): boolean =>
  Boolean(match && match.confidence >= METADATA_ACCEPT_CONFIDENCE);

const better = (
  a: MetadataMatch<ProviderWork> | null,
  b: MetadataMatch<ProviderWork> | null,
): MetadataMatch<ProviderWork> | null => (b && (!a || b.confidence > a.confidence) ? b : a);

/**
 * Candidates for a title from the anime databases, and whether the empty ones
 * mean anything.
 *
 * `down` exists because the caller's response to an empty list used to be
 * *permanent*: it stamped `metadataSource: 'unmatched'`, and a minute of
 * provider outage cost the title its AniList id — and with it Jimaku's exact id
 * match — for good. The stamp now expires, but an outage is still not written
 * down as a fact about the title.
 *
 * Jikan first: it is the MyAnimeList data the user asked for, and it carries
 * per-episode titles. AniList only when Jikan returns nothing.
 *
 * `null` versus `[]` is a contract the clients keep — `jikanSearch`'s own doc
 * records it being measured live on 2026-08-16 with Jikan at 504 and AniList at
 * 403, where collapsing the two told the user their query had no results.
 */
async function searchAnimeCandidates(title: string): Promise<{ candidates: ProviderWork[]; down: boolean }> {
  const primary = await jikanSearch(title);
  if (primary && primary.length > 0) return { candidates: primary, down: false };
  const secondary = await anilistSearch(title);
  if (secondary && secondary.length > 0) return { candidates: secondary, down: false };
  // Empty. It only counts as evidence if *both* providers actually answered:
  // Jikan saying "nothing" while AniList is unreachable is not a settled answer,
  // because AniList is precisely the fallback that would have carried the match.
  return { candidates: [], down: primary === null || secondary === null };
}

/**
 * The best anime-database match for a target. When Jikan's candidates do not
 * reach the accept line, AniList's are scored too — its synonyms list often
 * carries the fansub spelling MyAnimeList lacks. `titles` are other names to
 * search by when the first finds nothing confident.
 */
async function findAnime(target: MetadataTarget, titles: ReadonlyArray<string | undefined> = []): Promise<FindResult> {
  const queries = [...new Set([target.title, ...titles].map((title) => (title ?? '').trim()).filter(Boolean))].slice(0, 2);
  let best: MetadataMatch<ProviderWork> | null = null;
  let down = false;
  for (const query of queries) {
    const scored = { ...target, title: query };
    const jikan = await jikanSearch(query);
    if (jikan?.length) best = better(best, pickMetadataMatch(scored, jikan));
    if (accepted(best)) return { match: best, down: false };
    const anilist = await anilistSearch(query);
    if (anilist?.length) best = better(best, pickMetadataMatch(scored, anilist));
    if (accepted(best)) return { match: best, down: false };
    if (jikan === null || anilist === null) down = true;
  }
  return { match: best, down: best ? false : down };
}

async function runStep(step: LookupStep, target: MetadataTarget, group: TitleGroup): Promise<FindResult> {
  switch (step) {
    case 'anime':
      return findAnime(target);
    case 'tvmaze':
      return findTvmazeShow(target);
    case 'tmdb-movie': {
      if (group.tmdbId) {
        // The folder names its TMDB id outright: nothing to score.
        const work = await tmdbMovieById(group.tmdbId);
        if (work) return { match: { candidate: work, confidence: 1, matchedTitle: work.displayTitle, reasons: ['id-tag'] }, down: false };
      }
      return findTmdbMovie(target);
    }
  }
}

/**
 * Runs the category's searches in order until one is confident; otherwise the
 * best reviewable answer any of them gave.
 */
async function lookup(group: TitleGroup, context: LookupContext): Promise<FindResult> {
  const target: MetadataTarget = {
    title: group.title,
    year: group.year,
    episodeCount: group.category === 'movie' ? null : group.episodeCount,
    format: group.format,
  };
  let best: MetadataMatch<ProviderWork> | null = null;
  let down = false;
  for (const step of lookupSteps(group.category, context)) {
    if (cancelled.has(group.key)) break;
    const found = await runStep(step, target, group);
    down = down || found.down;
    best = better(best, found.match);
    if (accepted(best)) return { match: best, down: false };
  }
  return { match: best, down: best ? false : down };
}

/** The provider answer for a manual correction. */
async function workByOverride(override: NonNullable<MediaMetadataRequest['override']>): Promise<ProviderWork | null> {
  switch (override.provider) {
    case 'anilist':
      return anilistById(override.id);
    case 'tvmaze':
      return tvmazeShowById(override.id);
    case 'tmdb':
      return tmdbMovieById(override.id);
    case 'jikan':
    default:
      return jikanById(override.id);
  }
}

/** The work a matched title was matched to, re-read by the id it already has. */
async function workByKnownIds(item: MediaItem): Promise<ProviderWork | null> {
  switch (item.metadataSource) {
    case 'jikan':
      return item.malId ? jikanById(item.malId) : null;
    case 'anilist':
      return item.anilistId ? anilistById(item.anilistId) : null;
    case 'tvmaze':
      return item.tvmazeId ? tvmazeShowById(item.tvmazeId) : null;
    case 'tmdb':
      return item.tmdbId && item.tmdbType !== 'tv' ? tmdbMovieById(item.tmdbId) : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Enrichment
// ---------------------------------------------------------------------------

const isAnimeDatabase = (work: ProviderWork): boolean => work.provider === 'jikan' || work.provider === 'anilist';

const japanese = (work: ProviderWork): boolean =>
  work.language === 'japanese' || work.language === 'ja' || work.country === 'JP';

/**
 * Fills the primary answer's gaps from a supplementary one. Identity fields
 * (provider, id, titles, format) always stay the primary's; `prefer` lets a
 * supplement *replace* the poster (AniList's cover is larger than
 * MyAnimeList's) or the backdrop (TMDB's are curated; TVmaze's are not).
 */
function mergeWork(
  primary: ProviderWork,
  supplement: ProviderWork,
  prefer: { poster?: boolean; backdrop?: boolean } = {},
): ProviderWork {
  const merged: ProviderWork = { ...primary };
  const fill = <K extends keyof ProviderWork>(key: K): void => {
    const current = merged[key];
    const empty = current === undefined || (Array.isArray(current) && current.length === 0);
    if (empty && supplement[key] !== undefined) merged[key] = supplement[key];
  };
  fill('malId');
  fill('anilistId');
  fill('tvmazeId');
  fill('imdbId');
  fill('nativeTitle');
  fill('synopsis');
  fill('year');
  fill('genres');
  fill('studio');
  fill('network');
  fill('runtimeMin');
  fill('relatedWorks');
  fill('relatedTitles');
  fill('country');
  fill('bannerUrl');
  if (merged.tmdbId === undefined && supplement.tmdbId !== undefined) {
    merged.tmdbId = supplement.tmdbId;
    merged.tmdbType = supplement.tmdbType;
  }
  merged.posterUrl = (prefer.poster ? supplement.posterUrl ?? primary.posterUrl : primary.posterUrl ?? supplement.posterUrl);
  merged.backdropUrl = (prefer.backdrop
    ? supplement.backdropUrl ?? primary.backdropUrl
    : primary.backdropUrl ?? supplement.backdropUrl);
  return merged;
}

/** A TVmaze run to lay over the files, and how strictly. */
interface EpisodeRun {
  episodes: ProviderEpisode[];
  /** The TVmaze season a MyAnimeList entry corresponds to, when resolved. */
  season: number | null;
  /** A supplementary run: never guess absolute order across seasons. */
  strict: boolean;
  workKey: string;
}

/** Everything a lookup settled on, before it is written down. */
interface Resolution {
  work: ProviderWork;
  confidence: number;
  /** MyAnimeList per-episode facts keyed by episode number (anime series). */
  malEpisodes: Record<string, JikanEpisodeInfo>;
  run: EpisodeRun | null;
  manual: boolean;
}

/**
 * Asks the supplementary providers what the primary answer lacks.
 *
 * Every step is conditional on a *confident* primary: enriching a reviewed guess
 * would decorate the wrong show with a second provider's certainty.
 */
async function enrich(
  group: TitleGroup,
  found: MetadataMatch<ProviderWork>,
  context: LookupContext,
  manual: boolean,
  emit: (phase: MediaMetadataPhase) => void,
): Promise<Resolution> {
  let work = found.candidate;
  const confident = found.confidence >= METADATA_ACCEPT_CONFIDENCE;
  const series = group.category !== 'movie';
  let tvmazeWork: ProviderWork | null = work.provider === 'tvmaze' ? work : null;

  // A scene-named anime found on TVmaze (`Frieren.S01E01.1080p.WEB`): the anime
  // databases carry the ids subtitle search needs, so they become the primary
  // answer and TVmaze stays on as the source of stills.
  if (confident && series && work.provider === 'tvmaze' && work.animation && japanese(work)) {
    const anime = await findAnime(
      { title: group.title, year: work.year ?? group.year, episodeCount: null, format: 'tv' },
      [work.displayTitle],
    );
    if (anime.match && accepted(anime.match)) work = anime.match.candidate;
  }

  // MyAnimeList answers with a poster and nothing wider; AniList, asked by the
  // MAL id, adds the large cover, the banner and the AniList id. One request.
  if (work.malId && !work.anilistId) {
    const anilist = await anilistByMalId(work.malId);
    if (anilist) work = mergeWork(work, anilist, { poster: true });
  }

  // TVmaze beside an anime-database answer: episode stills, the IMDb id and the
  // network — only for a confidently identified *animated* show of the same name.
  if (confident && series && !tvmazeWork && isAnimeDatabase(work)) {
    const tv = await findTvmazeShow(
      { title: group.title, year: work.year ?? group.year, episodeCount: null, format: 'tv' },
      [work.displayTitle, ...work.titles.slice(0, 3)],
    );
    if (tv.match && accepted(tv.match) && tv.match.candidate.animation) tvmazeWork = tv.match.candidate;
  }
  if (tvmazeWork && tvmazeWork !== work) work = mergeWork(work, tvmazeWork);

  if (!series && confident) {
    if (work.provider === 'tmdb' && work.animation && japanese(work)) {
      // A Japanese animated film: the anime databases hold its MAL/AniList ids.
      const anime = await findAnime(
        { title: group.title, year: work.year ?? group.year, format: 'movie' },
        [work.displayTitle, work.nativeTitle],
      );
      if (anime.match && accepted(anime.match)) {
        let animeWork = anime.match.candidate;
        if (animeWork.malId && !animeWork.anilistId) {
          const anilist = await anilistByMalId(animeWork.malId);
          if (anilist) animeWork = mergeWork(animeWork, anilist, { poster: true });
        }
        work = mergeWork(work, animeWork);
      }
    } else if (isAnimeDatabase(work) && context.tmdb) {
      // An anime film matched on MyAnimeList: TMDB has its backdrop and runtime.
      const film = await findTmdbMovie(
        { title: work.displayTitle || group.title, year: work.year ?? group.year, format: 'movie' },
        [group.title, ...work.titles.slice(0, 3)],
      );
      if (film.match && accepted(film.match)) work = mergeWork(work, film.match.candidate, { backdrop: true });
    }
  } else if (series && confident && context.tmdb) {
    // TMDB's backdrops are curated; TVmaze's backgrounds and AniList's strips
    // are not always there. One search for the series' art and id.
    const tv = await findTmdbTv(
      { title: group.title, year: work.year ?? group.year, format: 'tv' },
      [work.displayTitle, ...work.titles.slice(0, 2)],
    );
    if (tv.match && accepted(tv.match)) work = mergeWork(work, tv.match.candidate, { backdrop: true });
  }

  // Episode titles are MyAnimeList-only and one extra request, so they are
  // fetched only when the match is solid — a wrong show's episode names are
  // more misleading than none at all.
  let malEpisodes: Record<string, JikanEpisodeInfo> = {};
  if (series && work.malId && confident) {
    emit('fetching-episodes');
    malEpisodes = await jikanEpisodeInfo(work.malId);
  }

  let run: EpisodeRun | null = null;
  if (series && confident && tvmazeWork?.episodes?.length) {
    const primary = work.provider === 'tvmaze';
    run = {
      episodes: tvmazeWork.episodes,
      season: primary ? null : resolveSeasonForWork(tvmazeWork.episodes, work.year, work.episodeCount),
      strict: !primary,
      workKey: `tvmaze:${tvmazeWork.id}`,
    };
  }

  return { work, confidence: found.confidence, malEpisodes, run, manual };
}

// ---------------------------------------------------------------------------
// Writing it down
// ---------------------------------------------------------------------------

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null || value === '') return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as object).length === 0;
  return false;
}

/** Drops undefined keys, so a patch never clobbers a good value with nothing. */
function compact<T extends object>(patch: T): T {
  for (const key of Object.keys(patch) as Array<keyof T>) {
    if (patch[key] === undefined) delete patch[key];
  }
  return patch;
}

/** Art-name key for one image: the work and the URL, so a new image is a new file. */
function artKey(workKey: string, url: string): string {
  return `${workKey}|${url}`;
}

interface Written {
  patch: Partial<MediaItem>;
  perFile: Array<readonly [string, Partial<MediaItem>]>;
}

/**
 * Turns a resolution into the shared patch and the per-file patches.
 *
 * `fill` is the top-up mode: the match stands, and only fields the title does
 * not have yet are written — so a newly available provider adds a banner
 * without rewriting a synopsis the user has been reading for a month.
 *
 * `replace` is a forced refresh or a manual correction: whatever the previous
 * match left that this one does not supply — its ids, its backdrop, its episode
 * stills — is cleared, because a re-match to a different show keeping the old
 * show's art is exactly what the user was trying to correct.
 */
type PatchMode = 'normal' | 'fill' | 'replace';

/** Fields a match owns, cleared by a `replace` when the new match lacks them. */
const MATCH_OWNED: ReadonlyArray<keyof MediaItem> = [
  'nativeTitle', 'synopsis', 'status', 'episodeCount', 'genres', 'studio', 'rating', 'rank',
  'relatedTitles', 'relatedWorks', 'malId', 'anilistId', 'tvmazeId', 'tmdbId', 'tmdbType', 'imdbId',
  'runtimeMin', 'network', 'episodeTitles', 'episodeGuide', 'posterPath', 'bannerPath', 'backdropPath',
];
const FILE_OWNED: ReadonlyArray<keyof MediaItem> = ['stillPath', 'episodeTitles', 'airedAt'];

async function buildPatch(
  group: TitleGroup,
  resolution: Resolution,
  context: LookupContext,
  mode: PatchMode,
  emit: (phase: MediaMetadataPhase) => void,
): Promise<Written> {
  const fillOnly = mode === 'fill';
  const { work, confidence } = resolution;
  const confident = confidence >= METADATA_ACCEPT_CONFIDENCE;
  const items = new Map((host?.listItems() ?? []).map((item) => [item.id, item] as const));
  const first = items.get(group.ids[0] ?? '');

  // Category: `inbox` re-read by the classifier, then whatever a confident
  // match proves about a category the importer guessed.
  let category: MediaCategory = group.category;
  if (first) {
    const corrected = correctedCategory(group.category, automaticCategory(first), {
      provider: work.provider,
      animation: work.animation,
      language: work.language,
      country: work.country,
      showType: work.showType,
    }, confidence);
    if (corrected) category = corrected;
  }

  const attempt: MediaMetadataAttempt = {
    at: Date.now(),
    category,
    providers: lookupProviders(LOOKUP_CATEGORIES.has(category) ? category as LookupCategory : group.category, context),
  };
  if (resolution.manual) attempt.manual = true;

  const patch: Partial<MediaItem> = {
    seriesTitle: work.displayTitle || group.title,
    nativeTitle: work.nativeTitle,
    synopsis: work.synopsis,
    year: work.year,
    format: work.format,
    status: work.status,
    episodeCount: work.episodeCount,
    genres: work.genres?.length ? work.genres : undefined,
    studio: work.studio,
    rating: work.rating,
    rank: work.rank,
    relatedTitles: work.relatedTitles?.length ? work.relatedTitles : undefined,
    relatedWorks: work.relatedWorks?.length ? work.relatedWorks : undefined,
    malId: work.malId,
    anilistId: work.anilistId,
    tvmazeId: work.tvmazeId,
    tmdbId: work.tmdbId,
    tmdbType: work.tmdbId !== undefined ? work.tmdbType : undefined,
    imdbId: work.imdbId,
    runtimeMin: work.runtimeMin,
    network: work.network,
    metadataSource: work.provider,
    metadataUpdatedAt: Date.now(),
    metadataConfidence: confidence,
    metadataAttempt: attempt,
  };
  if (category !== group.storedCategory) patch.category = category;

  // Episodes: MyAnimeList's list for an anime entry (its numbering is the
  // files'), TVmaze's run for a TVmaze show.
  const malTitles: Record<string, string> = {};
  for (const [number, entry] of Object.entries(resolution.malEpisodes)) {
    if (entry.title) malTitles[number] = entry.title;
  }
  if (Object.keys(malTitles).length > 0) patch.episodeTitles = malTitles;

  const files = group.ids
    .map((id) => items.get(id))
    .filter((item): item is MediaItem => Boolean(item))
    .map((item) => ({ id: item.id, season: item.season, episode: item.episode }));
  const mapping = resolution.run
    ? mapEpisodesToFiles(files, resolution.run.episodes, { season: resolution.run.season, strict: resolution.run.strict })
    : null;

  let guide: MediaEpisodeGuideEntry[] = [];
  if (Object.keys(resolution.malEpisodes).length > 0) {
    guide = episodeGuideOf(
      Object.entries(resolution.malEpisodes).map(([number, entry]) => ({
        number: Number(number),
        title: entry.title,
        airedAt: entry.airedAt,
      })).filter((entry) => Number.isFinite(entry.number)),
      EPISODE_GUIDE_LIMIT,
    );
  } else if (resolution.run) {
    const { episodes, season, strict } = resolution.run;
    const scoped = strict ? episodes.filter((episode) => season !== null && (episode.season ?? 1) === season) : episodes;
    guide = episodeGuideOf(scoped, EPISODE_GUIDE_LIMIT);
  }
  if (confident && guide.length > 0) patch.episodeGuide = guide;

  // Art. Skipped for what a top-up title already has, so an existing poster is
  // never re-downloaded just to be discarded by the fill-only filter below.
  emit('downloading-art');
  const workKey = `${work.provider}:${work.id}`;
  const have = (field: 'posterPath' | 'bannerPath' | 'backdropPath'): boolean => fillOnly && Boolean(first?.[field]);
  if (work.posterUrl && !have('posterPath')) {
    const poster = await downloadArtwork(work.posterUrl, artworkName('poster', group.seriesKey, artKey(workKey, work.posterUrl)));
    if (poster) patch.posterPath = poster;
  }
  let banner: string | undefined;
  if (work.bannerUrl && !have('bannerPath')) {
    banner = (await downloadArtwork(work.bannerUrl, artworkName('banner', group.seriesKey, artKey(workKey, work.bannerUrl)))) ?? undefined;
  }
  if (work.backdropUrl && !have('backdropPath')) {
    const backdrop = await downloadArtwork(work.backdropUrl, artworkName('backdrop', group.seriesKey, artKey(workKey, work.backdropUrl)));
    if (backdrop) patch.backdropPath = backdrop;
  }
  // The hero: a purpose-made banner strip first, else the 16:9 backdrop.
  const hero = banner ?? patch.backdropPath ?? (fillOnly ? first?.backdropPath : undefined);
  if (hero) patch.bannerPath = hero;

  // A replaced match must not count the old match's art as "already there".
  await addLocalArt(group, patch, mode === 'replace' ? undefined : first);

  // Per file: air dates, the file's own still, and — when MyAnimeList supplied
  // none — its season's episode titles from TVmaze.
  const perFile: Array<readonly [string, Partial<MediaItem>]> = [];
  for (const file of files) {
    const item = items.get(file.id);
    if (!item) continue;
    const own: Partial<MediaItem> = {};
    const mal = typeof file.episode === 'number' ? resolution.malEpisodes[String(file.episode)] : undefined;
    const episode = confident ? mapping?.byFile.get(file.id) : undefined;
    const airedAt = mal?.airedAt ?? episode?.airedAt;
    if (airedAt !== undefined && item.airedAt !== airedAt && !(fillOnly && item.airedAt !== undefined)) own.airedAt = airedAt;
    if (confident && !patch.episodeTitles) {
      const titles = mapping?.titlesByFile.get(file.id);
      if (titles && !(fillOnly && !isEmptyValue(item.episodeTitles))) own.episodeTitles = titles;
    }
    if (episode?.stillUrl && resolution.run && !(fillOnly && item.stillPath)) {
      if (cancelled.has(group.key)) break;
      const still = await downloadArtwork(
        episode.stillUrl,
        artworkName('still', group.seriesKey, artKey(resolution.run.workKey, episode.stillUrl)),
      );
      if (still && still !== item.stillPath) own.stillPath = still;
    }
    if (mode === 'replace') {
      for (const key of FILE_OWNED) {
        if (own[key] === undefined && item[key] !== undefined && !(key === 'episodeTitles' && patch.episodeTitles)) {
          (own as Record<string, unknown>)[key] = undefined;
        }
      }
    }
    if (Object.keys(own).length > 0) perFile.push([file.id, own] as const);
  }

  compact(patch);
  if (mode === 'replace' && first) {
    // Written as explicit `undefined`, which the store's JSON drops.
    for (const key of MATCH_OWNED) {
      if (patch[key] === undefined && first[key] !== undefined) (patch as Record<string, unknown>)[key] = undefined;
    }
  }
  if (fillOnly && first) {
    // Top-up: the match and its bookkeeping stand; only gaps are filled.
    delete patch.metadataSource;
    delete patch.metadataUpdatedAt;
    delete patch.metadataConfidence;
    for (const key of Object.keys(patch) as Array<keyof MediaItem>) {
      if (key === 'metadataAttempt' || key === 'category') continue;
      if (!isEmptyValue(first[key])) delete patch[key];
    }
  }
  return { patch, perFile };
}

/**
 * The files' own art for whatever the providers left empty: a sidecar
 * `poster.jpg`/`fanart.jpg`, or the cover inside an MKV. This is the whole of a
 * film's art without a TMDB key.
 */
async function addLocalArt(group: TitleGroup, patch: Partial<MediaItem>, first: MediaItem | undefined): Promise<void> {
  const wantPoster = !patch.posterPath && !first?.posterPath;
  const wantBackdrop = !patch.bannerPath && !first?.bannerPath;
  if (!wantPoster && !wantBackdrop) return;
  try {
    const local = await findLocalArtwork({ files: group.paths, want: { poster: wantPoster, backdrop: wantBackdrop } });
    if (local.posterPath && wantPoster) patch.posterPath = local.posterPath;
    if (local.backdropPath && wantBackdrop) {
      patch.backdropPath = patch.backdropPath ?? local.backdropPath;
      patch.bannerPath = local.backdropPath;
    }
  } catch {
    /* local art is a bonus; a file ffmpeg cannot read keeps its frame grab */
  }
}

/** Whether any art field differs between the patches and the stored items. */
function artChanged(
  ids: readonly string[],
  patch: Partial<MediaItem>,
  perFile: ReadonlyArray<readonly [string, Partial<MediaItem>]>,
  before: ReadonlyMap<string, MediaItem>,
): boolean {
  // `in`, not `!== undefined`: a replaced match clears art with an explicit
  // undefined, and a card still showing the old show's poster must re-ask too.
  const changes = (own: Partial<MediaItem>, item: MediaItem | undefined): boolean =>
    ART_FIELDS.some((field) => field in own && own[field] !== item?.[field]);
  return ids.some((id) => changes(patch, before.get(id)))
    || perFile.some(([id, own]) => changes(own, before.get(id)));
}

// ---------------------------------------------------------------------------
// The sweep
// ---------------------------------------------------------------------------

export function cancelMediaMetadata(seriesKey?: string): void {
  if (seriesKey) {
    if (running.has(seriesKey)) cancelled.add(seriesKey);
    return;
  }
  for (const key of running) cancelled.add(key);
  // "Stop everything" includes the watch-library pass the sweep hands off to.
  cancelWatchLibraryMetadata();
}

export function mediaMetadataRunning(): boolean {
  return sweeping || running.size > 0;
}

export async function runMediaMetadata(request: MediaMetadataRequest = {}): Promise<MediaMetadataResult> {
  if (!host) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'Media metadata host is not registered.' };
  if (sweeping) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'A metadata sweep is already running.' };

  // Claimed before the first `await`. The backfill pass below awaits, so leaving
  // the flag until after it would let a second caller slip past the guard above
  // and run the same rate-limited requests concurrently.
  sweeping = true;
  try {
    return await sweep(request);
  } finally {
    sweeping = false;
    running.clear();
    cancelled.clear();
    // Then the watch library's titles (Letterboxd/MAL imports, often with no
    // file): after the launch sweep, and after a TMDB key re-opened the films.
    if (!request.mediaIds?.length && !request.override) scheduleWatchLibraryMetadata(5_000);
  }
}

/**
 * lookup   search the providers;
 * topup    re-read the matched work by its id and fill only what is missing;
 * refresh  re-read the matched work by its id and rewrite it (a forced refresh
 *          of a manual correction, which must not be re-searched).
 */
type JobMode = 'lookup' | 'topup' | 'refresh';

interface Job {
  group: TitleGroup;
  mode: JobMode;
}

async function sweep(request: MediaMetadataRequest): Promise<MediaMetadataResult> {
  if (!host) return { ok: false, matched: 0, review: 0, unmatched: 0, error: 'Media metadata host is not registered.' };

  const items = host.listItems();
  const byId = new Map(items.map((item) => [item.id, item] as const));
  const only = request.mediaIds?.length ? new Set(request.mediaIds) : undefined;
  const allGroups = groupTitles(items, only);
  // Read once per sweep: the key cannot change mid-sweep in any way that matters.
  const tmdb = tmdbAvailable();
  const contextOf = (group: TitleGroup): LookupContext => ({ tmdb, animeHint: group.animeHint });
  const now = Date.now();

  const jobs: Job[] = [];
  // Series that are matched but missing episode data — topped up separately,
  // because they need one cheap request rather than a whole re-match.
  let backfill: TitleGroup[] = [];
  for (const group of allGroups) {
    const first = byId.get(group.ids[0] ?? '');
    if (request.override) {
      jobs.push({ group, mode: 'lookup' });
    } else if (request.force) {
      // A forced refresh re-searches — except a manual correction, which is
      // re-read by the id the user chose rather than second-guessed.
      jobs.push({ group, mode: first?.metadataAttempt?.manual ? 'refresh' : 'lookup' });
    } else if (first) {
      const decision = sweepDecision(first, group.category, lookupProviders(group.category, contextOf(group)), now);
      if (decision !== 'skip') jobs.push({ group, mode: decision });
    }
  }
  if (!request.force && !request.override) {
    backfill = allGroups.filter((group) => needsEpisodeBackfill(items, group));
  }

  for (const group of backfill) {
    const malId = byId.get(group.ids[0] ?? '')?.malId;
    if (!malId) continue;
    try {
      await backfillEpisodes(group, malId);
    } catch {
      // Still down: nothing is stamped, so the next sweep tries again.
    }
  }

  if (jobs.length === 0) return { ok: true, matched: 0, review: 0, unmatched: 0 };

  const startedAt = Date.now();
  let matched = 0;
  let review = 0;
  let unmatched = 0;
  let done = 0;

  for (const { group, mode } of jobs) {
    if (running.has(group.key)) continue;
    running.add(group.key);
    cancelled.delete(group.key);

    const emit = (phase: MediaMetadataPhase, extra: Partial<MediaMetadataProgress> = {}): void =>
      broadcast({
        seriesKey: group.key,
        title: group.title,
        phase,
        done,
        total: jobs.length,
        etaMs: estimateEtaMs(done, jobs.length, Date.now() - startedAt),
        ...extra,
      });

    try {
      if (cancelled.has(group.key)) {
        emit('cancelled');
        continue;
      }
      const outcome = await processGroup(group, mode, request, contextOf(group), emit);
      if (outcome === 'cancelled') {
        emit('cancelled');
        continue;
      }
      if (outcome.kind === 'matched') matched += 1;
      else if (outcome.kind === 'review') review += 1;
      else if (outcome.kind === 'unmatched') unmatched += 1;
      done += 1;
      emit('done', { confidence: outcome.confidence });
    } catch (error) {
      // One title that fails must not abandon the rest of the sweep.
      unmatched += 1;
      done += 1;
      emit('error', { error: error instanceof Error ? error.message : String(error) });
    } finally {
      running.delete(group.key);
      cancelled.delete(group.key);
    }
  }

  return { ok: true, matched, review, unmatched };
}

type GroupOutcome =
  | 'cancelled'
  | { kind: 'matched' | 'review' | 'unmatched' | 'skipped'; confidence: number };

/** Writes a patch set, then tells the renderer which items (and whether art) changed. */
function write(group: TitleGroup, written: Written, before: ReadonlyMap<string, MediaItem>): void {
  if (!host) return;
  const touched = Object.keys(written.patch).length > 0;
  if (touched) host.patchItems(group.ids, written.patch);
  host.patchEachItem(written.perFile);
  if (touched || written.perFile.length > 0) {
    broadcastUpdated({ ids: group.ids, artwork: artChanged(group.ids, written.patch, written.perFile, before) });
  }
}

async function processGroup(
  group: TitleGroup,
  mode: JobMode,
  request: MediaMetadataRequest,
  context: LookupContext,
  emit: (phase: MediaMetadataPhase, extra?: Partial<MediaMetadataProgress>) => void,
): Promise<GroupOutcome> {
  if (!host) return { kind: 'skipped', confidence: 0 };
  const before = new Map(host.listItems().map((item) => [item.id, item] as const));
  const first = before.get(group.ids[0] ?? '');

  emit('searching');
  let found: MetadataMatch<ProviderWork> | null = null;
  // Set when the providers never answered, so an empty result is not written
  // down as a fact about the title.
  let down = false;
  const byKnownId = mode === 'topup' || mode === 'refresh';
  const manual = Boolean(request.override) || (byKnownId && Boolean(first?.metadataAttempt?.manual));

  if (request.override) {
    // A manual correction is the user's decision, so it is applied at full
    // confidence without re-scoring it against the file name.
    const work = await workByOverride(request.override);
    if (work) found = { candidate: work, confidence: 1, matchedTitle: work.displayTitle, reasons: ['manual'] };
  } else if (byKnownId) {
    const work = first ? await workByKnownIds(first) : null;
    if (!work) {
      // The id's provider did not answer (or there is no id to ask by). Nothing
      // is stamped, so the next sweep tries again.
      return { kind: 'skipped', confidence: first?.metadataConfidence ?? 0 };
    }
    found = { candidate: work, confidence: first?.metadataConfidence ?? 1, matchedTitle: work.displayTitle, reasons: ['known-id'] };
  } else {
    const search = await lookup(group, context);
    found = search.match;
    down = search.down;
    if (cancelled.has(group.key)) return 'cancelled';
    emit('matching');
  }

  const disposition = found ? metadataMatchDisposition(found.confidence) : 'reject';
  // A title re-read by its id keeps its match whatever the stored confidence
  // says; only a search can conclude a title is unmatched.
  if (byKnownId && (!found || disposition === 'reject')) return { kind: 'skipped', confidence: found?.confidence ?? 0 };
  if (!found || disposition === 'reject') {
    const confidence = found?.confidence ?? 0;
    const nothingToAsk = lookupSteps(group.category, context).length === 0;
    const patch: Partial<MediaItem> = {};
    const attempt: MediaMetadataAttempt = {
      at: Date.now(),
      category: group.category,
      providers: lookupProviders(group.category, context),
    };
    if (nothingToAsk) {
      // A film without a TMDB key: nobody was asked, so nothing is claimed
      // about the title. The attempt alone lets a key added later re-open it.
      patch.metadataAttempt = attempt;
      if (group.category !== group.storedCategory) patch.category = group.category;
    } else if (!down) {
      // Stamped so a later sweep does not re-ask a title that has no answer —
      // until the retry window passes, the category changes, or a provider
      // (the TMDB key) appears. See `sweepDecision`.
      Object.assign(patch, {
        metadataSource: 'unmatched',
        metadataUpdatedAt: Date.now(),
        metadataConfidence: confidence,
        metadataAttempt: attempt,
      } satisfies Partial<MediaItem>);
      if (group.category !== group.storedCategory) patch.category = group.category;
    }
    // Local art needs no provider, so it lands even during an outage.
    await addLocalArt(group, patch, first);
    write(group, { patch: compact(patch), perFile: [] }, before);
    return { kind: 'unmatched', confidence };
  }

  const resolution = await enrich(group, found, context, manual, (phase) => emit(phase, { confidence: found?.confidence }));
  if (cancelled.has(group.key)) return 'cancelled';
  const patchMode: PatchMode = mode === 'topup' ? 'fill'
    : request.force || request.override || mode === 'refresh' ? 'replace'
      : 'normal';
  const written = await buildPatch(group, resolution, context, patchMode, (phase) => emit(phase, { confidence: found?.confidence }));
  if (cancelled.has(group.key)) return 'cancelled';
  // Then the per-episode facts, which differ file by file. Collected first and
  // written in one go: `media.json` is rewritten whole on every save, so
  // patching 26 episodes individually would be 26 full-file writes and 26
  // renderer re-renders for one logical change.
  write(group, written, before);

  if (byKnownId) return { kind: 'skipped', confidence: found.confidence };
  return { kind: disposition === 'accept' ? 'matched' : 'review', confidence: found.confidence };
}

// ---------------------------------------------------------------------------
// Manual correction search
// ---------------------------------------------------------------------------

function hitOf(work: ProviderWork, title: string, mediaKind: 'anime' | 'tv' | 'movie'): MediaMetadataSearchHit {
  const { confidence } = scoreMetadataCandidate({ title }, work);
  return {
    provider: work.provider,
    id: work.id,
    title: work.displayTitle,
    nativeTitle: work.nativeTitle,
    year: work.year,
    format: work.format,
    episodeCount: work.episodeCount,
    // Only the anime databases' image hosts are in the renderer's CSP.
    imageUrl: isAnimeDatabase(work) ? work.posterUrl : undefined,
    mediaKind,
    confidence,
  };
}

/**
 * Search results for the manual-correction dialog, scored against the local title
 * so the picker can show how well each option fits: the anime databases,
 * TVmaze, and TMDB films when a key is configured, asked in parallel (each has
 * its own rate limit).
 */
export async function searchMediaMetadata(query: string): Promise<MediaMetadataSearchHit[]> {
  const title = query.trim();
  if (!title) return [];
  const [anime, tv, films] = await Promise.all([
    searchAnimeCandidates(title).catch(() => ({ candidates: [] as ProviderWork[], down: true })),
    tvmazeSearch(title).catch(() => null),
    tmdbAvailable() ? tmdbSearchMovie(title).catch(() => null) : Promise.resolve(null),
  ]);
  const hits = [
    ...anime.candidates.map((work) => hitOf(work, title, work.format?.toLowerCase() === 'movie' ? 'movie' : 'anime')),
    ...(tv ?? []).map((work) => hitOf(work, title, 'tv')),
    ...(films ?? []).map((work) => hitOf(work, title, 'movie')),
  ];
  return hits.sort((a, b) => b.confidence - a.confidence);
}

export function registerMediaMetadataIpc(mediaHost: MediaMetadataHost): void {
  host = mediaHost;
  // The watch library's pass waits while a sweep runs; both share the
  // provider rate limiters.
  registerWatchLibraryMetadata(() => sweeping);

  ipcMain.handle('mediaMetadata:run', (_e, request?: MediaMetadataRequest) =>
    runMediaMetadata(request ?? {}));
  ipcMain.handle('mediaMetadata:cancel', (_e, seriesKey?: string) => {
    cancelMediaMetadata(typeof seriesKey === 'string' ? seriesKey : undefined);
  });
  ipcMain.handle('mediaMetadata:status', () => ({ running: mediaMetadataRunning() }));
  ipcMain.handle('mediaMetadata:search', (_e, query: string) =>
    searchMediaMetadata(typeof query === 'string' ? query : ''));
  ipcMain.handle('mediaMetadata:clearCache', () => {
    clearMetadataCache();
  });
}

/** Exposed for tests: the grouping rules are worth pinning without a network. */
export const __mediaMetadataTestables = {
  groupTitles,
  alreadyFetched,
  needsEpisodeBackfill,
  mergeWork,
  lookupCategoryOf,
};

export type { MediaMetadataProviderId };
