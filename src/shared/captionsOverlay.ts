/**
 * Live captions overlay and system-audio mining — the pure, shared half.
 *
 * Main (`main/systemAudioCapture.ts`) owns the settings, the windows and the
 * mining pipeline; the overlay (`renderer/captions/CaptionsOverlay.tsx`) and
 * the hidden capture window render and record. What they must agree on lives
 * here, free of Electron and the DOM, and is tested directly
 * (`__tests__/captionsOverlay.test.ts`): the settings shape and its bounds,
 * what a caption line is, how a line is split into clickable words in each
 * study language, which stretch of the ring buffer a line's audio is, and the
 * energy segmenter that cuts the loopback stream into utterances for the
 * experimental Whisper caption source.
 */
import { segmentStudyText } from './studySegmentation';
import type { StudyLang } from './studyLang';
import {
  CAPTURE_SECONDS_DEFAULT,
  MINE_SECONDS_DEFAULT,
  clampCaptureSeconds,
  clampMineSeconds,
} from './systemAudioRing';

/* ------------------------------------------------------------------ *
 * Settings.
 * ------------------------------------------------------------------ */

/**
 * Where caption lines come from.
 * - `windows`: the Windows Live Captions window, read by the existing poller;
 * - `gum`: near-real-time Whisper over the loopback stream (experimental);
 * - `off`: the bar shows nothing but mined drafts and notices.
 */
export type CaptionSource = 'windows' | 'gum' | 'off';

export const CAPTION_SOURCES: readonly CaptionSource[] = ['windows', 'gum', 'off'];

export interface OverlayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CaptionsSettings {
  /** Rolling buffer length in seconds (30–120). */
  captureSeconds: number;
  /** "Mine the last N seconds" (3–30). */
  mineSeconds: number;
  source: CaptionSource;
  /** Background opacity of the caption bar, 0.2–1. */
  overlayOpacity: number;
  /** Caption text size in px. */
  fontSize: number;
  /** Where the overlay window was last left; null = centred near the bottom. */
  bounds: OverlayBounds | null;
  /** Transcribe mined clips with the installed Whisper model. */
  transcribeMined: boolean;
}

export const OVERLAY_OPACITY_MIN = 0.2;
export const OVERLAY_OPACITY_MAX = 1;
export const OVERLAY_FONT_MIN = 16;
export const OVERLAY_FONT_MAX = 44;
/** The caption bar's own size limits (the window adds headroom for pop-ups above it). */
export const OVERLAY_MIN_WIDTH = 420;
export const OVERLAY_MIN_HEIGHT = 96;
export const OVERLAY_MAX_WIDTH = 2400;
export const OVERLAY_MAX_HEIGHT = 520;
export const OVERLAY_DEFAULT_WIDTH = 880;
export const OVERLAY_DEFAULT_HEIGHT = 132;
/**
 * Transparent, click-through room above the bar, inside the same window: the
 * dictionary pop-up, the history and a mined draft open up into it rather than
 * needing windows of their own.
 */
export const OVERLAY_HEADROOM = 380;

export const DEFAULT_CAPTIONS_SETTINGS: CaptionsSettings = {
  captureSeconds: CAPTURE_SECONDS_DEFAULT,
  mineSeconds: MINE_SECONDS_DEFAULT,
  source: 'windows',
  overlayOpacity: 0.72,
  fontSize: 24,
  bounds: null,
  transcribeMined: true,
};

function clampNumber(value: unknown, min: number, max: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function normalizeBounds(value: unknown): OverlayBounds | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Partial<OverlayBounds>;
  const x = Number(v.x);
  const y = Number(v.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    x: Math.round(x),
    y: Math.round(y),
    width: Math.round(clampNumber(v.width, OVERLAY_MIN_WIDTH, OVERLAY_MAX_WIDTH, OVERLAY_DEFAULT_WIDTH)),
    height: Math.round(clampNumber(v.height, OVERLAY_MIN_HEIGHT, OVERLAY_MAX_HEIGHT, OVERLAY_DEFAULT_HEIGHT)),
  };
}

