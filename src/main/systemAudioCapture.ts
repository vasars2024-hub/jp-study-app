/**
 * System-audio capture and the live-captions overlay — the main-process half.
 *
 * Three windows take part:
 *
 * - a HIDDEN capture window (`?audioCapture=1`, `renderer/captions/
 *   systemAudioCaptureHost.ts`) that holds the Windows loopback stream in a
 *   rolling in-memory buffer (`shared/systemAudioRing.ts`). It exists only while
 *   capture is on and is destroyed when it goes off, buffer and all;
 * - the OVERLAY (`?captionsOverlay=1`, `renderer/captions/CaptionsOverlay.tsx`):
 *   an always-on-top, click-through caption bar with word lookup, history, and
 *   the review card for a mined clip;
 * - the MAIN window, where every card is actually made — mining runs in the
 *   renderer (`studyMining.ts` `mineToStudy`), so a confirmed draft is
 *   forwarded there the way `extension:mined` is.
 *
 * Privacy: capture is off by default and only the user turns it on (Settings,
 * the overlay's switch, the tray, or a shortcut). While it is on a tray icon
 * says so. The buffer never leaves the capture window's memory until the user
 * mines; a mined clip is encoded through ffmpeg's pipes (no temporary file) and
 * held in memory as a draft until the user adds it, and only then does
 * `mineToStudy` store it with the card. Turning capture off destroys the
 * capture window, which is the buffer. Settings (never audio) persist in
 * `<userData>/live-captions/overlay.json`.
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import {
  app,
  BrowserWindow,
  desktopCapturer,
  ipcMain,
  Menu,
  nativeImage,
  screen,
  session,
  Tray,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
  type Rectangle,
} from 'electron';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';
import { allowDisplayCapture } from './securityHardening';
import { encodeWavToMp3 } from './captionAudioEncode';
import { foregroundWindowTitle } from './foregroundWindow';
import { getMainStudyLang } from './studyLanguage';
import { mt } from './i18n';
import {
  feedLiveCaptionsPollerLine,
  getLiveCaptionsStatus,
  onLiveCaptionsEvent,
  releaseLiveCaptionsForOverlay,
  startLiveCaptionsCapture,
} from './liveCaptions';
import { registerGlobalCommand } from './globalCommands';
import {
  CAPTIONS_CHANNELS as CH,
  DEFAULT_CAPTIONS_SETTINGS,
  OVERLAY_DEFAULT_HEIGHT,
  OVERLAY_DEFAULT_WIDTH,
  OVERLAY_HEADROOM,
  OVERLAY_HISTORY_MAX,
  OVERLAY_MAX_HEIGHT,
  OVERLAY_MAX_WIDTH,
  OVERLAY_MIN_HEIGHT,
  OVERLAY_MIN_WIDTH,
  captionClipFilename,
  lineAudioWindow,
  normalizeBounds,
  normalizeCaptionsSettings,
  type CaptionDraft,
  type CaptionMinePayload,
  type CaptionMineReply,
  type CaptionNotice,
  type CaptionOverlayLine,
  type CaptionsSettings,
  type CaptionsState,
  type CaptureIndicator,
  type OverlayBounds,
} from '../shared/captionsOverlay';
import { MANUAL_RECORDING_MAX_SECONDS } from '../shared/systemAudioRing';

type RendererUrlFn = (query?: string) => string;
type WindowFn = (win: BrowserWindow) => void;

interface CaptureDeps {
  rendererUrl: RendererUrlFn;
  getMainWindow: () => BrowserWindow | null;
  forwardConsole?: WindowFn;
  attachNavGuards?: WindowFn;
  isDevServer: boolean;
}

let deps: CaptureDeps | null = null;

/** Tests of the whole path drive the packaged app with this switch (see verify.mjs). */
const TEST_SWITCH = '--gum-captions-test';

// ---------------------------------------------------------------------------
// Settings (never audio)

let settings: CaptionsSettings = { ...DEFAULT_CAPTIONS_SETTINGS };
let settingsLoaded = false;

function stateDir(): string {
  return path.join(app.getPath('userData'), 'live-captions');
}

function settingsPath(): string {
  return path.join(stateDir(), 'overlay.json');
}

function loadSettings(): CaptionsSettings {
  if (settingsLoaded) return settings;
  settingsLoaded = true;
  try {
    settings = normalizeCaptionsSettings(readJsonSync<unknown>(settingsPath(), {}));
  } catch {
    settings = { ...DEFAULT_CAPTIONS_SETTINGS };
  }
  return settings;
}

let saveTimer: NodeJS.Timeout | null = null;

function saveSettingsSoon(): void {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveSettingsNow();
  }, 400);
}

function saveSettingsNow(): void {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
    writeJsonAtomicSync(settingsPath(), settings, { space: 0 });
  } catch {
    /* a lost preference never fails capture */
  }
}

// ---------------------------------------------------------------------------
// State

let captureWin: BrowserWindow | null = null;
let releaseDisplayCapture: (() => void) | null = null;
let overlayWin: BrowserWindow | null = null;
let overlayOpen = false;
let capture: CaptureIndicator = 'off';
let captureErrorKey: string | undefined;
let captureErrorDetail: string | undefined;
let bufferedMs = 0;
let recordingSince: number | null = null;
/** Capture was off when the recording started, so it goes off again after. */
let recordingOwnsCapture = false;
let gumModelMissing = false;
let windowsAttached = false;
let windowsWaiting = false;
/** When the bar was opened: Live Captions lines older than this are the notebook's past, not live. */
let overlaySince = 0;

