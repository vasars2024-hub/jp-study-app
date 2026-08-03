import { describe, expect, it } from 'vitest';
import type { EpisodeRow } from '../../shared/scraperResults';
import type { FixtureSeries } from '../components/scraper/data/fixtures';
import {
  buildResultLibrary,
  buildSeriesResultReport,
  filterSeriesResults,
  librarySeriesId,
  summarizeSeriesResults,
} from '../components/scraper/data/resultLibrary';

const SERIES_FIXTURE: FixtureSeries[] = [
  {
    id: 'complete-series',
    titleEn: 'Complete Series',
    titleJa: '完成',
    provider: 'Provider A',
    episodes: 1,
    streams: 2,
    images: 3,
  },
  {
    id: 'problem-series',
    titleEn: 'Problem Series',
    titleJa: '問題',
    provider: 'Provider B',
    episodes: 2,
    streams: 1,
    images: 1,
  },
];

function episode(
  id: string,
  seriesId: string,
  status: EpisodeRow['status'],
  subtitles: EpisodeRow['subtitles'],
): EpisodeRow {
  return {
    id,
    seriesId,
    number: 1,
    numberLabel: '第1話',
    season: 1,
    titleEn: 'Episode One',
    titleJa: '第一話',
    kind: 'episode',
    audio: 'sub',
    resolution: '1080p',
    sourceId: 'provider',
    sourceLabel: 'Provider',
    sizeBytes: 1_000,
    durationSec: 1_400,
    airDate: null,
    url: '/episode-1',
    thumbnailUrl: '',
    subtitles,
    status,
    statusNote: '',
  };
}

const EPISODES = [
  episode('e1', 'complete-series', 'ok', [
    { language: 'ja', format: 'srt', embedded: false, quality: 1, source: 'Provider' },
  ]),
  episode('e2', 'problem-series', 'failed', []),
];

describe('scraper result library helpers', () => {
  it('derives coverage, issues, size, runtime, and Japanese subtitles', () => {
    const summaries = summarizeSeriesResults(SERIES_FIXTURE, EPISODES);

    expect(summaries[0]).toMatchObject({
      expected: 1,
      withJapanese: 1,
      failed: 0,
      missing: 0,
      bytes: 1_000,
      durationSec: 1_400,
    });
    expect(summaries[1]).toMatchObject({ expected: 2, failed: 1, missing: 1 });
  });

  it('filters complete, problematic, and searched series', () => {
    const summaries = summarizeSeriesResults(SERIES_FIXTURE, EPISODES);

    expect(filterSeriesResults(summaries, 'complete', '')).toHaveLength(1);
    expect(filterSeriesResults(summaries, 'problems', '')[0].series.id).toBe('problem-series');
    expect(filterSeriesResults(summaries, 'all', 'provider a')[0].series.id).toBe('complete-series');
  });

  it('keeps two runs of one series from counting each other’s rows', () => {
    // The Phase 4 regression: both jobs scraped `problem-series`, so before the
    // per-job id every entry matched every row and coverage read 200%.
    const series: FixtureSeries = {
      id: 'problem-series',
      titleEn: 'Problem Series',
      titleJa: '問題',
      provider: 'Provider B',
      episodes: 2,
      streams: 0,
      images: 0,
    };
    const library = buildResultLibrary([
      {
        jobId: 'job-1',
        seriesId: 'problem-series',
        series,
        episodes: [episode('a1', 'problem-series', 'ok', []), episode('a2', 'problem-series', 'ok', [])],
      },
      {
        jobId: 'job-2',
        seriesId: 'problem-series',
        series,
        episodes: [episode('b1', 'problem-series', 'ok', [])],
      },
    ]);

    expect(library.series.map((s) => s.id)).toEqual([
      librarySeriesId('job-1', 'problem-series'),
      librarySeriesId('job-2', 'problem-series'),
    ]);

    const summaries = summarizeSeriesResults(library.series, library.rows);
    expect(summaries.map((s) => s.episodes.length)).toEqual([2, 1]);
    expect(summaries[0].missing).toBe(0);
    expect(summaries[1].missing).toBe(1);
  });

  it('builds a portable JSON report with episode rows', () => {
    const summary = summarizeSeriesResults(SERIES_FIXTURE, EPISODES)[0];
    const report = buildSeriesResultReport(summary);
    const parsed = JSON.parse(report.content);

    expect(report.filename).toBe('complete-series-result-report.json');
    expect(parsed.result).toMatchObject({ found: 1, expected: 1, japaneseSubtitles: 1 });
    expect(parsed.episodes[0]).toMatchObject({ titleEn: 'Episode One', subtitles: ['ja'] });
  });
});
