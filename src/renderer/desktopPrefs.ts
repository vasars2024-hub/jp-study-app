/**
 * Desktop shell behaviour preferences (icons, taskbar, Start, clock).
 * Geometry (icon x/y) stays in the desktop layout store; this is pure UI prefs.
 */

import { flushRootVars, setRootVars } from './rootCssVars';

export type IconSizeId = 'small' | 'medium' | 'large';
export type IconLabelId = 'always' | 'hover';
export type IconTextColorId = 'auto' | 'white' | 'black' | 'accent';
export type TaskbarSizeId = 'compact' | 'normal' | 'large';
/** 0 = free placement (no snap). */
export type SnapGridId = 0 | 12 | 16 | 24;
export type StartColumnsId = 3 | 4 | 5;

export interface DesktopPrefs {
  iconSize: IconSizeId;
  iconLabel: IconLabelId;
  iconTextColor: IconTextColorId;
  snapGrid: SnapGridId;
  iconsLocked: boolean;
  singleClickOpen: boolean;
  taskbarSize: TaskbarSizeId;
  /**
   * `'auto'` (the default) leaves the hour cycle to `Intl`, so the clock follows
   * the UI language — ru/ja/zh render 24-hour and en renders 12-hour. `true` and
   * `false` are the user's explicit choice and are honoured in every language.
   * A hard `false` default used to force 12-hour everywhere, which put an en-US
   * `10:59 PM` next to a Russian `6 сент.` in the same taskbar. Booleans stored
   * before the three-state control still load unchanged.
   */
  clock24h: boolean | 'auto';
  clockSeconds: boolean;
  clockShowDate: boolean;
  startColumns: StartColumnsId;
  /**
   * When true (default), open app windows restore from the last session.
   * When false, the desktop loads with icons/widgets/wallpaper but no open windows.
   */
  restoreSessionWindows: boolean;
  /** Companion host spans all monitors vs primary only. */
  companionHostDisplays: 'primary' | 'all';
}

const KEY = 'jp-os-desktop-prefs-v1';
const EVENT = 'jp-os-desktop-prefs-changed';

const DEFAULTS: DesktopPrefs = {
  iconSize: 'medium',
  iconLabel: 'always',
  iconTextColor: 'auto',
  snapGrid: 12,
  iconsLocked: false,
  singleClickOpen: false,
  taskbarSize: 'normal',
  clock24h: 'auto',
  clockSeconds: false,
  clockShowDate: true,
  startColumns: 4,
  restoreSessionWindows: true,
  companionHostDisplays: 'primary',
};

export const ICON_METRICS: Record<IconSizeId, { w: number; h: number; glyph: number }> = {
  small: { w: 76, h: 72, glyph: 24 },
  medium: { w: 92, h: 88, glyph: 30 },
  large: { w: 108, h: 104, glyph: 36 },
};

export const TASKBAR_HEIGHT: Record<TaskbarSizeId, number> = {
  compact: 40,
  normal: 48,
  large: 56,
};

function normalizeSnapGrid(n: unknown): SnapGridId {
  const v = typeof n === 'number' ? n : Number(n);
  if (v === 0 || v === 12 || v === 16 || v === 24) return v;
  return DEFAULTS.snapGrid;
}

/** Anything that is not an explicit boolean means "let the locale decide". */
function normalizeClock24h(v: unknown): boolean | 'auto' {
  return v === true || v === false ? v : 'auto';
}

/**
 * The `hour12` option to pass to `toLocaleTimeString`. `undefined` is not the
 * same as `false` here: an absent option lets `Intl` use the locale's own hour
 * cycle, which is the whole point of `'auto'`. Passing `false` would force
 * 24-hour on English too.
 */
export function clockHour12(pref: DesktopPrefs['clock24h']): boolean | undefined {
  return pref === 'auto' ? undefined : !pref;
}

