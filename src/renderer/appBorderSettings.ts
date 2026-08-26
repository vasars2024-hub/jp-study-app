// App border/window frame settings for Aero theme
import { setRootVars, setRootVarsNow } from './rootCssVars';

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

function borderVars(s: AppBorderSettings): Record<string, string> {
  return {
    '--app-border-width': `${s.borderWidth}px`,
    '--app-border-blur': `${s.blurAmount}px`,
    '--app-border-radius': `${s.cornerRadius}px`,
  };
}

/**
 * The blur and width controls are `<input type="range">`, so this runs once per
 * slider tick. Each of these three is inherited from `:root`, and a changed one
 * costs a full-document style recalc — 87 ms measured with ten windows open —
 * so writing them inside the input handler froze the desk for the whole drag.
 * `setRootVars` coalesces the tick storm into one write per frame; see
 * `rootCssVars.ts` for the measurements.
 */
export function applyAppBorderSettings(s: AppBorderSettings): void {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('data-app-border', s.style);
  setRootVars(borderVars(s));
}

export function bootAppBorderSettings(): void {
  const s = loadAppBorderSettings();
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-app-border', s.style);
  }
  // Boot runs before first paint; a frame's delay here shows an unstyled desk.
  setRootVarsNow(borderVars(s));
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
