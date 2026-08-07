/**
 * L4 — transparent always-on-top companion host over the real Windows desktop.
 * Opt-in only; click-through empty space via setIgnoreMouseEvents.
 * Multi-monitor: primary work area or union of all display bounds.
 */
import { BrowserWindow, ipcMain, screen, app, powerMonitor } from 'electron';
import path from 'node:path';
import { listDisplays, onDisplaysChanged, unionDisplayBounds } from './displays';

let host: BrowserWindow | null = null;
let latestState: unknown = null;
let hostClickThrough = true;
/** 'primary' | 'all' — last requested span mode. */
let spanMode: 'primary' | 'all' = 'primary';
let powerHooksInstalled = false;

type RendererUrlFn = (query?: string) => string;
type ForwardConsoleFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let forwardConsole: ForwardConsoleFn | null = null;
let isDev = false;

export function configureCompanionHost(opts: {
  rendererUrl: RendererUrlFn;
  forwardConsole?: ForwardConsoleFn;
  isDevServer: boolean;
}): void {
  getRendererUrl = opts.rendererUrl;
  forwardConsole = opts.forwardConsole ?? null;
  isDev = opts.isDevServer;
}

// `unionDisplayBounds` moved to `./displays` so the desktop windows and the pet
// host compute the same span. It still prefers workArea, so pets climb usable
// desktop edges (taskbar / dock excluded) and never sit in the dead gap between
// mixed-DPI monitors.

function placeHost(win: BrowserWindow, mode: 'primary' | 'all' = spanMode): void {
  if (mode === 'all') {
    // Union of work areas (DIP) — physical edges per display, not raw bounds gaps.
    win.setBounds(unionDisplayBounds(true));
  } else {
    const { workArea } = screen.getPrimaryDisplay();
    win.setBounds({
      x: workArea.x,
      y: workArea.y,
      width: workArea.width,
      height: workArea.height,
    });
  }
  // Re-assert always-on-top + click-through after layout / wake.
  if (!win.isDestroyed()) {
    win.setAlwaysOnTop(true, 'floating');
    win.setIgnoreMouseEvents(true, { forward: true });
    hostClickThrough = true;
  }
}

function refreshHostAfterWake(): void {
  if (!host || host.isDestroyed()) return;
  placeHost(host, spanMode);
  if (!host.isVisible()) host.showInactive();
  else host.showInactive();
  if (latestState != null) {
    host.webContents.send('companionHost:state', latestState);
  }
  // Tell host renderer to re-sync click-through after sleep
  host.webContents.send('companionHost:wake');
}

function createHostWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    focusable: true,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: false,
      /**
       * v1.0 audit §3.1 — the reason "Show on Windows desktop" looked non-functional.
       *
       * This window is shown with `showInactive()` and never focused, and Chromium marks
       * its document **hidden** even while it is painted on screen: measured live as
       * `document.visibilityState: 'hidden'` on a window `/health` reported as
       * `visible: true` at 1920×1080. A hidden document is throttled to no frames, so
       * `requestAnimationFrame` never fired (`rafRan: 0` after ~1.6 s), and the host's
       * pointer hit-test — which is what turns click-through OFF over a pet — never ran.
       * The pet was visible and permanently untouchable.
       *
       * An always-on-top desktop overlay is exactly the case this flag exists for: it is
       * never the foreground window and must keep running anyway.
       */
      backgroundThrottling: false,
    },
  });

  placeHost(win, spanMode);
  win.setIgnoreMouseEvents(true, { forward: true });
  hostClickThrough = true;
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });

  win.on('closed', () => {
    if (host === win) host = null;
  });

  if (isDev && forwardConsole) forwardConsole(win);
  void win.loadURL(getRendererUrl('companionHost=1'));

  // One subscription against the shared display service, rather than this
  // module's own three `screen.on(...)` listeners — same teardown discipline.
  const offDisplay = onDisplaysChanged(() => {
    if (!host || host.isDestroyed()) return;
    placeHost(host, spanMode);
    // Host renderer remaps pets after multi-monitor plug/unplug
    host.webContents.send('companionHost:wake');
    if (latestState != null) {
      host.webContents.send('companionHost:state', latestState);
    }
  });
  win.on('closed', offDisplay);

  return win;
}

