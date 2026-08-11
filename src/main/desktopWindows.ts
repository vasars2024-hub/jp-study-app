/**
 * One borderless Study OS window per configured display.
 *
 * The main window keeps its identity and its lifecycle role — closing it still
 * tears down mini/lock/companion, and `toggleAppVisibility` still hides
 * everything. Secondary desktops are a separate registry layered on top, torn
 * down with the main window rather than owning anything of it (B5).
 *
 * Every secondary carries `?desk=<index>&displayKey=<key>` on its URL. That
 * matters beyond routing: `debugBridge.mainDesktopWindow()` identifies the
 * Study OS window by its *bare* query string, so a second bare desktop window
 * would break `jp-bridge`. Secondaries are never bare (B6).
 */
import { BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import type { DesktopIndex, DisplayAssignment } from '../shared/desktop';
import { desktopStore } from './desktop';
import {
  displayForKey,
  listDisplays,
  onDisplaysChanged,
  realKeyForWindow,
  type DisplaySummary,
} from './displays';

type RendererUrlFn = (query?: string) => string;
type NavGuardFn = (win: BrowserWindow) => void;
type ForwardConsoleFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let attachNavGuards: NavGuardFn = () => undefined;
let forwardConsole: ForwardConsoleFn | null = null;
let isDev = false;
let getMainWindow: () => BrowserWindow | null = () => null;

/** displayKey -> the desktop window on that display. Never holds the main window. */
const desktopWindows = new Map<string, BrowserWindow>();
/** Display keys whose window the user has moved or resized by hand. */
const userPlaced = new Set<string>();
let unsubscribeDisplays: (() => void) | null = null;

export function configureDesktopWindows(opts: {
  rendererUrl: RendererUrlFn;
  attachNavGuards: NavGuardFn;
  forwardConsole?: ForwardConsoleFn;
  isDevServer: boolean;
  mainWindow: () => BrowserWindow | null;
}): void {
  getRendererUrl = opts.rendererUrl;
  attachNavGuards = opts.attachNavGuards;
  forwardConsole = opts.forwardConsole ?? null;
  isDev = opts.isDevServer;
  getMainWindow = opts.mainWindow;
}

/**
 * Display the main window sits on. Everything else is a candidate secondary.
 *
 * Resolved against real displays only: a simulated display is a strip inside the
 * primary monitor, so the virtual-preferring lookup would report the main window
 * as living on the simulation and skip the wrong display below.
 */
function mainDisplayKey(): string | null {
  const main = getMainWindow();
  if (!main || main.isDestroyed()) return null;
  return realKeyForWindow(main);
}

/**
 * Display key of a window we already own, without a geometry query.
 *
 * The registry is authoritative — a secondary was created *for* a display, and
 * that fact survives the window being moved, a simulated strip being re-tiled,
 * or two displays overlapping. Geometry is the fallback, and only for the main
 * window, which is the one window not in the registry.
 */
function displayKeyOfWindow(win: BrowserWindow): string | null {
  for (const [key, candidate] of desktopWindows) {
    if (candidate === win) return key;
  }
  return realKeyForWindow(win);
}

/**
 * Identity of a desktop renderer, including a taskbar tear-off.
 *
 * A spawned desktop is intentionally absent from the display-assignment
 * registry, so deriving both fields from its geometric display reports the
 * main desktop index instead of the index pinned in its URL. Keep the two
 * questions separate: geometry still tells the renderer which physical
 * display it occupies, while the spawned registry owns its desktop index.
 */
export function desktopIdentityForWindow(win: BrowserWindow): {
  displayKey: string | null;
  desktopIndex: DesktopIndex | null;
} {
  const displayKey = displayKeyOfWindow(win);
  for (const [desktopIndex, candidate] of spawnedWindows) {
    if (candidate === win && !candidate.isDestroyed()) {
      return { displayKey, desktopIndex };
    }
  }
  return {
    displayKey,
    desktopIndex: displayKey ? desktopIndexForDisplayKey(displayKey) : null,
  };
}

function createDesktopWindow(assignment: DisplayAssignment, display: DisplaySummary): BrowserWindow {
  const { workArea } = display;
  const win = new BrowserWindow({
    x: workArea.x,
    y: workArea.y,
    width: workArea.width,
    height: workArea.height,
    // A desktop window is an ordinary window: framed, resizable, movable,
    // maximizable. It was borderless and pinned to the display's work area,
    // which made it impossible to resize or move — the user could not treat it
    // like any other window on their desk.
    frame: true,
    resizable: true,
    movable: true,
    maximizable: true,
    fullscreenable: true,
    minWidth: 480,
    minHeight: 360,
    title: `Study OS — ${display.label}`,
    show: false,
    backgroundColor: '#14131a',
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });

  // Pop-outs duplicate the nav guards inline and have drifted from the main
  // window's copy as a result. Reuse the one implementation.
  attachNavGuards(win);

  desktopWindows.set(assignment.displayKey, win);

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show();
    // Simulated displays are strips carved out of the primary monitor, so a new
    // desktop window would otherwise open *behind* the main window and read as
    // "nothing happened". Raise it once, rather than pinning it alwaysOnTop —
    // pinning is what stopped it behaving like an ordinary window.
    win.focus();
  });

  // Once the user moves or resizes it, its geometry is theirs. The reconciler
  // must stop re-imposing the display's work area on every sync, or the window
  // snaps back the moment anything else changes.
  const markUserPlaced = (): void => {
    userPlaced.add(assignment.displayKey);
  };
  win.on('moved', markUserPlaced);
  win.on('resized', markUserPlaced);

  win.on('closed', () => {
    if (desktopWindows.get(assignment.displayKey) === win) {
      desktopWindows.delete(assignment.displayKey);
    }
    // A fresh window for this display should open on the display again, not
    // inherit the geometry the previous one happened to be dragged to.
    userPlaced.delete(assignment.displayKey);
    broadcastDeskWindows();
  });

  if (isDev && forwardConsole) forwardConsole(win);

  const query = `desk=${assignment.desktopIndex}&displayKey=${encodeURIComponent(assignment.displayKey)}`;
  void win.loadURL(getRendererUrl(query));
  return win;
}

