/**
 * Secret Study OS Aero sound pack (Phase 5 · M4, rebuilt for the Vista pass).
 *
 * The project rules keep this inside src/, so every cue is synthesised here as an
 * original WAV data URL instead of a loose file under public/. Nothing is sampled
 * or transcribed from any operating system's sound scheme; the chords, timbres
 * and timings are this file's own.
 *
 * The synth (44.1 kHz, stereo):
 *  - voices: a soft sine with light harmonics, an inharmonic bell, a glassy
 *    pluck, and a wavetable pad played as three detuned, stereo-spread copies;
 *  - noise: seeded PRNG through one-pole filters (air, click, thud, water);
 *  - a small Schroeder reverb (4 damped combs + 2 all-passes, per channel with a
 *    stereo spread) and a subtle chorus for the lush pads.
 *
 * Every cue is still built lazily, on first play (`lazySounds`), and routed by
 * category so the sound engine's rules apply unchanged: Battery Saver mutes the
 * `environment` and `companion` beds, Aero safe mode mutes everything.
 *
 * The ambient bed is special. It loops (`soundEngine.playLoop`), so it must not
 * swell: the old bed was a 1.5 s cue with an attack and a release, which looped
 * as a throb every 1.5 s. It is now a 10 s, envelope-free bed whose every
 * frequency and LFO completes a whole number of cycles in the loop, rendered
 * with a pre-roll so the reverb and chorus are in steady state at the seam.
 */
import { soundEngine } from './soundEngine';
import { lazySounds, type SoundPackManifest } from './soundPack';

export const AERO_PROOF_SOUND_PACK_ID = 'secret-aero-proof';

export type AeroCueId =
  | 'startup'
  | 'shutdown'
  | 'restart'
  | 'sleep'
  | 'wake'
  | 'notify'
  | 'balloon'
  | 'info'
  | 'warning'
  | 'error'
  | 'criticalStop'
  | 'confirm'
  | 'cancel'
  | 'dialog'
  | 'menu'
  | 'navigate'
  | 'windowOpen'
  | 'windowClose'
  | 'minimize'
  | 'achievement'
  | 'deviceConnect'
  | 'ambient';

export const AERO_SAMPLE_RATE = 44100;
/** Length of the looping ambient bed, in seconds. */
export const AERO_AMBIENT_LOOP_SECONDS = 10;

const SR = AERO_SAMPLE_RATE;
const TAU = Math.PI * 2;

type Wave = 'soft' | 'bell' | 'glass' | 'pad';

interface ToneLayer {
  start: number;
  duration: number;
  freq: number;
  endFreq?: number;
  gain: number;
  attack?: number;
  release?: number;
  harmonic?: number;
  /** -1 (left) … 1 (right). */
  pan?: number;
  wave?: Wave;
  /** Exponential decay rate (1/s) for bell / glass voices. */
  decay?: number;
  /** Pad detune between its three copies, in cents. */
  detune?: number;
}

interface NoiseLayer {
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  release?: number;
  seed: number;
  color?: 'air' | 'click' | 'thud';
  pan?: number;
}

interface CueFx {
  /** Reverb wet level 0–1. */
  reverb?: number;
  /** Room size 0–1 (comb feedback). */
  room?: number;
  /** Chorus wet level 0–1. */
  chorus?: number;
}

interface Cue {
  duration: number;
  tones: ToneLayer[];
  noise?: NoiseLayer[];
  fx?: CueFx;
  /** Peak level the finished cue is normalised to (0–1). */
  peak?: number;
}

export interface StereoBuffer {
  left: Float32Array;
  right: Float32Array;
  sampleRate: number;
}

/* ------------------------------------------------------------------ voices */

/** Smooth (raised-cosine) attack/release — no clicks at either end. */
function envelope(t: number, duration: number, attack = 0.012, release = 0.06): number {
  if (t < 0 || t > duration) return 0;
  const a = Math.max(0.001, attack);
  const r = Math.max(0.001, release);
  if (t < a) return 0.5 - 0.5 * Math.cos((Math.PI * t) / a);
  if (t > duration - r) return 0.5 - 0.5 * Math.cos((Math.PI * Math.max(0, duration - t)) / r);
  return 1;
}

function panGains(pan = 0): [number, number] {
  const p = (Math.min(1, Math.max(-1, pan)) + 1) * (Math.PI / 4);
  return [Math.cos(p), Math.sin(p)];
}

