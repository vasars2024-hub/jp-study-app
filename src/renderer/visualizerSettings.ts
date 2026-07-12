// Music-visualizer settings, persisted like the other OS-look options and
// broadcast to live listeners (DesktopShell wallpaper layer, widgets, Settings).

export type VizMode = 'wallpaper' | 'widget' | 'both';
export type VizStyle = 'spectrum' | 'wave' | 'particles';
export type FreqTarget = 'full' | 'bass';
export type ColorTheme = 'accent' | 'album' | 'custom';

export interface VizSettings {
  enabled: boolean;
  mode: VizMode;
  style: VizStyle;
  /** 0..1 — sensitivity: how violently the visuals react. */
  intensity: number;
  /** React to the whole track, or dance strictly to the bass band. */
  freqTarget: FreqTarget;
  /** Analyser FFT size — bigger = finer frequency bars. */
  fftSize: 256 | 512 | 1024 | 2048;
  colorTheme: ColorTheme;
  /** Gradient pair used when colorTheme = 'custom'. */
  customColors: [string, string];
}

const KEY = 'jp-os-visualizer';
const DEFAULTS: VizSettings = {
  enabled: true,
  mode: 'wallpaper',
  style: 'spectrum',
  intensity: 0.7,
  freqTarget: 'full',
  fftSize: 1024,
  colorTheme: 'accent',
  customColors: ['#ff2e4d', '#7a5cff'],
};

const listeners = new Set<(s: VizSettings) => void>();

export function loadVizSettings(): VizSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<VizSettings> & { style?: string };
    // Migrate the first version's style name.
    if (saved.style === 'bars') saved.style = 'spectrum';
    if (!['spectrum', 'wave', 'particles'].includes(saved.style ?? '')) delete saved.style;
    return { ...DEFAULTS, ...(saved as Partial<VizSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveVizSettings(s: VizSettings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  for (const l of listeners) l(s);
}

/** Subscribe to settings changes. Returns an unsubscribe fn. */
export function onVizSettingsChanged(cb: (s: VizSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
