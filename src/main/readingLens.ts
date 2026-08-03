/**
 * Reading Lens — the OS-wide Japanese reader surface.
 *
 * One transparent, always-on-top, click-through window is stretched over the
 * display under the cursor. It has states (Selecting → Scanning → Reading …):
 * the user drags a region, we OCR it (`screenOcr.ts`), and the renderer paints
 * an interactive hotspot over each detected line so the dictionary works *in
 * place* over any app — a visual novel, a game, a PDF, a video.
 *
 * Pass-through: while Reading, the window ignores mouse events (forwarding them
 * to the app underneath) and the renderer flips interactivity on per hotspot via
 * `lens:setInteractive`, exactly like `companionHost.ts`. While Selecting, the
 * window captures the mouse so the region can be drawn.
 *
 * Activation is a global hotkey with tap vs. double-tap intent (Electron's
 * globalShortcut exposes no key-up, so true press-and-hold is approximated by
 * "press → draw with the mouse", which is the natural snip interaction anyway).
 */

import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
} from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { ocrRegion, type LensOcrResult, type RegionRect } from './screenOcr';

export interface ReadingLensSettings {
  enabled: boolean;
  /** Accelerator in the app's chord format, e.g. "Ctrl+Alt+Space". */
  hotkey: string;
}

export interface ReadingLensStatus extends ReadingLensSettings {
  supported: boolean;
  registered: boolean;
  open: boolean;
}

export type LensOpenMode = 'select' | 'auto';

export interface LensInit {
  /** The window covers this display; renderer coords are display-local DIP. */
  bounds: Electron.Rectangle;
  mode: LensOpenMode;
  scaleFactor: number;
}

const STATE_FILE = 'reading-lens.json';
// Ctrl+Shift+Space avoids the Windows system menu that bare Alt+Space opens and
// tends to be free (Ctrl+Alt+<key> combos are widely claimed by IMEs and vendor
// utilities). If it is taken, the Settings section lets the user rebind and the
// failure is surfaced rather than swallowed.
const DEFAULTS: ReadingLensSettings = { enabled: true, hotkey: 'Ctrl+Shift+Space' };
const DOUBLE_TAP_MS = 350;

type RendererUrlFn = (query?: string) => string;
type ForwardConsoleFn = (win: BrowserWindow) => void;
type NavGuardFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let forwardConsole: ForwardConsoleFn | null = null;
let attachNavGuards: NavGuardFn | null = null;
let isDev = false;

let settings: ReadingLensSettings = { ...DEFAULTS };
let currentAccelerator: string | null = null;
let lens: BrowserWindow | null = null;
let lensDisplayId = 0;
let lastTriggerAt = 0;
let pendingInit: LensInit | null = null;

export function configureReadingLens(opts: {
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

function loadSettings(): ReadingLensSettings {
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath(), 'utf8')) as Partial<ReadingLensSettings>;
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
    console.error('[readingLens] failed to persist settings', err);
  }
}

// ---- Window -------------------------------------------------------------

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

