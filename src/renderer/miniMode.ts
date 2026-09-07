/**
 * Mini View — reduced launcher with 6–9 pinned apps that open as OS pop-out windows.
 * Full desktop / living layer stay dormant while mini is active.
 */

import type { DesktopWinSection } from '../shared/desktop';
import { DESKTOP_STUDY } from '../shared/desktop';
import { getDesktopLayout, onDesktopChanged } from './desktopState';
import { WALL_PRESETS } from './environment/wallCatalog';

/** Apps that can be pinned in Mini (must be pop-out capable). */
export type MiniAppId =
  | 'library'
  | 'novels'
  | 'dictionary'
  | 'grammar'
  | 'translate'
  | 'player'
  | 'music'
  | 'musicwidget'
  | 'clipboard'
  | 'anki'
  | 'flashcards'
  | 'stats'
  | 'resources'
  | 'immersion'
  | 'calendar'
  | 'settings';

export type MiniDensity = 'compact' | 'comfortable' | 'spacious';

/**
 * Density -> i18n key, on the same rule as `MINI_TINT_KEY` below and for the
 * same reason: Settings > Mini View held a private copy while the Mini View
 * window's own drawer drew bare `S` / `M` / `L` letters with no accessible name
 * at all. Two of the three names are shared with Appearance.
 */
export const MINI_DENSITY_KEY: Record<MiniDensity, string> = {
  compact: 'settings.appearance.density.compact',
  comfortable: 'settings.mini.density.comfortable',
  spacious: 'settings.appearance.density.spacious',
};

export const MINI_THEME_TINTS = [
  'neutral',
  'ember',
  'slate',
  'moss',
  'ocean',
  'violet',
  'sand',
  'crimson',
  'frost',
] as const;
export type MiniThemeTint = (typeof MINI_THEME_TINTS)[number];

/**
 * Tint -> i18n key. A module-level record cannot call useT(), so per CLAUDE.md
 * "i18n workflow" §7 this holds the key and each consumer resolves it with t()
 * at render time.
 *
 * It lives here, beside the tint list, because BOTH surfaces that draw these
 * chips need it: Settings > Mini View had a private copy while the Mini View
 * window's own drawer had none and fell back to the first letter of the raw id.
 * Four of the nine names are shared with the lock screen and keep their
 * `settings.lock.tint.*` keys — the same English word, translated once.
 *
 * `Record`, not `Partial<Record>`: a tenth tint added to the list above with no
 * key here is now a type error rather than a chip that silently prints its own
 * internal id.
 */
export const MINI_TINT_KEY: Record<MiniThemeTint, string> = {
  neutral: 'settings.lock.tint.neutral',
  ember: 'settings.lock.tint.ember',
  slate: 'settings.lock.tint.slate',
  moss: 'settings.lock.tint.moss',
  ocean: 'settings.mini.tint.ocean',
  violet: 'settings.mini.tint.violet',
  sand: 'settings.mini.tint.sand',
  crimson: 'settings.mini.tint.crimson',
  frost: 'settings.mini.tint.frost',
};

/** Backdrop behind the craft frame. */
export type MiniWallpaperMode = 'none' | 'image' | 'icons' | 'desktop';

export type MiniInlineWidget = 'clipboard';

export type MiniLaunchTarget =
  | { kind: 'popout'; section: DesktopWinSection }
  | { kind: 'inline'; widget: MiniInlineWidget };

export type MiniDesktopWall =
  | { kind: 'none' }
  | { kind: 'image'; url: string }
  | { kind: 'preset'; css: string };

export interface MiniModeSettings {
  /** When true, App mounts MiniShell instead of DesktopShell. */
  enabled: boolean;
  /** Ordered app ids (6–9). */
  apps: MiniAppId[];
  /** Ordered buddy-routine ids clickable straight from the widget (0–3). */
  routines: string[];
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
  /** Black & white high-contrast look — modern Study mini only (ignored in Aero). */
  monoMode: boolean;
}

const KEY = 'jp-study-mini-mode-v1';
const EVENT = 'jp-mini-mode-changed';