export function openCompanionHost(mode?: 'primary' | 'all'): void {
  if (mode === 'primary' || mode === 'all') spanMode = mode;
  if (host && !host.isDestroyed()) {
    placeHost(host, spanMode);
    host.showInactive();
    // `placeHost` re-arms click-through and resets `hostClickThrough` to true. The host
    // renderer's own `overRef` does not know that, so if the pointer was over a pet it
    // would not re-send `setClickThrough(false)` until the pointer left and came back —
    // the pet would go quietly untouchable. `wake` is the renderer's reset signal; the
    // other two `placeHost` callers already send it.
    host.webContents.send('companionHost:wake');
    if (latestState != null) {
      host.webContents.send('companionHost:state', latestState);
    }
    return;
  }
  host = createHostWindow();
  host.webContents.once('did-finish-load', () => {
    if (latestState != null && host && !host.isDestroyed()) {
      host.webContents.send('companionHost:state', latestState);
    }
  });
}

export function closeCompanionHost(): void {
  if (host && !host.isDestroyed()) {
    host.close();
  }
  host = null;
}

export function isCompanionHostOpen(): boolean {
  return Boolean(host && !host.isDestroyed());
}

export function registerCompanionHostIpc(): void {
  if (!powerHooksInstalled) {
    powerHooksInstalled = true;
    powerMonitor.on('resume', () => {
      refreshHostAfterWake();
    });
    powerMonitor.on('unlock-screen', () => {
      refreshHostAfterWake();
    });
  }

  ipcMain.handle(
    'companionHost:setEnabled',
    (_e, enabled: unknown, mode?: unknown): { ok: boolean } => {
      if (mode === 'primary' || mode === 'all') spanMode = mode;
      if (enabled === true) openCompanionHost(spanMode);
      else closeCompanionHost();
      return { ok: true };
    },
  );

  ipcMain.handle('companionHost:setSpan', (_e, mode: unknown): { ok: boolean } => {
    if (mode === 'primary' || mode === 'all') {
      spanMode = mode;
      if (host && !host.isDestroyed()) placeHost(host, spanMode);
      return { ok: true };
    }
    return { ok: false };
  });

  ipcMain.handle('companionHost:isOpen', (): boolean => isCompanionHostOpen());

  // Delegates to the shared service. The shape is a superset of what this
  // channel returned before (`key`, `label` and `virtual` are new), so existing
  // callers in the host renderer are unaffected.
  ipcMain.handle('companionHost:getDisplays', () => listDisplays());

  /** Host viewport geometry for coordinate mapping in the renderer. */
  ipcMain.handle('companionHost:getViewport', (): {
    span: 'primary' | 'all';
    bounds: Electron.Rectangle;
    primaryWorkArea: Electron.Rectangle;
  } => {
    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const bounds =
      spanMode === 'all' ? unionDisplayBounds(true) : { ...primaryWorkArea };
    return { span: spanMode, bounds, primaryWorkArea };
  });

  ipcMain.on('companionHost:pushState', (_e, state: unknown) => {
    latestState = state;
    if (host && !host.isDestroyed()) {
      host.webContents.send('companionHost:state', latestState);
    }
  });

  ipcMain.on('companionHost:setClickThrough', (e, through: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    const next = through !== false;
    if (next === hostClickThrough) return;
    hostClickThrough = next;
    if (next) win.setIgnoreMouseEvents(true, { forward: true });
    else win.setIgnoreMouseEvents(false);
  });

  ipcMain.handle('companionHost:focusMain', (): void => {
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== host);
    const main = wins.find((w) => !w.isAlwaysOnTop()) ?? wins[0];
    if (!main) return;
    if (main.isMinimized()) main.restore();
    main.show();
    main.focus();
  });

  /** Host pet ran a routine — forward to the main Study OS window. */
  ipcMain.on('companionHost:runRoutine', (_e, companionId: unknown, routineId: unknown) => {
    if (typeof companionId !== 'string' || typeof routineId !== 'string') return;
    const wins = BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== host);
    for (const w of wins) {
      w.webContents.send('buddy:run', { companionId, routineId });
    }
  });

  app.on('before-quit', () => {
    closeCompanionHost();
  });
}
