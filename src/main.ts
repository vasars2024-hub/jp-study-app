import { app, BrowserWindow, protocol, net, shell, ipcMain } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { registerLibraryIpc, registerLocalFileProtocol, ensureLibrary, libraryRoot } from './main/library';
import { registerDictionaryIpc, initYomitan } from './main/dictionary';
import { registerMediaIpc } from './main/media';
import { registerProfileIpc } from './main/profiles';
import { registerAnkiIpc } from './main/anki';
import { registerDesktopIpc } from './main/desktop';
import { registerCityIpc } from './main/city';
import { registerTranslateIpc } from './main/translate';
import { registerMiningIpc } from './main/mining';
import { registerImmersionIpc } from './main/immersion';
import { registerSystemMetricsIpc } from './main/systemMetrics';
import type { PlayerCommand, PlayerSnapshot } from './shared/playerSync';
import {
  configureCompanionHost,
  registerCompanionHostIpc,
  closeCompanionHost,
} from './main/companionHost';

if (started) {
  app.quit();
}

function isEpipe(err: unknown): boolean {
  return Boolean(err && typeof err === 'object' && 'code' in err && (err as { code?: unknown }).code === 'EPIPE');
}

process.stdout?.on?.('error', (err) => {
  if (!isEpipe(err)) throw err;
});
process.stderr?.on?.('error', (err) => {
  if (!isEpipe(err)) throw err;
});
process.on('uncaughtException', (err) => {
  if (isEpipe(err)) return;
  console.error(err);
  app.quit();
});

if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && MAIN_WINDOW_VITE_DEV_SERVER_URL) {
  app.commandLine.appendSwitch('disable-http-cache');
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
  {
    scheme: 'media',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
  {
    scheme: 'playfile',
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true, corsEnabled: true },
  },
  // Wallpaper / library images — stream from disk (never base64 into the renderer).
  {
    scheme: 'localfile',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
      bypassCSP: true,
      corsEnabled: true,
    },
  },
]);

