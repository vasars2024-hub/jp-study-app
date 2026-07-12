/**
 * L4 — transparent always-on-top companion host over the real Windows desktop.
 * Opt-in only; click-through empty space via setIgnoreMouseEvents.
 * Multi-monitor: primary work area or union of all display bounds.
 */
import { BrowserWindow, ipcMain, screen, app, powerMonitor } from 'electron';
import path from 'node:path';

let host: BrowserWindow | null = null;
let latestState: unknown = null;
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

function unionDisplayBounds(useWorkArea: boolean): Electron.Rectangle {
  const displays = screen.getAllDisplays();
  if (!displays.length) {
    return { x: 0, y: 0, width: 1280, height: 800 };
  }
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
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function placeHost(win: BrowserWindow, mode: 'primary' | 'all' = spanMode): void {
  if (mode === 'all') {
    // Full virtual desktop (bounds) so companions can sit on any monitor.
    win.setBounds(unionDisplayBounds(false));
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
    },
  });

  placeHost(win, spanMode);
  win.setIgnoreMouseEvents(true, { forward: true });
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

  const onDisplay = () => {
    if (!host || host.isDestroyed()) return;
    placeHost(host, spanMode);
    // Host renderer remaps pets after multi-monitor plug/unplug
    host.webContents.send('companionHost:wake');
    if (latestState != null) {
      host.webContents.send('companionHost:state', latestState);
    }
  };
  screen.on('display-metrics-changed', onDisplay);
  screen.on('display-added', onDisplay);
  screen.on('display-removed', onDisplay);
  win.on('closed', () => {
    screen.removeListener('display-metrics-changed', onDisplay);
    screen.removeListener('display-added', onDisplay);
    screen.removeListener('display-removed', onDisplay);
  });

  return win;
}

export function openCompanionHost(mode?: 'primary' | 'all'): void {
  if (mode === 'primary' || mode === 'all') spanMode = mode;
  if (host && !host.isDestroyed()) {
    placeHost(host, spanMode);
    host.showInactive();
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

  ipcMain.handle('companionHost:getDisplays', (): {
    id: number;
    bounds: Electron.Rectangle;
    workArea: Electron.Rectangle;
    primary: boolean;
  }[] => {
    const primaryId = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d) => ({
      id: d.id,
      bounds: d.bounds,
      workArea: d.workArea,
      primary: d.id === primaryId,
    }));
  });

  /** Host viewport geometry for coordinate mapping in the renderer. */
  ipcMain.handle('companionHost:getViewport', (): {
    span: 'primary' | 'all';
    bounds: Electron.Rectangle;
    primaryWorkArea: Electron.Rectangle;
  } => {
    const primaryWorkArea = screen.getPrimaryDisplay().workArea;
    const bounds =
      spanMode === 'all' ? unionDisplayBounds(false) : { ...primaryWorkArea };
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
    if (through === false) win.setIgnoreMouseEvents(false);
    else win.setIgnoreMouseEvents(true, { forward: true });
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
