import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCRAPER_FIELDS } from '../components/scraper/settings/fields';

describe('Scraper Metadata settings truthfulness', () => {
  const metadataFields = SCRAPER_FIELDS.filter((field) => field.group === 'metadata');

  it('keeps the eight runtime-backed controls active', () => {
    expect(
      metadataFields.filter((field) => field.kind !== 'note' && !field.inert).map((field) => field.path),
    ).toEqual([
      'metadata.providerOrder',
      'metadata.titleLanguage',
      'metadata.alsoStoreNativeTitle',
      'metadata.fetchSynopsis',
      'metadata.fetchGenres',
      'metadata.fetchAirDates',
      'metadata.fetchRatings',
      'metadata.cacheHours',
    ]);
  });

  it('marks the two controls with no consumer as inert', () => {
    // `mergeStrategy`: `searchCatalogue` returns on the first provider that
    // answers, so a second record never exists. `fetchStaff`: neither endpoint
    // returns staff or cast, and `toSeriesMetadata` deliberately does not read
    // it rather than gating the unrelated studio credit on it.
    expect(metadataFields.filter((field) => field.inert).map((field) => field.path)).toEqual([
      'metadata.mergeStrategy',
      'metadata.fetchStaff',
    ]);
  });

  it('does not call a projection toggle a fetch', () => {
    // The regression this guards is the label, not the wiring. These four run
    // after the response has arrived; naming one "Fetch" tells a user that
    // turning it off asks the provider for less, which it does not.
    const projections = ['fetchSynopsis', 'fetchGenres', 'fetchAirDates', 'fetchRatings'];
    for (const key of projections) {
      const field = metadataFields.find((f) => f.path === `metadata.${key}`);
      if (!field) throw new Error(`metadata.${key} is missing from SCRAPER_FIELDS`);
      expect(field.label, key).toMatch(/^Store /);
      // Still reachable by the word it used to be called.
      expect(field.keywords ?? [], key).toContain('fetch');
    }
  });

  it('states what actually leaves the machine, in a row with nothing to operate', () => {
    const note = metadataFields.find((field) => field.kind === 'note');
    expect(note?.path).toBe('metadata.requestScope');
    expect(note?.hint).toMatch(/whole record in a single request/);
  });

  it('holds the source claim the Store labels rest on: the requests are fixed', () => {
    // If either provider request ever becomes conditional on these settings,
    // this assertion should fail and the labels should be revisited — at that
    // point "Fetch" would become the honest word again.
    const catalogue = readFileSync(
      join(__dirname, '..', '..', 'main', 'scraper', 'catalogue.ts'),
      'utf8',
    );
    const searchAnilist = catalogue.slice(
      catalogue.indexOf('async function searchAnilist'),
      catalogue.indexOf('// ------------------------------------------------------------------- search ---'),
    );
    const searchJikan = catalogue.slice(
      catalogue.indexOf('async function searchJikan'),
      catalogue.indexOf('export async function searchCatalogue'),
    );
    expect(searchAnilist.length).toBeGreaterThan(0);
    expect(searchJikan.length).toBeGreaterThan(0);
    for (const key of ['fetchSynopsis', 'fetchGenres', 'fetchAirDates', 'fetchRatings']) {
      expect(searchAnilist, `searchAnilist reads ${key}`).not.toContain(key);
      expect(searchJikan, `searchJikan reads ${key}`).not.toContain(key);
    }
  });
});
