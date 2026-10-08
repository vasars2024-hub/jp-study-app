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
import type { ScrapeJobSummary, ScrapeResult, SeriesMetadata } from '../../shared/scraperResults';
import { episodeIdAliases } from '../../shared/scraperEpisodeId';
import { scraperLog } from './logBus';
import { readScraperJson, scraperStorePath, withScraperFileQueue, writeScraperJson } from './store';
import { removeJsonStore } from '../atomicJson';

/**
 * The persisted locations, shape and parser moved to `shared/scraperHistoryStore`
 * on 2026-08-31 and are re-exported here so every existing importer is unchanged.
 *
 * They had to leave `main/`: this module imports `./store`, which imports
 * `electron`, and the Files index is bundled and run OUTSIDE Electron by gate
 * 1's census harness. Reaching for the constant from here would have pulled
 * `app.getPath` into a plain-Node bundle, and the alternative — a second copy
 * of the filename in the enumerator — is the drift this contract exists to stop.
 */
import {
  SCRAPER_HISTORY_INDEX_FILE,
  SCRAPER_HISTORY_RESULTS_DIRECTORY,
  scraperHistoryJobsFromStoredDocument,
  type ScraperHistoryFile,
  type StoredScrapeJobSummary,
} from '../../shared/scraperHistoryStore';

export {
  SCRAPER_HISTORY_INDEX_FILE,
  SCRAPER_HISTORY_RESULTS_DIRECTORY,
  scraperHistoryJobsFromStoredDocument,
  type StoredScrapeJobSummary,
  type ScraperHistoryFile,
};

/** Runs kept on disk. Older ones are dropped with their result files. */
const MAX_HISTORY = 50;

const EMPTY: ScraperHistoryFile = { jobs: [] };

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
    // Queued per file: two jobs finishing together must not both read the same
    // index and have the second write drop the first job's entry.
    await withScraperFileQueue(SCRAPER_HISTORY_INDEX_FILE, async () => {
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
        removeJsonStore(scraperStorePath(resultFile(dropped.id)));
      }
    });
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
  const earlier = scraperHistoryJobsFromStoredDocument(file)
    .filter((job) => job.seriesId === seriesId && job.id !== excludeJobId)
    .sort((a, b) => b.finishedAt - a.finishedAt);
  // A run that found nothing (a site that was down, a filter that matched
  // nothing) is not a baseline: comparing against it would announce every
  // episode as new on the next good run. Walk back to the last run with rows.
  for (const previous of earlier) {
    const result = await storedResult(previous.id);
    if (!result?.episodes?.length) continue;
    // Old results hold `${seriesId}-e${n}` ids; aliases make them comparable
    // with today's season-and-kind ids (shared/scraperEpisodeId.ts).
    return new Set(result.episodes.flatMap((episode) => episodeIdAliases(episode)));
  }
  return null;
}

export async function storedResult(jobId: string): Promise<ScrapeResult | null> {
  try {
    return await readScraperJson<ScrapeResult | null>(resultFile(jobId), null);
  } catch {
    return null;
  }
}

/**
 * The series each info hash was found under, from stored results, newest run
 * first. This is the Scraper's own identification of a torrent — catalogue ids
 * and titles — for a handoff (the Torrent Manager's free-text search) that did
 * not carry one. Hashes no stored run listed are absent from the map.
 */
export async function seriesForInfoHashes(
  hashes: readonly string[],
): Promise<Map<string, SeriesMetadata>> {
  const wanted = new Set(hashes.map((hash) => hash.toLowerCase()).filter(Boolean));
  const found = new Map<string, SeriesMetadata>();
  if (!wanted.size) return found;
  const file = await readScraperJson<unknown>(SCRAPER_HISTORY_INDEX_FILE, EMPTY);
  const jobs = scraperHistoryJobsFromStoredDocument(file).sort((a, b) => b.finishedAt - a.finishedAt);
  for (const job of jobs) {
    if (found.size === wanted.size) break;
    const result = await storedResult(job.id);
    if (!result?.metadata) continue;
    for (const torrent of result.torrents ?? []) {
      const hash = (torrent.infoHash ?? '').toLowerCase();
      if (wanted.has(hash) && !found.has(hash)) found.set(hash, result.metadata);
    }
  }
  return found;
}

/** Test seam — removes the index and every stored result. */
export async function clearScraperHistory(): Promise<void> {
  // With its last-good copy: a cleared history must not come back from `.bak`.
  removeJsonStore(scraperStorePath(SCRAPER_HISTORY_INDEX_FILE));
  await fsp.rm(scraperStorePath(SCRAPER_HISTORY_RESULTS_DIRECTORY), { recursive: true, force: true }).catch(() => undefined);
}
