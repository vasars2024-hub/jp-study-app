import { soundEngine } from './soundEngine';
import { lazySounds, type SoundPackManifest } from './soundPack';

export const WIRED_ARCHIVE_SOUND_PACK_ID = 'wired-archive-generated';

type CueName =
  | 'startup'
  | 'shutdown'
  | 'restart'
  | 'sleep'
  | 'wake'
  | 'window-open'
  | 'window-close'
  | 'minimize'
  | 'menu'
  | 'dialog'
  | 'confirm'
  | 'cancel'
  | 'notify'
  | 'info'
  | 'warning'
  | 'error'
  | 'ambient'
  | 'route'
  | 'dock'
  | 'decrypt'
  | 'sync-ok'
  | 'sync-fail'
  | 'db-blip'
  | 'tape-seek'
  | 'switch-clack';

interface Tone {
  start: number;
  duration: number;
  freq: number;
  endFreq?: number;
  gain: number;
}

interface Noise {
  start: number;
  duration: number;
  gain: number;
  seed: number;
}

interface Cue {
  duration: number;
  tones: Tone[];
  noise?: Noise[];
}

const SAMPLE_RATE = 16000;
const TAU = Math.PI * 2;
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function env(local: number, duration: number): number {
  if (local < 0 || local > duration) return 0;
  const attack = Math.min(0.018, duration * 0.24);
  const release = Math.min(0.12, duration * 0.42);
  if (local < attack) return local / attack;
  if (local > duration - release) return Math.max(0, (duration - local) / release);
  return 1;
}

function noiseAt(sample: number, seed: number): number {
  const x = Math.sin((sample + 3) * (17.173 + seed * 0.021)) * 43891.17;
  return (x - Math.floor(x)) * 2 - 1;
}

function ascii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
}

