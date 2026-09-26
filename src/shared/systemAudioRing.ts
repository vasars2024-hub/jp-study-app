/**
 * System-audio capture — the pure half.
 *
 * The capture window (`renderer/captions/systemAudioCaptureHost.ts`) records
 * the Windows loopback stream into a rolling buffer that only ever lives in
 * memory; nothing reaches the disk until the user mines. Everything that
 * decides WHAT is kept and WHAT is cut sits here, free of the DOM and Electron,
 * so it is tested directly (`__tests__/systemAudioRing.test.ts`):
 *
 * - `PcmRing` — a fixed-capacity mono Int16 ring with a wall-clock timeline, so
 *   "the last 8 seconds" and "the audio of this caption line" (whose times are
 *   wall-clock stamps from the Live Captions poller) are both a slice of it;
 * - WAV encoding, the 16 kHz resample Whisper wants, and a level check that
 *   keeps a silent clip from becoming a silent card;
 * - the ffmpeg argument vector that turns the WAV into the same speech-sized
 *   MP3 the sentence deck cuts (`sentenceDeck.ts`), reading and writing pipes
 *   so the clip never exists as a temporary file.
 */

/** The ring's sample rate. Speech-clear, and a third of 48 kHz's memory. */
export const CAPTURE_SAMPLE_RATE = 24_000;
/** What Whisper is fed (`whisperWorker.ts` SAMPLE_RATE). */
export const WHISPER_SAMPLE_RATE = 16_000;

/** Rolling buffer length, in seconds: the user picks within these bounds. */
export const CAPTURE_SECONDS_MIN = 30;
export const CAPTURE_SECONDS_MAX = 120;
export const CAPTURE_SECONDS_DEFAULT = 60;

/** "Mine the last N seconds". */
export const MINE_SECONDS_MIN = 3;
export const MINE_SECONDS_MAX = 30;
export const MINE_SECONDS_DEFAULT = 8;

/** A manual recording stops by itself here. */
export const MANUAL_RECORDING_MAX_SECONDS = 60;

/**
 * A gap in the stream shorter than this is jitter (a late callback), not lost
 * audio; anything longer is filled with silence so later samples keep their
 * real wall-clock place on the timeline.
 */
export const RING_GAP_TOLERANCE_MS = 250;

export function clampCaptureSeconds(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return CAPTURE_SECONDS_DEFAULT;
  return Math.min(CAPTURE_SECONDS_MAX, Math.max(CAPTURE_SECONDS_MIN, n));
}

export function clampMineSeconds(value: unknown): number {
  const n = Math.round(Number(value));
  if (!Number.isFinite(n)) return MINE_SECONDS_DEFAULT;
  return Math.min(MINE_SECONDS_MAX, Math.max(MINE_SECONDS_MIN, n));
}

/** One cut out of the ring. `startMs`/`endMs` are wall-clock (epoch) milliseconds. */
export interface PcmSlice {
  samples: Int16Array;
  sampleRate: number;
  startMs: number;
  endMs: number;
}

function toInt16(sample: number): number {
  const s = Math.max(-1, Math.min(1, sample));
  return s < 0 ? Math.round(s * 0x8000) : Math.round(s * 0x7fff);
}

/**
 * A mono PCM ring with a wall-clock timeline.
 *
 * Absolute sample `i` (counting every sample ever written) sits at wall time
 * `endWallMs - (written - i) / rate`. Each write re-anchors `endWallMs` to the
 * time the caller says its last sample was captured, so drift between the audio
 * clock and the wall clock never accumulates past one chunk.
 */
export class PcmRing {
  readonly sampleRate: number;
  private buf: Int16Array;
  private written = 0;
  private lastWallMs = 0;

  constructor(sampleRate: number = CAPTURE_SAMPLE_RATE, seconds: number = CAPTURE_SECONDS_DEFAULT) {
    this.sampleRate = Math.max(1, Math.round(sampleRate));
    this.buf = new Int16Array(Math.max(1, Math.round(this.sampleRate * Math.max(1, seconds))));
  }

  /** Samples the ring can hold. */
  get capacity(): number {
    return this.buf.length;
  }

  /** Samples currently held (≤ capacity). */
  get length(): number {
    return Math.min(this.written, this.buf.length);
  }

  get durationMs(): number {
    return (this.length / this.sampleRate) * 1000;
  }

  /** Wall time of the newest sample (0 before the first write). */
  get endWallMs(): number {
    return this.lastWallMs;
  }

  /** Wall time of the oldest sample still held. */
  get startWallMs(): number {
    return this.lastWallMs - this.durationMs;
  }

  /** Bytes of audio held in memory — what the Settings page reports. */
  get bytes(): number {
    return this.buf.byteLength;
  }

  private push(value: number): void {
    this.buf[this.written % this.buf.length] = value;
    this.written += 1;
  }

