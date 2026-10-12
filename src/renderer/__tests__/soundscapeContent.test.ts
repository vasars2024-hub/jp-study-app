// @vitest-environment jsdom
/**
 * snd5 — the new generated content, rendered offline through the same Web
 * Audio stand-in as soundscapeOfflineRender.test.ts (helpers/offlineAudio.ts):
 *
 *  - each of the eight new layers alone, at full level, makes sound and does
 *    not clip; so does the koto band;
 *  - each new scene makes sound and does not clip;
 *  - every buffer any of them LOOPS has a click-free seam, and the beds never
 *    drop to digital silence mid-render;
 *  - the fade schedules: a slow fade-in starts quieter than it ends, and a
 *    scheduled fade-out reaches silence without stopping the engine.
 *
 * Plus the model and store halves: study-mode presets, per-scene volume memory
 * and the sleep-timer fade plan.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakePeriodicWave, peak, rms } from './helpers/offlineAudio';
import { SoundscapeEngine, type SoundscapeTarget } from '../soundscape/soundscapeEngine';
import {
  BUILT_IN_SCENES,
  DEFAULT_STUDY_MODE_PRESETS,
  FADE_SCHEDULES,
  MUSIC_STYLES,
  SOUND_LAYERS,
  SOUND_LAYER_GROUPS,
  applyMix,
  createRng,
  defaultSoundscapeState,
  fadeScheduleOf,
  normalizeSoundscapeState,
  normalizeStudyModePresets,
  sleepFadePlan,
  sliderToGain,
  type SoundLayerId,
  type SoundscapeState,
} from '../soundscape/soundscapeModel';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

const SR = 16000;
const NEW_LAYERS: SoundLayerId[] = ['umbrella', 'cicadas', 'carriage', 'konbini', 'cityNight', 'templeBell', 'furin', 'shishiOdoshi'];
const NEW_SCENES = ['temple-dawn', 'umbrella-walk', 'local-train', 'summer-afternoon', 'konbini-night', 'city-lights', 'zen-garden'];

function targetOf(state: SoundscapeState): SoundscapeTarget {
  const layers: SoundscapeTarget['layers'] = {};
  for (const id of state.active) layers[id] = sliderToGain(state.levels[id]);
  return {
    master: sliderToGain(state.master),
    layers,
    music: state.music,
    musicGain: state.music === 'off' ? 0 : sliderToGain(state.musicVolume),
    ducked: false,
  };
}

interface Looped {
  loop: boolean;
  buffer: { channels: Float32Array[]; length: number } | null;
}

let looped: Looped[] = [];
const realCreateSource = FakeAudioContext.prototype.createBufferSource;

function render(
  target: SoundscapeTarget,
  seconds: number,
  opts: { settle?: number; fadeIn?: number; before?: (engine: SoundscapeEngine) => void } = {},
): { out: Float32Array; windows: number[] } {
  const settle = opts.settle ?? 0.8;
  const engine = new SoundscapeEngine();
  engine.apply(target);
  engine.play(opts.fadeIn);
  opts.before?.(engine);
  const ctx = FakeAudioContext.lastCreated as FakeAudioContext;
  const chunk = 0.25;
  const outs: Float32Array[] = [];
  const windows: number[] = [];
  for (let t = 0; t < seconds + settle - 1e-9; t += chunk) {
    vi.advanceTimersByTime(chunk * 1000);
    const { out } = ctx.render(chunk);
    if (t >= settle - 1e-9) {
      outs.push(out);
      windows.push(rms(out));
    }
  }
  engine.pause(0.05);
  vi.advanceTimersByTime(800);
  const all = new Float32Array(outs.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of outs) {
    all.set(p, at);
    at += p.length;
  }
  return { out: all, windows };
}

function seamOk(data: Float32Array): { ok: boolean; seam: number; typical: number } {
  const steps: number[] = [];
  for (let i = 1; i < data.length; i += 1) steps.push(Math.abs(data[i] - data[i - 1]));
  steps.sort((a, b) => a - b);
  const typical = steps[Math.floor(steps.length * 0.999)] ?? 0;
  const seam = Math.abs(data[0] - data[data.length - 1]);
  return { ok: seam <= typical, seam, typical };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout'] });
  FakeAudioContext.defaultSampleRate = SR;
  (window as unknown as { AudioContext: unknown }).AudioContext = FakeAudioContext;
  (globalThis as unknown as { PeriodicWave: unknown }).PeriodicWave = FakePeriodicWave;
  vi.spyOn(Math, 'random').mockImplementation(createRng(20261009));
  looped = [];
  FakeAudioContext.prototype.createBufferSource = function createBufferSource(this: FakeAudioContext) {
    const source = realCreateSource.call(this);
    looped.push(source as unknown as Looped);
    return source;
  };
});

afterEach(() => {
  FakeAudioContext.prototype.createBufferSource = realCreateSource;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const full = (ids: SoundLayerId[]): SoundscapeState => ({
  ...defaultSoundscapeState(),
  master: 1,
  active: ids,
  levels: { ...defaultSoundscapeState().levels, ...Object.fromEntries(ids.map((id) => [id, 1])) },
  music: 'off',
});

describe('new layers, rendered offline', () => {
  it.each(NEW_LAYERS.map((id) => [id] as const))('%s alone at full makes sound, never clips, never drops out', (id) => {
    const { out, windows } = render(targetOf(full([id])), 4);
    expect(peak(out), `peak ${peak(out).toFixed(3)}`).toBeLessThan(1);
    expect(rms(out)).toBeGreaterThan(0.002);
    // A bed under every layer: no quarter-second of digital silence.
    expect(Math.min(...windows), 'a silent window').toBeGreaterThan(1e-5);
    for (const source of looped.filter((s) => s.loop && s.buffer)) {
      for (const data of source.buffer!.channels) {
        const seam = seamOk(data);
        expect(seam.ok, `${id}: seam ${seam.seam.toFixed(4)} vs p99.9 ${seam.typical.toFixed(4)}`).toBe(true);
      }
    }
  }, 60_000);

  it('every new layer at full together, with the koto band, stays under full scale', () => {
    const state = { ...full(NEW_LAYERS), music: 'koto-garden' as const, musicVolume: 1 };
    const { out } = render(targetOf(state), 3);
    expect(peak(out)).toBeLessThan(1);
  }, 120_000);

  it('the koto band alone makes sound and does not clip', () => {
    const state: SoundscapeState = { ...defaultSoundscapeState(), master: 1, active: [], music: 'koto-garden', musicVolume: 1 };
    const { out } = render(targetOf(state), 5);
    expect(peak(out)).toBeLessThan(1);
    expect(rms(out)).toBeGreaterThan(0.001);
  }, 60_000);
});

describe('new scenes, rendered offline', () => {
  it.each(NEW_SCENES.map((id) => [id] as const))('scene %s makes sound and does not clip', (id) => {
    const scene = BUILT_IN_SCENES.find((s) => s.id === id)!;
    expect(scene).toBeDefined();
    const { out } = render(targetOf(applyMix(defaultSoundscapeState(), scene.mix)), 3);
    expect(peak(out)).toBeLessThan(1);
    expect(rms(out)).toBeGreaterThan(0.003);
  }, 60_000);
});

describe('fade schedules in the engine', () => {
  it('a slow fade-in starts quieter than it settles', () => {
    const { windows } = render(targetOf(full(['cityNight'])), 4, { settle: 0, fadeIn: 3 });
    const first = windows[0] ?? 0;
    const late = windows[windows.length - 1] ?? 0;
    expect(first).toBeLessThan(late * 0.4);
  }, 60_000);

  it('a scheduled fade-out reaches silence while the engine keeps running', () => {
    let engineRef: SoundscapeEngine | null = null;
    const { windows } = render(targetOf(full(['cityNight'])), 3, {
      settle: 0.8,
      before: (engine) => {
        engineRef = engine;
        engine.scheduleFadeOut(1.3, 1);
      },
    });
    expect(windows[0]).toBeGreaterThan(0.002);
    expect(windows[windows.length - 1]).toBeLessThan(1e-4);
    expect(engineRef).not.toBeNull();
  }, 60_000);
});

describe('the model', () => {
  it('ships eight new layers, a Japan group, seven new scenes and the koto style', () => {
    for (const id of NEW_LAYERS) expect(SOUND_LAYERS.some((l) => l.id === id), id).toBe(true);
    expect(SOUND_LAYER_GROUPS.map((g) => g.id)).toContain('japan');
    for (const id of NEW_SCENES) expect(BUILT_IN_SCENES.some((s) => s.id === id), id).toBe(true);
    expect(MUSIC_STYLES.some((s) => s.id === 'koto-garden')).toBe(true);
  });

  it('every layer, group, scene, style and schedule label is translated', () => {
    const keys = [
      ...SOUND_LAYERS.map((l) => l.labelKey),
      ...SOUND_LAYER_GROUPS.map((g) => g.labelKey),
      ...BUILT_IN_SCENES.map((s) => s.labelKey),
      ...MUSIC_STYLES.map((s) => s.labelKey),
      ...FADE_SCHEDULES.map((s) => s.labelKey),
    ];
    for (const lang of ['en', 'ja', 'zh', 'ru'] as const) {
      const cat = CATALOGS[lang] as Record<string, unknown>;
      expect(keys.filter((k) => typeof cat[k] !== 'string'), lang).toEqual([]);
    }
  });

  it('repairs stored fade and per-scene volumes', () => {
    const state = normalizeSoundscapeState({ fade: 'nope', sceneVolumes: { 'temple-dawn': 4, bad: 'x', 'rainy-cafe': 0.4 } });
    expect(state.fade).toBe('quick');
    expect(state.sceneVolumes).toEqual({ 'temple-dawn': 1, 'rainy-cafe': 0.4 });
    expect(normalizeSoundscapeState({ fade: 'sleep' }).fade).toBe('sleep');
  });

  it('a sleep timer\'s fade ends exactly when the timer does', () => {
    expect(sleepFadePlan(30, fadeScheduleOf('sleep'))).toEqual({ fadeStartsInMs: 20 * 60_000, fadeMs: 10 * 60_000, stopInMs: 30 * 60_000 });
    // A fade longer than the timer starts at once.
    expect(sleepFadePlan(5, fadeScheduleOf('sleep'))).toEqual({ fadeStartsInMs: 0, fadeMs: 5 * 60_000, stopInMs: 5 * 60_000 });
    expect(sleepFadePlan(15, fadeScheduleOf('quick')).fadeMs).toBe(8000);
  });

  it('study-mode presets default off, and repair what was stored', () => {
    expect(DEFAULT_STUDY_MODE_PRESETS.enabled).toBe(false);
    expect(DEFAULT_STUDY_MODE_PRESETS.listening).toBe('pause');
    expect(normalizeStudyModePresets({ enabled: true, reading: 'temple-dawn', review: 7 })).toEqual({
      enabled: true,
      reading: 'temple-dawn',
      review: DEFAULT_STUDY_MODE_PRESETS.review,
      listening: DEFAULT_STUDY_MODE_PRESETS.listening,
    });
    for (const preset of [DEFAULT_STUDY_MODE_PRESETS.reading, DEFAULT_STUDY_MODE_PRESETS.review]) {
      expect(BUILT_IN_SCENES.some((s) => s.id === preset), preset).toBe(true);
    }
  });
});
