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
  /**
   * Native Fill (Phase 4 · M3): let the Aero desktop fill the whole window
   * instead of the fixed 1280×960 4:3 stage. Presentation only — the shell,
   * window manager and app layouts are untouched; only the frame's geometry
   * changes, so there are no pillarboxes left to style.
   */
  nativeFill: boolean;
}

const KEY = 'jp-pillarbox-settings';
const DEFAULTS: PillarboxSettings = {
  style: 'default-gradient',
  solidColor: '#1a1a2e',
  nativeFill: false,
};

const listeners = new Set<(s: PillarboxSettings) => void>();
let themeHookInstalled = false;
let storageSyncCleanup: (() => void) | null = null;

const PILLARBOX_STYLES: readonly PillarboxStyle[] = [
  'default-gradient',
  'blurred-wallpaper',
  'solid-color',
  'dark-mode',
];

function normalizePillarboxSettings(value: unknown): PillarboxSettings {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...DEFAULTS };
  const saved = value as Partial<PillarboxSettings>;
  return {
    style: typeof saved.style === 'string'
      && (PILLARBOX_STYLES as readonly string[]).includes(saved.style)
      ? saved.style as PillarboxStyle
      : DEFAULTS.style,
    solidColor: typeof saved.solidColor === 'string' && /^#[0-9a-f]{6}$/i.test(saved.solidColor)
      ? saved.solidColor
      : DEFAULTS.solidColor,
    nativeFill: saved.nativeFill === true,
  };
}

function pillarboxSettingsFromRaw(raw: string | null): PillarboxSettings {
  if (!raw) return { ...DEFAULTS };
  try {
    return normalizePillarboxSettings(JSON.parse(raw));
  } catch {
    return { ...DEFAULTS };
  }
}

function notifyPillarboxSettingsChanged(settings: PillarboxSettings): void {
  for (const listener of listeners) listener(settings);
}

export function loadPillarboxSettings(): PillarboxSettings {
  try {
    return pillarboxSettingsFromRaw(localStorage.getItem(KEY));
  } catch {
    return { ...DEFAULTS };
  }
}

export function savePillarboxSettings(s: PillarboxSettings): PillarboxSettings {
  const next = normalizePillarboxSettings(s);
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyPillarboxSettings(next);
  notifyPillarboxSettingsChanged(next);
  return next;
}

export function applyPillarboxSettings(s: PillarboxSettings): void {
  if (typeof document === 'undefined') return;
  const next = normalizePillarboxSettings(s);
  const root = document.documentElement;
  root.setAttribute('data-pillarbox', next.style);
  root.setAttribute('data-aero-fill', next.nativeFill ? 'on' : 'off');
  root.style.setProperty('--pillarbox-solid-color', next.solidColor);
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
  startPillarboxSettingsSync();
  if (themeHookInstalled) return;
  themeHookInstalled = true;
  onThemeChanged(() => {
    applyPillarboxSettings(loadPillarboxSettings());
  });
}

/**
 * Keep every Electron renderer on the same Classic 4:3 / Native Fill choice.
 * The sibling renderer already persisted the value, so this path deliberately
 * performs no storage write and cannot create a ping-pong loop.
 */
export function startPillarboxSettingsSync(): () => void {
  if (storageSyncCleanup) return storageSyncCleanup;

  const onStorage = (event: StorageEvent): void => {
    if (event.key !== KEY) return;
    const next = pillarboxSettingsFromRaw(event.newValue);
    applyPillarboxSettings(next);
    notifyPillarboxSettingsChanged(next);
  };
  window.addEventListener('storage', onStorage);
  const cleanup = (): void => {
    if (storageSyncCleanup !== cleanup) return;
    window.removeEventListener('storage', onStorage);
    storageSyncCleanup = null;
  };
  storageSyncCleanup = cleanup;
  return cleanup;
}

export function onPillarboxSettingsChanged(cb: (s: PillarboxSettings) => void): () => void {
  startPillarboxSettingsSync();
  listeners.add(cb);
  return () => listeners.delete(cb);
}
