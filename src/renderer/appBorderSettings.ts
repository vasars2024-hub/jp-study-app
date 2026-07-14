// App border/window frame settings for Aero theme
export type AppBorderStyle = 
  | 'aero-glass'        // Default Vista Aero glass
  | 'blurred-wall'     // Blurred wallpaper background
  | 'solid-accent'     // Solid accent color
  | 'retro-xp'         // Windows XP style
  | 'minimal'          // Minimal thin border
  | 'glass-dark';      // Dark glass variant

export interface AppBorderSettings {
  style: AppBorderStyle;
  blurAmount: number; // 0-40px for blurred wallpaper
  cornerRadius: number; // 0-12px
  borderWidth: number; // 1-4px
}

const KEY = 'jp-app-border-settings';
const DEFAULTS: AppBorderSettings = {
  style: 'aero-glass',
  blurAmount: 16,
  cornerRadius: 8,
  borderWidth: 1,
};

const listeners = new Set<(s: AppBorderSettings) => void>();

export function loadAppBorderSettings(): AppBorderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<AppBorderSettings>;
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function applyAppBorderSettings(s: AppBorderSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-app-border', s.style);
  root.style.setProperty('--app-border-width', `${s.borderWidth}px`);
  root.style.setProperty('--app-border-blur', `${s.blurAmount}px`);
  root.style.setProperty('--app-border-radius', `${s.cornerRadius}px`);
}

export function bootAppBorderSettings(): void {
  applyAppBorderSettings(loadAppBorderSettings());
}

export function saveAppBorderSettings(s: AppBorderSettings): AppBorderSettings {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  applyAppBorderSettings(s);
  for (const l of listeners) l(s);
  return s;
}

export function onAppBorderSettingsChanged(cb: (s: AppBorderSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
