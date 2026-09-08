// @vitest-environment jsdom
/**
 * D319 — the Dashboard's Runtime card and the rail's STATUS block reported two
 * different numbers for one quantity, at the same instant, in one window.
 *
 * Measured live on 2026-09-08 (pid 4652, window 1, Scraper open): the rail read
 * `Memory: 845 MB` / `CPU: 6%` while the Runtime card two inches away read
 * `1672` / `22%`. Both are `SystemStats`. The rail re-samples `port.systemStats()`
 * every 3 s from the shell; the card took its own ONE-SHOT reading into the
 * dashboard snapshot at mount and never read again, so it froze at whatever the
 * process happened to be doing when the page was first opened.
 *
 * The control that makes this test non-vacuous is `createMockScraperPort()`,
 * whose `systemStats()` answers a fixed `{152, 2, 1}`. That is the value a
 * revived one-shot read would put on screen, and it is distinct from everything
 * the controller supplies below — so restoring the old `snap.stats` wiring fails
 * both assertions rather than merely one.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import DashboardPage from '../components/scraper/pages/DashboardPage';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import { EMPTY_SNAPSHOT } from '../components/scraper/data/dashboardData';
import type { ScraperController } from '../components/scraper/types';
import type { SystemStats } from '../../shared/scraperResults';

/** What the mock port answers, i.e. what a frozen one-shot read would show. */
const PORT_ONE_SHOT: SystemStats = { memoryMb: 152, cpuPercent: 2, activeJobs: 1 };

let root: Root | null = null;

function controller(systemStats: SystemStats): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    page: 'dashboard',
    navigate: vi.fn(),
    focusSettingId: null,
    clearFocusSetting: vi.fn(),
    railCollapsed: false,
    toggleRail: vi.fn(),
    compact: false,
    setCompact: vi.fn(),
    advancedMode: false,
    setAdvancedMode: vi.fn(),
    drawerOpen: false,
    drawerCategory: 'network',
    openDrawer: vi.fn(),
    closeDrawer: vi.fn(),
    resultTab: 'episodes',
    setResultTab: vi.fn(),
    visibleColumns: [],
    setVisibleColumns: vi.fn(),
    sortColumn: 'episode',
    sortDir: 'asc',
    setSort: vi.fn(),
    groupBy: 'none',
    setGroupBy: vi.fn(),
    pageSize: 50,
    setPageSize: vi.fn(),
    density: 'comfortable',
    setDensity: vi.fn(),
    targetUrl: '',
    setTargetUrl: vi.fn(),
    resultSeriesId: null,
    openResultSeries: vi.fn(),
    clearResultSeries: vi.fn(),
    resultJobId: null,
    openStoredResult: vi.fn(),
    clearStoredResult: vi.fn(),
    systemStats,
    dashboardJobActive: false,
    cancelDashboardJob: vi.fn(),
    sourceId: null,
    openSource: vi.fn(),
    clearSource: vi.fn(),
    recentPages: [],
  } as unknown as ScraperController;
}

async function render(systemStats: SystemStats) {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const created = root ?? createRoot(host);
  root = created;
  await act(async () => {
    created.render(createElement(
      ScraperPortProvider,
      { value: createMockScraperPort() },
      createElement(ScraperProvider, { value: controller(systemStats) },
        createElement(DashboardPage)),
    ));
  });
  return host;
}

/** The three values of the Runtime card, in render order. */
function runtimeValues(host: HTMLElement): string[] {
  const card = host.querySelector('#scr-card-runtime') ?? host.querySelector('[id*="runtime"]');
  const scope = (card as HTMLElement | null) ?? host;
  const group = scope.querySelector('.scr-mini-stats');
  if (!group) throw new Error('Runtime card has no .scr-mini-stats group');
  return Array.from(group.querySelectorAll('.scr-mini-value')).map((el) => el.textContent ?? '');
}

beforeEach(() => {
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
});

describe('Scraper Dashboard — the Runtime card reports the shell\'s live sample', () => {
  it('renders the controller reading, not the port one-shot the snapshot used to hold', async () => {
    const host = await render({ memoryMb: 845, cpuPercent: 6, activeJobs: 0 });
    const values = runtimeValues(host);
    expect(values).toEqual(['845', '6%', '0']);
    // Control: the frozen reading is a different number, so this cannot pass by
    // coincidence if the old wiring comes back.
    expect(values).not.toContain(String(PORT_ONE_SHOT.memoryMb));
  });

  it('follows the shell when the sample moves, instead of freezing at mount', async () => {
    const host = await render({ memoryMb: 845, cpuPercent: 6, activeJobs: 0 });
    expect(runtimeValues(host)).toEqual(['845', '6%', '0']);
    await render({ memoryMb: 431, cpuPercent: 41, activeJobs: 2 });
    expect(runtimeValues(host)).toEqual(['431', '41%', '2']);
  });

  it('keeps the volatile reading out of the once-per-mount snapshot entirely', () => {
    // The card can only stay honest if there is no second copy to drift from.
    expect(Object.keys(EMPTY_SNAPSHOT)).not.toContain('stats');
  });
});
