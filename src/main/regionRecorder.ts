/**
 * The desktop Region Recorder — the main-process controller.
 *
 * Windows that take part (all `index.html?regionRecorder=<kind>`):
 *
 * - `select`: a transparent overlay over one monitor where the box is drawn
 *   (`renderer/recorder/RegionSelectOverlay.tsx`);
 * - `host`: a HIDDEN window that records (`renderer/recorder/regionRecorderHost.ts`).
 *   The screen is granted to it through the app's one display-media handler
 *   (`displayMediaBroker.ts`): the chosen monitor, plus the Windows loopback
 *   when system audio is asked for. Elsewhere it records without system audio
 *   and the state says so;
 * - `panel`: the always-on-top pill (red dot, timer, Pause/Stop, mic level)
 *   that becomes the job card after Stop, and offers recovered recordings;
 * - `frame`: a click-through border around the recorded region.
 *
 * Pill and frame are excluded from capture (`setContentProtection`), and the
 * tray shows the red dot (`recordingIndicator.ts`) for as long as anything is
 * being recorded.
 *
 * Chunks arrive once a second over IPC with a sequence number and are
 * appended in order to `<folder>/.partial/<id>.webm`; `<id>.json` beside it
 * says how to finish it. A recording stops on Stop, its time limit, less than
 * 1 GB free, the monitor going away, the track ending, or a write error. Then
 * it becomes a job: `recordingFinalize.ts` (ffmpeg → MP4) → library import
 * (`ingestMediaPaths(…, 'recording')`) → Whisper in the study language → the
 * study player. A partial file is only deleted once its MP4 exists; on any
 * failure it stays, and on the next start it is offered for recovery.
 *
 * Round 2: a WINDOW can be recorded instead of a region (`startRecorder('window')`,
 * the topmost foreign window or a picked one; no border, fitted to its first
 * frame); the finish uses a hardware H.264 encoder when `recorderEncoder.ts`
 * proves one works here (x264 otherwise, and as the fallback); every MP4 lands
 * in `recordings-history.json` (open, show, transcribe again, delete to the
 * Recycle Bin); a missing Whisper model queues the transcription until a
 * renderer reports a download (`recorder:model-changed`); and the main window
 * files each recording under its study day in Calendar and Statistics.
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  shell,
  type IpcMainEvent,
} from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { refuseWhileLocked } from './lockGuard';
import { registerDisplayMediaRequester } from './displayMediaBroker';
import { setRecordingIndicator } from './recordingIndicator';
import { coverDisplay, pickScreenSource } from './screenSources';
import { registerGlobalCommand } from './globalCommands';
import { mt } from './i18n';
import { getMainStudyLang } from './studyLanguage';
import { ingestMediaPaths } from './mediaIngest';
import { enqueueTranscription, onMainTranscriptionProgress } from './transcriptionJobs';
import { finalizeRecording, type FinalizeErrorCode, type FinalizeHandle } from './recordingFinalize';
import { cachedRecorderEncoderReport, detectRecorderEncoders } from './recorderEncoder';
import {
  DEFAULT_RECORDER_SETTINGS,
  OrderedChunkSink,
  RECORDER_CHANNELS as CH,
  RECORDER_CHUNK_MS,
  RECORDER_DEFAULT_FOLDER_NAME,
  RECORDER_HISTORY_ACTIONS,
  RECORDER_MIN_REGION,
  RECORDER_PARTIAL_DIR,
  diskSpaceVerdict,
  formatRecorderClock,
  freeBytesFromStatfs,
  nextDisplayId,
  normalizePartialMeta,
  recorderHistoryFromDisk,
  normalizeRecorderSettings,
  pickActiveWindowSource,
  recordedMs,
  recorderLimitReached,
  recorderPartialId,
  recorderStudyDay,
  recorderVideoBitrate,
  recorderWantsSystemAudio,
  recordingBaseName,
  resolveRecorderEncoder,
  resolveRecorderRepeat,
  toGlobal,
  uniqueRecordingFileName,
  upsertRecorderHistory,
  type CropPx,
  type RecorderEncoderReport,
  type RecorderHistoryAction,
  type RecorderHistoryEntry,
  type RecorderHostConfig,
  type RecorderHostEvent,
  type RecorderHostStartResult,
  type RecorderJob,
  type RecorderJobAction,
  type RecorderPartialMeta,
  type RecorderRecoverable,
  type RecorderRecoveryAction,
  type RecorderSelectInit,
  type RecorderSessionPhase,
  type RecorderSettings,
  type RecorderSourceKind,
  type RecorderStartMode,
  type RecorderState,
  type RecorderStudyTagRequest,
  type RecorderWindowSource,
  type RectLike,
} from '../shared/regionRecorder';

type RendererUrlFn = (query?: string) => string;
type WindowFn = (win: BrowserWindow) => void;

interface RecorderDeps {
  rendererUrl: RendererUrlFn;
  getMainWindow: () => BrowserWindow | null;
  forwardConsole?: WindowFn;
  attachNavGuards?: WindowFn;
  isDevServer: boolean;
}

let deps: RecorderDeps | null = null;

export function configureRegionRecorder(options: RecorderDeps): void {
  deps = options;
}

const urlFor = (kind: string): string =>
  deps ? deps.rendererUrl(`regionRecorder=${kind}`) : `app://bundle/index.html?regionRecorder=${kind}`;

// ---------------------------------------------------------------------------
// Settings

let settings: RecorderSettings = { ...DEFAULT_RECORDER_SETTINGS };
let settingsLoaded = false;

function settingsPath(): string {
  return path.join(app.getPath('userData'), 'region-recorder.json');
}

function loadSettings(): RecorderSettings {
  if (settingsLoaded) return settings;
  settingsLoaded = true;
  try {
    settings = normalizeRecorderSettings(readJsonSync<unknown>(settingsPath(), {}));
  } catch {
    settings = { ...DEFAULT_RECORDER_SETTINGS };
  }
  return settings;
}

function saveSettings(): void {
  try {
    writeJsonAtomicSync(settingsPath(), settings, { space: 0 });
  } catch {
    /* a lost preference never stops a recording */
  }
}

export function defaultRecordingsFolder(): string {
  let videos = '';
  try {
    videos = app.getPath('videos');
  } catch {
    videos = app.getPath('home');
  }
  return path.join(videos, RECORDER_DEFAULT_FOLDER_NAME);
}

function recordingsFolder(): string {
  return loadSettings().folder || defaultRecordingsFolder();
}

async function freeBytesAt(dir: string): Promise<number | null> {
  try {
    const statfs = (fs.promises as unknown as { statfs?: (p: string) => Promise<{ bavail: number | bigint; bsize: number | bigint }> }).statfs;
    if (!statfs) return null;
    return freeBytesFromStatfs(await statfs(dir));
  } catch {
    return null;
  }
}

/** Replaced by tests: the free space on the recordings drive. */
let freeBytesProbe: (dir: string) => Promise<number | null> = freeBytesAt;

/** Replaced by tests: which hardware encoders work here (`recorderEncoder.ts`, cached). */
let encoderDetector: (force?: boolean) => Promise<RecorderEncoderReport> = (force) => detectRecorderEncoders({ force });
let lastEncoderReport: RecorderEncoderReport | null = null;

async function detectEncoders(force = false): Promise<RecorderEncoderReport> {
  const report = await encoderDetector(force);
  lastEncoderReport = report;
  return report;
}

// ---------------------------------------------------------------------------
// State

interface Session {
  id: string;
  /** `-1` for a window recording: no monitor going away stops it. */
  displayId: number;
  displayBounds: RectLike;
  region: RectLike;
  source: RecorderSourceKind;
  /** The recorded window's title, in window mode. */
  windowName?: string;
  title: string;
  partialPath: string;
  metaPath: string;
  folder: string;
  host: BrowserWindow;
  releaseCapture: () => void;
  sink: OrderedChunkSink<Buffer>;
  file: fs.promises.FileHandle | null;
  startedAt: number;
  pausedTotalMs: number;
  pausedSince: number | null;
  crop: CropPx | null;
  liveCrop: boolean;
  hasAudio: boolean;
  systemAudio: RecorderState['systemAudio'];
  mic: boolean;
  /** Stop was pressed while the recording was still starting. */
  stopWhenStarted: boolean;
  stopping: Promise<void> | null;
  stoppedSeq: ((lastSeq: number) => void) | null;
  stopReasonKey?: string;
  tick: NodeJS.Timeout | null;
  diskTick: NodeJS.Timeout | null;
}

