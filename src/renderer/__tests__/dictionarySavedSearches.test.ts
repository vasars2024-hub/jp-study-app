// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('dictionary saved searches', () => {
  it('normalizes, deduplicates by language and supports removal', async () => {
    const store = await import('../dictionarySavedSearches');
    store.saveDictionarySearch({ query: '  食べる  ', lang: 'ja' });
    store.saveDictionarySearch({ query: '食べる', lang: 'ja' });
    store.saveDictionarySearch({ query: '食べる', lang: 'zh' });
    expect(store.loadDictionarySavedSearches()).toEqual([
      { query: '食べる', lang: 'zh' },
      { query: '食べる', lang: 'ja' },
    ]);
    expect(store.removeDictionarySavedSearch({ query: '食べる', lang: 'ja' })).toEqual([
      { query: '食べる', lang: 'zh' },
    ]);
  });

  it('keeps valid memory when storage is corrupt and clears persistently', async () => {
    const store = await import('../dictionarySavedSearches');
    store.saveDictionarySearch({ query: '猫', lang: 'ja' });
    localStorage.setItem(store.DICTIONARY_SAVED_SEARCHES_KEY, '{bad');
    expect(store.loadDictionarySavedSearches()).toEqual([{ query: '猫', lang: 'ja' }]);
    store.clearDictionarySavedSearches();
    expect(store.loadDictionarySavedSearches()).toEqual([]);
  });

  it('rejects invalid persisted rows and enforces the cap', async () => {
    const store = await import('../dictionarySavedSearches');
    for (let index = 0; index < 30; index += 1) {
      store.saveDictionarySearch({ query: `word ${index}`, lang: 'ja' });
    }
    expect(store.loadDictionarySavedSearches()).toHaveLength(store.DICTIONARY_SAVED_SEARCHES_LIMIT);
    localStorage.setItem(store.DICTIONARY_SAVED_SEARCHES_KEY, JSON.stringify([{ query: '', lang: 'ja' }, { query: 'ok', lang: 'xx' }]));
    expect(store.loadDictionarySavedSearches()).toEqual([]);
  });

  it('keeps save, remove, and clear usable when storage writes are denied', async () => {
    const store = await import('../dictionarySavedSearches');
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
      throw new DOMException('Quota exceeded', 'QuotaExceededError');
    });
    vi.spyOn(localStorage, 'removeItem').mockImplementation(() => {
      throw new DOMException('Storage denied', 'SecurityError');
    });

    expect(store.saveDictionarySearch({ query: '猫', lang: 'ja' })).toEqual([
      { query: '猫', lang: 'ja' },
    ]);
    expect(store.removeDictionarySavedSearch({ query: '猫', lang: 'ja' })).toEqual([]);
    expect(() => store.clearDictionarySavedSearches()).not.toThrow();
    expect(store.loadDictionarySavedSearches()).toEqual([]);
  });
});
