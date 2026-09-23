/**
 * Wire types for the metadata-fetch job, shared by main and renderer.
 *
 * Modelled on `bookOcrIpc.ts`: a phase union, one progress record broadcast to
 * every window, and the same ETA helper — a metadata sweep over a large library
 * is long enough that the user needs to see it moving and be able to stop it.
 */

export type MediaMetadataPhase =
  | 'queued'
  | 'searching'
  | 'matching'
  | 'fetching-episodes'
  | 'downloading-art'
  | 'done'
  | 'cancelled'
  | 'error';

export interface MediaMetadataProgress {
  /** Series grouping key the job belongs to; the unit of work is a title. */
  seriesKey: string;
  /** Display title, so a progress row can name the work without a lookup. */
  title: string;
  phase: MediaMetadataPhase;
  /** Titles finished in this sweep. */
  done: number;
  /** Titles in the sweep, or 0 while still being counted. */
  total: number;
  /** Match confidence once known, 0–1. */
  confidence?: number;
  etaMs?: number;
  error?: string;
}

export interface MediaMetadataRequest {
  /**
   * Restrict the sweep to these media ids. Omit to sweep every title that has no
   * metadata yet — which is what the library does after an import.
   */
  mediaIds?: string[];
  /** Re-fetch titles that already have metadata. */
  force?: boolean;
  /**
   * Apply this provider result instead of searching, for a manual correction.
   * Requires `mediaIds` to name the series being corrected.
   */
  override?: { provider: MediaMetadataProviderId; id: number };
}

/**
 * Every provider the sweep can apply. Jikan (MyAnimeList) and AniList for
 * anime; TVmaze (no key) for TV and live-action drama; TMDB (a user-supplied
 * key) for films and as a backdrop source for series. Also the values
 * `MediaItem.metadataSource` takes, beside `'unmatched'`.
 *
 * A `tmdb` override id is always a TMDB *movie* id: TMDB's movie and TV ids
 * collide, and the sweep only ever applies TMDB as the primary answer for films.
 */
export type MediaMetadataProviderId = 'jikan' | 'anilist' | 'tvmaze' | 'tmdb';

/**
 * One episode of a series' full run, as the provider lists it — including
 * episodes the library does not hold, so a show page can list the whole season.
 * Stored once per series on its files (`MediaItem.episodeGuide`), capped at
 * {@link EPISODE_GUIDE_LIMIT} entries.
 */
export interface MediaEpisodeGuideEntry {
  /** Season number. Absent when the provider numbers the run absolutely (anime). */
  season?: number;
  /** Episode number within `season`, or the absolute number when there is none. */
  number: number;
  title?: string;
  /** Original air date, epoch ms. */
  airedAt?: number;
  runtimeMin?: number;
}

/** Longest episode guide persisted per series; long-runners keep titles only. */
export const EPISODE_GUIDE_LIMIT = 300;

/**
 * What the last lookup for a title tried, so an `unmatched` stamp can expire.
 *
 * An unmatched title is retried after {@link UNMATCHED_RETRY_MS}, or at once
 * when its category changed (a different provider order applies) or when a
 * provider became available that this attempt did not have — the TMDB key being
 * added is the case that matters. A matched title is topped up the same way
 * when it is still missing art a newly available provider could supply.
 */
export interface MediaMetadataAttempt {
  /** Epoch ms of the attempt. */
  at: number;
  /** The category the lookup ran under. */
  category: string;
  /** Providers the lookup could use, in the order it asked them. */
  providers: MediaMetadataProviderId[];
  /** A manual correction: never re-searched or overwritten automatically. */
  manual?: boolean;
}

/** How long an `unmatched` title rests before the sweep asks about it again. */
export const UNMATCHED_RETRY_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Pushed on `media:metadataUpdated` whenever a sweep writes to library items.
 * `artwork` is true when poster, banner, backdrop or episode stills changed, so
 * the renderer drops its memoized frame grabs for exactly these ids.
 */
export interface MediaMetadataUpdate {
  ids: string[];
  artwork: boolean;
}

export interface MediaMetadataResult {
  ok: boolean;
  /** Titles that got metadata applied. */
  matched: number;
  /** Titles applied but below the accept threshold, flagged for review. */
  review: number;
  /** Titles where nothing scored well enough to apply. */
  unmatched: number;
  error?: string;
}

/** One search hit, as offered to the user in the manual-correction dialog. */
export interface MediaMetadataSearchHit {
  provider: MediaMetadataProviderId;
  id: number;
  title: string;
  nativeTitle?: string;
  year?: number;
  format?: string;
  episodeCount?: number;
  /**
   * Remote poster URL, only for rendering the picker; never persisted as-is.
   * Left empty for TVmaze and TMDB hits: their image hosts are not in the
   * renderer's CSP `img-src`, and a broken image is worse than the placeholder.
   */
  imageUrl?: string;
  /** What kind of work the hit is, so the picker can label TV and film hits. */
  mediaKind?: 'anime' | 'tv' | 'movie';
  confidence: number;
}

/** Shared with every other background job — one implementation, in `jobEta.ts`. */
export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';
