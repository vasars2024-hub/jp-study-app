// @vitest-environment jsdom
/*
 * D322 — the Results page said "SERIES 10" over a library the Dashboard called
 * 5 series, and "EPISODES 2,453" over 1,193 episodes.
 *
 * Both come from the same cause, and it is the per-job fix working as intended:
 * `librarySeriesId` is job-scoped, so a series scraped five times is five rows
 * in this library. That is deliberate — it is what stopped five proof runs of
 * Frieren reading as "500% catalogue coverage". What was never updated is what
 * the page CALLS those rows, and the totals it sums over them.
 *
 * So the fix is a label plus a deduplicated total, not a regrouping: the first
 * tile counts results (which is what the cards below it are), and the episode
 * tiles key on `EpisodeRow.id`, which `buildResultLibrary` leaves untouched.
 *
 * The fixture is the user's own shape — ONE PIECE twice, Frieren twice — so a
 * regression that goes back to summing rows changes the number under test.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import { ResultsPage } from '../components/scraper/pages/DataPages';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import type { ScraperController } from '../components/scraper/types';
import type { EpisodeRow, ScrapeJobSummary } from '../../shared/scraperResults';

function job(id: string, seriesId: string, titleEn: string, found: number): ScrapeJobSummary {
  return {
    id, seriesId, titleEn, titleJa: titleEn, provider: 'AniList', profile: 'balanced',
    stage: 'done', ageMinutes: 100, durationSec: 3, found, failed: 0, bytes: 0,
  } as unknown as ScrapeJobSummary;
}

function episodes(seriesId: string, count: number): EpisodeRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${seriesId}-e${i + 1}`, seriesId, number: i + 1, numberLabel: String(i + 1), season: 1,
    titleEn: `Episode ${i + 1}`, titleJa: `第${i + 1}話`, kind: 'episode', audio: [],
    resolution: '1080p', sourceId: 'catalogue', sourceLabel: 'Catalogue', sizeBytes: 0,
    durationSec: 1440, airDate: null, url: '', thumbnailUrl: null, subtitles: [],
    status: 'ready', statusNote: '',
  }) as unknown as EpisodeRow);
}

// Four runs over two series: 3 + 2 = 5 distinct episodes, 10 rows.
const JOBS = [
  job('j1', 'anilist-21', 'ONE PIECE', 3),
  job('j2', 'anilist-21', 'ONE PIECE', 3),
  job('j3', 'anilist-154587', 'Frieren', 2),
  job('j4', 'anilist-154587', 'Frieren', 2),
];
const RESULT: Record<string, EpisodeRow[]> = {
  j1: episodes('anilist-21', 3),
  j2: episodes('anilist-21', 3),
  j3: episodes('anilist-154587', 2),
  j4: episodes('anilist-154587', 2),
};

let root: Root | null = null;

async function mountResults() {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const port = {
    ...createMockScraperPort(),
    listJobs: async () => JOBS,
    getResult: async (jobId: string) => {
      const summary = JOBS.find((j) => j.id === jobId);
      const rows = RESULT[jobId] ?? [];
      return {
        jobId,
        seriesId: summary?.seriesId ?? '',
        episodes: rows,
        streams: [], torrents: [], images: [], logs: [],
        // `seriesFromResult` reads titles and `episodeCount` off this, and
        // `episodeCount` is what per-card coverage is measured against.
        metadata: {
          titleEn: summary?.titleEn ?? '', titleJa: summary?.titleJa ?? '',
          episodeCount: rows.length, synopsis: '', genres: [], year: 2024,
          status: 'finished', coverUrl: null, bannerUrl: null, studios: [],
          externalIds: {},
        },
      };
    },
  };
  const ctl = {
    shell: DEFAULT_SCRAPER_SHELL_STATE, page: 'results', navigate: vi.fn(),
    setTargetUrl: vi.fn(), openStoredResult: vi.fn(), openResultSeries: vi.fn(),
    resultSeriesId: null, clearResultSeries: vi.fn(),
    systemStats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 },
  } as unknown as ScraperController;
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(createElement(
      ScraperPortProvider,
      { value: port as never },
      createElement(ScraperProvider, { value: ctl }, createElement(ResultsPage)),
    ));
  });
  // The page loads its library in an effect chain; let it settle.
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return host;
}

function tile(host: HTMLElement, label: RegExp): string {
  const found = Array.from(host.querySelectorAll('.scr-tile')).find((el) =>
    label.test(el.querySelector('.scr-tile-label')?.textContent ?? ''));
  return found?.querySelector('.scr-tile-value')?.textContent?.trim() ?? '';
}

beforeEach(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() { /* no-op */ }
    unobserve() { /* no-op */ }
    disconnect() { /* no-op */ }
  };
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
});

describe('Scraper Results — the totals describe what the cards are', () => {
  it('counts EPISODES once per episode, not once per run', async () => {
    const host = await mountResults();
    // 10 rows across 4 runs; 5 distinct episodes.
    expect(tile(host, /episodes/i)).toBe('5');
    expect(tile(host, /episodes/i)).not.toBe('10');
  });

  it('labels the first tile for what it counts — results, not series', async () => {
    const host = await mountResults();
    const labels = Array.from(host.querySelectorAll('.scr-tile-label')).map((el) =>
      (el.textContent ?? '').trim());
    // 4 runs over 2 series: a tile reading 4 must not be called "Series".
    expect(tile(host, /^results$/i)).toBe('4');
    expect(labels.some((l) => /^series$/i.test(l))).toBe(false);
  });
});