function registerAppProtocol(): void {
  const root = path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';
      const resolved = path.join(root, rel);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function registerMediaProtocol(): void {
  const root = path.resolve(libraryRoot());
  protocol.handle('media', (request) => {
    try {
      const url = new URL(request.url);
      const rel = decodeURIComponent(url.host + url.pathname);
      const resolved = path.resolve(root, rel);
      if (resolved !== root && !resolved.startsWith(root + path.sep)) {
        return new Response('Forbidden', { status: 403 });
      }
      return net.fetch(pathToFileURL(resolved).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
}

function registerShellIpc(): void {
  ipcMain.handle('shell:openExternal', async (_e, url: unknown): Promise<boolean> => {
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });
}

function isDevServer(): boolean {
  return typeof MAIN_WINDOW_VITE_DEV_SERVER_URL !== 'undefined' && !!MAIN_WINDOW_VITE_DEV_SERVER_URL;
}

// The page every window loads. In dev it's the Vite server, in prod the bundled
// index.html served over the app:// protocol. An optional query string (e.g.
// `popout=dictionary`) is appended so a window can tell the renderer to show a
// single app instead of the whole desktop.
function rendererUrl(query = ''): string {
  const base = isDevServer() ? MAIN_WINDOW_VITE_DEV_SERVER_URL : 'app://bundle/index.html';
  if (!query) return base;
  return `${base}${base.includes('?') ? '&' : '?'}${query}`;
}

// Mirror the renderer's console to our terminal (dev only). Registered per
// window so pop-out windows report errors too.
function forwardRendererConsole(win: BrowserWindow): void {
  win.webContents.on('console-message', (...args: unknown[]) => {
    const details = args.find(
      (a) => a && typeof a === 'object' && 'message' in (a as Record<string, unknown>),
    ) as { message?: string } | undefined;
    const message = details?.message ?? (typeof args[2] === 'string' ? args[2] : '');
    if (message) console.log(`[renderer] ${message}`);
  });
}

/** Primary Study OS window (full desktop). Kept so Mini Widget can hide/show it. */
let mainWindow: BrowserWindow | null = null;
/** Floating Mini craft widget — frameless, transparent, always-on-top. */
let miniWidgetWindow: BrowserWindow | null = null;
/** Compact PIN lock widget — frameless, transparent, no OS shadow. */
let lockscreenWindow: BrowserWindow | null = null;
let lockscreenDismissedViaUnlock = false;

const MINI_DEFAULT_W = 360;
const MINI_DEFAULT_H = 440;
const MINI_MIN_W = 260;
const MINI_MIN_H = 320;
const MINI_MAX_W = 560;
const MINI_MAX_H = 720;

function attachNavGuards(win: BrowserWindow): void {
  // Accidental <a href="https://…"> clicks must never replace the SPA shell.
  const allowAppNav = (url: string): boolean => {
    if (!url || url === 'about:blank') return true;
    if (url.startsWith('devtools://') || url.startsWith('chrome-devtools://')) return true;
    if (url.startsWith('app://')) return true;
    if (isDevServer() && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL)) return true;
    if (url.startsWith('file://') && url.includes('index.html')) return true;
    return false;
  };
  win.webContents.on('will-navigate', (e, url) => {
    if (!allowAppNav(url)) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
}

const createWindow = (): void => {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 940,
    minHeight: 600,
    backgroundColor: '#1b1b21',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // Immersion Browser guest pages (<webview>) — isolated from window.api.
      webviewTag: true,
    },
  });

  // Companion host is skipTaskbar; tear it down when the real main window closes
  // so the app can quit instead of leaving invisible pets running.
  mainWindow.on('closed', () => {
    mainWindow = null;
    if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
      miniWidgetWindow.close();
    }
    if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
      lockscreenWindow.close();
    }
    closeCompanionHost();
  });

  attachNavGuards(mainWindow);

  if (isDevServer()) {
    mainWindow.webContents.session.clearCache().finally(() => mainWindow!.loadURL(rendererUrl()));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    forwardRendererConsole(mainWindow);
  } else {
    mainWindow.loadURL(rendererUrl());
  }
};

/**
 * True Mini Widget Mode: a small borderless transparent always-on-top window
 * that only wraps the craft panel (no full-screen black canvas).
 */
function createMiniWidgetWindow(size?: { width?: number; height?: number }): void {
  const width = Math.min(
    MINI_MAX_W,
    Math.max(MINI_MIN_W, Math.round(size?.width ?? MINI_DEFAULT_W)),
  );
  const height = Math.min(
    MINI_MAX_H,
    Math.max(MINI_MIN_H, Math.round(size?.height ?? MINI_DEFAULT_H)),
  );

  if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
    miniWidgetWindow.setSize(width, height);
    if (miniWidgetWindow.isMinimized()) miniWidgetWindow.restore();
    miniWidgetWindow.show();
    miniWidgetWindow.focus();
    // Keep main hidden while widget is up
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return;
  }

  miniWidgetWindow = new BrowserWindow({
    width,
    height,
    minWidth: MINI_MIN_W,
    minHeight: MINI_MIN_H,
    maxWidth: MINI_MAX_W,
    maxHeight: MINI_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    resizable: true,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  const win = miniWidgetWindow;
  attachNavGuards(win);
  if (isDevServer()) forwardRendererConsole(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    miniWidgetWindow = null;
    // Returning from mini: restore the full Study OS window unless the app is quitting.
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void win.loadURL(rendererUrl('miniWidget=1'));

  // Hide the large desktop shell while the floating widget is active.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function closeMiniWidgetWindow(): void {
  if (miniWidgetWindow && !miniWidgetWindow.isDestroyed()) {
    miniWidgetWindow.close();
  }
  miniWidgetWindow = null;
}

function registerMiniWidgetIpc(): void {
  ipcMain.handle(
    'mini:open',
    (_e, size?: { width?: number; height?: number }): { ok: boolean } => {
      createMiniWidgetWindow(size);
      return { ok: true };
    },
  );
  ipcMain.handle('mini:close', (): { ok: boolean } => {
    closeMiniWidgetWindow();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { ok: true };
  });
  ipcMain.handle(
    'mini:setSize',
    (e, size: unknown): { ok: boolean } => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win !== miniWidgetWindow) return { ok: false };
      if (!size || typeof size !== 'object') return { ok: false };
      const w = Math.round(Number((size as { width?: number }).width));
      const h = Math.round(Number((size as { height?: number }).height));
      if (!Number.isFinite(w) || !Number.isFinite(h)) return { ok: false };
      const width = Math.min(MINI_MAX_W, Math.max(MINI_MIN_W, w));
      const height = Math.min(MINI_MAX_H, Math.max(MINI_MIN_H, h));
      // Keep the same center while scaling so the widget doesn't jump.
      const [cx, cy] = win.getPosition();
      const [ow, oh] = win.getSize();
      const nx = Math.round(cx + (ow - width) / 2);
      const ny = Math.round(cy + (oh - height) / 2);
      win.setBounds({ x: nx, y: ny, width, height });
      return { ok: true };
    },
  );
  ipcMain.handle('mini:isOpen', (): boolean =>
    Boolean(miniWidgetWindow && !miniWidgetWindow.isDestroyed()),
  );
  ipcMain.handle('mini:focusMain', (): void => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

const LOCK_DEFAULT_W = 212;
const LOCK_DEFAULT_H = 248;
const LOCK_MIN_W = 180;
const LOCK_MIN_H = 200;
const LOCK_MAX_W = 300;
const LOCK_MAX_H = 360;

/**
 * Borderless transparent lock widget — only the rounded PIN panel is visible;
 * everything outside it is see-through with no rectangular OS shadow.
 */
function createLockscreenWindow(size?: { width?: number; height?: number }): void {
  const width = Math.min(
    LOCK_MAX_W,
    Math.max(LOCK_MIN_W, Math.round(size?.width ?? LOCK_DEFAULT_W)),
  );
  const height = Math.min(
    LOCK_MAX_H,
    Math.max(LOCK_MIN_H, Math.round(size?.height ?? LOCK_DEFAULT_H)),
  );

  if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
    lockscreenWindow.setSize(width, height);
    if (lockscreenWindow.isMinimized()) lockscreenWindow.restore();
    lockscreenWindow.show();
    lockscreenWindow.focus();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
    return;
  }

  lockscreenDismissedViaUnlock = false;
  lockscreenWindow = new BrowserWindow({
    width,
    height,
    minWidth: LOCK_MIN_W,
    minHeight: LOCK_MIN_H,
    maxWidth: LOCK_MAX_W,
    maxHeight: LOCK_MAX_H,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    center: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
      backgroundThrottling: false,
    },
  });

  const win = lockscreenWindow;
  attachNavGuards(win);
  if (isDevServer()) forwardRendererConsole(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.show();
  });
  win.on('closed', () => {
    lockscreenWindow = null;
    if (!lockscreenDismissedViaUnlock) {
      // Closing the lock widget without unlocking should not reveal the desktop.
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.close();
      } else {
        app.quit();
      }
      return;
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
  });

  void win.loadURL(rendererUrl('lockscreen=1'));

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.hide();
  }
}

