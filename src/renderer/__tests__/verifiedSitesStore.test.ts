// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('verified sites local store', () => {
  it('persists only normalized records', async () => {
    const store = await import('../verifiedSitesStore');
    const saved = store.saveVerifiedSitesDocument({ sites: [{ id: 'site', name: 'Site', baseUrl: 'https://site.test/', reliabilityScore: 130 }] });
    expect(saved.value.sites[0].reliabilityScore).toBe(100);
    expect(store.loadVerifiedSitesDocument()).toEqual(saved.value);
  });

  it('falls back safely for corrupt storage', async () => {
    const store = await import('../verifiedSitesStore');
    localStorage.setItem(store.VERIFIED_SITES_STORAGE_KEY, '{bad');
    expect(store.loadVerifiedSitesDocument().sites).toEqual([]);
  });

  it('promotes the legacy local-storage key to the current schema', async () => {
    const store = await import('../verifiedSitesStore');
    localStorage.setItem(store.LEGACY_VERIFIED_SITES_STORAGE_KEYS[2], JSON.stringify({
      version: 1,
      records: [{ id: 'old', name: 'Old Site', url: 'https://old.test' }],
    }));
    const loaded = store.loadVerifiedSitesDocument();
    expect(loaded.sites[0].baseUrl).toBe('https://old.test');
    expect(localStorage.getItem(store.VERIFIED_SITES_STORAGE_KEY)).not.toBeNull();
  });

  it('exports normalized JSON and imports only through validated persistence', async () => {
    const store = await import('../verifiedSitesStore');
    const imported = store.importVerifiedSitesDocument(JSON.stringify({
      sites: [{ id: 'portable', name: 'Portable', baseUrl: 'https://portable.test/', reliabilityScore: 120 }],
    }));
    expect(imported.value.sites[0].reliabilityScore).toBe(100);
    expect(JSON.parse(store.exportVerifiedSitesDocument()).version).toBe(4);
    expect(() => store.importVerifiedSitesDocument('{bad')).toThrow('not valid');
  });

  it('rejects incompatible documents without replacing the saved database', async () => {
    const store = await import('../verifiedSitesStore');
    const saved = store.saveVerifiedSitesDocument({
      sites: [{ id: 'kept', name: 'Kept', baseUrl: 'https://kept.test' }],
    }).value;

    expect(() => store.importVerifiedSitesDocument(JSON.stringify({ version: 999, sites: [] })))
      .toThrow('newer app version');
    expect(() => store.importVerifiedSitesDocument(JSON.stringify([])))
      .toThrow('Expected a verified-sites document');
    expect(store.loadVerifiedSitesDocument()).toEqual(saved);
  });

  it('caches and validates an explicitly accepted FMHY source snapshot', async () => {
    const store = await import('../verifiedSitesStore');
    expect(store.loadFmhyDirectorySnapshot()).toBeNull();
    store.saveFmhyDirectorySnapshot('<html>directory</html>', 4, '2026-07-22T12:00:00.000Z');
    const accepted = { version: 1 as const, sourceUrl: 'https://fmhy.net/video' as const, capturedAt: '2026-07-22T12:00:00.000Z', html: '<html>directory</html>', entryCount: 4 };
    expect(store.loadFmhyDirectorySnapshot()).toEqual(accepted);
    localStorage.setItem(store.FMHY_SNAPSHOT_STORAGE_KEY, JSON.stringify({ version: 2, html: 'bad' }));
    expect(store.loadFmhyDirectorySnapshot()).toEqual(accepted);
  });
});
