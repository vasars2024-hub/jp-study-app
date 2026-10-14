/**
 * v1: no scraper settings control is inert any more.
 *
 * This file used to pin the twenty fields that saved a value nothing read, each marked
 * "Not wired" in the drawer (pre-sweep D99, audit F5). The v1 bar is stricter: a
 * control that changes nothing is a leftover, marked or not. Each one was either
 * wired or removed:
 *
 *   wired   — sources.skipUnhealthy, torrents.verifyInfoHash,
 *             validation.verifyEpisodeCount, developer.verboseTimings
 *             (each has a behaviour test beside its consumer);
 *   removed — every other field below. Their values stay in the settings model
 *             so stored documents keep parsing; only the controls are gone.
 *
 * So the gate is now: none of the removed paths is back in the drawer, the wired
 * ones are present, and no hint anywhere in the drawer says "Stored for a future".
 */
import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';
import { SCRAPER_DRAWER_EN } from '../../shared/i18n/scraperDrawerUi/en';

const REMOVED = [
  // Unmarked but just as inert: a generic extractor this backend does not have,
  // and a label copied into session state nothing reads.
  'extraction.cssSelectors',
  'extraction.xpathSelectors',
  'extraction.regexPattern',
  'extraction.regexFlags',
  'extraction.attribute',
  'session.sessionLabel',
  'torrents.protocols',
  'images.minWidth',
  'images.skipDuplicatesByHash',
  'images.namingTemplate',
  'metadata.mergeStrategy',
  'metadata.fetchStaff',
  'performance.maxParallelDownloads',
  'performance.memoryBudgetMb',
  'performance.cpuThrottlePercent',
  'performance.reuseBrowserContext',
  'performance.prefetchNextPage',
  'validation.rejectDuplicateHashes',
  'scheduler.requireUnmeteredNetwork',
  'developer.showRawHtml',
  'developer.showSelectorOverlay',
  'developer.recordNetworkTrace',
  // Only ever fed the Plugins page, which v1 does not ship (plan D4).
  'developer.pluginIds',
] as const;

const WIRED = [
  'sources.skipUnhealthy',
  'torrents.verifyInfoHash',
  'validation.verifyEpisodeCount',
  'developer.verboseTimings',
] as const;

const byPath = new Map(SCRAPER_FIELDS.map((f) => [f.path, f]));

describe('scraper settings — no inert control ships', () => {
  it('the field table is non-empty', () => {
    expect(SCRAPER_FIELDS.length).toBeGreaterThan(90);
  });

  it('no field carries the old inert flag', () => {
    const flagged = SCRAPER_FIELDS.filter((f) => 'inert' in (f as object)).map((f) => f.path);
    expect(flagged).toEqual([]);
  });

  for (const path of REMOVED) {
    it(`${path} is not offered`, () => {
      expect(byPath.get(path)).toBeUndefined();
      expect(SCRAPER_FIELDS.some((f) => f.toPath === path)).toBe(false);
    });
  }

  for (const path of WIRED) {
    it(`${path} is offered and explains what it does`, () => {
      const field = byPath.get(path);
      expect(field, path).toBeDefined();
      expect((field?.hint ?? '').length).toBeGreaterThan(40);
    });
  }

  it('no drawer text, English or catalog, still promises a future', () => {
    const texts = [
      ...SCRAPER_FIELDS.map((f) => f.hint ?? ''),
      ...Object.values(SCRAPER_DRAWER_EN).map((v) => (typeof v === 'string' ? v : JSON.stringify(v))),
    ];
    for (const text of texts) {
      expect(text).not.toMatch(/for a future|not yet|no scraping backend/i);
    }
  });

  it('the removed fields have no strings left in the drawer catalog', () => {
    for (const path of REMOVED) {
      const leftovers = Object.keys(SCRAPER_DRAWER_EN).filter((key) =>
        key.startsWith(`scraperDrawer.field.${path}.`) || key.startsWith(`scraperDrawer.option.${path}.`));
      expect(leftovers, path).toEqual([]);
    }
  });
});
