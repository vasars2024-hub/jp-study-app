// Scraper — application root.
//
// Owns the shell state, builds the one controller object every page reads, and
// lays out the reference design: title bar, left rail, page pane, settings
// drawer, status bar. Pages take zero props (the Settings app's pattern), so
// adding a page never means threading state through here.

import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AppChrome, showToast, useAeroMaterials, type MenuBarMenu } from '../ui';
import ScraperNav, { type ScraperSystemStats } from './ScraperNav';
import ScraperTopBar from './ScraperTopBar';
import ScraperStatusBar from './ScraperStatusBar';
import Icon from '../Icons';
import { ScraperProvider } from './ScraperContext';
import { SCRAPER_NAV } from './scraperPages';
import type { ScraperController } from './types';
import {
  loadScraperShellState,
  onScraperShellChanged,
  patchScraperShellState,
  navigateScraperShell,
} from '../../scraperShellStore';
import type {
  ScraperColumnId,
  ScraperDensity,
  ScraperPageId,
  ScraperResultTab,
  ScraperSortDir,
} from '../../../shared/scraperShell';
import { sx } from './strings';
import { useT } from '../../i18n';
import './scraper.css';

import DashboardPage from './pages/DashboardPage';
import NewScrapePage from './pages/NewScrapePage';
import SourceManagerPage from './pages/SourceManagerPage';
import TorrentManagerPage from './pages/TorrentManagerPage';
import { DownloadsPage, ExportsPage, HistoryPage, ResultsPage } from './pages/DataPages';
import {
  PluginsPage,
  ProfilesPage,
  ScheduledPage,
  SiteRulesPage,
} from './pages/ManagementPages';
import {
  HttpInspectorPage,
  RegexTesterPage,
  ScriptConsolePage,
  SelectorTesterPage,
} from './pages/ToolPages';
import { ScraperPortProvider } from './data/scraperPort';
import { createMockScraperPort } from './data/mockScraperPort';
import { createIpcScraperPort } from './data/ipcScraperPort';
import {
  loadScraperSettingsDocument,
  onScraperSettingsChanged,
} from '../../scraperSettingsStore';
import { resolveScraperSettings } from '../../../shared/scraperSettings';
import { isRunningStage } from '../../../shared/scraperResults';
import { formatAgeMinutes } from './data/charts';
import { nextScheduledStatus } from './data/statusSummary';
import { countActiveScraperJobs } from './data/jobActivity';

// Discover pulls in the whole discovery console plus its IPC surface; the Tools
// pages are rarely opened. Both stay out of the initial scraper chunk.
const DiscoverPage = lazy(() => import('./pages/DiscoverPage'));
// Twenty setting groups and their field schema; only loaded once the drawer is
// actually opened.
const ScraperSettingsDrawer = lazy(() => import('./settings/ScraperSettingsDrawer'));

const ADVANCED_MODE_KEY = 'jp-scraper-advanced-v1';
const FOCUS_CLEAR_MS = 2200;

