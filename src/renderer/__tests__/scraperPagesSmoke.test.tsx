// @vitest-environment jsdom
/**
 * Every Scraper page mounts, against the sample-data port, without throwing.
 *
 * Pages take zero props and read everything through the controller and the
 * port, so a page that crashes on first render (a missing guard on an optional
 * bridge method, a fixture field a refactor renamed) takes the whole Scraper
 * window down with it. This is the cheapest net under all of them at once.
 */
import { act, createElement, type ComponentType } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import DashboardPage from '../components/scraper/pages/DashboardPage';
import NewScrapePage from '../components/scraper/pages/NewScrapePage';
import DiscoverPage from '../components/scraper/pages/DiscoverPage';
import SourceManagerPage from '../components/scraper/pages/SourceManagerPage';
import TorrentManagerPage from '../components/scraper/pages/TorrentManagerPage';
import { DownloadsPage, ExportsPage, HistoryPage, ResultsPage } from '../components/scraper/pages/DataPages';
import { PluginsPage, ProfilesPage, ScheduledPage, SiteRulesPage } from '../components/scraper/pages/ManagementPages';
import {
  HttpInspectorPage,
  RegexTesterPage,
  ScriptConsolePage,
  SelectorTesterPage,
} from '../components/scraper/pages/ToolPages';
import type { ScraperController } from '../components/scraper/types';
import { SCRAPER_NAV } from '../components/scraper/scraperPages';
import { setUiLang } from '../i18n';
import { ensureCatalog } from '../../shared/i18n/catalogs';

const PAGES: ReadonlyArray<readonly [string, ComponentType]> = [
  ['dashboard', DashboardPage],
  ['new-scrape', NewScrapePage],
  ['discover', DiscoverPage],
  ['sources', SourceManagerPage],
  ['torrents', TorrentManagerPage],
  ['history', HistoryPage],
  ['profiles', ProfilesPage],
  ['scheduled', ScheduledPage],
  ['site-rules', SiteRulesPage],
  ['plugins', PluginsPage],
  ['results', ResultsPage],
  ['downloads', DownloadsPage],
  ['exports', ExportsPage],
  ['selector-tester', SelectorTesterPage],
  ['regex-tester', RegexTesterPage],
  ['http-inspector', HttpInspectorPage],
  ['script-console', ScriptConsolePage],
];

/** The whole controller surface, inert: a smoke test needs every field present, none of them doing anything. */
function controller(page: string): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    page,
    navigate: vi.fn(),
    focusSettingId: null,
    clearFocusSetting: vi.fn(),
    railCollapsed: false,
    toggleRail: vi.fn(),
    compact: false,
    setCompact: vi.fn(),
    advancedMode: true,
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
    systemStats: { memoryMb: 100, cpuPercent: 1, activeJobs: 0 },
    dashboardJobActive: false,
    cancelDashboardJob: vi.fn(),
    sourceId: null,
    openSource: vi.fn(),
    clearSource: vi.fn(),
    torrentQuery: null,
    clearTorrentQuery: vi.fn(),
    findTorrents: vi.fn(),
    recentPages: [],
  } as unknown as ScraperController;
}

let host: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  localStorage.clear();
  const noop = (): void => undefined;
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe = noop;
    unobserve = noop;
    disconnect = noop;
  };
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  host.remove();
  localStorage.clear();
  vi.restoreAllMocks();
});

async function mount(id: string, Page: ComponentType): Promise<void> {
  await act(async () => {
    root = createRoot(host);
    root.render(
      createElement(
        ScraperPortProvider,
        { value: createMockScraperPort() },
        createElement(ScraperProvider, { value: controller(id) }, createElement(Page)),
      ),
    );
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

describe('Scraper pages — coverage and language (round 2)', () => {
  it('this smoke test covers every page the rail can open', () => {
    expect(PAGES.map(([id]) => id).sort()).toEqual(SCRAPER_NAV.map((page) => page.id).sort());
  });

  it.each(PAGES)('%s renders in Russian with no raw catalog key', async (id, Page) => {
    await ensureCatalog('ru');
    setUiLang('ru');
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      await mount(id, Page);
      expect(host.querySelector('.scr-page')).not.toBeNull();
      expect(host.textContent ?? '').not.toMatch(/\b(?:scr2|scraperFix|scrApp|scraperDrawer)\.[\w.-]+/);
    } finally {
      setUiLang('en');
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  });

  it('the Torrent Manager offers .torrent files when the bridge can add them', async () => {
    (window as unknown as { api: unknown }).api = { scraperQbitAddTorrentFiles: vi.fn() };
    try {
      await mount('torrents', TorrentManagerPage);
      const card = host.querySelector('[data-scr-card="qbit-torrent-files"]');
      expect(card).not.toBeNull();
      expect(card?.querySelector('input[type="file"][accept*=".torrent"]')).not.toBeNull();
    } finally {
      delete (window as { api?: unknown }).api;
    }
  });
});

describe('Scraper pages — each one renders', () => {
  it.each(PAGES)('%s mounts without throwing', async (id, Page) => {
    await act(async () => {
      root = createRoot(host);
      root.render(
        createElement(
          ScraperPortProvider,
          { value: createMockScraperPort() },
          createElement(ScraperProvider, { value: controller(id) }, createElement(Page)),
        ),
      );
    });
    // Let the port's first answers land, so the populated render runs too.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(host.querySelector('.scr-page')).not.toBeNull();
  });
});