/**
 * Desktops torn off the taskbar, keyed by desktop index rather than display.
 *
 * Deliberately a separate registry from `desktopWindows`. These windows are not
 * derived from the display topology, so `syncDesktopWindows` — which destroys
 * anything not backed by an enabled display — must not see them, or a torn-off
 * desktop would vanish the next time a monitor changed.
 */
const spawnedWindows = new Map<DesktopIndex, BrowserWindow>();

/** Open (or raise) a standalone window showing one desktop. */
export function openSpawnedDesktop(index: DesktopIndex): boolean {
  const existing = spawnedWindows.get(index);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return true;
  }

  // Cascade off the main window so successive tear-offs do not stack exactly.
  const main = getMainWindow();
  const base = main && !main.isDestroyed() ? main.getBounds() : { x: 120, y: 90, width: 1280, height: 860 };
  const step = 36 * (spawnedWindows.size + 1);

  const win = new BrowserWindow({
    x: base.x + step,
    y: base.y + step,
    width: Math.max(640, Math.round(base.width * 0.7)),
    height: Math.max(480, Math.round(base.height * 0.7)),
    frame: true,
    resizable: true,
    movable: true,
    maximizable: true,
    fullscreenable: true,
    minWidth: 480,
    minHeight: 360,
    title: 'Study OS',
    show: false,
    backgroundColor: '#14131a',
    autoHideMenuBar: true,
    skipTaskbar: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });

  attachNavGuards(win);
  spawnedWindows.set(index, win);

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });

  win.on('closed', () => {
    if (spawnedWindows.get(index) === win) spawnedWindows.delete(index);
    // Hand the index back so a later tear-off can reuse it.
    desktopStore().releaseDesktop(index);
    broadcastDeskWindows();
  });

  if (isDev && forwardConsole) forwardConsole(win);

  // `spawned=1` marks this shell as owning a desktop with no display behind it.
  void win.loadURL(getRendererUrl(`desk=${index}&spawned=1`));
  return true;
}

