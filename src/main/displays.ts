/**
 * The single source of truth for "what displays exist right now".
 *
 * Before this module, display enumeration and hot-plug listening lived inside
 * `companionHost.ts` — correct, but reachable only by the pet host. The
 * multi-monitor desktop needs the same facts, and two independent copies of
 * `screen.getAllDisplays()` plus two independent `display-added` listeners is
 * how the two features drift apart. `companionHost.ts` now delegates here.
 *
 * Adds one thing the original did not have: **simulated displays**. Injecting
 * synthetic entries is what makes every multi-monitor path above testable on a
 * one-monitor machine, so it is not a debug afterthought — it is the only way
 * this feature gets driven end to end during development.
 */
import { ipcMain, screen, BrowserWindow } from 'electron';
import type { DisplayLike } from '../shared/displayIdentity';
import { displayKeysFor, primaryDisplayKey, resolveDisplayKey } from '../shared/displayIdentity';

export interface DisplaySummary {
  id: number;
  key: string;
  /**
   * The monitor's name as the OS reports it (e.g. "DELL U2419H"), or '' when it
   * reports none — callers show a translated "Display N" by position then. Never
   * the synthetic `display-<id>` the key fingerprint falls back to: that is an
   * opaque OS handle, and Settings showed it verbatim ("display-193337900").
   */
  label: string;
  bounds: Electron.Rectangle;
  workArea: Electron.Rectangle;
  primary: boolean;
  scaleFactor: number;
  virtual: boolean;
}

/** Synthetic displays injected by simulated-display mode. Empty in normal use. */
let virtualDisplays: DisplayLike[] = [];

/** Label fallback that keeps the key fingerprint unique; not a name to show anyone. */
function syntheticLabel(id: number): string {
  return `display-${id}`;
}

/** The label a person can read, or '' when the only label is the synthetic fallback. */
export function friendlyDisplayLabel(d: Pick<DisplayLike, 'id' | 'label' | 'virtual'>): string {
  // Simulated displays are named "Simulated <n>" in English for their key prefix;
  // the Monitors page already tags them, and "Display N" is their translated name.
  if (d.virtual === true) return '';
  const label = (d.label ?? '').trim();
  return label && label !== syntheticLabel(d.id) ? label : '';
}

type ChangeListener = () => void;
const changeListeners = new Set<ChangeListener>();
let screenHooksInstalled = false;

function toDisplayLike(d: Electron.Display, primaryId: number): DisplayLike {
  return {
    id: d.id,
    // `label` is '' on some Windows driver/adapter combinations. Falling back to
    // the id keeps the fingerprint unique per panel instead of collapsing every
    // unlabelled monitor onto one key.
    label: d.label || syntheticLabel(d.id),
    bounds: d.bounds,
    workArea: d.workArea,
    scaleFactor: d.scaleFactor,
    primary: d.id === primaryId,
  };
}

/** Real displays plus any simulated ones, in enumeration order. */
export function listDisplayLikes(): DisplayLike[] {
  const primaryId = screen.getPrimaryDisplay().id;
  const real = screen.getAllDisplays().map((d) => toDisplayLike(d, primaryId));
  return virtualDisplays.length ? [...real, ...virtualDisplays] : real;
}

/** Serializable view for IPC and the Monitors settings page. */
export function listDisplays(): DisplaySummary[] {
  const all = listDisplayLikes();
  const keys = displayKeysFor(all);
  return all.map((d, i) => ({
    id: d.id,
    key: keys[i],
    label: friendlyDisplayLabel(d),
    bounds: d.bounds,
    workArea: d.workArea,
    primary: d.primary === true,
    scaleFactor: d.scaleFactor,
    virtual: d.virtual === true,
  }));
}

/** The display a stored assignment key currently refers to, or null if absent. */
export function displayForKey(key: string): DisplayLike | null {
  return resolveDisplayKey(key, listDisplayLikes());
}

export function keyForPrimaryDisplay(): string {
  return primaryDisplayKey(listDisplayLikes());
}

/** Key of the display a given window currently sits on. */
export function keyForWindow(win: BrowserWindow): string | null {
  if (win.isDestroyed()) return null;
  const b = win.getBounds();
  const centre = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  const all = listDisplayLikes();
  const keys = displayKeysFor(all);
  // Simulated displays are sub-rectangles of a real one, so a plain
  // nearest-point query would always answer with the real display underneath.
  // Prefer a virtual display that actually contains the point.
  const virtualHit = all.findIndex(
    (d) =>
      d.virtual === true &&
      centre.x >= d.bounds.x &&
      centre.x < d.bounds.x + d.bounds.width &&
      centre.y >= d.bounds.y &&
      centre.y < d.bounds.y + d.bounds.height,
  );
  if (virtualHit >= 0) return keys[virtualHit];

  const nearest = screen.getDisplayNearestPoint(centre);
  const realHit = all.findIndex((d) => d.virtual !== true && d.id === nearest.id);
  return realHit >= 0 ? keys[realHit] : null;
}