/** Whatever was stored (or sent over IPC), as settings that are always in range. */
export function normalizeCaptionsSettings(value: unknown, base: CaptionsSettings = DEFAULT_CAPTIONS_SETTINGS): CaptionsSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof CaptionsSettings, unknown>>;
  return {
    captureSeconds: v.captureSeconds === undefined ? base.captureSeconds : clampCaptureSeconds(v.captureSeconds),
    mineSeconds: v.mineSeconds === undefined ? base.mineSeconds : clampMineSeconds(v.mineSeconds),
    source: CAPTION_SOURCES.includes(v.source as CaptionSource) ? (v.source as CaptionSource) : base.source,
    overlayOpacity: Math.round(clampNumber(v.overlayOpacity, OVERLAY_OPACITY_MIN, OVERLAY_OPACITY_MAX, base.overlayOpacity) * 100) / 100,
    fontSize: Math.round(clampNumber(v.fontSize, OVERLAY_FONT_MIN, OVERLAY_FONT_MAX, base.fontSize)),
    bounds: v.bounds === undefined ? base.bounds : normalizeBounds(v.bounds),
    transcribeMined: typeof v.transcribeMined === 'boolean' ? v.transcribeMined : base.transcribeMined,
  };
}

/* ------------------------------------------------------------------ *
 * State the overlay renders.
 * ------------------------------------------------------------------ */

/** One caption line as the overlay shows it. Times are wall-clock ms. */
export interface CaptionOverlayLine {
  id: string;
  text: string;
  /** First seen (Live Captions) or utterance start (Whisper). */
  startMs: number;
  /** Last revised (Live Captions) or utterance end (Whisper). */
  endMs: number;
  source: 'windows' | 'gum';
  /** False while the recognizer may still revise it. */
  final: boolean;
  /** Foreground window title when the line appeared (study content, shown as-is). */
  windowTitle?: string;
}

/** How many lines the overlay keeps for scrolling back. */
export const OVERLAY_HISTORY_MAX = 60;

export type CaptureIndicator = 'off' | 'starting' | 'on' | 'error';

export interface CaptionsState {
  settings: CaptionsSettings;
  capture: CaptureIndicator;
  /** i18n key of why capture is not running, when it failed. */
  captureErrorKey?: string;
  /** Raw detail for that failure (not translated; shown small). */
  captureErrorDetail?: string;
  /** Milliseconds of audio currently held in memory. */
  bufferedMs: number;
  /** A manual recording is running; when it started (wall ms). */
  recordingSince: number | null;
  overlayOpen: boolean;
  /** Windows Live Captions: our poller is reading its window. */
  windowsAttached: boolean;
  /** Windows Live Captions: the poller runs but the Live Captions app does not. */
  windowsWaiting: boolean;
  /** Gum captions: no Whisper model is installed for the study language. */
  gumModelMissing: boolean;
  supported: boolean;
  studyLang: StudyLang;
}

/** A mined clip waiting for the user's OK in the overlay. */
export interface CaptionDraft {
  id: string;
  kind: 'recent' | 'recording' | 'line';
  createdAt: number;
  /** The sentence on the card. Editable before adding. */
  text: string;
  /** A single word mined from the dictionary pop-up (card front); else the sentence is. */
  word?: string;
  reading?: string;
  meaning?: string;
  /** 'pending' while Whisper runs. */
  transcript: 'pending' | 'done' | 'none' | 'model-missing' | 'failed' | 'caption';
  /** MP3 (or WAV when ffmpeg failed), base64, held in memory until added. */
  audioBase64?: string;
  audioMime?: string;
  audioFilename?: string;
  durationMs: number;
  /** Why there is no audio (capture off, silence), as an i18n key. */
  audioNoteKey?: string;
  sourceTitle?: string;
  studyLang: StudyLang;
  textProvenance: 'auto-captions' | 'transcript';
}

/** A short message in the overlay (an i18n key and its variables). */
export interface CaptionNotice {
  id: string;
  key: string;
  vars?: Record<string, string | number>;
  kind: 'info' | 'success' | 'warning';
}

/** What main hands the main window to put a caption card in the deck. */
export interface CaptionMinePayload {
  requestId: string;
  sentence: string;
  word?: string;
  reading?: string;
  meaning?: string;
  studyLang: StudyLang;
  sourceTitle?: string;
  textProvenance: 'auto-captions' | 'transcript';
  audioBase64?: string;
  audioFilename?: string;
}

export interface CaptionMineReply {
  requestId: string;
  ok: boolean;
  created?: boolean;
  cardId?: string;
  error?: string;
}

/* ------------------------------------------------------------------ *
 * Words in a caption line.
 * ------------------------------------------------------------------ */

