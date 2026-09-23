/**
 * The metadata sweep's decisions, kept pure so they are tested without a network.
 *
 * `main/mediaMetadata.ts` does the talking; this module decides what it should
 * ask, whether a title is worth asking about again, which of the provider's
 * episodes belongs to which file, and whether a match has earned the right to
 * correct an automatically guessed category. No I/O, no clock — `now` is always
 * passed in.
 */

import type { MediaCategory } from './mediaCategories';
import {
  UNMATCHED_RETRY_MS,
  type MediaMetadataAttempt,
  type MediaMetadataProviderId,
} from './mediaMetadataIpc';
import { METADATA_ACCEPT_CONFIDENCE } from './mediaMetadataMatch';

/** Categories the sweep looks up at all. */
export type LookupCategory = 'anime' | 'tv' | 'drama' | 'movie';

export const LOOKUP_CATEGORIES: ReadonlySet<string> = new Set<LookupCategory>(['anime', 'tv', 'drama', 'movie']);

/** One primary search the sweep can run. */
export type LookupStep = 'anime' | 'tvmaze' | 'tmdb-movie';

export interface LookupContext {
  /** A TMDB key is configured. */
  tmdb: boolean;
  /** The file names look like an anime release (fansub brackets, kana, `raw`). */
  animeHint: boolean;
}

/**
 * Primary searches in the order they run; the first confident answer wins.
 *
 *   anime      MyAnimeList/AniList first (they carry the ids subtitle search
 *              needs), then TVmaze for what they do not list.
 *   tv, drama  TVmaze first — Japanese live-action dramas are there and not on
 *              the anime databases — then the anime databases, because a scene
 *              release of an anime (`Frieren.S01E01.1080p.WEB`) is filed as `tv`.
 *   movie      TMDB when the user has a key; the anime databases (as a film)
 *              only when the files look like an anime release. Without a key
 *              and without that hint there is nothing to ask, and the film gets
 *              local art only.
 */
export function lookupSteps(category: LookupCategory, context: LookupContext): LookupStep[] {
  switch (category) {
    case 'anime':
      return ['anime', 'tvmaze'];
    case 'tv':
    case 'drama':
      return ['tvmaze', 'anime'];
    case 'movie': {
      const steps: LookupStep[] = [];
      if (context.tmdb) steps.push('tmdb-movie');
      if (context.animeHint) steps.push('anime');
      return steps;
    }
  }
}

/**
 * Every provider a lookup in this category may touch, primaries and
 * enrichments alike. Stored on the attempt so a provider that becomes available
 * later (the TMDB key) re-opens exactly the titles that never had it.
 */
export function lookupProviders(category: LookupCategory, context: LookupContext): MediaMetadataProviderId[] {
  const tmdb: MediaMetadataProviderId[] = context.tmdb ? ['tmdb'] : [];
  switch (category) {
    case 'anime':
      return ['jikan', 'anilist', 'tvmaze', ...tmdb];
    case 'tv':
    case 'drama':
      return ['tvmaze', 'jikan', 'anilist', ...tmdb];
    case 'movie':
      return [...tmdb, ...(context.animeHint ? (['jikan', 'anilist'] as const) : [])];
  }
}

/** The stored fields {@link sweepDecision} reads. `MediaItem` satisfies it. */
export interface SweepState {
  metadataSource?: string;
  metadataUpdatedAt?: number;
  metadataAttempt?: MediaMetadataAttempt;
  posterPath?: string;
  bannerPath?: string;
}

/**
 * What a non-forced sweep should do with a title.
 *
 *   lookup  search the providers (never looked up, or an `unmatched` stamp
 *           that has expired);
 *   topup   keep the match, but fetch the art and ids a newly available
 *           provider can add, by the ids already known;
 *   skip    nothing new to learn.
 *
 * An `unmatched` stamp used to be permanent. It now expires after
 * {@link UNMATCHED_RETRY_MS}, or at once when the category changed (a
 * different provider order applies) or a provider appeared that the attempt
 * did not have. Stamps written before attempts were recorded count as having
 * tried MyAnimeList and AniList only — which is exactly what they did — so
 * every one of them gets one TVmaze look.
 *
 * A manual correction is never re-searched or topped up automatically.
 */
export function sweepDecision(
  state: SweepState,
  category: LookupCategory,
  providers: readonly MediaMetadataProviderId[],
  now: number,
): 'lookup' | 'topup' | 'skip' {
  const attempt = state.metadataAttempt;
  if (attempt?.manual) return 'skip';
  const settled = Boolean(state.metadataUpdatedAt && state.metadataSource);
  const tried: readonly string[] = attempt?.providers ?? (settled ? ['jikan', 'anilist'] : []);
  const newProvider = providers.some((provider) => !tried.includes(provider));

  if (!settled) {
    // Never matched. A keyless film leaves only an attempt behind (it had
    // nothing to ask), which rests like an unmatched stamp does.
    if (!attempt) return 'lookup';
    if (attempt.category !== category || newProvider) return 'lookup';
    return now - attempt.at >= UNMATCHED_RETRY_MS ? 'lookup' : 'skip';
  }

  if (state.metadataSource === 'unmatched') {
    if (attempt && attempt.category !== category) return 'lookup';
    if (newProvider) return 'lookup';
    const at = attempt?.at ?? state.metadataUpdatedAt ?? 0;
    return now - at >= UNMATCHED_RETRY_MS ? 'lookup' : 'skip';
  }

  // Matched. Only art a new provider could fill is worth another request.
  const missingArt = !state.posterPath || !state.bannerPath;
  return missingArt && newProvider ? 'topup' : 'skip';
}

