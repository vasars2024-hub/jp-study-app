// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const provider = (id: string, priority: number, patch: Record<string, unknown> = {}) => ({
  id,
  name: `Provider ${id}`,
  role: 'metadata',
  enabled: true,
  priority,
  contentTypes: ['anime'],
  capabilities: { search: true, metadata: true, episodes: false, artwork: false, tracking: false, subtitles: false },
  ...patch,
});

describe('media provider store', () => {
  it('persists a normalized document and reloads it', async () => {
    const store = await import('../mediaProviderStore');
    const result = store.saveMediaProvidersDocument({ providers: [provider('tmdb', 10), provider('anilist', 20)] });
    expect(result.value.providers.map((item) => item.id)).toEqual(['tmdb', 'anilist']);
    expect(store.loadMediaProvidersDocument().providers).toHaveLength(2);
    expect(localStorage.getItem(store.MEDIA_PROVIDER_STORAGE_KEY)).toContain('anilist');
  });

  it('toggles a provider enabled flag without touching others', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({ providers: [provider('tmdb', 10), provider('anilist', 20)] });
    const next = store.setMediaProviderEnabled('tmdb', false);
    expect(next.providers.find((item) => item.id === 'tmdb')?.enabled).toBe(false);
    expect(next.providers.find((item) => item.id === 'anilist')?.enabled).toBe(true);
  });

  it('reorders providers by reassigning contiguous priorities', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({ providers: [provider('a', 10), provider('b', 20), provider('c', 30)] });
    const next = store.reorderMediaProviders(['c', 'a', 'b']);
    expect(next.providers.map((item) => [item.id, item.priority])).toEqual([['c', 0], ['a', 1], ['b', 2]]);
  });

  it('upserts and removes provider records, cascading descriptors', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({
      providers: [provider('tmdb', 10)],
      descriptors: [{ providerId: 'tmdb', providerItemId: 'x1', title: 'Frieren', contentType: 'anime' }],
    });
    const upserted = store.upsertMediaProviderRecord(provider('tmdb', 5, { name: 'TMDB updated' }));
    expect(upserted.value.providers[0].name).toBe('TMDB updated');
    expect(upserted.value.descriptors).toHaveLength(1);
    const removed = store.removeMediaProviderRecord('tmdb');
    expect(removed.providers).toHaveLength(0);
    expect(removed.descriptors).toHaveLength(0);
  });

  it('round-trips through export and import, rejecting a newer version', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({ providers: [provider('tmdb', 10)] });
    const json = store.exportMediaProvidersDocument();
    expect(store.importMediaProvidersDocument(json).value.providers).toHaveLength(1);
    expect(() => store.importMediaProvidersDocument('{"version":999}')).toThrow(/newer app version/);
    expect(() => store.importMediaProvidersDocument('{bad')).toThrow(/not valid/);
  });

  it('retains valid memory state when persisted JSON becomes corrupt', async () => {
    const store = await import('../mediaProviderStore');
    store.saveMediaProvidersDocument({ providers: [provider('tmdb', 10)] });
    localStorage.setItem(store.MEDIA_PROVIDER_STORAGE_KEY, '{bad');
    expect(store.loadMediaProvidersDocument().providers.map((item) => item.id)).toEqual(['tmdb']);
  });
});
