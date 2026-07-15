import { app, BrowserWindow, protocol, net, shell, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import started from 'electron-squirrel-startup';
import { registerLibraryIpc, registerLocalFileProtocol, ensureLibrary, libraryRoot } from './main/library';
import { registerDictionaryIpc, initYomitan } from './main/dictionary';
import { registerMediaIpc } from './main/media';
import { registerProfileIpc } from './main/profiles';
import { registerAnkiIpc } from './main/anki';
import { registerApkgIpc } from './main/anki/apkgImport';
import { registerDesktopIpc } from './main/desktop';
import { registerCityIpc } from './main/city';
import { registerTranslateIpc } from './main/translate';
import { registerMiningIpc } from './main/mining';
import { registerImmersionIpc } from './main/immersion';
import { registerSystemMetricsIpc } from './main/systemMetrics';
import { registerReleaseIpc } from './main/release';
import { initDownloads, registerDownloadIpc } from './main/downloads';
import { registerMainI18nIpc } from './main/i18n';
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
  const rendererRoot = path.resolve(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}`);
  const publicRoot = app.isPackaged
    ? path.join(process.resourcesPath, 'public')
    : path.join(app.getAppPath(), 'public');

  const isUnder = (root: string, target: string): boolean => {
    const r = path.resolve(root);
    const t = path.resolve(target);
    return t === r || t.startsWith(r + path.sep);
  };

  protocol.handle('app', (request) => {
    try {
      const url = new URL(request.url);
      let rel = decodeURIComponent(url.pathname);
      if (!rel || rel === '/') rel = '/index.html';

      let resolved = path.join(rendererRoot, rel);
      if (!fs.existsSync(resolved)) {
        const pub = path.join(publicRoot, rel.replace(/^\//, ''));
        if (fs.existsSync(pub)) resolved = pub;
      }

      if (!isUnder(rendererRoot, resolved) && !isUnder(publicRoot, resolved)) {
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

const createWindow = (): void => {
  const mainWindow = new BrowserWindow({
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
    closeCompanionHost();
  });

  if (isDevServer()) {
    mainWindow.webContents.session.clearCache().finally(() => mainWindow.loadURL(rendererUrl()));
    mainWindow.webContents.openDevTools({ mode: 'detach' });
    forwardRendererConsole(mainWindow);
  } else {
    mainWindow.loadURL(rendererUrl());
  }
};

// Sections that may be detached into their own OS window. Mirrors the real apps
// in the desktop shell; excludes desktop-only trinkets (note/visualizer).
const POPOUT_SECTIONS = new Set([
  'library', 'novels', 'dictionary', 'grammar', 'translate', 'player', 'music',
  'anki', 'flashcards', 'stats', 'resources', 'city', 'musicwidget', 'immersion',
  'calendar',
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
  registerApkgIpc();
  registerDesktopIpc();
  registerCityIpc();
  registerTranslateIpc();
  registerMiningIpc();
  registerImmersionIpc();
  registerSystemMetricsIpc();
  registerReleaseIpc();
  registerDownloadIpc();
  registerMainI18nIpc();
  registerPopoutIpc();
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
  // Reconcile downloaded models against disk (and refresh the asset registry)
  // in the background — consumers ask isInstalled() before touching a model, so
  // a slow first pass degrades to "not installed yet", never to a crash.
  void initDownloads();

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