const PAD_TABLE_SIZE = 4096;
let padTable: Float32Array | null = null;

/** One cycle of a warm, band-limited pad wave (8 harmonics, soft rolloff). */
function padWave(): Float32Array {
  if (padTable) return padTable;
  const table = new Float32Array(PAD_TABLE_SIZE);
  let max = 0;
  for (let i = 0; i < PAD_TABLE_SIZE; i++) {
    const x = (TAU * i) / PAD_TABLE_SIZE;
    let v = 0;
    for (let h = 1; h <= 8; h++) v += Math.sin(h * x) / h ** 1.6;
    table[i] = v;
    max = Math.max(max, Math.abs(v));
  }
  for (let i = 0; i < PAD_TABLE_SIZE; i++) table[i] /= max;
  padTable = table;
  return table;
}

function tableAt(table: Float32Array, phase: number): number {
  const pos = (phase - Math.floor(phase)) * PAD_TABLE_SIZE;
  const i = pos | 0;
  const frac = pos - i;
  const a = table[i];
  const b = table[(i + 1) % PAD_TABLE_SIZE];
  return a + (b - a) * frac;
}

function renderTone(layer: ToneLayer, left: Float32Array, right: Float32Array): void {
  const from = Math.max(0, Math.floor(layer.start * SR));
  const to = Math.min(left.length, Math.ceil((layer.start + layer.duration) * SR));
  const [gl, gr] = panGains(layer.pan);
  const wave = layer.wave ?? 'soft';
  const harmonic = layer.harmonic ?? 0.18;
  const decay = layer.decay ?? (wave === 'glass' ? 9 : 4.2);
  const glide = layer.endFreq && layer.endFreq > 0 && layer.endFreq !== layer.freq ? layer.endFreq / layer.freq : 1;
  const table = wave === 'pad' ? padWave() : null;
  const detune = wave === 'pad' ? 2 ** ((layer.detune ?? 7) / 1200) : 1;
  // Pad: three copies, centre + two detuned spread left/right.
  let p0 = 0;
  let p1 = 0.31;
  let p2 = 0.67;
  for (let i = from; i < to; i++) {
    const local = i / SR - layer.start;
    const progress = local / layer.duration;
    const freq = glide === 1 ? layer.freq : layer.freq * glide ** progress;
    const env = envelope(local, layer.duration, layer.attack, layer.release) * layer.gain;
    if (env === 0) {
      p0 += freq / SR;
      continue;
    }
    if (table) {
      const inc = freq / SR;
      p0 += inc;
      p1 += inc * detune;
      p2 += inc / detune;
      const c = tableAt(table, p0);
      const l = tableAt(table, p1);
      const r = tableAt(table, p2);
      left[i] += (c * 0.5 + l * 0.62 + r * 0.24) * env * gl;
      right[i] += (c * 0.5 + r * 0.62 + l * 0.24) * env * gr;
      continue;
    }
    p0 += freq / SR;
    const ph = TAU * p0;
    let v: number;
    if (wave === 'bell') {
      const d = Math.exp(-local * decay);
      v = (Math.sin(ph) + 0.42 * Math.sin(ph * 2.76) * Math.exp(-local * 6) + 0.18 * Math.sin(ph * 5.4) * Math.exp(-local * 11)) * d;
    } else if (wave === 'glass') {
      const d = Math.exp(-local * decay);
      v = (Math.sin(ph) + 0.28 * Math.sin(ph * 3) + 0.12 * Math.sin(ph * 4.2)) * d;
    } else {
      v = Math.sin(ph) * 0.82 + Math.sin(ph * 2.01) * harmonic + Math.sin(ph * 3.98) * harmonic * 0.22;
    }
    left[i] += v * env * gl;
    right[i] += v * env * gr;
  }
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One-pole low-pass coefficient for a cutoff in Hz. */
function onePole(cutoff: number): number {
  return 1 - Math.exp((-TAU * cutoff) / SR);
}

function renderNoise(layer: NoiseLayer, left: Float32Array, right: Float32Array): void {
  const from = Math.max(0, Math.floor(layer.start * SR));
  const to = Math.min(left.length, Math.ceil((layer.start + layer.duration) * SR));
  const rnd = mulberry32(layer.seed * 7919 + 17);
  const [gl, gr] = panGains(layer.pan);
  const color = layer.color ?? 'air';
  const lpA = onePole(color === 'thud' ? 140 : color === 'click' ? 9000 : 7000);
  const hpA = onePole(color === 'thud' ? 30 : color === 'click' ? 1800 : 2600);
  let lp = 0;
  let hpLow = 0;
  for (let i = from; i < to; i++) {
    const local = i / SR - layer.start;
    const env = envelope(local, layer.duration, layer.attack, layer.release) * layer.gain;
    const x = rnd() * 2 - 1;
    lp += (x - lp) * lpA;
    hpLow += (lp - hpLow) * hpA;
    const band = lp - hpLow;
    const v = (color === 'thud' ? lp * 3.2 : band * 2.4) * env;
    left[i] += v * gl;
    right[i] += v * gr;
  }
}

/* ----------------------------------------------------------------- effects */

class Comb {
  private buf: Float32Array;
  private idx = 0;
  private store = 0;
  constructor(size: number, private feedback: number, private damp: number) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const y = this.buf[this.idx];
    this.store = y * (1 - this.damp) + this.store * this.damp;
    this.buf[this.idx] = x + this.store * this.feedback;
    this.idx = (this.idx + 1) % this.buf.length;
    return y;
  }
}

