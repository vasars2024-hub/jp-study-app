// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

const provider = { id: 'local', name: 'Local', kind: 'local-library', definition: { method: 'local' } };

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('unified search local store', () => {
  it('persists only normalized provider configuration, groups, ordering, and inert snapshots', async () => {
    const store = await import('../unifiedSearchStore');
    const saved = store.saveUnifiedSearchDocument({
      providers: [{ ...provider, priority: -2, groupIds: ['anime'] }],
      groups: [{ id: 'anime', name: 'Anime', providerIds: ['local'] }],
      results: [{ providerId: 'local', providerResultId: 'frieren', title: 'Frieren', metadataQuality: 120 }],
    });
    expect(saved.value.providers[0].priority).toBe(0);
    expect(saved.value.groups[0].providerIds).toEqual(['local']);
    expect(saved.value.results[0]).toMatchObject({ title: 'Frieren', metadataQuality: 100 });
    expect(store.loadUnifiedSearchDocument()).toEqual(saved.value);
  });

  it('migrates legacy field names and explicit provider ordering to the current document', async () => {
    const store = await import('../unifiedSearchStore');
    localStorage.setItem(store.LEGACY_UNIFIED_SEARCH_STORAGE_KEYS[0], JSON.stringify({
      providerConfigurations: [{ ...provider }, { id: 'site', name: 'Site' }],
      providerOrder: ['site', 'local'],
      sourceGroups: [{ id: 'anime', name: 'Anime', providerIds: ['site'] }],
      resultSnapshots: [{ providerId: 'site', providerResultId: '1', title: 'Snapshot' }],
    }));
    const loaded = store.loadUnifiedSearchDocument();
    expect(loaded.providers.map((item) => [item.id, item.priority])).toEqual([['local', 1], ['site', 0]]);
    expect(loaded.groups[0].providerIds).toEqual(['site']);
    expect(loaded.results[0].title).toBe('Snapshot');
    expect(JSON.parse(localStorage.getItem(store.UNIFIED_SEARCH_STORAGE_KEY) ?? '{}').version).toBe(1);
  });

  it('recovers from corrupt current storage through a valid legacy snapshot', async () => {
    const store = await import('../unifiedSearchStore');
    localStorage.setItem(store.UNIFIED_SEARCH_STORAGE_KEY, '{bad');
    localStorage.setItem(store.LEGACY_UNIFIED_SEARCH_STORAGE_KEYS[1], JSON.stringify({ providers: [provider] }));
    expect(store.loadUnifiedSearchDocument().providers[0].id).toBe('local');
  });

  it('retains the last validated in-memory document when storage becomes corrupt', async () => {
    const store = await import('../unifiedSearchStore');
    const saved = store.saveUnifiedSearchDocument({ providers: [provider] }).value;
    localStorage.setItem(store.UNIFIED_SEARCH_STORAGE_KEY, '{bad');
    expect(store.loadUnifiedSearchDocument()).toEqual(saved);
  });

  it('round-trips exports and rejects fatal imports without replacing persisted data', async () => {
    const store = await import('../unifiedSearchStore');
    const saved = store.saveUnifiedSearchDocument({ providers: [provider] }).value;
    expect(JSON.parse(store.exportUnifiedSearchDocument()).providers[0].id).toBe('local');
    expect(() => store.importUnifiedSearchDocument('{bad')).toThrow('not valid');
    expect(() => store.importUnifiedSearchDocument(JSON.stringify({ version: 999 }))).toThrow('newer app version');
    expect(store.loadUnifiedSearchDocument()).toEqual(saved);
  });

  it('dispatches successful actions atomically and never persists rejected actions', async () => {
    const store = await import('../unifiedSearchStore');
    store.saveUnifiedSearchDocument({ providers: [provider] });
    const before = localStorage.getItem(store.UNIFIED_SEARCH_STORAGE_KEY);
    const rejected = store.dispatchUnifiedSearchAction({ type: 'provider/reorder', providerIds: [] });
    expect(rejected.ok).toBe(false);
    expect(localStorage.getItem(store.UNIFIED_SEARCH_STORAGE_KEY)).toBe(before);
    const cleared = store.dispatchUnifiedSearchAction({ type: 'snapshots/clear' });
    expect(cleared.ok).toBe(true);
    expect(store.loadUnifiedSearchDocument()).toEqual(cleared.value);
  });
});
