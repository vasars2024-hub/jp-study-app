// @vitest-environment jsdom
/*
 * D321 — History printed two adjacent numbers in two different formats.
 *
 * Seen live 2026-09-08 on the user's own history (pid 4652, window 1): the tile
 * row read `EPISODES FOUND 2,453` beside `FAILED CHECKS 2156`, and the ONE PIECE
 * row read `1,147` in FOUND beside `1078` in FAILED — same page, same row,
 * neighbouring columns. `found` went through `toLocaleString()`; `failed` was
 * interpolated raw.
 *
 * The contract asserted here is the one that cannot rot: for every job the page
 * shows, BOTH numeric cells must equal that value's own `toLocaleString()`. That
 * holds at any magnitude and in any locale, so it does not have to be rewritten
 * when the fixtures change.
 *
 * The job below carries the user's real figures (found 1,147 / failed 1,078)
 * precisely so the test is not vacuous: under 1,000 the two formats agree and a
 * regression would pass unseen.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import { HistoryPage } from '../components/scraper/pages/DataPages';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import type { ScraperController } from '../components/scraper/types';
import type { ScrapeJobSummary } from '../../shared/scraperResults';

const JOBS: ScrapeJobSummary[] = [
  {
    id: 'job-one-piece', seriesId: 'anilist-21', titleEn: 'ONE PIECE', titleJa: 'ONE PIECE',
    provider: 'AniList', profile: 'balanced', stage: 'done', ageMinutes: 59_441,
    durationSec: 15, found: 1147, failed: 1078, bytes: 0,
  } as unknown as ScrapeJobSummary,
  {
    id: 'job-frieren', seriesId: 'anilist-154587', titleEn: 'Frieren', titleJa: '葬送のフリーレン',
    provider: 'AniList', profile: 'balanced', stage: 'done', ageMinutes: 59_000,
    durationSec: 3, found: 28, failed: 0, bytes: 0,
  } as unknown as ScrapeJobSummary,
];

let root: Root | null = null;

function controller(): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    page: 'history',
    navigate: vi.fn(),
    setTargetUrl: vi.fn(),
    openStoredResult: vi.fn(),
    openResultSeries: vi.fn(),
    systemStats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 },
  } as unknown as ScraperController;
}

async function mountHistory() {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const port = { ...createMockScraperPort(), listJobs: async () => JOBS };
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(createElement(
      ScraperPortProvider,
      { value: port },
      createElement(ScraperProvider, { value: controller() }, createElement(HistoryPage)),
    ));
  });
  return host;
}

beforeEach(() => {
  // jsdom has no ResizeObserver and the Scraper's layout hook constructs one on
  // mount. A no-op observer is enough: nothing here measures a box.
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

describe('Scraper History — one number format across the row', () => {
  it('groups the FAILED column the same way it groups FOUND', async () => {
    const host = await mountHistory();
    const text = host.innerText || host.textContent || '';
    // Non-vacuity: the subject must actually be four digits, or the two
    // formats are indistinguishable and this proves nothing.
    expect(JOBS[0].failed).toBeGreaterThanOrEqual(1000);
    for (const job of JOBS) {
      expect(text).toContain(job.found.toLocaleString());
      expect(text).toContain(job.failed.toLocaleString());
    }
    // The raw form of the four-digit failure count must NOT appear anywhere.
    expect(String(JOBS[0].failed)).not.toBe(JOBS[0].failed.toLocaleString());
    expect(text.includes(String(JOBS[0].failed))).toBe(false);
  });

  it('groups the summed "Failed checks" tile the same way as "Episodes found"', async () => {
    const host = await mountHistory();
    const tiles = Array.from(host.querySelectorAll('.scr-tile')).map((el) => ({
      label: el.querySelector('.scr-tile-label')?.textContent ?? '',
      value: el.querySelector('.scr-tile-value')?.textContent ?? '',
    }));
    const found = tiles.find((t) => /Episodes found/i.test(t.label));
    const failed = tiles.find((t) => /Failed checks/i.test(t.label));
    expect(found?.value).toBe((1147 + 28).toLocaleString());
    expect(failed?.value).toBe((1078 + 0).toLocaleString());
    // Both four-digit here, so a raw-interpolation regression changes one and
    // not the other — which is exactly what the user saw.
    expect(failed?.value).not.toBe(String(1078));
  });
});
