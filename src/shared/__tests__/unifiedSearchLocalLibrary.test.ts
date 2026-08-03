// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { UnifiedSearchQueryPlanStep } from '../unifiedSearch';
import {
  createLocalLibraryExecutor,
  localLibraryEntryToResult,
  localLibraryMatchScore,
  searchLocalLibraryEntries,
  type LocalLibraryEntry,
} from '../unifiedSearchLocalLibrary';

function entry(id: string, overrides: Partial<LocalLibraryEntry> = {}): LocalLibraryEntry {
  return { id, title: id, ...overrides };
}

function step(providerId = 'local'): UnifiedSearchQueryPlanStep {
  return { providerId, providerName: providerId.toUpperCase(), providerKind: 'local-library', priority: 0, groupIds: [] };
}

const LIBRARY: LocalLibraryEntry[] = [
  entry('a', { title: 'Frieren at the Funeral', keywords: ['葬送', 'mage'] }),
  entry('b', { title: 'Attack on Titan', japaneseTitle: '進撃の巨人', romajiTitle: 'Shingeki no Kyojin' }),
  entry('c', { title: 'Beyond the Frieren Journey', authorsOrStudios: ['Madhouse'] }),
  entry('d', { title: 'Unrelated Show' }),
];

describe('localLibraryMatchScore', () => {
  it('ranks a title prefix above a title substring above other fields', () => {
    expect(localLibraryMatchScore(entry('x', { title: 'Frieren' }), 'frieren')).toBe(0);
    expect(localLibraryMatchScore(entry('x', { title: 'The Frieren' }), 'frieren')).toBe(1);
    expect(localLibraryMatchScore(entry('x', { title: 'Titan', japaneseTitle: '進撃' }), '進撃')).toBe(2);
    expect(localLibraryMatchScore(entry('x', { title: 'Titan', authorsOrStudios: ['Madhouse'] }), 'madhouse')).toBe(3);
    expect(localLibraryMatchScore(entry('x', { title: 'Titan', keywords: ['mage'] }), 'mage')).toBe(4);
  });

  it('returns null for no match and for an empty query', () => {
    expect(localLibraryMatchScore(entry('x', { title: 'Titan' }), 'frieren')).toBeNull();
    expect(localLibraryMatchScore(entry('x', { title: 'Titan' }), '   ')).toBeNull();
  });

  it('matches case- and whitespace-insensitively', () => {
    expect(localLibraryMatchScore(entry('x', { title: '  Frieren  ' }), 'frieren')).toBe(0);
    expect(localLibraryMatchScore(entry('x', { title: 'Attack ON titan' }), 'attack on')).toBe(0);
  });
});

describe('searchLocalLibraryEntries', () => {
  it('filters to matches and orders by score then original position', () => {
    const results = searchLocalLibraryEntries(LIBRARY, 'frieren');
    // 'a' (prefix, score 0) before 'c' (substring, score 1); 'b' and 'd' excluded.
    expect(results.map((e) => e.id)).toEqual(['a', 'c']);
  });

  it('finds an entry through its Japanese and romaji titles', () => {
    expect(searchLocalLibraryEntries(LIBRARY, '進撃の巨人').map((e) => e.id)).toEqual(['b']);
    expect(searchLocalLibraryEntries(LIBRARY, 'shingeki').map((e) => e.id)).toEqual(['b']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchLocalLibraryEntries(LIBRARY, '')).toEqual([]);
  });

  it('caps results at the requested limit deterministically', () => {
    const many = Array.from({ length: 10 }, (_, i) => entry(`e${i}`, { title: `Frieren ${i}` }));
    const results = searchLocalLibraryEntries(many, 'frieren', 3);
    expect(results.map((e) => e.id)).toEqual(['e0', 'e1', 'e2']);
  });

  it('is a pure function of its inputs — repeated calls are identical', () => {
    const first = searchLocalLibraryEntries(LIBRARY, 'frieren').map((e) => e.id);
    const second = searchLocalLibraryEntries(LIBRARY, 'frieren').map((e) => e.id);
    expect(first).toEqual(second);
  });
});

describe('localLibraryEntryToResult', () => {
  it('projects a local entry to a fully-formed available result under the provider', () => {
    const result = localLibraryEntryToResult(
      entry('a', { title: 'Frieren', japaneseTitle: '葬送のフリーレン', mediaType: 'anime', genres: ['Fantasy'] }),
      'local',
    );
    expect(result).toMatchObject({
      id: 'local:a',
      providerId: 'local',
      providerResultId: 'a',
      title: 'Frieren',
      japaneseTitle: '葬送のフリーレン',
      availability: 'available',
      mediaType: 'anime',
      trackingStatus: 'unknown',
      genres: ['Fantasy'],
    });
  });

  it('defaults every optional field to a valid empty value', () => {
    const result = localLibraryEntryToResult(entry('bare', { title: 'Bare' }), 'p');
    expect(result).toEqual({
      id: 'p:bare',
      providerId: 'p',
      providerResultId: 'bare',
      title: 'Bare',
      alternativeTitles: [],
      japaneseTitle: null,
      romajiTitle: null,
      authorsOrStudios: [],
      coverUrl: null,
      language: null,
      availability: 'available',
      metadataQuality: null,
      episodeCount: null,
      trackingStatus: 'unknown',
      mediaType: 'other',
      year: null,
      season: null,
      genres: [],
    });
  });
});

describe('createLocalLibraryExecutor', () => {
  it('reads the snapshot lazily and returns results partitioned under the calling provider', async () => {
    let reads = 0;
    const executor = createLocalLibraryExecutor({ getEntries: () => { reads += 1; return LIBRARY; } });
    expect(reads).toBe(0); // nothing read until a search runs
    const results = await executor({ query: 'frieren', step: step('local'), signal: new AbortController().signal });
    expect(reads).toBe(1);
    expect(results.map((r) => r.providerResultId)).toEqual(['a', 'c']);
    expect(results.every((r) => r.providerId === 'local')).toBe(true);
  });

  it('resolves to no results when the query is empty', async () => {
    const executor = createLocalLibraryExecutor({ getEntries: () => LIBRARY });
    expect(await executor({ query: '  ', step: step(), signal: new AbortController().signal })).toEqual([]);
  });

  it('short-circuits to no results when already aborted, without reading the snapshot', async () => {
    let reads = 0;
    const executor = createLocalLibraryExecutor({ getEntries: () => { reads += 1; return LIBRARY; } });
    const controller = new AbortController();
    controller.abort();
    expect(await executor({ query: 'frieren', step: step(), signal: controller.signal })).toEqual([]);
    expect(reads).toBe(0);
  });

  it('supports an asynchronous offline snapshot and checks cancellation after loading', async () => {
    const controller = new AbortController();
    const executor = createLocalLibraryExecutor({
      getEntries: async () => {
        controller.abort();
        return LIBRARY;
      },
    });
    expect(await executor({ query: 'frieren', step: step(), signal: controller.signal })).toEqual([]);
  });
});
