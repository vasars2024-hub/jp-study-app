/**
 * System-wide popup dictionary (Windows).
 *
 * The in-app GlobalDictionaryOverlay covers "everywhere inside the Study OS".
 * This module extends the same dictionary popup to the *whole operating
 * system*: a global hotkey grabs whatever text is selected in ANY Windows
 * application (browser, PDF viewer, game, Notepad …), then floats the
 * dictionary popup as a small always-on-top overlay window — even when the
 * Study OS window is minimized.
 *
 * How the selection is captured without a native module: on the hotkey we
 * synthesize Ctrl+C into the foreground window (PowerShell SendKeys), read the
 * clipboard, then restore the user's previous clipboard so the lookup is
 * non-destructive. If nothing new was copied we fall back to whatever is
 * already on the clipboard.
 *
 * Everything here is opt-out: a Settings toggle, a tray checkbox, and the
 * hotkey itself. Disabling unregisters the global shortcut entirely.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
} from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

export interface SystemDictionarySettings {
  enabled: boolean;
  /** Accelerator in the app's chord format, e.g. "Ctrl+Shift+D". */
  hotkey: string;
}

export interface SystemDictionaryStatus extends SystemDictionarySettings {
  /** Selection capture (SendKeys copy) is Windows-only; elsewhere it reads the clipboard. */
  supported: boolean;
  /** True when the global accelerator is currently held by us. */
  registered: boolean;
}

const STATE_FILE = 'system-dictionary.json';
// Ctrl+Alt+J is deliberately chosen to not collide with any in-app default
// binding (a global accelerator shadows the in-app one even while focused).
const DEFAULTS: SystemDictionarySettings = {
  enabled: true,
  hotkey: 'Ctrl+Alt+J',
};

const OVERLAY_W = 372;
const OVERLAY_H = 468;

type RendererUrlFn = (query?: string) => string;
type ForwardConsoleFn = (win: BrowserWindow) => void;
type NavGuardFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let forwardConsole: ForwardConsoleFn | null = null;
let attachNavGuards: NavGuardFn | null = null;
let isDev = false;

let settings: SystemDictionarySettings = { ...DEFAULTS };
let currentAccelerator: string | null = null;
let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
/** Last captured text, handed to the overlay renderer once it has loaded. */
let pendingQuery = '';

export function configureSystemDictionary(opts: {
  rendererUrl: RendererUrlFn;
  forwardConsole?: ForwardConsoleFn;
  attachNavGuards?: NavGuardFn;
  isDevServer: boolean;
}): void {
  getRendererUrl = opts.rendererUrl;
  forwardConsole = opts.forwardConsole ?? null;
  attachNavGuards = opts.attachNavGuards ?? null;
  isDev = opts.isDevServer;
}

// ---- Persistence --------------------------------------------------------

function statePath(): string {
  return path.join(app.getPath('userData'), STATE_FILE);
}

