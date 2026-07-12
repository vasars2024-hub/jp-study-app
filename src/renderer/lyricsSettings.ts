// Lyrics lookup preferences — shared by the Music app and mini-player widget.

export interface LyricsSettings {
  /** Include album + parent folder names when querying LRCLIB. */
  useAlbumInSearch: boolean;
}

const KEY = 'jp-lyrics-settings';
const DEFAULTS: LyricsSettings = { useAlbumInSearch: true };

const listeners = new Set<(s: LyricsSettings) => void>();

export function loadLyricsSettings(): LyricsSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LyricsSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveLyricsSettings(s: LyricsSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(s);
}

export function setUseAlbumInSearch(on: boolean): LyricsSettings {
  const next = { ...loadLyricsSettings(), useAlbumInSearch: on };
  saveLyricsSettings(next);
  return next;
}

export function toggleUseAlbumInSearch(): LyricsSettings {
  const cur = loadLyricsSettings();
  return setUseAlbumInSearch(!cur.useAlbumInSearch);
}

export function onLyricsSettingsChanged(cb: (s: LyricsSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
