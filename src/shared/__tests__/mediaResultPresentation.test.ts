import { describe, expect, it } from 'vitest';
import { normalizeMediaProvidersDocument, type MediaProvidersDocument } from '../mediaProviders';
import { mergeStoredMediaResults, presentStoredMediaResults } from '../mediaResultPresentation';

const documentOf = (descriptors: Array<Record<string, unknown>>): MediaProvidersDocument =>
  normalizeMediaProvidersDocument({
    providers: [
      { id: 'primary', name: 'Primary', priority: 10, reliabilityScore: 80, role: 'metadata', contentTypes: ['anime', 'movie'] },
      { id: 'reliable', name: 'Reliable', priority: 10, reliabilityScore: 95, role: 'metadata', contentTypes: ['anime', 'movie'] },
      { id: 'secondary', name: 'Secondary', priority: 20, reliabilityScore: 100, role: 'metadata', contentTypes: ['anime', 'movie'] },
    ],
    descriptors: descriptors.map((descriptor, index) => ({
      id: `d-${index}`, providerId: 'primary', providerItemId: `item-${index}`,
      title: 'Untitled', contentType: 'anime', ...descriptor,
    })),
  }).value;

describe('stored media result merging', () => {
  it('creates one result per identity while preserving content-type partitions', () => {
    const results = mergeStoredMediaResults(documentOf([
      { id: 'anime', title: 'Your Name', contentType: 'anime' },
      { id: 'movie', providerId: 'secondary', title: 'Your Name', contentType: 'movie' },
    ]));
    expect(results).toHaveLength(2);
    expect(results.map((result) => result.partition).sort()).toEqual(['anime', 'movie']);
  });

  it('chooses scalar values by priority then reliability and records provenance and conflicts', () => {
    const [result] = mergeStoredMediaResults(documentOf([
      { id: 'low-reliability', providerId: 'primary', title: 'Frieren', studio: 'Studio A', year: 2024, identifiers: [{ namespace: 'mal', value: '1' }] },
      { id: 'winner', providerId: 'reliable', title: 'Frieren: Beyond Journey End', studio: 'Studio B', identifiers: [{ namespace: 'mal', value: '1' }] },
      { id: 'lower-priority', providerId: 'secondary', title: 'Sousou no Frieren', year: 2023, identifiers: [{ namespace: 'mal', value: '1' }] },
    ]));
    expect(result.title).toBe('Frieren: Beyond Journey End');
    expect(result.studio).toBe('Studio B');
    expect(result.year).toBe(2024); // winner has no year, so the next present value supplies it
    expect(result.provenance).toMatchObject({ title: 'winner', studio: 'winner', year: 'low-reliability' });
    expect(result.conflicts.title).toEqual(['Frieren: Beyond Journey End', 'Frieren', 'Sousou no Frieren']);
    expect(result.sources.map((source) => source.descriptorId)).toEqual(['winner', 'low-reliability', 'lower-priority']);
  });

  it('unions list fields case-insensitively in source-precedence order', () => {
    const [result] = mergeStoredMediaResults(documentOf([
      { id: 'a', providerId: 'primary', title: 'Bocchi', actors: ['A', 'B'], languages: ['ja'], identifiers: [{ namespace: 'mal', value: '2' }] },
      { id: 'b', providerId: 'secondary', title: 'Bocchi!', actors: ['b', 'C'], languages: ['JA', 'en'], identifiers: [{ namespace: 'mal', value: '2' }] },
    ]));
    expect(result.actors).toEqual(['A', 'B', 'C']);
    expect(result.languages).toEqual(['ja', 'en']);
    expect(result.sourceCount).toBe(2);
  });

  it('is identical when provider and descriptor input order changes', () => {
    const forward = documentOf([
      { id: 'a', providerId: 'primary', title: 'Steins Gate', identifiers: [{ namespace: 'mal', value: '3' }] },
      { id: 'b', providerId: 'secondary', title: 'Steins;Gate', identifiers: [{ namespace: 'mal', value: '3' }] },
    ]);
    const reversed = { ...forward, providers: [...forward.providers].reverse(), descriptors: [...forward.descriptors].reverse() };
    expect(mergeStoredMediaResults(reversed)).toEqual(mergeStoredMediaResults(forward));
  });
});

describe('stored media result presentation', () => {
  const results = () => mergeStoredMediaResults(documentOf([
    { id: 'f', title: 'Frieren', year: 2023, studio: 'Madhouse', availability: 'available' },
    { id: 'b', providerId: 'secondary', title: 'Bocchi the Rock', year: 2022, availability: 'degraded' },
    { id: 'fm', providerId: 'secondary', title: 'Frieren Movie', year: 2025, contentType: 'movie', availability: 'available' },
  ]));

  it('searches stored title and metadata, and applies partition and availability filters', () => {
    expect(presentStoredMediaResults(results(), { query: 'madhouse' }).map((item) => item.title)).toEqual(['Frieren']);
    expect(presentStoredMediaResults(results(), { contentTypes: ['movie'], availability: ['available'] })
      .map((item) => item.title)).toEqual(['Frieren Movie']);
  });

  it('sorts deterministically with stable null handling and identity tie-breaks', () => {
    const withUnknownYear = [...results(), { ...results()[0], identityId: 'unknown-year', title: 'Unknown', year: null }];
    expect(presentStoredMediaResults(withUnknownYear, { sortBy: 'year', direction: 'desc' })
      .map((item) => item.year)).toEqual([2025, 2023, 2022, null]);
    expect(presentStoredMediaResults(results(), { query: 'frieren' }).map((item) => item.title))
      .toEqual(['Frieren', 'Frieren Movie']);
  });
});
