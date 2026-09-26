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
 *
 * The hotkeys (`lens.region`, `lens.auto`, `lens.repeat`, `lens.clipboard`,
 * `lens.atCursor`) belong to the one global-command registry
 * (`globalCommands.ts`) and are rebound in Settings → Shortcuts. The chord set
 * on the Lens's own settings page before that is carried over once
 * (`legacyKeys`); `settings.hotkey` is kept for that and nothing else.
 */

import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  screen,
} from 'electron';
import path from 'node:path';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { ocrClipboardImage, ocrRegion, type LensOcrResult, type RegionRect } from './screenOcr';
import {
  getGlobalCommandChord,
  getGlobalCommandStatus,
  legacyChordResult,
  refreshGlobalCommands,
  registerGlobalCommand,
  setGlobalCommandChord,
} from './globalCommands';
import { quickForegroundInfo, type ForegroundInfo } from './companionContext';
import { getMainStudyLang } from './studyLanguage';
import {
  clearCaptures,
  getRetentionDays,
  listCaptures,
  recordCapture,
  removeCapture,
  setCapturePinned,
  setRetentionDays,
} from './readingLensHistory';
import type {
  ReadingLensHistoryEntry,
  ReadingLensRetentionDays,
} from '../shared/readingLensHistory';
import type { ReadingLensCapture } from '../shared/readingLens';
import {
  READING_LENS_ENGINE_DEFAULT,
  normalizeReadingLensEngine,
  type ReadingLensEngine,
  type ReadingLensEngineStatus,
} from '../shared/readingLensEngine';
import { installedPaddleLangs, paddleOcrAvailable } from './paddleOcr';
import { mangaOcrAvailable } from './mangaOcr';
import { createReadingLensClipboardCapture } from './readingLensClipboard';
import { registerLexiconHandoffIpc } from './lexiconHandoff';
import { registerReadingPassageHandoffIpc } from './readingPassageHandoff';

/**
 * The last region OCR'd, kept so `repeat` can re-scan it without a drag.
 *
 * `displayId` is part of the memory rather than an afterthought: renderer
 * coordinates are display-local DIP, so the same rectangle means a different
 * place on a different monitor. A region whose display is gone is not replayed
 * anywhere — it is dropped and the open degrades to an ordinary selection.
 */
