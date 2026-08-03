/*
 * What the Dashboard actually knows.
 *
 * Until 2026-08-02 every panel on that page rendered `data/fixtures.ts`: three
 * hard-coded series ("One Piece · StreamSB · 1,122 episodes"), eight sources on
 * invented `*.example` hosts with invented latencies, a scheduled run "in 3h",
 * and 1,842 "new words found". A `Sample data` chip in the header was the only
 * thing saying so, and it is easy to miss under a page that otherwise reads as
 * a working command centre.
 *
 * The backend was answering the whole time — `scraperCapabilities()` reports all
 * 25 methods implemented, `listJobs()` returns real jobs and `listSources()`
 * real sources. The page simply never asked.
 *
 * Derivation lives here rather than in the component so it can be tested without
 * a renderer, and so "what counts as a failed job" has exactly one definition.
 */

import type {
  DownloadRow,
  ScrapeJobSummary,
  SourceStatus,
  SystemStats,
} from '../../../../shared/scraperResults';
import { TERMINAL_SCRAPE_STAGES } from '../../../../shared/scraperResults';
import type { ScraperSchedulerState } from '../../../../shared/scraperIpc';

/** How a finished job is rendered as a coloured outcome dot. */
export type JobOutcome = 'done' | 'warning' | 'failed' | 'cancelled';

/**
 * A job that found nothing is not a success, and a job that found some of what
 * it looked for is not a failure. `failed` on the summary counts items the run
 * could not resolve, so a run with both is a warning — which is exactly the
 * state the real "ONE PIECE" job on this machine is in (found 1147, failed
 * 1078), and which the fixture list had no way to express.
 */
export function jobOutcome(job: Pick<ScrapeJobSummary, 'stage' | 'found' | 'failed'>): JobOutcome {
  if (job.stage === 'cancelled') return 'cancelled';
  if (job.stage === 'failed') return 'failed';
  if (job.found === 0) return 'failed';
  return job.failed > 0 ? 'warning' : 'done';
}

/** Jobs still in flight — anything that has not reached a terminal stage. */
export function activeJobs(jobs: readonly ScrapeJobSummary[]): ScrapeJobSummary[] {
  return jobs.filter((job) => !TERMINAL_SCRAPE_STAGES.includes(job.stage));
}

/** Finished jobs, newest first. `ageMinutes` is minutes-before-now, so it sorts ascending. */
export function recentJobs(jobs: readonly ScrapeJobSummary[], limit = 6): ScrapeJobSummary[] {
  return jobs
    .filter((job) => TERMINAL_SCRAPE_STAGES.includes(job.stage))
    .slice()
    .sort((a, b) => a.ageMinutes - b.ageMinutes)
    .slice(0, limit);
}

export interface DashboardSeries {
  seriesId: string;
  titleEn: string;
  titleJa: string;
  provider: string;
  episodes: number;
  /** The job this row came from, so a click can open its result. */
  jobId: string;
}

/**
 * One card per series, from the most recent job that touched it.
 *
 * A series scraped six times is one entry, not six — the old fixture list had
 * three distinct series and so never had to answer this.
 */
export function distinctSeries(jobs: readonly ScrapeJobSummary[], limit = 3): DashboardSeries[] {
  const newestFirst = jobs.slice().sort((a, b) => a.ageMinutes - b.ageMinutes);
  const seen = new Map<string, DashboardSeries>();
  for (const job of newestFirst) {
    if (seen.has(job.seriesId)) continue;
    seen.set(job.seriesId, {
      seriesId: job.seriesId,
      titleEn: job.titleEn,
      titleJa: job.titleJa,
      provider: job.provider,
      episodes: job.found,
      jobId: job.id,
    });
    if (seen.size >= limit) break;
  }
  return [...seen.values()];
}

/** Downloads that have not finished — the number the Downloads shortcut advertises. */
export function queuedDownloads(downloads: readonly DownloadRow[]): number {
  return downloads.filter((row) => row.state === 'queued' || row.state === 'downloading' || row.state === 'paused').length;
}

export function failedDownloads(downloads: readonly DownloadRow[]): number {
  return downloads.filter((row) => row.state === 'failed').length;
}

export interface NextRun {
  entryId: string;
  /** Minutes from `now`; never negative — an overdue entry reads as 0. */
  inMinutes: number;
}

/**
 * The soonest scheduled run still in the future.
 *
 * Returns null when the scheduler has no dated entries, which is the state on a
 * machine that has never scheduled anything — the page must then say so rather
 * than print the fixture's "in 3h".
 */
export function nextScheduledRun(
  state: ScraperSchedulerState | null,
  now = Date.now(),
): NextRun | null {
  if (!state) return null;
  let best: NextRun | null = null;
  for (const entry of state.entries) {
    if (!entry.nextRunAt) continue;
    const at = Date.parse(entry.nextRunAt);
    if (Number.isNaN(at)) continue;
    const inMinutes = Math.max(0, Math.round((at - now) / 60_000));
    if (!best || inMinutes < best.inMinutes) best = { entryId: entry.id, inMinutes };
  }
  return best;
}

/** Sources answering healthily right now. */
export function healthySources(sources: readonly SourceStatus[]): number {
  return sources.filter((source) => source.health === 'ok').length;
}

/**
 * Bytes this install has actually pulled down, summed from the jobs that did it.
 *
 * This replaces a three-way page-cache / images / logs breakdown that had no
 * backing measurement anywhere in the app — `SystemStats` carries memory, CPU
 * and active-job count, and nothing reports directory sizes. One real number
 * beats three invented ones.
 */
export function downloadedBytes(jobs: readonly ScrapeJobSummary[]): number {
  return jobs.reduce((total, job) => total + (Number.isFinite(job.bytes) ? job.bytes : 0), 0);
}

export interface DashboardSnapshot {
  jobs: ScrapeJobSummary[];
  sources: SourceStatus[];
  downloads: DownloadRow[];
  stats: SystemStats | null;
  scheduler: ScraperSchedulerState | null;
  /** Episode totals, summed across the results of recent jobs. */
  episodes: { indexed: number; japanese: number };
  /**
   * Whether the readings above came from a backend or from the sample-data
   * fallback the port drops to when main implements nothing. The page prints
   * this instead of asserting the numbers are real.
   */
  live: boolean;
}

export const EMPTY_SNAPSHOT: DashboardSnapshot = {
  jobs: [],
  sources: [],
  downloads: [],
  stats: null,
  scheduler: null,
  episodes: { indexed: 0, japanese: 0 },
  live: false,
};