export function closeSpawnedDesktops(): void {
  for (const [, win] of spawnedWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  spawnedWindows.clear();
}

/** Move an existing window onto its display's current work area. */
function placeDesktopWindow(win: BrowserWindow, display: DisplaySummary, key: string): void {
  if (win.isDestroyed()) return;
  // The user's own geometry wins. Re-imposing the work area here is what made
  // the window un-resizable in practice: any sync snapped it back.
  if (userPlaced.has(key)) return;
  const { workArea } = display;
  const bounds = win.getBounds();
  if (
    bounds.x === workArea.x &&
    bounds.y === workArea.y &&
    bounds.width === workArea.width &&
    bounds.height === workArea.height
  ) {
    return;
  }
  win.setBounds(workArea);
}

/**
 * Reconcile windows against (assignments x present displays).
 *
 * Called on every display change and on every assignment change, and it is
 * idempotent — creating, destroying and repositioning are all derived from the
 * current state rather than from what changed.
 */
export function syncDesktopWindows(): void {
  const store = desktopStore();
  const displays = listDisplays();
  const mainKey = mainDisplayKey();
  store.setMainDisplayKey(mainKey);

  // New displays get a default assignment (disabled unless primary).
  const snapshot = store.syncAssignments(
    displays.map((d) => ({ key: d.key, primary: d.primary, virtual: d.virtual })),
  );
  const assignments = snapshot.assignments ?? [];

  const wanted = new Map<string, { assignment: DisplayAssignment; display: DisplaySummary }>();
  for (const assignment of assignments) {
    if (!assignment.enabled) continue;
    // The main window already hosts its own display; a second window there
    // would stack two shells on one monitor.
    if (mainKey && assignment.displayKey === mainKey) continue;
    const display = displays.find((d) => d.key === assignment.displayKey);
    if (!display) continue; // display unplugged — assignment is kept, window is not
    wanted.set(assignment.displayKey, { assignment, display });
  }

  // Close windows that should no longer exist. The desktop's contents stay in
  // the store, so nothing is lost when a monitor is unplugged.
  for (const [key, win] of [...desktopWindows]) {
    if (wanted.has(key)) continue;
    desktopWindows.delete(key);
    if (!win.isDestroyed()) win.destroy();
  }

  for (const [key, { assignment, display }] of wanted) {
    const existing = desktopWindows.get(key);
    if (existing && !existing.isDestroyed()) {
      placeDesktopWindow(existing, display, key);
      // The desktop this display hosts can change without the window closing.
      existing.webContents.send('deskwin:retarget', {
        desktopIndex: assignment.desktopIndex,
        displayKey: key,
      });
      continue;
    }
    createDesktopWindow(assignment, display);
  }

  broadcastDeskWindows();
}

export interface DeskWindowInfo {
  displayKey: string;
  desktopIndex: DesktopIndex;
  open: boolean;
}

export function listDeskWindows(): DeskWindowInfo[] {
  const assignments = desktopStore().snapshot().assignments ?? [];
  return assignments.map((a) => ({
    displayKey: a.displayKey,
    desktopIndex: a.desktopIndex,
    open: Boolean(desktopWindows.get(a.displayKey)?.isDestroyed() === false),
  }));
}

function broadcastDeskWindows(): void {
  const payload = listDeskWindows();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('deskwin:changed', payload);
  }
}

/** The desktop window showing a given desktop index, main window included. */
export function windowForDesktop(index: DesktopIndex): BrowserWindow | null {
  const spawned = spawnedWindows.get(index);
  if (spawned && !spawned.isDestroyed()) return spawned;
  const assignments = desktopStore().snapshot().assignments ?? [];
  for (const [key, win] of desktopWindows) {
    if (win.isDestroyed()) continue;
    const assignment = assignments.find((a) => a.displayKey === key);
    if (assignment?.desktopIndex === index) return win;
  }
  const main = getMainWindow();
  if (main && !main.isDestroyed() && desktopStore().snapshot().activeDesktopIndex === index) {
    return main;
  }
  return null;
}

