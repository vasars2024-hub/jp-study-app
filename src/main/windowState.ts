/**
 * Remembered window placement: size, position, maximized state and the display
 * the window was on, so Gum reopens where it was left like any Windows app.
 *
 * Restoring is defensive. The saved display may be gone (a laptop undocked), its
 * resolution or scale may have changed, or the rectangle may now hang off every
 * screen. `restoreRect` answers all of those with a rectangle that is fully on a
 * live display's work area, and the caller still runs `guardWindowToWorkArea`
 * afterwards for the DPI cases Electron gets wrong at creation time.
 */
import { screen, type BrowserWindow } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { fitRectToWorkArea, type Rect, type Size } from './windowBounds';

export interface SavedWindowState {
  /** Normal (un-maximized) bounds in DIP. */
  bounds: Rect;
  maximized: boolean;
  /** `Display.id` of the monitor the window was on. */
  displayId?: number;
  /** That display's bounds when saved — a changed layout means the id may now be a different screen. */
  displayBounds?: Rect;
  scaleFactor?: number;
}

export interface DisplayLike {
  id: number;
  bounds: Rect;
  workArea: Rect;
  scaleFactor?: number;
}

function isRect(value: unknown): value is Rect {
  if (!value || typeof value !== 'object') return false;
  const r = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((k) => typeof r[k] === 'number' && Number.isFinite(r[k] as number))
    && (r.width as number) > 0 && (r.height as number) > 0;
}

/** Parse a stored state; anything malformed is null (the default placement is always safe). */
export function parseSavedWindowState(raw: unknown): SavedWindowState | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  // Legacy Blanc file: `{ width, height }` only.
  if (!isRect(r.bounds)) {
    if (typeof r.width === 'number' && typeof r.height === 'number' && r.width > 0 && r.height > 0) {
      return { bounds: { x: NaN, y: NaN, width: r.width, height: r.height }, maximized: false };
    }
    return null;
  }
  return {
    bounds: r.bounds,
    maximized: r.maximized === true,
    ...(typeof r.displayId === 'number' ? { displayId: r.displayId } : {}),
    ...(isRect(r.displayBounds) ? { displayBounds: r.displayBounds } : {}),
    ...(typeof r.scaleFactor === 'number' ? { scaleFactor: r.scaleFactor } : {}),
  };
}

function overlapArea(a: Rect, b: Rect): number {
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  return w > 0 && h > 0 ? w * h : 0;
}