let lines: CaptionOverlayLine[] = [];
let drafts: CaptionDraft[] = [];

let notices: CaptionNotice[] = [];

let seq = 0;
const nextId = (prefix: string): string => `${prefix}-${Date.now().toString(36)}-${(seq += 1)}`;

export function getCaptionsState(): CaptionsState {
  loadSettings();
  return {
    settings,
    capture,
    captureErrorKey,
    captureErrorDetail,
    bufferedMs,
    recordingSince,
    overlayOpen,
    windowsAttached,
    windowsWaiting,
    gumModelMissing,
    supported: process.platform === 'win32',
    studyLang: getMainStudyLang(),
  };
}

function appWindows(): BrowserWindow[] {
  return BrowserWindow.getAllWindows().filter((w) => !w.isDestroyed() && w !== captureWin);
}

function sendTo(win: BrowserWindow | null, channel: string, payload: unknown): void {
  try {
    if (win && !win.isDestroyed()) win.webContents.send(channel, payload);
  } catch {
    /* torn down mid-send */
  }
}

let stateTimer: NodeJS.Timeout | null = null;

function broadcastStateNow(): void {
  if (stateTimer) {
    clearTimeout(stateTimer);
    stateTimer = null;
  }
  const state = getCaptionsState();
  for (const win of appWindows()) sendTo(win, CH.state, state);
  refreshTray();
}

/** Buffer-fill ticks arrive every second; the UI needs them far less often. */
function broadcastStateSoon(): void {
  if (stateTimer) return;
  stateTimer = setTimeout(broadcastStateNow, 1500);
}

function sendLines(): void {
  sendTo(overlayWin, CH.lines, lines);
}

function sendDrafts(): void {
  sendTo(overlayWin, CH.drafts, { drafts, notices });
  syncOverlayVisibility();
}

function notice(key: string, kind: CaptionNotice['kind'] = 'info', vars?: CaptionNotice['vars'], ttlMs = 6000): void {
  const item: CaptionNotice = { id: nextId('n'), key, kind, vars };
  notices = [...notices.slice(-3), item];
  ensureOverlayWindow();
  sendDrafts();
  setTimeout(() => {
    notices = notices.filter((n) => n.id !== item.id);
    sendDrafts();
  }, ttlMs);
}

// ---------------------------------------------------------------------------
// The capture window

const hostPending = new Map<string, { resolve: (value: unknown) => void; timer: NodeJS.Timeout }>();

function hostRequest<T>(command: Record<string, unknown>, timeoutMs = 15_000): Promise<T | null> {
  const win = captureWin;
  if (!win || win.isDestroyed()) return Promise.resolve(null);
  const id = nextId('h');
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      hostPending.delete(id);
      resolve(null);
    }, timeoutMs);
    hostPending.set(id, { resolve: (v) => resolve(v as T), timer });
    sendTo(win, CH.hostCommand, { id, ...command });
  });
}

function rejectHostPending(): void {
  for (const [id, pending] of hostPending) {
    clearTimeout(pending.timer);
    pending.resolve(null);
    hostPending.delete(id);
  }
}

function hostConfig(): Record<string, unknown> {
  return {
    seconds: settings.captureSeconds,
    gum: settings.source === 'gum' && overlayOpen,
    lang: getMainStudyLang(),
  };
}

function createCaptureWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 320,
    height: 200,
    show: false,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // A hidden window's timers and audio callbacks must keep running.
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  releaseDisplayCapture = allowDisplayCapture(win.webContents.id);
  deps?.attachNavGuards?.(win);
  if (deps?.isDevServer) deps.forwardConsole?.(win);
  win.on('closed', () => {
    if (captureWin === win) {
      captureWin = null;
      releaseDisplayCapture?.();
      releaseDisplayCapture = null;
      rejectHostPending();
      if (capture !== 'off') {
        capture = 'off';
        bufferedMs = 0;
        recordingSince = null;
        broadcastStateNow();
      }
    }
  });
  win.webContents.on('render-process-gone', () => {
    if (!win.isDestroyed()) win.destroy();
  });
  return win;
}