let phase: RecorderSessionPhase = 'idle';
let session: Session | null = null;
/** Stop pressed during a start, before its session existed. */
let stopRequestedWhileStarting = false;
let errorKey: string | undefined;
let errorDetail: string | undefined;
let jobs: RecorderJob[] = [];
let recoverable: RecorderRecoverable[] = [];
const dismissedRecoverable = new Set<string>();
const jobRuns = new Map<string, { meta: RecorderPartialMeta; finalize: FinalizeHandle | null }>();

let selectWin: BrowserWindow | null = null;
let selectInit: RecorderSelectInit | null = null;
let panelWin: BrowserWindow | null = null;
let frameWin: BrowserWindow | null = null;

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

export function getRecorderState(): RecorderState {
  loadSettings();
  return {
    phase,
    settings,
    defaultFolder: defaultRecordingsFolder(),
    startedAt: session?.startedAt ?? null,
    pausedTotalMs: session?.pausedTotalMs ?? 0,
    pausedSince: session?.pausedSince ?? null,
    displayId: session?.displayId ?? null,
    systemAudio: session?.systemAudio ?? (process.platform === 'win32' ? 'off' : 'unsupported'),
    mic: session?.mic ?? false,
    liveCrop: session ? session.liveCrop : null,
    ...(errorKey ? { errorKey } : {}),
    ...(errorDetail ? { errorDetail } : {}),
    jobs,
    recoverable: recoverable.filter((r) => !dismissedRecoverable.has(r.id)),
    loopbackSupported: process.platform === 'win32',
    source: session?.source ?? null,
    ...(session?.windowName ? { windowName: session.windowName } : {}),
    encoders: lastEncoderReport ?? cachedRecorderEncoderReport(),
    waitingForModel: waitingForModelCount(),
  };
}

function sendTo(win: BrowserWindow | null | undefined, channel: string, payload: unknown): void {
  try {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch {
    /* torn down mid-send */
  }
}

function broadcast(): void {
  const state = getRecorderState();
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === session?.host) continue;
    sendTo(win, CH.state, state);
  }
  syncPanel();
  syncIndicator();
}

function setPhase(next: RecorderSessionPhase): void {
  phase = next;
  broadcast();
}

function patchJob(id: string, patch: Partial<RecorderJob>): RecorderJob | undefined {
  jobs = jobs.map((j) => (j.id === id ? { ...j, ...patch } : j));
  broadcast();
  return jobs.find((j) => j.id === id);
}

// ---------------------------------------------------------------------------
// Small windows

function baseOverlayOptions(): Electron.BrowserWindowConstructorOptions {
  return {
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
    webPreferences: { preload: path.join(__dirname, 'preload.js'), backgroundThrottling: false },
  };
}

function wire(win: BrowserWindow): void {
  deps?.attachNavGuards?.(win);
  if (deps?.isDevServer) deps.forwardConsole?.(win);
}

function displayUnderCursor(): Electron.Display {
  return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
}

function openSelect(display: Electron.Display): void {
  const memory = settings.lastRegion;
  selectInit = {
    bounds: display.bounds,
    displayId: display.id,
    scaleFactor: display.scaleFactor || 1,
    displayCount: screen.getAllDisplays().length,
    lastRegion: memory && memory.displayId === display.id
      ? { x: memory.x, y: memory.y, width: memory.width, height: memory.height }
      : null,
  };
  if (!selectWin || selectWin.isDestroyed()) {
    const win = new BrowserWindow({ ...baseOverlayOptions(), ...display.bounds });
    selectWin = win;
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    wire(win);
    win.once('ready-to-show', () => {
      if (win.isDestroyed() || !selectInit) return;
      coverDisplay(win, selectInit.bounds);
      win.show();
      win.focus();
    });
    win.webContents.on('did-finish-load', () => sendTo(win, CH.selectInit, selectInit));
    win.on('closed', () => {
      if (selectWin === win) {
        selectWin = null;
        if (phase === 'selecting') setPhase('idle');
      }
    });
    void win.loadURL(urlFor('select'));
  } else {
    coverDisplay(selectWin, display.bounds);
    sendTo(selectWin, CH.selectInit, selectInit);
    selectWin.show();
    selectWin.focus();
  }
  errorKey = undefined;
  errorDetail = undefined;
  setPhase('selecting');
}

function closeSelect(): void {
  const win = selectWin;
  selectWin = null;
  selectInit = null;
  if (win && !win.isDestroyed()) win.destroy();
}

const PANEL_WIDTH = 360;
/** How long the hidden host may take to hand back a running recorder. */
let RECORDER_HOST_START_TIMEOUT_MS = 20_000;
/** The panel's bottom-right corner on its work area, fixed when it is created. */
let panelAnchor: { right: number; bottom: number } | null = null;
/** The height last asked of the panel (see `resizePanel`). */
let panelHeight = 0;

/** True when every window still open is one of the recorder's own. */
function onlyRecorderWindowsLeft(): boolean {
  const ours = new Set<BrowserWindow | null | undefined>([panelWin, frameWin, selectWin, session?.host]);
  return BrowserWindow.getAllWindows().every((w) => w.isDestroyed() || ours.has(w));
}

function panelWanted(): boolean {
  if (phase === 'recording' || phase === 'paused' || phase === 'starting') return true;
  const wanted = jobs.length > 0 || getRecorderState().recoverable.length > 0 || phase === 'error';
  if (!wanted) return false;
  // A job card must not keep the app alive once every app window is closed — only a
  // recording, or a job still turning the partial into an MP4, may.
  return !onlyRecorderWindowsLeft() || jobs.some((j) => j.phase === 'finalizing' || j.phase === 'importing');
}

function ensurePanel(): BrowserWindow {
  if (panelWin && !panelWin.isDestroyed()) return panelWin;
  const work = (session ? screen.getAllDisplays().find((d) => d.id === session?.displayId) : null)?.workArea
    ?? screen.getPrimaryDisplay().workArea;
  const height = 120;
  panelAnchor = { right: Math.round(work.x + work.width - 16), bottom: Math.round(work.y + work.height - 16) };
  panelHeight = height;
  const win = new BrowserWindow({
    ...baseOverlayOptions(),
    transparent: false,
    backgroundColor: '#1b1b1f',
    x: panelAnchor.right - PANEL_WIDTH,
    y: panelAnchor.bottom - height,
    width: PANEL_WIDTH,
    height,
    focusable: true,
  });
  panelWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  // Never in the recording itself.
  win.setContentProtection(true);
  wire(win);
  win.webContents.on('did-finish-load', () => sendTo(win, CH.state, getRecorderState()));
  win.once('ready-to-show', () => syncPanel());
  // `syncPanel` will not show a panel that is still loading, and both events above can
  // arrive while `isLoading()` is still true (it only clears at did-stop-loading). Measured
  // live 2026-10-08: the crash-recovery offer at startup stayed hidden for good, because
  // nothing broadcast after the panel finished loading.
  win.webContents.on('did-stop-loading', () => syncPanel());
  win.on('closed', () => {
    if (panelWin === win) panelWin = null;
  });
  void win.loadURL(urlFor('panel'));
  return win;
}

function syncPanel(): void {
  if (!panelWanted()) {
    if (panelWin && !panelWin.isDestroyed()) {
      // A hidden window still counts for `window-all-closed`: measured live 2026-10-08,
      // closing Study OS and Blanc after one recording left the process running with
      // only this panel. When nothing else is open it is destroyed, not hidden.
      if (onlyRecorderWindowsLeft()) {
        const win = panelWin;
        panelWin = null;
        win.destroy();
      } else if (panelWin.isVisible()) {
        panelWin.hide();
      }
    }
    return;
  }
  const win = ensurePanel();
  if (!win.isVisible() && win.webContents.isLoading?.() === false) win.showInactive();
}

/**
 * Grow or shrink the panel upwards from its fixed bottom-right corner.
 *
 * Computed from the anchor and the last height ASKED for, never from `getBounds()`:
 * Windows hands back a frameless, non-resizable window's bounds a few pixels off what
 * was set, and the old read-modify-write fed that error back on every 500 ms render.
 * Measured live 2026-10-08: within three minutes of recording the pill had shrunk to
 * 32×56 px and walked to y = -9928, off every screen, with Pause and Stop on it.
 */
function resizePanel(height: number): void {
  const win = panelWin;
  if (!win || win.isDestroyed() || !panelAnchor) return;
  const h = Math.round(Math.min(560, Math.max(64, height)));
  if (h === panelHeight) return;
  panelHeight = h;
  win.setBounds({ x: panelAnchor.right - PANEL_WIDTH, y: panelAnchor.bottom - h, width: PANEL_WIDTH, height: h });
}

