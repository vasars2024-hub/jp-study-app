// @vitest-environment jsdom
/**
 * L8 — the Scraper settings drawer is a disclosure, and its markup has to say so.
 *
 * It was wired as `aria-pressed={drawerOpen}` on an icon button, which is the wrong
 * contract twice over: a screen reader announced "not pressed" for a panel that is
 * merely closed, and nothing in the DOM linked the control to the ~40-control region
 * it reveals. The APG disclosure pattern — `aria-expanded` plus `aria-controls`
 * naming the region's own id — fixes both.
 *
 * Why this file exists rather than a comment: the id is shared by two components that
 * deliberately do NOT import each other (`settings/ScraperSettingsDrawer` is
 * `lazy()`-loaded from `ScraperApp`, so the top bar importing it would undo the code
 * split). `drawerId.ts` is the one leaf module both take it from, and these cases are
 * what proves the pointer still resolves. `aria-controls` naming an id nothing renders
 * is invisible to every check in this repo except this one.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import ScraperTopBar from '../components/scraper/ScraperTopBar';
import ScraperSettingsDrawer from '../components/scraper/settings/ScraperSettingsDrawer';
import { SCRAPER_SETTINGS_DRAWER_ID } from '../components/scraper/drawerId';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import { ScraperPortProvider } from '../components/scraper/data/scraperPort';
import { createMockScraperPort } from '../components/scraper/data/mockScraperPort';
import type { ScraperController } from '../components/scraper/types';

let root: Root | null = null;

function controller(over: Partial<ScraperController> = {}): ScraperController {
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
    resultTab: 'results',
    setResultTab: vi.fn(),
    visibleColumns: [],
    setVisibleColumns: vi.fn(),
    sortColumn: 'title',
    sortDir: 'asc',
    setSort: vi.fn(),
    groupBy: 'none',
    setGroupBy: vi.fn(),
    pageSize: 25,
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
    systemStats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 },
    dashboardJobActive: false,
    cancelDashboardJob: vi.fn(),
    sourceId: null,
    openSource: vi.fn(),
    clearSource: vi.fn(),
    recentPages: [],
    ...over,
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.body.innerHTML = '<div id="host"></div>';
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
});

async function mount(node: React.ReactElement, over: Partial<ScraperController> = {}) {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(
      createElement(
        ScraperPortProvider,
        { value: createMockScraperPort() },
        createElement(ScraperProvider, { value: controller(over) }, node),
      ),
    );
  });
  return host;
}

function toggle(host: HTMLElement): HTMLButtonElement {
  const el = host.querySelector<HTMLButtonElement>(`[aria-controls="${SCRAPER_SETTINGS_DRAWER_ID}"]`);
  if (!el) throw new Error('no control names the settings drawer through aria-controls');
  return el;
}

describe('Scraper — the settings drawer announces itself as a disclosure', () => {
  it('gives the top bar control aria-expanded rather than aria-pressed', async () => {
    const closed = await mount(createElement(ScraperTopBar), { drawerOpen: false });
    const shut = toggle(closed);
    expect(shut.getAttribute('aria-expanded')).toBe('false');
    // aria-pressed and aria-expanded on one control are contradictory states; the
    // toggle contract is the one that had to go.
    expect(shut.hasAttribute('aria-pressed')).toBe(false);
  });

  it('flips aria-expanded with the drawer', async () => {
    const open = await mount(createElement(ScraperTopBar), { drawerOpen: true });
    expect(toggle(open).getAttribute('aria-expanded')).toBe('true');
  });

  it('renders the region the control names, with that exact id', async () => {
    const host = await mount(createElement(ScraperSettingsDrawer), { drawerOpen: true });
    const region = host.querySelector(`#${SCRAPER_SETTINGS_DRAWER_ID}`);
    expect(region, 'aria-controls must resolve to a rendered element').not.toBeNull();
    expect(region?.tagName).toBe('ASIDE');
    expect(region?.classList.contains('scr-drawer')).toBe(true);
  });

  it('puts the drawer body behind that region, so it is tucked away and not default clutter', async () => {
    const host = await mount(createElement(ScraperSettingsDrawer), { drawerOpen: true });
    const region = host.querySelector(`#${SCRAPER_SETTINGS_DRAWER_ID}`);
    const controls = region?.querySelectorAll('button,input,select,textarea,a[href]') ?? [];
    // The number is the point: this is the population category 5's Q4 stops charging
    // the surface for. If the drawer ever renders its controls OUTSIDE the region the
    // control names, the exclusion silently stops applying and Q4 regresses.
    expect(controls.length).toBeGreaterThan(12);
    for (const c of Array.from(controls)) {
      expect(c.closest(`#${SCRAPER_SETTINGS_DRAWER_ID}`)).not.toBeNull();
    }
  });

  it('renders nothing at all while the drawer is closed', async () => {
    const host = await mount(createElement(ScraperSettingsDrawer), { drawerOpen: false });
    expect(host.querySelector(`#${SCRAPER_SETTINGS_DRAWER_ID}`)).toBeNull();
  });
});