function loadSettings(): SystemDictionarySettings {
  try {
    const raw = fs.readFileSync(statePath(), 'utf8');
    const parsed = JSON.parse(raw) as Partial<SystemDictionarySettings>;
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      hotkey:
        typeof parsed.hotkey === 'string' && parsed.hotkey.trim()
          ? parsed.hotkey.trim()
          : DEFAULTS.hotkey,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(): void {
  try {
    fs.writeFileSync(statePath(), JSON.stringify(settings, null, 2), 'utf8');
  } catch (err) {
    console.error('[systemDictionary] failed to persist settings', err);
  }
}

// ---- Selection capture --------------------------------------------------

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Synthesize Ctrl+C into the currently focused (foreground) window. Windows only. */
function sendCopyKeystroke(): Promise<void> {
  if (process.platform !== 'win32') return Promise.resolve();
  return new Promise((resolve) => {
    try {
      const child = spawn(
        'powershell.exe',
        [
          '-NoProfile',
          '-NonInteractive',
          '-STA',
          '-Command',
          "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^c')",
        ],
        { windowsHide: true, stdio: 'ignore' },
      );
      child.on('exit', () => resolve());
      child.on('error', () => resolve());
    } catch {
      resolve();
    }
  });
}

/**
 * Grab the foreground selection: copy it, read it, then restore the user's
 * original clipboard so we never clobber it. Falls back to the existing
 * clipboard text when the copy produced nothing new.
 */
async function captureSelection(): Promise<string> {
  const before = clipboard.readText();
  await sendCopyKeystroke();
  await delay(160);
  const after = clipboard.readText();
  if (after && after !== before) {
    // Restore shortly after so downstream paste actions still see the user's data.
    setTimeout(() => {
      try {
        clipboard.writeText(before);
      } catch {
        /* ignore */
      }
    }, 350);
    return after.trim();
  }
  return before.trim();
}

// ---- Overlay window -----------------------------------------------------

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function placeAtCursor(): { x: number; y: number } {
  const cursor = screen.getCursorScreenPoint();
  const area = screen.getDisplayNearestPoint(cursor).workArea;
  const x = Math.min(Math.max(area.x, cursor.x + 12), area.x + area.width - OVERLAY_W - 4);
  const y = Math.min(Math.max(area.y, cursor.y + 16), area.y + area.height - OVERLAY_H - 4);
  return { x: Math.round(x), y: Math.round(y) };
}

function showOverlay(text: string): void {
  const query = text.slice(0, 500);
  if (!query.trim()) return;
  pendingQuery = query;
  const { x, y } = placeAtCursor();

  if (overlay && !overlay.isDestroyed()) {
    overlay.setBounds({ x, y, width: OVERLAY_W, height: OVERLAY_H });
    overlay.webContents.send('sysdict:query', query);
    overlay.show();
    overlay.focus();
    return;
  }

  overlay = new BrowserWindow({
    width: OVERLAY_W,
    height: OVERLAY_H,
    x,
    y,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      backgroundThrottling: false,
    },
  });

  const win = overlay;
  // Float above full-screen apps / the taskbar so a global lookup is never hidden.
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  attachNavGuards?.(win);
  if (isDev) forwardConsole?.(win);

  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) {
      win.show();
      win.focus();
    }
  });
  // Dismiss like a real popup when focus moves elsewhere. Keep the window alive
  // (hidden) so the next lookup reuses it instead of paying window-boot cost.
  win.on('blur', () => {
    if (win && !win.isDestroyed()) win.hide();
  });
  win.on('closed', () => {
    overlay = null;
  });
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed()) win.webContents.send('sysdict:query', pendingQuery);
  });

  void win.loadURL(getRendererUrl('sysDict=1'));
}

function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

// ---- Triggers -----------------------------------------------------------

async function triggerFromSelection(): Promise<void> {
  const text = await captureSelection();
  if (text) showOverlay(text);
}

function triggerFromClipboard(): void {
  const text = clipboard.readText().trim();
  if (text) showOverlay(text);
}

// ---- Global shortcut ----------------------------------------------------

function toAccelerator(chord: string): string {
  // Chord format is "Ctrl+Shift+D" (alternatives split by "|"); register the
  // first alternative only. Electron uses "Super" where the app says "Meta".
  return chord.split('|')[0]!.trim().replace(/\bMeta\b/g, 'Super');
}

function unregisterShortcut(): void {
  if (currentAccelerator) {
    try {
      globalShortcut.unregister(currentAccelerator);
    } catch {
      /* already gone */
    }
    currentAccelerator = null;
  }
}

function registerShortcut(): { ok: boolean; error?: string } {
  unregisterShortcut();
  const accelerator = toAccelerator(settings.hotkey);
  if (!/^([\w]+\+)+[\w,.;'[\]/\\`=-]+$/.test(accelerator)) {
    return { ok: false, error: 'This shortcut cannot be registered system-wide.' };
  }
  if (!/(Ctrl|Alt|Shift|Super|CmdOrCtrl)\+/i.test(accelerator)) {
    return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
  }
  try {
    const registered = globalShortcut.register(accelerator, () => {
      void triggerFromSelection();
    });
    if (!registered) {
      return { ok: false, error: `"${accelerator}" is already in use by another application.` };
    }
    currentAccelerator = accelerator;
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : 'Could not register the global shortcut.',
    };
  }
}