/**
 * Key of the **real** display a window sits on, ignoring simulated overlays.
 *
 * Simulated displays are sub-rectangles carved out of the primary monitor's own
 * work area, so the main window's centre routinely falls inside one the moment
 * simulation is switched on — at 1920x1080 the strip starts at x=960 and a
 * centred main window has its centre at exactly x=960. Resolving the main
 * window through the virtual-preferring path above therefore makes it "move"
 * onto a display it does not own, which flips `syncDesktopWindows`' main-display
 * guard onto the wrong entry: the simulated display gets skipped as if it were
 * main's, and the real display gets a full-screen second shell stacked on top of
 * the main window. Observed live, 2026-08-07.
 *
 * The main window always belongs to a physical display. Use this for it.
 */
export function realKeyForWindow(win: BrowserWindow): string | null {
  if (win.isDestroyed()) return null;
  const b = win.getBounds();
  const centre = { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) };
  const all = listDisplayLikes();
  const keys = displayKeysFor(all);
  const nearest = screen.getDisplayNearestPoint(centre);
  const realHit = all.findIndex((d) => d.virtual !== true && d.id === nearest.id);
  return realHit >= 0 ? keys[realHit] : null;
}

/** Key of the display under a virtual-screen point, virtual displays winning. */
export function keyForPoint(x: number, y: number): string | null {
  const all = listDisplayLikes();
  const keys = displayKeysFor(all);
  const virtualHit = all.findIndex(
    (d) =>
      d.virtual === true &&
      x >= d.bounds.x &&
      x < d.bounds.x + d.bounds.width &&
      y >= d.bounds.y &&
      y < d.bounds.y + d.bounds.height,
  );
  if (virtualHit >= 0) return keys[virtualHit];

  const nearest = screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) });
  const realHit = all.findIndex((d) => d.virtual !== true && d.id === nearest.id);
  return realHit >= 0 ? keys[realHit] : null;
}

/**
 * Union of every display's work area (DIP). Lifted verbatim from
 * `companionHost.ts` so the pet host and the desktop agree on the span.
 */
export function unionDisplayBounds(useWorkArea: boolean): Electron.Rectangle {
  const displays = screen.getAllDisplays();
  if (!displays.length) return { x: 0, y: 0, width: 1280, height: 800 };
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const d of displays) {
    const b = useWorkArea ? d.workArea : d.bounds;
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.width);
    maxY = Math.max(maxY, b.y + b.height);
  }
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

// ---------------------------------------------------------------------------
// Simulated displays
// ---------------------------------------------------------------------------

export const MAX_VIRTUAL_DISPLAYS = 3;

/**
 * Tile `count` synthetic displays into the right half of the primary work area.
 *
 * They deliberately overlap the main window rather than displacing it: the
 * point is to see a *second* desktop render its own wallpaper, icons and
 * taskbar next to the first, without resizing the window the user is working
 * in. Passing 0 turns simulation off.
 */
export function setVirtualDisplayCount(count: number): DisplaySummary[] {
  const n = Math.max(0, Math.min(MAX_VIRTUAL_DISPLAYS, Math.floor(count) || 0));
  if (n === 0) {
    virtualDisplays = [];
    notifyChanged();
    return listDisplays();
  }

  const { workArea, scaleFactor } = screen.getPrimaryDisplay();
  const stripW = Math.max(320, Math.floor(workArea.width / 2));
  const originX = workArea.x + workArea.width - stripW;
  const stripH = Math.max(240, Math.floor(workArea.height / n));

  virtualDisplays = Array.from({ length: n }, (_, i) => {
    const bounds = {
      x: originX,
      y: workArea.y + i * stripH,
      width: stripW,
      height: stripH,
    };
    return {
      // Negative ids cannot collide with a real Electron display id.
      id: -(i + 1),
      label: `Simulated ${i + 1}`,
      bounds,
      workArea: { ...bounds },
      scaleFactor,
      primary: false,
      virtual: true,
    } satisfies DisplayLike;
  });

  notifyChanged();
  return listDisplays();
}

export function virtualDisplayCount(): number {
  return virtualDisplays.length;
}

// ---------------------------------------------------------------------------
// Hot-plug
// ---------------------------------------------------------------------------

function notifyChanged(): void {
  const payload = listDisplays();
  for (const listener of changeListeners) {
    try {
      listener();
    } catch {
      /* one bad subscriber must not stop the rest */
    }
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('display:changed', payload);
  }
}

/** Subscribe to display topology changes. Returns an unsubscribe function. */
export function onDisplaysChanged(listener: ChangeListener): () => void {
  changeListeners.add(listener);
  return () => {
    changeListeners.delete(listener);
  };
}

function installScreenHooks(): void {
  if (screenHooksInstalled) return;
  screenHooksInstalled = true;
  const onChange = (): void => {
    // A real topology change invalidates simulated geometry derived from the
    // primary work area — re-tile rather than leave strips off-screen.
    if (virtualDisplays.length) setVirtualDisplayCount(virtualDisplays.length);
    else notifyChanged();
  };
  screen.on('display-added', onChange);
  screen.on('display-removed', onChange);
  screen.on('display-metrics-changed', onChange);
}

export function registerDisplayIpc(): void {
  installScreenHooks();

  ipcMain.handle('display:list', (): DisplaySummary[] => listDisplays());

  ipcMain.handle('display:setVirtualCount', (_e, count: unknown): DisplaySummary[] =>
    setVirtualDisplayCount(typeof count === 'number' ? count : 0),
  );

  ipcMain.handle('display:getVirtualCount', (): number => virtualDisplayCount());
}
