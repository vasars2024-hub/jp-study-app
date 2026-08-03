// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
    key: (index: number) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('scraper settings store', () => {
  it('persists validated active-profile changes', async () => {
    const store = await import('../scraperSettingsStore');
    const initial = store.loadScraperSettingsDocument();
    expect(initial.activeProfileId).toBe('balanced');

    const saved = store.updateActiveScraperSettings({ network: { concurrentRequests: 99 } });
    expect(saved.profiles.find((profile) => profile.id === 'balanced')?.settings.network.concurrentRequests).toBe(32);
    expect(store.getActiveScraperSettings().network.concurrentRequests).toBe(32);
  });

  it('round-trips versioned JSON exports', async () => {
    const store = await import('../scraperSettingsStore');
    store.chooseScraperPreset('thorough');
    const json = store.exportScraperSettings();

    localStorage.clear();
    const imported = store.importScraperSettings(json);
    expect(imported.issues).toEqual([]);
    expect(store.getActiveScraperSettings().network.concurrentRequests).toBe(2);
  });

  it('rejects malformed JSON and documents from a newer version', async () => {
    const store = await import('../scraperSettingsStore');
    expect(() => store.importScraperSettings('{bad')).toThrow('not valid JSON');
    expect(() => store.importScraperSettings(JSON.stringify({ version: 999 }))).toThrow(
      'newer app version',
    );
  });
});
