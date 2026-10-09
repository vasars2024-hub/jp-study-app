/**
 * The desktop Region Recorder — the pure contracts shared by main
 * (`main/regionRecorder.ts`, `main/recordingFinalize.ts`), the preload bridge and
 * the recorder windows (`renderer/recorder/*`).
 *
 * The pipeline: the user draws a box over one monitor → a hidden window records
 * that monitor (and, on Windows, the system audio loopback and/or a microphone)
 * with MediaRecorder, cropped live where the insertable-streams API exists →
 * ordered one-second chunks are appended to `<folder>/.partial/<id>.webm` →
 * on Stop ffmpeg makes an MP4 (cropping there when the live crop was not
 * available) → the MP4 is imported into the library, Whisper transcribes it in
 * the study language, and it opens in the video study player.
 *
 * Nothing here touches Electron, the DOM or Node: every rule is data in, data
 * out, so the scaling, cropping and naming rules are unit-tested directly.
 */

// ---------------------------------------------------------------------------
// States

/** Every state the recorder (a live session, then a job per recording) can be in. */
export type RecorderPhase =
  | 'idle'
  | 'selecting'
  | 'starting'
  | 'recording'
  | 'paused'
  | 'finalizing'
  | 'importing'
  | 'transcribing'
  | 'ready'
  | 'error';

/** The live session. After Stop the recording becomes a job and the session is idle again. */
export type RecorderSessionPhase = Extract<RecorderPhase, 'idle' | 'selecting' | 'starting' | 'recording' | 'paused' | 'error'>;

/** A finished recording on its way to the library. */
export type RecorderJobPhase = Extract<RecorderPhase, 'finalizing' | 'importing' | 'transcribing' | 'ready' | 'error'>;

const SESSION_TRANSITIONS: Record<RecorderSessionPhase, readonly RecorderSessionPhase[]> = {
  idle: ['selecting', 'starting'],
  selecting: ['idle', 'selecting', 'starting'],
  starting: ['recording', 'idle', 'error'],
  recording: ['paused', 'idle', 'error'],
  paused: ['recording', 'idle', 'error'],
  error: ['idle', 'selecting', 'starting'],
};

/** Whether the live session may move from `from` to `to`. */
export function canRecorderTransition(from: RecorderSessionPhase, to: RecorderSessionPhase): boolean {
  return SESSION_TRANSITIONS[from]?.includes(to) ?? false;
}

const JOB_TRANSITIONS: Record<RecorderJobPhase, readonly RecorderJobPhase[]> = {
  finalizing: ['importing', 'error'],
  importing: ['transcribing', 'ready', 'error'],
  transcribing: ['ready', 'error'],
  ready: ['transcribing'],
  // A failed job keeps its partial file and can be retried from the start.
  error: ['finalizing'],
};

export function canRecorderJobTransition(from: RecorderJobPhase, to: RecorderJobPhase): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

// ---------------------------------------------------------------------------
// Settings

export type RecorderAudioSource = 'system' | 'mic' | 'both' | 'none';
export type RecorderQuality = 'high' | 'standard' | 'small';
/**
 * Which H.264 encoder finishes a recording. `auto` takes the first hardware
 * encoder the bundled ffmpeg lists AND a probe encode proves usable on this
 * machine (NVIDIA, then Intel, then AMD), else x264 on the CPU.
 */
export type RecorderEncoderPref = 'auto' | 'software' | 'nvenc' | 'qsv' | 'amf';
export type RecorderHardwareEncoder = Exclude<RecorderEncoderPref, 'auto' | 'software'>;

export const RECORDER_AUDIO_SOURCES: readonly RecorderAudioSource[] = ['system', 'mic', 'both', 'none'];
export const RECORDER_QUALITIES: readonly RecorderQuality[] = ['high', 'standard', 'small'];
export const RECORDER_ENCODER_PREFS: readonly RecorderEncoderPref[] = ['auto', 'software', 'nvenc', 'qsv', 'amf'];
/** Hardware encoders in the order `auto` tries them. */
export const RECORDER_HARDWARE_ENCODERS: readonly RecorderHardwareEncoder[] = ['nvenc', 'qsv', 'amf'];
/** The ffmpeg encoder name behind each choice. */
export const RECORDER_FFMPEG_ENCODER: Record<RecorderHardwareEncoder | 'software', string> = {
  software: 'libx264',
  nvenc: 'h264_nvenc',
  qsv: 'h264_qsv',
  amf: 'h264_amf',
};
export const RECORDER_FPS_CHOICES: readonly number[] = [15, 24, 30, 60];

/** Below this a drag is a stray click, in DIP — the Reading Lens's floor too. */
export const RECORDER_MIN_REGION = 12;
/** A recording stops (and refuses to start) with less than this free on the target drive. */
export const RECORDER_MIN_FREE_BYTES = 1024 * 1024 * 1024;
/** MediaRecorder timeslice: one chunk a second reaches the disk. */
export const RECORDER_CHUNK_MS = 1000;
export const RECORDER_MAX_MINUTES_DEFAULT = 120;
export const RECORDER_MAX_MINUTES_LIMIT = 240;
/** The folder under the recordings folder that holds unfinished recordings. */
export const RECORDER_PARTIAL_DIR = '.partial';
/** Name of the default recordings folder, under the OS Videos folder. */
export const RECORDER_DEFAULT_FOLDER_NAME = 'Gum Recordings';

