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

export type MediaMetadataProviderId = 'jikan' | 'anilist';

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
  /** Remote poster URL, only for rendering the picker; never persisted as-is. */
  imageUrl?: string;
  confidence: number;
}

/** Shared with every other background job — one implementation, in `jobEta.ts`. */
export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';
