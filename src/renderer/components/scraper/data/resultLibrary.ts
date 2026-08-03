import type { EpisodeRow } from '../../../../shared/scraperResults';
import type { FixtureSeries } from './fixtures';

export type ResultLibraryFilter = 'all' | 'problems' | 'complete';

/**
 * The Results library holds one entry per *job*, so its id must be per job.
 *
 * `result.seriesId` identifies the series, not the run. Scraping the same show
 * twice produced two entries sharing one id, and `summarizeSeriesResults`'
 * row join then matched every run's rows to every entry — five proof runs of
 * one series read as "500% catalogue coverage · 140 / 28". Found during the
 * Phase 4 live re-verification of `page.results`.
 */
export function librarySeriesId(jobId: string, seriesId: string): string {
  return `${jobId}:${seriesId}`;
}

export interface ResultLibraryInput {
  jobId: string;
  seriesId: string;
  series: FixtureSeries;
  episodes: EpisodeRow[];
}

/**
 * Pairs each job's entry with only that job's rows, re-tagging the rows to the
 * per-job id so the join in `summarizeSeriesResults` stays one-to-one.
 */
export function buildResultLibrary(
  inputs: ResultLibraryInput[],
): { series: FixtureSeries[]; rows: EpisodeRow[] } {
  const series: FixtureSeries[] = [];
  const rows: EpisodeRow[] = [];
  for (const input of inputs) {
    const id = librarySeriesId(input.jobId, input.seriesId);
    series.push({ ...input.series, id });
    for (const episode of input.episodes) rows.push({ ...episode, seriesId: id });
  }
  return { series, rows };
}

export interface SeriesResultSummary {
  series: FixtureSeries;
  episodes: EpisodeRow[];
  expected: number;
  withJapanese: number;
  failed: number;
  warned: number;
  missing: number;
  bytes: number;
  durationSec: number;
}

export function summarizeSeriesResults(
  seriesList: FixtureSeries[],
  episodes: EpisodeRow[],
): SeriesResultSummary[] {
  return seriesList.map((series) => {
    const own = episodes.filter((episode) => episode.seriesId === series.id);
    return {
      series,
      episodes: own,
      expected: series.episodes,
      withJapanese: own.filter((episode) =>
        episode.subtitles.some((subtitle) => subtitle.language === 'ja')).length,
      failed: own.filter((episode) => episode.status === 'failed').length,
      warned: own.filter((episode) => episode.status === 'warning').length,
      missing: Math.max(0, series.episodes - own.length),
      bytes: own.reduce((sum, episode) => sum + episode.sizeBytes, 0),
      durationSec: own.reduce((sum, episode) => sum + episode.durationSec, 0),
    };
  });
}

export function filterSeriesResults(
  summaries: SeriesResultSummary[],
  filter: ResultLibraryFilter,
  query: string,
): SeriesResultSummary[] {
  const needle = query.trim().toLowerCase();
  return summaries.filter((summary) => {
    const hasProblems = summary.failed > 0 || summary.warned > 0 || summary.missing > 0;
    if (filter === 'problems' && !hasProblems) return false;
    if (filter === 'complete' && hasProblems) return false;
    if (!needle) return true;
    return [
      summary.series.titleEn,
      summary.series.titleJa,
      summary.series.provider,
      summary.series.id,
    ].some((value) => value.toLowerCase().includes(needle));
  });
}

export function buildSeriesResultReport(summary: SeriesResultSummary): {
  filename: string;
  content: string;
} {
  const filename = `${summary.series.id.replace(/[^a-z0-9._-]+/gi, '-')}-result-report.json`;
  return {
    filename,
    content: JSON.stringify({
      generatedAt: new Date().toISOString(),
      series: summary.series,
      result: {
        found: summary.episodes.length,
        expected: summary.expected,
        japaneseSubtitles: summary.withJapanese,
        failed: summary.failed,
        warnings: summary.warned,
        missing: summary.missing,
        bytes: summary.bytes,
        durationSec: summary.durationSec,
      },
      episodes: summary.episodes.map((episode) => ({
        number: episode.number,
        numberLabel: episode.numberLabel,
        titleEn: episode.titleEn,
        titleJa: episode.titleJa,
        resolution: episode.resolution,
        source: episode.sourceLabel,
        status: episode.status,
        subtitles: episode.subtitles.map((subtitle) => subtitle.language),
        url: episode.url,
      })),
    }, null, 2),
  };
}
