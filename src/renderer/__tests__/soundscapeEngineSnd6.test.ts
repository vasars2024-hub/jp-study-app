// @vitest-environment jsdom
/**
 * snd6 — the engine's new stages, rendered offline through the same fake Web
 * Audio graph as soundscapeOfflineRender.test.ts (helpers/offlineAudio.ts):
 *
 *  - per-layer tone really tilts the spectrum, and a fully brightened mix with
 *    every layer at full still does not clip (the limiter holds);
 *  - pan reaches the layer's StereoPanner (the fake renders mono, so where the
 *    sound sits is asserted on the node, not measured);
 *  - a scene change cross-fades: no dip through silence, no clip, and the
 *    outgoing voices are freed once the fade is over;
 *  - ducking for speech goes deeper than ducking for music.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakePeriodicWave, peak, rms } from './helpers/offlineAudio';
import { SoundscapeEngine, type SoundscapeTarget } from '../soundscape/soundscapeEngine';
import {
  BUILT_IN_SCENES,
  DUCK_GAIN,
  DUCK_SPEECH_GAIN,
  SOUND_LAYERS,
  applyMix,
  createRng,
  defaultSoundscapeState,
  sliderToGain,
  type LayerShape,
  type SoundLayerId,
  type SoundscapeState,
} from '../soundscape/soundscapeModel';

const SR = 16000;

function targetOf(state: SoundscapeState, extra: Partial<SoundscapeTarget> = {}): SoundscapeTarget {
  const layers: SoundscapeTarget['layers'] = {};
  for (const id of state.active) layers[id] = sliderToGain(state.levels[id]);
  return {
    master: sliderToGain(state.master),
    layers,
    music: state.music,
    musicGain: state.music === 'off' ? 0 : sliderToGain(state.musicVolume),
    ducked: false,
    shapes: state.shapes,
    ...extra,
  };
}

type Probe = Parameters<FakeAudioContext['render']>[1];

interface Session {
  engine: SoundscapeEngine;
  ctx: FakeAudioContext;
  /** Render `seconds`, returning the output (and the pre-limiter master). */
  run(seconds: number): { out: Float32Array; master: Float32Array };
  stop(): void;
}

function session(target: SoundscapeTarget): Session {
  const engine = new SoundscapeEngine();
  engine.apply(target);
  engine.play();
  const ctx = FakeAudioContext.lastCreated as FakeAudioContext;
  const master = (engine as unknown as { master: Probe }).master;
  const run = (seconds: number): { out: Float32Array; master: Float32Array } => {
    const outs: Float32Array[] = [];
    const masters: Float32Array[] = [];
    const chunk = 0.2;
    for (let t = 0; t < seconds - 1e-9; t += chunk) {
      vi.advanceTimersByTime(chunk * 1000);
      const r = ctx.render(chunk, master);
      outs.push(r.out);
      masters.push(r.probe);
    }
    const join = (parts: Float32Array[]): Float32Array => {
      const all = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
      let at = 0;
      for (const p of parts) {
        all.set(p, at);
        at += p.length;
      }
      return all;
    };
    return { out: join(outs), master: join(masters) };
  };
  return {
    engine,
    ctx,
    run,
    stop: () => {
      engine.pause(0.05);
      vi.advanceTimersByTime(500);
    },
  };
}

/** High-frequency share: RMS of the first difference over RMS of the signal. */
function brightness(samples: Float32Array): number {
  const diff = new Float32Array(samples.length - 1);
  for (let i = 1; i < samples.length; i += 1) diff[i - 1] = samples[i] - samples[i - 1];
  return rms(diff) / Math.max(1e-9, rms(samples));
}