function closeLockscreenWindow(): void {
  if (lockscreenWindow && !lockscreenWindow.isDestroyed()) {
    lockscreenWindow.close();
  }
  lockscreenWindow = null;
}

function broadcastLockscreenUnlocked(): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('lockscreen:unlocked');
  }
}

function registerLockscreenIpc(): void {
  ipcMain.handle(
    'lockscreen:open',
    (_e, size?: { width?: number; height?: number }): { ok: boolean } => {
      createLockscreenWindow(size);
      return { ok: true };
    },
  );
  ipcMain.handle('lockscreen:unlock', (): { ok: boolean } => {
    lockscreenDismissedViaUnlock = true;
    closeLockscreenWindow();
    broadcastLockscreenUnlocked();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.show();
      mainWindow.focus();
    }
    return { ok: true };
  });
  ipcMain.handle(
    'lockscreen:setSize',
    (e, size: unknown): { ok: boolean } => {
      const win = BrowserWindow.fromWebContents(e.sender);
      if (!win || win !== lockscreenWindow) return { ok: false };
      if (!size || typeof size !== 'object') return { ok: false };
      const w = Math.round(Number((size as { width?: number }).width));
      const h = Math.round(Number((size as { height?: number }).height));
      if (!Number.isFinite(w) || !Number.isFinite(h)) return { ok: false };
      const width = Math.min(LOCK_MAX_W, Math.max(LOCK_MIN_W, w));
      const height = Math.min(LOCK_MAX_H, Math.max(LOCK_MIN_H, h));
      const [cx, cy] = win.getPosition();
      const [ow, oh] = win.getSize();
      const nx = Math.round(cx + (ow - width) / 2);
      const ny = Math.round(cy + (oh - height) / 2);
      win.setBounds({ x: nx, y: ny, width, height });
      return { ok: true };
    },
  );
  ipcMain.handle('lockscreen:isOpen', (): boolean =>
    Boolean(lockscreenWindow && !lockscreenWindow.isDestroyed()),
  );
}

// Sections that may be detached into their own OS window. Mirrors the real apps
// in the desktop shell; excludes desktop-only trinkets (note/visualizer).
const POPOUT_SECTIONS = new Set([
  'library', 'novels', 'dictionary', 'grammar', 'translate', 'player', 'music',
  'anki', 'flashcards', 'stats', 'resources', 'city', 'musicwidget', 'immersion',
  'calendar', 'settings',
]);

// One real OS window per section, max. Keyed here (not just left to the
// renderer) so a double-click on the pop-out button, or popping the same app
// from two different windows, can never spawn a second copy — the renderer's
// own dedupe (DesktopShell's `open()`) only knows about its *own* windows, not
// ones already popped out.
const popoutWindows = new Map<string, BrowserWindow>();

function broadcastPopoutState(): void {
  const sections = [...popoutWindows.keys()];
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send('popout:changed', sections);
  }
}