// ---------------------------------------------------------------------------
// Category correction
// ---------------------------------------------------------------------------

/** What a provider said about the kind of work, as far as correction needs. */
export interface CategoryEvidence {
  provider: MediaMetadataProviderId;
  /** True for animation; false for live action; undefined when not stated. */
  animation?: boolean;
  /** Lower-cased: `japanese`, `ja`, `korean`, `ko`, … */
  language?: string;
  /** ISO 3166: `JP`. */
  country?: string;
  /** TVmaze's show type, lower-cased (`scripted`, `reality`, `animation`). */
  showType?: string;
}

const EAST_ASIAN_LANGUAGES = new Set(['japanese', 'ja', 'korean', 'ko', 'chinese', 'mandarin', 'cantonese', 'zh', 'cn']);
const EAST_ASIAN_COUNTRIES = new Set(['JP', 'KR', 'CN', 'TW', 'HK']);

function eastAsian(evidence: CategoryEvidence): boolean {
  return EAST_ASIAN_LANGUAGES.has(evidence.language ?? '') || EAST_ASIAN_COUNTRIES.has(evidence.country ?? '');
}

function japaneseOrigin(evidence: CategoryEvidence): boolean {
  return evidence.language === 'japanese' || evidence.language === 'ja' || evidence.country === 'JP';
}

/**
 * The category a confident match proves, or `null` to leave it alone.
 *
 * Only ever corrects a category the importer *guessed*: `current` must still
 * equal `automatic` (what `inferMediaCategory` makes of the file with no stored
 * category), so anything the user chose is untouched. And only for an accepted
 * match — a reviewed guess must not move a title across the library.
 *
 *   tv/drama → anime   an anime database matched it, or TVmaze calls it
 *                      Japanese animation (a scene-named anime release);
 *   anime → drama      TVmaze says scripted live action from East Asia (a
 *                      fansubbed J-drama: brackets made it look like anime);
 *   anime → tv         TVmaze says live action from anywhere else;
 *   tv → drama         TVmaze says scripted East Asian live action.
 *
 * Films are never moved: `movie` came from a year with no episode marker, which
 * no series answer can overrule.
 */
export function correctedCategory(
  current: MediaCategory,
  automatic: MediaCategory | null,
  evidence: CategoryEvidence,
  confidence: number,
): MediaCategory | null {
  if (automatic === null || current !== automatic) return null;
  if (confidence < METADATA_ACCEPT_CONFIDENCE) return null;
  if (current !== 'anime' && current !== 'tv' && current !== 'drama') return null;

  const animeDatabase = evidence.provider === 'jikan' || evidence.provider === 'anilist';
  if (animeDatabase || (evidence.animation === true && japaneseOrigin(evidence))) {
    return current === 'anime' ? null : 'anime';
  }
  if (evidence.provider !== 'tvmaze' || evidence.animation !== false) return null;

  const drama = eastAsian(evidence) && evidence.showType === 'scripted';
  const next: MediaCategory = drama ? 'drama' : current === 'anime' ? 'tv' : current;
  return next === current ? null : next;
}

// ---------------------------------------------------------------------------
// Episodes
// ---------------------------------------------------------------------------

/** One provider episode, as far as mapping needs it. */
export interface GuideEpisode {
  season?: number;
  number: number;
  title?: string;
  airedAt?: number;
  runtimeMin?: number;
  stillUrl?: string;
}

/** One library file of the series. */
export interface EpisodeFile {
  id: string;
  season?: number;
  episode?: number;
}

const seasonOf = (episode: GuideEpisode): number => episode.season ?? 1;

/**
 * Which season of a multi-season TVmaze show one MyAnimeList entry is.
 *
 * MyAnimeList lists each cour as its own work and numbers its episodes from 1;
 * TVmaze lists the show once, in seasons. Mapping a MAL entry's episode 5 onto
 * TVmaze's needs the season, and the air year is the evidence: the season whose
 * first episode aired in the entry's year, narrowed by episode count when two
 * seasons share a year. `null` when that is not decisive — no stills beat the
 * wrong season's stills.
 */