export const MINI_APP_CATALOG: { id: MiniAppId; label: string; icon: string }[] = [
  { id: 'library', label: 'Library', icon: 'library' },
  { id: 'dictionary', label: 'Dictionary', icon: 'dictionary' },
  { id: 'flashcards', label: 'Flashcards', icon: 'flashcards' },
  { id: 'anki', label: 'Anki', icon: 'anki' },
  { id: 'music', label: 'Music', icon: 'music' },
  { id: 'musicwidget', label: 'Music Widget', icon: 'music' },
  { id: 'clipboard', label: 'Clipboard', icon: 'clipboard' },
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
/** v1.0 audit 3.5 — clickable buddy routines pinned to the widget. */
export const MINI_MAX_ROUTINES = 3;

const DEFAULTS: MiniModeSettings = {
  enabled: false,
  apps: DEFAULT_APPS,
  routines: [],
  density: 'comfortable',
  showClock: true,
  tint: 'neutral',
  autoOpenFirst: false,
  wallpaperMode: 'icons',
  wallpaperPath: '',
  wallpaperUrl: '',
  wallpaperBlur: 12,
  monoMode: false,
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

/**
 * Structural only — an id is deliberately not checked against the routine
 * catalog here. Routines live in `env.buddyRoutines`, are user-editable, and can
 * be renamed or deleted after being pinned; an id that no longer resolves is
 * dropped at render time instead of being silently rewritten out of the setting.
 */
function sanitizeRoutines(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  const out: string[] = [];
  for (const raw of list) {
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const id = raw.trim();
    if (out.includes(id)) continue;
    out.push(id);
    if (out.length >= MINI_MAX_ROUTINES) break;
  }
  return out;
}

/** Pin one routine if under max and not already pinned. */
export function addMiniRoutine(routines: string[], id: string): string[] | null {
  if (!id.trim()) return null;
  if (routines.includes(id)) return null;
  if (routines.length >= MINI_MAX_ROUTINES) return null;
  return [...routines, id];
}

/** Unpin one routine. Unlike apps there is no minimum — zero is a valid state. */
export function removeMiniRoutine(routines: string[], id: string): string[] {
  return routines.filter((r) => r !== id);
}

export function moveMiniRoutine(routines: string[], id: string, dir: -1 | 1): string[] {
  const i = routines.indexOf(id);
  if (i < 0) return routines;
  const j = i + dir;
  if (j < 0 || j >= routines.length) return routines;
  const next = [...routines];
  const tmp = next[i]!;
  next[i] = next[j]!;
  next[j] = tmp;
  return next;
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
    if (!raw) return { ...DEFAULTS, apps: [...DEFAULT_APPS], routines: [] };
    const p = JSON.parse(raw) as Partial<MiniModeSettings>;
    return {
      enabled: !!p.enabled,
      apps: sanitizeApps(p.apps),
      routines: sanitizeRoutines(p.routines),
      density:
        p.density === 'compact' || p.density === 'spacious' || p.density === 'comfortable'
          ? p.density
          : DEFAULTS.density,
      showClock: p.showClock !== false,
      tint: MINI_THEME_TINTS.includes(p.tint as MiniThemeTint)
        ? (p.tint as MiniThemeTint)
        : DEFAULTS.tint,
      autoOpenFirst: !!p.autoOpenFirst,
      wallpaperMode:
        p.wallpaperMode === 'none' ||
        p.wallpaperMode === 'image' ||
        p.wallpaperMode === 'icons' ||
        p.wallpaperMode === 'desktop'
          ? p.wallpaperMode
          : DEFAULTS.wallpaperMode,
      wallpaperPath: typeof p.wallpaperPath === 'string' ? p.wallpaperPath : '',
      wallpaperUrl: typeof p.wallpaperUrl === 'string' ? p.wallpaperUrl : '',
      wallpaperBlur: clampBlur(p.wallpaperBlur ?? DEFAULTS.wallpaperBlur),
      monoMode: !!p.monoMode,
    };
  } catch {
    return { ...DEFAULTS, apps: [...DEFAULT_APPS], routines: [] };
  }
}

export function saveMiniMode(patch: Partial<MiniModeSettings>): MiniModeSettings {
  const cur = loadMiniMode();
  const next: MiniModeSettings = {
    ...cur,
    ...patch,
    apps: patch.apps !== undefined ? sanitizeApps(patch.apps) : cur.apps,
    routines: patch.routines !== undefined ? sanitizeRoutines(patch.routines) : cur.routines,
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
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) h(new CustomEvent(EVENT, { detail: loadMiniMode() }));
  };
  window.addEventListener(EVENT, h);
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, h);
    window.removeEventListener('storage', onStorage);
  };
}

export function miniAppMeta(id: MiniAppId): { id: MiniAppId; label: string; icon: string } {
  return MINI_APP_CATALOG.find((a) => a.id === id) ?? { id, label: id, icon: 'app' };
}

export function miniAppLabel(id: MiniAppId): string {
  return miniAppMeta(id).label;
}

/** How a pinned mini slot opens when clicked. */
export function miniAppLaunch(id: MiniAppId): MiniLaunchTarget {
  switch (id) {
    case 'music':
    case 'musicwidget':
      return { kind: 'popout', section: 'musicwidget' };
    case 'clipboard':
      return { kind: 'inline', widget: 'clipboard' };
    default:
      return { kind: 'popout', section: id as DesktopWinSection };
  }
}

/** Pop-out section used for slot highlight (music → musicwidget). */
export function miniPopoutSection(id: MiniAppId): DesktopWinSection | null {
  const target = miniAppLaunch(id);
  return target.kind === 'popout' ? target.section : null;
}

export function isMiniSlotActive(id: MiniAppId, popped: Set<string>, inline: MiniInlineWidget | null): boolean {
  const target = miniAppLaunch(id);
  if (target.kind === 'inline') return inline === target.widget;
  return popped.has(target.section);
}

/** Match the Study desktop wallpaper for mini backdrop. */
export async function resolveMiniDesktopWallpaper(): Promise<MiniDesktopWall> {
  const wall = getDesktopLayout(DESKTOP_STUDY).wallpaper;
  try {
    if (wall.kind === 'image' && wall.path) {
      const url =
        (await window.api.imageFileUrl(wall.path)) ??
        (await window.api.setWallpaperFromPath(wall.path));
      if (url) return { kind: 'image', url };
    }
    if (wall.kind === 'slideshow' && wall.folder) {
      const paths = await window.api.listWallpaperFolder(wall.folder);
      const first = paths[0];
      if (first) {
        const url = await window.api.imageFileUrl(first);
        if (url) return { kind: 'image', url };
      }
    }
    if (wall.kind === 'preset' && wall.id) {
      const preset = WALL_PRESETS.find((p) => p.id === wall.id);
      if (preset) return { kind: 'preset', css: preset.css };
    }
    const fallback = await window.api.getWallpaper();
    if (fallback) return { kind: 'image', url: fallback };
  } catch {
    /* ignore */
  }
  return { kind: 'none' };
}

export function onMiniDesktopWallpaperChanged(cb: () => void): () => void {
  return onDesktopChanged(() => cb());
}
