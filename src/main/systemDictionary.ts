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
 * How the selection is captured without a native module: see
 * `companionContext.ts` — a kept-alive helper waits for the hotkey's modifiers
 * to be released, sends Ctrl+C to the foreground window, and the user's
 * previous clipboard is put back afterwards so the lookup is non-destructive.
 *
 * The hotkeys themselves (`companion.lookupSelection`,
 * `companion.lookupClipboard`) belong to the one global-command registry and
 * are rebound in Settings → Shortcuts; the chord set on this feature's old
 * settings page is carried there once (`legacyKeys`).
 *
 * This module also owns the tray icon, whose menu lists every companion
 * action with its current chord.
 *
 * Everything here is opt-out: a Settings toggle and a tray checkbox. Disabling
 * releases the lookup chord entirely.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  Tray,
  type MenuItemConstructorOptions,
} from 'electron';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { refuseWhileLocked } from './lockGuard';
import { createE2eTray, isE2eHeadless } from './e2eHeadless';
import {
  captureSelection,
  noteCompanionLookup,
  warmCompanionContext,
  type ForegroundInfo,
} from './companionContext';
import {
  getGlobalCommandChord,
  getGlobalCommandStatus,
  legacyChordResult,
  listGlobalCommands,
  onGlobalCommandsChanged,
  refreshGlobalCommands,
  registerGlobalCommand,
  runGlobalCommand,
  setGlobalCommandChord,
} from './globalCommands';
import { chordToAccelerator, COMPANION_COMMAND_ORDER, GLOBAL_COMMAND_DEFAULTS } from '../shared/globalCommands';
import { mt, onMainLangChanged } from './i18n';

export interface SystemDictionarySettings {
  enabled: boolean;
  /**
   * The chord this page used to own. Kept only so a chord chosen here before the
   * Shortcuts registry existed is carried over; the live chord is the registry's.
   */
  hotkey: string;
}

export interface SystemDictionaryStatus extends SystemDictionarySettings {
  /** Selection capture (SendKeys copy) is Windows-only; elsewhere it reads the clipboard. */
  supported: boolean;
  /** True when the global accelerator is currently held by us. */
  registered: boolean;
}

/** How the overlay should present a query. */
export type SysDictMode = 'auto' | 'translate';

export interface SysDictContext {
  mode: SysDictMode;
  sourceTitle?: string;
  sourceApp?: string;
}