function displayUnderCursor(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function openLens(mode: LensOpenMode): void {
  const display = displayUnderCursor();
  lensDisplayId = display.id;
  const bounds = display.bounds;
  pendingInit = { bounds, mode, scaleFactor: display.scaleFactor || 1 };

  if (lens && !lens.isDestroyed()) {
    lens.setBounds(bounds);
    // Selecting needs the mouse; the renderer relaxes to click-through once pinned.
    lens.setIgnoreMouseEvents(false);
    lens.webContents.send('lens:open', pendingInit);
    lens.show();
    lens.focus();
    return;
  }

  lens = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    movable: false,
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

  const win = lens;
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
  win.on('closed', () => {
    lens = null;
  });
  win.webContents.on('did-finish-load', () => {
    if (!win.isDestroyed() && pendingInit) win.webContents.send('lens:open', pendingInit);
  });

  void win.loadURL(getRendererUrl('readingLens=1'));
}

function closeLens(): void {
  if (lens && !lens.isDestroyed()) lens.hide();
}

// ---- Activation ---------------------------------------------------------

function trigger(): void {
  const now = Date.now();
  const isDoubleTap = now - lastTriggerAt < DOUBLE_TAP_MS;
  lastTriggerAt = now;
  openLens(isDoubleTap ? 'auto' : 'select');
}

// ---- Global shortcut ----------------------------------------------------

function toAccelerator(chord: string): string {
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
  if (!/(Ctrl|Alt|Shift|Super|CmdOrCtrl)\+/i.test(accelerator)) {
    return { ok: false, error: 'Global shortcuts need at least one modifier key.' };
  }
  try {
    const ok = globalShortcut.register(accelerator, () => trigger());
    if (!ok) return { ok: false, error: `"${accelerator}" is already in use by another application.` };
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
  closeLens();
  return { ok: true };
}

function getStatus(): ReadingLensStatus {
  return {
    ...settings,
    supported: process.platform === 'win32',
    registered: currentAccelerator !== null,
    open: !!(lens && !lens.isDestroyed() && lens.isVisible()),
  };
}

function broadcastSettings(): void {
  const status = getStatus();
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('lens:settings-changed', status);
  }
}

// ---- Lifecycle ----------------------------------------------------------

export function startReadingLens(): void {
  settings = loadSettings();
  const res = applyEnabledState();
  if (settings.enabled && !res.ok) {
    // A busy accelerator is a normal outcome — surface it so it is diagnosable
    // instead of a mysteriously dead hotkey. The Settings section lets the user
    // pick a free one; the programmatic open path still works meanwhile.
    console.warn(`[readingLens] hotkey "${settings.hotkey}" not registered: ${res.error ?? 'unknown'}`);
  }
}

export function stopReadingLens(): void {
  unregisterShortcut();
  if (lens && !lens.isDestroyed()) lens.destroy();
  lens = null;
}

export function registerReadingLensIpc(): void {
  ipcMain.handle('lens:getSettings', (): ReadingLensStatus => getStatus());

  ipcMain.handle('lens:setEnabled', (_e, on: unknown): ReadingLensStatus => {
    settings.enabled = on === true;
    saveSettings();
    applyEnabledState();
    broadcastSettings();
    return getStatus();
  });

  ipcMain.handle(
    'lens:setHotkey',
    (_e, hotkey: unknown): { ok: boolean; error?: string; status: ReadingLensStatus } => {
      const next = String(hotkey ?? '').trim();
      if (!next) return { ok: false, error: 'Enter a shortcut.', status: getStatus() };
      settings.hotkey = next;
      saveSettings();
      const res = applyEnabledState();
      broadcastSettings();
      return { ...res, status: getStatus() };
    },
  );

  // Programmatic open (Settings button / testing) mirrors the hotkey path.
  ipcMain.handle('lens:open', (_e, mode: unknown): void => {
    openLens(mode === 'auto' ? 'auto' : 'select');
  });

  ipcMain.handle('lens:getInit', (): LensInit | null => pendingInit);

  ipcMain.handle('lens:ocr', async (_e, region: unknown): Promise<LensOcrResult> => {
    const r = (region ?? {}) as Partial<RegionRect> & {
      engine?: 'auto' | 'manga' | 'web';
      includeScreenshot?: boolean;
    };
    const rect: RegionRect = {
      x: Number(r.x) || 0,
      y: Number(r.y) || 0,
      width: Number(r.width) || 0,
      height: Number(r.height) || 0,
    };
    return ocrRegion(rect, lensDisplayId, {
      engine: r.engine ?? 'auto',
      includeScreenshot: r.includeScreenshot === true,
    });
  });

  // Renderer toggles pass-through: interactive over hotspots/chrome, click-through
  // everywhere else so the app underneath keeps receiving the mouse.
  ipcMain.on('lens:setInteractive', (e, interactive: unknown) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return;
    if (interactive === true) win.setIgnoreMouseEvents(false);
    else win.setIgnoreMouseEvents(true, { forward: true });
  });

  ipcMain.handle('lens:close', (): void => closeLens());
}