class AllPass {
  private buf: Float32Array;
  private idx = 0;
  constructor(size: number, private g = 0.5) {
    this.buf = new Float32Array(size);
  }
  process(x: number): number {
    const b = this.buf[this.idx];
    const y = -x + b;
    this.buf[this.idx] = x + b * this.g;
    this.idx = (this.idx + 1) % this.buf.length;
    return y;
  }
}

const COMB_TUNING = [1116, 1188, 1277, 1356];
const ALLPASS_TUNING = [556, 441];
const STEREO_SPREAD = 23;

/** Schroeder reverb: 4 parallel damped combs into 2 series all-passes, per channel. */
function applyReverb(buf: StereoBuffer, wet: number, room: number): void {
  if (wet <= 0) return;
  const feedback = 0.7 + 0.26 * Math.min(1, Math.max(0, room));
  const damp = 0.28;
  const chans = [0, STEREO_SPREAD].map((spread) => ({
    combs: COMB_TUNING.map((n) => new Comb(n + spread, feedback, damp)),
    alls: ALLPASS_TUNING.map((n) => new AllPass(n + spread)),
  }));
  const { left, right } = buf;
  const scale = 0.11 * wet;
  for (let i = 0; i < left.length; i++) {
    const input = (left[i] + right[i]) * 0.5;
    for (let c = 0; c < 2; c++) {
      const ch = chans[c];
      let acc = 0;
      for (const comb of ch.combs) acc += comb.process(input);
      for (const ap of ch.alls) acc = ap.process(acc);
      if (c === 0) left[i] += acc * scale;
      else right[i] += acc * scale;
    }
  }
}

/** Gentle stereo chorus: one modulated delay per channel, LFOs 90° apart. */
function applyChorus(buf: StereoBuffer, wet: number, rateHz = 0.4, baseMs = 18, depthMs = 3.2): void {
  if (wet <= 0) return;
  const size = 4096;
  const lines = [new Float32Array(size), new Float32Array(size)];
  const chans = [buf.left, buf.right];
  const base = (baseMs / 1000) * SR;
  const depth = (depthMs / 1000) * SR;
  for (let i = 0; i < buf.left.length; i++) {
    const t = i / SR;
    for (let c = 0; c < 2; c++) {
      const line = lines[c];
      const data = chans[c];
      const w = i % size;
      line[w] = data[i];
      const delay = base + depth * Math.sin(TAU * rateHz * t + c * (Math.PI / 2));
      const pos = w - delay;
      const p = pos < 0 ? pos + size : pos;
      const i0 = Math.floor(p);
      const frac = p - i0;
      const a = line[i0 % size];
      const b = line[(i0 + 1) % size];
      data[i] += (a + (b - a) * frac) * wet;
    }
  }
}

function normalise(buf: StereoBuffer, peak: number): void {
  let max = 0;
  for (let i = 0; i < buf.left.length; i++) {
    max = Math.max(max, Math.abs(buf.left[i]), Math.abs(buf.right[i]));
  }
  if (max <= 0) return;
  const k = peak / max;
  for (let i = 0; i < buf.left.length; i++) {
    buf.left[i] *= k;
    buf.right[i] *= k;
  }
}

/* -------------------------------------------------------------- rendering */

function reverbTail(fx: CueFx | undefined): number {
  if (!fx?.reverb) return 0.05;
  return 0.35 + 1.1 * (fx.room ?? 0.4);
}