/** A remembered region: display-local DIP on one monitor. */
export interface RecorderRegionMemory {
  displayId: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface RecorderSettings {
  audio: RecorderAudioSource;
  /** `''` is the system default microphone. */
  micDeviceId: string;
  /** Per-source gain in the mix, 0–2. */
  systemGain: number;
  micGain: number;
  fps: number;
  quality: RecorderQuality;
  /** The recording stops on its own after this many minutes. */
  maxMinutes: number;
  /** `''` is the default folder (Videos/Gum Recordings). */
  folder: string;
  autoTranscribe: boolean;
  autoOpen: boolean;
  lastRegion: RecorderRegionMemory | null;
  /** The encoder that turns the WebM into the MP4 (see `RecorderEncoderPref`). */
  encoder: RecorderEncoderPref;
  /** File each recording under the day it was made in Calendar, and count its length as study time. */
  studyTag: boolean;
}

export const DEFAULT_RECORDER_SETTINGS: RecorderSettings = {
  audio: 'system',
  micDeviceId: '',
  systemGain: 1,
  micGain: 1,
  fps: 30,
  quality: 'standard',
  maxMinutes: RECORDER_MAX_MINUTES_DEFAULT,
  folder: '',
  autoTranscribe: true,
  autoOpen: true,
  lastRegion: null,
  encoder: 'auto',
  studyTag: true,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeRecorderRegion(value: unknown): RecorderRegionMemory | null {
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
  if (x < 0 || y < 0 || width < RECORDER_MIN_REGION || height < RECORDER_MIN_REGION) return null;
  return { displayId, x, y, width, height };
}

/** Merge an untrusted patch (IPC, a hand-edited JSON file) onto `base`. */
export function normalizeRecorderSettings(patch: unknown, base: RecorderSettings = DEFAULT_RECORDER_SETTINGS): RecorderSettings {
  const p = (patch && typeof patch === 'object' && !Array.isArray(patch) ? patch : {}) as Record<string, unknown>;
  const pick = <T>(key: string, ok: (v: unknown) => v is T, fallback: T): T => (key in p && ok(p[key]) ? p[key] as T : fallback);
  const isAudio = (v: unknown): v is RecorderAudioSource => RECORDER_AUDIO_SOURCES.includes(v as RecorderAudioSource);
  const isQuality = (v: unknown): v is RecorderQuality => RECORDER_QUALITIES.includes(v as RecorderQuality);
  const isEncoder = (v: unknown): v is RecorderEncoderPref => RECORDER_ENCODER_PREFS.includes(v as RecorderEncoderPref);
  const isBool = (v: unknown): v is boolean => typeof v === 'boolean';
  const isString = (v: unknown): v is string => typeof v === 'string';
  const fps = 'fps' in p ? Number(p.fps) : base.fps;
  return {
    audio: pick('audio', isAudio, base.audio),
    micDeviceId: pick('micDeviceId', isString, base.micDeviceId).slice(0, 512),
    systemGain: 'systemGain' in p ? clampNumber(p.systemGain, 0, 2, base.systemGain) : base.systemGain,
    micGain: 'micGain' in p ? clampNumber(p.micGain, 0, 2, base.micGain) : base.micGain,
    fps: RECORDER_FPS_CHOICES.includes(fps) ? fps : base.fps,
    quality: pick('quality', isQuality, base.quality),
    maxMinutes: 'maxMinutes' in p
      ? Math.round(clampNumber(p.maxMinutes, 1, RECORDER_MAX_MINUTES_LIMIT, base.maxMinutes))
      : base.maxMinutes,
    folder: pick('folder', isString, base.folder).trim().slice(0, 1024),
    autoTranscribe: pick('autoTranscribe', isBool, base.autoTranscribe),
    autoOpen: pick('autoOpen', isBool, base.autoOpen),
    lastRegion: 'lastRegion' in p ? normalizeRecorderRegion(p.lastRegion) : base.lastRegion,
    encoder: pick('encoder', isEncoder, base.encoder ?? 'auto'),
    studyTag: pick('studyTag', isBool, base.studyTag ?? true),
  };
}

/** Whether the system-audio half of a source choice can be honoured here. */
export function recorderWantsSystemAudio(audio: RecorderAudioSource): boolean {
  return audio === 'system' || audio === 'both';
}

export function recorderWantsMic(audio: RecorderAudioSource): boolean {
  return audio === 'mic' || audio === 'both';
}

/**
 * What each quality step means, as numbers. One table so the CPU and the
 * hardware encoders are told the same thing in their own dialect:
 *
 * - `crf`: x264's constant rate factor (lower is better and bigger);
 * - `cq`: the constant-quality level the hardware encoders take (NVENC `-cq`,
 *   Quick Sync `-global_quality`, AMF `-qp_i/-qp_p`). Hardware encoders spend
 *   more bits for the same number, so it sits a step above `crf`;
 * - `maxrateKbps`: a ceiling on the MP4's video bitrate (a 4K region at "high"
 *   would otherwise be enormous), with a VBV buffer of twice that;
 * - `webmBitrate`: MediaRecorder's target for the intermediate WebM at 30 fps.
 *   It is re-encoded afterwards, so this errs generous: what it loses cannot
 *   be won back;
 * - `audioKbps`: AAC in the MP4.
 */
export interface RecorderQualityPreset {
  crf: number;
  cq: number;
  maxrateKbps: number;
  webmBitrate: number;
  audioKbps: number;
}

export const RECORDER_QUALITY_PRESETS: Record<RecorderQuality, RecorderQualityPreset> = {
  high: { crf: 18, cq: 19, maxrateKbps: 16_000, webmBitrate: 16_000_000, audioKbps: 192 },
  standard: { crf: 23, cq: 25, maxrateKbps: 8_000, webmBitrate: 10_000_000, audioKbps: 160 },
  small: { crf: 28, cq: 31, maxrateKbps: 3_000, webmBitrate: 5_000_000, audioKbps: 128 },
};

function presetOf(quality: RecorderQuality): RecorderQualityPreset {
  return RECORDER_QUALITY_PRESETS[quality] ?? RECORDER_QUALITY_PRESETS.standard;
}

/** x264 CRF per quality step (lower is better and bigger). */
export function recorderCrf(quality: RecorderQuality): number {
  return presetOf(quality).crf;
}

/** MediaRecorder's target bitrate for the intermediate WebM, scaled by frame rate. */
export function recorderVideoBitrate(quality: RecorderQuality, fps: number): number {
  return Math.round(presetOf(quality).webmBitrate * Math.min(2, Math.max(0.5, fps / 30)));
}

/** The ffmpeg video-encoder arguments for one encoder at one quality step. */
export function recorderVideoEncodeArgs(encoder: string, quality: RecorderQuality): string[] {
  const p = presetOf(quality);
  const rate = ['-maxrate', `${p.maxrateKbps}k`, '-bufsize', `${p.maxrateKbps * 2}k`];
  switch (encoder) {
    case 'h264_nvenc':
      // `-b:v 0` lets `-cq` alone decide (constant quality); the ceiling still holds.
      return ['-c:v', 'h264_nvenc', '-preset', 'p4', '-rc', 'vbr', '-cq', String(p.cq), '-b:v', '0', ...rate, '-pix_fmt', 'yuv420p'];
    case 'h264_qsv':
      // ICQ mode: Quick Sync refuses a VBV ceiling together with it, so none is sent.
      return ['-c:v', 'h264_qsv', '-preset', 'veryfast', '-global_quality', String(p.cq), '-look_ahead', '0', '-pix_fmt', 'nv12'];
    case 'h264_amf':
      return ['-c:v', 'h264_amf', '-quality', 'balanced', '-rc', 'cqp', '-qp_i', String(p.cq), '-qp_p', String(p.cq), '-pix_fmt', 'yuv420p'];
    case 'libx264':
      return ['-c:v', 'libx264', '-preset', 'veryfast', '-crf', String(p.crf), '-pix_fmt', 'yuv420p', ...rate];
    default:
      // An encoder this table does not know is asked for by name, with only the
      // ceiling: if ffmpeg cannot use it, the finish falls back to x264.
      return ['-c:v', /^[\w-]{1,40}$/.test(encoder) ? encoder : 'libx264', '-pix_fmt', 'yuv420p', ...rate];
  }
}

/** The encoder names in `ffmpeg -encoders` output (`" V....D h264_nvenc  NVIDIA NVENC…"`). */
export function parseFfmpegEncoderList(text: string): Set<string> {
  const out = new Set<string>();
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = /^\s*[VAS][.A-Z]{5}\s+(\S+)/.exec(line);
    if (m && m[1] !== '=') out.add(m[1]);
  }
  return out;
}

/** What this machine's encoders can do: listed by ffmpeg, and proven by a probe encode. */
export interface RecorderEncoderReport {
  /** Hardware encoders the bundled ffmpeg was built with. */
  listed: RecorderHardwareEncoder[];
  /** Of those, the ones a probe encode succeeded with here. */
  usable: RecorderHardwareEncoder[];
  probedAt: number;
}

/**
 * The ffmpeg encoder a preference resolves to, given what was detected. A named
 * hardware encoder that is not usable here falls back to x264 rather than
 * failing the recording; `fallback` says so.
 */
export function resolveRecorderEncoder(
  pref: RecorderEncoderPref,
  report: Pick<RecorderEncoderReport, 'usable'> | null,
): { encoder: string; hardware: boolean; fallback: boolean } {
  const usable = new Set(report?.usable ?? []);
  if (pref === 'software') return { encoder: 'libx264', hardware: false, fallback: false };
  if (pref === 'auto') {
    const first = RECORDER_HARDWARE_ENCODERS.find((e) => usable.has(e));
    return first
      ? { encoder: RECORDER_FFMPEG_ENCODER[first], hardware: true, fallback: false }
      : { encoder: 'libx264', hardware: false, fallback: false };
  }
  return usable.has(pref)
    ? { encoder: RECORDER_FFMPEG_ENCODER[pref], hardware: true, fallback: false }
    : { encoder: 'libx264', hardware: false, fallback: true };
}

/** The hardware family behind an ffmpeg encoder name, or null for the CPU encoder. */
export function recorderEncoderFamily(encoder: string | undefined): RecorderHardwareEncoder | null {
  if (encoder === 'h264_nvenc') return 'nvenc';
  if (encoder === 'h264_qsv') return 'qsv';
  if (encoder === 'h264_amf') return 'amf';
  return null;
}

// ---------------------------------------------------------------------------
// Level meters

/** Below this the meter reads empty (dBFS). */
export const RECORDER_METER_FLOOR_DB = -60;
/** How fast a falling meter drops, in dB per second (it rises at once). */
export const RECORDER_METER_RELEASE_DB_PER_S = 24;
/** How long the peak marker holds before it falls with the meter. */
export const RECORDER_METER_PEAK_HOLD_MS = 1200;

/**
 * An RMS amplitude (0–1, as the host's analyser reports it, which already
 * carries a ×3 display gain) as a meter fraction on a dB scale: a linear bar
 * shows speech as a flicker in its bottom fifth. `-60 dB` and below is empty.
 */
export function recorderMeterFraction(rms: number): number {
  if (!Number.isFinite(rms) || rms <= 0) return 0;
  const db = 20 * Math.log10(Math.min(1, rms));
  return Math.min(1, Math.max(0, (db - RECORDER_METER_FLOOR_DB) / -RECORDER_METER_FLOOR_DB));
}

export interface RecorderMeterState {
  /** 0–1, what the bar shows. */
  level: number;
  /** 0–1, the held peak marker. */
  peak: number;
  peakAt: number;
  /** The input reached full scale within the hold time. */
  clipping: boolean;
}

export const EMPTY_RECORDER_METER: RecorderMeterState = { level: 0, peak: 0, peakAt: 0, clipping: false };

/**
 * One meter step: instant attack, a steady release (so a meter neither jitters
 * nor drops to nothing between syllables), and a peak marker that holds.
 */
export function stepRecorderMeter(prev: RecorderMeterState, rms: number, now: number, lastAt: number): RecorderMeterState {
  const target = recorderMeterFraction(rms);
  const dt = Math.max(0, Math.min(1000, now - lastAt));
  const fall = (RECORDER_METER_RELEASE_DB_PER_S * dt / 1000) / -RECORDER_METER_FLOOR_DB;
  const level = target >= prev.level ? target : Math.max(target, prev.level - fall);
  const held = now - prev.peakAt < RECORDER_METER_PEAK_HOLD_MS;
  const peak = level >= prev.peak ? level : held ? prev.peak : Math.max(level, prev.peak - fall);
  const peakAt = level >= prev.peak ? now : prev.peakAt;
  const clipped = Number.isFinite(rms) && rms >= 0.999;
  return { level, peak, peakAt, clipping: clipped || (prev.clipping && held) };
}

// ---------------------------------------------------------------------------
// IPC

export const RECORDER_CHANNELS = {
  /** main → every window: the whole RecorderState. */
  state: 'recorder:state',
  getState: 'recorder:get-state',
  setSettings: 'recorder:set-settings',
  start: 'recorder:start',
  stop: 'recorder:stop',
  pause: 'recorder:pause',
  chooseFolder: 'recorder:choose-folder',
  jobAction: 'recorder:job-action',
  recoveryAction: 'recorder:recovery-action',
  /** main → the recording panel only, a few times a second. */
  levels: 'recorder:levels',
  // The region overlay.
  selectInit: 'recorder:select-init',
  selectGetInit: 'recorder:select-get-init',
  selectDone: 'recorder:select-done',
  selectNextDisplay: 'recorder:select-next-display',
  // The hidden recording window.
  hostCommand: 'recorder:host-command',
  hostChunk: 'recorder:host-chunk',
  hostEvent: 'recorder:host-event',
  // The panel (pill + jobs).
  panelResize: 'recorder:panel-resize',
  modelCheck: 'recorder:model-check',
  modelCheckReply: 'recorder:model-check-reply',
  // The main window opens a finished recording in the study player.
  openInPlayer: 'recorder:open-in-player',
  openInPlayerReply: 'recorder:open-in-player-reply',
  // Encoders (Settings).
  detectEncoders: 'recorder:detect-encoders',
  // Windows that can be recorded ("record a window").
  listWindows: 'recorder:list-windows',
  // Finished recordings, kept across restarts.
  historyList: 'recorder:history-list',
  historyAction: 'recorder:history-action',
  /** main → renderers: the history changed. */
  historyChanged: 'recorder:history-changed',
  /** A renderer saw a Whisper model finish downloading (or be removed). */
  modelChanged: 'recorder:model-changed',
  /** main → the main window: put this recording on its study day; answered with the reply. */
  studyTag: 'recorder:study-tag',
  studyTagReply: 'recorder:study-tag-reply',
} as const;

/**
 * `window`: the topmost window that is not one of Gum's own (the one in front
 * when the shortcut was pressed), or the window `sourceId` names.
 */
export type RecorderStartMode = 'select' | 'repeat' | 'full' | 'window';
export type RecorderJobAction = 'open' | 'show' | 'transcribe' | 'retry' | 'dismiss';
export type RecorderRecoveryAction = 'finish' | 'show' | 'dismiss';
export type RecorderHistoryAction = 'open' | 'show' | 'transcribe' | 'delete';
export const RECORDER_HISTORY_ACTIONS: readonly RecorderHistoryAction[] = ['open', 'show', 'transcribe', 'delete'];

/** A window that can be recorded, as `desktopCapturer` names it. */
export interface RecorderWindowSource {
  /** `window:<handle>:0`. */
  id: string;
  name: string;
  /** A small PNG data URL, or `''`. */
  thumbnail: string;
}

/**
 * The window "record the active window" means: the first of `sources` that is
 * not one of Gum's own windows.
 *
 * `desktopCapturer.getSources({ types: ['window'] })` lists windows top to bottom
 * in z-order on Windows (it walks `EnumWindows`), so the first foreign window is
 * the one that was in front when the shortcut was pressed — a global shortcut
 * does not move focus. Elsewhere the order is the platform's; the panel names
 * the window it chose, so a wrong guess is visible at once.
 */
export function pickActiveWindowSource<S extends { id: string; name: string }>(
  sources: readonly S[],
  ownIds: ReadonlySet<string>,
  ownNames: readonly string[] = [],
): S | null {
  const names = new Set(ownNames.map((n) => n.trim()).filter(Boolean));
  return sources.find((s) => /^window:/.test(s.id) && !ownIds.has(s.id) && !names.has(s.name.trim()) && s.name.trim() !== '') ?? null;
}

// ---------------------------------------------------------------------------
// Geometry

export interface RectLike {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SizeLike {
  width: number;
  height: number;
}

/** A crop in captured-frame pixels. Every number is even (yuv420p needs it). */
export interface CropPx {
  x: number;
  y: number;
  width: number;
  height: number;
}

const finite = (...values: number[]): boolean => values.every((v) => Number.isFinite(v));
const floorEven = (n: number): number => Math.floor(n / 2) * 2;

/**
 * Map a display-local DIP region onto the pixels of the frames actually
 * captured from that display.
 *
 * The scale comes from the frame, not from the display's `scaleFactor`: the
 * capturer may deliver the monitor at its physical size (125% → 1.25× DIP),
 * at DIP size, or at whatever size it was constrained to, and only the frame
 * knows. So it is `frame size ÷ display DIP size`, per axis.
 *
 * The result is clamped inside the frame and made even (x264 with yuv420p
 * refuses odd sizes, and an odd offset shifts chroma). `null` when nothing of
 * the region is inside the frame or an input is not a finite number.
 */
export function regionToCropPx(region: RectLike, displaySize: SizeLike, frameSize: SizeLike): CropPx | null {
  if (!finite(region.x, region.y, region.width, region.height)) return null;
  if (!finite(displaySize.width, displaySize.height, frameSize.width, frameSize.height)) return null;
  if (displaySize.width <= 0 || displaySize.height <= 0 || frameSize.width < 2 || frameSize.height < 2) return null;
  const sx = frameSize.width / displaySize.width;
  const sy = frameSize.height / displaySize.height;
  const fw = Math.floor(frameSize.width);
  const fh = Math.floor(frameSize.height);
  const clampX = (v: number): number => Math.min(fw, Math.max(0, Math.round(v)));
  const clampY = (v: number): number => Math.min(fh, Math.max(0, Math.round(v)));
  const left = clampX(region.x * sx);
  const top = clampY(region.y * sy);
  const right = clampX((region.x + region.width) * sx);
  const bottom = clampY((region.y + region.height) * sy);
  const x = floorEven(left);
  const y = floorEven(top);
  const width = floorEven(right - x);
  const height = floorEven(bottom - y);
  if (width < 2 || height < 2) return null;
  return { x, y, width, height };
}

/** Whether a crop keeps (all but an odd last row/column of) the whole frame. */
export function isFullFrameCrop(crop: CropPx, frameSize: SizeLike): boolean {
  return crop.x === 0 && crop.y === 0
    && crop.width >= floorEven(frameSize.width) && crop.height >= floorEven(frameSize.height);
}

/** A rectangle in global (virtual-screen) DIP made local to one display. Origins may be negative. */
export function toDisplayLocal(rect: RectLike, displayBounds: RectLike): RectLike {
  return { x: rect.x - displayBounds.x, y: rect.y - displayBounds.y, width: rect.width, height: rect.height };
}

/** The inverse of `toDisplayLocal`. */
export function toGlobal(rect: RectLike, displayBounds: RectLike): RectLike {
  return { x: rect.x + displayBounds.x, y: rect.y + displayBounds.y, width: rect.width, height: rect.height };
}

/**
 * Normalize a drag (any corner to any corner) into a region inside the
 * display, rounded to whole DIP. `null` below the minimum size.
 */
export function regionFromDrag(
  start: { x: number; y: number },
  end: { x: number; y: number },
  displaySize: SizeLike,
  minSize = RECORDER_MIN_REGION,
): RectLike | null {
  if (!finite(start.x, start.y, end.x, end.y)) return null;
  const clampW = (v: number): number => Math.min(displaySize.width, Math.max(0, v));
  const clampH = (v: number): number => Math.min(displaySize.height, Math.max(0, v));
  const x1 = Math.round(clampW(Math.min(start.x, end.x)));
  const y1 = Math.round(clampH(Math.min(start.y, end.y)));
  const x2 = Math.round(clampW(Math.max(start.x, end.x)));
  const y2 = Math.round(clampH(Math.max(start.y, end.y)));
  if (x2 - x1 < minSize || y2 - y1 < minSize) return null;
  return { x: x1, y: y1, width: x2 - x1, height: y2 - y1 };
}

/** Move a region by (dx, dy) DIP, kept inside the display (arrow-key nudging). */
export function nudgeRegion(region: RectLike, dx: number, dy: number, displaySize: SizeLike): RectLike {
  const x = Math.min(Math.max(0, region.x + dx), Math.max(0, displaySize.width - region.width));
  const y = Math.min(Math.max(0, region.y + dy), Math.max(0, displaySize.height - region.height));
  return { ...region, x: Math.round(x), y: Math.round(y) };
}

/** Grow/shrink a region from its bottom-right corner (Shift+arrows), kept inside the display. */
export function resizeRegion(region: RectLike, dw: number, dh: number, displaySize: SizeLike, minSize = RECORDER_MIN_REGION): RectLike {
  const width = Math.min(Math.max(minSize, region.width + dw), displaySize.width - region.x);
  const height = Math.min(Math.max(minSize, region.height + dh), displaySize.height - region.y);
  return { ...region, width: Math.round(width), height: Math.round(height) };
}

/**
 * The remembered region and its display, when "repeat last region" can replay
 * it honestly: the display still exists and the box still fits inside it.
 */
export function resolveRecorderRepeat<D extends { id: number; bounds: RectLike }>(
  memory: RecorderRegionMemory | null,
  displays: readonly D[],
): { display: D; region: RectLike } | null {
  if (!memory) return null;
  const display = displays.find((d) => d.id === memory.displayId);
  if (!display) return null;
  if (memory.x + memory.width > display.bounds.width || memory.y + memory.height > display.bounds.height) return null;
  return { display, region: { x: memory.x, y: memory.y, width: memory.width, height: memory.height } };
}

/** The display after `currentId` in reading order (left→right, then top→bottom), wrapping. */
export function nextDisplayId(displays: readonly { id: number; bounds: RectLike }[], currentId: number): number | null {
  if (!displays.length) return null;
  const ordered = [...displays].sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
  const index = ordered.findIndex((d) => d.id === currentId);
  return ordered[(index + 1) % ordered.length]?.id ?? null;
}

// ---------------------------------------------------------------------------
// MediaRecorder

export const RECORDER_MIME_CANDIDATES: readonly string[] = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
];

/**
 * The best WebM the engine can write, or `''` for "let MediaRecorder choose".
 * `isTypeSupported` is the engine's own (`MediaRecorder.isTypeSupported`); a
 * throwing probe counts as unsupported.
 */
export function pickRecorderMime(isTypeSupported: (mime: string) => boolean): string {
  for (const mime of RECORDER_MIME_CANDIDATES) {
    try {
      if (isTypeSupported(mime)) return mime;
    } catch {
      /* treated as unsupported */
    }
  }
  return '';
}

// ---------------------------------------------------------------------------
// ffmpeg

export interface RecorderFinalizeArgsInput {
  input: string;
  output: string;
  crop?: CropPx | null;
  hasAudio: boolean;
  quality: RecorderQuality;
  /** The ffmpeg video encoder (`libx264` when absent). */
  encoder?: string;
  /**
   * Letterbox every frame into this size. A recorded WINDOW can be resized
   * while it records, and an H.264 encoder cannot change size mid-stream, so
   * window recordings are fitted to their first frame's size.
   */
  fit?: SizeLike | null;
}

/**
 * WebM → MP4 (H.264 + AAC, faststart), cropped when the live crop was not
 * available. Without a crop the frame is still trimmed to even dimensions,
 * which yuv420p requires. Progress is written to stdout (`-progress pipe:1`).
 */
export function recorderFinalizeArgs(o: RecorderFinalizeArgsInput): string[] {
  const fitW = o.fit ? floorEven(o.fit.width) : 0;
  const fitH = o.fit ? floorEven(o.fit.height) : 0;
  const vf = o.crop
    ? `crop=${o.crop.width}:${o.crop.height}:${o.crop.x}:${o.crop.y}`
    : fitW >= 2 && fitH >= 2
      ? `scale=${fitW}:${fitH}:force_original_aspect_ratio=decrease,pad=${fitW}:${fitH}:(ow-iw)/2:(oh-ih)/2,setsar=1`
      : 'crop=trunc(iw/2)*2:trunc(ih/2)*2:0:0';
  const audioKbps = RECORDER_QUALITY_PRESETS[o.quality]?.audioKbps ?? 160;
  return [
    '-hide_banner', '-nostats', '-loglevel', 'error', '-y',
    '-fflags', '+genpts',
    '-i', o.input,
    '-map', '0:v:0',
    ...(o.hasAudio ? ['-map', '0:a:0'] : []),
    '-vf', vf,
    ...recorderVideoEncodeArgs(o.encoder ?? 'libx264', o.quality),
    ...(o.hasAudio ? ['-c:a', 'aac', '-b:a', `${audioKbps}k`] : ['-an']),
    '-movflags', '+faststart',
    '-progress', 'pipe:1',
    o.output,
  ];
}

/**
 * The newest output position in an ffmpeg `-progress` block, in seconds.
 * `out_time_us` and (despite its name, also microseconds) `out_time_ms` are
 * preferred; `out_time=HH:MM:SS.ffffff` is the fallback.
 */
export function parseFfmpegProgressSeconds(text: string): number | null {
  let found: number | null = null;
  for (const line of text.split(/\r?\n/)) {
    const [key, raw] = line.split('=', 2);
    if (raw === undefined) continue;
    const value = raw.trim();
    if (key === 'out_time_us' || key === 'out_time_ms') {
      const us = Number(value);
      if (Number.isFinite(us) && us >= 0) found = us / 1_000_000;
    } else if (key === 'out_time') {
      const m = /^(\d+):(\d{2}):(\d{2}(?:\.\d+)?)$/.exec(value);
      if (m) found = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
    }
  }
  return found;
}

/** `ffmpeg -i` stderr → duration (seconds, null for N/A) and which streams exist. */
export function parseFfmpegProbe(stderr: string): { durationSec: number | null; hasVideo: boolean; hasAudio: boolean; width: number | null; height: number | null } {
  const input = stderr.split(/Output #0/)[0] ?? stderr;
  const d = /Duration:\s*(\d+):(\d{2}):(\d{2}(?:\.\d+)?)/.exec(input);
  const video = /Stream #\d+:\d+[^\n]*: Video:[^\n]*?(\d{2,5})x(\d{2,5})/.exec(input);
  return {
    durationSec: d ? Number(d[1]) * 3600 + Number(d[2]) * 60 + Number(d[3]) : null,
    hasVideo: /Stream #\d+:\d+[^\n]*: Video:/.test(input),
    hasAudio: /Stream #\d+:\d+[^\n]*: Audio:/.test(input),
    width: video ? Number(video[1]) : null,
    height: video ? Number(video[2]) : null,
  };
}

// ---------------------------------------------------------------------------
// Files

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** `Gum Recording 2026-10-08 140322` — local time, no characters Windows refuses. */
export function recordingBaseName(at: Date): string {
  return `Gum Recording ${at.getFullYear()}-${pad2(at.getMonth() + 1)}-${pad2(at.getDate())} `
    + `${pad2(at.getHours())}${pad2(at.getMinutes())}${pad2(at.getSeconds())}`;
}

/** `base.ext`, or `base (2).ext`, `base (3).ext` … when the name is taken. */
export function uniqueRecordingFileName(base: string, ext: string, exists: (name: string) => boolean): string {
  const clean = base.replace(/[<>:"/\\|?*]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Gum Recording';
  const first = `${clean}.${ext}`;
  if (!exists(first)) return first;
  for (let i = 2; i < 1000; i += 1) {
    const name = `${clean} (${i}).${ext}`;
    if (!exists(name)) return name;
  }
  return `${clean} ${Date.now()}.${ext}`;
}

/** A partial recording's id: also its file stem under `.partial`. */
export function recorderPartialId(at: number, salt: number): string {
  return `rec-${at.toString(36)}-${Math.abs(Math.round(salt)).toString(36)}`;
}

/** Free bytes from an `fs.statfs` result (numbers or bigints). */
export function freeBytesFromStatfs(stat: { bavail: number | bigint; bsize: number | bigint }): number {
  return Number(stat.bavail) * Number(stat.bsize);
}

/** `unknown` when the free space could not be read — which never blocks a recording. */
export function diskSpaceVerdict(freeBytes: number | null | undefined, minBytes = RECORDER_MIN_FREE_BYTES): 'ok' | 'low' | 'unknown' {
  if (freeBytes === null || freeBytes === undefined || !Number.isFinite(freeBytes)) return 'unknown';
  return freeBytes < minBytes ? 'low' : 'ok';
}

// ---------------------------------------------------------------------------
// Time

/** Recorded (not wall-clock) milliseconds: paused stretches do not count. */
export function recordedMs(startedAt: number, now: number, pausedTotalMs: number, pausedSince: number | null): number {
  const paused = pausedTotalMs + (pausedSince !== null ? Math.max(0, now - pausedSince) : 0);
  return Math.max(0, now - startedAt - paused);
}

export function recorderLimitReached(recorded: number, maxMinutes: number): boolean {
  return recorded >= maxMinutes * 60_000;
}

/** `4:05`, `12:05`, `1:02:05`. */
export function formatRecorderClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
}

// ---------------------------------------------------------------------------
// Ordered chunks

/**
 * Writes numbered chunks strictly in order, whatever order they arrive in.
 *
 * MediaRecorder hands each chunk over as a Blob whose bytes are read
 * asynchronously, so the IPC messages can overtake one another; appending
 * them as they land would scramble the WebM. Each chunk carries the sequence
 * number it was given when it was produced, and is held until every earlier
 * one has been written. A repeated or stale number is dropped. Too many held
 * chunks (a number that will never come) is a failure, not a silent hole.
 */
export class OrderedChunkSink<T> {
  private next = 0;
  private readonly pending = new Map<number, T>();
  private chain: Promise<void> = Promise.resolve();
  private failure: Error | null = null;
  private writtenCount = 0;

  constructor(
    private readonly write: (chunk: T, seq: number) => Promise<void>,
    private readonly onError: (error: Error) => void = () => undefined,
    private readonly maxPending = 30,
  ) {}

  /** The next sequence number that will be written. */
  get expected(): number {
    return this.next;
  }

  get written(): number {
    return this.writtenCount;
  }

  get error(): Error | null {
    return this.failure;
  }

  get held(): number {
    return this.pending.size;
  }

  push(seq: number, chunk: T): void {
    if (this.failure) return;
    if (!Number.isInteger(seq) || seq < this.next || this.pending.has(seq)) return;
    this.pending.set(seq, chunk);
    if (this.pending.size > this.maxPending) {
      this.fail(new Error(`chunk ${this.next} never arrived`));
      return;
    }
    while (this.pending.has(this.next)) {
      const seqNow = this.next;
      const value = this.pending.get(seqNow) as T;
      this.pending.delete(seqNow);
      this.next += 1;
      this.chain = this.chain.then(async () => {
        if (this.failure) return;
        try {
          await this.write(value, seqNow);
          this.writtenCount += 1;
        } catch (err) {
          this.fail(err instanceof Error ? err : new Error(String(err)));
        }
      });
    }
  }

  /** Resolves once every chunk handed over so far has been written (or failed). */
  settle(): Promise<void> {
    return this.chain;
  }

  private fail(error: Error): void {
    if (this.failure) return;
    this.failure = error;
    this.pending.clear();
    this.onError(error);
  }
}

// ---------------------------------------------------------------------------
// State the windows see

export type RecorderTranscriptState =
  | 'off'
  | 'checking'
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'model-missing'
  /** The speech model is not downloaded; transcription starts on its own once it is. */
  | 'waiting-model'
  | 'no-audio';

/** What was recorded: a drawn region, a whole monitor, or one window. */
export type RecorderSourceKind = 'region' | 'monitor' | 'window';

export interface RecorderJob {
  id: string;
  createdAt: number;
  title: string;
  phase: RecorderJobPhase;
  source?: RecorderSourceKind;
  /** The ffmpeg encoder that made the MP4, once it exists. */
  encoder?: string;
  /** The hardware encoder failed on this recording and x264 finished it. */
  encoderFellBack?: boolean;
  /** 0–1 while finalizing. */
  progress: number;
  partialPath: string;
  outputPath?: string;
  mediaId?: string;
  durationMs: number;
  hasAudio: boolean | null;
  transcript: RecorderTranscriptState;
  transcriptDone?: number;
  transcriptTotal?: number;
  /** Why the recording stopped when it was not the user (a catalog key). */
  stopReasonKey?: string;
  errorKey?: string;
  errorDetail?: string;
  /** The player could not be reached; the file was opened for direct playback instead. */
  playedDirect?: boolean;
}

export interface RecorderRecoverable {
  id: string;
  partialPath: string;
  bytes: number;
  startedAt: number;
}

export interface RecorderState {
  phase: RecorderSessionPhase;
  settings: RecorderSettings;
  defaultFolder: string;
  startedAt: number | null;
  pausedTotalMs: number;
  pausedSince: number | null;
  displayId: number | null;
  /** Whether system audio is in this recording, and if not, why. */
  systemAudio: 'on' | 'off' | 'unsupported';
  mic: boolean;
  /** `false`: the whole monitor is recorded and cropped by ffmpeg afterwards. */
  liveCrop: boolean | null;
  errorKey?: string;
  errorDetail?: string;
  jobs: RecorderJob[];
  recoverable: RecorderRecoverable[];
  /** System-audio loopback only exists on Windows. */
  loopbackSupported: boolean;
  /** What the live session records (null when idle). */
  source?: RecorderSourceKind | null;
  /** The recorded window's title, in window mode. */
  windowName?: string;
  /** The last encoder detection, once one ran in this process. */
  encoders?: RecorderEncoderReport | null;
  /** Recordings waiting for the speech model before they are transcribed. */
  waitingForModel?: number;
}

/** What the overlay is told when it opens over a display. */
export interface RecorderSelectInit {
  /** The display's bounds in global DIP; the overlay covers exactly this. */
  bounds: RectLike;
  displayId: number;
  scaleFactor: number;
  displayCount: number;
  /** The remembered region, when it belongs to this display. */
  lastRegion: RectLike | null;
}

/** What the hidden recording window is asked to do. */
export interface RecorderHostConfig {
  fps: number;
  /** Display-local DIP. */
  region: RectLike;
  displaySize: SizeLike;
  audio: RecorderAudioSource;
  /** Whether main granted loopback audio with the screen. */
  systemAudioGranted: boolean;
  micDeviceId: string;
  systemGain: number;
  micGain: number;
  videoBitsPerSecond: number;
  chunkMs: number;
  /** Record every frame whole (a window): no region, no crop. */
  fullFrame?: boolean;
}

export interface RecorderHostStartResult {
  ok: boolean;
  errorKey?: string;
  error?: string;
  mime?: string;
  frameSize?: SizeLike;
  liveCrop?: boolean;
  /** The crop ffmpeg must apply (only when the live crop was unavailable). */
  crop?: CropPx | null;
  hasAudio?: boolean;
  systemAudio?: boolean;
  mic?: boolean;
}

export type RecorderHostCommand = { type: 'stop' } | { type: 'pause' } | { type: 'resume' };

export type RecorderHostEvent =
  | { type: 'stopped'; lastSeq: number }
  | { type: 'ended'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'levels'; mic: number; system: number };

/** What `.partial/<id>.json` holds beside the WebM, so a crash can be finished later. */
export interface RecorderPartialMeta {
  version: 1;
  id: string;
  startedAt: number;
  title: string;
  folder: string;
  quality: RecorderQuality;
  crop: CropPx | null;
  hasAudio: boolean;
  recordedMs: number;
  /** Set once the recording stopped cleanly. */
  complete: boolean;
  /** Absent in partials written before window recording existed: a region. */
  source?: RecorderSourceKind;
}

export function normalizePartialMeta(raw: unknown): RecorderPartialMeta | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.version !== 1 || typeof r.id !== 'string' || !/^[\w-]{3,80}$/.test(r.id)) return null;
  const startedAt = Number(r.startedAt);
  if (!Number.isFinite(startedAt)) return null;
  let crop: CropPx | null = null;
  if (r.crop && typeof r.crop === 'object') {
    const c = r.crop as Record<string, unknown>;
    const nums = [c.x, c.y, c.width, c.height].map(Number);
    if (nums.every((n) => Number.isFinite(n) && n >= 0) && nums[2] >= 2 && nums[3] >= 2) {
      crop = { x: floorEven(nums[0]), y: floorEven(nums[1]), width: floorEven(nums[2]), height: floorEven(nums[3]) };
    }
  }
  return {
    version: 1,
    id: r.id,
    startedAt,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.slice(0, 200) : recordingBaseName(new Date(startedAt)),
    folder: typeof r.folder === 'string' ? r.folder : '',
    quality: RECORDER_QUALITIES.includes(r.quality as RecorderQuality) ? r.quality as RecorderQuality : 'standard',
    crop,
    hasAudio: r.hasAudio === true,
    recordedMs: Number.isFinite(Number(r.recordedMs)) ? Math.max(0, Number(r.recordedMs)) : 0,
    complete: r.complete === true,
    ...(r.source === 'window' || r.source === 'monitor' || r.source === 'region' ? { source: r.source } : {}),
  };
}

// ---------------------------------------------------------------------------
// History: finished recordings, kept across restarts

/** Entries kept; the oldest go first (the files stay on disk). */
export const RECORDER_HISTORY_LIMIT = 200;

export interface RecorderHistoryEntry {
  id: string;
  title: string;
  outputPath: string;
  mediaId?: string;
  /** When the recording started (ms epoch). */
  createdAt: number;
  /** The local calendar day it was made on, `YYYY-MM-DD`: its study day. */
  studyDay: string;
  durationMs: number;
  bytes: number;
  source: RecorderSourceKind;
  hasAudio: boolean;
  encoder?: string;
  transcript: RecorderTranscriptState;
  /** Put on its study day in Calendar and Statistics (once, by the main window). */
  studyTagged: boolean;
}

/** A local-time `YYYY-MM-DD`, the key Calendar and Statistics file days under. */
export function recorderStudyDay(at: number): string {
  const d = new Date(Number.isFinite(at) ? at : 0);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const TRANSCRIPT_STATES: readonly RecorderTranscriptState[] = [
  'off', 'checking', 'queued', 'running', 'done', 'failed', 'model-missing', 'waiting-model', 'no-audio',
];

/** One untrusted history row (a hand-edited JSON file), or null when unusable. */
export function normalizeRecorderHistoryEntry(raw: unknown): RecorderHistoryEntry | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[\w-]{3,80}$/.test(r.id)) return null;
  if (typeof r.outputPath !== 'string' || !r.outputPath.trim()) return null;
  const createdAt = Number(r.createdAt);
  if (!Number.isFinite(createdAt) || createdAt <= 0) return null;
  const num = (v: unknown): number => (Number.isFinite(Number(v)) ? Math.max(0, Number(v)) : 0);
  const transcript = TRANSCRIPT_STATES.includes(r.transcript as RecorderTranscriptState)
    ? r.transcript as RecorderTranscriptState
    : 'off';
  return {
    id: r.id,
    title: typeof r.title === 'string' && r.title.trim() ? r.title.slice(0, 200) : recordingBaseName(new Date(createdAt)),
    outputPath: r.outputPath,
    ...(typeof r.mediaId === 'string' && r.mediaId ? { mediaId: r.mediaId } : {}),
    createdAt,
    studyDay: typeof r.studyDay === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.studyDay) ? r.studyDay : recorderStudyDay(createdAt),
    durationMs: num(r.durationMs),
    bytes: num(r.bytes),
    source: r.source === 'window' || r.source === 'monitor' ? r.source : 'region',
    hasAudio: r.hasAudio === true,
    ...(typeof r.encoder === 'string' && /^[\w-]{1,40}$/.test(r.encoder) ? { encoder: r.encoder } : {}),
    transcript,
    studyTagged: r.studyTagged === true,
  };
}

