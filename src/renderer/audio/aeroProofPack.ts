/**
 * Secret Study OS Aero proof sounds (Phase 5 · M4).
 *
 * The project rules keep this phase inside src/, so the proof pack is generated
 * as tiny original WAV data URLs instead of loose files under public/. These are
 * intentionally representative chimes, not final mastered production assets.
 */
import { soundEngine } from './soundEngine';
import { lazySounds, type SoundPackManifest } from './soundPack';

export const AERO_PROOF_SOUND_PACK_ID = 'secret-aero-proof';

type CueId =
  | 'startup'
  | 'shutdown'
  | 'restart'
  | 'sleep'
  | 'wake'
  | 'notify'
  | 'info'
  | 'warning'
  | 'error'
  | 'confirm'
  | 'cancel'
  | 'dialog'
  | 'menu'
  | 'windowOpen'
  | 'windowClose'
  | 'minimize'
  | 'achievement'
  | 'companion'
  | 'ambient';

const SAMPLE_RATE = 22050;
const TAU = Math.PI * 2;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

interface ToneLayer {
  start: number;
  duration: number;
  freq: number;
  endFreq?: number;
  gain: number;
  attack?: number;
  release?: number;
  harmonic?: number;
}

interface NoiseLayer {
  start: number;
  duration: number;
  gain: number;
  attack?: number;
  release?: number;
  seed: number;
}

interface Cue {
  duration: number;
  tones: ToneLayer[];
  noise?: NoiseLayer[];
}

function envelope(t: number, duration: number, attack = 0.012, release = 0.06): number {
  if (t < 0 || t > duration) return 0;
  const a = Math.max(0.001, attack);
  const r = Math.max(0.001, release);
  if (t < a) return t / a;
  if (t > duration - r) return Math.max(0, (duration - t) / r);
  return 1;
}

function glideFreq(layer: ToneLayer, progress: number): number {
  if (!layer.endFreq || layer.endFreq <= 0 || layer.endFreq === layer.freq) return layer.freq;
  return layer.freq * (layer.endFreq / layer.freq) ** progress;
}