function waitForLoad(win: BrowserWindow): Promise<boolean> {
  return new Promise((resolve) => {
    if (win.isDestroyed()) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => resolve(false), 30_000);
    // Turned off while loading: a destroyed window never finishes loading.
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

/** The host installs `window.__gumCaptureStart` once its module has run. */
async function waitForHost(win: BrowserWindow): Promise<boolean> {
  for (let i = 0; i < 100; i += 1) {
    if (win.isDestroyed()) return false;
    try {
      if (await win.webContents.executeJavaScript('typeof window.__gumCaptureStart === "function"')) return true;
    } catch {
      /* still loading */
    }
    await new Promise((r) => setTimeout(r, 150));
  }
  return false;
}

function failCapture(key: string, detail?: string): { ok: false; errorKey: string } {
  capture = 'error';
  captureErrorKey = key;
  captureErrorDetail = detail?.slice(0, 300);
  const win = captureWin;
  captureWin = null;
  if (win && !win.isDestroyed()) win.destroy();
  releaseDisplayCapture?.();
  releaseDisplayCapture = null;
  broadcastStateNow();
  return { ok: false, errorKey: key };
}

export async function startCapture(): Promise<{ ok: boolean; errorKey?: string }> {
  loadSettings();
  if (process.platform !== 'win32') return failCapture('captions.error.unsupported');
  if (capture === 'on' || capture === 'starting') return { ok: true };
  capture = 'starting';
  captureErrorKey = undefined;
  captureErrorDetail = undefined;
  broadcastStateNow();
  const win = createCaptureWindow();
  captureWin = win;
  // Turned off (or off and on again) while this start was still under way: the
  // later action owns the state and the window. This start only makes sure its
  // own window is gone — failing here would mark capture "error", and destroy
  // the NEW window, after the user had simply changed their mind.
  const superseded = (): { ok: boolean } => {
    if (!win.isDestroyed()) win.destroy();
    return { ok: capture === 'on' };
  };
  const loaded = waitForLoad(win);
  void win.loadURL(deps ? deps.rendererUrl('audioCapture=1') : 'app://bundle/index.html?audioCapture=1');
  const hostUp = (await loaded) && (await waitForHost(win));
  if (captureWin !== win) return superseded();
  if (!hostUp) return failCapture('captions.error.hostFailed');
  let result: { ok?: boolean; error?: string } | null = null;
  try {
    // `userGesture: true` — getDisplayMedia wants a user activation, and this
    // start IS the user's: a switch, a menu item or a shortcut they pressed.
    result = await win.webContents.executeJavaScript(
      `window.__gumCaptureStart(${JSON.stringify(hostConfig())})`,
      true,
    );
  } catch (err) {
    if (captureWin !== win) return superseded();
    return failCapture('captions.error.streamFailed', err instanceof Error ? err.message : String(err));
  }
  if (captureWin !== win) return superseded();
  if (!result?.ok) return failCapture('captions.error.streamFailed', result?.error);
  capture = 'on';
  broadcastStateNow();
  return { ok: true };
}

/** Capture off: the window that holds the buffer is destroyed, and the buffer with it. */
export function stopCapture(): void {
  const win = captureWin;
  captureWin = null;
  rejectHostPending();
  releaseDisplayCapture?.();
  releaseDisplayCapture = null;
  if (win && !win.isDestroyed()) win.destroy();
  capture = 'off';
  captureErrorKey = undefined;
  captureErrorDetail = undefined;
  bufferedMs = 0;
  recordingSince = null;
  recordingOwnsCapture = false;
  gumModelMissing = false;
  broadcastStateNow();
}

export async function setCaptureEnabled(on: boolean): Promise<CaptionsState> {
  if (on) await startCapture();
  else stopCapture();
  return getCaptionsState();
}

function installDisplayMediaHandler(): void {
  try {
    session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
      const win = captureWin;
      const frame = request.frame;
      const fromCapture =
        !!win
        && !win.isDestroyed()
        && !!frame
        && frame.processId === win.webContents.mainFrame.processId
        && frame.routingId === win.webContents.mainFrame.routingId;
      if (!fromCapture || process.platform !== 'win32') {
        // Nobody else in the app asks for the screen; refuse whoever does.
        callback({});
        return;
      }
      desktopCapturer
        .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const primaryId = String(screen.getPrimaryDisplay().id);
          const source = sources.find((s) => s.display_id === primaryId) ?? sources[0];
          if (!source) {
            callback({});
            return;
          }
          // The video track is required by Chromium and stopped by the host on arrival.
          callback({ video: source, audio: 'loopback' });
        })
        .catch(() => callback({}));
    });
  } catch {
    /* an older runtime without the handler: capture reports stream failure */
  }
}

// ---------------------------------------------------------------------------
// Mining

interface CutResult {
  ok: boolean;
  error?: string;
  sliceId?: string;
  wavBase64?: string;
  startMs?: number;
  endMs?: number;
  durationMs?: number;
  rms?: number;
  peak?: number;
  silent?: boolean;
}

interface TranscribeResult {
  ok: boolean;
  text?: string;
  modelMissing?: boolean;
  error?: string;
}

function pushDraft(draft: CaptionDraft): void {
  drafts = [...drafts.slice(-4), draft];
  ensureOverlayWindow();
  sendDrafts();
}

function patchDraft(id: string, patch: Partial<CaptionDraft>): void {
  drafts = drafts.map((d) => (d.id === id ? { ...d, ...patch } : d));
  sendDrafts();
}

/** Encode a cut and describe its audio for a draft. */
async function audioForCut(cut: CutResult): Promise<Pick<CaptionDraft, 'audioBase64' | 'audioMime' | 'audioFilename' | 'durationMs'>> {
  if (!cut.ok || !cut.wavBase64) return { durationMs: 0 };
  const wav = Buffer.from(cut.wavBase64, 'base64');
  const durationMs = cut.durationMs ?? 0;
  const start = cut.startMs ?? Date.now();
  const mp3 = await encodeWavToMp3(wav, durationMs / 1000);
  if (mp3.ok && mp3.bytes) {
    return {
      audioBase64: mp3.bytes.toString('base64'),
      audioMime: 'audio/mpeg',
      audioFilename: captionClipFilename(start, 'mp3'),
      durationMs,
    };
  }
  // No ffmpeg: the WAV itself is a valid card clip (the mined-media store takes .wav).
  return { audioBase64: cut.wavBase64, audioMime: 'audio/wav', audioFilename: captionClipFilename(start, 'wav'), durationMs };
}