  /**
   * Append one captured chunk whose last sample was captured at `endWallMs`.
   * Float input is [-1, 1] and is clipped; Int16 input is stored as-is.
   */
  write(chunk: Float32Array | Int16Array, endWallMs: number): void {
    const n = chunk.length;
    if (!n || !Number.isFinite(endWallMs)) return;
    if (this.written > 0) {
      const chunkMs = (n / this.sampleRate) * 1000;
      const gapMs = endWallMs - chunkMs - this.lastWallMs;
      if (gapMs > RING_GAP_TOLERANCE_MS) {
        const fill = Math.min(this.buf.length, Math.round((gapMs / 1000) * this.sampleRate));
        for (let i = 0; i < fill; i += 1) this.push(0);
      }
    }
    if (chunk instanceof Int16Array) {
      for (let i = 0; i < n; i += 1) this.push(chunk[i]);
    } else {
      for (let i = 0; i < n; i += 1) this.push(toInt16(chunk[i]));
    }
    this.lastWallMs = endWallMs;
  }

  /** Absolute sample index of wall time `ms`, clamped to what is held. */
  private indexAt(ms: number): number {
    const oldest = this.written - this.length;
    const idx = Math.round(this.written - ((this.lastWallMs - ms) / 1000) * this.sampleRate);
    return Math.min(this.written, Math.max(oldest, idx));
  }

  /** The audio between two wall times, clamped to what the ring still holds. */
  sliceWall(startMs: number, endMs: number): PcmSlice | null {
    if (!this.written || !Number.isFinite(startMs) || !Number.isFinite(endMs)) return null;
    const from = this.indexAt(Math.min(startMs, endMs));
    const to = this.indexAt(Math.max(startMs, endMs));
    if (to <= from) return null;
    const out = new Int16Array(to - from);
    const cap = this.buf.length;
    for (let i = from, j = 0; i < to; i += 1, j += 1) out[j] = this.buf[i % cap];
    const toWall = (idx: number): number => this.lastWallMs - ((this.written - idx) / this.sampleRate) * 1000;
    return { samples: out, sampleRate: this.sampleRate, startMs: toWall(from), endMs: toWall(to) };
  }

  /** The newest `seconds` of audio. */
  sliceLast(seconds: number): PcmSlice | null {
    if (!this.written) return null;
    const ms = Math.max(0, seconds) * 1000;
    return this.sliceWall(this.lastWallMs - ms, this.lastWallMs);
  }

  /** Forget everything held (capture turned off). */
  clear(): void {
    this.buf.fill(0);
    this.written = 0;
    this.lastWallMs = 0;
  }

  /** A new capacity, keeping the newest audio that still fits. */
  resize(seconds: number): void {
    const next = new Int16Array(Math.max(1, Math.round(this.sampleRate * Math.max(1, seconds))));
    if (next.length === this.buf.length) return;
    const keep = Math.min(this.length, next.length);
    const cap = this.buf.length;
    for (let j = 0, i = this.written - keep; j < keep; i += 1, j += 1) next[j] = this.buf[i % cap];
    this.buf = next;
    // Re-base the count so the modulo arithmetic starts from a clean slate;
    // the wall anchor is unchanged, so every kept sample keeps its time.
    this.written = keep;
  }
}

/** A growing buffer for a manual recording, capped at `maxSeconds`. */
export class PcmRecorder {
  readonly sampleRate: number;
  private readonly max: number;
  private chunks: Int16Array[] = [];
  private count = 0;
  readonly startWallMs: number;
  private lastWallMs: number;

  constructor(startWallMs: number, sampleRate: number = CAPTURE_SAMPLE_RATE, maxSeconds = MANUAL_RECORDING_MAX_SECONDS) {
    this.sampleRate = sampleRate;
    this.max = Math.round(sampleRate * maxSeconds);
    this.startWallMs = startWallMs;
    this.lastWallMs = startWallMs;
  }

  /** False once the cap is reached — the caller stops the recording then. */
  write(chunk: Float32Array | Int16Array, endWallMs: number): boolean {
    const room = this.max - this.count;
    if (room <= 0) return false;
    const n = Math.min(room, chunk.length);
    const out = new Int16Array(n);
    for (let i = 0; i < n; i += 1) {
      out[i] = chunk instanceof Int16Array ? chunk[i] : toInt16(chunk[i]);
    }
    this.chunks.push(out);
    this.count += n;
    this.lastWallMs = endWallMs;
    return this.count < this.max;
  }

  get durationMs(): number {
    return (this.count / this.sampleRate) * 1000;
  }

  finish(): PcmSlice {
    const samples = new Int16Array(this.count);
    let at = 0;
    for (const c of this.chunks) {
      samples.set(c, at);
      at += c.length;
    }
    this.chunks = [];
    return { samples, sampleRate: this.sampleRate, startMs: this.lastWallMs - this.durationMs, endMs: this.lastWallMs };
  }
}