function deterministicNoise(sample: number, seed: number): number {
  const x = Math.sin((sample + 1) * (12.9898 + seed * 0.013)) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function toneSample(layer: ToneLayer, time: number): number {
  const local = time - layer.start;
  if (local < 0 || local > layer.duration) return 0;
  const progress = local / layer.duration;
  const freq = glideFreq(layer, progress);
  const env = envelope(local, layer.duration, layer.attack, layer.release);
  const phase = TAU * freq * local;
  const harmonic = layer.harmonic ?? 0.18;
  return (
    Math.sin(phase) * 0.82 +
    Math.sin(phase * 2.01) * harmonic +
    Math.sin(phase * 3.98) * harmonic * 0.22
  ) * env * layer.gain;
}

function noiseSample(layer: NoiseLayer, time: number, sampleIndex: number): number {
  const local = time - layer.start;
  if (local < 0 || local > layer.duration) return 0;
  const env = envelope(local, layer.duration, layer.attack, layer.release);
  const shimmer = Math.sin(TAU * 3800 * local) * 0.25 + Math.sin(TAU * 5200 * local) * 0.16;
  return (deterministicNoise(sampleIndex, layer.seed) * 0.22 + shimmer) * env * layer.gain;
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function encodeBase64(bytes: Uint8Array): string {
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

function wavDataUrl(cue: Cue): string {
  const sampleCount = Math.max(1, Math.floor(cue.duration * SAMPLE_RATE));
  const byteLength = 44 + sampleCount * 2;
  const buffer = new ArrayBuffer(byteLength);
  const view = new DataView(buffer);

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, byteLength - 8, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, sampleCount * 2, true);

  for (let i = 0; i < sampleCount; i++) {
    const time = i / SAMPLE_RATE;
    let value = 0;
    for (const tone of cue.tones) value += toneSample(tone, time);
    for (const noise of cue.noise ?? []) value += noiseSample(noise, time, i);
    const shaped = Math.tanh(value * 0.92);
    view.setInt16(44 + i * 2, Math.round(shaped * 32767), true);
  }

  return `data:audio/wav;base64,${encodeBase64(new Uint8Array(buffer))}`;
}

const CUES: Record<CueId, Cue> = {
  startup: {
    duration: 1.56,
    tones: [
      { start: 0.02, duration: 0.62, freq: 196, endFreq: 220, gain: 0.12, attack: 0.04, release: 0.3 },
      { start: 0.08, duration: 0.48, freq: 392, gain: 0.105, release: 0.24 },
      { start: 0.2, duration: 0.56, freq: 659, gain: 0.12, release: 0.28 },
      { start: 0.42, duration: 0.68, freq: 988, endFreq: 1047, gain: 0.11, release: 0.38 },
      { start: 0.72, duration: 0.62, freq: 1319, gain: 0.072, release: 0.36, harmonic: 0.1 },
      { start: 0.94, duration: 0.42, freq: 1760, gain: 0.043, release: 0.28, harmonic: 0.08 },
    ],
    noise: [{ start: 0.16, duration: 0.92, gain: 0.04, attack: 0.1, release: 0.46, seed: 7 }],
  },
  shutdown: {
    duration: 1.04,
    tones: [
      { start: 0.02, duration: 0.36, freq: 988, endFreq: 784, gain: 0.1, release: 0.18 },
      { start: 0.2, duration: 0.48, freq: 622, endFreq: 415, gain: 0.12, release: 0.26 },
      { start: 0.45, duration: 0.48, freq: 247, endFreq: 196, gain: 0.11, attack: 0.04, release: 0.32 },
      { start: 0.62, duration: 0.3, freq: 147, endFreq: 131, gain: 0.06, attack: 0.02, release: 0.22 },
    ],
    noise: [{ start: 0.0, duration: 0.52, gain: 0.026, attack: 0.02, release: 0.3, seed: 11 }],
  },
  restart: {
    duration: 0.78,
    tones: [
      { start: 0.0, duration: 0.22, freq: 659, endFreq: 523, gain: 0.09, release: 0.12 },
      { start: 0.24, duration: 0.22, freq: 392, endFreq: 440, gain: 0.09, release: 0.12 },
      { start: 0.43, duration: 0.28, freq: 784, endFreq: 988, gain: 0.08, release: 0.18 },
    ],
    noise: [{ start: 0.14, duration: 0.42, gain: 0.022, attack: 0.04, release: 0.2, seed: 19 }],
  },
  sleep: {
    duration: 0.72,
    tones: [
      { start: 0.0, duration: 0.34, freq: 784, endFreq: 523, gain: 0.075, release: 0.18 },
      { start: 0.18, duration: 0.38, freq: 392, endFreq: 294, gain: 0.08, release: 0.24 },
      { start: 0.38, duration: 0.28, freq: 196, endFreq: 147, gain: 0.06, release: 0.2 },
    ],
  },
  wake: {
    duration: 0.64,
    tones: [
      { start: 0.0, duration: 0.26, freq: 392, endFreq: 523, gain: 0.08, release: 0.14 },
      { start: 0.14, duration: 0.3, freq: 659, endFreq: 784, gain: 0.085, release: 0.16 },
      { start: 0.3, duration: 0.28, freq: 1175, gain: 0.045, release: 0.18, harmonic: 0.08 },
    ],
  },
  notify: {
    duration: 0.42,
    tones: [
      { start: 0.0, duration: 0.18, freq: 1047, gain: 0.12, release: 0.12 },
      { start: 0.13, duration: 0.22, freq: 1397, gain: 0.1, release: 0.16 },
    ],
  },
  info: {
    duration: 0.36,
    tones: [
      { start: 0.0, duration: 0.22, freq: 784, endFreq: 880, gain: 0.1, release: 0.14 },
      { start: 0.08, duration: 0.22, freq: 1568, gain: 0.045, release: 0.16, harmonic: 0.08 },
    ],
  },
  warning: {
    duration: 0.58,
    tones: [
      { start: 0.0, duration: 0.2, freq: 523, gain: 0.12, release: 0.12 },
      { start: 0.24, duration: 0.26, freq: 622, gain: 0.12, release: 0.16 },
      { start: 0.02, duration: 0.48, freq: 1047, gain: 0.035, release: 0.22, harmonic: 0.08 },
    ],
  },
  error: {
    duration: 0.62,
    tones: [
      { start: 0.0, duration: 0.24, freq: 392, endFreq: 370, gain: 0.14, release: 0.14 },
      { start: 0.22, duration: 0.3, freq: 311, endFreq: 277, gain: 0.13, release: 0.18 },
      { start: 0.08, duration: 0.34, freq: 740, endFreq: 622, gain: 0.045, release: 0.2 },
    ],
  },
  confirm: {
    duration: 0.34,
    tones: [
      { start: 0.0, duration: 0.2, freq: 880, gain: 0.1, release: 0.12 },
      { start: 0.05, duration: 0.22, freq: 1175, gain: 0.08, release: 0.14 },
      { start: 0.1, duration: 0.2, freq: 1760, gain: 0.052, release: 0.14, harmonic: 0.08 },
    ],
  },
  cancel: {
    duration: 0.28,
    tones: [
      { start: 0.0, duration: 0.18, freq: 622, endFreq: 523, gain: 0.075, release: 0.12 },
      { start: 0.05, duration: 0.16, freq: 1245, endFreq: 1047, gain: 0.034, release: 0.1, harmonic: 0.06 },
    ],
  },
  dialog: {
    duration: 0.42,
    tones: [
      { start: 0.0, duration: 0.22, freq: 698, gain: 0.075, release: 0.14 },
      { start: 0.08, duration: 0.24, freq: 1047, gain: 0.062, release: 0.16 },
      { start: 0.18, duration: 0.18, freq: 1568, gain: 0.032, release: 0.12, harmonic: 0.06 },
    ],
  },
  menu: {
    duration: 0.18,
    tones: [
      { start: 0.0, duration: 0.08, freq: 1175, gain: 0.055, release: 0.06, harmonic: 0.06 },
      { start: 0.05, duration: 0.1, freq: 1760, gain: 0.026, release: 0.06, harmonic: 0.04 },
    ],
  },
  windowOpen: {
    duration: 0.3,
    tones: [
      { start: 0.0, duration: 0.16, freq: 523, endFreq: 587, gain: 0.065, release: 0.09 },
      { start: 0.08, duration: 0.18, freq: 1047, gain: 0.052, release: 0.12 },
    ],
    noise: [{ start: 0.0, duration: 0.16, gain: 0.016, attack: 0.01, release: 0.1, seed: 23 }],
  },
  windowClose: {
    duration: 0.28,
    tones: [
      { start: 0.0, duration: 0.16, freq: 740, endFreq: 587, gain: 0.06, release: 0.1 },
      { start: 0.08, duration: 0.14, freq: 370, gain: 0.044, release: 0.1 },
    ],
  },
  minimize: {
    duration: 0.24,
    tones: [
      { start: 0.0, duration: 0.16, freq: 880, endFreq: 440, gain: 0.055, release: 0.1 },
    ],
  },
  achievement: {
    duration: 1.05,
    tones: [
      { start: 0.0, duration: 0.24, freq: 659, gain: 0.08, release: 0.14 },
      { start: 0.18, duration: 0.24, freq: 880, gain: 0.08, release: 0.14 },
      { start: 0.36, duration: 0.32, freq: 1319, gain: 0.075, release: 0.22 },
      { start: 0.56, duration: 0.36, freq: 1760, gain: 0.04, release: 0.24, harmonic: 0.08 },
    ],
    noise: [{ start: 0.16, duration: 0.62, gain: 0.032, attack: 0.04, release: 0.3, seed: 29 }],
  },
  companion: {
    duration: 0.38,
    tones: [
      { start: 0.0, duration: 0.14, freq: 988, gain: 0.056, release: 0.08 },
      { start: 0.11, duration: 0.16, freq: 1319, gain: 0.048, release: 0.1 },
      { start: 0.2, duration: 0.14, freq: 1568, gain: 0.034, release: 0.09, harmonic: 0.06 },
    ],
  },
  ambient: {
    duration: 1.5,
    tones: [
      { start: 0.0, duration: 1.5, freq: 196, gain: 0.018, attack: 0.18, release: 0.28, harmonic: 0.05 },
      { start: 0.18, duration: 1.16, freq: 392, endFreq: 415, gain: 0.012, attack: 0.24, release: 0.36, harmonic: 0.04 },
      { start: 0.42, duration: 0.86, freq: 784, endFreq: 740, gain: 0.008, attack: 0.16, release: 0.3, harmonic: 0.03 },
    ],
    noise: [{ start: 0.0, duration: 1.5, gain: 0.018, attack: 0.2, release: 0.34, seed: 31 }],
  },
};

let registered = false;

export function registerAeroProofSoundPack(): void {
  if (registered) return;
  registered = true;

  // Cue ids per sound; each WAV is synthesized on its first play (`lazySounds`).
  const manifest: SoundPackManifest = {
    id: AERO_PROOF_SOUND_PACK_ID,
    label: 'Secret Aero System',
    themeId: 'frutiger-aero',
    sounds: lazySounds<CueId>({
      system: {
        startup: 'startup',
        shutdown: 'shutdown',
        restart: 'restart',
        sleep: 'sleep',
        wake: 'wake',
      },
      notification: {
        notify: 'notify',
        info: 'info',
        warning: 'warning',
        error: 'error',
      },
      ui: {
        info: 'info',
        warning: 'warning',
        error: 'error',
        confirm: 'confirm',
        cancel: 'cancel',
        dialog: 'dialog',
        menu: 'menu',
        'window-open': 'windowOpen',
        'window-close': 'windowClose',
        minimize: 'minimize',
      },
      achievement: {
        milestone: 'achievement',
      },
      companion: {
        chirp: 'companion',
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
    }, (id) => wavDataUrl(CUES[id])),
  };

  soundEngine.registerPack(manifest);
}