/** A run of a caption line; `word` runs are hoverable and open the dictionary. */
export interface CaptionTokenSpan {
  text: string;
  start: number;
  end: number;
  word: boolean;
}

const HAS_LETTER = /[\p{L}\p{N}]/u;
const HAN = /\p{Script=Han}/u;
const CYRILLIC = /\p{Script=Cyrillic}/u;
const JAPANESE = /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}ー々]/u;

function isStudyWord(text: string, lang: StudyLang): boolean {
  if (!HAS_LETTER.test(text)) return false;
  if (lang === 'zh') return HAN.test(text);
  if (lang === 'ru') return CYRILLIC.test(text);
  return JAPANESE.test(text);
}

/**
 * Split a caption line into spans for the overlay.
 *
 * Japanese uses the morphological tokenizer's surfaces when the caller has
 * them (kuromoji gives 食べました as one lookup, not three); before kuromoji
 * has loaded, and for Chinese and Russian always, ICU's word segmenter does
 * the split. Surfaces that cannot be found in order are skipped rather than
 * trusted, so a tokenizer that normalised the text never shifts the spans.
 * Only study-language words are marked clickable — an English aside or a
 * number in a Russian line is plain text.
 */
export function captionTokenSpans(text: string, lang: StudyLang, surfaces?: readonly string[]): CaptionTokenSpan[] {
  if (!text) return [];
  if (lang === 'ja' && surfaces && surfaces.length) {
    const spans: CaptionTokenSpan[] = [];
    let at = 0;
    for (const surface of surfaces) {
      if (!surface) continue;
      const found = text.indexOf(surface, at);
      if (found < 0) continue;
      if (found > at) spans.push({ text: text.slice(at, found), start: at, end: found, word: false });
      spans.push({ text: surface, start: found, end: found + surface.length, word: isStudyWord(surface, lang) });
      at = found + surface.length;
    }
    if (at < text.length) spans.push({ text: text.slice(at), start: at, end: text.length, word: false });
    return spans;
  }
  const spans = segmentStudyText(text, lang).map((seg) => ({
    text: seg.text,
    start: seg.start,
    end: seg.end,
    word: seg.wordLike && isStudyWord(seg.text, lang),
  }));
  if (lang !== 'ru') return spans;
  // ICU splits кто-нибудь / по-русски at the hyphen; the dictionary has them whole.
  const merged: CaptionTokenSpan[] = [];
  for (const span of spans) {
    const a = merged[merged.length - 1];
    const b = merged[merged.length - 2];
    if (span.word && a && b && b.word && a.text === '-' && b.end === a.start && a.end === span.start) {
      merged.splice(-2, 2, { text: text.slice(b.start, span.end), start: b.start, end: span.end, word: true });
    } else {
      merged.push(span);
    }
  }
  return merged;
}

/* ------------------------------------------------------------------ *
 * A line's audio.
 * ------------------------------------------------------------------ */

/**
 * Live Captions shows a line about a second after the speech began and keeps
 * revising it while the speaker goes on, so a line's audio starts a little
 * before it was first seen and ends a little after its last revision.
 */
export const LINE_LEAD_MS = 1500;
export const LINE_TAIL_MS = 700;
/** A line clip never runs longer than this (a line revised for a minute is a monologue). */
export const LINE_MAX_MS = 20_000;
export const LINE_MIN_MS = 1200;

/** The wall-clock stretch of the ring buffer that holds `line`'s speech. */
export function lineAudioWindow(
  line: Pick<CaptionOverlayLine, 'startMs' | 'endMs' | 'source'>,
  next?: Pick<CaptionOverlayLine, 'startMs'> | null,
): { startMs: number; endMs: number } {
  // Whisper utterances are already speech-bounded; pad them lightly.
  const lead = line.source === 'gum' ? 250 : LINE_LEAD_MS;
  const tail = line.source === 'gum' ? 250 : LINE_TAIL_MS;
  const startMs = line.startMs - lead;
  let endMs = Math.max(line.endMs, line.startMs) + tail;
  // Never run into the next line's own speech.
  if (next && Number.isFinite(next.startMs) && next.startMs > line.startMs) {
    endMs = Math.min(endMs, Math.max(next.startMs - (line.source === 'gum' ? 0 : LINE_LEAD_MS / 3), line.startMs + LINE_MIN_MS));
  }
  endMs = Math.max(endMs, startMs + LINE_MIN_MS);
  endMs = Math.min(endMs, startMs + LINE_MAX_MS);
  return { startMs, endMs };
}