function renderCue(cue: Cue): StereoBuffer {
  const length = Math.max(1, Math.ceil((cue.duration + reverbTail(cue.fx)) * SR));
  const buf: StereoBuffer = { left: new Float32Array(length), right: new Float32Array(length), sampleRate: SR };
  for (const tone of cue.tones) renderTone(tone, buf.left, buf.right);
  for (const noise of cue.noise ?? []) renderNoise(noise, buf.left, buf.right);
  applyChorus(buf, cue.fx?.chorus ?? 0);
  applyReverb(buf, cue.fx?.reverb ?? 0, cue.fx?.room ?? 0.4);
  normalise(buf, cue.peak ?? 0.72);
  // A few ms of fade on the very end so a truncated reverb tail cannot click.
  const fade = Math.min(length, Math.floor(0.03 * SR));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    buf.left[length - 1 - i] *= g;
    buf.right[length - 1 - i] *= g;
  }
  return buf;
}

/**
 * The looping bed. Every partial and LFO completes a whole number of cycles in
 * AERO_AMBIENT_LOOP_SECONDS, nothing glides, nothing has an envelope, and the
 * loop is cut from AFTER a pre-roll, so the reverb tail and chorus state that
 * wrap across the seam are already in the buffer.
 */
export function renderAmbientBed(): StereoBuffer {
  const D = AERO_AMBIENT_LOOP_SECONDS;
  const N = D * SR;
  const PRE = 4 * SR;
  const total = PRE + N;
  const left = new Float32Array(total);
  const right = new Float32Array(total);
  const table = padWave();
  // Whole-cycle check: f * D must be an integer, so f is a multiple of 1/D Hz.
  const q = (f: number) => Math.round(f * D) / D;

  // Pad: an open D major 9 voicing, each voice a detuned pair breathing on its
  // own slow LFO (0.1 / 0.2 / 0.3 Hz — one, two, three cycles per loop).
  const voices = [
    { f: 146.8, g: 0.2, pan: -0.15, lfo: 0.1, ph: 0.0 },
    { f: 220.0, g: 0.16, pan: 0.2, lfo: 0.2, ph: 1.3 },
    { f: 329.6, g: 0.11, pan: -0.45, lfo: 0.1, ph: 2.4 },
    { f: 370.0, g: 0.1, pan: 0.4, lfo: 0.3, ph: 0.7 },
    { f: 440.0, g: 0.075, pan: -0.3, lfo: 0.2, ph: 3.6 },
    { f: 554.4, g: 0.06, pan: 0.55, lfo: 0.1, ph: 4.4 },
  ].map((v) => ({ ...v, f: q(v.f), beat: q(v.f + 0.2) }));
  for (const v of voices) {
    const [gl, gr] = panGains(v.pan);
    for (let i = 0; i < total; i++) {
      const t = (i - PRE) / SR;
      const amp = v.g * (0.62 + 0.38 * Math.sin(TAU * v.lfo * t + v.ph));
      const a = tableAt(table, v.f * t);
      const b = tableAt(table, v.beat * t + 0.37);
      left[i] += (a * 0.62 + b * 0.38) * amp * gl;
      right[i] += (a * 0.38 + b * 0.62) * amp * gr;
    }
  }

  // Water: a periodic noise buffer (repeats exactly every loop) through a soft
  // low-pass, breathing at 0.1 Hz.
  const rnd = mulberry32(31);
  const periodic = new Float32Array(N);
  for (let i = 0; i < N; i++) periodic[i] = rnd() * 2 - 1;
  const lpA = onePole(620);
  const airA = onePole(5200);
  let lpL = 0;
  let lpR = 0;
  let air = 0;
  for (let i = 0; i < total; i++) {
    const t = (i - PRE) / SR;
    const k = ((i - PRE) % N + N) % N;
    const x = periodic[k];
    const y = periodic[(k + 7919) % N];
    lpL += (x - lpL) * lpA;
    lpR += (y - lpR) * lpA;
    air += (x - air) * airA;
    const swell = 0.055 * (0.7 + 0.3 * Math.sin(TAU * 0.1 * t + 0.9));
    left[i] += lpL * swell * 2.2 + (x - air) * 0.004;
    right[i] += lpR * swell * 2.2 + (y - air) * 0.004;
  }

  // Droplets: soft glassy plinks at fixed places in the loop (and one loop
  // earlier, so tails that cross the seam are present at the start).
  const drops = [
    { at: 1.3, f: 1318.5, pan: -0.5, g: 0.05 },
    { at: 3.9, f: 1760.0, pan: 0.45, g: 0.035 },
    { at: 6.2, f: 1480.0, pan: -0.2, g: 0.042 },
    { at: 8.7, f: 2217.5, pan: 0.6, g: 0.03 },
  ];
  for (const d of drops) {
    for (const offset of [-D, 0]) {
      const start = d.at + offset;
      const layer: ToneLayer = {
        start: start + PRE / SR,
        duration: 2.2,
        freq: q(d.f),
        gain: d.g,
        attack: 0.004,
        release: 0.5,
        wave: 'glass',
        decay: 2.6,
        pan: d.pan,
      };
      renderTone(layer, left, right);
    }
  }

  const buf: StereoBuffer = { left, right, sampleRate: SR };
  applyChorus(buf, 0.35, 0.2, 16, 2.4);
  applyReverb(buf, 0.75, 0.8);
  const out: StereoBuffer = { left: left.slice(PRE), right: right.slice(PRE), sampleRate: SR };
  normalise(out, 0.5);
  return out;
}

