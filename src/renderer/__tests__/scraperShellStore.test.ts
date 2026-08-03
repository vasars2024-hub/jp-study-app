// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mirrors scraperSettingsStore.test.ts: a minimal Storage stand-in, re-imported
// per test so each case starts from a clean module-level memory fallback.
function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => void map.delete(key),
    setItem: (key: string, value: string) => void map.set(key, value),
  } as Storage;
}

describe('scraper shell store', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal('localStorage', memoryStorage());
  });

  it('persists a patch and reads it back', async () => {
    const store = await import('../scraperShellStore');
    store.patchScraperShellState({ page: 'torrents', pageSize: 50 });

    const raw = localStorage.getItem(store.SCRAPER_SHELL_STORAGE_KEY);
    expect(raw).toBeTruthy();

    const loaded = store.loadScraperShellState();
    expect(loaded.page).toBe('torrents');
    expect(loaded.pageSize).toBe(50);
  });

  it('validates on the way in, so a bad patch cannot poison storage', async () => {
    const store = await import('../scraperShellStore');
    store.saveScraperShellState({ page: 'nonsense', pageSize: 9999 });

    const loaded = store.loadScraperShellState();
    expect(loaded.page).toBe('dashboard');
    expect(loaded.pageSize).toBe(10);
  });

  it('records the visit when navigating, so the MRU cannot drift from the page', async () => {
    const store = await import('../scraperShellStore');
    store.navigateScraperShell('exports');
    store.navigateScraperShell('downloads');

    const loaded = store.loadScraperShellState();
    expect(loaded.page).toBe('downloads');
    expect(loaded.recentPages.slice(0, 2)).toEqual(['downloads', 'exports']);
  });

  it('falls back to defaults when stored JSON is corrupt', async () => {
    const store = await import('../scraperShellStore');
    localStorage.setItem(store.SCRAPER_SHELL_STORAGE_KEY, '{not json');
    expect(store.loadScraperShellState().page).toBe('dashboard');
  });

  it('keeps the validated value in memory when storage throws', async () => {
    const store = await import('../scraperShellStore');
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    } as unknown as Storage);

    // The write cannot land on disk, but the app must not lose the change.
    expect(() => store.patchScraperShellState({ page: 'results' })).not.toThrow();
    expect(store.loadScraperShellState().page).toBe('results');
  });
});
