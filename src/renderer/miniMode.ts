/**
 * Mini View — reduced launcher with 6–9 pinned apps that open as OS pop-out windows.
 * Full desktop / living layer stay dormant while mini is active.
 */

import type { DesktopWinSection } from '../shared/desktop';

/** Apps that can be pinned in Mini (must be pop-out capable). */
export type MiniAppId =
  | 'library'
  | 'novels'
  | 'dictionary'
  | 'grammar'
  | 'translate'
  | 'player'
  | 'music'
  | 'anki'
  | 'flashcards'
  | 'stats'
  | 'resources'
  | 'immersion'
  | 'calendar'
  | 'settings';

export type MiniDensity = 'compact' | 'comfortable' | 'spacious';
export type MiniThemeTint = 'neutral' | 'ember' | 'slate' | 'moss';
/** Backdrop behind the craft frame. */
export type MiniWallpaperMode = 'none' | 'image' | 'icons';

export interface MiniModeSettings {
  /** When true, App mounts MiniShell instead of DesktopShell. */
  enabled: boolean;
  /** Ordered app ids (6–9). */
  apps: MiniAppId[];
  density: MiniDensity;
  /** Show a small clock in the mini header. */
  showClock: boolean;
  /** Soft background tint for the mini launcher. */
  tint: MiniThemeTint;
  /** Open the first pinned app as a pop-out on mini start. */
  autoOpenFirst: boolean;
  /**
   * Backdrop style:
   * - none: tint only
   * - image: user-picked wallpaper
   * - icons: mosaic of pinned app icons as wallpaper
   */
  wallpaperMode: MiniWallpaperMode;
  /** Absolute path for image mode (library copy). */
  wallpaperPath: string;
  /** localfile:// or file url for display. */
  wallpaperUrl: string;
  /** Gaussian blur on the wallpaper layer, 0–40 px. */
  wallpaperBlur: number;
}

const KEY = 'jp-study-mini-mode-v1';
const EVENT = 'jp-mini-mode-changed';

export const MINI_APP_CATALOG: { id: MiniAppId; label: string; icon: string }[] = [
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'dictionary', label: 'Dictionary', icon: 'dictionary' },
  { id: 'flashcards', label: 'Flashcards', icon: 'flashcards' },
  { id: 'anki', label: 'Anki', icon: 'anki' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'player', label: 'Media', icon: 'player' },
  { id: 'novels', label: 'Novels', icon: 'novels' },
  { id: 'translate', label: 'Translate', icon: 'translate' },
  { id: 'grammar', label: 'Grammar', icon: 'grammar' },
  { id: 'immersion', label: 'Immersion', icon: 'globe' },
  { id: 'stats', label: 'Statistics', icon: 'stats' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'resources', label: 'Resources', icon: 'resources' },
  { id: 'settings', label: 'Settings', icon: 'settings' },
];

const DEFAULT_APPS: MiniAppId[] = [
  'library',
  'dictionary',
  'flashcards',
  'anki',
  'music',
  'translate',
];

export const MINI_MIN_APPS = 6;
export const MINI_MAX_APPS = 9;

const DEFAULTS: MiniModeSettings = {
  enabled: false,
  apps: DEFAULT_APPS,
  density: 'comfortable',
  showClock: true,
  tint: 'neutral',
  autoOpenFirst: false,
  wallpaperMode: 'icons',
  wallpaperPath: '',
  wallpaperUrl: '',
  wallpaperBlur: 12,
};

function clampBlur(n: unknown): number {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v)) return DEFAULTS.wallpaperBlur;
  return Math.max(0, Math.min(40, Math.round(v)));
}

export function isMiniAppId(id: string): id is MiniAppId {
  return MINI_APP_CATALOG.some((a) => a.id === id);
}

function sanitizeApps(list: unknown): MiniAppId[] {
  if (!Array.isArray(list)) return [...DEFAULT_APPS];
  const out: MiniAppId[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || !isMiniAppId(raw)) continue;
    if (out.includes(raw)) continue;
    out.push(raw);
    if (out.length >= MINI_MAX_APPS) break;
  }
  if (out.length < MINI_MIN_APPS) {
    for (const d of DEFAULT_APPS) {
      if (!out.includes(d)) out.push(d);
      if (out.length >= MINI_MIN_APPS) break;
    }
    // Still short? fill from catalog
    if (out.length < MINI_MIN_APPS) {
      for (const a of MINI_APP_CATALOG) {
        if (!out.includes(a.id)) out.push(a.id);
        if (out.length >= MINI_MIN_APPS) break;
      }
    }
  }
  return out;
}