/* ------------------------------------------------------------------- WAV */

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function encodeBase64(bytes: Uint8Array): string {
  if (typeof btoa === 'function') {
    let bin = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk) as unknown as number[]);
    }
    return btoa(bin);
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triplet = (a << 16) | (b << 8) | c;
    out += BASE64[(triplet >> 18) & 63];
    out += BASE64[(triplet >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(triplet >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64[triplet & 63] : '=';
  }
  return out;
}

export function stereoWavDataUrl(buf: StereoBuffer): string {
  const frames = buf.left.length;
  const byteLength = 44 + frames * 4;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);
  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, buf.sampleRate, true);
  view.setUint32(28, buf.sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, frames * 4, true);
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, buf.left[i]));
    const r = Math.max(-1, Math.min(1, buf.right[i]));
    view.setInt16(44 + i * 4, Math.round(l * 32767), true);
    view.setInt16(46 + i * 4, Math.round(r * 32767), true);
  }
  return `data:audio/wav;base64,${encodeBase64(new Uint8Array(buffer))}`;
}

/* -------------------------------------------------------------------- cues */

const UI_FX: CueFx = { reverb: 0.16, room: 0.3 };
const SYSTEM_FX: CueFx = { reverb: 0.42, room: 0.72, chorus: 0.28 };

/** Four-note pad chord helper for the startup swell. */
function padChord(start: number, duration: number, freqs: number[], gain: number, attack: number, release: number): ToneLayer[] {
  return freqs.map((freq, i) => ({
    start,
    duration,
    freq,
    gain: gain * (i === 0 ? 1.1 : 1 - i * 0.12),
    attack,
    release,
    wave: 'pad' as const,
    detune: 9,
    pan: (i % 2 === 0 ? -1 : 1) * (0.12 + i * 0.1),
  }));
}