async function transcribeDraft(draftId: string, sliceId: string): Promise<void> {
  const result = await hostRequest<TranscribeResult>(
    { type: 'transcribe', sliceId, lang: getMainStudyLang() },
    240_000,
  );
  if (!drafts.some((d) => d.id === draftId)) return;
  if (!result) {
    patchDraft(draftId, { transcript: 'failed' });
  } else if (result.modelMissing) {
    patchDraft(draftId, { transcript: 'model-missing' });
  } else if (!result.ok) {
    patchDraft(draftId, { transcript: 'failed' });
  } else {
    const current = drafts.find((d) => d.id === draftId);
    // Never overwrite what the user already typed.
    patchDraft(draftId, { transcript: 'done', ...(current && !current.text.trim() ? { text: (result.text ?? '').trim() } : {}) });
  }
}

async function draftFromCut(
  cut: CutResult | null,
  kind: CaptionDraft['kind'],
  titlePromise: Promise<string>,
): Promise<{ ok: boolean; draftId?: string; errorKey?: string }> {
  if (!cut?.ok) {
    notice('captions.notice.cutFailed', 'warning');
    return { ok: false, errorKey: 'captions.notice.cutFailed' };
  }
  if (cut.silent) {
    notice('captions.notice.silent', 'warning');
    return { ok: false, errorKey: 'captions.notice.silent' };
  }
  const [audio, title] = await Promise.all([audioForCut(cut), titlePromise]);
  const transcribe = settings.transcribeMined;
  const draft: CaptionDraft = {
    id: nextId('d'),
    kind,
    createdAt: Date.now(),
    text: '',
    transcript: transcribe ? 'pending' : 'none',
    ...audio,
    sourceTitle: title || undefined,
    studyLang: getMainStudyLang(),
    textProvenance: 'transcript',
  };
  pushDraft(draft);
  if (transcribe && cut.sliceId) void transcribeDraft(draft.id, cut.sliceId);
  return { ok: true, draftId: draft.id };
}

export async function mineRecent(seconds?: number): Promise<{ ok: boolean; draftId?: string; errorKey?: string }> {
  loadSettings();
  if (capture !== 'on') {
    notice('captions.notice.captureOff', 'warning');
    return { ok: false, errorKey: 'captions.notice.captureOff' };
  }
  const title = foregroundWindowTitle();
  const cut = await hostRequest<CutResult>({ type: 'cut', mode: 'last', seconds: seconds ?? settings.mineSeconds });
  return draftFromCut(cut, 'recent', title);
}

let recordingTimer: NodeJS.Timeout | null = null;
/** A Record press is still bringing capture up (a second or two from off). */
let recordingStarting = false;
/** Record was pressed again during that start: the user meant stop. */
let stopWhenStarted = false;

type RecordingReply = { ok: boolean; recording: boolean; draftId?: string; errorKey?: string };

export async function toggleRecording(): Promise<RecordingReply> {
  if (recordingStarting) {
    // Pressed again before the first press had started anything (capture was
    // still coming up). It used to start a second recording on top — or, in the
    // app, wait 15 s for a host that was not listening yet — and the recording
    // the user had just stopped ran on to its limit.
    stopWhenStarted = true;
    return { ok: true, recording: false };
  }
  if (recordingSince !== null) {
    if (recordingTimer) clearTimeout(recordingTimer);
    recordingTimer = null;
    const title = foregroundWindowTitle();
    const cut = await hostRequest<CutResult>({ type: 'record-stop' });
    recordingSince = null;
    broadcastStateNow();
    const result = await draftFromCut(cut, 'recording', title);
    if (recordingOwnsCapture) {
      recordingOwnsCapture = false;
      // The clip is already cut and held by main; the transcription still needs
      // the host, so let it finish before the capture window goes.
      const draftId = result.draftId;
      const release = (): void => {
        if (recordingSince === null && (!draftId || drafts.find((d) => d.id === draftId)?.transcript !== 'pending')) {
          stopCapture();
        } else {
          setTimeout(release, 1000);
        }
      };
      release();
    }
    return { ...result, recording: false };
  }
  recordingStarting = true;
  stopWhenStarted = false;
  let started: RecordingReply;
  try {
    started = await startRecording();
  } finally {
    recordingStarting = false;
  }
  if (stopWhenStarted) {
    stopWhenStarted = false;
    if (started.recording) await abandonRecording();
    return { ok: true, recording: false };
  }
  if (started.recording) notice('captions.notice.recording', 'info', { seconds: MANUAL_RECORDING_MAX_SECONDS }, 3000);
  return started;
}

async function startRecording(): Promise<RecordingReply> {
  if (capture !== 'on') {
    recordingOwnsCapture = true;
    const started = await startCapture();
    if (!started.ok) {
      recordingOwnsCapture = false;
      return { ok: false, recording: false, errorKey: started.errorKey };
    }
  }
  const ok = await hostRequest<{ ok: boolean }>({ type: 'record-start' });
  if (!ok?.ok) {
    // Capture turned on only for this recording goes off again, red dot and all.
    if (recordingOwnsCapture) stopCapture();
    return { ok: false, recording: false, errorKey: 'captions.notice.cutFailed' };
  }
  recordingSince = Date.now();
  recordingTimer = setTimeout(() => {
    recordingTimer = null;
    if (recordingSince !== null) void toggleRecording();
  }, MANUAL_RECORDING_MAX_SECONDS * 1000 + 250);
  broadcastStateNow();
  return { ok: true, recording: true };
}