export interface LensRegionMemory {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ReadingLensSettings {
  enabled: boolean;
  /** Accelerator in the app's chord format, e.g. "Ctrl+Alt+Space". */
  hotkey: string;
  lastRegion: LensRegionMemory | null;
  /**
   * Which recognizer a fresh scan asks for. Carried into `LensInit` rather than
   * fetched by the overlay over a second IPC: the lens window is created and
   * scanning within the same tick as the hotkey, so a round trip the renderer
   * had to await would let the first capture of a session run on the wrong
   * engine and only settle from the second one onward.
   */
  defaultEngine: ReadingLensEngine;
}

export interface ReadingLensStatus extends ReadingLensSettings {
  supported: boolean;
  registered: boolean;
  open: boolean;
  /** True only when `lastRegion` is replayable on a display that still exists. */
  canRepeatRegion: boolean;
}

/**
 * `cursor` is "look up the word under the cursor": a small box around the
 * pointer is read straight away and the word at the pointer opens — the
 * OS-wide stand-in for the Chrome extension's hover lookup, which needs a
 * page to hook and has no equivalent for a game or a video.
 */
export type LensOpenMode = 'select' | 'auto' | 'clipboard' | 'repeat' | 'cursor';

/** The box `cursor` reads around the pointer, in DIP. */
export const CURSOR_BOX = { width: 420, height: 132 } as const;

export interface LensInit {
  /** The window covers this display; renderer coords are display-local DIP. */
  bounds: Electron.Rectangle;
  mode: LensOpenMode;
  scaleFactor: number;
  /**
   * The recognizer a fresh scan in this session should ask for. Always present,
   * always one of the three — the overlay must never have to invent a fallback,
   * because a fallback it invented would silently disagree with what Settings
   * says the default is.
   */
  defaultEngine: ReadingLensEngine;
  /** Present only for an explicit clipboard open; never populated by a screen scan. */
  capture?: ReadingLensCapture;
  /**
   * Present only on a `repeat` that had a replayable region. A `repeat` with
   * nothing to replay arrives as `mode: 'select'` instead, so the renderer is
   * never asked to invent a rectangle.
   */
  region?: { x: number; y: number; width: number; height: number };
  /** `cursor` only: the pointer, relative to `region`, whose word opens once the read lands. */
  point?: { x: number; y: number };
  /** The app the lens was opened over (its window title), for a mined card's source. */
  sourceTitle?: string;
  sourceApp?: string;
  /** `clipboard` with a picture on it that OCR could not read. */
  clipboardImageFailed?: boolean;
}

const STATE_FILE = 'reading-lens.json';
// Ctrl+Shift+Space avoids the Windows system menu that bare Alt+Space opens and
// tends to be free (Ctrl+Alt+<key> combos are widely claimed by IMEs and vendor
// utilities). If it is taken, the Settings section lets the user rebind and the
// failure is surfaced rather than swallowed.
const DEFAULTS: ReadingLensSettings = {
  enabled: true,
  hotkey: 'Ctrl+Shift+Space',
  lastRegion: null,
  defaultEngine: READING_LENS_ENGINE_DEFAULT,
};
/** Matches the renderer's `MIN_REGION`; below it a drag is a stray click. */
const MIN_REGION = 12;
const DOUBLE_TAP_MS = 350;

type RendererUrlFn = (query?: string) => string;
type ForwardConsoleFn = (win: BrowserWindow) => void;
type NavGuardFn = (win: BrowserWindow) => void;

let getRendererUrl: RendererUrlFn = () => 'app://bundle/index.html';
let forwardConsole: ForwardConsoleFn | null = null;
let attachNavGuards: NavGuardFn | null = null;
let isDev = false;

let settings: ReadingLensSettings = { ...DEFAULTS };
let settingsLoaded = false;
let started = false;
let commandsRegistered = false;
let lens: BrowserWindow | null = null;
/** How the lens was last opened: a `cursor` read must not replace the remembered region. */
let openedMode: LensOpenMode = 'select';
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

/**
 * A stored region is re-validated on every read rather than trusted.
 *
 * The file is user-writable JSON and survives across app versions, so a
 * negative, fractional or absurd rectangle would otherwise reach `ocrRegion`
 * and be captured as a garbage screenshot. Anything that fails is dropped to
 * `null`, which the callers read as "nothing to repeat".
 */
export function normalizeLensRegionMemory(value: unknown): LensRegionMemory | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const r = value as Record<string, unknown>;
  const int = (key: string): number | null => {
    const n = Number(r[key]);
    return Number.isFinite(n) ? Math.round(n) : null;
  };
  const displayId = int('displayId');
  const x = int('x');
  const y = int('y');
  const width = int('width');
  const height = int('height');
  if (displayId === null || x === null || y === null || width === null || height === null) return null;
  if (displayId <= 0 || x < 0 || y < 0) return null;
  if (width < MIN_REGION || height < MIN_REGION) return null;
  return { displayId, x, y, width, height };
}

function ensureSettings(): void {
  if (settingsLoaded) return;
  settings = loadSettings();
  settingsLoaded = true;
}

