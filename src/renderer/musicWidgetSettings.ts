// Mini-player widget settings, persisted like the visualizer's (visualizerSettings.ts)
// and broadcast to live listeners.

export interface MusicWidgetSettings {
  /** Strict on/off switch for the widget's compact two-line lyrics container. */
  showLyrics: boolean;
}

const KEY = 'jp-os-music-widget';
const DEFAULTS: MusicWidgetSettings = { showLyrics: false };

const listeners = new Set<(s: MusicWidgetSettings) => void>();

export function loadMusicWidgetSettings(): MusicWidgetSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<MusicWidgetSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveMusicWidgetSettings(s: MusicWidgetSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(s);
}

export function toggleShowLyrics(): MusicWidgetSettings {
  const next = { ...loadMusicWidgetSettings() };
  next.showLyrics = !next.showLyrics;
  saveMusicWidgetSettings(next);
  return next;
}

/** Subscribe to settings changes. Returns an unsubscribe fn. */
export function onMusicWidgetSettingsChanged(cb: (s: MusicWidgetSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
