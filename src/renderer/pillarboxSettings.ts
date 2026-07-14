// Pillarbox/outer border style settings for Aero theme
import { onThemeChanged } from './theme/engine';

export type PillarboxStyle =
  | 'default-gradient'
  | 'blurred-wallpaper'
  | 'solid-color'
  | 'dark-mode';

export interface PillarboxSettings {
  style: PillarboxStyle;
  solidColor: string; // hex color for solid-color mode
}

const KEY = 'jp-pillarbox-settings';
const DEFAULTS: PillarboxSettings = {
  style: 'default-gradient',
  solidColor: '#1a1a2e',
};

const listeners = new Set<(s: PillarboxSettings) => void>();
let themeHookInstalled = false;

export function loadPillarboxSettings(): PillarboxSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    const saved = JSON.parse(raw) as Partial<PillarboxSettings>;
    return { ...DEFAULTS, ...saved };
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePillarboxSettings(s: PillarboxSettings): PillarboxSettings {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
  applyPillarboxSettings(s);
  for (const l of listeners) l(s);
  return s;
}

export function applyPillarboxSettings(s: PillarboxSettings): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.setAttribute('data-pillarbox', s.style);
  root.style.setProperty('--pillarbox-solid-color', s.solidColor);
}

/** Feed the active desktop wallpaper into blurred pillarbox mode. */
export function syncPillarboxWallImage(url: string | null): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (url) {
    const safe = url.replace(/"/g, '%22');
    root.style.setProperty('--pillarbox-wall-image', `url("${safe}")`);
  } else {
    root.style.removeProperty('--pillarbox-wall-image');
  }
}

export function bootPillarboxSettings(): void {
  applyPillarboxSettings(loadPillarboxSettings());
  if (themeHookInstalled) return;
  themeHookInstalled = true;
  onThemeChanged(() => {
    applyPillarboxSettings(loadPillarboxSettings());
  });
}

export function onPillarboxSettingsChanged(cb: (s: PillarboxSettings) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