const STATE_FILE = 'system-dictionary.json';
const LOOKUP_ID = 'companion.lookupSelection';
const CLIPBOARD_ID = 'companion.lookupClipboard';
// Ctrl+Alt+J is deliberately chosen to not collide with any in-app default
// binding (a global accelerator shadows the in-app one even while focused).
const DEFAULTS: SystemDictionarySettings = {
  enabled: true,
  hotkey: GLOBAL_COMMAND_DEFAULTS[LOOKUP_ID] ?? 'Ctrl+Alt+J',
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
let settingsLoaded = false;
let started = false;
let commandsRegistered = false;
let overlay: BrowserWindow | null = null;
let tray: Tray | null = null;
let offCommandsChanged: (() => void) | null = null;
let offLangChanged: (() => void) | null = null;
/** Last captured text, handed to the overlay renderer once it has loaded. */
let pendingQuery = '';
let pendingContext: SysDictContext = { mode: 'auto' };

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
    const parsed = readJsonSync<Partial<SystemDictionarySettings>>(statePath(), {}, {
      validate: (v) => typeof v === 'object' && v !== null,
    });
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

function ensureSettings(): void {
  if (settingsLoaded) return;
  settings = loadSettings();
  settingsLoaded = true;
}

function saveSettings(): void {
  try {
    writeJsonAtomicSync(statePath(), settings);
  } catch (err) {
    console.error('[systemDictionary] failed to persist settings', err);
  }
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

function contextFor(source: ForegroundInfo | null | undefined, mode: SysDictMode): SysDictContext {
  return {
    mode,
    ...(source?.title ? { sourceTitle: source.title } : {}),
    ...(source?.process ? { sourceApp: source.process } : {}),
  };
}

/**
 * Float the popup dictionary (or, for a sentence or `mode: 'translate'`, the
 * translator) on `text`, beside the cursor, over whatever app is in front.
 */
export function lookUpText(
  text: string,
  opts: { mode?: SysDictMode; source?: ForegroundInfo | null } = {},
): boolean {
  const query = text.slice(0, 500);
  if (!query.trim()) return false;
  // A dictionary popup over another app is study content (lockGuard.ts).
  if (refuseWhileLocked('window:lookup')) return false;
  pendingQuery = query;
  pendingContext = contextFor(opts.source, opts.mode ?? 'auto');
  noteCompanionLookup({
    text: query,
    ...(pendingContext.sourceTitle ? { sourceTitle: pendingContext.sourceTitle } : {}),
    ...(pendingContext.sourceApp ? { sourceApp: pendingContext.sourceApp } : {}),
  });
  const { x, y } = placeAtCursor();

  if (overlay && !overlay.isDestroyed()) {
    overlay.setBounds({ x, y, width: OVERLAY_W, height: OVERLAY_H });
    overlay.webContents.send('sysdict:query', query);
    overlay.show();
    overlay.focus();
    return true;
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
  return true;
}

function hideOverlay(): void {
  if (overlay && !overlay.isDestroyed()) overlay.hide();
}

// ---- Triggers -----------------------------------------------------------

/**
 * Copy the selection out of the app in front (or out of `target`, when the
 * radial wheel is in front) and look it up.
 */
export async function lookUpSelection(
  opts: { target?: ForegroundInfo | null; mode?: SysDictMode } = {},
): Promise<boolean> {
  const captured = await captureSelection(opts.target);
  if (!captured.text) return false;
  return lookUpText(captured.text, { mode: opts.mode, source: captured.source ?? opts.target });
}

export function lookUpClipboard(source?: ForegroundInfo | null): boolean {
  const text = clipboard.readText().trim();
  return text ? lookUpText(text, { source }) : false;
}

// ---- Global commands -----------------------------------------------------

function ensureCommands(): void {
  if (commandsRegistered) return;
  commandsRegistered = true;
  ensureSettings();
  registerGlobalCommand(LOOKUP_ID, () => lookUpSelection().then(() => undefined), {
    available: () => started && settings.enabled,
    legacyKeys: () => settings.hotkey,
  });
  registerGlobalCommand(CLIPBOARD_ID, () => {
    lookUpClipboard();
  }, {
    available: () => started,
  });
}

function applyEnabledState(): { ok: boolean; error?: string } {
  refreshGlobalCommands();
  if (!settings.enabled) hideOverlay();
  const status = getGlobalCommandStatus(LOOKUP_ID);
  return settings.enabled ? legacyChordResult(status) : { ok: true };
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

/** A command's label in the UI language (`commands.<id>`, then `cmd.<id>`). */
function commandLabel(id: string): string {
  for (const key of [`commands.${id}`, `cmd.${id}`]) {
    const out = mt(key);
    if (out !== key) return out;
  }
  return id;
}

/**
 * One menu row per companion action (and per command another feature added,
 * such as live captions), each showing the chord it is bound to right now.
 * The chord is display-only here (`registerAccelerator: false`): the registry
 * already holds it with Windows.
 */
export function companionMenuItems(): MenuItemConstructorOptions[] {
  const statuses = listGlobalCommands();
  const byId = new Map(statuses.map((s) => [s.id, s]));
  const extra = statuses
    .filter((s) => !COMPANION_COMMAND_ORDER.includes(s.id) && !(s.id in GLOBAL_COMMAND_DEFAULTS))
    .map((s) => s.id);
  return [...COMPANION_COMMAND_ORDER, ...extra]
    .map((id) => byId.get(id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s?.hasHandler))
    .map((s) => {
      const parsed = chordToAccelerator(s.chord);
      const accelerator = parsed.ok ? parsed.accelerator : '';
      return {
        id: `companion:${s.id}`,
        label: commandLabel(s.id),
        enabled: s.available,
        ...(accelerator ? { accelerator, registerAccelerator: false } : {}),
        click: () => {
          runGlobalCommand(s.id);
        },
      };
    });
}

/**
 * App-shell rows (Open Blanc, Record a region, Keep running in the tray…) that
 * main.ts adds to this one tray instead of creating a second icon.
 */
let appTrayItems: (() => Electron.MenuItemConstructorOptions[]) | null = null;

function appTrayRows(): Electron.MenuItemConstructorOptions[] {
  if (!appTrayItems) return [];
  try {
    return appTrayItems();
  } catch (err) {
    console.error('[systemDictionary] app tray rows failed', err);
    return [];
  }
}

export function setAppTrayItems(provider: (() => Electron.MenuItemConstructorOptions[]) | null): void {
  appTrayItems = provider;
  refreshTrayMenu();
}

/** Rebuild the tray menu (an app-shell row's state changed). */
export function refreshAppTray(): void {
  refreshTrayMenu();
}

function refreshTrayMenu(): void {
  if (!tray) return;
  const chord = getGlobalCommandChord(LOOKUP_ID);
  const menu = Menu.buildFromTemplate([
    { label: mt('companion.tray.title'), submenu: companionMenuItems() },
    // The Region Recorder (main/regionRecorder.ts), through its global command.
    { label: mt('recorder.tray.record'), click: () => { runGlobalCommand('recorder.region'); } },
    { type: 'separator' },
    {
      label: mt('companion.tray.enableLookup'),
      type: 'checkbox',
      checked: settings.enabled,
      click: () => setEnabled(!settings.enabled),
    },
    { label: mt('companion.tray.shortcuts'), click: () => openShortcutSettings() },
    { type: 'separator' },
    { label: mt('companion.tray.open'), click: () => runGlobalCommand('app.focus') || focusMainWindow() },
    ...appTrayRows(),
    { label: mt('companion.tray.quit'), click: () => app.quit() },
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip(
    settings.enabled && chord
      ? mt('companion.tray.tooltipOn', { chord })
      : mt('companion.tray.tooltipOff'),
  );
}

function focusMainWindow(): void {
  const win = BrowserWindow.getAllWindows().find((w) => w !== overlay && !w.isDestroyed());
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

/** Settings → Shortcuts, filtered to the companion group. */
function openShortcutSettings(): void {
  runGlobalCommand('app.focus') || focusMainWindow();
  for (const w of BrowserWindow.getAllWindows()) {
    if (w !== overlay && !w.isDestroyed()) w.webContents.send('companion:openShortcuts', 'Companion');
  }
}

function ensureTray(): void {
  if (tray) return;
  try {
    // The e2e harness runs on the owner's desktop: no notification-area icon. Its
    // stand-in keeps the menu so the harness can click the rows (e2eHeadless.ts).
    tray = isE2eHeadless() ? (createE2eTray() as unknown as Tray) : new Tray(loadTrayIcon());
  } catch (err) {
    console.error('[systemDictionary] tray creation failed', err);
    tray = null;
    return;
  }
  // A left click used to send Ctrl+C — to the taskbar, which had focus by then.
  // It opens the companion menu instead, which is where every action lives.
  tray.on('click', () => tray?.popUpContextMenu());
  // Double-click opens Gum, as every Windows tray app does (and the only way
  // back to a window hidden by "Keep running in the tray").
  tray.on('double-click', () => {
    if (!runGlobalCommand('app.focus')) focusMainWindow();
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
  const res = legacyChordResult(setGlobalCommandChord(LOOKUP_ID, next));
  refreshTrayMenu();
  broadcastSettings();
  return res;
}

function getStatus(): SystemDictionaryStatus {
  return {
    enabled: settings.enabled,
    hotkey: getGlobalCommandChord(LOOKUP_ID),
    supported: process.platform === 'win32',
    registered: getGlobalCommandStatus(LOOKUP_ID)?.registered === true,
  };
}

// ---- Lifecycle ----------------------------------------------------------

export function startSystemDictionary(): void {
  settings = loadSettings();
  settingsLoaded = true;
  started = true;
  ensureCommands();
  ensureTray();
  applyEnabledState();
  offCommandsChanged ??= onGlobalCommandsChanged(() => refreshTrayMenu());
  offLangChanged ??= onMainLangChanged(() => refreshTrayMenu());
  refreshTrayMenu();
  // The selection helper boots PowerShell once, off the hotkey's critical path.
  warmCompanionContext();
}

export function stopSystemDictionary(): void {
  started = false;
  refreshGlobalCommands();
  offCommandsChanged?.();
  offCommandsChanged = null;
  offLangChanged?.();
  offLangChanged = null;
  if (overlay && !overlay.isDestroyed()) overlay.destroy();
  overlay = null;
  if (tray) {
    tray.destroy();
    tray = null;
  }
}

export function registerSystemDictionaryIpc(): void {
  ensureCommands();
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
  ipcMain.handle('sysdict:getContext', (): SysDictContext => pendingContext);
  ipcMain.handle('sysdict:close', (): void => hideOverlay());
  ipcMain.handle('sysdict:lookupClipboard', (): void => {
    lookUpClipboard();
  });
}