/** Apps not yet pinned (for Add app picker). */
export function availableMiniApps(pinned: MiniAppId[]): typeof MINI_APP_CATALOG {
  const set = new Set(pinned);
  return MINI_APP_CATALOG.filter((a) => !set.has(a.id));
}

/** Add one app if under max and not already pinned. */
export function addMiniApp(apps: MiniAppId[], id: MiniAppId): MiniAppId[] | null {
  if (!isMiniAppId(id)) return null;
  if (apps.includes(id)) return null;
  if (apps.length >= MINI_MAX_APPS) return null;
  return [...apps, id];
}

/** Remove one app if still at least MINI_MIN_APPS remain. */
export function removeMiniApp(apps: MiniAppId[], id: MiniAppId): MiniAppId[] | null {
  if (!apps.includes(id)) return null;
  if (apps.length <= MINI_MIN_APPS) return null;
  return apps.filter((a) => a !== id);
}

export function moveMiniApp(apps: MiniAppId[], id: MiniAppId, dir: -1 | 1): MiniAppId[] {
  const i = apps.indexOf(id);
  if (i < 0) return apps;
  const j = i + dir;
  if (j < 0 || j >= apps.length) return apps;
  const next = [...apps];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
}

export function loadMiniMode(): MiniModeSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS, apps: [...DEFAULT_APPS] };
    const p = JSON.parse(raw) as Partial<MiniModeSettings>;
    return {
      enabled: !!p.enabled,
      apps: sanitizeApps(p.apps),
      density:
        p.density === 'compact' || p.density === 'spacious' || p.density === 'comfortable'
          ? p.density
          : DEFAULTS.density,
      showClock: p.showClock !== false,
      tint:
        p.tint === 'ember' || p.tint === 'slate' || p.tint === 'moss' || p.tint === 'neutral'
          ? p.tint
          : DEFAULTS.tint,
      autoOpenFirst: !!p.autoOpenFirst,
      wallpaperMode:
        p.wallpaperMode === 'none' || p.wallpaperMode === 'image' || p.wallpaperMode === 'icons'
          ? p.wallpaperMode
          : DEFAULTS.wallpaperMode,
      wallpaperPath: typeof p.wallpaperPath === 'string' ? p.wallpaperPath : '',
      wallpaperUrl: typeof p.wallpaperUrl === 'string' ? p.wallpaperUrl : '',
      wallpaperBlur: clampBlur(p.wallpaperBlur ?? DEFAULTS.wallpaperBlur),
    };
  } catch {
    return { ...DEFAULTS, apps: [...DEFAULT_APPS] };
  }
}

export function saveMiniMode(patch: Partial<MiniModeSettings>): MiniModeSettings {
  const cur = loadMiniMode();
  const next: MiniModeSettings = {
    ...cur,
    ...patch,
    apps: patch.apps !== undefined ? sanitizeApps(patch.apps) : cur.apps,
    wallpaperBlur:
      patch.wallpaperBlur !== undefined ? clampBlur(patch.wallpaperBlur) : cur.wallpaperBlur,
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail: next }));
  } catch {
    /* ignore */
  }
  return next;
}

export function setMiniModeEnabled(on: boolean): MiniModeSettings {
  const next = saveMiniMode({ enabled: on });
  // Dedicated frameless transparent widget window (main process).
  try {
    if (on) {
      void window.api?.miniOpen?.();
    } else {
      void window.api?.miniClose?.();
    }
  } catch {
    /* ignore — tests / non-Electron */
  }
  return next;
}

export function isMiniMode(): boolean {
  return loadMiniMode().enabled;
}

export function onMiniModeChanged(cb: (s: MiniModeSettings) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<MiniModeSettings>).detail;
    cb(d && typeof d === 'object' && Array.isArray((d as MiniModeSettings).apps) ? d : loadMiniMode());
  };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function miniAppMeta(id: MiniAppId): { id: MiniAppId; label: string; icon: string } {
  return MINI_APP_CATALOG.find((a) => a.id === id) ?? { id, label: id, icon: 'app' };
}

export function miniAppLabel(id: MiniAppId): string {
  return miniAppMeta(id).label;
}