function showFrame(s: Session): void {
  const rect = toGlobal(s.region, s.displayBounds);
  const pad = 3;
  const win = new BrowserWindow({
    ...baseOverlayOptions(),
    focusable: false,
    x: Math.round(rect.x - pad),
    y: Math.round(rect.y - pad),
    width: Math.round(rect.width + pad * 2),
    height: Math.round(rect.height + pad * 2),
  });
  frameWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.setContentProtection(true);
  wire(win);
  win.once('ready-to-show', () => {
    if (!win.isDestroyed()) win.showInactive();
  });
  win.on('closed', () => {
    if (frameWin === win) frameWin = null;
  });
  void win.loadURL(urlFor('frame'));
}

function closeFrame(): void {
  const win = frameWin;
  frameWin = null;
  if (win && !win.isDestroyed()) win.destroy();
}

function syncIndicator(): void {
  if (phase !== 'recording' && phase !== 'paused') {
    setRecordingIndicator('recorder', null);
    return;
  }
  const s = session;
  const clock = s ? formatRecorderClock(recordedMs(s.startedAt, Date.now(), s.pausedTotalMs, s.pausedSince)) : '';
  setRecordingIndicator('recorder', {
    tooltip: mt('recorder.tray.tooltip', { time: clock }),
    onClick: () => ensurePanel().showInactive(),
    menu: [
      { label: mt('recorder.tray.status'), enabled: false },
      {
        label: phase === 'paused' ? mt('recorder.pill.resume') : mt('recorder.pill.pause'),
        click: () => void setPaused(phase !== 'paused'),
      },
      { label: mt('recorder.pill.stop'), click: () => void stopRecording() },
    ],
  });
}

// ---------------------------------------------------------------------------
// Starting

/** The region hotkey, the tray, the Start menu, Blanc: begin, or stop what is running. */
export async function startRecorder(
  mode: RecorderStartMode = 'select',
  options: { sourceId?: string } = {},
): Promise<RecorderState> {
  loadSettings();
  if (phase === 'recording' || phase === 'paused') {
    await stopRecording();
    return getRecorderState();
  }
  if (phase === 'starting') {
    // Pressed again before the first press had anything running: the user meant stop.
    stopRequestedWhileStarting = true;
    if (session) session.stopWhenStarted = true;
    return getRecorderState();
  }
  // Stopping stays possible above; starting (the region picker, a new session) does
  // not while locked. Its panel and frame are hidden by the lock guard meanwhile.
  if (refuseWhileLocked('window:recorder')) return getRecorderState();
  if (phase === 'selecting') {
    selectWin?.show();
    selectWin?.focus();
    return getRecorderState();
  }
  if (mode === 'repeat') {
    const target = resolveRecorderRepeat(settings.lastRegion, screen.getAllDisplays());
    if (target) {
      await beginRecording(target.display, target.region);
      return getRecorderState();
    }
  }
  const display = displayUnderCursor();
  if (mode === 'full') {
    await beginRecording(display, { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height }, { source: 'monitor' });
    return getRecorderState();
  }
  if (mode === 'window') {
    const target = await resolveWindowSource(options.sourceId);
    if (!target) {
      failStart('rec2.error.noWindow');
      return getRecorderState();
    }
    await beginRecording(display, { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height }, {
      source: 'window',
      window: target,
    });
    return getRecorderState();
  }
  openSelect(display);
  return getRecorderState();
}

/** Gum's own windows, which "the active window" must never be. */
function ownWindowSourceIds(): Set<string> {
  const ids = new Set<string>();
  for (const win of BrowserWindow.getAllWindows()) {
    try {
      if (!win.isDestroyed()) ids.add(win.getMediaSourceId());
    } catch {
      /* torn down */
    }
  }
  return ids;
}

/** Windows that can be recorded, Gum's own left out, topmost first. */
export async function listRecordableWindows(thumbnails = true): Promise<RecorderWindowSource[]> {
  let sources: Electron.DesktopCapturerSource[] = [];
  try {
    sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: thumbnails ? { width: 240, height: 135 } : { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
  } catch {
    return [];
  }
  const own = ownWindowSourceIds();
  return sources
    .filter((s) => /^window:/.test(s.id) && !own.has(s.id) && s.name.trim())
    .slice(0, 60)
    .map((s) => {
      let thumbnail = '';
      try {
        thumbnail = thumbnails && !s.thumbnail.isEmpty() ? s.thumbnail.toDataURL() : '';
      } catch {
        thumbnail = '';
      }
      return { id: s.id, name: s.name.slice(0, 200), thumbnail };
    });
}

/** The window a window recording should capture: the one asked for, else the topmost foreign one. */
async function resolveWindowSource(sourceId?: string): Promise<{ id: string; name: string } | null> {
  let sources: Electron.DesktopCapturerSource[] = [];
  try {
    sources = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
  } catch {
    return null;
  }
  const own = ownWindowSourceIds();
  if (sourceId) {
    const asked = sources.find((s) => s.id === sourceId && !own.has(s.id));
    return asked ? { id: asked.id, name: asked.name } : null;
  }
  const picked = pickActiveWindowSource(sources, own);
  return picked ? { id: picked.id, name: picked.name } : null;
}

function failStart(key: string, detail?: string): void {
  errorKey = key;
  errorDetail = detail?.slice(0, 300);
  setPhase('error');
}

function waitForLoad(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(false), 30_000);
    win.once('closed', () => {
      clearTimeout(timer);
      resolve(false);
    });
    win.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve(true);
    });
    win.webContents.once('did-fail-load', () => {
      clearTimeout(timer);
      resolve(false);
    });
  });
}

