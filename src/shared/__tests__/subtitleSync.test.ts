import { describe, expect, it } from 'vitest';
import {
  detrend,
  estimateOffset,
  logRmsEnvelope,
  scoreLag,
  shiftCues,
  shiftCuesMs,
  syncSampleWindows,
  SYNC_HOP_SEC,
  SYNC_MIN_PEAK_SCORE,
  type SyncAudioWindow,
  type SyncCueInterval,
} from '../subtitleSync';

/**
 * A synthetic episode: quiet everywhere except inside the "spoken" intervals.
 *
 * Built in the same detrended-log domain the real pipeline produces, so the estimator
 * under test is the same code path — only the decoding is replaced.
 */
function windowWithSpeech(
  startSec: number,
  lengthSec: number,
  speech: readonly SyncCueInterval[],
  loudness = 0.4,
): SyncAudioWindow {
  const frames = Math.round(lengthSec / SYNC_HOP_SEC);
  // Silence is NEGATIVE, not zero. `detrend` subtracts the local mean, so a gap between
  // lines sits below it — and that is what makes a wrong lag score badly rather than
  // merely unremarkably. A first draft used 0 here and the estimator rightly declined the
  // result: with no penalty for landing in a gap, a half-aligned lag scored half the peak.
  const detrended = new Float64Array(frames).fill(-loudness * 0.6);
  for (const span of speech) {
    const from = Math.floor((span.start - startSec) / SYNC_HOP_SEC);
    const to = Math.ceil((span.end - startSec) / SYNC_HOP_SEC);
    for (let i = Math.max(0, from); i < Math.min(frames, to); i += 1) {
      detrended[i] = loudness;
    }
  }
  return { startSec, detrended };
}

/**
 * Lines of speech at irregular spacing.
 *
 * Deliberately aperiodic. A first draft placed a 2 s line every 4 s, and the estimator
 * correctly refused it: a lag of exactly one period aligns that pattern just as well as
 * zero does, so no lag stands out and there is genuinely no answer to give. Real dialogue
 * is not metronomic, and a fixture that is tests the wrong thing.
 */
function dialogue(count: number, offsetSec = 0): SyncCueInterval[] {
  const gaps = [3.1, 5.7, 2.3, 8.2, 4.4, 6.9, 3.8, 11.3, 2.9, 7.1];
  const lengths = [1.9, 0.8, 3.2, 1.1, 2.6, 1.4, 0.9, 2.2, 1.7, 3.9];
  const out: SyncCueInterval[] = [];
  let cursor = offsetSec;
  for (let i = 0; i < count; i += 1) {
    const start = cursor;
    const end = start + lengths[i % lengths.length];
    out.push({ start, end });
    cursor = end + gaps[i % gaps.length];
  }
  return out;
}

describe('logRmsEnvelope', () => {
  it('is louder for a louder frame', () => {
    const quiet = new Int16Array(160).fill(100);
    const loud = new Int16Array(160).fill(20000);
    const env = logRmsEnvelope(Int16Array.from([...quiet, ...loud]), 160);
    expect(env).toHaveLength(2);
    expect(env[1]).toBeGreaterThan(env[0]);
  });

  it('keeps digital silence finite rather than -Infinity', () => {
    const env = logRmsEnvelope(new Int16Array(160), 160);
    expect(Number.isFinite(env[0])).toBe(true);
  });

  it('drops a trailing partial frame instead of scaling it wrong', () => {
    expect(logRmsEnvelope(new Int16Array(250), 160)).toHaveLength(1);
  });
});

describe('detrend', () => {
  it('cancels a constant bed entirely', () => {
    const flat = new Float64Array(500).fill(-1.5);
    for (const v of detrend(flat, 100)) expect(v).toBeCloseTo(0, 10);
  });

  it('leaves a transient standing above its surroundings', () => {
    const values = new Float64Array(500).fill(-2);
    for (let i = 240; i < 260; i += 1) values[i] = -0.5;
    const out = detrend(values, 100);
    expect(out[250]).toBeGreaterThan(1);
    expect(out[10]).toBeLessThan(0.2);
  });
});

describe('scoreLag', () => {
  it('scores the aligned lag above a misaligned one', () => {
    const cues = dialogue(50);
    const win = windowWithSpeech(0, 200, cues);
    expect(scoreLag([win], cues, 0)!).toBeGreaterThan(scoreLag([win], cues, 3)!);
  });

  it('returns null rather than 0 when almost nothing overlaps', () => {
    const cues = dialogue(50);
    const win = windowWithSpeech(0, 200, cues);
    // Pushed far outside the sampled window: unmeasured, not "flat".
    expect(scoreLag([win], cues, 5000)).toBeNull();
  });
});

