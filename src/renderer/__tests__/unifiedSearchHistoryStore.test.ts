// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('unified search history store', () => {
  it('persists bounded normalized history and clears it', async () => {
    const store = await import('../unifiedSearchHistoryStore');
    store.recordUnifiedSearchHistory('  Frieren  ', 1);
    store.recordUnifiedSearchHistory('frieren', 2);
    expect(store.loadUnifiedSearchHistory()).toEqual([{ query: 'frieren', searchedAt: 2 }]);
    expect(localStorage.getItem(store.UNIFIED_SEARCH_HISTORY_STORAGE_KEY)).toContain('frieren');
    store.clearUnifiedSearchHistory();
    expect(store.loadUnifiedSearchHistory()).toEqual([]);
  });

  it('retains valid memory state when persisted JSON becomes corrupt', async () => {
    const store = await import('../unifiedSearchHistoryStore');
    store.recordUnifiedSearchHistory('Local only', 4);
    localStorage.setItem(store.UNIFIED_SEARCH_HISTORY_STORAGE_KEY, '{bad');
    expect(store.loadUnifiedSearchHistory()).toEqual([{ query: 'Local only', searchedAt: 4 }]);
  });
});