function readAdvancedMode(): boolean {
  try {
    return localStorage.getItem(ADVANCED_MODE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeAdvancedMode(on: boolean): void {
  try {
    localStorage.setItem(ADVANCED_MODE_KEY, on ? '1' : '0');
  } catch {
    /* storage unavailable — the mode simply won't persist */
  }
}

export default function ScraperApp() {
  const aero = useAeroMaterials();
  // `sx()` is a plain function, not a hook, so nothing under this root would
  // otherwise notice a language switch: the catalog changes and the tree keeps
  // its English render until something unrelated happens to re-render it. One
  // subscription here re-renders the whole app, the same shape the theme uses.
  //
  // Only the subscription is wanted, not the returned `t`. No memo under this
  // root caches resolved text today — checked across all 40 `useMemo` bodies in
  // `scraper/`, none calls `sx*()` — and the nav/settings registries store KEYS
  // and resolve at render (`scraperPages.ts:3`). Any memo added later that does
  // cache text must take `lang` as a dependency, per CLAUDE.md's i18n rule.
  useT();
  const [shell, setShell] = useState(() => loadScraperShellState());
  useEffect(() => onScraperShellChanged(setShell), []);
  const [advancedMode, setAdvancedModeState] = useState(readAdvancedMode);
  const [focusSettingId, setFocusSettingId] = useState<string | null>(null);
  const [targetUrl, setTargetUrl] = useState('');
  const [resultSeriesId, setResultSeriesId] = useState<string | null>(null);
  const [dashboardJobActive, setDashboardJobActive] = useState(false);
  const [transientJobActive, setTransientJobActive] = useState(false);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [torrentQuery, setTorrentQuery] = useState<string | null>(null);
  const [lastScrape, setLastScrape] = useState<string | null>(null);
  const [settingsDocument, setSettingsDocument] = useState(loadScraperSettingsDocument);

  // Mock mode pins every screen to sample data; otherwise the IPC port takes
  // over method by method, using the mock as its fallback for anything main
  // does not implement yet.
  const mockMode = useMemo(
    () => resolveScraperSettings(settingsDocument).developer.mockMode,
    [settingsDocument],
  );
  const port = useMemo(() => {
    const mock = createMockScraperPort();
    if (mockMode) return mock;
    // A live call that fails is said out loud, once per method and message
    // every half minute — the rail's 3-second stats poll must not turn one
    // outage into a stack of identical toasts.
    const recent = new Map<string, number>();
    return createIpcScraperPort(mock, {
      onError: (method, error) => {
        const message = error instanceof Error ? error.message : String(error);
        const key = `${method}\u0000${message}`;
        const now = Date.now();
        if ((recent.get(key) ?? 0) > now - 30_000) return;
        recent.set(key, now);
        showToast({ title: sx('error.backendCall'), message, kind: 'error' });
      },
    });
  }, [mockMode]);

  // The rail's STATUS block, polled from the port. With a backend these are the
  // app's real resident set, CPU share and running-job count.
  const [stats, setStats] = useState<ScraperSystemStats>({
    memoryMb: 0,
    cpuPercent: 0,
    activeJobs: 0,
  });

  useEffect(() => {
    let alive = true;
    const sample = () => {
      void port.systemStats().then((next) => {
        if (alive) setStats(next);
      }).catch(() => undefined);
    };
    sample();
    const timer = window.setInterval(sample, 3000);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [port]);

  // Seed the status bar from real history: "last scrape" is the newest job on
  // disk, and a job still sitting in a running stage keeps the rail lit after a
  // reload. Without a backend `listJobs()` falls through to the mock, so this
  // stays populated in sample mode too.
  useEffect(() => {
    let alive = true;
    void port.listJobs().then((jobs) => {
      if (!alive || !jobs.length) return;
      const newest = jobs.reduce((a, b) => (b.ageMinutes < a.ageMinutes ? b : a));
      setLastScrape(formatAgeMinutes(newest.ageMinutes));
      setDashboardJobActive(jobs.some((job) => isRunningStage(job.stage)));
    }).catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [port]);

  useEffect(() => onScraperSettingsChanged(setSettingsDocument), []);

  // In-app notices, for `notifications.channel` = 'toast' or 'both'. main has
  // already applied the per-event toggles, the channel and the digest window, so
  // anything arriving here is meant to be shown; the title and body are composed
  // in shared/scraperNotices.ts because the system-notification half of the same
  // setting is rendered by Electron in main and cannot reach strings.ts.
  useEffect(() => window.api?.scraperOnNotice?.((notice) => {
    showToast({
      title: notice.title,
      message: notice.body,
      kind: notice.kind === 'error' ? 'error' : 'default',
    });
  }), []);

  const nextScheduled = useMemo(() => {
    const scheduler = resolveScraperSettings(settingsDocument).scheduler;
    if (!scheduler.enabled || !scheduler.entries.length) return null;
    return nextScheduledStatus(scheduler.entries);
  }, [settingsDocument]);

  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{
        active?: boolean;
        lastScrape?: string;
      }>).detail;
      if (!detail) return;
      if (typeof detail.active === 'boolean') {
        setTransientJobActive(detail.active);
      }
      if (detail.lastScrape) setLastScrape(detail.lastScrape);
    };
    window.addEventListener('scraper:job-status', handle);
    return () => window.removeEventListener('scraper:job-status', handle);
  }, []);

  // Highlight a deep-linked card briefly, then release it so a later visit to
  // the same page doesn't re-flash something the user has already seen.
  useEffect(() => {
    if (!focusSettingId) return;
    const timer = window.setTimeout(() => setFocusSettingId(null), FOCUS_CLEAR_MS);
    return () => window.clearTimeout(timer);
  }, [focusSettingId]);

  const navigate = useCallback((page: ScraperPageId, settingId?: string) => {
    setShell(navigateScraperShell(page));
    setFocusSettingId(settingId ?? null);
  }, []);

  const patch = useCallback((next: Parameters<typeof patchScraperShellState>[0]) => {
    setShell(patchScraperShellState(next));
  }, []);

  // Cross-app deep links, matching the Settings app's 'settings:navigate'.
  useEffect(() => {
    const handle = (event: Event) => {
      const detail = (event as CustomEvent<{ page?: ScraperPageId; settingId?: string }>).detail;
      if (!detail?.page) return;
      navigate(detail.page, detail.settingId);
    };
    window.addEventListener('scraper:navigate', handle);
    return () => window.removeEventListener('scraper:navigate', handle);
  }, [navigate]);

  const setAdvancedMode = useCallback((on: boolean) => {
    writeAdvancedMode(on);
    setAdvancedModeState(on);
  }, []);

  const openResultSeries = useCallback((seriesId: string) => {
    setResultSeriesId(seriesId);
    navigate('results');
  }, [navigate]);

  const clearResultSeries = useCallback(() => setResultSeriesId(null), []);
  const cancelDashboardJob = useCallback(() => setDashboardJobActive(false), []);
  const openSource = useCallback((nextSourceId: string) => {
    setSourceId(nextSourceId);
    navigate('sources');
  }, [navigate]);
  const clearSource = useCallback(() => setSourceId(null), []);
  const findTorrents = useCallback((query: string) => {
    setTorrentQuery(query);
    navigate('torrents');
  }, [navigate]);
  const clearTorrentQuery = useCallback(() => setTorrentQuery(null), []);
  const activeJobCount = countActiveScraperJobs(dashboardJobActive, transientJobActive);
  // One composed reading, handed to the rail AND to every page through the
  // controller. Pages used to take their own one-shot `systemStats()` at mount
  // and never re-read it, so the Dashboard's runtime card sat frozen at the
  // moment it was opened while the rail two inches away kept sampling.
  const systemStats = useMemo<ScraperSystemStats>(
    () => ({ ...stats, activeJobs: activeJobCount }),
    [stats, activeJobCount],
  );

  // Turning Advanced off while sitting on an advanced-only page would strand
  // the user on a screen the rail no longer lists.
  useEffect(() => {
    if (advancedMode) return;
    const meta = SCRAPER_NAV.find((p) => p.id === shell.page);
    if (meta?.advanced) navigate('dashboard');
  }, [advancedMode, shell.page, navigate]);

  const controller = useMemo<ScraperController>(
    () => ({
      shell,
      page: shell.page,
      navigate,
      focusSettingId,
      clearFocusSetting: () => setFocusSettingId(null),

      railCollapsed: shell.railCollapsed,
      toggleRail: () => patch({ railCollapsed: !shell.railCollapsed }),
      compact: shell.compact,
      setCompact: (on: boolean) => patch({ compact: on }),
      advancedMode,
      setAdvancedMode,

      drawerOpen: shell.drawerOpen,
      drawerCategory: shell.drawerCategory,
      openDrawer: (category?: string) =>
        patch({ drawerOpen: true, drawerCategory: category ?? shell.drawerCategory }),
      closeDrawer: () => patch({ drawerOpen: false }),

      resultTab: shell.resultTab,
      setResultTab: (tab: ScraperResultTab) => patch({ resultTab: tab }),
      visibleColumns: shell.visibleColumns,
      setVisibleColumns: (ids: ScraperColumnId[]) => patch({ visibleColumns: ids }),
      sortColumn: shell.sortColumn,
      sortDir: shell.sortDir,
      setSort: (column: ScraperColumnId, dir: ScraperSortDir) =>
        patch({ sortColumn: column, sortDir: dir }),
      groupBy: shell.groupBy,
      setGroupBy: (value: string) => patch({ groupBy: value }),
      pageSize: shell.pageSize,
      setPageSize: (n: number) => patch({ pageSize: n }),
      density: shell.density,
      setDensity: (d: ScraperDensity) => patch({ density: d }),

      targetUrl,
      setTargetUrl,

      resultSeriesId,
      openResultSeries,
      clearResultSeries,

      systemStats,

      dashboardJobActive,
      cancelDashboardJob,

      sourceId,
      openSource,
      clearSource,

      torrentQuery,
      findTorrents,
      clearTorrentQuery,

      recentPages: shell.recentPages,
    }),
    [
      shell,
      navigate,
      focusSettingId,
      patch,
      advancedMode,
      setAdvancedMode,
      targetUrl,
      resultSeriesId,
      openResultSeries,
      clearResultSeries,
      systemStats,
      dashboardJobActive,
      cancelDashboardJob,
      sourceId,
      openSource,
      clearSource,
      torrentQuery,
      findTorrents,
      clearTorrentQuery,
    ],
  );

  const body = (() => {
    switch (shell.page) {
      case 'dashboard':
        return <DashboardPage />;
      case 'new-scrape':
        return <NewScrapePage />;
      case 'discover':
        return <DiscoverPage />;
      case 'sources':
        return <SourceManagerPage />;
      case 'torrents':
        return <TorrentManagerPage />;
      case 'history':
        return <HistoryPage />;
      case 'profiles':
        return <ProfilesPage />;
      case 'scheduled':
        return <ScheduledPage />;
      case 'site-rules':
        return <SiteRulesPage />;
      case 'plugins':
        return <PluginsPage />;
      case 'results':
        return <ResultsPage />;
      case 'downloads':
        return <DownloadsPage />;
      case 'exports':
        return <ExportsPage />;
      case 'selector-tester':
        return <SelectorTesterPage />;
      case 'regex-tester':
        return <RegexTesterPage />;
      case 'http-inspector':
        return <HttpInspectorPage />;
      case 'script-console':
        return <ScriptConsolePage />;
      default:
        return <DashboardPage />;
    }
  })();

  const menus: MenuBarMenu[] = [
    {
      id: 'file',
      label: sx('app.menu.file'),
      items: [
        { id: 'new', label: sx('app.newScrape'), onSelect: () => navigate('new-scrape') },
        { id: 'history', label: sx('nav.history'), onSelect: () => navigate('history') },
        { id: 'exports', label: sx('nav.exports'), onSelect: () => navigate('exports') },
      ],
    },
    {
      id: 'view',
      label: sx('app.menu.view'),
      items: [
        { id: 'dashboard', label: sx('nav.dashboard'), onSelect: () => navigate('dashboard') },
        { id: 'discover', label: sx('nav.discover'), onSelect: () => navigate('discover') },
        { id: 'results', label: sx('nav.results'), onSelect: () => navigate('results') },
        {
          id: 'rail',
          label: sx('app.toggleRail'),
          onSelect: () => patch({ railCollapsed: !shell.railCollapsed }),
        },
      ],
    },
    {
      id: 'tools',
      label: sx('app.menu.tools'),
      items: [
        { id: 'sources', label: sx('nav.sources'), onSelect: () => navigate('sources') },
        { id: 'torrents', label: sx('nav.torrents'), onSelect: () => navigate('torrents') },
        { id: 'settings', label: sx('app.settings'), onSelect: () => controller.openDrawer() },
      ],
    },
  ];

  const shellBody = (
    <ScraperProvider value={controller}>
      <ScraperPortProvider value={port}>
      <div
        className={`scr-shell${shell.railCollapsed ? ' is-rail-collapsed' : ''}${
          shell.compact ? ' is-compact' : ''
        }${shell.drawerOpen ? ' is-drawer-open' : ''}`}
        data-density={shell.density}
      >
        <ScraperTopBar />
        {shell.compact && (
          <nav className="scr-compact-tabs" aria-label={sx('nav.ariaCategories')}>
            <button
              type="button"
              className={shell.page === 'new-scrape' && !shell.drawerOpen ? 'is-active' : ''}
              onClick={() => {
                controller.closeDrawer();
                navigate('new-scrape');
              }}
            >
              <Icon name="sparkle" size={14} />
              {sx('nav.group.scraper')}
            </button>
            <button
              type="button"
              className={shell.drawerOpen ? 'is-active' : ''}
              onClick={() => controller.openDrawer('network')}
            >
              <Icon name="settings" size={14} />
              {sx('app.settings')}
            </button>
            <button
              type="button"
              className={shell.page === 'profiles' ? 'is-active' : ''}
              onClick={() => {
                controller.closeDrawer();
                navigate('profiles');
              }}
            >
              <Icon name="shield" size={14} />
              {sx('app.profiles')}
            </button>
            <button
              type="button"
              className={shell.page === 'new-scrape' && shell.resultTab === 'logs' ? 'is-active' : ''}
              onClick={() => {
                controller.closeDrawer();
                controller.setResultTab('logs');
                navigate('new-scrape');
              }}
            >
              <Icon name="file-text" size={14} />
              {sx('result.tab.logs')}
            </button>
          </nav>
        )}
        <div className="scr-body">
          <ScraperNav stats={systemStats} />
          <main className="scr-main" key={shell.page}>
            <Suspense fallback={<div className="scr-loading">{sx('nav.statusRunning')}…</div>}>
              {body}
            </Suspense>
          </main>
          {shell.drawerOpen && (
            <Suspense fallback={null}>
              <ScraperSettingsDrawer />
            </Suspense>
          )}
        </div>
        <ScraperStatusBar
          running={activeJobCount > 0}
          lastScrape={lastScrape}
          nextScheduled={nextScheduled}
          selected={0}
        />
      </div>
      </ScraperPortProvider>
    </ScraperProvider>
  );

  if (aero) {
    return (
      <AppChrome menus={menus} className="scr-chrome">
        {shellBody}
      </AppChrome>
    );
  }
  return shellBody;
}
