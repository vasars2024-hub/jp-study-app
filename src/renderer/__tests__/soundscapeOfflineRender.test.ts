// @vitest-environment jsdom
/**
 * snd2 — the Soundscape, rendered offline and measured, because nobody had
 * listened. helpers/offlineAudio.ts implements the Web Audio subset the engine
 * uses; this drives the REAL engine through it (seeded randomness, fake timers
 * for its scheduler) and checks what a listener would catch first:
 *
 *  - no scene, no music style, and not even every slider at full clips the
 *    output;
 *  - every scene actually makes sound (a broken voice renders silence);
 *  - the looping noise beds have no click at the loop point;
 *  - ducking for media actually lowers the level.
 *
 * Mono, 16 kHz, a few seconds each — enough for peaks and seams, cheap enough
 * for the normal suite.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakePeriodicWave, peak, rms } from './helpers/offlineAudio';
import { SoundscapeEngine, type SoundscapeTarget } from '../soundscape/soundscapeEngine';
import {
  BUILT_IN_SCENES,
  MUSIC_STYLES,
  SOUND_LAYERS,
  applyMix,
  createRng,
  defaultSoundscapeState,
  sliderToGain,
  type MusicStyleId,
  type SoundscapeState,
} from '../soundscape/soundscapeModel';

const SR = 16000;

function targetOf(state: SoundscapeState, ducked = false): SoundscapeTarget {
  const layers: SoundscapeTarget['layers'] = {};
  for (const id of state.active) layers[id] = sliderToGain(state.levels[id]);
  return {
    master: sliderToGain(state.master),
    layers,
    music: state.music,
    musicGain: state.music === 'off' ? 0 : sliderToGain(state.musicVolume),
    ducked,
  };
}

interface Render {
  out: Float32Array;
  /** Pre-limiter signal at the master gain. */
  master: Float32Array;
  ctx: FakeAudioContext;
}

/** Play `target` for `seconds`, skipping the first `settle` seconds of fade-in. */
function render(target: SoundscapeTarget, seconds: number, settle = 0.8): Render {
  const engine = new SoundscapeEngine();
  engine.apply(target);
  engine.play();
  const ctx = FakeAudioContext.lastCreated as FakeAudioContext;
  const masterNode = (engine as unknown as { master: Parameters<FakeAudioContext['render']>[1] }).master;
  const chunk = 0.2;
  const outs: Float32Array[] = [];
  const masters: Float32Array[] = [];
  for (let t = 0; t < seconds + settle - 1e-9; t += chunk) {
    vi.advanceTimersByTime(chunk * 1000);
    const { out, probe } = ctx.render(chunk, masterNode);
    if (t >= settle - 1e-9) {
      outs.push(out);
      masters.push(probe);
    }
  }
  engine.pause(0.05);
  vi.advanceTimersByTime(500);
  const join = (parts: Float32Array[]): Float32Array => {
    const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
      all.set(p, at);
      at += p.length;
    }
    return all;
  };
  return { out: join(outs), master: join(masters), ctx };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  FakeAudioContext.defaultSampleRate = SR;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  (globalThis as unknown as { PeriodicWave: unknown }).PeriodicWave = FakePeriodicWave;
  // Seeded, so a failure reproduces exactly.
  const rng = createRng(20261008);
  vi.spyOn(Math, 'random').mockImplementation(rng);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const db = (x: number): string => `${(20 * Math.log10(Math.max(1e-9, x))).toFixed(1)} dBFS`;

describe('soundscape engine, rendered offline', () => {
  it.each(BUILT_IN_SCENES.map((scene) => [scene.id, scene] as const))('scene %s makes sound and does not clip', (_id, scene) => {
    const state = applyMix(defaultSoundscapeState(), scene.mix);
    const { out } = render(targetOf(state), 3);
    const p = peak(out);
    const level = rms(out);
    expect(p, `peak ${db(p)}`).toBeLessThan(1);
    expect(level, `rms ${db(level)}`).toBeGreaterThan(0.003);
    expect(Number.isFinite(level)).toBe(true);
  }, 60_000);

  it.each(MUSIC_STYLES.filter((s) => s.id !== 'off').map((s) => [s.id] as const))('music style %s alone does not clip', (style) => {
    const state: SoundscapeState = { ...defaultSoundscapeState(), active: [], music: style as MusicStyleId, musicVolume: 1, master: 1 };
    const { out } = render(targetOf(state), 4);
    const p = peak(out);
    expect(p, `peak ${db(p)}`).toBeLessThan(1);
    expect(rms(out)).toBeGreaterThan(0.001);
  }, 60_000);

  it('every layer and the loudest music at full stays under full scale (the limiter holds)', () => {
    const base = defaultSoundscapeState();
    const state: SoundscapeState = {
      ...base,
      master: 1,
      active: SOUND_LAYERS.map((l) => l.id),
      levels: Object.fromEntries(SOUND_LAYERS.map((l) => [l.id, 1])) as SoundscapeState['levels'],
      music: 'jazz-cafe',
      musicVolume: 1,
    };
    const { out, master } = render(targetOf(state), 3);
    // Driven far past full scale before the limiter…
    expect(peak(master)).toBeGreaterThan(1);
    // …and caught after it.
    expect(peak(out), `peak ${db(peak(out))}`).toBeLessThan(1);
  }, 120_000);

  it('ducking for media lowers the mix', () => {
    const scene = BUILT_IN_SCENES.find((s) => s.id === 'deep-focus') ?? BUILT_IN_SCENES[0];
    const state = applyMix(defaultSoundscapeState(), scene.mix);
    const open = rms(render(targetOf(state), 2).out);
    const ducked = rms(render(targetOf(state, true), 2, 2).out);
    expect(ducked).toBeLessThan(open * 0.6);
  }, 60_000);

  it('loops its noise beds without a click at the seam', () => {
    const state: SoundscapeState = {
      ...defaultSoundscapeState(),
      active: ['white', 'pink', 'brown'],
      levels: { ...defaultSoundscapeState().levels, white: 0.5, pink: 0.5, brown: 0.5 },
      music: 'off',
    };
    const { ctx } = render(targetOf(state), 0.4, 0.2);
    const beds = ctx.buffers.filter((b) => b.length === 4 * SR);
    expect(beds.length, 'white, pink and brown beds were built').toBeGreaterThanOrEqual(3);
    for (const bed of beds) {
      for (const data of bed.channels) {
        const steps: number[] = [];
        for (let i = 1; i < data.length; i += 1) steps.push(Math.abs(data[i] - data[i - 1]));
        steps.sort((a, b) => a - b);
        const typical = steps[Math.floor(steps.length * 0.999)];
        const seam = Math.abs(data[0] - data[data.length - 1]);
        expect(seam, `seam ${seam.toFixed(4)} vs p99.9 step ${typical.toFixed(4)}`).toBeLessThanOrEqual(typical);
        expect(peak(data), 'a noise bed itself must not clip').toBeLessThanOrEqual(1);
      }
    }
  }, 60_000);
});