/** A recording stopped before it had begun: nothing to keep, and capture it owned goes off. */
async function abandonRecording(): Promise<void> {
  if (recordingTimer) clearTimeout(recordingTimer);
  recordingTimer = null;
  await hostRequest({ type: 'record-stop' });
  recordingSince = null;
  if (recordingOwnsCapture) stopCapture();
  else broadcastStateNow();
}

/**
 * Mine one caption line: the line as the sentence (or `word` from the
 * dictionary pop-up as the front), plus that line's audio cut from the buffer
 * by timestamp when capture is on. Added straight away — the text is already
 * on screen, so a review step would only be a second click.
 */
export async function mineLine(
  lineId: string,
  extra: { word?: string; reading?: string; meaning?: string; text?: string } = {},
): Promise<CaptionMineReply | { ok: false; errorKey: string }> {
  const index = lines.findIndex((l) => l.id === lineId);
  const line = lines[index];
  if (!line) return { ok: false, errorKey: 'captions.notice.lineGone' };
  const span = lineAudioWindow(line, lines[index + 1] ?? null);
  let audio: Pick<CaptionDraft, 'audioBase64' | 'audioFilename' | 'durationMs'> = { durationMs: 0 };
  let audioNoteKey: string | undefined;
  if (capture === 'on') {
    const cut = await hostRequest<CutResult>({ type: 'cut', mode: 'range', startMs: span.startMs, endMs: span.endMs });
    if (cut?.ok && !cut.silent) audio = await audioForCut(cut);
    else audioNoteKey = 'captions.notice.lineNoAudio';
  } else {
    audioNoteKey = 'captions.notice.lineNoCapture';
  }
  const title = line.windowTitle || (await foregroundWindowTitle());
  const reply = await sendMineToMain({
    requestId: nextId('m'),
    sentence: (extra.text ?? line.text).trim(),
    word: extra.word?.trim() || undefined,
    reading: extra.reading,
    meaning: extra.meaning,
    studyLang: getMainStudyLang(),
    sourceTitle: title || undefined,
    textProvenance: 'auto-captions',
    audioBase64: audio.audioBase64,
    audioFilename: audio.audioFilename,
  });
  if (reply.ok) notice(audioNoteKey ?? 'captions.notice.added', audioNoteKey ? 'info' : 'success');
  else notice('captions.notice.mineFailed', 'warning');
  return reply;
}

export async function mineCurrentLine(): Promise<unknown> {
  const last = lines[lines.length - 1];
  if (!last) {
    notice('captions.notice.noLine', 'warning');
    return { ok: false, errorKey: 'captions.notice.noLine' };
  }
  return mineLine(last.id);
}

const minePending = new Map<string, { resolve: (reply: CaptionMineReply) => void; timer: NodeJS.Timeout }>();

function sendMineToMain(payload: CaptionMinePayload): Promise<CaptionMineReply> {
  const win = deps?.getMainWindow() ?? null;
  if (!win || win.isDestroyed()) {
    return Promise.resolve({ requestId: payload.requestId, ok: false, error: 'no-main-window' });
  }
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      minePending.delete(payload.requestId);
      resolve({ requestId: payload.requestId, ok: false, error: 'timeout' });
    }, 30_000);
    minePending.set(payload.requestId, { resolve, timer });
    sendTo(win, CH.mineRequest, payload);
  });
}

export async function confirmDraft(id: string, edits: { text?: string; word?: string } = {}): Promise<CaptionMineReply | { ok: false; errorKey: string }> {
  const draft = drafts.find((d) => d.id === id);
  if (!draft) return { ok: false, errorKey: 'captions.notice.lineGone' };
  const text = (edits.text ?? draft.text).trim();
  if (!text && !draft.audioBase64) return { ok: false, errorKey: 'captions.draft.typeSentence' };
  const reply = await sendMineToMain({
    requestId: nextId('m'),
    sentence: text,
    word: edits.word?.trim() || draft.word,
    reading: draft.reading,
    meaning: draft.meaning,
    studyLang: draft.studyLang,
    sourceTitle: draft.sourceTitle,
    textProvenance: draft.textProvenance,
    audioBase64: draft.audioBase64,
    audioFilename: draft.audioFilename,
  });
  if (reply.ok) {
    drafts = drafts.filter((d) => d.id !== id);
    notice('captions.notice.added', 'success', undefined, 3000);
  } else {
    notice('captions.notice.mineFailed', 'warning');
  }
  sendDrafts();
  return reply;
}

export function discardDraft(id: string): void {
  drafts = drafts.filter((d) => d.id !== id);
  sendDrafts();
}

// ---------------------------------------------------------------------------
// Caption lines

function pushLines(next: CaptionOverlayLine[]): void {
  lines = next.slice(-OVERLAY_HISTORY_MAX);
  sendLines();
}

/**
 * Merge the poller's newest lines into the overlay history. A Live Captions
 * line is stamped with when it was first seen (`ts`); its end is the last
 * snapshot that still revised it, which is what the audio cut needs.
 */