async function waitForHost(win: BrowserWindow): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if (win.isDestroyed()) return false;
    try {
      if (await win.webContents.executeJavaScript('typeof window.__gumRecorderStart === "function"')) return true;
    } catch {
      /* still loading */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

async function beginRecording(
  display: Electron.Display,
  region: RectLike,
  options: { source?: RecorderSourceKind; window?: { id: string; name: string } } = {},
): Promise<void> {
  if (phase === 'starting' || phase === 'recording' || phase === 'paused') return;
  const source: RecorderSourceKind = options.window ? 'window' : options.source ?? 'region';
  if (region.width < RECORDER_MIN_REGION || region.height < RECORDER_MIN_REGION) {
    failStart('recorder.error.regionTooSmall');
    return;
  }
  errorKey = undefined;
  errorDetail = undefined;
  stopRequestedWhileStarting = false;
  phase = 'starting';
  broadcast();

  const folder = recordingsFolder();
  const partialDir = path.join(folder, RECORDER_PARTIAL_DIR);
  try {
    fs.mkdirSync(partialDir, { recursive: true });
  } catch (err) {
    failStart('recorder.error.folder', err instanceof Error ? err.message : String(err));
    return;
  }
  if (diskSpaceVerdict(await freeBytesProbe(folder)) === 'low') {
    failStart('recorder.error.diskLow');
    return;
  }

  const startedAt = Date.now();
  const id = recorderPartialId(startedAt, Math.random() * 1e9);
  const partialPath = path.join(partialDir, `${id}.webm`);
  let file: fs.promises.FileHandle;
  try {
    file = await fs.promises.open(partialPath, 'w');
  } catch (err) {
    failStart('recorder.error.folder', err instanceof Error ? err.message : String(err));
    return;
  }

  const host = new BrowserWindow({
    width: 320,
    height: 200,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // A hidden window's timers, encoder and audio callbacks must keep running.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  wire(host);
  const wantsSystem = recorderWantsSystemAudio(settings.audio);
  const loopback = wantsSystem && process.platform === 'win32';
  const wantedWindow = options.window;
  const releaseCapture = registerDisplayMediaRequester(host.webContents, async () => {
    if (wantedWindow) {
      // Asked again at grant time: a window can close between the choice and the start.
      const windows = await desktopCapturer.getSources({ types: ['window'], thumbnailSize: { width: 0, height: 0 } });
      const win = windows.find((w) => w.id === wantedWindow.id);
      if (!win) return null;
      return loopback ? { video: win, audio: 'loopback' } : { video: win };
    }
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 256, height: 256 } });
    const picked = pickScreenSource(sources, screen.getAllDisplays(), display);
    if (!picked) return null;
    return loopback ? { video: picked, audio: 'loopback' } : { video: picked };
  });

  const s: Session = {
    id,
    displayId: wantedWindow ? -1 : display.id,
    displayBounds: display.bounds,
    region,
    source,
    ...(wantedWindow ? { windowName: wantedWindow.name.slice(0, 200) } : {}),
    title: wantedWindow
      ? `${recordingBaseName(new Date(startedAt))} ${wantedWindow.name}`.slice(0, 120)
      : recordingBaseName(new Date(startedAt)),
    partialPath,
    metaPath: path.join(partialDir, `${id}.json`),
    folder,
    host,
    releaseCapture,
    sink: new OrderedChunkSink<Buffer>(
      async (chunk) => {
        if (!s.file) throw new Error('file closed');
        await s.file.write(chunk);
      },
      () => void stopRecording('recorder.stopped.write'),
    ),
    file,
    startedAt,
    pausedTotalMs: 0,
    pausedSince: null,
    crop: null,
    liveCrop: false,
    hasAudio: false,
    systemAudio: wantsSystem ? (loopback ? 'on' : 'unsupported') : 'off',
    mic: false,
    stopWhenStarted: false,
    stopping: null,
    stoppedSeq: null,
    tick: null,
    diskTick: null,
  };
  session = s;
  host.on('closed', () => {
    // The recorder died under us (crash, killed): what reached the disk is kept.
    if (session === s && (phase === 'recording' || phase === 'paused')) void stopRecording('recorder.stopped.ended');
  });
  host.webContents.on('render-process-gone', () => {
    if (!host.isDestroyed()) host.destroy();
  });

  const loaded = waitForLoad(host);
  void host.loadURL(urlFor('host'));
  const up = (await loaded) && (await waitForHost(host));
  const config: RecorderHostConfig = {
    fps: settings.fps,
    region,
    displaySize: { width: display.bounds.width, height: display.bounds.height },
    audio: settings.audio,
    systemAudioGranted: loopback,
    micDeviceId: settings.micDeviceId,
    systemGain: settings.systemGain,
    micGain: settings.micGain,
    videoBitsPerSecond: recorderVideoBitrate(settings.quality, settings.fps),
    chunkMs: RECORDER_CHUNK_MS,
    ...(wantedWindow ? { fullFrame: true } : {}),
  };
  let result: RecorderHostStartResult | null = null;
  if (up) {
    let startTimer: NodeJS.Timeout | undefined;
    try {
      // `userGesture: true`: getDisplayMedia wants a user activation, and this start is the user's.
      // Bounded: a host page that reloads or dies mid-start leaves this promise unsettled, and
      // without a deadline the session sat in `starting` for good — pill on "Starting…", the
      // hotkey and Stop both swallowed (measured live 2026-10-08).
      result = await Promise.race([
        host.webContents.executeJavaScript(`window.__gumRecorderStart(${JSON.stringify(config)})`, true) as Promise<RecorderHostStartResult>,
        new Promise<RecorderHostStartResult>((resolve) => {
          startTimer = setTimeout(
            () => resolve({ ok: false, errorKey: 'recorder.error.hostFailed', error: 'the recorder did not start in time' }),
            RECORDER_HOST_START_TIMEOUT_MS,
          );
        }),
      ]);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
    } finally {
      if (startTimer) clearTimeout(startTimer);
    }
  }
  if (session !== s) return;
  if (!up || !result?.ok) {
    await abandonSession(s);
    failStart(result?.errorKey || (up ? 'recorder.error.streamFailed' : 'recorder.error.hostFailed'), result?.error);
    return;
  }
  s.crop = result.liveCrop ? null : result.crop ?? null;
  s.liveCrop = result.liveCrop === true;
  s.hasAudio = result.hasAudio === true;
  s.mic = result.mic === true;
  if (wantsSystem && loopback && !result.systemAudio) s.systemAudio = 'off';
  s.startedAt = Date.now();
  if (source !== 'window') {
    settings = { ...settings, lastRegion: { displayId: display.id, ...region } };
    saveSettings();
  }
  writeMeta(s, false);
  phase = 'recording';
  // A window moves and resizes on its own; a border drawn where it started would lie.
  if (source !== 'window') showFrame(s);
  s.tick = setInterval(() => recorderTick(), 1000);
  s.diskTick = setInterval(() => void diskTick(), 15_000);
  broadcast();
  if (s.stopWhenStarted || stopRequestedWhileStarting) {
    stopRequestedWhileStarting = false;
    await stopRecording();
  }
}

function writeMeta(s: Session, complete: boolean): void {
  const meta: RecorderPartialMeta = {
    version: 1,
    id: s.id,
    startedAt: s.startedAt,
    title: s.title,
    folder: s.folder,
    quality: settings.quality,
    crop: s.crop,
    hasAudio: s.hasAudio,
    recordedMs: recordedMs(s.startedAt, Date.now(), s.pausedTotalMs, s.pausedSince),
    complete,
    source: s.source,
  };
  try {
    writeJsonAtomicSync(s.metaPath, meta, { space: 0 });
  } catch {
    /* the WebM is still finishable by hand */
  }
}

/** A start that never got going: the window, the grant and an empty file go. */
async function abandonSession(s: Session): Promise<void> {
  if (session === s) session = null;
  s.releaseCapture();
  if (!s.host.isDestroyed()) s.host.destroy();
  try {
    await s.file?.close();
  } catch {
    /* already closed */
  }
  s.file = null;
  try {
    if (fs.statSync(s.partialPath).size === 0) fs.rmSync(s.partialPath, { force: true });
  } catch {
    /* nothing there */
  }
}

// ---------------------------------------------------------------------------
// While recording

function recorderTick(now = Date.now()): void {
  const s = session;
  if (!s || (phase !== 'recording' && phase !== 'paused')) return;
  if (recorderLimitReached(recordedMs(s.startedAt, now, s.pausedTotalMs, s.pausedSince), settings.maxMinutes)) {
    void stopRecording('recorder.stopped.limit');
    return;
  }
  syncIndicator();
}

async function diskTick(): Promise<void> {
  const s = session;
  if (!s || (phase !== 'recording' && phase !== 'paused')) return;
  if (diskSpaceVerdict(await freeBytesProbe(s.folder)) === 'low') void stopRecording('recorder.stopped.disk');
}

export async function setPaused(paused: boolean): Promise<RecorderState> {
  const s = session;
  if (!s) return getRecorderState();
  if (paused && phase === 'recording') {
    sendTo(s.host, CH.hostCommand, { type: 'pause' });
    s.pausedSince = Date.now();
    setPhase('paused');
  } else if (!paused && phase === 'paused') {
    sendTo(s.host, CH.hostCommand, { type: 'resume' });
    if (s.pausedSince !== null) s.pausedTotalMs += Date.now() - s.pausedSince;
    s.pausedSince = null;
    setPhase('recording');
  }
  return getRecorderState();
}

function onHostEvent(event: RecorderHostEvent): void {
  const s = session;
  if (!s) return;
  if (event.type === 'stopped') s.stoppedSeq?.(event.lastSeq);
  // A window's track ends when the window closes (or is minimised away by some apps).
  else if (event.type === 'ended') void stopRecording(s.source === 'window' ? 'rec2.stopped.windowClosed' : 'recorder.stopped.ended');
  else if (event.type === 'error') void stopRecording('recorder.stopped.error');
  else if (event.type === 'levels') sendTo(panelWin, CH.levels, { mic: event.mic, system: event.system });
}

function onDisplayRemoved(_event: unknown, display: Electron.Display): void {
  if (session && display.id === session.displayId) void stopRecording('recorder.stopped.display');
  if (selectInit && display.id === selectInit.displayId) {
    closeSelect();
    if (phase === 'selecting') setPhase('idle');
  }
}

// ---------------------------------------------------------------------------
// Stopping

