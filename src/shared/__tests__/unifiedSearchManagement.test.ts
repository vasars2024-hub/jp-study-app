import { describe, expect, it } from 'vitest';
import type { UnifiedSearchResult } from '../unifiedSearch';
import {
  EMPTY_UNIFIED_SEARCH_FILTERS,
  addUnifiedSearchHistory,
  filterUnifiedSearchResults,
  normalizeUnifiedSearchHistory,
  createUnifiedSearchManagementId,
  getUnifiedSearchSuggestions,
  normalizeUnifiedSearchManagement,
} from '../unifiedSearchManagement';

const result = (patch: Partial<UnifiedSearchResult>): UnifiedSearchResult => ({
  id: 'one', providerId: 'local', providerResultId: 'one', title: 'One', alternativeTitles: [],
  japaneseTitle: null, romajiTitle: null, authorsOrStudios: [], coverUrl: null, language: 'ja',
  availability: 'available', metadataQuality: null, episodeCount: null, trackingStatus: 'watching',
  mediaType: 'anime', year: 2023, season: 'Fall', genres: ['Fantasy', 'Adventure'], ...patch,
});

describe('unified search suggestions and saved management', () => {
  it('keeps favorite and recent suggestions partitioned in stable stored order', () => {
    const favorites = [{ id: 'f1', query: 'Frieren favorite', filters: { ...EMPTY_UNIFIED_SEARCH_FILTERS }, createdAt: 1 }];
    const suggestions = getUnifiedSearchSuggestions('FRIEREN', [{ query: 'Frieren recent', searchedAt: 2 }], favorites);
    expect(suggestions.favorites.map((item) => item.query)).toEqual(['Frieren favorite']);
    expect(suggestions.recent.map((item) => item.query)).toEqual(['Frieren recent']);
  });

  it('creates deterministic IDs and normalizes malformed persisted values', () => {
    expect(createUnifiedSearchManagementId('preset', '  Current Filters ')).toBe(createUnifiedSearchManagementId('preset', 'current filters'));
    expect(normalizeUnifiedSearchManagement({ favorites: [{ id: 'one', query: '  Saved  ', filters: { genres: [' Fantasy ', 'Fantasy'] }, createdAt: 1 }], presets: [{ id: 'one', name: 'duplicate id', createdAt: 2 }] })).toEqual({
      version: 1,
      favorites: [{ id: 'one', query: 'Saved', filters: { ...EMPTY_UNIFIED_SEARCH_FILTERS, genres: ['Fantasy'] }, createdAt: 1 }],
      presets: [],
    });
  });
});

describe('unified search local filters', () => {
  it('applies combined filters without changing input order', () => {
    const input = [result({ id: 'a' }), result({ id: 'b', providerResultId: 'b', year: 2024 }), result({ id: 'c', providerId: 'other', providerResultId: 'c' })];
    const filtered = filterUnifiedSearchResults(input, {
      ...EMPTY_UNIFIED_SEARCH_FILTERS, providerIds: ['local'], languages: ['JA'], mediaTypes: ['anime'],
      genres: ['fantasy'], seasons: ['fall'], availability: ['available'], trackingStatuses: ['watching'],
      yearFrom: 2023, yearTo: 2024,
    });
    expect(filtered.map((item) => item.id)).toEqual(['a', 'b']);
    expect(input.map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('excludes unknown years only when a year bound is active', () => {
    const unknown = result({ year: null });
    expect(filterUnifiedSearchResults([unknown], EMPTY_UNIFIED_SEARCH_FILTERS)).toEqual([unknown]);
    expect(filterUnifiedSearchResults([unknown], { ...EMPTY_UNIFIED_SEARCH_FILTERS, yearFrom: 2000 })).toEqual([]);
  });
});

describe('unified search history', () => {
  it('normalizes, deduplicates case-insensitively, and caps recent searches', () => {
    let history = addUnifiedSearchHistory([], '  Sousou   no Frieren ', 1, 2);
    history = addUnifiedSearchHistory(history, 'frieren', 2, 2);
    history = addUnifiedSearchHistory(history, 'SOUSOU NO FRIEREN', 3, 2);
    expect(history).toEqual([{ query: 'SOUSOU NO FRIEREN', searchedAt: 3 }, { query: 'frieren', searchedAt: 2 }]);
  });

  it('rejects malformed persisted entries and restores newest-first order', () => {
    expect(normalizeUnifiedSearchHistory([
      { query: 'older', searchedAt: 1 }, null, { query: 5, searchedAt: 2 }, { query: 'newer', searchedAt: 3 },
    ])).toEqual([{ query: 'newer', searchedAt: 3 }, { query: 'older', searchedAt: 1 }]);
  });
});