function loadSettings(): ReadingLensSettings {
  try {
    const parsed = readJsonSync<Partial<ReadingLensSettings>>(statePath(), {}, {
      validate: (v) => typeof v === 'object' && v !== null,
    });
    return {
      enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULTS.enabled,
      hotkey:
        typeof parsed.hotkey === 'string' && parsed.hotkey.trim()
          ? parsed.hotkey.trim()
          : DEFAULTS.hotkey,
      lastRegion: normalizeLensRegionMemory(parsed.lastRegion),
      defaultEngine: normalizeReadingLensEngine(parsed.defaultEngine),
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(): void {
  try {
    writeJsonAtomicSync(statePath(), settings);
  } catch (err) {
    console.error('[readingLens] failed to persist settings', err);
  }
}

// ---- Window -------------------------------------------------------------

function preloadPath(): string {
  return path.join(__dirname, 'preload.js');
}

/**
 * Make the overlay cover exactly `bounds` (one display, in DIP).
 *
 * Electron on Windows sizes a window that lands on a monitor whose scale factor differs from
 * the one it was created or last shown on in the wrong DIPs. Measured on a 1280×720 @150%
 * primary with a 1920×1080 @100% second monitor: the overlay for the second monitor came up
 * 1280×720, so the right and bottom thirds of that screen could not be selected. Once the
 * window is on the target monitor, setting the same bounds again sticks.
 */
export function coverDisplay(
  win: Pick<BrowserWindow, 'setBounds' | 'getBounds'>,
  bounds: Electron.Rectangle,
): void {
  win.setBounds(bounds);
  const got = win.getBounds();
  if (got.x !== bounds.x || got.y !== bounds.y || got.width !== bounds.width || got.height !== bounds.height) {
    win.setBounds(bounds);
  }
}

function displayUnderCursor(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

/**
 * Decides what a `repeat` open can actually replay, and on which monitor.
 *
 * A repeat deliberately does NOT follow the cursor the way every other open
 * does: the stored rectangle is display-local, so replaying it under the cursor
 * would scan a different place and return text the user never pointed at. The
 * region's own display wins; if that monitor is gone, or the rectangle no
 * longer fits inside it (a resolution change), there is nothing honest to
 * replay and the caller degrades to `select`.
 */
export function resolveRepeatRegion(
  region: LensRegionMemory | null,
  displays: readonly Pick<Electron.Display, 'id' | 'bounds'>[],
): { display: Pick<Electron.Display, 'id' | 'bounds'>; region: LensRegionMemory } | null {
  if (!region) return null;
  const display = displays.find((d) => d.id === region.displayId);
  if (!display) return null;
  if (region.x + region.width > display.bounds.width) return null;
  if (region.y + region.height > display.bounds.height) return null;
  return { display, region };
}

function repeatTargetOf(mode: LensOpenMode): ReturnType<typeof resolveRepeatRegion> {
  if (mode !== 'repeat') return null;
  return resolveRepeatRegion(settings.lastRegion, screen.getAllDisplays());
}

/**
 * The box `cursor` reads: centred on the pointer, clamped inside the display,
 * in display-local DIP, plus the pointer relative to that box.
 */
export function cursorRegion(
  cursor: { x: number; y: number },
  bounds: Electron.Rectangle,
): { region: { x: number; y: number; width: number; height: number }; point: { x: number; y: number } } {
  const width = Math.min(CURSOR_BOX.width, bounds.width);
  const height = Math.min(CURSOR_BOX.height, bounds.height);
  const localX = cursor.x - bounds.x;
  const localY = cursor.y - bounds.y;
  const x = Math.round(Math.min(Math.max(0, localX - width / 2), bounds.width - width));
  const y = Math.round(Math.min(Math.max(0, localY - height / 2), bounds.height - height));
  return { region: { x, y, width, height }, point: { x: Math.round(localX - x), y: Math.round(localY - y) } };
}

interface LensOpenExtras {
  source?: ForegroundInfo | null;
  /** A clipboard capture prepared off the open path (an OCR'd clipboard picture). */
  capture?: ReadingLensCapture | null;
  clipboardImageFailed?: boolean;
}

function openLens(requestedMode: LensOpenMode, extras: LensOpenExtras = {}): void {
  const repeat = repeatTargetOf(requestedMode);
  // A repeat with nothing replayable is an ordinary selection, decided here so
  // the renderer never receives a `repeat` init it cannot honour.
  const mode: LensOpenMode = requestedMode === 'repeat' && !repeat ? 'select' : requestedMode;
  const display = repeat
    ? screen.getAllDisplays().find((d) => d.id === repeat.display.id) ?? displayUnderCursor()
    : displayUnderCursor();
  lensDisplayId = display.id;
  openedMode = mode;
  const bounds = display.bounds;
  let capture: ReadingLensCapture | null = null;
  if (mode === 'clipboard') {
    if (extras.capture !== undefined) {
      capture = extras.capture;
    } else {
      try {
        capture = createReadingLensClipboardCapture(clipboard.readText(), Date.now(), getMainStudyLang());
      } catch {
        // Clipboard access is explicit but can still be denied by the OS. The
        // renderer receives an empty clipboard state rather than losing the Lens.
      }
    }
  }
  const cursor = mode === 'cursor' ? cursorRegion(screen.getCursorScreenPoint(), bounds) : null;
  pendingInit = {
    bounds,
    mode,
    scaleFactor: display.scaleFactor || 1,
    // Normalized on the way out too, not only on the way in: `settings` is
    // mutated in place elsewhere in this file, so reading the stored value
    // through the same guard costs nothing and closes that path.
    defaultEngine: normalizeReadingLensEngine(settings.defaultEngine),
    ...(capture ? { capture } : {}),
    ...(extras.clipboardImageFailed ? { clipboardImageFailed: true } : {}),
    ...(cursor ? { region: cursor.region, point: cursor.point } : {}),
    ...(extras.source?.title ? { sourceTitle: extras.source.title } : {}),
    ...(extras.source?.process ? { sourceApp: extras.source.process } : {}),
    ...(repeat
      ? {
        region: {
          x: repeat.region.x,
          y: repeat.region.y,
          width: repeat.region.width,
          height: repeat.region.height,
        },
      }
      : {}),
  };

  if (lens && !lens.isDestroyed()) {
    coverDisplay(lens, bounds);
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
      // The constructor's bounds are the ones a scale-factor change can distort.
      coverDisplay(win, bounds);
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

/** Open from a hotkey: note the app in front first, so a mined card can name it. */
async function openFromHotkey(mode: LensOpenMode, source?: ForegroundInfo | null): Promise<void> {
  const from = source === undefined ? await quickForegroundInfo() : source;
  openLens(mode, { source: from });
}

function trigger(source?: ForegroundInfo | null): Promise<void> {
  const now = Date.now();
  const isDoubleTap = now - lastTriggerAt < DOUBLE_TAP_MS;
  lastTriggerAt = now;
  return openFromHotkey(isDoubleTap ? 'auto' : 'select', source);
}

/**
 * Read the clipboard: text as before, and now a picture too (a Win+Shift+S
 * snip, a copied manga panel) — OCR'd in the study language and shown as a
 * passage, like copied text.
 */
async function openClipboard(source?: ForegroundInfo | null): Promise<void> {
  const from = source === undefined ? await quickForegroundInfo() : source;
  let text = '';
  try {
    text = clipboard.readText();
  } catch {
    text = '';
  }
  if (text.trim()) {
    openLens('clipboard', { source: from });
    return;
  }
  let image: Electron.NativeImage | null = null;
  try {
    image = clipboard.readImage();
  } catch {
    image = null;
  }
  if (!image || image.isEmpty()) {
    openLens('clipboard', { source: from, capture: null });
    return;
  }
  const read = await ocrClipboardImage(image);
  const capture = read.ok && read.text.trim()
    ? createReadingLensClipboardCapture(read.text, Date.now(), read.lang || getMainStudyLang(), {
      engine: read.engine,
      screenshotDataUrl: read.screenshotDataUrl,
    })
    : null;
  openLens('clipboard', { source: from, capture, clipboardImageFailed: !capture });
}

/** Everything a companion surface can ask the Lens to do. */
export function openReadingLens(mode: LensOpenMode, source?: ForegroundInfo | null): Promise<void> {
  if (mode === 'clipboard') return openClipboard(source);
  if (mode === 'select') return trigger(source);
  return openFromHotkey(mode, source);
}

// ---- Global commands ----------------------------------------------------

function ensureCommands(): void {
  if (commandsRegistered) return;
  commandsRegistered = true;
  ensureSettings();
  const available = (): boolean => started && settings.enabled;
  registerGlobalCommand('lens.region', () => trigger(), {
    available,
    legacyKeys: () => settings.hotkey,
  });
  registerGlobalCommand('lens.auto', () => openFromHotkey('auto'), { available });
  registerGlobalCommand('lens.repeat', () => openFromHotkey('repeat'), { available });
  registerGlobalCommand('lens.clipboard', () => openClipboard(), { available });
  registerGlobalCommand('lens.atCursor', () => openFromHotkey('cursor'), { available });
}

function applyEnabledState(): { ok: boolean; error?: string } {
  refreshGlobalCommands();
  if (!settings.enabled) closeLens();
  return settings.enabled ? legacyChordResult(getGlobalCommandStatus('lens.region')) : { ok: true };
}

function getStatus(): ReadingLensStatus {
  return {
    ...settings,
    hotkey: getGlobalCommandChord('lens.region'),
    supported: process.platform === 'win32',
    registered: getGlobalCommandStatus('lens.region')?.registered === true,
    open: !!(lens && !lens.isDestroyed() && lens.isVisible()),
    // Not `!!settings.lastRegion`: a region on a monitor that has since been
    // unplugged is stored but not replayable, and a Repeat control that is
    // enabled for it would open the lens and then silently do something else.
    canRepeatRegion: repeatTargetOf('repeat') !== null,
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
  settingsLoaded = true;
  started = true;
  ensureCommands();
  const res = applyEnabledState();
  if (settings.enabled && !res.ok) {
    // A busy accelerator is a normal outcome — surface it so it is diagnosable
    // instead of a mysteriously dead hotkey. The Settings section lets the user
    // pick a free one; the programmatic open path still works meanwhile.
    console.warn(`[readingLens] hotkey "${settings.hotkey}" not registered: ${res.error ?? 'unknown'}`);
  }
}

export function stopReadingLens(): void {
  started = false;
  refreshGlobalCommands();
  if (lens && !lens.isDestroyed()) lens.destroy();
  lens = null;
}

export function registerReadingLensIpc(): void {
  ensureCommands();
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
      const res = legacyChordResult(setGlobalCommandChord('lens.region', next));
      broadcastSettings();
      return { ...res, status: getStatus() };
    },
  );

  ipcMain.handle('lens:setDefaultEngine', (_e, engine: unknown): ReadingLensStatus => {
    settings.defaultEngine = normalizeReadingLensEngine(engine);
    saveSettings();
    broadcastSettings();
    return getStatus();
  });

  /**
   * What the recognizers can actually do right now.
   *
   * Read live on every call rather than cached: model packs are installed from
   * the Assets surface while the app runs, so a cached "manga: false" would
   * outlive the download that fixed it and the settings page would keep warning
   * about an engine that now works.
   */
  ipcMain.handle('lens:ocrEngineStatus', (): ReadingLensEngineStatus => {
    const manga = mangaOcrAvailable();
    const web = paddleOcrAvailable();
    return { manga, web, webLangs: web ? installedPaddleLangs() : [], none: !manga && !web };
  });

  // Programmatic open (Settings button / testing) mirrors the hotkey path.
  ipcMain.handle('lens:open', (_e, mode: unknown): void => {
    openLens(
      mode === 'auto' || mode === 'clipboard' || mode === 'repeat' || mode === 'cursor' ? mode : 'select',
    );
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
    // Remembered here rather than through a second IPC the renderer would have
    // to remember to call: this handler already receives every rectangle the
    // lens scans, from a drag, a rescan or a repeat alike, so the memory cannot
    // drift from what was actually captured. Recorded before the OCR runs — a
    // region that returns no text is still the region the user chose, and a
    // repeat of it is exactly what a VN or manga reader wants next.
    // A `cursor` read is a glance at one word, not the box the user drew: it
    // must not replace the region "repeat" replays.
    const remembered = openedMode === 'cursor' ? null : normalizeLensRegionMemory({ ...rect, displayId: lensDisplayId });
    if (remembered && JSON.stringify(remembered) !== JSON.stringify(settings.lastRegion)) {
      settings = { ...settings, lastRegion: remembered };
      saveSettings();
      broadcastSettings();
    }
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

  // Capture history. The lens window is destroyed per capture, so the record
  // call comes from a renderer that is about to go away — main owns the store.
  ipcMain.handle('lens:history:record', (_e, capture: unknown): ReadingLensHistoryEntry | null =>
    recordCapture(capture),
  );
  ipcMain.handle('lens:history:list', (_e, query: unknown): ReadingLensHistoryEntry[] =>
    listCaptures(query),
  );
  ipcMain.handle(
    'lens:history:pin',
    (_e, captureId: unknown, pinned: unknown): ReadingLensHistoryEntry | null =>
      setCapturePinned(captureId, pinned),
  );
  ipcMain.handle('lens:history:remove', (_e, captureId: unknown): number => removeCapture(captureId));
  ipcMain.handle('lens:history:clear', (): void => clearCaptures());
  // Retention: the time bound on the store, separate from its size bound. Set
  // returns what it actually removed rather than only the accepted value, so
  // the settings surface can report a number it measured.
  ipcMain.handle('lens:history:getRetention', (): ReadingLensRetentionDays => getRetentionDays());
  ipcMain.handle(
    'lens:history:setRetention',
    (_e, days: unknown): { retentionDays: ReadingLensRetentionDays; removed: number } =>
      setRetentionDays(days),
  );

  // The lens → Lexicon lookup slot. Registered from here rather than from
  // `main.ts` for the reason `agentImageStaging.ts` records about its own
  // boundary: this is already the lens's production main entry point and is
  // already called once at boot, so the shared bootstrap another track is
  // rewriting needs no edit.
  registerLexiconHandoffIpc();
  // The lens → Reading workspace passage slot, registered beside it for the same
  // reason and on the same boot path. They are complementary halves of one scale
  // decision: a capture the Lexicon lane refuses is exactly what this one takes.
  registerReadingPassageHandoffIpc();
}

export const __readingLensTestables = {
  loadSettings,
  statePath,
  DEFAULTS,
  cursorRegion,
};