export function resolveSeasonForWork(
  episodes: readonly GuideEpisode[],
  year: number | null | undefined,
  episodeCount?: number | null,
): number | null {
  const seasons = new Map<number, GuideEpisode[]>();
  for (const episode of episodes) {
    const list = seasons.get(seasonOf(episode)) ?? [];
    list.push(episode);
    seasons.set(seasonOf(episode), list);
  }
  if (seasons.size === 1) return [...seasons.keys()][0] ?? null;
  if (typeof year !== 'number') return null;

  const inYear = [...seasons.entries()].filter(([, list]) => {
    const first = [...list].sort((a, b) => a.number - b.number)[0];
    return first?.airedAt !== undefined && new Date(first.airedAt).getUTCFullYear() === year;
  });
  if (inYear.length === 1) return inYear[0]?.[0] ?? null;
  if (inYear.length > 1 && typeof episodeCount === 'number') {
    const exact = inYear.filter(([, list]) => list.length === episodeCount);
    if (exact.length === 1) return exact[0]?.[0] ?? null;
  }
  return null;
}

export interface EpisodeMapping {
  /** file id → the provider episode it is. */
  byFile: Map<string, GuideEpisode>;
  /**
   * file id → the episode-title map for that file's season, keyed by the
   * number the file itself carries — `episodeTitles[String(item.episode)]`,
   * which is how every reader looks a title up.
   */
  titlesByFile: Map<string, Record<string, string>>;
}

/**
 * Pairs each file with its provider episode.
 *
 *   A file with a season (`S02E05`) maps to exactly that episode.
 *   A file without one maps into `season` when the caller resolved one (an
 *   anime entry that is one season of a TVmaze show), into the only season
 *   when there is one, and otherwise by absolute order — `One Piece - 1071`
 *   is the 1071st regular episode however TVmaze splits the seasons.
 *
 * With `strict`, a season-less file on a multi-season show without a resolved
 * season maps to nothing, rather than guessing absolute order: used for a
 * supplementary TVmaze answer to an anime match, where the MAL entry's numbers
 * are relative to a season TVmaze would otherwise have to be guessed.
 */
export function mapEpisodesToFiles(
  files: readonly EpisodeFile[],
  episodes: readonly GuideEpisode[],
  options: { season?: number | null; strict?: boolean } = {},
): EpisodeMapping {
  const byKey = new Map<string, GuideEpisode>();
  const seasons = new Set<number>();
  for (const episode of episodes) {
    byKey.set(`${seasonOf(episode)}x${episode.number}`, episode);
    seasons.add(seasonOf(episode));
  }
  const ordered = [...episodes].sort((a, b) => seasonOf(a) - seasonOf(b) || a.number - b.number);
  const onlySeason = seasons.size === 1 ? [...seasons][0] : undefined;
  const resolved = typeof options.season === 'number' ? options.season : onlySeason;

  const titlesFor = (season: number | undefined, absolute: boolean): Record<string, string> => {
    const map: Record<string, string> = {};
    if (absolute) {
      ordered.forEach((episode, index) => {
        if (episode.title) map[String(index + 1)] = episode.title;
      });
      return map;
    }
    for (const episode of episodes) {
      if (seasonOf(episode) === season && episode.title) map[String(episode.number)] = episode.title;
    }
    return map;
  };

  const byFile = new Map<string, GuideEpisode>();
  const titlesByFile = new Map<string, Record<string, string>>();
  const titleCache = new Map<string, Record<string, string>>();
  const titles = (season: number | undefined, absolute: boolean): Record<string, string> => {
    const key = absolute ? 'abs' : String(season);
    const hit = titleCache.get(key);
    if (hit) return hit;
    const map = titlesFor(season, absolute);
    titleCache.set(key, map);
    return map;
  };

  for (const file of files) {
    if (typeof file.episode !== 'number') continue;
    let episode: GuideEpisode | undefined;
    let season: number | undefined;
    let absolute = false;
    if (typeof file.season === 'number') {
      season = file.season;
      episode = byKey.get(`${season}x${file.episode}`);
    } else if (resolved !== undefined) {
      season = resolved;
      episode = byKey.get(`${season}x${file.episode}`);
    } else if (!options.strict) {
      absolute = true;
      episode = ordered[file.episode - 1];
    }
    if (!episode) continue;
    byFile.set(file.id, episode);
    const map = titles(season, absolute);
    if (Object.keys(map).length > 0) titlesByFile.set(file.id, map);
  }
  return { byFile, titlesByFile };
}

/**
 * The persisted episode guide: regular episodes in order, capped, and stripped
 * of the remote still URL (a URL is never persisted — the renderer's CSP could
 * not load it anyway, and the file's own still is downloaded instead).
 */
export function episodeGuideOf(
  episodes: readonly GuideEpisode[],
  limit: number,
): Array<Omit<GuideEpisode, 'stillUrl'>> {
  return [...episodes]
    .sort((a, b) => (a.season ?? 0) - (b.season ?? 0) || a.number - b.number)
    .slice(0, limit)
    .map(({ season, number, title, airedAt, runtimeMin }) => {
      const entry: Omit<GuideEpisode, 'stillUrl'> = { number };
      if (season !== undefined) entry.season = season;
      if (title) entry.title = title;
      if (airedAt !== undefined) entry.airedAt = airedAt;
      if (runtimeMin !== undefined) entry.runtimeMin = runtimeMin;
      return entry;
    });
}