function sameRectish(a: Rect | undefined, b: Rect): boolean {
  return !!a && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

function centerIn(size: Size, workArea: Rect): Rect {
  const width = Math.min(size.width, workArea.width);
  const height = Math.min(size.height, workArea.height);
  return {
    x: Math.round(workArea.x + (workArea.width - width) / 2),
    y: Math.round(workArea.y + (workArea.height - height) / 2),
    width,
    height,
  };
}

/**
 * Where to open a window with `saved` placement on the current `displays`.
 *
 * - Same display, same layout: the saved rectangle, capped to the work area.
 * - Display moved/resized/re-scaled, or gone: the display the rectangle overlaps
 *   most; when it overlaps none, centred on the primary display at the saved size.
 * - A rectangle only barely on screen (title bar unreachable) is pulled inside.
 */
export function restoreRect(
  saved: SavedWindowState,
  displays: readonly DisplayLike[],
  primary: DisplayLike,
  minSize: Size = { width: 1, height: 1 },
): Rect {
  const size = {
    width: Math.max(minSize.width, Math.round(saved.bounds.width)),
    height: Math.max(minSize.height, Math.round(saved.bounds.height)),
  };
  if (!Number.isFinite(saved.bounds.x) || !Number.isFinite(saved.bounds.y)) {
    return centerIn(size, primary.workArea);
  }
  const rect: Rect = { ...saved.bounds, ...size };
  const byId = displays.find((d) => d.id === saved.displayId);
  const layoutUnchanged = byId
    && sameRectish(saved.displayBounds, byId.bounds)
    && (saved.scaleFactor === undefined || byId.scaleFactor === undefined || saved.scaleFactor === byId.scaleFactor);
  let target: DisplayLike | undefined = layoutUnchanged ? byId : undefined;
  if (!target) {
    let best = 0;
    for (const d of displays) {
      const area = overlapArea(rect, d.workArea);
      if (area > best) {
        best = area;
        target = d;
      }
    }
  }
  if (!target) return centerIn(size, primary.workArea);
  const fitted = fitRectToWorkArea(rect, target.workArea);
  // Keep at least the top strip (title bar) reachable: fully inside the work area.
  const wa = target.workArea;
  return {
    width: fitted.width,
    height: fitted.height,
    x: Math.min(Math.max(fitted.x, wa.x), wa.x + wa.width - fitted.width),
    y: Math.min(Math.max(fitted.y, wa.y), wa.y + wa.height - fitted.height),
  };
}

export function readWindowState(file: string): SavedWindowState | null {
  try {
    return parseSavedWindowState(readJsonSync<unknown>(file, null));
  } catch {
    return null;
  }
}

function liveDisplays(): { displays: DisplayLike[]; primary: DisplayLike } | null {
  try {
    const displays = screen.getAllDisplays().map((d) => ({ id: d.id, bounds: d.bounds, workArea: d.workArea, scaleFactor: d.scaleFactor }));
    const p = screen.getPrimaryDisplay();
    return { displays, primary: { id: p.id, bounds: p.bounds, workArea: p.workArea, scaleFactor: p.scaleFactor } };
  } catch {
    return null;
  }
}

/** The saved placement resolved against the monitors connected right now, or null. */
export function resolveSavedPlacement(file: string, minSize?: Size): { bounds: Rect; maximized: boolean } | null {
  const saved = readWindowState(file);
  if (!saved) return null;
  const live = liveDisplays();
  if (!live) return null;
  return { bounds: restoreRect(saved, live.displays, live.primary, minSize), maximized: saved.maximized };
}

/** Snapshot a window's placement (normal bounds even while maximized). */
export function captureWindowState(win: Pick<BrowserWindow, 'getNormalBounds' | 'getBounds' | 'isMaximized' | 'isMinimized' | 'isFullScreen'>): SavedWindowState {
  const bounds = typeof win.getNormalBounds === 'function' ? win.getNormalBounds() : win.getBounds();
  let display: Electron.Display | null = null;
  try {
    display = screen.getDisplayMatching(bounds);
  } catch {
    display = null;
  }
  return {
    bounds,
    maximized: win.isMaximized() || win.isFullScreen(),
    ...(display ? { displayId: display.id, displayBounds: display.bounds, scaleFactor: display.scaleFactor } : {}),
  };
}

export function saveWindowState(file: string, win: BrowserWindow): void {
  try {
    if (win.isDestroyed()) return;
    // getNormalBounds() is valid while minimized too, so a window closed from the
    // taskbar while minimized still saves where it will reappear.
    const state = captureWindowState(win);
    if (state.bounds.width <= 0 || state.bounds.height <= 0) return;
    writeJsonAtomicSync(file, state, { space: 0, backup: false });
  } catch {
    /* best effort: the default placement is always safe */
  }
}

/**
 * Save `win`'s placement on close, and (debounced) after it is moved, resized,
 * maximized or restored — a crash or forced shutdown keeps the latest placement.
 */
export function trackWindowState(win: BrowserWindow, file: string): void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!win.isDestroyed() && !win.isMinimized()) saveWindowState(file, win);
    }, 800);
  };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize'] as const) {
    win.on(event as 'resize', schedule);
  }
  win.on('close', () => {
    if (timer) clearTimeout(timer);
    timer = null;
    saveWindowState(file, win);
  });
}