function b64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const n = (a << 16) | (b << 8) | c;
    out += BASE64[(n >> 18) & 63];
    out += BASE64[(n >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64[(n >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64[n & 63] : '=';
  }
  return out;
}

function cueUrl(cue: Cue): string {
  const count = Math.max(1, Math.floor(cue.duration * SAMPLE_RATE));
  const bytes = 44 + count * 2;
  const buffer = new ArrayBuffer(bytes);
  const view = new DataView(buffer);
  ascii(view, 0, 'RIFF');
  view.setUint32(4, bytes - 8, true);
  ascii(view, 8, 'WAVE');
  ascii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, SAMPLE_RATE, true);
  view.setUint32(28, SAMPLE_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  ascii(view, 36, 'data');
  view.setUint32(40, count * 2, true);

  for (let i = 0; i < count; i++) {
    const time = i / SAMPLE_RATE;
    let value = 0;
    for (const tone of cue.tones) {
      const local = time - tone.start;
      if (local < 0 || local > tone.duration) continue;
      const p = local / tone.duration;
      const freq = tone.endFreq ? tone.freq * (tone.endFreq / tone.freq) ** p : tone.freq;
      value += Math.sin(TAU * freq * local) * env(local, tone.duration) * tone.gain;
      value += Math.sin(TAU * freq * 2.01 * local) * env(local, tone.duration) * tone.gain * 0.12;
    }
    for (const noise of cue.noise ?? []) {
      const local = time - noise.start;
      if (local < 0 || local > noise.duration) continue;
      value += noiseAt(i, noise.seed) * env(local, noise.duration) * noise.gain;
    }
    view.setInt16(44 + i * 2, Math.round(Math.tanh(value) * 32767), true);
  }

  return `data:audio/wav;base64,${b64(new Uint8Array(buffer))}`;
}

const CUES: Record<CueName, Cue> = {
  startup: {
    duration: 1.7,
    tones: [
      { start: 0.08, duration: 0.92, freq: 55, endFreq: 68, gain: 0.12 },
      { start: 0.32, duration: 0.18, freq: 880, gain: 0.07 },
      { start: 0.58, duration: 0.16, freq: 1175, gain: 0.06 },
      { start: 0.9, duration: 0.42, freq: 440, endFreq: 660, gain: 0.08 },
    ],
    noise: [{ start: 0, duration: 1.55, gain: 0.045, seed: 9 }],
  },
  shutdown: {
    duration: 0.9,
    tones: [
      { start: 0.02, duration: 0.46, freq: 660, endFreq: 220, gain: 0.09 },
      { start: 0.35, duration: 0.42, freq: 110, endFreq: 64, gain: 0.1 },
    ],
    noise: [{ start: 0.14, duration: 0.5, gain: 0.035, seed: 13 }],
  },
  restart: { duration: 0.55, tones: [{ start: 0.02, duration: 0.2, freq: 392, gain: 0.08 }, { start: 0.26, duration: 0.22, freq: 784, gain: 0.07 }], noise: [{ start: 0.08, duration: 0.32, gain: 0.03, seed: 3 }] },
  sleep: { duration: 0.62, tones: [{ start: 0.02, duration: 0.46, freq: 440, endFreq: 147, gain: 0.08 }], noise: [{ start: 0.05, duration: 0.32, gain: 0.025, seed: 5 }] },
  wake: { duration: 0.52, tones: [{ start: 0.02, duration: 0.32, freq: 196, endFreq: 784, gain: 0.08 }, { start: 0.24, duration: 0.16, freq: 1320, gain: 0.04 }] },
  'window-open': { duration: 0.32, tones: [{ start: 0.02, duration: 0.12, freq: 620, gain: 0.05 }, { start: 0.14, duration: 0.12, freq: 930, gain: 0.04 }], noise: [{ start: 0, duration: 0.16, gain: 0.025, seed: 21 }] },
  'window-close': { duration: 0.28, tones: [{ start: 0.02, duration: 0.16, freq: 520, endFreq: 210, gain: 0.05 }], noise: [{ start: 0.08, duration: 0.12, gain: 0.025, seed: 22 }] },
  minimize: { duration: 0.24, tones: [{ start: 0.02, duration: 0.14, freq: 760, endFreq: 380, gain: 0.045 }] },
  menu: { duration: 0.12, tones: [{ start: 0.01, duration: 0.06, freq: 1300, gain: 0.035 }] },
  dialog: { duration: 0.2, tones: [{ start: 0.01, duration: 0.1, freq: 880, gain: 0.045 }], noise: [{ start: 0.03, duration: 0.08, gain: 0.016, seed: 6 }] },
  confirm: { duration: 0.18, tones: [{ start: 0.01, duration: 0.08, freq: 720, gain: 0.045 }, { start: 0.08, duration: 0.08, freq: 1080, gain: 0.035 }] },
  cancel: { duration: 0.18, tones: [{ start: 0.01, duration: 0.1, freq: 420, gain: 0.04 }] },
  notify: { duration: 0.26, tones: [{ start: 0.02, duration: 0.1, freq: 1040, gain: 0.055 }, { start: 0.14, duration: 0.08, freq: 1560, gain: 0.035 }] },
  info: { duration: 0.22, tones: [{ start: 0.02, duration: 0.13, freq: 960, gain: 0.045 }] },
  warning: { duration: 0.42, tones: [{ start: 0.02, duration: 0.16, freq: 740, gain: 0.07 }, { start: 0.22, duration: 0.14, freq: 740, gain: 0.06 }] },
  error: { duration: 0.58, tones: [{ start: 0.02, duration: 0.2, freq: 180, gain: 0.11 }, { start: 0.26, duration: 0.2, freq: 145, gain: 0.11 }], noise: [{ start: 0.03, duration: 0.42, gain: 0.055, seed: 31 }] },
  ambient: { duration: 2.4, tones: [{ start: 0, duration: 2.4, freq: 57, gain: 0.04 }, { start: 0.4, duration: 1.6, freq: 118, gain: 0.025 }], noise: [{ start: 0, duration: 2.4, gain: 0.03, seed: 41 }] },
  // Bespoke §8 interaction cues — quieter than system cues (gain ≤ 0.06).
  route: { duration: 0.22, tones: [{ start: 0.01, duration: 0.09, freq: 740, endFreq: 980, gain: 0.05 }, { start: 0.11, duration: 0.09, freq: 940, endFreq: 1180, gain: 0.045 }] },
  dock: { duration: 0.16, tones: [{ start: 0.01, duration: 0.08, freq: 60, gain: 0.06 }, { start: 0.07, duration: 0.04, freq: 1000, gain: 0.04 }] },
  decrypt: { duration: 0.2, tones: [{ start: 0.02, duration: 0.16, freq: 520, endFreq: 1560, gain: 0.045 }], noise: [{ start: 0, duration: 0.12, gain: 0.04, seed: 51 }] },
  'sync-ok': { duration: 0.16, tones: [{ start: 0.01, duration: 0.14, freq: 880, gain: 0.045 }, { start: 0.01, duration: 0.14, freq: 1320, gain: 0.035 }] },
  'sync-fail': { duration: 0.24, tones: [{ start: 0.01, duration: 0.08, freq: 196, gain: 0.055 }, { start: 0.13, duration: 0.08, freq: 196, gain: 0.055 }] },
  'db-blip': { duration: 0.14, tones: [{ start: 0.01, duration: 0.04, freq: 1500, gain: 0.045 }], noise: [{ start: 0.04, duration: 0.09, gain: 0.02, seed: 52 }] },
  'tape-seek': { duration: 0.24, tones: [{ start: 0.02, duration: 0.2, freq: 320, endFreq: 940, gain: 0.03 }], noise: [{ start: 0, duration: 0.22, gain: 0.035, seed: 53 }] },
  'switch-clack': { duration: 0.1, tones: [{ start: 0.005, duration: 0.025, freq: 2200, gain: 0.05 }, { start: 0.02, duration: 0.06, freq: 90, gain: 0.045 }] },
};

// Cue names per sound; each WAV is synthesized on its first play (`lazySounds`).
export const WIRED_ARCHIVE_SOUND_PACK: SoundPackManifest = {
  id: WIRED_ARCHIVE_SOUND_PACK_ID,
  label: 'WIRED ARCHIVE generated terminal cues',
  themeId: 'wired-archive',
  sounds: lazySounds<CueName>({
    system: {
      startup: 'startup',
      shutdown: 'shutdown',
      restart: 'restart',
      sleep: 'sleep',
      wake: 'wake',
    },
    ui: {
      'window-open': 'window-open',
      'window-close': 'window-close',
      minimize: 'minimize',
      menu: 'menu',
      dialog: 'dialog',
      confirm: 'confirm',
      cancel: 'cancel',
      route: 'route',
      dock: 'dock',
      decrypt: 'decrypt',
      'sync-fail': 'sync-fail',
      'db-blip': 'db-blip',
      'tape-seek': 'tape-seek',
      'switch-clack': 'switch-clack',
    },
    notification: {
      notify: 'notify',
      info: 'info',
      warning: 'warning',
      error: 'error',
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
    achievement: {
      milestone: 'confirm',
      'sync-ok': 'sync-ok',
    },
    companion: {
      chirp: 'info',
    },
  }, (cue) => cueUrl(CUES[cue])),
};

let registered = false;

export function registerWiredArchiveSoundPack(): void {
  if (registered) return;
  soundEngine.registerPack(WIRED_ARCHIVE_SOUND_PACK);
  registered = true;
}
