import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SCRAPER_SHELL_STATE,
  SCRAPER_COLUMN_IDS,
  SCRAPER_SHELL_VERSION,
  normalizeScraperShellState,
  pushRecentScraperPage,
} from '../scraperShell';

describe('scraper shell state', () => {
  it('falls back to defaults for anything that is not an object', () => {
    for (const input of [null, undefined, 42, 'nope', []]) {
      expect(normalizeScraperShellState(input).value).toEqual(DEFAULT_SCRAPER_SHELL_STATE);
    }
  });

  it('replaces an unknown page with the dashboard and says why', () => {
    const { value, issues } = normalizeScraperShellState({ page: 'wat' });
    expect(value.page).toBe('dashboard');
    expect(issues.map((i) => i.path)).toContain('page');
  });

  it('keeps a known page untouched and raises no issue', () => {
    const { value, issues } = normalizeScraperShellState({ page: 'torrents' });
    expect(value.page).toBe('torrents');
    expect(issues).toEqual([]);
  });

  it('drops unknown column ids but keeps the order of the survivors', () => {
    const { value, issues } = normalizeScraperShellState({
      visibleColumns: ['title', 'ghost-column', 'size', 'index'],
    });
    expect(value.visibleColumns).toEqual(['title', 'size', 'index']);
    expect(issues.some((i) => i.path === 'visibleColumns')).toBe(true);
  });

  it('never leaves the table with zero columns', () => {
    // A stored list of nothing but unknown ids would otherwise render a table
    // with no columns at all, which reads as a broken app.
    const { value } = normalizeScraperShellState({ visibleColumns: ['a', 'b'] });
    expect(value.visibleColumns).toEqual(DEFAULT_SCRAPER_SHELL_STATE.visibleColumns);
  });

  it('completes a partial column order from the canonical list', () => {
    const { value } = normalizeScraperShellState({ columnOrder: ['size', 'title'] });
    expect(value.columnOrder.slice(0, 2)).toEqual(['size', 'title']);
    expect(new Set(value.columnOrder)).toEqual(new Set(SCRAPER_COLUMN_IDS));
  });

  it('deduplicates a column list', () => {
    const { value } = normalizeScraperShellState({ visibleColumns: ['title', 'title', 'size'] });
    expect(value.visibleColumns).toEqual(['title', 'size']);
  });

  it('rejects a page size that is not one of the offered choices', () => {
    expect(normalizeScraperShellState({ pageSize: 37 }).value.pageSize).toBe(10);
    expect(normalizeScraperShellState({ pageSize: 100 }).value.pageSize).toBe(100);
  });

  it('caps and de-dupes the recent-page list, ignoring unknown ids', () => {
    const { value } = normalizeScraperShellState({
      recentPages: [
        'history',
        'history',
        'not-a-page',
        'exports',
        'downloads',
        'results',
        'plugins',
        'profiles',
        'sources',
        'torrents',
        'scheduled',
        'site-rules',
      ],
    });
    expect(value.recentPages.length).toBeLessThanOrEqual(8);
    expect(value.recentPages).not.toContain('not-a-page');
    expect(new Set(value.recentPages).size).toBe(value.recentPages.length);
  });

  it('always stamps the current version, whatever came in', () => {
    expect(normalizeScraperShellState({ version: 99 }).value.version).toBe(SCRAPER_SHELL_VERSION);
  });

  it('bounds free-text fields so a corrupt document cannot blow up the UI', () => {
    const long = 'x'.repeat(500);
    const { value } = normalizeScraperShellState({ groupBy: long, drawerCategory: long });
    expect(value.groupBy.length).toBeLessThanOrEqual(40);
    expect(value.drawerCategory.length).toBeLessThanOrEqual(40);
  });

  it('falls back to a usable drawer category rather than an empty one', () => {
    expect(normalizeScraperShellState({ drawerCategory: '   ' }).value.drawerCategory).toBe(
      DEFAULT_SCRAPER_SHELL_STATE.drawerCategory,
    );
  });

  describe('pushRecentScraperPage', () => {
    it('moves a revisited page to the front instead of duplicating it', () => {
      expect(pushRecentScraperPage(['history', 'exports'], 'exports')).toEqual([
        'exports',
        'history',
      ]);
    });

    it('caps the list at eight entries', () => {
      let recent = pushRecentScraperPage([], 'dashboard');
      for (const page of [
        'new-scrape',
        'discover',
        'history',
        'sources',
        'torrents',
        'profiles',
        'scheduled',
        'plugins',
      ] as const) {
        recent = pushRecentScraperPage(recent, page);
      }
      expect(recent).toHaveLength(8);
      expect(recent[0]).toBe('plugins');
      expect(recent).not.toContain('dashboard');
    });
  });
});
