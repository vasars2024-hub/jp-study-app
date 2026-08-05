/**
 * Matching an airing schedule against a torrent index.
 *
 * The **schedule is the spine**: AniList says episode 7 of a show airs on
 * Tuesday, and that row exists whether or not anyone has released it. Releases
 * are matched *onto* those rows. Doing it the other way round — listing what a
 * tracker has and calling it "new releases" — is what produces a screen that
 * looks full while silently omitting everything nobody uploaded yet.
 *
 * Two rules are load-bearing here, both from audit rows this app already owns:
 *
 *  - **A gap is rendered as a gap.** `F3` is on record for this exact surface:
 *    "Run now" answered from a different source than the one configured and
 *    never said so. So a schedule row with no matching release keeps
 *    `release: null` and carries a `reason` — it is never back-filled with a
 *    near-match dressed up as the real thing.
 *  - **Every row says where it came from.** `scheduleSource` and
 *    `releaseSource` are stated per row, so a reader can tell a catalogue fact
 *    from a tracker fact without trusting the layout.
 *
 * Pure and deterministic, like the rest of `src/shared`: no I/O, no clock. The
 * network half lives in `src/main/scraper/animeSchedule.ts`.
 */

import type { TorrentRow } from './scraperResults';
import { parseMediaFileName } from './mediaFileIdentity';
import { coveredByBatchRange, releaseCoversEpisode } from './malDownload';
import {
  METADATA_ACCEPT_CONFIDENCE,
  METADATA_REVIEW_CONFIDENCE,
  scoreMetadataCandidate,
} from './mediaMetadataMatch';

/** IPC channel for the whole schedule+releases read. */
export const ANIME_SCHEDULE_CHANNEL = 'scraper:animeSchedule';

/** One scheduled episode, as the catalogue publishes it. */
export interface AiringEntry {
  /** AniList media id — stable, and what the row is keyed on. */
  mediaId: number;
  /** Episode number that airs at {@link airingAt}. */
  episode: number;
  /** Unix seconds. */
  airingAt: number;
  /** Romaji / english / native, de-duplicated. Drives title matching. */
  titles: string[];
  /** What to show. Never empty when the entry is well-formed. */
  displayTitle: string;
  format: string | null;
  episodeCount: number | null;
  siteUrl: string;
  coverUrl: string;
}

/**
 * How much the release is trusted to be the scheduled episode.
 *
 * `review` exists so a plausible-but-unproven match can be shown *as*
 * unproven. Collapsing it into `exact` is the dishonesty this module is
 * written to prevent, and collapsing it into `none` throws away a useful
 * answer — so it stays its own state all the way to the UI.
 */
export type ReleaseDisposition = 'exact' | 'review' | 'none';

/** Why a row has no release. Only ever one of these — never a guess. */
export type NoReleaseReason =
  | 'matched'
  | 'search-failed'
  | 'no-releases-returned'
  | 'no-episode-match'
  | 'below-confidence';

export interface ScheduleRow {
  entry: AiringEntry;
  /** The chosen release, or `null`. Null is a real answer, not a placeholder. */
  release: TorrentRow | null;
  disposition: ReleaseDisposition;
  /** 0–1 title confidence for {@link release}; 0 when there is none. */
  confidence: number;
  /** Which of the entry's titles the release matched, for explaining the match. */
  matchedTitle: string;
  reason: NoReleaseReason;
  /** Releases that were actually considered for this row. */
  consideredCount: number;
  /** How many of those carried the right episode number. */
  episodeMatchCount: number;
  /** Always the catalogue that produced the schedule. */
  scheduleSource: 'anilist';
  /** Tracker label the release came from; `null` when there is no release. */
  releaseSource: string | null;
}

export interface ScheduleMatchOptions {
  /**
   * Accept a batch/season pack whose range covers the episode.
   *
   * Off by default: a season pack is a legitimate way to get episode 7, but it
   * is not "the episode 7 release", and treating the two as interchangeable
   * overstates availability on the day a show airs.
   */
  allowBatches?: boolean;
}

/** Titles a schedule entry is known by, cleaned and de-duplicated. */
export function entryTitles(entry: AiringEntry): string[] {
  return [...new Set(entry.titles.filter((t) => typeof t === 'string' && t.trim()).map((t) => t.trim()))];
}

/**
 * Whether a release name covers this episode number.
 *
 * Both halves are `malDownload.ts`'s, not new code. That module already solved
 * this exact problem for the MAL download planner, and its matcher is stricter
 * than anything derived from `parseMediaFileName().episode`: it accepts only
 * the forms release groups actually use (`- 07`, `E07`, `S01E07`, `[07]`,
 * `_07_`, `07v2`) and it reads a declared range out of a batch name, which is
 * how `[Group] Title (01-12)` covers episode 7 without the digits `07`
 * appearing anywhere in it.
 *
 * A second matcher here would drift from that one, and the two would disagree
 * about the same release in two different screens.
 */
export function releaseNameCoversEpisode(
  name: string,
  episode: number,
  allowBatches: boolean,
): boolean {
  if (releaseCoversEpisode(name, episode)) return true;
  return allowBatches && coveredByBatchRange(name, episode);
}

