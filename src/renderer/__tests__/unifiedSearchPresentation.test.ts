// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { UnifiedSearchResult } from '../../shared/unifiedSearch';
import type { UnifiedSearchProviderProgress } from '../../shared/unifiedSearchExecution';
import { partitionUnifiedSearchResults } from '../unifiedSearchPresentation';
import { EMPTY_UNIFIED_SEARCH_FILTERS } from '../../shared/unifiedSearchManagement';

function result(providerId: string, id: string, title: string): UnifiedSearchResult {
  return {
    id: `${providerId}:${id}`, providerId, providerResultId: id, title,
    alternativeTitles: [], japaneseTitle: null, romajiTitle: null, authorsOrStudios: [],
    coverUrl: null, language: null, availability: 'unknown', metadataQuality: null,
    episodeCount: null, trackingStatus: 'unknown', mediaType: 'other', year: null,
    season: null, genres: [],
  };
}

function provider(providerId: string, results: readonly UnifiedSearchResult[]): UnifiedSearchProviderProgress {
  return { providerId, providerName: providerId.toUpperCase(), status: 'succeeded', results, error: null };
}

describe('unified search result presentation', () => {
  it('keeps results beneath their provider in deterministic input order', () => {
    const aResults = [result('a', '2', 'Second'), result('a', '1', 'First')];
    const bResults = [result('b', '1', 'First')];

    const partitions = partitionUnifiedSearchResults([
      provider('b', bResults),
      provider('a', aResults),
    ]);

    expect(partitions.map((partition) => partition.providerId)).toEqual(['b', 'a']);
    expect(partitions[0].results).toBe(bResults);
    expect(partitions[1].results).toBe(aResults);
    expect(partitions[1].results.map((item) => item.id)).toEqual(['a:2', 'a:1']);
  });

  it('does not merge same-title results from different providers', () => {
    const partitions = partitionUnifiedSearchResults([
      provider('local', [result('local', 'frieren', 'Frieren')]),
      provider('other', [result('other', 'frieren', 'Frieren')]),
    ]);

    expect(partitions).toHaveLength(2);
    expect(partitions.flatMap((partition) => partition.results)).toHaveLength(2);
    expect(partitions[0].results[0].providerId).toBe('local');
    expect(partitions[1].results[0].providerId).toBe('other');
  });

  it('retains empty provider partitions and returns a frozen outer model', () => {
    const partitions = partitionUnifiedSearchResults([provider('empty', [])]);
    expect(partitions).toEqual([{ providerId: 'empty', providerName: 'EMPTY', results: [] }]);
    expect(Object.isFrozen(partitions)).toBe(true);
    expect(Object.isFrozen(partitions[0])).toBe(true);
  });
});

it('filters inside each provider partition without merging or reordering partitions', () => {
  const partitions = partitionUnifiedSearchResults([
    { providerId: 'a', providerName: 'A', status: 'succeeded', error: null, results: [{ ...result('a', 'one', 'One'), language: 'ja' }, { ...result('a', 'two', 'Two'), language: 'en' }] },
    { providerId: 'b', providerName: 'B', status: 'succeeded', error: null, results: [{ ...result('b', 'three', 'Three'), language: 'ja' }] },
  ], { ...EMPTY_UNIFIED_SEARCH_FILTERS, languages: ['ja'] });
  expect(partitions.map((partition) => [partition.providerId, partition.results.map((item) => item.id)]))
    .toEqual([['a', ['a:one']], ['b', ['b:three']]]);
});
