// @vitest-environment jsdom
/**
 * Bug 23 and the rest of the engine's live-param ramps, rendered offline through
 * the fake Web Audio graph (helpers/offlineAudio.ts), which follows the spec in
 * the two places that matter here: a ramp scheduled after a SetTarget replaces
 * it, and `cancelAndHoldAtTime` holds the value the curve had.
 *
 *  - a slider moved during a layer's fade-in stays where it was put (it used to
 *    jump back to the old level when the fade-in ended);
 *  - a layer removed during its fade-in leaves from the level it had, not from 0
 *    (`cancelScheduledValues` dropped the running ramp: a one-sample step);
 *  - cancelling the sleep-timer fade glides back up instead of stepping;
 *  - re-applying an unchanged target schedules nothing (glides used to stack).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeAudioContext, FakePeriodicWave } from './helpers/offlineAudio';
import { SoundscapeEngine, type SoundscapeTarget } from '../soundscape/soundscapeEngine';
import { createRng, sliderToGain, type SoundLayerId } from '../soundscape/soundscapeModel';

const SR = 8000;

interface Param {
  value: number;
  scheduledCount(): number;
}
interface Internals {
  layers: Map<SoundLayerId, { level: { gain: Param } }>;
  leaving: Set<{ level: { gain: Param } }>;
  master: { gain: Param };
  duck: { gain: Param };
  scheduled: { gain: Param };
  fade: { gain: Param };
}

function target(level: number | null, extra: Partial<SoundscapeTarget> = {}): SoundscapeTarget {
  return {
    master: 0.8,
    layers: level === null ? {} : { pink: sliderToGain(level) },
    music: 'off',
    musicGain: 0,
    ducked: false,
    ...extra,
  };
}

function start(first: SoundscapeTarget): { engine: SoundscapeEngine; inner: Internals; run(seconds: number): void } {
  const engine = new SoundscapeEngine();
  engine.apply(first);
  engine.play();
  const ctx = FakeAudioContext.lastCreated as FakeAudioContext;
  const run = (seconds: number): void => {
    const chunk = 0.05;
    for (let t = 0; t < seconds - 1e-9; t += chunk) {
      vi.advanceTimersByTime(chunk * 1000);
      ctx.render(chunk);
    }
  };
  return { engine, inner: engine as unknown as Internals, run };
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

describe('soundscape ramps (bug 23)', () => {
  it('a slider moved during a layer\'s fade-in is not undone when the fade-in ends', () => {
    const s = start(target(0.7));
    s.run(0.2); // the layer's own fade-in lasts 0.5 s
    s.engine.apply(target(0.2));
    s.run(1.5);
    const level = s.inner.layers.get('pink')?.level.gain.value ?? -1;
    expect(level).toBeCloseTo(sliderToGain(0.2), 2);
    expect(level).toBeLessThan(sliderToGain(0.7) * 0.8);
    s.engine.pause(0.05);
  });

  it('the music bed\'s fade-in obeys the same rule', () => {
    const s = start({ ...target(null), music: 'lofi-chill', musicGain: 0.6 });
    s.run(0.3); // music fades in over 0.8 s
    s.engine.apply({ ...target(null), music: 'lofi-chill', musicGain: 0.1 });
    s.run(1.5);
    const music = (s.engine as unknown as { music: { level: { gain: Param } } }).music;
    expect(music.level.gain.value).toBeCloseTo(0.1, 2);
    s.engine.pause(0.05);
  });

  it('a layer removed during its fade-in fades from where it was, without a step to silence', () => {
    const s = start(target(0.7));
    s.run(0.25);
    const before = s.inner.layers.get('pink')?.level.gain.value ?? 0;
    expect(before).toBeGreaterThan(0.1);
    s.engine.apply(target(null));
    const [leaving] = [...s.inner.leaving];
    // The instant after the change it is still (about) as loud as it was.
    expect(leaving.level.gain.value).toBeGreaterThan(before * 0.9);
    s.run(0.05);
    const after50ms = leaving.level.gain.value;
    expect(after50ms).toBeGreaterThan(before * 0.4);
    expect(after50ms).toBeLessThan(before);
    s.run(0.7);
    expect(s.engine.leavingCount()).toBe(0);
    s.engine.pause(0.05);
  });

  it('a level cross-fade starts from the level the voice has now', () => {
    const s = start(target(0.7));
    s.run(0.25);
    const before = s.inner.layers.get('pink')?.level.gain.value ?? 0;
    s.engine.apply({ ...target(0.3), crossfadeSec: 2 });
    const now = s.inner.layers.get('pink')?.level.gain.value ?? 0;
    expect(Math.abs(now - before)).toBeLessThan(before * 0.05);
    s.run(1);
    const half = s.inner.layers.get('pink')?.level.gain.value ?? 0;
    expect(half).toBeLessThan(before);
    expect(half).toBeGreaterThan(sliderToGain(0.3));
    s.run(1.2);
    expect(s.inner.layers.get('pink')?.level.gain.value).toBeCloseTo(sliderToGain(0.3), 3);
    s.engine.pause(0.05);
  });

  it('cancelling the sleep-timer fade glides back to full rather than stepping', () => {
    const s = start(target(0.5));
    s.run(0.6);
    s.engine.scheduleFadeOut(0, 2);
    s.run(1);
    const faded = s.inner.scheduled.gain.value;
    expect(faded).toBeGreaterThan(0.3);
    expect(faded).toBeLessThan(0.7);
    s.engine.cancelScheduledFade();
    expect(s.inner.scheduled.gain.value).toBeCloseTo(faded, 2);
    s.run(0.2);
    expect(s.inner.scheduled.gain.value).toBeCloseTo(1, 5);
    s.engine.pause(0.05);
  });

  it('a delayed sleep fade holds the current level until it begins', () => {
    const s = start(target(0.5));
    s.run(0.3);
    s.engine.scheduleFadeOut(1, 1);
    s.run(0.9);
    expect(s.inner.scheduled.gain.value).toBeCloseTo(1, 5);
    s.run(0.6);
    expect(s.inner.scheduled.gain.value).toBeGreaterThan(0.3);
    expect(s.inner.scheduled.gain.value).toBeLessThan(0.7);
    s.engine.pause(0.05);
  });

  it('re-applying an unchanged target schedules nothing new; a real change glides once', () => {
    const s = start(target(0.5));
    s.run(0.2);
    const masterBefore = s.inner.master.gain.scheduledCount();
    const duckBefore = s.inner.duck.gain.scheduledCount();
    for (let i = 0; i < 200; i += 1) s.engine.apply(target(0.5));
    expect(s.inner.master.gain.scheduledCount()).toBe(masterBefore);
    expect(s.inner.duck.gain.scheduledCount()).toBe(duckBefore);

    // Ducking toggled many times: each change replaces the last glide instead of piling up.
    for (let i = 0; i < 50; i += 1) {
      s.engine.apply(target(0.5, { ducked: i % 2 === 0, duckGain: 0.3 }));
      s.run(0.05);
    }
    expect(s.inner.duck.gain.scheduledCount()).toBeLessThanOrEqual(3);
    s.engine.apply(target(0.5, { ducked: false }));
    s.run(3);
    expect(s.inner.duck.gain.value).toBeCloseTo(1, 2);
    s.engine.pause(0.05);
  });

  it('pausing in the middle of a fade-in falls from the level reached, then stops', () => {
    const s = start(target(0.5));
    s.run(0.3);
    const before = s.inner.fade.gain.value;
    s.engine.pause(0.4);
    expect(s.inner.fade.gain.value).toBeCloseTo(before, 2);
    s.run(0.2);
    expect(s.inner.fade.gain.value).toBeLessThan(before);
    s.run(0.4);
    expect(s.inner.fade.gain.value).toBeCloseTo(0, 5);
    expect(s.engine.isPlaying()).toBe(false);
  });
});