function oneLayer(id: SoundLayerId, shape?: LayerShape): SoundscapeState {
  const base = defaultSoundscapeState();
  return {
    ...base,
    master: 0.8,
    active: [id],
    levels: { ...base.levels, [id]: 0.6 },
    music: 'off',
    shapes: shape ? { [id]: shape } : {},
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  FakeAudioContext.defaultSampleRate = SR;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  (globalThis as unknown as { PeriodicWave: unknown }).PeriodicWave = FakePeriodicWave;
  vi.spyOn(Math, 'random').mockImplementation(createRng(20261012));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('snd6 per-layer tone and pan', () => {
  it('tone tilts the layer: bright has more high end than neutral, dark less', () => {
    const measure = (shape?: LayerShape): number => {
      const s = session(targetOf(oneLayer('pink', shape)));
      s.run(0.8);
      const { out } = s.run(2);
      s.stop();
      return brightness(out);
    };
    const dark = measure({ tone: -1, pan: 0 });
    const neutral = measure();
    const bright = measure({ tone: 1, pan: 0 });
    expect(bright, `bright ${bright.toFixed(3)} vs neutral ${neutral.toFixed(3)}`).toBeGreaterThan(neutral * 1.15);
    expect(dark, `dark ${dark.toFixed(3)} vs neutral ${neutral.toFixed(3)}`).toBeLessThan(neutral * 0.87);
  }, 60_000);

  it('every layer at full and fully brightened still does not clip', () => {
    const base = defaultSoundscapeState();
    const ids = SOUND_LAYERS.map((l) => l.id);
    const state: SoundscapeState = {
      ...base,
      master: 1,
      active: ids,
      levels: Object.fromEntries(ids.map((id) => [id, 1])) as SoundscapeState['levels'],
      music: 'jazz-cafe',
      musicVolume: 1,
      shapes: Object.fromEntries(ids.map((id) => [id, { tone: 1, pan: 0 }])),
    };
    const s = session(targetOf(state));
    s.run(0.8);
    const { out, master } = s.run(2.4);
    s.stop();
    expect(peak(master)).toBeGreaterThan(1);
    expect(peak(out)).toBeLessThan(1);
  }, 120_000);

  it('pan reaches the layer\'s stereo panner, and moving it later updates the same node', () => {
    const state = oneLayer('rain', { tone: 0, pan: -0.6 });
    const s = session(targetOf(state));
    s.run(0.4);
    const entry = (s.engine as unknown as { layers: Map<SoundLayerId, { pan: { pan: { value: number } } }> }).layers.get('rain');
    expect(entry?.pan.pan.value).toBeCloseTo(-0.6, 5);
    s.engine.apply(targetOf({ ...state, shapes: { rain: { tone: 0, pan: 0.5 } } }));
    s.run(1);
    const same = (s.engine as unknown as { layers: Map<SoundLayerId, { pan: { pan: { value: number } } }> }).layers.get('rain');
    expect(same).toBe(entry);
    expect(same?.pan.pan.value).toBeCloseTo(0.5, 2);
    s.stop();
  }, 60_000);
});

describe('snd6 scene cross-fade', () => {
  const sceneState = (id: string): SoundscapeState => {
    const scene = BUILT_IN_SCENES.find((s) => s.id === id) ?? BUILT_IN_SCENES[0];
    return { ...applyMix(defaultSoundscapeState(), scene.mix), master: 0.8 };
  };

  it('fades one scene into the next without a dip or a clip, then frees what left', () => {
    // Storm (rain, thunder, wind) into forest morning (birds, stream, wind): two
    // layers leave, two arrive, wind stays.
    const s = session(targetOf(sceneState('storm')));
    s.run(1);
    const before = rms(s.run(1).out);
    const rainGain = (s.engine as unknown as { layers: Map<SoundLayerId, { level: { gain: { value: number } } }> }).layers.get('rain')?.level.gain.value ?? 0;
    s.engine.apply(targetOf(sceneState('forest-morning'), { crossfadeSec: 3 }));
    const first = s.run(1.6);
    // Half-way through, the outgoing rain is about half down and the birds about half up:
    // a straight-line cross-fade, not a switch.
    const leaving = [...(s.engine as unknown as { leaving: Set<{ level: { gain: { value: number } } }> }).leaving];
    const rainNow = Math.max(...leaving.map((v) => v.level.gain.value));
    expect(rainNow / rainGain).toBeGreaterThan(0.3);
    expect(rainNow / rainGain).toBeLessThan(0.7);
    const birds = (s.engine as unknown as { layers: Map<SoundLayerId, { level: { gain: { value: number } } }> }).layers.get('birds');
    const birdsTarget = sliderToGain(sceneState('forest-morning').levels.birds);
    expect((birds?.level.gain.value ?? 0) / birdsTarget).toBeGreaterThan(0.3);
    expect((birds?.level.gain.value ?? 0) / birdsTarget).toBeLessThan(0.7);
    const rest = s.run(1.4);
    const during = { out: new Float32Array(first.out.length + rest.out.length) };
    during.out.set(first.out, 0);
    during.out.set(rest.out, first.out.length);
    // Every quarter second of the fade keeps a real bed under it.
    const quarter = SR / 4;
    for (let at = 0; at + quarter <= during.out.length; at += quarter) {
      const level = rms(during.out.subarray(at, at + quarter));
      expect(level, `quarter at ${(at / SR).toFixed(2)} s`).toBeGreaterThan(before * 0.2);
    }
    expect(peak(during.out)).toBeLessThan(1);
    expect(s.engine.leavingCount()).toBeGreaterThan(0);
    s.run(0.6);
    expect(s.engine.leavingCount()).toBe(0);
    s.stop();
  }, 120_000);

  it('a cross-fade is one-shot: the next slider move glides as usual', () => {
    const s = session(targetOf(sceneState('storm')));
    s.run(0.6);
    s.engine.apply(targetOf(sceneState('forest-morning'), { crossfadeSec: 6 }));
    s.run(0.2);
    const next = sceneState('forest-morning');
    s.engine.apply(targetOf({ ...next, levels: { ...next.levels, birds: 0.9 } }));
    s.run(1);
    const birds = (s.engine as unknown as { layers: Map<SoundLayerId, { level: { gain: { value: number } } }> }).layers.get('birds');
    // A glide of RAMP (0.12 s) gets there inside a second; a 6 s line would not have.
    expect(birds?.level.gain.value).toBeCloseTo(sliderToGain(0.9), 1);
    s.stop();
  }, 60_000);
});

describe('snd6 ducking depth', () => {
  it('ducks deeper for speech than for music', () => {
    const scene = BUILT_IN_SCENES.find((x) => x.id === 'deep-focus') ?? BUILT_IN_SCENES[0];
    const state = applyMix(defaultSoundscapeState(), scene.mix);
    const level = (extra: Partial<SoundscapeTarget>): number => {
      const s = session(targetOf(state, extra));
      s.run(2.4);
      const { out } = s.run(1.6);
      s.stop();
      return rms(out);
    };
    const open = level({});
    const music = level({ ducked: true, duckGain: DUCK_GAIN });
    const speech = level({ ducked: true, duckGain: DUCK_SPEECH_GAIN });
    expect(music).toBeLessThan(open * 0.6);
    expect(speech).toBeLessThan(music * 0.8);
  }, 60_000);
});