describe('estimateOffset', () => {
  it('finds a track that runs late and reports the negative shift that fixes it', () => {
    const speech = dialogue(50);
    // The subtitle file says every line happens 9.05 s after it really does.
    const cues = speech.map((c) => ({ start: c.start + 9.05, end: c.end + 9.05 }));
    const result = estimateOffset([windowWithSpeech(0, 200, speech)], cues);
    expect(result.confident).toBe(true);
    expect(result.offsetSec).toBeCloseTo(-9.05, 2);
  });

  it('returns zero for a track that is already in sync', () => {
    const speech = dialogue(50);
    const result = estimateOffset([windowWithSpeech(0, 200, speech)], speech);
    expect(result.confident).toBe(true);
    expect(result.offsetSec).toBe(0);
  });

  it('refuses when no lag stands out — the wrong-episode case', () => {
    const speech = dialogue(50);
    // Cues that bear no relation to the speech: dense enough to always overlap
    // something, so every lag scores about the same.
    const cues = Array.from({ length: 50 }, (_, i) => ({
      start: i * 4 + 0.4,
      end: i * 4 + 3.6,
    }));
    const win = windowWithSpeech(0, 200, speech, 0.02);
    const result = estimateOffset([win], cues);
    expect(result.confident).toBe(false);
    expect(result.offsetSec).toBe(0);
  });

  it('never reports a shift it is not confident about', () => {
    const result = estimateOffset([], dialogue(10));
    expect(result).toMatchObject({ offsetSec: 0, confident: false });
  });

  it('holds the peak floor at the level that separated the measured cases', () => {
    // 0.030 was the wrong-episode peak and 0.105 the true one; the floor sits between.
    expect(SYNC_MIN_PEAK_SCORE).toBeGreaterThan(0.03);
    expect(SYNC_MIN_PEAK_SCORE).toBeLessThan(0.105);
  });

  it('combines several windows into one search', () => {
    const speech = [...dialogue(20), ...dialogue(20, 600)];
    const cues = speech.map((c) => ({ start: c.start + 4, end: c.end + 4 }));
    const result = estimateOffset([
      windowWithSpeech(0, 200, speech),
      windowWithSpeech(600, 200, speech),
    ], cues);
    expect(result.confident).toBe(true);
    expect(result.offsetSec).toBeCloseTo(-4, 2);
  });
});

describe('syncSampleWindows', () => {
  it('spreads interior windows across an episode', () => {
    const plan = syncSampleWindows(1421, 4, 90);
    expect(plan).toHaveLength(4);
    expect(plan[0].startSec).toBeGreaterThan(0);
    for (const w of plan) expect(w.startSec + w.lengthSec).toBeLessThanOrEqual(1421);
    // Strictly increasing, so the windows never sample the same stretch twice.
    for (let i = 1; i < plan.length; i += 1) {
      expect(plan[i].startSec).toBeGreaterThan(plan[i - 1].startSec);
    }
  });

  it('reads a clip shorter than one window whole', () => {
    expect(syncSampleWindows(30, 4, 90)).toEqual([{ startSec: 0, lengthSec: 30 }]);
  });

  it('has nothing to sample in a zero-length file', () => {
    expect(syncSampleWindows(0)).toEqual([]);
  });
});

describe('shiftCues', () => {
  it('moves every cue and keeps the rest of the object', () => {
    const out = shiftCues([{ start: 10, end: 12, text: 'ん？' }], -9.05);
    expect(out[0]).toEqual({ start: 0.95, end: 2.95, text: 'ん？' });
  });

  it('clamps at zero rather than producing a negative cue time', () => {
    const out = shiftCues([{ start: 1, end: 2 }], -9.05);
    expect(out[0].start).toBe(0);
    expect(out[0].end).toBe(0);
  });

  it('returns the input untouched for a zero shift', () => {
    const cues = [{ start: 1, end: 2 }];
    expect(shiftCues(cues, 0)).toBe(cues);
  });
});

describe('shiftCuesMs', () => {
  it('moves the millisecond cue shape by the measured offset', () => {
    const out = shiftCuesMs(
      [{ startMs: 616_934, endMs: 618_334, text: '私はあなたの部下ではない', index: 130 }],
      -9.05,
    );
    expect(out[0]).toEqual({
      startMs: 607_884,
      endMs: 609_284,
      text: '私はあなたの部下ではない',
      index: 130,
    });
  });

  it('clamps at zero rather than producing a negative cue time', () => {
    const out = shiftCuesMs([{ startMs: 1_000, endMs: 2_000 }], -9.05);
    expect(out[0]).toEqual({ startMs: 0, endMs: 0 });
  });

  it('returns whole milliseconds for an offset that is not a whole number of them', () => {
    const out = shiftCuesMs([{ startMs: 10_000, endMs: 11_000 }], -1.2345);
    expect(out[0].startMs).toBe(8_766);
    expect(Number.isInteger(out[0].startMs)).toBe(true);
  });

  it('returns the input untouched for a zero shift', () => {
    const cues = [{ startMs: 1_000, endMs: 2_000 }];
    expect(shiftCuesMs(cues, 0)).toBe(cues);
  });

  it('agrees with shiftCues on the same cue expressed in seconds', () => {
    const seconds = shiftCues([{ start: 616.934, end: 618.334 }], -9.05);
    const millis = shiftCuesMs([{ startMs: 616_934, endMs: 618_334 }], -9.05);
    expect(millis[0].startMs).toBe(Math.round(seconds[0].start * 1000));
    expect(millis[0].endMs).toBe(Math.round(seconds[0].end * 1000));
  });
});