/** File name for a mined clip — stable per text+time, readable in Anki's media folder. */
export function captionClipFilename(startMs: number, ext: 'mp3' | 'wav'): string {
  const d = new Date(startMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}-${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
  return `gum-captions-${stamp}.${ext}`;
}

/* ------------------------------------------------------------------ *
 * Energy segmentation for the Whisper caption source.
 * ------------------------------------------------------------------ */

export interface VadOptions {
  sampleRate: number;
  /** Analysis frame. */
  frameMs?: number;
  /** A frame is speech above this RMS (0..1)… */
  speechRms?: number;
  /** …or above this multiple of the running noise floor. */
  noiseRatio?: number;
  /** Silence that ends an utterance. */
  hangoverMs?: number;
  /** An utterance shorter than this is a click, not speech. */
  minSpeechMs?: number;
  /** A long monologue is cut here so captions keep flowing. */
  maxUtteranceMs?: number;
  /** Audio kept before the first speech frame. */
  preRollMs?: number;
}

export interface VadUtterance {
  samples: Int16Array;
  /** Wall-clock times of the first and last sample. */
  startMs: number;
  endMs: number;
  /** True when cut at `maxUtteranceMs` rather than at a pause. */
  forced: boolean;
}

/**
 * Cuts a live mono stream into utterances by frame energy.
 *
 * Not a neural VAD — just enough to hand Whisper whole phrases instead of
 * fixed slices that split words: a frame counts as speech when it is louder
 * than an absolute floor and than a multiple of the adaptive noise floor; an
 * utterance ends after `hangoverMs` of non-speech, or is cut at
 * `maxUtteranceMs`. With the defaults a phrase reaches Whisper ~0.6 s after it
 * ends, which with Whisper's own time keeps captions 2–5 s behind speech.
 */
export class EnergySegmenter {
  private readonly rate: number;
  private readonly frame: number;
  private readonly speechRms: number;
  private readonly noiseRatio: number;
  private readonly hangoverFrames: number;
  private readonly minSpeechFrames: number;
  private readonly maxFrames: number;
  private readonly preRollFrames: number;
  private noise = 0.002;
  private pending: number[] = [];
  private pendingEndMs = 0;
  private preRoll: Int16Array[] = [];
  private current: Int16Array[] = [];
  private currentStartMs = 0;
  private speechFrames = 0;
  private silentRun = 0;

  constructor(options: VadOptions) {
    this.rate = options.sampleRate;
    const frameMs = options.frameMs ?? 30;
    this.frame = Math.max(1, Math.round((this.rate * frameMs) / 1000));
    this.speechRms = options.speechRms ?? 0.012;
    this.noiseRatio = options.noiseRatio ?? 3;
    this.hangoverFrames = Math.max(1, Math.round((options.hangoverMs ?? 600) / frameMs));
    this.minSpeechFrames = Math.max(1, Math.round((options.minSpeechMs ?? 300) / frameMs));
    this.maxFrames = Math.max(this.minSpeechFrames + 1, Math.round((options.maxUtteranceMs ?? 6000) / frameMs));
    this.preRollFrames = Math.max(0, Math.round((options.preRollMs ?? 200) / frameMs));
  }

  private frameMs(): number {
    return (this.frame / this.rate) * 1000;
  }

  /** Feed samples captured up to `endWallMs`; returns utterances that closed. */
  push(chunk: Int16Array, endWallMs: number): VadUtterance[] {
    const out: VadUtterance[] = [];
    for (let i = 0; i < chunk.length; i += 1) this.pending.push(chunk[i]);
    this.pendingEndMs = endWallMs;
    const whole = Math.floor(this.pending.length / this.frame);
    if (!whole) return out;
    const consumed = whole * this.frame;
    // Wall time of the first pending sample.
    const baseMs = endWallMs - (this.pending.length / this.rate) * 1000;
    for (let f = 0; f < whole; f += 1) {
      const frame = Int16Array.from(this.pending.slice(f * this.frame, (f + 1) * this.frame));
      const frameStartMs = baseMs + f * this.frameMs();
      const utterance = this.onFrame(frame, frameStartMs);
      if (utterance) out.push(utterance);
    }
    this.pending = this.pending.slice(consumed);
    return out;
  }

  private onFrame(frame: Int16Array, frameStartMs: number): VadUtterance | null {
    let sum = 0;
    for (let i = 0; i < frame.length; i += 1) {
      const v = frame[i] / 0x8000;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / frame.length);
    const speech = rms > this.speechRms && rms > this.noise * this.noiseRatio;
    if (!speech) {
      // The floor follows quiet frames only, slowly, so speech never raises it.
      this.noise = this.noise * 0.95 + rms * 0.05;
    }
    if (!this.current.length) {
      if (speech) {
        this.currentStartMs = frameStartMs - this.preRoll.length * this.frameMs();
        this.current = [...this.preRoll, frame];
        this.preRoll = [];
        this.speechFrames = 1;
        this.silentRun = 0;
      } else {
        this.preRoll.push(frame);
        if (this.preRoll.length > this.preRollFrames) this.preRoll.shift();
      }
      return null;
    }
    this.current.push(frame);
    if (speech) {
      this.speechFrames += 1;
      this.silentRun = 0;
    } else {
      this.silentRun += 1;
    }
    if (this.silentRun >= this.hangoverFrames) return this.close(false);
    if (this.current.length >= this.maxFrames) return this.close(true);
    return null;
  }

  private close(forced: boolean): VadUtterance | null {
    const frames = this.current;
    const speechFrames = this.speechFrames;
    const startMs = this.currentStartMs;
    this.current = [];
    this.speechFrames = 0;
    this.silentRun = 0;
    if (speechFrames < this.minSpeechFrames) return null;
    // The trailing hangover stays in: it is ~0.6 s, and cutting at the last
    // loud frame clips the soft end of the final word.
    const total = frames.reduce((n, f) => n + f.length, 0);
    const samples = new Int16Array(total);
    let at = 0;
    for (const f of frames) {
      samples.set(f, at);
      at += f.length;
    }
    return { samples, startMs, endMs: startMs + (total / this.rate) * 1000, forced };
  }

  /** Close whatever is open (the source was switched off). */
  flush(): VadUtterance | null {
    if (!this.current.length) return null;
    return this.close(true);
  }

  /** Wall time the segmenter has consumed up to (tests). */
  get consumedUntilMs(): number {
    return this.pendingEndMs - (this.pending.length / this.rate) * 1000;
  }
}

/* ------------------------------------------------------------------ *
 * IPC channel names (one place, so main, preload and tests agree).
 * ------------------------------------------------------------------ */

export const CAPTIONS_CHANNELS = {
  state: 'captions:state',
  getState: 'captions:getState',
  setSettings: 'captions:setSettings',
  setCapture: 'captions:setCapture',
  mineRecent: 'captions:mineRecent',
  toggleRecording: 'captions:toggleRecording',
  toggleOverlay: 'captions:toggleOverlay',
  mineLine: 'captions:mineLine',
  mineCurrentLine: 'captions:mineCurrentLine',
  lines: 'captions:lines',
  getLines: 'captions:getLines',
  drafts: 'captions:drafts',
  getDrafts: 'captions:getDrafts',
  updateDraft: 'captions:updateDraft',
  confirmDraft: 'captions:confirmDraft',
  discardDraft: 'captions:discardDraft',
  notice: 'captions:notice',
  overlaySetIgnoreMouse: 'captions:overlaySetIgnoreMouse',
  overlaySetBounds: 'captions:overlaySetBounds',
  overlayGetBounds: 'captions:overlayGetBounds',
  openSettings: 'captions:openSettings',
  openSettingsInMain: 'captions:open-settings',
  mineRequest: 'captions:mine-request',
  mineReply: 'captions:mine-reply',
  // capture window <-> main
  hostCommand: 'captions:host-command',
  hostReply: 'captions:host-reply',
  hostStatus: 'captions:host-status',
  hostUtterance: 'captions:host-utterance',
  injectSnapshot: 'liveCaptions:injectSnapshot',
} as const;

/** Global command ids (keyboardShortcuts.ts rows with `global: true`). */
export const CAPTIONS_GLOBAL_COMMANDS = [
  'captions.mineRecent',
  'captions.toggleRecording',
  'captions.toggleOverlay',
  'captions.mineLine',
  'captions.toggleCapture',
] as const;

export type CaptionsGlobalCommand = (typeof CAPTIONS_GLOBAL_COMMANDS)[number];
