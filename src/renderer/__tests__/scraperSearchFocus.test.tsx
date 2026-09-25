// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import ScraperSearch from '../components/scraper/ScraperSearch';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import type { ScraperController } from '../components/scraper/types';

let root: Root | null = null;

function controller(): ScraperController {
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
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  document.body.innerHTML = '<div id="host"></div><button id="after">After</button>';
});

afterEach(async () => {
  if (root) {
    await act(async () => root?.unmount());
    root = null;
  }
  vi.restoreAllMocks();
});

describe('ScraperSearch focus ownership', () => {
  it('keeps the composite open within its results and dismisses it when focus leaves', async () => {
    const host = document.getElementById('host');
    if (!host) throw new Error('Missing test host');
    root = createRoot(host);
    await act(async () => {
      root?.render(createElement(ScraperProvider, { value: controller() }, createElement(ScraperSearch)));
    });

    const input = host.querySelector<HTMLInputElement>('.scr-search-input');
    if (!input) throw new Error('Missing search input');
    await act(async () => input.focus());
    expect(host.querySelector('.scr-search-pop')).not.toBeNull();

    const result = host.querySelector<HTMLButtonElement>('.scr-search-quick-grid button');
    if (!result) throw new Error('Missing quick result');
    await act(async () => result.focus());
    expect(host.querySelector('.scr-search-pop')).not.toBeNull();

    const after = document.getElementById('after') as HTMLButtonElement;
    await act(async () => after.focus());
    expect(host.querySelector('.scr-search-pop')).toBeNull();
  });
});

describe('the palette chord and the Scraper search', () => {
  it('searches the Scraper from the Scraper window and opens the app palette from any other', async () => {
    const ks = await import('../keyboardShortcuts');
    const uninstall = ks.installKeyboardShortcuts();
    document.body.innerHTML =
      '<div class="fwin" id="scraper"><div id="host"></div></div>' +
      '<div class="fwin" id="other"><button id="elsewhere">Elsewhere</button></div>';
    const palette = vi.fn();
    window.addEventListener('palette:open', palette);
    try {
      const host = document.getElementById('host') as HTMLElement;
      root = createRoot(host);
      await act(async () => {
        root?.render(createElement(ScraperProvider, { value: controller() }, createElement(ScraperSearch)));
      });
      const input = host.querySelector<HTMLInputElement>('.scr-search-input');
      const chord = ks.effectiveKeys('nav.palette');
      expect(chord).toBe('Ctrl+K');
      // The hint shows the live chord, not a hard-coded "Ctrl K".
      expect(host.querySelector('.scr-search-shortcut')?.textContent).toBe('Ctrl+K');
      const pressCtrlK = (target: Element) =>
        target.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', code: 'KeyK', ctrlKey: true, bubbles: true, cancelable: true }));

      const elsewhere = document.getElementById('elsewhere') as HTMLButtonElement;
      await act(async () => elsewhere.focus());
      await act(async () => pressCtrlK(elsewhere));
      expect(palette).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(elsewhere);

      const scraperButton = document.createElement('button');
      host.append(scraperButton);
      await act(async () => scraperButton.focus());
      await act(async () => pressCtrlK(scraperButton));
      expect(palette).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(input);
    } finally {
      window.removeEventListener('palette:open', palette);
      uninstall();
    }
  });
});
