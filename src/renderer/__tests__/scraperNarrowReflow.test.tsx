// @vitest-environment jsdom
/**
 * L8 category 4 — the narrow tier must reflow, never delete a destination.
 *
 * Measured on the live Scraper window at 260x170: `.scr-topbar` wanted 323px of
 * content in 212px and clipped six controls, `.scr-statusbar` 268 in 212, and the
 * shell's middle grid row was crushed to 13px so the rail status, drawer head and
 * drawer foot all laid out past the footer — five geometric overlaps. The fix is a
 * `@container scr-shell (max-width: 460px)` tier plus a `min-height` floor.
 *
 * jsdom has no layout and no container queries, so what is pinned here is the one
 * thing that would turn that reflow into a feature regression: the three top-bar
 * controls the tier hides must each be a SECOND route to a page the left rail
 * already lists, and the controls with no other route must not carry the marker.
 * The stylesheet is read as text for the two rules the live measurement depends on.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SCRAPER_SHELL_STATE } from '../../shared/scraperShell';
import ScraperTopBar from '../components/scraper/ScraperTopBar';
import { SCRAPER_NAV } from '../components/scraper/scraperPages';
import { ScraperProvider } from '../components/scraper/ScraperContext';
import type { ScraperController } from '../components/scraper/types';

let root: Root | null = null;
const navigate = vi.fn();

function controller(): ScraperController {
  return {
    shell: DEFAULT_SCRAPER_SHELL_STATE,
    page: 'dashboard',
    navigate,
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
  };
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  navigate.mockClear();
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

async function mount() {
  const host = document.getElementById('host');
  if (!host) throw new Error('Missing test host');
  const created = createRoot(host);
  root = created;
  await act(async () => {
    created.render(createElement(ScraperProvider, { value: controller() }, createElement(ScraperTopBar)));
  });
  return host;
}

function cssSource(): string {
  return readFileSync(join(__dirname, '..', 'components', 'scraper', 'scraper.css'), 'utf8');
}

/**
 * The body of one `@container scr-shell (max-width: Npx)` tier, comments stripped.
 * Comments are removed because prose about a declaration reads exactly like the
 * declaration to a text guard, and both tiers here are explained in prose that
 * names the other tier's rules.
 */
function tierBody(css: string, maxWidth: number): string {
  const header = `@container scr-shell (max-width: ${maxWidth}px) {`;
  const start = css.indexOf(header);
  if (start < 0) return '';
  let depth = 0;
  for (let i = start + header.length - 1; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    else if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) {
        return css.slice(start + header.length, i).replace(/\/\*[\s\S]*?\*\//g, '');
      }
    }
  }
  return '';
}

describe('Scraper narrow tier — reflow without losing a route', () => {
  it('hides only top-bar actions that duplicate a rail page', async () => {
    const host = await mount();
    const marked = [...host.querySelectorAll<HTMLElement>('.scr-topbar-actions > .scr-topbar-nav')];
    expect(marked.length, 'three duplicated actions are marked').toBe(3);

    const railIds = new Set(SCRAPER_NAV.map((p) => p.id));
    const reached: string[] = [];
    for (const el of marked) {
      navigate.mockClear();
      await act(async () => {
        el.click();
      });
      expect(navigate, 'a marked action navigates somewhere').toHaveBeenCalledTimes(1);
      reached.push(String(navigate.mock.calls[0][0]));
    }
    expect(reached.sort()).toEqual(['history', 'new-scrape', 'profiles']);
    for (const id of reached) {
      expect(railIds.has(id as never), `${id} is still reachable from the rail`).toBe(true);
    }
  });

  it('leaves the actions with no second route unmarked', async () => {
    const host = await mount();
    const unmarked = [...host.querySelectorAll<HTMLElement>('.scr-topbar-actions > *')].filter(
      (el) => !el.classList.contains('scr-topbar-nav'),
    );
    // Settings drawer, Advanced mode and Compact presentation: none of the three is
    // a page, so none of them has a rail item to fall back to.
    expect(unmarked.length).toBe(3);
    for (const el of unmarked) {
      expect(el.getAttribute('aria-label') ?? el.textContent ?? '').not.toBe('');
    }
  });

  it('keeps the two rules the live measurement depends on', () => {
    const css = cssSource();
    expect(css, 'the narrow tier exists').toContain('@container scr-shell (max-width: 460px)');
    // The height floor cannot live inside that tier: a container never matches its
    // own query, and `.scr-shell` is the container.
    expect(/\.scr-shell \{[^}]*min-height: 420px;/s.test(css), 'shell carries the height floor').toBe(true);
  });

  /**
   * The 1100px tier narrows the rail column to 52px when the drawer opens, but
   * `.is-collapsed` is a component state the drawer does not set and the
   * label-hiding lived only in the 700px tier. Measured live at 820x580 with the
   * drawer open: 17 rail buttons at rect 152x32 with 44px hit-testable, labels
   * sliced mid-word ("D." "Di" "Hi" "Memo 554 M"). jsdom has no container queries,
   * so the tier is read as text — that is what the live fix depends on.
   */
  it('collapses the rail itself wherever it collapses the rail column', () => {
    const css = cssSource();
    const drawerTier = tierBody(css, 1100);
    expect(drawerTier, 'the drawer tier exists').not.toBe('');
    expect(drawerTier, 'that tier is the one that narrows the column').toContain(
      'grid-template-columns: 52px minmax(0, 1fr);',
    );
    for (const part of ['label', 'dot', 'group-label', 'tasks', 'metric']) {
      expect(
        drawerTier.includes(`.scr-shell.is-drawer-open .scr-rail .scr-rail-${part}`),
        `the 52px rail hides .scr-rail-${part}`,
      ).toBe(true);
    }
    expect(
      /\.scr-shell\.is-drawer-open \.scr-rail \.scr-rail-item \{[^}]*justify-content: center;/s.test(
        drawerTier,
      ),
      'the icon-only rail centres its icons',
    ).toBe(true);
    // The status text is clipped rather than removed: a bare coloured dot would be
    // colour-alone signalling, which is why the component uses `sr-only` for the
    // same state and why this must not become `display: none`.
    expect(
      /\.scr-shell\.is-drawer-open \.scr-rail \.scr-rail-state-text \{[^}]*clip: rect\(0, 0, 0, 0\);/s.test(
        drawerTier,
      ),
      'the running/idle state stays announced',
    ).toBe(true);
  });

  it('gives the status text a hook a container query can reach', () => {
    const nav = readFileSync(
      join(__dirname, '..', 'components', 'scraper', 'ScraperNav.tsx'),
      'utf8',
    ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');
    // Unconditional: the class the tier hides by cannot depend on `railCollapsed`,
    // which is false in exactly the case that needed fixing.
    expect(nav).toContain('`scr-rail-state-text${ctl.railCollapsed ? \' sr-only\' : \'\'}`');
  });
});