const CUES: Record<Exclude<AeroCueId, 'ambient'>, Cue> = {
  // ~3.5 s: four rising pad chords that swell into one another, then a
  // sparkle run over the last chord.
  startup: {
    duration: 3.1,
    tones: [
      ...padChord(0.0, 1.0, [110.0, 164.8, 220.0, 277.2], 0.13, 0.35, 0.5),
      ...padChord(0.5, 1.0, [123.5, 185.0, 246.9, 311.1], 0.13, 0.35, 0.5),
      ...padChord(1.0, 1.0, [138.6, 207.7, 277.2, 329.6], 0.13, 0.35, 0.55),
      ...padChord(1.5, 1.6, [164.8, 246.9, 329.6, 415.3, 493.9], 0.14, 0.4, 1.0),
      { start: 0.0, duration: 3.0, freq: 82.4, gain: 0.07, attack: 1.2, release: 1.2, wave: 'soft', harmonic: 0.05 },
      { start: 1.62, duration: 1.4, freq: 1318.5, gain: 0.05, attack: 0.004, release: 0.8, wave: 'bell', decay: 2.4, pan: -0.5 },
      { start: 1.74, duration: 1.3, freq: 1661.2, gain: 0.045, attack: 0.004, release: 0.8, wave: 'bell', decay: 2.4, pan: -0.15 },
      { start: 1.86, duration: 1.2, freq: 1975.5, gain: 0.04, attack: 0.004, release: 0.8, wave: 'bell', decay: 2.4, pan: 0.2 },
      { start: 1.98, duration: 1.1, freq: 2637.0, gain: 0.034, attack: 0.004, release: 0.8, wave: 'bell', decay: 2.6, pan: 0.55 },
      { start: 2.16, duration: 0.9, freq: 3322.4, gain: 0.022, attack: 0.004, release: 0.6, wave: 'glass', decay: 3.2, pan: 0.3 },
    ],
    noise: [{ start: 1.3, duration: 1.6, gain: 0.03, attack: 0.5, release: 0.9, seed: 7, color: 'air' }],
    fx: { reverb: 0.55, room: 0.85, chorus: 0.4 },
    peak: 0.8,
  },
  shutdown: {
    duration: 1.5,
    tones: [
      ...padChord(0.0, 0.9, [329.6, 415.3, 493.9], 0.12, 0.08, 0.5),
      ...padChord(0.45, 1.05, [246.9, 311.1, 370.0], 0.12, 0.2, 0.7),
      { start: 0.5, duration: 1.0, freq: 123.5, gain: 0.08, attack: 0.2, release: 0.7, wave: 'soft', harmonic: 0.06 },
    ],
    noise: [{ start: 0.0, duration: 0.6, gain: 0.02, attack: 0.05, release: 0.4, seed: 11 }],
    fx: SYSTEM_FX,
  },
  restart: {
    duration: 0.9,
    tones: [
      { start: 0.0, duration: 0.3, freq: 659.3, gain: 0.09, release: 0.16, wave: 'bell', decay: 4 },
      { start: 0.22, duration: 0.3, freq: 493.9, gain: 0.09, release: 0.16, wave: 'bell', decay: 4 },
      { start: 0.44, duration: 0.45, freq: 987.8, gain: 0.08, release: 0.3, wave: 'bell', decay: 3 },
    ],
    fx: SYSTEM_FX,
  },
  sleep: {
    duration: 0.9,
    tones: [
      { start: 0.0, duration: 0.4, freq: 784.0, endFreq: 659.3, gain: 0.075, release: 0.2 },
      { start: 0.2, duration: 0.45, freq: 392.0, endFreq: 329.6, gain: 0.08, release: 0.3 },
      { start: 0.42, duration: 0.45, freq: 196.0, gain: 0.06, release: 0.3, wave: 'pad' },
    ],
    fx: SYSTEM_FX,
  },
  wake: {
    duration: 0.8,
    tones: [
      { start: 0.0, duration: 0.3, freq: 392.0, gain: 0.08, release: 0.14, wave: 'bell' },
      { start: 0.14, duration: 0.34, freq: 587.3, gain: 0.085, release: 0.18, wave: 'bell' },
      { start: 0.3, duration: 0.45, freq: 1174.7, gain: 0.05, release: 0.3, wave: 'glass', decay: 5 },
    ],
    fx: SYSTEM_FX,
  },
  notify: {
    duration: 0.45,
    tones: [
      { start: 0.0, duration: 0.24, freq: 1046.5, gain: 0.11, release: 0.14, wave: 'bell', decay: 6 },
      { start: 0.12, duration: 0.3, freq: 1396.9, gain: 0.09, release: 0.2, wave: 'bell', decay: 5 },
    ],
    fx: UI_FX,
  },
  // Notification balloon: a tiny bubble "pop" that lifts into two soft bells.
  balloon: {
    duration: 0.62,
    tones: [
      { start: 0.0, duration: 0.05, freq: 900, endFreq: 1800, gain: 0.06, attack: 0.003, release: 0.03, harmonic: 0.02 },
      { start: 0.05, duration: 0.4, freq: 1318.5, gain: 0.1, attack: 0.004, release: 0.25, wave: 'bell', decay: 5, pan: -0.2 },
      { start: 0.15, duration: 0.45, freq: 1975.5, gain: 0.07, attack: 0.004, release: 0.3, wave: 'bell', decay: 5, pan: 0.25 },
    ],
    fx: { reverb: 0.26, room: 0.45 },
  },
  info: {
    duration: 0.4,
    tones: [
      { start: 0.0, duration: 0.24, freq: 784.0, gain: 0.1, release: 0.14, wave: 'bell', decay: 5 },
      { start: 0.08, duration: 0.24, freq: 1568.0, gain: 0.045, release: 0.16, wave: 'glass' },
    ],
    fx: UI_FX,
  },
  warning: {
    duration: 0.6,
    tones: [
      { start: 0.0, duration: 0.22, freq: 523.3, gain: 0.12, release: 0.12 },
      { start: 0.24, duration: 0.28, freq: 622.3, gain: 0.12, release: 0.16 },
      { start: 0.02, duration: 0.5, freq: 1046.5, gain: 0.035, release: 0.22, harmonic: 0.08 },
    ],
    fx: UI_FX,
  },
  error: {
    duration: 0.6,
    tones: [
      { start: 0.0, duration: 0.24, freq: 392.0, gain: 0.14, release: 0.14 },
      { start: 0.22, duration: 0.3, freq: 311.1, gain: 0.13, release: 0.18 },
      { start: 0.08, duration: 0.34, freq: 740.0, gain: 0.04, release: 0.2 },
    ],
    fx: UI_FX,
  },
  // Critical stop: low and serious — a dark minor-second cluster over a thud.
  criticalStop: {
    duration: 0.95,
    tones: [
      { start: 0.0, duration: 0.85, freq: 220.0, gain: 0.12, attack: 0.008, release: 0.5, harmonic: 0.3 },
      { start: 0.0, duration: 0.85, freq: 233.1, gain: 0.07, attack: 0.008, release: 0.5, harmonic: 0.24 },
      { start: 0.0, duration: 0.7, freq: 110.0, gain: 0.12, attack: 0.006, release: 0.45, harmonic: 0.12 },
      { start: 0.18, duration: 0.7, freq: 164.8, gain: 0.08, attack: 0.02, release: 0.45, wave: 'pad' },
    ],
    noise: [{ start: 0.0, duration: 0.22, gain: 0.08, attack: 0.002, release: 0.18, seed: 41, color: 'thud' }],
    fx: { reverb: 0.3, room: 0.55 },
  },
  confirm: {
    duration: 0.36,
    tones: [
      { start: 0.0, duration: 0.2, freq: 880.0, gain: 0.1, release: 0.12, wave: 'bell', decay: 7 },
      { start: 0.05, duration: 0.22, freq: 1174.7, gain: 0.08, release: 0.14, wave: 'bell', decay: 7 },
      { start: 0.1, duration: 0.2, freq: 1760.0, gain: 0.05, release: 0.14, wave: 'glass' },
    ],
    fx: UI_FX,
  },
  cancel: {
    duration: 0.3,
    tones: [
      { start: 0.0, duration: 0.18, freq: 622.3, endFreq: 523.3, gain: 0.075, release: 0.12 },
      { start: 0.05, duration: 0.16, freq: 1244.5, endFreq: 1046.5, gain: 0.034, release: 0.1, harmonic: 0.06 },
    ],
    fx: UI_FX,
  },
  dialog: {
    duration: 0.45,
    tones: [
      { start: 0.0, duration: 0.24, freq: 698.5, gain: 0.075, release: 0.14, wave: 'bell', decay: 6 },
      { start: 0.08, duration: 0.26, freq: 1046.5, gain: 0.062, release: 0.16, wave: 'bell', decay: 6 },
      { start: 0.18, duration: 0.2, freq: 1568.0, gain: 0.032, release: 0.12, wave: 'glass' },
    ],
    fx: UI_FX,
  },
  menu: {
    duration: 0.18,
    tones: [
      { start: 0.0, duration: 0.08, freq: 1174.7, gain: 0.055, release: 0.06, harmonic: 0.06 },
      { start: 0.05, duration: 0.1, freq: 1760.0, gain: 0.026, release: 0.06, harmonic: 0.04 },
    ],
    fx: { reverb: 0.1, room: 0.2 },
  },
  // Navigation click: a dry, short tick — a filtered noise transient plus a
  // little glassy body. Meant to sit under repeated use.
  navigate: {
    duration: 0.07,
    tones: [{ start: 0.0, duration: 0.05, freq: 2349.3, gain: 0.05, attack: 0.001, release: 0.04, wave: 'glass', decay: 40 }],
    noise: [{ start: 0.0, duration: 0.03, gain: 0.12, attack: 0.001, release: 0.025, seed: 5, color: 'click' }],
    fx: { reverb: 0.06, room: 0.15 },
    peak: 0.5,
  },
  windowOpen: {
    duration: 0.32,
    tones: [
      { start: 0.0, duration: 0.16, freq: 523.3, endFreq: 587.3, gain: 0.065, release: 0.09 },
      { start: 0.08, duration: 0.2, freq: 1046.5, gain: 0.052, release: 0.12, wave: 'bell', decay: 8 },
    ],
    noise: [{ start: 0.0, duration: 0.16, gain: 0.016, attack: 0.01, release: 0.1, seed: 23 }],
    fx: UI_FX,
  },
  windowClose: {
    duration: 0.28,
    tones: [
      { start: 0.0, duration: 0.16, freq: 740.0, endFreq: 587.3, gain: 0.06, release: 0.1 },
      { start: 0.08, duration: 0.14, freq: 370.0, gain: 0.044, release: 0.1 },
    ],
    fx: UI_FX,
  },
  minimize: {
    duration: 0.24,
    tones: [{ start: 0.0, duration: 0.16, freq: 880.0, endFreq: 440.0, gain: 0.055, release: 0.1 }],
    noise: [{ start: 0.0, duration: 0.12, gain: 0.012, attack: 0.02, release: 0.08, seed: 13 }],
    fx: UI_FX,
  },
  achievement: {
    duration: 1.1,
    tones: [
      { start: 0.0, duration: 0.26, freq: 659.3, gain: 0.08, release: 0.14, wave: 'bell' },
      { start: 0.18, duration: 0.26, freq: 880.0, gain: 0.08, release: 0.14, wave: 'bell' },
      { start: 0.36, duration: 0.34, freq: 1318.5, gain: 0.075, release: 0.22, wave: 'bell' },
      { start: 0.56, duration: 0.5, freq: 1760.0, gain: 0.04, release: 0.3, wave: 'glass', decay: 3 },
      ...padChord(0.3, 0.8, [329.6, 440.0, 554.4], 0.05, 0.15, 0.4),
    ],
    noise: [{ start: 0.16, duration: 0.62, gain: 0.03, attack: 0.04, release: 0.3, seed: 29 }],
    fx: { reverb: 0.35, room: 0.6, chorus: 0.25 },
  },
  // Device-connect chime (companion arrivals): a low-then-high pair with a
  // soft pad underneath.
  deviceConnect: {
    duration: 0.75,
    tones: [
      { start: 0.0, duration: 0.42, freq: 784.0, gain: 0.09, attack: 0.004, release: 0.25, wave: 'bell', decay: 4.5, pan: -0.25 },
      { start: 0.16, duration: 0.55, freq: 1174.7, gain: 0.085, attack: 0.004, release: 0.35, wave: 'bell', decay: 3.8, pan: 0.25 },
      { start: 0.0, duration: 0.7, freq: 392.0, gain: 0.035, attack: 0.05, release: 0.4, wave: 'pad' },
    ],
    fx: { reverb: 0.3, room: 0.5 },
  },
};