export function loadDesktopPrefs(): DesktopPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DesktopPrefs>;
      return {
        ...DEFAULTS,
        ...parsed,
        snapGrid: normalizeSnapGrid(parsed.snapGrid ?? DEFAULTS.snapGrid),
        clock24h: normalizeClock24h(parsed.clock24h),
      };
    }
  } catch {
    /* ignore */
  }
  return { ...DEFAULTS };
}

export function applyDesktopPrefs(s: DesktopPrefs): void {
  const root = document.documentElement;
  root.dataset.iconSize = s.iconSize;
  root.dataset.iconLabel = s.iconLabel;
  root.dataset.iconText = s.iconTextColor;
  root.dataset.taskbarSize = s.taskbarSize;
  root.dataset.startCols = String(s.startColumns);
  const m = ICON_METRICS[s.iconSize];
  // Inherited from `:root`, so a changed one restyles the whole document. The
  // dataset writes above are ~0.5 ms; these are ~70 ms with ten windows open.
  setRootVars({
    '--taskbar-h': `${TASKBAR_HEIGHT[s.taskbarSize]}px`,
    '--start-cols': String(s.startColumns),
    '--desk-icon-w': `${m.w}px`,
    '--desk-icon-h': `${m.h}px`,
  });
}

export function saveDesktopPrefs(partial: Partial<DesktopPrefs>): DesktopPrefs {
  const prev = loadDesktopPrefs();
  const next: DesktopPrefs = {
    ...prev,
    ...partial,
    snapGrid: normalizeSnapGrid(
      partial.snapGrid !== undefined ? partial.snapGrid : prev.snapGrid,
    ),
    clock24h: normalizeClock24h(
      partial.clock24h !== undefined ? partial.clock24h : prev.clock24h,
    ),
  };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
  applyDesktopPrefs(next);
  window.dispatchEvent(new CustomEvent<DesktopPrefs>(EVENT, { detail: next }));
  return next;
}

export function bootDesktopPrefs(): void {
  applyDesktopPrefs(loadDesktopPrefs());
  // `--taskbar-h` and the icon metrics are layout inputs: deferring boot by a
  // frame would shift the taskbar and the icon grid in front of the user.
  flushRootVars();
}

export function onDesktopPrefsChanged(cb: (s: DesktopPrefs) => void): () => void {
  const handler = (e: Event): void => cb((e as CustomEvent<DesktopPrefs>).detail);
  window.addEventListener(EVENT, handler);
  // B7: `EVENT` is window-local. Without this, changing icon size or taskbar
  // height on one monitor left every other desktop window on the old value
  // until it reloaded.
  const onStorage = (e: StorageEvent): void => {
    if (e.key !== KEY) return;
    cb(loadDesktopPrefs());
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', onStorage);
  };
}

export function snapValue(n: number, grid: SnapGridId): number {
  const g = normalizeSnapGrid(grid);
  if (!g) return Math.round(n);
  return Math.round(n / g) * g;
}

/** Snap then keep a w×h box inside [0,boundW)×[0,boundH) with a small margin. */
export function snapClamp(
  x: number,
  y: number,
  boxW: number,
  boxH: number,
  boundW: number,
  boundH: number,
  grid: SnapGridId,
  margin = 4,
): { x: number; y: number } {
  let sx = snapValue(x, grid);
  let sy = snapValue(y, grid);
  const maxX = Math.max(margin, boundW - boxW - margin);
  const maxY = Math.max(margin, boundH - boxH - margin);
  sx = Math.min(Math.max(sx, margin), maxX);
  sy = Math.min(Math.max(sy, margin), maxY);
  // If clamp moved off-grid near edges, re-snap toward the interior once.
  if (grid) {
    if (sx === maxX) sx = snapValue(maxX, grid);
    if (sy === maxY) sy = snapValue(maxY, grid);
    sx = Math.min(Math.max(sx, margin), maxX);
    sy = Math.min(Math.max(sy, margin), maxY);
  }
  return { x: sx, y: sy };
}