/** The desktop window on a given display, main window included. */
export function windowForDisplayKey(key: string): BrowserWindow | null {
  const win = desktopWindows.get(key);
  if (win && !win.isDestroyed()) return win;
  const main = getMainWindow();
  if (main && !main.isDestroyed() && mainDisplayKey() === key) return main;
  return null;
}

/** Desktop index a display currently shows. */
export function desktopIndexForDisplayKey(key: string): DesktopIndex | null {
  const snapshot = desktopStore().snapshot();
  if (mainDisplayKey() === key) return snapshot.activeDesktopIndex;
  const assignment = (snapshot.assignments ?? []).find((a) => a.displayKey === key);
  return assignment?.desktopIndex ?? null;
}

export function closeAllDesktopWindows(): void {
  for (const [, win] of desktopWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
  desktopWindows.clear();
  userPlaced.clear();
  closeSpawnedDesktops();
  unsubscribeDisplays?.();
  unsubscribeDisplays = null;
}

export function registerDesktopWindowsIpc(): void {
  unsubscribeDisplays ??= onDisplaysChanged(() => syncDesktopWindows());

  ipcMain.handle(
    'deskwin:assign',
    (_e, payload: { displayKey: string; desktopIndex: number }) => {
      if (!payload || typeof payload.displayKey !== 'string') return { ok: false };
      desktopStore().setAssignment({
        displayKey: payload.displayKey,
        desktopIndex: Math.max(0, Math.floor(payload.desktopIndex ?? 0)),
      });
      syncDesktopWindows();
      return { ok: true };
    },
  );

  ipcMain.handle(
    'deskwin:setOptions',
    (_e, payload: Partial<DisplayAssignment> & { displayKey?: string }) => {
      if (!payload || typeof payload.displayKey !== 'string') return { ok: false };
      desktopStore().setAssignment(payload as Partial<DisplayAssignment> & { displayKey: string });
      syncDesktopWindows();
      return { ok: true };
    },
  );

  ipcMain.handle('deskwin:list', (): DeskWindowInfo[] => listDeskWindows());

  /**
   * Tear an app off the taskbar into its own desktop.
   *
   * Main only allocates the index and opens the window. The *layout* edits — the
   * app leaving this desktop and arriving on the new one — stay with the calling
   * renderer, because the new desktop has no other shell showing it yet and the
   * caller owns its own. That keeps the single-writer rule (B2) intact; main
   * editing layouts directly is what it forbids.
   */
  ipcMain.handle('deskwin:allocateDesktop', (): { ok: boolean; desktopIndex?: DesktopIndex } => {
    const index = desktopStore().allocateDesktop();
    if (index == null) return { ok: false };
    return { ok: true, desktopIndex: index };
  });

  ipcMain.handle('deskwin:openDesktop', (_e, index: unknown): { ok: boolean } => {
    if (typeof index !== 'number' || !Number.isFinite(index) || index < 0) return { ok: false };
    return { ok: openSpawnedDesktop(Math.floor(index)) };
  });

  /** Which display+desktop is the caller? Answers for main and secondaries alike. */
  ipcMain.handle('deskwin:whoAmI', (e): { displayKey: string | null; desktopIndex: DesktopIndex | null } => {
    const win = BrowserWindow.fromWebContents(e.sender);
    return win && !win.isDestroyed()
      ? desktopIdentityForWindow(win)
      : { displayKey: null, desktopIndex: null };
  });

  ipcMain.handle('deskwin:sync', () => {
    syncDesktopWindows();
    return listDeskWindows();
  });

  /** Raise the window showing a given desktop — the "show all windows" taskbar. */
  ipcMain.handle('deskwin:focusDesktop', (_e, index: unknown): { ok: boolean } => {
    if (typeof index !== 'number') return { ok: false };
    const win = windowForDesktop(index);
    if (!win || win.isDestroyed()) return { ok: false };
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return { ok: true };
  });
}

export { displayForKey };