/** Render one cue to a stereo buffer (exported for tests and audits). */
export function aeroCueBuffer(id: AeroCueId): StereoBuffer {
  return id === 'ambient' ? renderAmbientBed() : renderCue(CUES[id]);
}

// `lazySounds` caches each URL, so every cue is synthesised at most once.
function aeroCueUrl(id: AeroCueId): string {
  return stereoWavDataUrl(aeroCueBuffer(id));
}

let registered = false;

export function registerAeroProofSoundPack(): void {
  if (registered) return;
  registered = true;

  // Cue ids per sound; each WAV is synthesized on its first play (`lazySounds`).
  const manifest: SoundPackManifest = {
    id: AERO_PROOF_SOUND_PACK_ID,
    label: 'Secret Aero System',
    themeId: 'frutiger-aero',
    sounds: lazySounds<AeroCueId>({
      system: {
        startup: 'startup',
        shutdown: 'shutdown',
        restart: 'restart',
        sleep: 'sleep',
        wake: 'wake',
      },
      notification: {
        notify: 'balloon',
        info: 'info',
        warning: 'warning',
        error: 'criticalStop',
      },
      ui: {
        info: 'info',
        warning: 'warning',
        error: 'error',
        confirm: 'confirm',
        cancel: 'cancel',
        dialog: 'dialog',
        menu: 'menu',
        navigate: 'navigate',
        'window-open': 'windowOpen',
        'window-close': 'windowClose',
        minimize: 'minimize',
      },
      achievement: {
        milestone: 'achievement',
      },
      companion: {
        chirp: 'deviceConnect',
      },
      environment: {
        ambient: 'ambient',
        forest: 'ambient',
        ocean: 'ambient',
        sky: 'ambient',
        city: 'ambient',
        space: 'ambient',
        snow: 'ambient',
      },
    }, aeroCueUrl),
  };

  soundEngine.registerPack(manifest);
}