export function floatToInt16(samples: Float32Array): Int16Array {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i += 1) out[i] = toInt16(samples[i]);
  return out;
}

/** Mix interleaved-by-channel input down to one channel. */
export function downmix(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 1) return channels[0].slice();
  const n = channels.reduce((min, c) => Math.min(min, c.length), Infinity);
  const out = new Float32Array(Number.isFinite(n) ? n : 0);
  for (const c of channels) for (let i = 0; i < out.length; i += 1) out[i] = out[i] + c[i] / channels.length;
  return out;
}

/** 16-bit mono PCM as a RIFF/WAVE file. */
export function encodeWav(samples: Int16Array, sampleRate: number): Uint8Array {
  const dataBytes = samples.length * 2;
  const out = new Uint8Array(44 + dataBytes);
  const view = new DataView(out.buffer);
  const ascii = (at: number, text: string): void => {
    for (let i = 0; i < text.length; i += 1) out[at + i] = text.charCodeAt(i);
  };
  ascii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  ascii(8, 'WAVE');
  ascii(12, 'fmt ');
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); // byte rate
  view.setUint16(32, 2, true); // block align
  view.setUint16(34, 16, true); // bits per sample
  ascii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let i = 0; i < samples.length; i += 1) view.setInt16(44 + i * 2, samples[i], true);
  return out;
}

/** The samples of a WAV `encodeWav` wrote (tests and the verify script read clips back). */
export function decodeWav(bytes: Uint8Array): { samples: Int16Array; sampleRate: number } | null {
  if (bytes.length < 44) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (at: number): string => String.fromCharCode(...bytes.subarray(at, at + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
  const sampleRate = view.getUint32(24, true);
  const dataBytes = Math.min(view.getUint32(40, true), bytes.length - 44);
  const samples = new Int16Array(Math.floor(dataBytes / 2));
  for (let i = 0; i < samples.length; i += 1) samples[i] = view.getInt16(44 + i * 2, true);
  return { samples, sampleRate };
}

/**
 * Linear resample to float [-1, 1]. Speech recognition does not need a better
 * filter at 24 → 16 kHz: nothing Whisper listens for lives above 8 kHz.
 */
export function resampleLinear(samples: Int16Array, fromRate: number, toRate: number = WHISPER_SAMPLE_RATE): Float32Array {
  if (!samples.length || fromRate <= 0 || toRate <= 0) return new Float32Array(0);
  const outLen = Math.max(1, Math.floor((samples.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i += 1) {
    const pos = i * step;
    const a = Math.floor(pos);
    const b = Math.min(samples.length - 1, a + 1);
    const frac = pos - a;
    out[i] = ((samples[a] * (1 - frac)) + (samples[b] * frac)) / 0x8000;
  }
  return out;
}

export interface LevelStats {
  /** Root-mean-square level, 0..1. */
  rms: number;
  /** Largest absolute sample, 0..1. */
  peak: number;
}

export function levelStats(samples: Int16Array | Float32Array): LevelStats {
  if (!samples.length) return { rms: 0, peak: 0 };
  const scale = samples instanceof Int16Array ? 1 / 0x8000 : 1;
  let sum = 0;
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] * scale;
    sum += v * v;
    const a = Math.abs(v);
    if (a > peak) peak = a;
  }
  return { rms: Math.sqrt(sum / samples.length), peak };
}

/** Below about −50 dBFS there is nothing to hear: no card is made of it. */
export const SILENCE_RMS = 0.003;

export function isSilent(stats: LevelStats): boolean {
  return stats.rms < SILENCE_RMS && stats.peak < SILENCE_RMS * 4;
}

/**
 * The captured WAV (on stdin) as a speech-sized MP3 (on stdout) — the sentence
 * deck's encoding: mono 44.1 kHz 64 kb/s MP3, single-pass loudness
 * normalisation, and short fades so the cut does not click.
 */
export function wavToMp3FfmpegArgs(durationSec: number): string[] {
  const fadeOut = Math.max(0, durationSec - 0.06);
  return [
    '-hide_banner',
    '-loglevel', 'error',
    '-f', 'wav',
    '-i', 'pipe:0',
    '-vn', '-sn', '-dn',
    '-ac', '1',
    '-af', [
      'loudnorm=I=-18:TP=-1.5:LRA=11',
      'aresample=44100',
      'afade=t=in:d=0.02',
      `afade=t=out:st=${fadeOut.toFixed(3)}:d=0.06`,
    ].join(','),
    '-c:a', 'libmp3lame',
    '-b:a', '64k',
    '-f', 'mp3',
    'pipe:1',
  ];
}

/** Base64 without `Buffer` (the capture renderer has none). Chunked to stay off the arg limit. */
export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(base64: string): Uint8Array {
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i);
  return out;
}