/** Stop and hand the recording to the pipeline. Idempotent; concurrent calls share one stop. */
export function stopRecording(reasonKey?: string): Promise<void> {
  const s = session;
  if (!s) {
    if (phase === 'starting') stopRequestedWhileStarting = true;
    return Promise.resolve();
  }
  if (phase === 'starting') {
    stopRequestedWhileStarting = true;
    s.stopWhenStarted = true;
    return Promise.resolve();
  }
  if (s.stopping) return s.stopping;
  if (phase !== 'recording' && phase !== 'paused') return Promise.resolve();
  s.stopReasonKey = reasonKey;
  s.stopping = (async () => {
    if (s.pausedSince !== null) {
      s.pausedTotalMs += Date.now() - s.pausedSince;
      s.pausedSince = null;
    }
    if (s.tick) clearInterval(s.tick);
    if (s.diskTick) clearInterval(s.diskTick);
    const durationMs = recordedMs(s.startedAt, Date.now(), s.pausedTotalMs, null);
    // The host flushes MediaRecorder's last chunk and says how many there were.
    const lastSeq = s.host.isDestroyed()
      ? -1
      : await new Promise<number>((resolve) => {
        const timer = setTimeout(() => resolve(-1), 8000);
        s.stoppedSeq = (n) => {
          clearTimeout(timer);
          resolve(n);
        };
        sendTo(s.host, CH.hostCommand, { type: 'stop' });
      });
    // Chunks still in flight over IPC: give them a moment to land, in order.
    const deadline = Date.now() + 5000;
    while (lastSeq >= 0 && s.sink.expected <= lastSeq && !s.sink.error && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
    }
    await s.sink.settle();
    try {
      await s.file?.close();
    } catch {
      /* already closed */
    }
    s.file = null;
    s.releaseCapture();
    if (!s.host.isDestroyed()) s.host.destroy();
    closeFrame();
    writeMeta({ ...s, pausedSince: null }, true);
    if (session === s) session = null;
    phase = 'idle';
    let bytes = 0;
    try {
      bytes = fs.statSync(s.partialPath).size;
    } catch {
      bytes = 0;
    }
    if (bytes === 0) {
      // Nothing was recorded (stopped within the first chunk): nothing to keep.
      try {
        fs.rmSync(s.partialPath, { force: true });
        fs.rmSync(s.metaPath, { force: true });
      } catch {
        /* best effort */
      }
      errorKey = 'recorder.error.empty';
      broadcast();
      return;
    }
    const meta = normalizePartialMeta(readJsonSync<unknown>(s.metaPath, null));
    const job = createJob(meta ?? {
      version: 1, id: s.id, startedAt: s.startedAt, title: s.title, folder: s.folder, quality: settings.quality,
      crop: s.crop, hasAudio: s.hasAudio, recordedMs: durationMs, complete: true, source: s.source,
    }, s.partialPath, s.stopReasonKey);
    broadcast();
    void runJob(job.id);
  })();
  return s.stopping;
}

// ---------------------------------------------------------------------------
// Jobs: finalize → import → transcribe → player

function createJob(meta: RecorderPartialMeta, partialPath: string, stopReasonKey?: string): RecorderJob {
  const job: RecorderJob = {
    id: meta.id,
    createdAt: Date.now(),
    title: meta.title,
    phase: 'finalizing',
    progress: 0,
    partialPath,
    durationMs: meta.recordedMs,
    hasAudio: null,
    transcript: 'off',
    source: meta.source ?? 'region',
    ...(stopReasonKey ? { stopReasonKey } : {}),
  };
  jobs = [...jobs.filter((j) => j.id !== job.id), job].slice(-5);
  jobRuns.set(job.id, { meta, finalize: null });
  return job;
}

const FINALIZE_ERROR_KEYS: Record<FinalizeErrorCode, string> = {
  'no-ffmpeg': 'recorder.job.error.noFfmpeg',
  'no-input': 'recorder.job.error.noInput',
  corrupt: 'recorder.job.error.corrupt',
  'disk-full': 'recorder.job.error.diskFull',
  cancelled: 'recorder.job.error.cancelled',
  failed: 'recorder.job.error.failed',
};

function partialMetaPathOf(partialPath: string): string {
  return partialPath.replace(/\.webm$/i, '.json');
}

/** Record in the partial's sidecar which MP4 it became, so recovery can tell it is done. */
function markPartialFinished(partialPath: string, output: string): void {
  const metaPath = partialMetaPathOf(partialPath);
  const raw = readJsonSync<unknown>(metaPath, null);
  const base = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
  try {
    writeJsonAtomicSync(metaPath, { ...base, finishedOutput: output }, { space: 0 });
  } catch {
    /* best effort: removing the partial below is the main path */
  }
}

/** Delete a finished partial; its sidecar (with the finished marker) stays while the WebM does. */
function removePartial(partialPath: string): void {
  try {
    fs.rmSync(partialPath, { force: true });
  } catch {
    /* locked: the marker keeps recovery from offering it */
  }
  if (fs.existsSync(partialPath)) return;
  const metaPath = partialMetaPathOf(partialPath);
  // The sidecar and its last-good copy (`atomicJson` keeps `<file>.bak`), which
  // was otherwise left behind in `.partial` for every finished recording.
  for (const file of [metaPath, `${metaPath}.bak`]) {
    try {
      fs.rmSync(file, { force: true });
    } catch {
      /* an orphan sidecar is ignored by recovery */
    }
  }
}

/** The finished, non-empty MP4 a partial's sidecar points at, if any. */
function finishedOutputOf(raw: unknown): string | null {
  const out = raw && typeof raw === 'object' ? (raw as Record<string, unknown>).finishedOutput : undefined;
  if (typeof out !== 'string' || !out) return null;
  try {
    return fs.statSync(out).size > 0 ? out : null;
  } catch {
    return null;
  }
}

