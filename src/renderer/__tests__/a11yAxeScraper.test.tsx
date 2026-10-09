// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Scraper app: every page
 * the rail can open, mounted against the sample-data port with the inert
 * controller the smoke test uses, and the whole app shell (title bar, rail,
 * status bar) with the settings drawer open.
 */
import { createElement, type ComponentType } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
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
import { SCRAPER_NAV } from '../components/scraper/scraperPages';
import type { ScraperController } from '../components/scraper/types';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

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

beforeAll(() => {
  installJsdomShims();
});

beforeEach(() => {
  localStorage.clear();
  stubBridge();
});

afterEach(async () => {
  await cleanup();
  localStorage.clear();
});

describe('Scraper — axe-core', () => {
  it('covers every page the rail can open', () => {
    expect(PAGES.map(([id]) => id).sort()).toEqual(SCRAPER_NAV.map((page) => page.id).sort());
  });

  it.each(PAGES)('page: %s', async (id, Page) => {
    const { host } = await mount(
      createElement(
        ScraperPortProvider,
        { value: createMockScraperPort() },
        createElement(ScraperProvider, { value: controller(id) }, createElement(Page)),
      ),
      60,
    );
    expect(host.querySelector('.scr-page'), 'page painted').not.toBeNull();
    expect(host.textContent?.trim().length ?? 0, 'page has text').toBeGreaterThan(20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('the app shell, with the settings drawer open', async () => {
    // `scraperOnNotice` is a subscription the shell returns from an effect; the
    // generic stub would hand back a Promise for it, so answer an unsubscribe.
    stubBridge({ scraperOnNotice: () => () => undefined });
    const { SCRAPER_SHELL_STORAGE_KEY } = await import('../scraperShellStore');
    localStorage.setItem(SCRAPER_SHELL_STORAGE_KEY, JSON.stringify({ ...DEFAULT_SCRAPER_SHELL_STATE, drawerOpen: true }));
    const { default: ScraperApp } = await import('../components/scraper/ScraperApp');
    const { host } = await mount(createElement(ScraperApp), 80);
    await settle(80);
    expect(host.querySelector('.scr-shell'), 'shell painted').not.toBeNull();
    expect(host.querySelector('nav, [role="navigation"]'), 'rail painted').not.toBeNull();
    expect(document.getElementById('scr-settings-drawer'), 'settings drawer painted').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);
  });
});
