/**
 * Pre-sweep D99 — a scraper settings control that persists a value nothing reads must
 * SAY so.
 *
 * The `inert` flag's own docstring in fields.ts states the contract: the value really is
 * saved, so the settings document is not lying; the screen was, by presenting the control
 * exactly like the ones that work. Ten fields changed no behaviour and carried no marker
 * and — uniquely on this surface — no hint text at all.
 *
 * This pins the ten, and it pins the SHAPE rather than only the list, so the next
 * unmarked one is caught: every inert field must also explain what happens instead,
 * because "Not wired" alone tells a user their setting is broken without telling them
 * what the app does with the choice they made.
 *
 * Deliberately NOT asserted here: that these ten have no consumer. That is a whole-tree
 * property and it belongs to the scanner that found them
 * (`src/.coordination/presweep/inert-settings-scan.cjs`), not to a unit test that would
 * have to re-index 2,750 files to check it. When one of them gets wired, delete its entry
 * from UNWIRED and drop the flag — the test is a ratchet against drift, not a freeze.
 */
import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';

/** Confirmed 2026-09-06 to have zero consumers outside their own settings model. */
const UNWIRED = [
  'sources.maxFallbackDepth',
  'sources.skipUnhealthy',
  'torrents.protocols',
  'torrents.verifyInfoHash',
  'validation.verifyEpisodeCount',
  'validation.rejectDuplicateHashes',
  'developer.showRawHtml',
  'developer.showSelectorOverlay',
  'developer.recordNetworkTrace',
  'developer.verboseTimings',
] as const;

const byPath = new Map(SCRAPER_FIELDS.map((f) => [f.path, f]));

describe('scraper settings — an unwired control admits it', () => {
  it('the field table is non-empty and every UNWIRED path still exists', () => {
    // Non-vacuity floor: a renamed or deleted path must fail loudly rather than making
    // every case below pass over an empty set.
    expect(SCRAPER_FIELDS.length).toBeGreaterThan(100);
    for (const path of UNWIRED) expect(byPath.get(path), path).toBeDefined();
  });

  for (const path of UNWIRED) {
    it(`${path} is marked inert`, () => {
      expect(byPath.get(path)?.inert).toBe(true);
    });
  }

  it('every inert field explains what happens instead', () => {
    const inert = SCRAPER_FIELDS.filter((f) => f.inert);
    // 11 pre-existing + the 10 this repair marked.
    expect(inert.length).toBeGreaterThanOrEqual(UNWIRED.length + 11);
    for (const f of inert) {
      expect(f.hint, `${f.path} is flagged inert with no hint`).toBeTruthy();
      expect((f.hint ?? '').length, `${f.path}'s hint is too short to say anything`)
        .toBeGreaterThan(40);
    }
  });

  it('the fields around them are NOT marked — the marker still means something', () => {
    // If everything in these groups were inert the flag would carry no information.
    // These four act, and are the control for the ten above.
    for (const path of [
      'developer.mockMode',
      'developer.allowScriptConsole',
      'sources.stopAfterFirstSuccess',
      'torrents.dedupeByInfoHash',
    ]) {
      expect(byPath.get(path), path).toBeDefined();
      expect(byPath.get(path)?.inert, `${path} should not be inert`).toBeFalsy();
    }
  });
});
