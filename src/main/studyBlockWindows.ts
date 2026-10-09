/**
 * One OS window per detached Study Block.
 *
 * The renderer side of the contract is `shared/studyDetach.ts`; this is the half that
 * owns real windows. It deliberately does **not** reuse `createPopoutWindow` in
 * `main.ts`: that map is keyed by app *section* and its windows are whole apps, while
 * these are keyed by block and are a single panel each. Sharing the map would let a
 * detached transcript and the Library pop-out evict one another.
 *
 * What it does reuse is everything that is genuinely the same: the nav guards, the dev
 * console forwarding and the renderer URL builder are all passed in from `main.ts`
 * (`configureStudyBlockWindows`), so a detached block cannot drift into being the one
 * window in the app where an `https://` link navigates the SPA away.
 *
 * ## Geometry is persisted, and validated on the way back in
 *
 * `study-block-windows.json` in userData remembers where each block's window was, per
 * §26. Restoring it blind is how a window ends up on a monitor that has since been
 * unplugged — invisible, unreachable, with the app insisting it is open. Every stored
 * rectangle is checked against the *present* work areas by `sanitizeDetachedBounds`
 * before it is used, and a rectangle that no longer overlaps a screen is dropped in
 * favour of centring on the target display.
 */
import { app, BrowserWindow, ipcMain } from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { refuseWhileLocked } from './lockGuard';
import path from 'node:path';
import {
  centreOnWorkArea,
  DETACH_CHANNELS,
  DETACHED_MIN_HEIGHT,
  DETACHED_MIN_WIDTH,
  defaultDetachedSize,
  isHostedDetachBlock,
  mergeDetachSnapshot,
  parseDetachCommand,
  sanitizeDetachedBounds,
  type DetachedWindowBounds,
  type DetachedWindowInfo,
  type StudyDetachSnapshot,
} from '../shared/studyDetach';
import { displayForKey, keyForWindow, listDisplays } from './displays';

type RendererUrlFn = (query?: string) => string;
type NavGuardFn = (win: BrowserWindow) => void;
type ForwardConsoleFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let attachNavGuards: NavGuardFn = () => undefined;
let forwardConsole: ForwardConsoleFn | null = null;
let isDev = false;
/** Lets "send to display" also move an app-section pop-out, which `main.ts` owns. */
let popoutWindowForSection: (section: string) => BrowserWindow | null = () => null;

export function configureStudyBlockWindows(opts: {
  rendererUrl: RendererUrlFn;
  attachNavGuards: NavGuardFn;
  forwardConsole?: ForwardConsoleFn;
  isDevServer: boolean;
  popoutWindow?: (section: string) => BrowserWindow | null;
}): void {
  getRendererUrl = opts.rendererUrl;
  attachNavGuards = opts.attachNavGuards;
  forwardConsole = opts.forwardConsole ?? null;
  isDev = opts.isDevServer;
  if (opts.popoutWindow) popoutWindowForSection = opts.popoutWindow;
}

interface Detached {
  blockId: string;
  surface: string;
  win: BrowserWindow;
}

/** `${surface}:${blockId}` -> window. One window per block per surface. */
const windows = new Map<string, Detached>();

function mapKey(surface: string, blockId: string): string {
  return `${surface}:${blockId}`;
}

/* ------------------------------------------------------------------------------ *
 * Persisted geometry
 * ------------------------------------------------------------------------------ */

function storePath(): string {
  return path.join(app.getPath('userData'), 'study-block-windows.json');
}

let boundsCache: Record<string, DetachedWindowBounds> | null = null;

function workAreas(): { x: number; y: number; width: number; height: number }[] {
  return listDisplays().map((display) => display.workArea);
}

function loadBounds(): Record<string, DetachedWindowBounds> {
  if (boundsCache) return boundsCache;
  const next: Record<string, DetachedWindowBounds> = {};
  try {
    // No file yet, or a damaged one with no intact `.bak`: "no saved geometry" —
    // never a failure to open the window.
    const raw = readJsonSync<unknown>(storePath(), null, {
      validate: (v) => !!v && typeof v === 'object' && !Array.isArray(v),
    });
    if (raw) {
      const screens = workAreas();
      for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
        const bounds = sanitizeDetachedBounds(value, screens);
        if (bounds) next[key] = bounds;
      }
    }
  } catch {
    // Sanitising failed — same answer: no saved geometry.
  }
  boundsCache = next;
  return next;
}