// Open one app in a genuine, borderless second window. It's the same renderer
// loaded with `?popout=<section>`; the React app sees that flag and renders just
// that app full-window. `frame: false` gives the clean Noctis-style look — the
// window's own drag strip + min/max/close (see PopoutChrome) drive it via the
// popout:control IPC below.
function createPopoutWindow(section: string): void {
  if (!POPOUT_SECTIONS.has(section)) return;
  const existing = popoutWindows.get(section);
  if (existing && !existing.isDestroyed()) {
    if (existing.isMinimized()) existing.restore();
    existing.show();
    existing.focus();
    return;
  }
  const win = new BrowserWindow({
    width: section === 'musicwidget' ? 480 : 900,
    height: section === 'musicwidget' ? 220 : 640,
    minWidth: section === 'musicwidget' ? 320 : 360,
    minHeight: section === 'musicwidget' ? 140 : 240,
    frame: false,
    backgroundColor: '#14131a',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true,
    },
  });
  // Same guard as main window: never let EPUB / content links hijack the SPA.
  win.webContents.on('will-navigate', (e, url) => {
    const ok =
      !url ||
      url === 'about:blank' ||
      url.startsWith('app://') ||
      url.startsWith('devtools://') ||
      (isDevServer() && url.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL));
    if (!ok) {
      e.preventDefault();
      if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  popoutWindows.set(section, win);
  win.on('closed', () => {
    popoutWindows.delete(section);
    broadcastPopoutState();
  });
  if (isDevServer()) forwardRendererConsole(win);
  void win.loadURL(rendererUrl(`popout=${encodeURIComponent(section)}`));
  broadcastPopoutState();
}

function registerPopoutIpc(): void {
  ipcMain.handle('popout:open', (_e, section: unknown): void => {
    if (typeof section === 'string') createPopoutWindow(section);
  });
  ipcMain.handle('popout:listOpen', (): string[] => [...popoutWindows.keys()]);
  // Window controls for the frameless pop-out: acts on the window that sent the
  // message, so the custom min/max/close buttons work without a native title bar.
  ipcMain.handle('popout:control', (e, action: unknown): void => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win) return;
    if (action === 'minimize') win.minimize();
    else if (action === 'maximize') win.isMaximized() ? win.unmaximize() : win.maximize();
    else if (action === 'close') win.close();
  });
}

// Music player state shared across every renderer (desktop + pop-outs). One
// window owns the <audio> element; the rest mirror UI via player:sync.
let playerSnapshot: PlayerSnapshot | null = null;

function registerPlayerSyncIpc(): void {
  ipcMain.handle('player:windowId', (e): number => e.sender.id);
  ipcMain.handle('player:getSnapshot', (): PlayerSnapshot | null => playerSnapshot);
  ipcMain.on('player:publish', (e, snap: PlayerSnapshot) => {
    playerSnapshot = snap;
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== e.sender.id) {
        win.webContents.send('player:sync', snap);
      }
    }
  });
  ipcMain.on('player:command', (e, cmd: PlayerCommand) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (win.webContents.id !== e.sender.id) {
        win.webContents.send('player:command', cmd);
      }
    }
  });
}

// NOTE: an earlier "syncRendererStorageWithProfiles" step lived here. It
// compared profiles.json mtime against the Local Storage directory mtime and
// called session.clearStorageData() when profiles.json looked newer — which
// wiped EVERY saved deck, CSV draft, preset, theme and window layout on a
// routine restart (profiles.json is rewritten often; LevelDB flushes lazily,
// so the check misfired constantly). Renderer storage never mirrors
// profiles.json — profile state is IPC-served — so there is nothing to keep
// "in sync". Do not reintroduce a blanket clearStorageData() call.

app.whenReady().then(async () => {
  ensureLibrary();
  if (typeof MAIN_WINDOW_VITE_DEV_SERVER_URL === 'undefined' || !MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    registerAppProtocol();
  }
  registerMediaProtocol();
  registerLocalFileProtocol();
  registerLibraryIpc();
  registerDictionaryIpc();
  registerShellIpc();
  registerMediaIpc();
  registerProfileIpc();
  registerAnkiIpc();
  registerDesktopIpc();
  registerCityIpc();
  registerTranslateIpc();
  registerMiningIpc();
  registerImmersionIpc();
  registerSystemMetricsIpc();
  registerPopoutIpc();
  registerMiniWidgetIpc();
  registerLockscreenIpc();
  registerPlayerSyncIpc();
  configureCompanionHost({
    rendererUrl,
    forwardConsole: forwardRendererConsole,
    isDevServer: isDevServer(),
  });
  registerCompanionHostIpc();
  createWindow();
  // Provision + load offline dictionaries in the background so the window paints
  // immediately. Consumers that need glosses (mining, the pop-up) await
  // initYomitan() themselves, and a dict:updated event refreshes the UI.
  void initYomitan();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  // Companion host is skipTaskbar; still count as a window — close it so quit proceeds.
  closeCompanionHost();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