export function ingestWindowsLines(incoming: readonly { text: string; ts: number }[], at: number, windowTitle: string): void {
  if (!incoming.length) return;
  incoming = incoming.filter((line) => line.ts >= overlaySince - 30_000);
  if (!incoming.length) return;
  const byId = new Map(lines.map((l) => [l.id, l]));
  const next = [...lines];
  incoming.forEach((line, i) => {
    const id = `w-${line.ts}`;
    const existing = byId.get(id);
    const final = i < incoming.length - 1;
    if (!existing) {
      const created: CaptionOverlayLine = {
        id,
        text: line.text,
        startMs: line.ts,
        endMs: at,
        source: 'windows',
        final,
        ...(windowTitle ? { windowTitle } : {}),
      };
      next.push(created);
      byId.set(id, created);
    } else if (existing.text !== line.text || existing.final !== final) {
      const updated = { ...existing, text: line.text, final, endMs: existing.text !== line.text ? at : existing.endMs };
      next[next.indexOf(existing)] = updated;
      byId.set(id, updated);
    }
  });
  next.sort((a, b) => a.startMs - b.startMs);
  pushLines(next);
}

function ingestGumUtterance(u: { text?: string; startMs?: number; endMs?: number }): void {
  const text = (u.text ?? '').trim();
  const startMs = Number(u.startMs);
  const endMs = Number(u.endMs);
  if (!text || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return;
  pushLines([
    ...lines.map((l) => (l.final ? l : { ...l, final: true })),
    { id: nextId('g'), text, startMs, endMs, source: 'gum', final: true },
  ]);
}

function applySource(): void {
  // Windows Live Captions: our poller runs while the overlay shows that source.
  if (overlayOpen && settings.source === 'windows') {
    startLiveCaptionsCapture({ overlayOnly: true });
  } else {
    releaseLiveCaptionsForOverlay();
  }
  if (capture === 'on') void hostRequest({ type: 'configure', ...hostConfig() });
  refreshWindowsStatus();
}

function refreshWindowsStatus(): void {
  const status = getLiveCaptionsStatus();
  const running = status.capturing || (overlayOpen && settings.source === 'windows');
  windowsAttached = running && status.attached;
  // Only once the poller has looked: before that "not running" would flash on every open.
  windowsWaiting = running && !status.attached && Boolean(status.waiting);
}

/** Start the Live Captions app itself (the same as Win+Ctrl+L). Changes no setting. */
function startWindowsLiveCaptions(): { ok: boolean } {
  if (process.platform !== 'win32') return { ok: false };
  const exe = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'LiveCaptions.exe');
  if (!fs.existsSync(exe)) return { ok: false };
  try {
    const child = spawn(exe, [], { detached: true, stdio: 'ignore', windowsHide: false });
    child.on('error', () => undefined);
    child.unref();
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

// ---------------------------------------------------------------------------
// The overlay window

function barFromWindow(rect: Rectangle): OverlayBounds {
  return { x: rect.x, y: rect.y + OVERLAY_HEADROOM, width: rect.width, height: rect.height - OVERLAY_HEADROOM };
}

function windowFromBar(bar: OverlayBounds): Rectangle {
  return { x: bar.x, y: bar.y - OVERLAY_HEADROOM, width: bar.width, height: bar.height + OVERLAY_HEADROOM };
}

/** The saved bar, if it is still on a connected display; else centred near the bottom of the primary one. */
export function resolveBarBounds(saved: OverlayBounds | null, displays: readonly Rectangle[], primary: Rectangle): OverlayBounds {
  if (saved) {
    const visible = displays.some((d) =>
      saved.x < d.x + d.width - 40 && saved.x + saved.width > d.x + 40 && saved.y >= d.y && saved.y < d.y + d.height - 20);
    if (visible) return saved;
  }
  const width = Math.min(OVERLAY_DEFAULT_WIDTH, Math.max(OVERLAY_MIN_WIDTH, primary.width - 48));
  const height = OVERLAY_DEFAULT_HEIGHT;
  return {
    x: Math.round(primary.x + (primary.width - width) / 2),
    y: Math.round(primary.y + primary.height - height - 56),
    width,
    height,
  };
}

function currentBarBounds(): OverlayBounds {
  return resolveBarBounds(
    settings.bounds,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  );
}

function ensureOverlayWindow(): BrowserWindow {
  if (overlayWin && !overlayWin.isDestroyed()) return overlayWin;
  loadSettings();
  const rect = windowFromBar(currentBarBounds());
  const win = new BrowserWindow({
    ...rect,
    frame: false,
    transparent: true,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    // Resized from its own grip: native edges do not work on a transparent window.
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    backgroundColor: '#00000000',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false,
    },
  });
  overlayWin = win;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
  // Click-through until the pointer is over a control; the renderer flips this.
  win.setIgnoreMouseEvents(true, { forward: true });
  deps?.attachNavGuards?.(win);
  if (deps?.isDevServer) deps.forwardConsole?.(win);
  win.once('ready-to-show', () => syncOverlayVisibility());
  win.webContents.on('did-finish-load', () => {
    sendTo(win, CH.state, getCaptionsState());
    sendLines();
    sendDrafts();
  });
  win.on('closed', () => {
    if (overlayWin === win) {
      overlayWin = null;
      if (overlayOpen) {
        overlayOpen = false;
        applySource();
        broadcastStateNow();
      }
    }
  });
  void win.loadURL(deps ? deps.rendererUrl('captionsOverlay=1') : 'app://bundle/index.html?captionsOverlay=1');
  return win;
}

/** The window shows while the bar is open or there is a draft or notice to show. */
function syncOverlayVisibility(): void {
  const win = overlayWin;
  if (!win || win.isDestroyed()) return;
  const want = overlayOpen || drafts.length > 0 || notices.length > 0;
  if (want && !win.isVisible()) {
    // Never steal focus from the video being watched.
    win.showInactive();
  } else if (!want && win.isVisible()) {
    win.hide();
  }
}

export function setOverlayOpen(open: boolean): CaptionsState {
  if (open && !overlayOpen) overlaySince = Date.now();
  overlayOpen = open;
  if (open) ensureOverlayWindow();
  applySource();
  syncOverlayVisibility();
  broadcastStateNow();
  return getCaptionsState();
}

export function toggleOverlay(): CaptionsState {
  return setOverlayOpen(!overlayOpen);
}

function fromOverlay(event: IpcMainEvent | IpcMainInvokeEvent): boolean {
  return !!overlayWin && !overlayWin.isDestroyed() && event.sender === overlayWin.webContents;
}

function setBarBounds(bar: OverlayBounds): OverlayBounds {
  const clamped: OverlayBounds = {
    x: Math.round(bar.x),
    y: Math.round(bar.y),
    width: Math.round(Math.min(OVERLAY_MAX_WIDTH, Math.max(OVERLAY_MIN_WIDTH, bar.width))),
    height: Math.round(Math.min(OVERLAY_MAX_HEIGHT, Math.max(OVERLAY_MIN_HEIGHT, bar.height))),
  };
  if (overlayWin && !overlayWin.isDestroyed()) overlayWin.setBounds(windowFromBar(clamped));
  settings = { ...settings, bounds: clamped };
  saveSettingsSoon();
  return clamped;
}

// ---------------------------------------------------------------------------
// Tray: the on/off indicator while audio is being held

let tray: Tray | null = null;

/** A 16 px deep-red dot — "recording", in the app's accent. */
function indicatorIcon(): Electron.NativeImage {
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const alpha = Math.max(0, Math.min(1, 6.5 - d));
      const i = (y * size + x) * 4;
      // BGRA
      buf[i] = 0x2a;
      buf[i + 1] = 0x1c;
      buf[i + 2] = 0xb0;
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function refreshTray(): void {
  const on = capture === 'on';
  if (!on) {
    if (tray) {
      try {
        tray.destroy();
      } catch {
        /* already gone */
      }
      tray = null;
    }
    return;
  }
  if (!tray) {
    try {
      tray = new Tray(indicatorIcon());
      tray.on('click', () => setOverlayOpen(true));
    } catch {
      tray = null;
      return;
    }
  }
  const seconds = settings.captureSeconds;
  tray.setToolTip(mt('captions.tray.tooltip', { seconds }));
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: mt('captions.tray.status', { seconds }), enabled: false },
      { type: 'separator' },
      { label: mt('captions.tray.mineRecent', { seconds: settings.mineSeconds }), click: () => void mineRecent() },
      {
        label: recordingSince !== null ? mt('captions.tray.stopRecording') : mt('captions.tray.startRecording'),
        click: () => void toggleRecording(),
      },
      {
        label: overlayOpen ? mt('captions.tray.hideOverlay') : mt('captions.tray.showOverlay'),
        click: () => void toggleOverlay(),
      },
      { type: 'separator' },
      { label: mt('captions.tray.stop'), click: () => stopCapture() },
    ]),
  );
}