/**
 * Matches releases onto one scheduled episode.
 *
 * The episode number is a **hard gate** applied before scoring: a title can be
 * a perfect match and still be the wrong episode, and no title confidence
 * should ever be able to outweigh that.
 */
export function matchEntry(
  entry: AiringEntry,
  releases: readonly TorrentRow[],
  options: ScheduleMatchOptions = {},
): ScheduleRow {
  const allowBatches = options.allowBatches ?? false;
  const titles = entryTitles(entry);

  const base = {
    entry,
    release: null,
    disposition: 'none' as ReleaseDisposition,
    confidence: 0,
    matchedTitle: '',
    consideredCount: releases.length,
    episodeMatchCount: 0,
    scheduleSource: 'anilist' as const,
    releaseSource: null,
  };

  if (releases.length === 0) {
    return { ...base, reason: 'no-releases-returned' };
  }

  let best: { row: TorrentRow; confidence: number; matchedTitle: string } | null = null;
  let episodeMatches = 0;

  for (const row of releases) {
    if (!releaseNameCoversEpisode(row.name, entry.episode, allowBatches)) continue;
    episodeMatches += 1;

    // The name still goes through the file-name parser for its *title*, which
    // is what strips the group tag, resolution and CRC before scoring.
    const parsed = parseMediaFileName(row.name);
    const scored = scoreMetadataCandidate(
      { title: parsed.title, episodeCount: null, format: null, year: null },
      { titles, format: entry.format, episodeCount: entry.episodeCount },
    );
    if (!best || scored.confidence > best.confidence) {
      best = { row, confidence: scored.confidence, matchedTitle: scored.matchedTitle };
    }
  }

  if (episodeMatches === 0) {
    return { ...base, reason: 'no-episode-match' };
  }
  if (!best || best.confidence < METADATA_REVIEW_CONFIDENCE) {
    return { ...base, episodeMatchCount: episodeMatches, reason: 'below-confidence' };
  }

  return {
    entry,
    release: best.row,
    disposition: best.confidence >= METADATA_ACCEPT_CONFIDENCE ? 'exact' : 'review',
    confidence: best.confidence,
    matchedTitle: best.matchedTitle,
    reason: 'matched',
    consideredCount: releases.length,
    episodeMatchCount: episodeMatches,
    scheduleSource: 'anilist',
    releaseSource: best.row.tracker || null,
  };
}

/**
 * Matches a whole schedule.
 *
 * `releasesByMediaId` is keyed per entry rather than pooled, because a pooled
 * list lets a release for one show match another show's row whenever the
 * titles are close — the sequel-swallows-predecessor case `titleSimilarity`
 * documents. Entries with no key present are `search-failed`, which is
 * deliberately distinct from "the search returned nothing".
 */
export function matchScheduleReleases(
  entries: readonly AiringEntry[],
  releasesByMediaId: ReadonlyMap<number, readonly TorrentRow[] | null>,
  options: ScheduleMatchOptions = {},
): ScheduleRow[] {
  return entries.map((entry) => {
    const releases = releasesByMediaId.get(entry.mediaId);
    if (releases === null || releases === undefined) {
      return {
        entry,
        release: null,
        disposition: 'none' as ReleaseDisposition,
        confidence: 0,
        matchedTitle: '',
        reason: 'search-failed' as NoReleaseReason,
        consideredCount: 0,
        episodeMatchCount: 0,
        scheduleSource: 'anilist' as const,
        releaseSource: null,
      };
    }
    return matchEntry(entry, releases, options);
  });
}

/** Counts for the summary line. Stated, so the page never implies coverage it lacks. */
export interface ScheduleSummary {
  total: number;
  exact: number;
  review: number;
  none: number;
  searchFailed: number;
}

export function summariseSchedule(rows: readonly ScheduleRow[]): ScheduleSummary {
  return {
    total: rows.length,
    exact: rows.filter((r) => r.disposition === 'exact').length,
    review: rows.filter((r) => r.disposition === 'review').length,
    none: rows.filter((r) => r.disposition === 'none').length,
    searchFailed: rows.filter((r) => r.reason === 'search-failed').length,
  };
}

/** The search text used against the index for an entry. */
export function releaseQueryFor(entry: AiringEntry): string {
  const title = entryTitles(entry)[0] ?? '';
  // Nyaa matches on the raw string, so the episode number is included to cut
  // the result set down before it is scored. Zero-padded because that is how
  // essentially every fansub names a sub-100 episode.
  const ep = entry.episode > 0 && entry.episode < 100
    ? ` ${String(entry.episode).padStart(2, '0')}`
    : '';
  return `${title}${ep}`.trim();
}

export interface AnimeScheduleRequest {
  /** Unix seconds, inclusive. */
  from: number;
  /** Unix seconds, exclusive. */
  to: number;
  /** Hard ceiling on schedule entries, so one query cannot fan out forever. */
  limit?: number;
  allowBatches?: boolean;
  /** Skip the tracker half entirely and return schedule rows only. */
  scheduleOnly?: boolean;
}

export interface AnimeScheduleResponse {
  rows: ScheduleRow[];
  summary: ScheduleSummary;
  /** Set when the *schedule* call failed — distinct from a tracker failure. */
  scheduleError: string | null;
  /** Entries the catalogue returned before the limit was applied. */
  scheduleTotal: number;
  fetchedAt: number;
}
