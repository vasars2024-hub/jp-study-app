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
import { registerDisplayMediaRequester } from './displayMediaBroker';
import { setRecordingIndicator } from './recordingIndicator';
import { coverDisplay, pickScreenSource } from './screenSources';
import { registerGlobalCommand } from './globalCommands';
import { mt } from './i18n';
import { getMainStudyLang } from './studyLanguage';
import { ingestMediaPaths } from './mediaIngest';
import { enqueueTranscription, onMainTranscriptionProgress } from './transcriptionJobs';
import { finalizeRecording, type FinalizeErrorCode, type FinalizeHandle } from './recordingFinalize';
import {
  DEFAULT_RECORDER_SETTINGS,
  OrderedChunkSink,
  RECORDER_CHANNELS as CH,
  RECORDER_CHUNK_MS,
  RECORDER_DEFAULT_FOLDER_NAME,
  RECORDER_MIN_REGION,
  RECORDER_PARTIAL_DIR,
  diskSpaceVerdict,
  formatRecorderClock,
  freeBytesFromStatfs,
  nextDisplayId,
  normalizePartialMeta,
  normalizeRecorderSettings,
  recordedMs,
  recorderLimitReached,
  recorderPartialId,
  recorderVideoBitrate,
  recorderWantsSystemAudio,
  recordingBaseName,
  resolveRecorderRepeat,
  toGlobal,
  uniqueRecordingFileName,
  type CropPx,
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
  type RecorderStartMode,
  type RecorderState,
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

// ---------------------------------------------------------------------------
// State

interface Session {
  id: string;
  displayId: number;
  displayBounds: RectLike;
  region: RectLike;
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

function panelWanted(): boolean {
  return phase === 'recording' || phase === 'paused' || phase === 'starting'
    || jobs.length > 0 || getRecorderState().recoverable.length > 0 || phase === 'error';
}

function ensurePanel(): BrowserWindow {
  if (panelWin && !panelWin.isDestroyed()) return panelWin;
  const work = (session ? screen.getAllDisplays().find((d) => d.id === session?.displayId) : null)?.workArea
    ?? screen.getPrimaryDisplay().workArea;
  const height = 120;
  const win = new BrowserWindow({
    ...baseOverlayOptions(),
    transparent: false,
    backgroundColor: '#1b1b1f',
    x: Math.round(work.x + work.width - PANEL_WIDTH - 16),
    y: Math.round(work.y + work.height - height - 16),
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
  win.on('closed', () => {
    if (panelWin === win) panelWin = null;
  });
  void win.loadURL(urlFor('panel'));
  return win;
}

function syncPanel(): void {
  if (!panelWanted()) {
    if (panelWin && !panelWin.isDestroyed() && panelWin.isVisible()) panelWin.hide();
    return;
  }
  const win = ensurePanel();
  if (!win.isVisible() && win.webContents.isLoading?.() === false) win.showInactive();
}

function resizePanel(height: number): void {
  const win = panelWin;
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  const h = Math.round(Math.min(560, Math.max(64, height)));
  if (h === b.height) return;
  win.setBounds({ x: b.x, y: b.y + b.height - h, width: b.width, height: h });
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
export async function startRecorder(mode: RecorderStartMode = 'select'): Promise<RecorderState> {
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
    await beginRecording(display, { x: 0, y: 0, width: display.bounds.width, height: display.bounds.height });
    return getRecorderState();
  }
  openSelect(display);
  return getRecorderState();
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

async function beginRecording(display: Electron.Display, region: RectLike): Promise<void> {
  if (phase === 'starting' || phase === 'recording' || phase === 'paused') return;
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
  const releaseCapture = registerDisplayMediaRequester(host.webContents, async () => {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 256, height: 256 } });
    const source = pickScreenSource(sources, screen.getAllDisplays(), display);
    if (!source) return null;
    return loopback ? { video: source, audio: 'loopback' } : { video: source };
  });

  const s: Session = {
    id,
    displayId: display.id,
    displayBounds: display.bounds,
    region,
    title: recordingBaseName(new Date(startedAt)),
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
  };
  let result: RecorderHostStartResult | null = null;
  if (up) {
    try {
      // `userGesture: true`: getDisplayMedia wants a user activation, and this start is the user's.
      result = await host.webContents.executeJavaScript(`window.__gumRecorderStart(${JSON.stringify(config)})`, true);
    } catch (err) {
      result = { ok: false, error: err instanceof Error ? err.message : String(err) };
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
  settings = { ...settings, lastRegion: { displayId: display.id, ...region } };
  saveSettings();
  writeMeta(s, false);
  phase = 'recording';
  showFrame(s);
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
  else if (event.type === 'ended') void stopRecording('recorder.stopped.ended');
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
      crop: s.crop, hasAudio: s.hasAudio, recordedMs: durationMs, complete: true,
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
  try {
    fs.rmSync(partialMetaPathOf(partialPath), { force: true });
  } catch {
    /* an orphan sidecar is ignored by recovery */
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
  const handle = finalizeRecording({
    input: job.partialPath,
    output,
    crop: meta.crop,
    quality: meta.quality,
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
  patchJob(jobId, {
    phase: 'importing',
    progress: 1,
    outputPath: result.output,
    hasAudio: result.hasAudio,
    durationMs: result.durationSec ? Math.round(result.durationSec * 1000) : job.durationMs,
  });
  let mediaId: string | undefined;
  try {
    const added = await ingestMediaPaths([result.output], { title: meta.title }, 'recording');
    mediaId = added[0]?.id;
  } catch {
    mediaId = undefined;
  }
  if (!mediaId) {
    patchJob(jobId, { phase: 'ready', errorKey: 'recorder.job.error.import' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  patchJob(jobId, { mediaId });
  if (!result.hasAudio) {
    patchJob(jobId, { phase: 'ready', transcript: 'no-audio' });
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

const modelPending = new Map<string, { resolve: (ready: boolean | null) => void; timer: NodeJS.Timeout }>();

/** Whisper lives in the renderer, so the panel (same origin, same model cache) answers. */
function askModelReady(lang: string): Promise<boolean | null> {
  const win = ensurePanel();
  const requestId = nextId('m');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      modelPending.delete(requestId);
      resolve(null);
    }, 8000);
    modelPending.set(requestId, { resolve, timer });
    const send = (): void => sendTo(win, CH.modelCheck, { requestId, lang });
    if (win.webContents.isLoading?.()) win.webContents.once('did-finish-load', send);
    else send();
  });
}

async function transcribeJob(jobId: string): Promise<void> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.mediaId) return;
  const lang = getMainStudyLang();
  patchJob(jobId, { phase: 'transcribing', transcript: 'checking' });
  const ready = await askModelReady(lang);
  if (ready === false) {
    // A missing model would make every 30 s chunk time out into an empty transcript.
    patchJob(jobId, { phase: 'ready', transcript: 'model-missing' });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  // Before the library's own subtitle discovery runs (it would queue the same job; duplicates merge).
  const queued = enqueueTranscription({
    mediaId: job.mediaId,
    lang,
    // A recording is not a deck: no automatic sentence cards; mining happens in the player.
    cardOptions: { createCards: false, translateToEnglish: false, includeAudio: false },
  });
  if (!queued.ok) {
    patchJob(jobId, { phase: 'ready', transcript: 'failed', errorDetail: queued.error });
    if (settings.autoOpen) void openJob(jobId);
    return;
  }
  patchJob(jobId, { transcript: 'queued' });
}

function onTranscriptionProgress(progress: { mediaId: string; phase: string; done: number; total: number }): void {
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
 * Open a finished recording in the study player of the main window. When that
 * window has no player (or the player is switched off), the file plays in the
 * system's own player instead, and the job says so.
 */
async function openJob(jobId: string): Promise<void> {
  const job = jobs.find((j) => j.id === jobId);
  if (!job?.outputPath) return;
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
      sendTo(win, CH.openInPlayer, { requestId, path: job.outputPath, mediaId: job.mediaId });
    });
  }
  if (reach === 'ready') {
    patchJob(jobId, { playedDirect: false });
    return;
  }
  const failed = await shell.openPath(job.outputPath).catch((err: unknown) => String(err));
  patchJob(jobId, { playedDirect: true, ...(failed ? { errorKey: 'recorder.job.error.open', errorDetail: failed } : {}) });
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
      if (bytes === 0) continue;
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
  ] as const) {
    registerGlobalCommand(id, run, { defaultKeys });
  }

  ipcMain.handle(CH.getState, () => getRecorderState());
  ipcMain.handle(CH.setSettings, (_e, patch: unknown) => {
    settings = normalizeRecorderSettings(patch, settings);
    saveSettings();
    broadcast();
    return getRecorderState();
  });
  ipcMain.handle(CH.start, (_e, mode: unknown) =>
    startRecorder(mode === 'repeat' || mode === 'full' ? mode : 'select'));
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

/** After the first paint: offer recordings a crash left unfinished. */
export function startRegionRecorder(): void {
  loadSettings();
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
  },
};