let saveTimer: NodeJS.Timeout | null = null;

function saveBoundsSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  // A drag fires `moved` continuously; writing per event would put a synchronous
  // `writeFileSync` in the middle of the gesture.
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      writeJsonAtomicSync(storePath(), boundsCache ?? {});
    } catch {
      // Geometry is a convenience. Losing it must never surface as an error.
    }
  }, 600);
}

function rememberBounds(key: string, win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  const bounds = win.getBounds();
  const store = loadBounds();
  store[key] = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    ...(keyForWindow(win) ? { displayKey: keyForWindow(win) as string } : {}),
  };
  saveBoundsSoon();
}

/**
 * Opening rectangle: the saved one if it is still on a real screen, otherwise centred
 * on the requested display, otherwise centred on the primary.
 */
function openingBounds(key: string, blockId: string, displayKey?: string): DetachedWindowBounds {
  const size = defaultDetachedSize(blockId);
  const saved = loadBounds()[key];
  // An explicit "send to display" overrides remembered geometry: the user just asked
  // for a different monitor, and honouring the old rectangle would ignore them.
  if (saved && !displayKey) return saved;

  const target = displayKey ? displayForKey(displayKey) : null;
  const summaries = listDisplays();
  const chosen = target
    ? summaries.find((entry) => entry.id === target.id)
    : summaries.find((entry) => entry.primary) ?? summaries[0];
  if (!chosen) return { x: 80, y: 80, ...size };
  return centreOnWorkArea(chosen.workArea, size);
}

/* ------------------------------------------------------------------------------ *
 * The snapshot relay
 * ------------------------------------------------------------------------------ */

/**
 * Last published study state, per surface.
 *
 * Held here rather than pulled on demand because a detached window can be created
 * before, during or after the host's render — replaying the last frame on open is what
 * makes a newly detached transcript show the current line immediately instead of an
 * empty column until the next `timeupdate`.
 */
const snapshots = new Map<string, StudyDetachSnapshot>();

function broadcastOpen(): void {
  const payload = listDetachedWindows();
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(DETACH_CHANNELS.changed, payload);
  }
}

export function listDetachedWindows(): DetachedWindowInfo[] {
  const out: DetachedWindowInfo[] = [];
  for (const entry of windows.values()) {
    if (entry.win.isDestroyed()) continue;
    out.push({
      blockId: entry.blockId,
      surface: entry.surface,
      displayKey: keyForWindow(entry.win),
    });
  }
  return out;
}

/* ------------------------------------------------------------------------------ *
 * Open / close / move
 * ------------------------------------------------------------------------------ */