async function runJob(jobId: string): Promise<void> {
  const run = jobRuns.get(jobId);
  const job = jobs.find((j) => j.id === jobId);
  if (!run || !job) return;
  const { meta } = run;
  const folder = meta.folder || recordingsFolder();
  try {
    fs.mkdirSync(folder, { recursive: true });
  } catch {
    /* finalize reports it */
  }
  const name = uniqueRecordingFileName(meta.title, 'mp4', (n) => fs.existsSync(path.join(folder, n)));
  const output = path.join(folder, name);
  patchJob(jobId, { phase: 'finalizing', progress: 0, errorKey: undefined, errorDetail: undefined });
  let lastSent = 0;
  // `software` never pays for detection; anything else uses the (cached) probe.
  const report = settings.encoder === 'software' ? null : await detectEncoders().catch(() => null);
  const chosen = resolveRecorderEncoder(settings.encoder, report);
  const handle = finalizeRecording({
    input: job.partialPath,
    output,
    crop: meta.crop,
    quality: meta.quality,
    encoder: chosen.encoder,
    fitToFirstFrame: meta.source === 'window',
    durationHintSec: meta.recordedMs > 0 ? meta.recordedMs / 1000 : undefined,
    onProgress: (fraction) => {
      const now = Date.now();
      if (now - lastSent < 500 && fraction < 1) return;
      lastSent = now;
      patchJob(jobId, { progress: fraction });
    },
  });
  run.finalize = handle;
  const result = await handle.done;
  run.finalize = null;
  if (!result.ok) {
    // The partial stays; Retry finishes it again.
    patchJob(jobId, { phase: 'error', errorKey: FINALIZE_ERROR_KEYS[result.error], errorDetail: result.detail?.slice(0, 300) });
    return;
  }
  // Marked first: a partial that cannot be deleted (locked) is still never offered again.
  markPartialFinished(job.partialPath, result.output);
  removePartial(job.partialPath);
  recoverable = recoverable.filter((r) => r.id !== jobId);
  const durationMs = result.durationSec ? Math.round(result.durationSec * 1000) : job.durationMs;
  patchJob(jobId, {
    phase: 'importing',
    progress: 1,
    outputPath: result.output,
    hasAudio: result.hasAudio,
    durationMs,
    encoder: result.encoder,
    ...(result.fellBack || chosen.fallback ? { encoderFellBack: true } : {}),
  });
  let bytes = 0;
  try {
    bytes = fs.statSync(result.output).size;
  } catch {
    bytes = 0;
  }
  // In the history from the moment the MP4 exists, whatever happens to the import.
  recordHistory({
    id: jobId,
    title: meta.title,
    outputPath: result.output,
    createdAt: meta.startedAt,
    studyDay: recorderStudyDay(meta.startedAt),
    durationMs,
    bytes,
    source: meta.source ?? 'region',
    hasAudio: result.hasAudio,
    encoder: result.encoder,
    transcript: 'off',
    studyTagged: false,
  });
  let mediaId: string | undefined;
  try {
    const added = await ingestMediaPaths([result.output], { title: meta.title }, 'recording');
    mediaId = added[0]?.id;
  } catch {
    mediaId = undefined;
  }
  if (mediaId) patchHistory(jobId, { mediaId });
  void tagStudyDay(jobId);
  if (!mediaId) {
    patchJob(jobId, { phase: 'ready', errorKey: 'recorder.job.error.import' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  patchJob(jobId, { mediaId });
  if (!result.hasAudio) {
    patchJob(jobId, { phase: 'ready', transcript: 'no-audio' });
    patchHistory(jobId, { transcript: 'no-audio' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  if (!settings.autoTranscribe) {
    patchJob(jobId, { phase: 'ready', transcript: 'off' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  await transcribeJob(jobId);
}

// ---------------------------------------------------------------------------
// History (`recordings-history.json`): every finished MP4, across restarts

let history: RecorderHistoryEntry[] | null = null;

function historyPath(): string {
  return path.join(app.getPath('userData'), 'recordings-history.json');
}

function loadHistory(): RecorderHistoryEntry[] {
  if (history) return history;
  try {
    history = recorderHistoryFromDisk(readJsonSync<unknown>(historyPath(), []));
  } catch {
    history = [];
  }
  return history;
}

function saveHistory(): void {
  try {
    writeJsonAtomicSync(historyPath(), loadHistory(), { space: 0 });
  } catch {
    /* the files are still on disk; only the list is lost */
  }
  for (const win of BrowserWindow.getAllWindows()) {
    if (win.isDestroyed() || win === session?.host) continue;
    sendTo(win, CH.historyChanged, loadHistory());
  }
}

function recordHistory(entry: RecorderHistoryEntry): void {
  const existing = loadHistory().find((e) => e.id === entry.id);
  // A retried finish keeps what the first one already learned (its tag, its media id).
  history = upsertRecorderHistory(loadHistory(), existing
    ? { ...entry, studyTagged: existing.studyTagged, ...(existing.mediaId ? { mediaId: existing.mediaId } : {}) }
    : entry);
  saveHistory();
}

function patchHistory(id: string, patch: Partial<RecorderHistoryEntry>): RecorderHistoryEntry | undefined {
  const entry = loadHistory().find((e) => e.id === id);
  if (!entry) return undefined;
  const next = { ...entry, ...patch };
  history = upsertRecorderHistory(loadHistory(), next);
  saveHistory();
  return next;
}

/** The finished recordings, newest first; ones whose file is gone are marked, not dropped. */
export function listRecorderHistory(): Array<RecorderHistoryEntry & { missing: boolean }> {
  return loadHistory().map((entry) => ({ ...entry, missing: !fs.existsSync(entry.outputPath) }));
}

function waitingForModelCount(): number {
  const ids = new Set(jobs.filter((j) => j.transcript === 'waiting-model').map((j) => j.id));
  for (const entry of history ?? []) if (entry.transcript === 'waiting-model') ids.add(entry.id);
  return ids.size;
}

async function historyAction(id: string, action: RecorderHistoryAction): Promise<{ ok: boolean; mediaId?: string; errorKey?: string }> {
  const entry = loadHistory().find((e) => e.id === id);
  if (!entry) return { ok: false, errorKey: 'rec2.history.error.gone' };
  if (action === 'show') {
    shell.showItemInFolder(entry.outputPath);
    return { ok: true };
  }
  if (action === 'open') {
    if (!fs.existsSync(entry.outputPath)) return { ok: false, errorKey: 'rec2.history.error.missing' };
    await openRecording(entry.outputPath, entry.mediaId);
    return { ok: true };
  }
  if (action === 'transcribe') {
    if (!entry.mediaId) return { ok: false, errorKey: 'rec2.history.error.notInLibrary' };
    const live = jobs.find((j) => j.id === id && j.mediaId);
    if (live) await transcribeJob(id);
    else await transcribeHistory(id);
    return { ok: true };
  }
  // delete: to the Recycle Bin / Trash, never unlinked — the confirmation in the UI
  // is the first safety, the bin the second.
  if (fs.existsSync(entry.outputPath)) {
    try {
      await shell.trashItem(entry.outputPath);
    } catch {
      return { ok: false, errorKey: 'rec2.history.error.delete' };
    }
  }
  history = loadHistory().filter((e) => e.id !== id);
  saveHistory();
  jobs = jobs.filter((j) => j.id !== id);
  broadcast();
  return { ok: true, ...(entry.mediaId ? { mediaId: entry.mediaId } : {}) };
}

// ---------------------------------------------------------------------------
// Study day: Calendar and Statistics live in the main window's storage, so that
// window files the recording (`recorderMainBridge.ts`); main remembers it did.

const studyTagPending = new Map<string, { resolve: (ok: boolean) => void; timer: NodeJS.Timeout }>();

async function tagStudyDay(id: string): Promise<boolean> {
  if (!loadSettings().studyTag) return false;
  const entry = loadHistory().find((e) => e.id === id);
  if (!entry || entry.studyTagged) return false;
  const win = deps?.getMainWindow() ?? null;
  if (!win || win.isDestroyed()) return false;
  const requestId = nextId('t');
  const request: RecorderStudyTagRequest = {
    requestId,
    id: entry.id,
    title: entry.title,
    studyDay: entry.studyDay,
    createdAt: entry.createdAt,
    seconds: Math.round(entry.durationMs / 1000),
    outputPath: entry.outputPath,
    ...(entry.mediaId ? { mediaId: entry.mediaId } : {}),
  };
  const ok = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      studyTagPending.delete(requestId);
      resolve(false);
    }, 8000);
    studyTagPending.set(requestId, { resolve, timer });
    sendTo(win, CH.studyTag, request);
  });
  if (ok) patchHistory(id, { studyTagged: true });
  return ok;
}

/** Recordings not yet on their study day (no main window at the time, or it did not answer). */
async function retryStudyTags(): Promise<void> {
  if (!loadSettings().studyTag) return;
  for (const entry of loadHistory().filter((e) => !e.studyTagged).slice(0, 20)) {
    if (!(await tagStudyDay(entry.id))) break;
  }
}

const modelPending = new Map<string, { resolve: (ready: boolean | null) => void; timer: NodeJS.Timeout }>();

/**
 * Whisper lives in the renderer, so a renderer of the same origin (same model
 * cache) answers: `via` when given (the window that just said a model
 * changed), else the panel.
 */
function askModelReady(lang: string, via?: Electron.WebContents | null): Promise<boolean | null> {
  const requestId = nextId('m');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      modelPending.delete(requestId);
      resolve(null);
    }, 8000);
    modelPending.set(requestId, { resolve, timer });
    if (via) {
      try {
        if (!via.isDestroyed()) via.send(CH.modelCheck, { requestId, lang });
      } catch {
        /* the asker went away: the timer answers null */
      }
      return;
    }
    const win = ensurePanel();
    const send = (): void => sendTo(win, CH.modelCheck, { requestId, lang });
    if (win.webContents.isLoading?.()) win.webContents.once('did-finish-load', send);
    else send();
  });
}

/** Queue one library item for Whisper in the study language. */
function enqueueRecordingTranscription(mediaId: string, lang: string): { ok: boolean; error?: string } {
  // Before the library's own subtitle discovery runs (it would queue the same job; duplicates merge).
  return enqueueTranscription({
    mediaId,
    lang,
    // A recording is not a deck: no automatic sentence cards; mining happens in the player.
    cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
  });
}

async function transcribeJob(jobId: string, via?: Electron.WebContents | null, knownReady?: boolean): Promise<void> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.mediaId) return;
  const lang = getMainStudyLang();
  patchJob(jobId, { phase: 'transcribing', transcript: 'checking' });
  const ready = knownReady ?? await askModelReady(lang, via);
  if (ready === false) {
    // A missing model would make every 30 s chunk time out into an empty transcript.
    // The recording waits instead, and starts on its own once the model is downloaded
    // (`onModelChanged`) — in this run or, through the history, the next.
    patchJob(jobId, { phase: 'ready', transcript: 'waiting-model' });
    patchHistory(jobId, { transcript: 'waiting-model' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  const queued = enqueueRecordingTranscription(job.mediaId, lang);
  if (!queued.ok) {
    patchJob(jobId, { phase: 'ready', transcript: 'failed', errorDetail: queued.error });
    patchHistory(jobId, { transcript: 'failed' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  patchJob(jobId, { transcript: 'queued' });
  patchHistory(jobId, { transcript: 'queued' });
}

/** A recording that is only in the history (its job card was dismissed, or the app restarted). */
async function transcribeHistory(id: string, via?: Electron.WebContents | null, knownReady?: boolean): Promise<void> {
  const entry = loadHistory().find((e) => e.id === id);
  if (!entry?.mediaId) return;
  const lang = getMainStudyLang();
  const ready = knownReady ?? await askModelReady(lang, via ?? deps?.getMainWindow()?.webContents ?? null);
  if (ready === false) {
    patchHistory(id, { transcript: 'waiting-model' });
    broadcast();
    return;
  }
  const queued = enqueueRecordingTranscription(entry.mediaId, lang);
  patchHistory(id, { transcript: queued.ok ? 'queued' : 'failed' });
  broadcast();
}

/**
 * A renderer saw the Whisper model set change (a download finished anywhere in
 * the app, or a window just started and says hello). Every recording waiting
 * for the model is checked once, and started if the model is there now.
 */
let modelCheckRunning: Promise<void> | null = null;

async function onModelChanged(via: Electron.WebContents | null): Promise<void> {
  void retryStudyTags();
  // Several windows hear the same download (the one that ran it, and every other
  // through the storage event): one check at a time, and each recording is
  // re-read just before it starts, so nothing is queued twice.
  if (modelCheckRunning) await modelCheckRunning.catch(() => undefined);
  const isWaiting = (state: string | undefined): boolean => state === 'waiting-model' || state === 'model-missing';
  if (!jobs.some((j) => isWaiting(j.transcript)) && !loadHistory().some((e) => e.transcript === 'waiting-model')) return;
  const run = (async () => {
    const ready = await askModelReady(getMainStudyLang(), via);
    if (ready !== true) return;
    for (const job of [...jobs]) {
      if (isWaiting(jobs.find((j) => j.id === job.id)?.transcript)) await transcribeJob(job.id, via, true);
    }
    for (const entry of [...loadHistory()]) {
      if (jobs.some((j) => j.id === entry.id)) continue;
      if (loadHistory().find((e) => e.id === entry.id)?.transcript === 'waiting-model') await transcribeHistory(entry.id, via, true);
    }
  })();
  modelCheckRunning = run;
  try {
    await run;
  } finally {
    if (modelCheckRunning === run) modelCheckRunning = null;
  }
}

function onTranscriptionProgress(progress: { mediaId: string; phase: string; done: number; total: number }): void {
  const entry = (history ?? []).find((e) => e.mediaId === progress.mediaId);
  if (entry) {
    const next = progress.phase === 'done' ? 'done'
      : progress.phase === 'error' || progress.phase === 'cancelled' ? 'failed'
        : progress.phase === 'queued' ? 'queued' : 'running';
    if (entry.transcript !== next) patchHistory(entry.id, { transcript: next });
  }
  const job = jobs.find((j) => j.mediaId === progress.mediaId && j.phase === 'transcribing');
  if (!job) return;
  if (progress.phase === 'done') {
    patchJob(job.id, { phase: 'ready', transcript: 'done', transcriptDone: progress.total, transcriptTotal: progress.total });
    if (settings.autoOpen) void openJob(job.id);
  } else if (progress.phase === 'error' || progress.phase === 'cancelled') {
    patchJob(job.id, { phase: 'ready', transcript: 'failed' });
    if (settings.autoOpen) void openJob(job.id);
  } else if (progress.phase !== 'queued') {
    patchJob(job.id, { transcript: 'running', transcriptDone: progress.done, transcriptTotal: progress.total });
  }
}

const openPending = new Map<string, { resolve: (reach: string | null) => void; timer: NodeJS.Timeout }>();

/**
 * Open a recording in the study player of the main window. When that window
 * has no player (or the player is switched off), the file plays in the
 * system's own player instead. Returns `''` on success in the player,
 * `'direct'` when it went to the system player, else the system's error.
 */
async function openRecording(outputPath: string, mediaId?: string): Promise<'' | 'direct' | string> {
  const win = deps?.getMainWindow() ?? null;
  let reach: string | null = null;
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    const requestId = nextId('o');
    reach = await new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        openPending.delete(requestId);
        resolve(null);
      }, 6000);
      openPending.set(requestId, { resolve, timer });
      sendTo(win, CH.openInPlayer, { requestId, path: outputPath, mediaId });
    });
  }
  if (reach === 'ready') return '';
  const failed = await shell.openPath(outputPath).catch((err: unknown) => String(err));
  return failed || 'direct';
}

