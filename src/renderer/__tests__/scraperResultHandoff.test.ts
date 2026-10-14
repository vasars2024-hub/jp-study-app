import { describe, expect, it } from 'vitest';
import { resolveResultSeriesHandoff } from '../components/scraper/data/resultHandoff';
import { buildResultLibrary, librarySeriesId } from '../components/scraper/data/resultLibrary';
import { distinctSeries } from '../components/scraper/data/dashboardData';
import type { ScrapeJobSummary } from '../../shared/scraperResults';
import type { FixtureSeries } from '../components/scraper/data/fixtures';

function job(id: string, seriesId: string, ageMinutes: number): ScrapeJobSummary {
  return {
    id,
    seriesId,
    titleEn: seriesId,
    titleJa: '',
    provider: 'AniList',
    profile: 'balanced',
    stage: 'done',
    ageMinutes,
    durationSec: 1,
    found: 12,
    failed: 0,
    bytes: 0,
    note: '',
  } as ScrapeJobSummary;
}

const series = (id: string) => ({ id, titleEn: id }) as unknown as FixtureSeries;

describe('scraper result-series handoff', () => {
  // The ids the Results page really holds: one entry per stored RUN.
  const library = buildResultLibrary([
    { jobId: 'job-b', seriesId: 'anilist-21', series: series('anilist-21'), episodes: [] },
    { jobId: 'job-a', seriesId: 'anilist-21', series: series('anilist-21'), episodes: [] },
    { jobId: 'job-c', seriesId: 'anilist-154587', series: series('anilist-154587'), episodes: [] },
  ]);
  const available = library.series.map((entry) => entry.id);

  it('selects the exact run a Dashboard card names', () => {
    const cards = distinctSeries([job('job-a', 'anilist-21', 60), job('job-b', 'anilist-21', 5), job('job-c', 'anilist-154587', 9)]);
    // The newest run of each series, as the Dashboard shows them.
    expect(cards.map((card) => card.jobId)).toEqual(['job-b', 'job-c']);
    for (const card of cards) {
      const requested = librarySeriesId(card.jobId, card.seriesId);
      expect(resolveResultSeriesHandoff(requested, available)).toBe(requested);
    }
    expect(resolveResultSeriesHandoff('  job-a:anilist-21  ', available)).toBe('job-a:anilist-21');
  });

  it('the bare series id the Dashboard used to send now resolves to that series, not to nothing', () => {
    // Before the fix the card sent `anilist-21`, which no library entry is keyed by.
    expect(available).not.toContain('anilist-21');
    expect(resolveResultSeriesHandoff('anilist-21', available)).toBe('job-b:anilist-21');
  });

  it('falls back to a stored run of the same series when the named run has no result', () => {
    expect(resolveResultSeriesHandoff('job-gone:anilist-154587', available)).toBe('job-c:anilist-154587');
  });

  it('rejects missing, empty, and stale ids', () => {
    expect(resolveResultSeriesHandoff(null, available)).toBeNull();
    expect(resolveResultSeriesHandoff(' ', available)).toBeNull();
    expect(resolveResultSeriesHandoff('job-x:removed-series', available)).toBeNull();
    expect(resolveResultSeriesHandoff('job-x:', available)).toBeNull();
  });
});
