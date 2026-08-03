// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function storage(): Storage {
  const values = new Map<string, string>();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => void values.set(key, value), removeItem: (key) => void values.delete(key), clear: () => values.clear(), key: (index) => [...values.keys()][index] ?? null, get length() { return values.size; } } as Storage;
}

beforeEach(() => vi.stubGlobal('localStorage', storage()));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe('video server profiles local store', () => {
  it('persists only normalized documents', async () => {
    const store = await import('../videoServerProfilesStore');
    const saved = store.saveVideoServerProfilesDocument({ profiles: [{ id: 'server', name: 'Server', reliabilityScore: 200 }] });
    expect(saved.value.profiles[0].reliabilityScore).toBe(100);
    expect(store.loadVideoServerProfilesDocument()).toEqual(saved.value);
  });

  it('falls back safely for corrupt storage', async () => {
    const store = await import('../videoServerProfilesStore');
    localStorage.setItem(store.VIDEO_SERVER_PROFILES_STORAGE_KEY, '{bad');
    expect(store.loadVideoServerProfilesDocument().profiles).toEqual([]);
  });

  it('migrates the legacy local-storage key and writes the current schema', async () => {
    const store = await import('../videoServerProfilesStore');
    localStorage.setItem(store.LEGACY_VIDEO_SERVER_PROFILES_STORAGE_KEYS[0], JSON.stringify({ version: 1, servers: [{ serverId: 'old', serverName: 'Old' }] }));
    expect(store.loadVideoServerProfilesDocument().profiles[0].id).toBe('old');
    expect(JSON.parse(localStorage.getItem(store.VIDEO_SERVER_PROFILES_STORAGE_KEY) ?? '{}').version).toBe(3);
  });

  it('round-trips validated exports and rejects fatal imports without replacing data', async () => {
    const store = await import('../videoServerProfilesStore');
    const saved = store.saveVideoServerProfilesDocument({ profiles: [{ id: 'kept', name: 'Kept' }] }).value;
    expect(JSON.parse(store.exportVideoServerProfilesDocument()).version).toBe(3);
    expect(() => store.importVideoServerProfilesDocument('{bad')).toThrow('not valid');
    expect(() => store.importVideoServerProfilesDocument(JSON.stringify({ version: 999, profiles: [] }))).toThrow('newer app version');
    expect(store.loadVideoServerProfilesDocument()).toEqual(saved);
  });
});
