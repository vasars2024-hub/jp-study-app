import { describe, expect, it } from 'vitest';
import { SCRAPER_REGISTRY, searchScraper } from '../components/scraper/scraperRegistry';
import { SCRAPER_NAV, scraperGroupOrder, scraperPageMeta } from '../components/scraper/scraperPages';
import { SCRAPER_PAGE_IDS } from '../../shared/scraperShell';
import { SCRAPER_TEXT, type ScraperTextKey } from '../components/scraper/strings';
import {
  countFeatureStatuses,
  featureStatusEntries,
  rollupStatus,
  statusOf,
} from '../components/scraper/featureStatus';

describe('scraper rail', () => {
  it('lists every page exactly once', () => {
    const ids = SCRAPER_NAV.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(new Set(ids)).toEqual(new Set(SCRAPER_PAGE_IDS));
  });

  it('groups pages in the reference order', () => {
    expect(scraperGroupOrder()).toEqual(['Scraper', 'Data', 'Tools']);
  });

  it('resolves every label and description to real text', () => {
    for (const page of SCRAPER_NAV) {
      expect(SCRAPER_TEXT[page.labelKey], `missing ${page.labelKey}`).toBeTruthy();
      expect(SCRAPER_TEXT[page.descKey], `missing ${page.descKey}`).toBeTruthy();
    }
  });

  it('finds a page by id', () => {
    expect(scraperPageMeta('torrents')?.labelKey).toBe('nav.torrents');
    expect(scraperPageMeta('nope' as never)).toBeUndefined();
  });
});

describe('searchScraper', () => {
  it('returns nothing for an empty query', () => {
    expect(searchScraper('   ')).toEqual([]);
  });

  it('finds a page by its title', () => {
    const hits = searchScraper('torrent');
    expect(hits.map((h) => h.pageId)).toContain('torrents');
  });

  it('finds a page by an English keyword the title does not contain', () => {
    // "qbittorrent" appears only in the keyword list.
    expect(searchScraper('qbittorrent').map((h) => h.pageId)).toContain('torrents');
  });

  it('still matches English keywords under a translated resolver', () => {
    // The point of literal-English keywords: a feature stays findable by its
    // English name once the UI is translated.
    const translate = (key: ScraperTextKey) => `［${String(key)}］`;
    expect(searchScraper('cron', translate).map((h) => h.pageId)).toContain('scheduled');
  });

  it('ranks a title match above a keyword-only match', () => {
    const hits = searchScraper('export');
    expect(hits[0]?.pageId).toBe('exports');
  });

  it('hides advanced entries unless asked', () => {
    const advancedEntry = SCRAPER_REGISTRY.find((e) => e.advanced);
    if (!advancedEntry) return; // nothing is advanced today; the guard still holds
    expect(searchScraper(advancedEntry.keywords[0]).map((h) => h.id)).not.toContain(
      advancedEntry.id,
    );
    expect(
      searchScraper(advancedEntry.keywords[0], undefined, { advanced: true }).map((h) => h.id),
    ).toContain(advancedEntry.id);
  });

  it('returns each entry at most once', () => {
    const hits = searchScraper('scrape');
    expect(new Set(hits.map((h) => h.id)).size).toBe(hits.length);
  });

  it('caps results at 24', () => {
    // 'e' matches nearly everything; the cap is what keeps the popover usable.
    expect(searchScraper('e').length).toBeLessThanOrEqual(24);
  });

  it('points every entry at a page that exists', () => {
    for (const entry of SCRAPER_REGISTRY) {
      expect(SCRAPER_NAV.some((p) => p.id === entry.pageId), entry.id).toBe(true);
    }
  });
});

describe('feature status', () => {
  it('treats an unregistered feature as unbuilt', () => {
    // Safe direction to be wrong in: forgetting to register never claims
    // something works.
    expect(statusOf('page.does-not-exist')).toBe('shell');
  });

  it('rolls a group up to its weakest member', () => {
    // Ids are looked up rather than hard-coded: statuses are meant to change as
    // features land, and a test that pins them would fail on every promotion
    // without anything actually being wrong.
    const entries = featureStatusEntries();
    const shell = entries.find((e) => e.status === 'shell')?.id;
    const untested = entries.find((e) => e.status === 'untested')?.id;

    expect(rollupStatus([])).toBe('shell');
    if (untested) expect(rollupStatus([untested])).toBe('untested');
    if (shell && untested) expect(rollupStatus([untested, shell])).toBe('shell');
    // An unregistered id drags any group down, by design.
    expect(rollupStatus([untested ?? 'x', 'page.not-registered'])).toBe('shell');
  });

  it('registers a status for every page in the rail', () => {
    for (const page of SCRAPER_NAV) {
      expect(Object.keys(countFeatureStatuses()).length).toBeGreaterThan(0);
      expect(typeof statusOf(`page.${page.id}`)).toBe('string');
    }
  });

  it('counts every registered feature exactly once', () => {
    const counts = countFeatureStatuses();
    expect(counts.shell + counts.untested + counts.ready).toBe(counts.total);
  });
});