export function openStudyBlockWindow(
  blockId: string,
  surface: string,
  displayKey?: string,
): boolean {
  if (!isHostedDetachBlock(blockId)) return false;
  // A detached block skips the PIN pad by design (App.tsx), so it never opens locked.
  if (refuseWhileLocked('window:study-block')) return false;
  const key = mapKey(surface, blockId);

  const existing = windows.get(key);
  if (existing && !existing.win.isDestroyed()) {
    if (displayKey) moveWindowToDisplay(existing.win, displayKey);
    if (existing.win.isMinimized()) existing.win.restore();
    existing.win.show();
    existing.win.focus();
    return true;
  }

  const bounds = openingBounds(key, blockId, displayKey);
  const win = new BrowserWindow({
    ...bounds,
    minWidth: DETACHED_MIN_WIDTH,
    minHeight: DETACHED_MIN_HEIGHT,
    // Framed, unlike the app pop-outs. A single panel on a second monitor is a utility
    // window the user will move and close with the OS; giving it a custom drag strip
    // would cost a title bar's worth of the very space it was detached to gain.
    frame: true,
    title: `Study — ${blockId}`,
    show: false,
    backgroundColor: '#14131a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  attachNavGuards(win);
  windows.set(key, { blockId, surface, win });

  win.once('ready-to-show', () => {
    if (win.isDestroyed()) return;
    win.show();
    win.focus();
  });

  const remember = (): void => rememberBounds(key, win);
  win.on('moved', remember);
  win.on('resized', remember);
  /*
    Seed the cache with the rectangle we just opened at.

    Without this, only a window the user DRAGGED was ever remembered: `moved`/`resized`
    do not fire for the rectangle a window is constructed with, and
    `rememberBoundsFromCacheOnClose` bails when the key has no cache entry — so nothing
    was ever written. Measured live 2026-09-02: "Send to display" on a docked block
    (which routes through `openStudyBlockWindow(..., displayKey)`, not through
    `moveToDisplay`) placed the window on the second monitor at 2090,20 460x512, and
    after close/reopen it came back primary-centred at 730,106 460x820 with
    `study-block-windows.json` never created at all.

    Recording the bounds we opened at is a measurement, not an invention: it is read
    back off the window, so DPI or an OS clamp is captured as it actually landed. For a
    default (no `displayKey`) open it stores the same rectangle `openingBounds` would
    recompute, so the visible behaviour changes for exactly the placed case.
  */
  remember();

  win.on('closed', () => {
    rememberBoundsFromCacheOnClose(key);
    if (windows.get(key)?.win === win) windows.delete(key);
    broadcastOpen();
  });

  if (isDev && forwardConsole) forwardConsole(win);

  const query = `studyBlock=${encodeURIComponent(blockId)}&surface=${encodeURIComponent(surface)}`;
  void win.loadURL(getRendererUrl(query));
  broadcastOpen();
  return true;
}

/**
 * `closed` fires after the window is destroyed, so its bounds are already gone.
 * `moved`/`resized` have kept the cache current; this only forces the debounced write
 * out so a close immediately followed by a quit does not lose the last drag.
 */
function rememberBoundsFromCacheOnClose(key: string): void {
  if (!boundsCache || !boundsCache[key]) return;
  saveBoundsSoon();
}

export function closeStudyBlockWindow(blockId: string, surface: string): boolean {
  const entry = windows.get(mapKey(surface, blockId));
  if (!entry || entry.win.isDestroyed()) return false;
  entry.win.close();
  return true;
}

export function closeAllStudyBlockWindows(): void {
  for (const entry of [...windows.values()]) {
    if (!entry.win.isDestroyed()) entry.win.destroy();
  }
  windows.clear();
}

/** Move a window onto a display, keeping its size where the display can hold it. */
function moveWindowToDisplay(win: BrowserWindow, displayKey: string): boolean {
  if (win.isDestroyed()) return false;
  const target = displayForKey(displayKey);
  if (!target) return false;
  const summary = listDisplays().find((entry) => entry.id === target.id);
  if (!summary) return false;
  const current = win.getBounds();
  const placed = centreOnWorkArea(summary.workArea, {
    width: current.width,
    height: current.height,
  });
  if (win.isMaximized()) win.unmaximize();
  win.setBounds(placed);
  win.show();
  win.focus();
  return true;
}

/* ------------------------------------------------------------------------------ *
 * IPC
 * ------------------------------------------------------------------------------ */

export function registerStudyBlockWindowIpc(): void {
  ipcMain.handle(DETACH_CHANNELS.open, (_e, payload: unknown): { ok: boolean } => {
    if (typeof payload !== 'object' || payload === null) return { ok: false };
    const { blockId, surface, displayKey } = payload as Record<string, unknown>;
    if (typeof blockId !== 'string') return { ok: false };
    return {
      ok: openStudyBlockWindow(
        blockId,
        typeof surface === 'string' ? surface : 'workspace',
        typeof displayKey === 'string' && displayKey ? displayKey : undefined,
      ),
    };
  });

  ipcMain.handle(DETACH_CHANNELS.close, (_e, payload: unknown): { ok: boolean } => {
    if (typeof payload !== 'object' || payload === null) return { ok: false };
    const { blockId, surface } = payload as Record<string, unknown>;
    if (typeof blockId !== 'string') return { ok: false };
    return {
      ok: closeStudyBlockWindow(blockId, typeof surface === 'string' ? surface : 'workspace'),
    };
  });

  ipcMain.handle(DETACH_CHANNELS.list, (): DetachedWindowInfo[] => listDetachedWindows());

  /**
   * Send a block's window to a monitor.
   *
   * Also accepts an app-section pop-out (`section`), because "Send to Display 2" must
   * mean the same thing for the Notebook window a Notes block opened as it does for a
   * detached transcript. Anything else would make the menu item's behaviour depend on
   * which kind of block the user happened to pick.
   */
  ipcMain.handle(DETACH_CHANNELS.moveToDisplay, (_e, payload: unknown): { ok: boolean } => {
    if (typeof payload !== 'object' || payload === null) return { ok: false };
    const { blockId, surface, section, displayKey } = payload as Record<string, unknown>;
    if (typeof displayKey !== 'string' || !displayKey) return { ok: false };

    if (typeof section === 'string' && section) {
      const win = popoutWindowForSection(section);
      return { ok: !!win && moveWindowToDisplay(win, displayKey) };
    }
    if (typeof blockId !== 'string') return { ok: false };
    const key = mapKey(typeof surface === 'string' ? surface : 'workspace', blockId);
    const entry = windows.get(key);
    if (!entry || entry.win.isDestroyed()) return { ok: false };
    const moved = moveWindowToDisplay(entry.win, displayKey);
    if (moved) {
      rememberBounds(key, entry.win);
      broadcastOpen();
    }
    return { ok: moved };
  });

  /** Host -> every detached window. Never echoed back to the sender. */
  ipcMain.on(DETACH_CHANNELS.publish, (e, snapshot: StudyDetachSnapshot) => {
    if (!snapshot || typeof snapshot !== 'object') return;
    const surface = typeof snapshot.surface === 'string' ? snapshot.surface : 'workspace';
    // The relay is where light frames become whole ones — see `mergeDetachSnapshot`.
    // Doing it here means a window that opens between two light frames still gets a
    // transcript, and no receiver needs to know the optimisation exists.
    // `sourceId` is stamped here rather than trusted from the payload: it is what
    // routes commands back, and a renderer cannot know its own `webContents.id`
    // synchronously at publish time.
    const stamped = { ...snapshot, sourceId: e.sender.id, surface };
    const merged = mergeDetachSnapshot(snapshots.get(surface) ?? null, stamped);
    snapshots.set(surface, merged);
    for (const entry of windows.values()) {
      if (entry.surface !== surface) continue;
      if (entry.win.isDestroyed() || entry.win.webContents.id === e.sender.id) continue;
      entry.win.webContents.send(DETACH_CHANNELS.sync, merged);
    }
  });

  /** A window that just mounted asks for the current frame rather than waiting. */
  ipcMain.handle(
    DETACH_CHANNELS.requestSnapshot,
    (_e, surface: unknown): StudyDetachSnapshot | null =>
      snapshots.get(typeof surface === 'string' ? surface : 'workspace') ?? null,
  );

  /**
   * Detached window -> host.
   *
   * Addressed to the window that published the surface's last snapshot, not broadcast:
   * a `seek-cue` delivered to every renderer would be executed once by the player and
   * once more by any other study surface that happened to be mounted.
   */
  ipcMain.on(DETACH_CHANNELS.command, (e, payload: unknown) => {
    if (typeof payload !== 'object' || payload === null) return;
    const { surface, command } = payload as Record<string, unknown>;
    const parsed = parseDetachCommand(command);
    if (!parsed) return;
    const key = typeof surface === 'string' ? surface : 'workspace';
    const snapshot = snapshots.get(key);
    const targetId = snapshot?.sourceId ?? 0;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.isDestroyed() || win.webContents.id === e.sender.id) continue;
      if (targetId && win.webContents.id !== targetId) continue;
      win.webContents.send(DETACH_CHANNELS.command, parsed);
    }
  });
}