async function openJob(jobId: string): Promise<void> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.outputPath) return;
  const outcome = await openRecording(job.outputPath, job.mediaId);
  if (outcome === '') {
    patchJob(jobId, { playedDirect: false });
    return;
  }
  patchJob(jobId, { playedDirect: true, ...(outcome !== 'direct' ? { errorKey: 'recorder.job.error.open', errorDetail: outcome } : {}) });
}

async function jobAction(jobId: string, action: RecorderJobAction): Promise<RecorderState> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job) return getRecorderState();
  if (action === 'open') await openJob(jobId);
  else if (action === 'show') shell.showItemInFolder(job.outputPath ?? job.partialPath);
  else if (action === 'transcribe' && job.mediaId) await transcribeJob(jobId);
  else if (action === 'retry' && job.phase === 'error') void runJob(jobId);
  else if (action === 'dismiss') {
    jobRuns.get(jobId)?.finalize?.cancel();
    jobs = jobs.filter((j) => j.id !== jobId);
    if (!jobs.some((j) => j.id === jobId)) jobRuns.delete(jobId);
    broadcast();
  }
  return getRecorderState();
}

// ---------------------------------------------------------------------------
// Recovery

/** Unfinished recordings left by a crash (or a failed finish) in the recordings folders. */
export function scanRecoverable(): RecorderRecoverable[] {
  const folders = [...new Set([recordingsFolder(), defaultRecordingsFolder()])];
  const found: RecorderRecoverable[] = [];
  const busy = new Set([session?.id, ...jobs.map((j) => j.id)].filter(Boolean));
  for (const folder of folders) {
    const dir = path.join(folder, RECORDER_PARTIAL_DIR);
    let names: string[] = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith('.webm')) continue;
      const id = name.slice(0, -5);
      if (busy.has(id)) continue;
      const partialPath = path.join(dir, name);
      let bytes = 0;
      try {
        bytes = fs.statSync(partialPath).size;
      } catch {
        continue;
      }
      if (bytes === 0) {
        // A start that died before its first chunk (crash, kill): nothing to recover, and
        // nothing else ever removes it — it used to sit in `.partial` for good.
        for (const file of [partialPath, path.join(dir, `${id}.json`), path.join(dir, `${id}.json.bak`)]) {
          try {
            fs.rmSync(file, { force: true });
          } catch {
            /* locked: tried again on the next scan */
          }
        }
        continue;
      }
      const raw = readJsonSync<unknown>(path.join(dir, `${id}.json`), null);
      if (finishedOutputOf(raw)) {
        // Already finished (the delete after it failed): tidy up instead of offering it again.
        removePartial(partialPath);
        continue;
      }
      const meta = normalizePartialMeta(raw);
      found.push({ id, partialPath, bytes, startedAt: meta?.startedAt ?? 0 });
    }
  }
  recoverable = found;
  return found;
}

function recoveryAction(id: string, action: RecorderRecoveryAction): RecorderState {
  const item = recoverable.find((r) => r.id === id);
  if (!item) return getRecorderState();
  if (action === 'show') shell.showItemInFolder(item.partialPath);
  else if (action === 'dismiss') dismissedRecoverable.add(id);
  else if (action === 'finish') {
    const dir = path.dirname(item.partialPath);
    const meta = normalizePartialMeta(readJsonSync<unknown>(path.join(dir, `${id}.json`), null)) ?? {
      version: 1 as const,
      id,
      startedAt: item.startedAt || Date.now(),
      title: recordingBaseName(new Date(item.startedAt || Date.now())),
      folder: path.dirname(dir),
      quality: settings.quality,
      crop: null,
      hasAudio: true,
      recordedMs: 0,
      complete: false,
    };
    recoverable = recoverable.filter((r) => r.id !== id);
    const job = createJob({ ...meta, folder: meta.folder || path.dirname(dir) }, item.partialPath);
    void runJob(job.id);
  }
  broadcast();
  return getRecorderState();
}

// ---------------------------------------------------------------------------
// Wiring

function fromWin(event: IpcMainEvent | Electron.IpcMainInvokeEvent, win: BrowserWindow | null | undefined): boolean {
  return !!win && !win.isDestroyed() && event.sender === win.webContents;
}

