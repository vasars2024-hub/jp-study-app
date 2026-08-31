// The durable scraper-history index: where it lives, what shape it has, and the
// one parser that reads it.
//
// In shared/ rather than in `main/scraper/history.ts` — where it was written on
// 2026-08-30 — because the Files index consumes the same rows and is bundled to
// run outside Electron. `main/scraper/store.ts` imports `electron`, so anything
// reaching for these constants through the main module drags `app.getPath` into
// a plain-Node bundle. The main module re-exports every name below, so no
// existing importer changed.
//
// Nothing here touches the filesystem: the caller supplies the parsed document.

import type { ScrapeJobSummary } from './scraperResults';

/** Persisted locations shared with read-only catalogues such as Files. */
export const SCRAPER_HISTORY_INDEX_FILE = 'history.json';
export const SCRAPER_HISTORY_RESULTS_DIRECTORY = 'results';

export interface StoredScrapeJobSummary extends ScrapeJobSummary {
  /** Absolute time, so age is computed on read instead of going stale. */
  finishedAt: number;
}

export interface ScraperHistoryFile {
  jobs: StoredScrapeJobSummary[];
}

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
    return [
      {
        ...row,
        finishedAt:
          typeof row.finishedAt === 'number' && Number.isFinite(row.finishedAt)
            ? row.finishedAt
            : 0,
      } as StoredScrapeJobSummary,
    ];
  });
}
