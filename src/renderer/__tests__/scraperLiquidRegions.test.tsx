// @vitest-environment jsdom
/**
 * L8 — which Scraper regions adopted the contextual primitive, which took the
 * opaque anchor, and why the split falls where it does.
 *
 * Category 3 asks for two numbers: dense work on translucent material must be 0,
 * and every navigation/transport/inspector region must carry Liquid treatment from
 * a SHARED primitive. Measured on this surface before the migration, both were
 * wrong in the same run — 1 dense-work region on glass and 0 of 8 contextual
 * regions treated.
 *
 * The trap this file pins, because it cost a measured round trip to find: marking
 * only `ul.scr-rail-list` moved the misclassification up one wrapper instead of
 * removing it. `div.scr-rail-group` then read as dense work for exactly the reason
 * the list had — three or more `<li>` descendants and no landmark tag — so the
 * rail declares its role at every level that holds the page list. Delete any one of
 * those three and the number goes back to non-zero.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import ScraperNav from '../components/scraper/ScraperNav';
import ScraperTopBar from '../components/scraper/ScraperTopBar';
import ScraperStatusBar from '../components/scraper/ScraperStatusBar';
import ScraperSettingsDrawer from '../components/scraper/settings/ScraperSettingsDrawer';
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
    created.render(createElement(
      ScraperPortProvider,
      { value: createMockScraperPort() },
      createElement(ScraperProvider, { value: controller(over) }, node),
    ));
  });
  return host;
}

/** Both halves of the primitive's contract, so a hand-written class cannot pass. */
function expectContextual(el: Element | null, what: string) {
  if (!el) throw new Error(`expected ${what} to be present`);
  expect(el.classList.contains('lq-contextual'), `${what} is contextual`).toBe(true);
  expect(el.getAttribute('data-lq-role'), `${what} role`).toBe('contextual');
}

function expectBareAnchor(el: Element | null, what: string) {
  if (!el) throw new Error(`expected ${what} to be present`);
  expect(el.classList.contains('lq-anchor'), `${what} is an anchor`).toBe(true);
  expect(el.getAttribute('data-lq-role'), `${what} role`).toBe('anchor');
  // `bare` is what keeps the conventional pixels: the fill without the box.
  expect(el.getAttribute('data-bare'), `${what} is bare`).toBe('true');
}

describe('Scraper — Liquid region roles', () => {
  it('makes the top bar contextual and keeps its search field an opaque anchor', async () => {
    const host = await mount(createElement(ScraperTopBar));
    expectContextual(host.querySelector('header.scr-topbar'), '.scr-topbar');
    // The field is dense work inside chrome that is about to become translucent.
    expectBareAnchor(host.querySelector('.scr-search'), '.scr-search');
    expect(host.querySelector('.scr-search')?.closest('.scr-topbar')).not.toBeNull();
  });

  it('declares the navigation role at every rail level that holds the page list', async () => {
    const host = await mount(createElement(ScraperNav, {
      stats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 },
    }));
    expectContextual(host.querySelector('nav.scr-rail'), '.scr-rail');
    expectContextual(host.querySelector('.scr-rail-scroll'), '.scr-rail-scroll');
    // More than one group renders; every one of them must carry the role, because
    // the classifier scores each separately.
    const groups = [...host.querySelectorAll('.scr-rail-group')];
    expect(groups.length, 'rail groups rendered').toBeGreaterThan(0);
    groups.forEach((group, i) => expectContextual(group, `.scr-rail-group[${i}]`));
    const lists = [...host.querySelectorAll('.scr-rail-list')];
    expect(lists.length, 'rail lists rendered').toBeGreaterThan(0);
    lists.forEach((list, i) => {
      expectContextual(list, `.scr-rail-list[${i}]`);
      // Still a real list: the role is declared on the semantics, not instead of them.
      expect(list.tagName, 'rail list stays a ul').toBe('UL');
      expect(list.querySelectorAll('li').length).toBeGreaterThan(0);
    });
  });

  it('makes the status strip contextual', async () => {
    const host = await mount(createElement(ScraperStatusBar, {
      running: false,
      lastScrape: null,
      nextScheduled: null,
      selected: 0,
    }));
    expectContextual(host.querySelector('footer.scr-statusbar'), '.scr-statusbar');
  });

  it('gives the settings drawer the material and its editing body the anchor', async () => {
    // The drawer is a temporary inspector, which §2.3 names as a Liquid region. Its
    // head, category rail, pane head and footer read the drawer's material through
    // their own transparent boxes and need no class of their own; the two regions
    // that hold editable fields do, or a 65%-of-window settings form ends up on glass.
    const host = await mount(createElement(ScraperSettingsDrawer), { drawerOpen: true });
    expectContextual(host.querySelector('aside.scr-drawer'), '.scr-drawer');
    expectBareAnchor(host.querySelector('.scr-drawer-search'), '.scr-drawer-search');
    expectBareAnchor(host.querySelector('.scr-fields'), '.scr-fields');
    for (const sel of ['.scr-drawer-head', '.scr-drawer-rail', '.scr-drawer-foot']) {
      const region = host.querySelector(sel);
      if (!region) throw new Error(`expected ${sel} to be present`);
      expect(region.closest('.lq-contextual'), `${sel} reads the drawer's material`)
        .toBe(host.querySelector('aside.scr-drawer'));
    }
  });

  it('never uses lq-liquid, which would paint in conventional windows too', async () => {
    // §2 non-negotiable 1: conventional presentation is the default. `lq-liquid`
    // paints unconditionally; `lq-contextual` is inert until `.fwin-liquid` opts in,
    // so the reverse toggle is pure cascade with no state to restore.
    const host = await mount(createElement(ScraperNav, {
      stats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 },
    }));
    expect(host.querySelectorAll('.lq-liquid').length).toBe(0);
    expect(host.querySelectorAll('.lq-contextual').length).toBeGreaterThan(0);
  });
});