/**
 * The history as read from disk at start: a transcription that was mid-flight
 * when the app closed did not finish, so it reads as failed (and can be run
 * again) rather than as running forever.
 */
export function recorderHistoryFromDisk(raw: unknown): RecorderHistoryEntry[] {
  return normalizeRecorderHistory(raw).map((entry) => (
    entry.transcript === 'checking' || entry.transcript === 'queued' || entry.transcript === 'running'
      ? { ...entry, transcript: 'failed' as const }
      : entry));
}

/** A whole history file: valid rows, newest first, one per id, capped. */
export function normalizeRecorderHistory(raw: unknown): RecorderHistoryEntry[] {
  const rows = Array.isArray(raw) ? raw : [];
  const seen = new Set<string>();
  const out: RecorderHistoryEntry[] = [];
  for (const row of rows) {
    const entry = normalizeRecorderHistoryEntry(row);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, RECORDER_HISTORY_LIMIT);
}

/** Add or replace one row, keeping the file's order and cap. */
export function upsertRecorderHistory(list: readonly RecorderHistoryEntry[], entry: RecorderHistoryEntry): RecorderHistoryEntry[] {
  return normalizeRecorderHistory([entry, ...list.filter((e) => e.id !== entry.id)]);
}

/** What the main window is asked to file under a study day. */
export interface RecorderStudyTagRequest {
  requestId: string;
  id: string;
  title: string;
  /** `YYYY-MM-DD`. */
  studyDay: string;
  createdAt: number;
  /** Recorded seconds, counted as study time on that day. */
  seconds: number;
  outputPath: string;
  mediaId?: string;
}
