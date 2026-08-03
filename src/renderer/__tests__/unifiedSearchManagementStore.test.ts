// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EMPTY_UNIFIED_SEARCH_FILTERS } from '../../shared/unifiedSearchManagement';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('unified search management store', () => {
  it('persists favorites and reusable filter presets independently', async () => {
    const store = await import('../unifiedSearchManagementStore');
    store.saveUnifiedSearchFavorite('favorite-one', 'Frieren', { ...EMPTY_UNIFIED_SEARCH_FILTERS, languages: ['ja'] }, 1);
    store.saveUnifiedSearchPreset('preset-one', 'Japanese anime', { ...EMPTY_UNIFIED_SEARCH_FILTERS, mediaTypes: ['anime'] }, 2);
    expect(store.loadUnifiedSearchManagement()).toMatchObject({
      favorites: [{ id: 'favorite-one', query: 'Frieren', filters: { languages: ['ja'] } }],
      presets: [{ id: 'preset-one', name: 'Japanese anime', filters: { mediaTypes: ['anime'] } }],
    });
    store.removeUnifiedSearchFavorite('favorite-one');
    expect(store.loadUnifiedSearchManagement().favorites).toEqual([]);
    expect(store.loadUnifiedSearchManagement().presets).toHaveLength(1);
  });

  it('retains the last valid state when persisted JSON is corrupt', async () => {
    const store = await import('../unifiedSearchManagementStore');
    store.saveUnifiedSearchPreset('stable', 'Stable', EMPTY_UNIFIED_SEARCH_FILTERS, 3);
    localStorage.setItem(store.UNIFIED_SEARCH_MANAGEMENT_STORAGE_KEY, '{bad');
    expect(store.loadUnifiedSearchManagement().presets[0].id).toBe('stable');
  });
});