function applyEnabledState(): { ok: boolean; error?: string } {
  if (settings.enabled) return registerShortcut();
  unregisterShortcut();
  hideOverlay();
  return { ok: true };
}

// ---- Tray ---------------------------------------------------------------

function loadTrayIcon(): Electron.NativeImage {
  const rel = ['public', 'tray-icon.png'];
  const candidates = [
    app.isPackaged ? path.join(process.resourcesPath, ...rel) : path.join(app.getAppPath(), ...rel),
    app.isPackaged
      ? path.join(process.resourcesPath, 'public', 'tray-icon.png')
      : path.join(app.getAppPath(), 'assets', 'icon.png'),
  ];
  for (const p of candidates) {
    try {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img.resize({ width: 16, height: 16 });
    } catch {
      /* try next */
    }
  }
  return nativeImage.createEmpty();
}

function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => w !== overlay && !w.isDestroyed());
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const menu = Menu.buildFromTemplate([
    {
      label: settings.enabled ? 'Popup dictionary: on' : 'Popup dictionary: off',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Enable system-wide lookup',
      type: 'checkbox',
      checked: settings.enabled,
      click: () => setEnabled(!settings.enabled),
    },
    {
      label: `Look up selection  (${settings.hotkey})`,
      enabled: settings.enabled,
      click: () => {
        void triggerFromSelection();
      },
    },
    {
      label: 'Look up clipboard text',
      click: () => triggerFromClipboard(),
    },
    { type: 'separator' },
    { label: 'Open Study OS', click: () => focusMainWindow() },
    { label: 'Quit', click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(
    settings.enabled
      ? `Popup dictionary — press ${settings.hotkey} anywhere`
      : 'Popup dictionary (off)',
  );
}

function ensureTray(): void {
  if (tray) return;
  try {
    tray = new Tray(loadTrayIcon());
  } catch (err) {
    console.error('[systemDictionary] tray creation failed', err);
    tray = null;
    return;
  }
  // Left-click grabs the current selection, same as the hotkey.
  tray.on('click', () => {
    if (settings.enabled) void triggerFromSelection();
    else triggerFromClipboard();
  });
  refreshTrayMenu();
}

// ---- Public state changes ----------------------------------------------

function broadcastSettings(): void {
  const status = getStatus();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('sysdict:settings-changed', status);
  }
}

function setEnabled(on: boolean): { ok: boolean; error?: string } {
  settings.enabled = on;
  saveSettings();
  const res = applyEnabledState();
  refreshTrayMenu();
  broadcastSettings();
  return res;
}

function setHotkey(hotkey: string): { ok: boolean; error?: string } {
  const next = String(hotkey || '').trim();
  if (!next) return { ok: false, error: 'Enter a shortcut.' };
  settings.hotkey = next;
  saveSettings();
  const res = applyEnabledState();
  refreshTrayMenu();
  broadcastSettings();
  return res;
}

function getStatus(): SystemDictionaryStatus {
  return {
    ...settings,
    supported: process.platform === 'win32',
    registered: currentAccelerator !== null,
  };
}

// ---- Lifecycle ----------------------------------------------------------

export function startSystemDictionary(): void {
  settings = loadSettings();
  ensureTray();
  applyEnabledState();
  refreshTrayMenu();
}

export function stopSystemDictionary(): void {
  unregisterShortcut();
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function registerSystemDictionaryIpc(): void {
  ipcMain.handle('sysdict:getSettings', (): SystemDictionaryStatus => getStatus());
  ipcMain.handle('sysdict:setEnabled', (_e, on: unknown): SystemDictionaryStatus => {
    setEnabled(on === true);
    return getStatus();
  });
  ipcMain.handle(
    'sysdict:setHotkey',
    (_e, hotkey: unknown): { ok: boolean; error?: string; status: SystemDictionaryStatus } => {
      const res = setHotkey(typeof hotkey === 'string' ? hotkey : '');
      return { ...res, status: getStatus() };
    },
  );
  ipcMain.handle('sysdict:getPending', (): string => pendingQuery);
  ipcMain.handle('sysdict:close', (): void => hideOverlay());
  ipcMain.handle('sysdict:lookupClipboard', (): void => triggerFromClipboard());
}