export function registerRegionRecorderIpc(): void {
  loadSettings();
  for (const [id, run, defaultKeys] of [
    ['recorder.region', () => void startRecorder('select'), 'Ctrl+Alt+Shift+E'],
    ['recorder.repeatRegion', () => void startRecorder('repeat'), ''],
    ['recorder.stop', () => void stopRecording(), ''],
    ['recorder.window', () => void startRecorder('window'), ''],
  ] as const) {
    registerGlobalCommand(id, run, { defaultKeys });
  }

  ipcMain.handle(CH.getState, () => getRecorderState());
  ipcMain.handle(CH.detectEncoders, async (_e, force: unknown) => {
    await detectEncoders(force === true).catch(() => null);
    broadcast();
    return getRecorderState();
  });
  ipcMain.handle(CH.listWindows, () => listRecordableWindows(true));
  ipcMain.handle(CH.historyList, () => listRecorderHistory());
  ipcMain.handle(CH.historyAction, (_e, id: unknown, action: unknown) =>
    historyAction(String(id ?? ''), RECORDER_HISTORY_ACTIONS.includes(action as RecorderHistoryAction)
      ? action as RecorderHistoryAction : 'show'));
  ipcMain.on(CH.modelChanged, (event) => {
    void onModelChanged(event.sender ?? null);
  });
  ipcMain.on(CH.studyTagReply, (_event, reply: { requestId?: string; ok?: boolean }) => {
    const pending = reply?.requestId ? studyTagPending.get(reply.requestId) : undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    studyTagPending.delete(String(reply.requestId));
    pending.resolve(reply.ok === true);
  });
  ipcMain.handle(CH.setSettings, (_e, patch: unknown) => {
    settings = normalizeRecorderSettings(patch, settings);
    saveSettings();
    broadcast();
    return getRecorderState();
  });
  ipcMain.handle(CH.start, (_e, mode: unknown, sourceId: unknown) =>
    startRecorder(
      mode === 'repeat' || mode === 'full' || mode === 'window' ? mode : 'select',
      typeof sourceId === 'string' && /^window:[\w:-]{1,80}$/.test(sourceId) ? { sourceId } : {},
    ));
  ipcMain.handle(CH.stop, async () => {
    if (phase === 'error') {
      // The panel's Dismiss on a failed start.
      errorKey = undefined;
      errorDetail = undefined;
      setPhase('idle');
      return getRecorderState();
    }
    await stopRecording();
    return getRecorderState();
  });
  ipcMain.handle(CH.pause, (_e, paused: unknown) => setPaused(paused === true));
  ipcMain.handle(CH.chooseFolder, async () => {
    const parent = deps?.getMainWindow() ?? undefined;
    const options: Electron.OpenDialogOptions = {
      title: mt('recorder.settings.folderPick'),
      defaultPath: recordingsFolder(),
      properties: ['openDirectory', 'createDirectory'],
    };
    const picked = parent && !parent.isDestroyed()
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (!picked.canceled && picked.filePaths[0]) {
      settings = normalizeRecorderSettings({ folder: picked.filePaths[0] }, settings);
      saveSettings();
      broadcast();
    }
    return getRecorderState();
  });
  ipcMain.handle(CH.jobAction, (_e, id: unknown, action: unknown) =>
    jobAction(String(id ?? ''), ['open', 'show', 'transcribe', 'retry', 'dismiss'].includes(String(action))
      ? action as RecorderJobAction : 'show'));
  ipcMain.handle(CH.recoveryAction, (_e, id: unknown, action: unknown) =>
    recoveryAction(String(id ?? ''), ['finish', 'show', 'dismiss'].includes(String(action))
      ? action as RecorderRecoveryAction : 'show'));

  ipcMain.handle(CH.selectGetInit, () => selectInit);
  ipcMain.handle(CH.selectDone, async (event, region: unknown) => {
    if (!fromWin(event, selectWin) || !selectInit) return getRecorderState();
    const init = selectInit;
    closeSelect();
    const r = region && typeof region === 'object' ? region as Record<string, unknown> : null;
    const rect = r ? { x: Number(r.x), y: Number(r.y), width: Number(r.width), height: Number(r.height) } : null;
    if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) {
      setPhase('idle');
      return getRecorderState();
    }
    const display = screen.getAllDisplays().find((d) => d.id === init.displayId);
    if (!display) {
      failStart('recorder.stopped.display');
      return getRecorderState();
    }
    phase = 'idle';
    await beginRecording(display, {
      x: Math.round(Math.max(0, rect.x)),
      y: Math.round(Math.max(0, rect.y)),
      width: Math.round(Math.min(rect.width, display.bounds.width)),
      height: Math.round(Math.min(rect.height, display.bounds.height)),
    });
    return getRecorderState();
  });
  ipcMain.handle(CH.selectNextDisplay, (event) => {
    if (!fromWin(event, selectWin) || !selectInit) return null;
    const displays = screen.getAllDisplays();
    const id = nextDisplayId(displays, selectInit.displayId);
    const display = displays.find((d) => d.id === id);
    if (display) openSelect(display);
    return selectInit;
  });

  ipcMain.on(CH.hostChunk, (event, chunkSeq: unknown, data: unknown) => {
    const s = session;
    if (!s || !fromWin(event, s.host)) return;
    if (!(data instanceof Uint8Array) && !(data instanceof ArrayBuffer)) return;
    s.sink.push(Number(chunkSeq), Buffer.from(data instanceof ArrayBuffer ? new Uint8Array(data) : data));
  });
  ipcMain.on(CH.hostEvent, (event, payload: RecorderHostEvent) => {
    if (!session || !fromWin(event, session.host) || !payload || typeof payload !== 'object') return;
    onHostEvent(payload);
  });
  ipcMain.on(CH.panelResize, (event, height: unknown) => {
    if (fromWin(event, panelWin) && Number.isFinite(Number(height))) resizePanel(Number(height));
  });
  ipcMain.on(CH.modelCheckReply, (_event, reply: { requestId?: string; ready?: boolean }) => {
    const pending = reply?.requestId ? modelPending.get(reply.requestId) : undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    modelPending.delete(String(reply.requestId));
    pending.resolve(typeof reply.ready === 'boolean' ? reply.ready : null);
  });
  ipcMain.on(CH.openInPlayerReply, (_event, reply: { requestId?: string; reach?: string }) => {
    const pending = reply?.requestId ? openPending.get(reply.requestId) : undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    openPending.delete(String(reply.requestId));
    pending.resolve(typeof reply.reach === 'string' ? reply.reach : null);
  });

  onMainTranscriptionProgress(onTranscriptionProgress);
  screen.on('display-removed', onDisplayRemoved);
  // Any app window closing may leave the panel as the last window (see `syncPanel`).
  app.on('browser-window-created', (_event, win) => {
    win.once('closed', () => setImmediate(onAppWindowClosed));
  });

  app.on('before-quit', () => {
    // Quitting mid-recording: close the file so what was recorded is recoverable next time.
    const s = session;
    if (s) {
      if (s.tick) clearInterval(s.tick);
      if (s.diskTick) clearInterval(s.diskTick);
      void s.file?.close().catch(() => undefined);
      s.file = null;
    }
    setRecordingIndicator('recorder', null);
  });
  app.on('will-quit', cancelFinalizesOnQuit);
}

/**
 * The app is going: kill any ffmpeg still finishing a recording so it does not
 * outlive us. Never blocks the quit; the partial stays and is offered next time.
 */
function cancelFinalizesOnQuit(): void {
  for (const run of jobRuns.values()) {
    const handle = run.finalize;
    run.finalize = null;
    try {
      handle?.cancel();
    } catch {
      /* already gone */
    }
  }
}

function onAppWindowClosed(): void {
  if (panelWin && !panelWin.isDestroyed()) syncPanel();
}

/** After the first paint: offer recordings a crash left unfinished. */
export function startRegionRecorder(): void {
  loadSettings();
  loadHistory();
  if (scanRecoverable().length) broadcast();
}

export const __regionRecorderTestables = {
  setFreeBytesProbe: (probe: (dir: string) => Promise<number | null>): void => {
    freeBytesProbe = probe;
  },
  recorderTick,
  diskTick,
  onDisplayRemoved,
  cancelFinalizesOnQuit,
  onAppWindowClosed,
  setHostStartTimeout: (ms: number): void => {
    RECORDER_HOST_START_TIMEOUT_MS = ms;
  },
  setEncoderDetector: (detector: (force?: boolean) => Promise<RecorderEncoderReport>): void => {
    encoderDetector = detector;
  },
  onModelChanged,
  retryStudyTags,
  session: (): Session | null => session,
  reset: (): void => {
    if (session) {
      session.releaseCapture();
      if (session.tick) clearInterval(session.tick);
      if (session.diskTick) clearInterval(session.diskTick);
      if (!session.host.isDestroyed()) session.host.destroy();
    }
    closeFrame();
    session = null;
    stopRequestedWhileStarting = false;
    phase = 'idle';
    jobs = [];
    recoverable = [];
    errorKey = undefined;
    jobRuns.clear();
    dismissedRecoverable.clear();
    closeSelect();
    history = null;
    lastEncoderReport = null;
  },
};
