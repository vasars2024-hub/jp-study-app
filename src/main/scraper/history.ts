// Job history and stored results.
//
// A finished run outlives the process: the History page lists what has been
// scraped, and opening a row has to hand back the rows, torrents, metadata and
// logs that run produced. Keeping that only in memory would mean the page is
// empty on every launch, which is what the fixtures were hiding.
//
// One index file holds the summaries (small, read on every History visit) and
// one file per job holds the full result (large, read only when a row is
// opened). The index is pruned so a heavy user cannot accumulate results
// without limit.

import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ScrapeJobSummary, ScrapeResult } from '../../shared/scraperResults';
import { scraperLog } from './logBus';
import { readScraperJson, scraperStorePath, writeScraperJson } from './store';

/** Persisted locations shared with read-only catalogues such as Files. */
export const SCRAPER_HISTORY_INDEX_FILE = 'history.json';
export const SCRAPER_HISTORY_RESULTS_DIRECTORY = 'results';
/** Runs kept on disk. Older ones are dropped with their result files. */
const MAX_HISTORY = 50;

export interface StoredScrapeJobSummary extends ScrapeJobSummary {
  /** Absolute time, so age is computed on read instead of going stale. */
  finishedAt: number;
}

export interface ScraperHistoryFile {
  jobs: StoredScrapeJobSummary[];
}

const EMPTY: ScraperHistoryFile = { jobs: [] };

/**
 * Read the durable index without assuming a fixture-authored shape.
 *
 * Files consumes the same stored rows as History. A corrupt top-level object,
 * a non-array `jobs`, or a malformed row becomes an honest omission instead of
 * taking down either surface. Only identity is required for legacy rows; an old
 * row without `finishedAt` remains visible with epoch 0 rather than disappearing.
 */
export function scraperHistoryJobsFromStoredDocument(value: unknown): StoredScrapeJobSummary[] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return [];
  const jobs = (value as { jobs?: unknown }).jobs;
  if (!Array.isArray(jobs)) return [];
  return jobs.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return [];
    const row = candidate as Partial<StoredScrapeJobSummary>;
    if (typeof row.id !== 'string' || !row.id) return [];
    return [{
      ...row,
      finishedAt: typeof row.finishedAt === 'number' && Number.isFinite(row.finishedAt)
        ? row.finishedAt
        : 0,
    } as StoredScrapeJobSummary];
  });
}

/**
 * Provider URLs are commonly signed and provider headers may contain cookies
 * or bearer credentials. History is durable JSON, so it keeps provenance but
 * never persists either. Opening an old result must re-resolve the episode.
 */
export function resultForScraperHistory(result: ScrapeResult): ScrapeResult {
  return {
    ...result,
    streams: result.streams.map((stream) => {
      if (!stream.playback) return stream;
      return {
        ...stream,
        url: '',
        playback: {
          ...stream.playback,
          url: '',
          headers: {},
          subtitles: [],
          refreshRequired: true,
        },
      };
    }),
  };
}

function resultFile(jobId: string): string {
  // Job ids are minted by the engine, but a path is a path: anything that could
  // climb out of the results directory is refused rather than sanitised.
  if (!/^[A-Za-z0-9_-]+$/.test(jobId)) throw new Error(`Unusable job id: ${jobId}`);
  return path.join(SCRAPER_HISTORY_RESULTS_DIRECTORY, `${jobId}.json`);
}

export async function recordJob(summary: ScrapeJobSummary, result: ScrapeResult): Promise<void> {
  try {
    await writeScraperJson(resultFile(summary.id), resultForScraperHistory(result));
    const file = await readScraperJson<unknown>(SCRAPER_HISTORY_INDEX_FILE, EMPTY);
    // `ageMinutes` is relative and would be a lie the moment it is written;
    // `finishedAt` replaces it and the age is recomputed on read.
    const stored: StoredScrapeJobSummary = { ...summary, finishedAt: Date.now() };
    const jobs: StoredScrapeJobSummary[] = [
      stored,
      ...scraperHistoryJobsFromStoredDocument(file).filter((job) => job.id !== summary.id),
    ];
    const kept = jobs.slice(0, MAX_HISTORY);
    await writeScraperJson(SCRAPER_HISTORY_INDEX_FILE, { jobs: kept });

    for (const dropped of jobs.slice(MAX_HISTORY)) {
      await fsp.rm(scraperStorePath(resultFile(dropped.id)), { force: true }).catch(() => undefined);
    }
    scraperLog('info', 'history', `Saved job ${summary.id} (${summary.found} rows).`, {
      correlationId: summary.id,
    });
  } catch (error) {
    // Losing history is not a reason to fail a run that already succeeded.
    scraperLog('warn', 'history', `Could not save job ${summary.id}: ${
      error instanceof Error ? error.message : String(error)
    }`);
  }
}

/** Stored summaries, newest first, with age recomputed against now. */
export async function storedSummaries(): Promise<ScrapeJobSummary[]> {
  const file = await readScraperJson<unknown>(SCRAPER_HISTORY_INDEX_FILE, EMPTY);
  const now = Date.now();
  return scraperHistoryJobsFromStoredDocument(file).map((stored) => ({
    ...stored,
    ageMinutes: Math.max(0, Math.round((now - stored.finishedAt) / 60_000)),
  }));
}

/**
 * The episode ids the most recent *earlier* run of this series produced.
 *
 * `null` — not an empty set — when there is no earlier run at all. The
 * difference decides whether "New Episode Found" fires: the first scrape of a
 * series finds every episode it has, and announcing 28 new episodes for a show
 * that finished airing in 2015 is not news, it is noise.
 *
 * Read before the current run is recorded, and the current id is excluded
 * anyway, so a re-run cannot be compared against itself.
 */
export async function previousEpisodeIds(
  seriesId: string,
  excludeJobId: string,
): Promise<Set<string> | null> {
  if (!seriesId) return null;
  const file = await readScraperJson<unknown>(SCRAPER_HISTORY_INDEX_FILE, EMPTY);
  const previous = scraperHistoryJobsFromStoredDocument(file)
    .filter((job) => job.seriesId === seriesId && job.id !== excludeJobId)
    .sort((a, b) => b.finishedAt - a.finishedAt)[0];
  if (!previous) return null;
  const result = await storedResult(previous.id);
  if (!result) return null;
  return new Set(result.episodes.map((episode) => episode.id));
}

export async function storedResult(jobId: string): Promise<ScrapeResult | null> {
  try {
    return await readScraperJson<ScrapeResult | null>(resultFile(jobId), null);
  } catch {
    return null;
  }
}

/** Test seam — removes the index and every stored result. */
export async function clearScraperHistory(): Promise<void> {
  await fsp.rm(scraperStorePath(SCRAPER_HISTORY_INDEX_FILE), { force: true }).catch(() => undefined);
  await fsp.rm(scraperStorePath(SCRAPER_HISTORY_RESULTS_DIRECTORY), { recursive: true, force: true }).catch(() => undefined);
}
