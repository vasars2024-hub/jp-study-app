// @vitest-environment jsdom
/**
 * L8 category 4 — the collapsed rail must not be wider than the rail.
 *
 * Measured on the live 820x580 Scraper window: `.scr-rail` is 52px collapsed, but
 * `.scr-rail-scroll` and `.scr-rail-status` were both 70px. `.scr-rail` is a
 * single-column grid, and a column's automatic minimum is the largest min-content
 * of its items, so the running/idle LABEL — the one item still rendering text when
 * collapsed — floored the whole track at 70. `overflow: hidden` on the rail then hid
 * the 18px spill, and both rail rows geometrically overlapped the settings drawer
 * beside them: `18x352` and `18x71`, at every measured size.
 *
 * `display: none` would have fixed the geometry and deleted the only thing that
 * block exists to say, so the label goes screen-reader-only instead. jsdom has no
 * layout, so what is pinned here is the contract that produces the geometry: the
 * label is still rendered, still readable to assistive tech, and carries the class
 * that takes it out of min-content.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import ScraperNav from '../components/scraper/ScraperNav';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import type { ScraperController } from '../components/scraper/types';

let root: Root | null = null;

function controller(railCollapsed: boolean): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    page: 'dashboard',
    navigate: vi.fn(),
    focusSettingId: null,
    clearFocusSetting: vi.fn(),
    railCollapsed,
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

async function mount(railCollapsed: boolean) {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(createElement(
      ScraperProvider,
      { value: controller(railCollapsed) },
      createElement(ScraperNav, { stats: { memoryMb: 0, cpuPercent: 0, activeJobs: 0 } }),
    ));
  });
  return host;
}

function stateText(host: HTMLElement): HTMLElement {
  const label = host.querySelector<HTMLElement>('.scr-rail-state span:not(.scr-state-dot)');
  if (!label) throw new Error('expected the rail state label to be present');
  return label;
}

describe('Scraper rail — collapsed width', () => {
  it('keeps the state label out of min-content when collapsed, without deleting it', async () => {
    const host = await mount(true);
    const label = stateText(host);
    expect(label.textContent?.trim().length, 'the state is still stated').toBeGreaterThan(0);
    expect(label.classList.contains('sr-only'), 'label is screen-reader-only').toBe(true);
    // Not hidden from assistive tech: `sr-only` clips it visually and keeps it in the
    // accessibility tree, which `display: none` and `aria-hidden` both would not.
    expect(label.getAttribute('aria-hidden')).toBeNull();
  });

  it('shows the same label normally when the rail is expanded', async () => {
    const host = await mount(false);
    const label = stateText(host);
    expect(label.classList.contains('sr-only'), 'expanded label is visible').toBe(false);
    expect(label.textContent?.trim().length).toBeGreaterThan(0);
  });
});