// ---------------------------------------------------------------------------
// Wiring

export function configureSystemAudioCapture(options: CaptureDeps): void {
  deps = options;
}

export function registerSystemAudioCaptureIpc(): void {
  loadSettings();
  installDisplayMediaHandler();

  // The captions commands join the shared global-command registry (main/globalCommands.ts);
  // the renderer's Shortcuts rows push the user's chords, these are the defaults.
  for (const [id, run, defaultKeys] of [
    ['captions.mineRecent', () => void mineRecent(), 'Ctrl+Alt+Shift+M'],
    ['captions.toggleRecording', () => void toggleRecording(), 'Ctrl+Alt+Shift+K'],
    ['captions.toggleOverlay', () => void toggleOverlay(), 'Ctrl+Alt+Shift+C'],
    ['captions.mineLine', () => void mineCurrentLine(), 'Ctrl+Alt+Shift+L'],
    ['captions.toggleCapture', () => void setCaptureEnabled(capture !== 'on'), ''],
  ] as const) {
    registerGlobalCommand(id, run, { defaultKeys });
  }

  ipcMain.handle(CH.getState, () => getCaptionsState());
  ipcMain.handle(CH.setSettings, (_e, patch: unknown) => {
    const before = settings;
    settings = normalizeCaptionsSettings(patch, settings);
    saveSettingsSoon();
    if (before.source !== settings.source) applySource();
    if (capture === 'on' && (before.captureSeconds !== settings.captureSeconds || before.source !== settings.source)) {
      void hostRequest({ type: 'configure', ...hostConfig() });
    }
    broadcastStateNow();
    return getCaptionsState();
  });
  ipcMain.handle(CH.setCapture, (_e, on: unknown) => setCaptureEnabled(on === true));
  ipcMain.handle(CH.mineRecent, (_e, seconds: unknown) =>
    mineRecent(typeof seconds === 'number' && Number.isFinite(seconds) ? seconds : undefined));
  ipcMain.handle(CH.toggleRecording, () => toggleRecording());
  ipcMain.handle(CH.toggleOverlay, (_e, open: unknown) =>
    typeof open === 'boolean' ? setOverlayOpen(open) : toggleOverlay());
  ipcMain.handle(CH.mineLine, (_e, lineId: unknown, extra: unknown) =>
    mineLine(String(lineId ?? ''), extra && typeof extra === 'object' ? (extra as Record<string, string>) : {}));
  ipcMain.handle(CH.mineCurrentLine, () => mineCurrentLine());
  ipcMain.handle(CH.getLines, () => lines);
  // The bar loads lazily: a draft or notice pushed while it was still loading
  // (the first "mine the last seconds" creates the window) is pulled here.
  ipcMain.handle(CH.getDrafts, () => ({ drafts, notices }));
  ipcMain.handle(CH.updateDraft, (_e, id: unknown, patch: unknown) => {
    const p = (patch && typeof patch === 'object' ? patch : {}) as { text?: unknown };
    if (typeof p.text === 'string') patchDraft(String(id), { text: p.text.slice(0, 2000) });
    return { ok: true };
  });
  ipcMain.handle(CH.confirmDraft, (_e, id: unknown, edits: unknown) =>
    confirmDraft(String(id ?? ''), edits && typeof edits === 'object' ? (edits as { text?: string }) : {}));
  ipcMain.handle(CH.discardDraft, (_e, id: unknown) => {
    discardDraft(String(id ?? ''));
    return { ok: true };
  });
  ipcMain.handle('captions:startWindowsLiveCaptions', () => startWindowsLiveCaptions());
  ipcMain.handle(CH.openSettings, (_e, page: unknown) => {
    const win = deps?.getMainWindow() ?? null;
    if (!win || win.isDestroyed()) return { ok: false };
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    sendTo(win, CH.openSettingsInMain, { page: page === 'shortcuts' ? 'shortcuts' : 'transcription' });
    return { ok: true };
  });

  ipcMain.on(CH.overlaySetIgnoreMouse, (event, ignore: unknown) => {
    if (!fromOverlay(event) || !overlayWin) return;
    overlayWin.setIgnoreMouseEvents(ignore === true, { forward: true });
  });
  ipcMain.handle(CH.overlayGetBounds, () =>
    overlayWin && !overlayWin.isDestroyed() ? barFromWindow(overlayWin.getBounds()) : currentBarBounds());
  ipcMain.handle(CH.overlaySetBounds, (event, bar: unknown) => {
    if (!fromOverlay(event)) return null;
    const parsed = normalizeBounds(bar);
    return parsed ? setBarBounds(parsed) : null;
  });

  // The capture host talks back.
  ipcMain.on(CH.hostReply, (event, reply: { id?: string } & Record<string, unknown>) => {
    if (!captureWin || event.sender !== captureWin.webContents || !reply?.id) return;
    const pending = hostPending.get(reply.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    hostPending.delete(reply.id);
    pending.resolve(reply);
  });
  ipcMain.on(CH.hostStatus, (event, status: { bufferedMs?: number; gumModelMissing?: boolean; recordingAutoStopped?: boolean }) => {
    if (!captureWin || event.sender !== captureWin.webContents) return;
    if (Number.isFinite(status?.bufferedMs)) bufferedMs = Number(status.bufferedMs);
    if (typeof status?.gumModelMissing === 'boolean' && status.gumModelMissing !== gumModelMissing) {
      gumModelMissing = status.gumModelMissing;
      broadcastStateNow();
      return;
    }
    broadcastStateSoon();
  });
  ipcMain.on(CH.hostUtterance, (event, u: { text?: string; startMs?: number; endMs?: number }) => {
    if (!captureWin || event.sender !== captureWin.webContents) return;
    if (settings.source === 'gum') ingestGumUtterance(u);
  });

  // The main window answers a forwarded mine.
  ipcMain.on(CH.mineReply, (_event, reply: CaptionMineReply) => {
    const pending = reply?.requestId ? minePending.get(reply.requestId) : undefined;
    if (!pending) return;
    clearTimeout(pending.timer);
    minePending.delete(reply.requestId);
    pending.resolve(reply);
  });

  onLiveCaptionsEvent((event) => {
    if (event.type === 'lines') {
      if (settings.source === 'windows' && (overlayOpen || lines.length)) {
        ingestWindowsLines(event.lines, event.at, event.windowTitle);
      }
      return;
    }
    const before = `${windowsAttached}|${windowsWaiting}`;
    refreshWindowsStatus();
    if (`${windowsAttached}|${windowsWaiting}` !== before) broadcastStateNow();
  });

  // The end-to-end check has no Live Captions window: it feeds the poller's own
  // event path. Only with the switch, which no shortcut or installer passes.
  if (process.argv.includes(TEST_SWITCH)) {
    ipcMain.handle(CH.injectSnapshot, (_e, captionLines: unknown, windowTitle: unknown) => {
      const list = Array.isArray(captionLines) ? captionLines.map(String) : [];
      feedLiveCaptionsPollerLine(JSON.stringify({
        type: 'snapshot',
        t: Date.now(),
        lines: list,
        win: typeof windowTitle === 'string' ? windowTitle : '',
        wpid: 0,
      }));
      return { ok: true, lines };
    });
  }

  app.on('before-quit', () => {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
      saveSettingsNow();
    }
    stopCapture();
    if (tray) {
      try {
        tray.destroy();
      } catch {
        /* gone */
      }
      tray = null;
    }
  });
}
