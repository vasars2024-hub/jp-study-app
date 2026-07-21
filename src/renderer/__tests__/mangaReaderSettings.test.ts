// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// localStorage is the only browser dependency here — stub it so this pure
// load/save module can run under the node test environment like the rest of
// this project's suite.
function makeMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

let storage: Storage;
beforeEach(() => {
  storage = makeMemoryStorage();
  vi.stubGlobal('localStorage', storage);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetModules();
});

describe('mangaReaderSettings', () => {
  it('returns defaults when nothing is stored', async () => {
    const { loadMangaReaderSettings, DEFAULT_MANGA_READER_SETTINGS } = await import('../mangaReaderSettings');
    expect(loadMangaReaderSettings()).toEqual(DEFAULT_MANGA_READER_SETTINGS);
  });

  it('round-trips a full save/load cycle', async () => {
    const { loadMangaReaderSettings, saveMangaReaderSettings, DEFAULT_MANGA_READER_SETTINGS } = await import(
      '../mangaReaderSettings'
    );
    const custom = {
      ...DEFAULT_MANGA_READER_SETTINGS,
      pageFit: 'stretch-width' as const,
      readerLayout: 'rtl' as const,
      spreadPageCount: 2,
      maxPageWidthPct: 80,
    };
    saveMangaReaderSettings(custom);
    expect(loadMangaReaderSettings()).toEqual(custom);
  });

  it('merges a partial/legacy stored object onto current defaults (forward-compatible)', async () => {
    const { loadMangaReaderSettings, DEFAULT_MANGA_READER_SETTINGS } = await import('../mangaReaderSettings');
    // Simulate a settings blob saved by an older version missing newer fields.
    storage.setItem('jp-manga-reader-settings', JSON.stringify({ pageFit: 'limit-width' }));
    const loaded = loadMangaReaderSettings();
    expect(loaded.pageFit).toBe('limit-width');
    expect(loaded.spreadPageCount).toBe(DEFAULT_MANGA_READER_SETTINGS.spreadPageCount);
    expect(loaded.themeColors).toEqual(DEFAULT_MANGA_READER_SETTINGS.themeColors);
  });

  it('deep-merges a partial themeColors object instead of dropping the rest', async () => {
    const { loadMangaReaderSettings, DEFAULT_MANGA_READER_SETTINGS } = await import('../mangaReaderSettings');
    storage.setItem(
      'jp-manga-reader-settings',
      JSON.stringify({ themeColors: { accent: '#00ff00' } }),
    );
    const loaded = loadMangaReaderSettings();
    expect(loaded.themeColors.accent).toBe('#00ff00');
    expect(loaded.themeColors.text).toBe(DEFAULT_MANGA_READER_SETTINGS.themeColors.text);
  });

  it('falls back to defaults on corrupt JSON rather than throwing', async () => {
    const { loadMangaReaderSettings, DEFAULT_MANGA_READER_SETTINGS } = await import('../mangaReaderSettings');
    storage.setItem('jp-manga-reader-settings', '{not valid json');
    expect(loadMangaReaderSettings()).toEqual(DEFAULT_MANGA_READER_SETTINGS);
  });

  it('CUBARI_THEME_COLORS is a complete, distinct palette', async () => {
    const { CUBARI_THEME_COLORS, DEFAULT_MANGA_READER_SETTINGS } = await import('../mangaReaderSettings');
    expect(Object.keys(CUBARI_THEME_COLORS).sort()).toEqual(
      Object.keys(DEFAULT_MANGA_READER_SETTINGS.themeColors).sort(),
    );
  });
});
