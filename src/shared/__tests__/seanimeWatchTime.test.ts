/**
 * Phase 6 slice 8 — what may be claimed as watch time.
 *
 * Every test here is one of the five rules in `seanimeWatchTime.ts`, and each has an
 * obvious wrong implementation that would pass a naive test: crediting media time (a 2×
 * rewatch invents an hour), crediting an unbounded wall-clock gap (a suspended laptop
 * invents a night), or clamping to forward progress (the app's own line-loop invents
 * nothing at all).
 */
import { describe, expect, it } from 'vitest';
import {
  createWatchTimeState,
  watchTimeCredit,
  watchTimeFlush,
  watchTimeInterrupt,
  watchTimeSample,
  watchTimeShouldFlush,
  watchTimeStop,
  WATCH_TIME_FLUSH_SEC,
  WATCH_TIME_MAX_INTERVAL_SEC,
  WATCH_TIME_MIN_FLUSH_SEC,
  WATCH_TIME_STALL_SEC,
  type WatchTimeSample,
} from '../seanimeWatchTime';

const T0 = 1_700_000_000_000;

function playing(atMs: number, positionSec: number): WatchTimeSample {
  return { atMs, positionSec, playing: true };
}
function paused(atMs: number, positionSec: number): WatchTimeSample {
  return { atMs, positionSec, playing: false };
}

/** Feed a whole run of samples and return the resulting state. */
function run(samples: WatchTimeSample[]) {
  return samples.reduce(watchTimeSample, createWatchTimeState());
}

describe('watchTimeCredit — rule 1: wall-clock while playing, not media time', () => {
  it('credits the real time that elapsed, not the media the player got through', () => {
    // 2× speed: 4 s of media in 2 s of wall clock. The user spent 2 s.
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + 2000, 14))).toBe(2);
  });

  it('does not credit a seek forward with the distance seeked', () => {
    // A 20-minute jump inside one 250 ms tick is worth 250 ms, not 20 minutes.
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + 250, 1210))).toBe(0.25);
  });
});

describe('watchTimeCredit — rule 2: both ends must be playing', () => {
  it('credits nothing when the interval ended paused', () => {
    expect(watchTimeCredit(playing(T0, 10), paused(T0 + 1000, 11))).toBe(0);
  });

  it('credits nothing when the interval started paused', () => {
    expect(watchTimeCredit(paused(T0, 10), playing(T0 + 1000, 11))).toBe(0);
  });

  it('does not accrue across a window left paused', () => {
    const state = run([
      playing(T0, 10),
      paused(T0 + 500, 10.5),
      playing(T0 + 8 * 3600 * 1000, 10.5),
    ]);
    expect(state.creditedSec).toBe(0);
  });
});

describe('watchTimeCredit — rule 3: an interval is capped, not trusted', () => {
  it('caps a suspend-sized gap at the maximum interval', () => {
    const overnightMs = 8 * 3600 * 1000;
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + overnightMs, 11))).toBe(
      WATCH_TIME_MAX_INTERVAL_SEC,
    );
  });

  it('leaves an ordinary tick untouched', () => {
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + 250, 10.25))).toBe(0.25);
  });

  it('credits nothing when the clock went backwards', () => {
    expect(watchTimeCredit(playing(T0, 10), playing(T0 - 5000, 11))).toBe(0);
  });
});

describe('watchTimeCredit — rule 4: a frozen clock earns nothing', () => {
  it('credits nothing for a long interval with an unmoved position', () => {
    const stallMs = (WATCH_TIME_STALL_SEC + 1) * 1000;
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + stallMs, 10))).toBe(0);
  });

  it('still credits a short tick that happens to land on the same position', () => {
    // Sub-stall: `timeupdate` can fire twice inside one frame's worth of media time.
    expect(watchTimeCredit(playing(T0, 10), playing(T0 + 100, 10))).toBe(0.1);
  });
});

describe('watchTimeCredit — rule 5: going backwards is not cheating', () => {
  it('credits a replayed line exactly like a forward one', () => {
    // The study overlay's "replay line" seeks back; this is the app's most common action.
    const back = watchTimeCredit(playing(T0, 30), playing(T0 + 400, 27));
    const forward = watchTimeCredit(playing(T0, 30), playing(T0 + 400, 30.4));
    expect(back).toBe(0.4);
    expect(back).toBe(forward);
  });

  it('credits a loop that never advances past the same cue', () => {
    const state = run([
      playing(T0, 30),
      playing(T0 + 1000, 31),
      playing(T0 + 2000, 30),
      playing(T0 + 3000, 31),
    ]);
    expect(state.creditedSec).toBe(3);
  });
});

describe('watchTimeFlush', () => {
  it('hands over the pending balance and keeps the interval open', () => {
    const state = run([playing(T0, 0), playing(T0 + 4000, 4)]);
    const flushed = watchTimeFlush(state);
    expect(flushed.seconds).toBe(4);
    expect(flushed.state.pendingSec).toBe(0);
    // `last` survives, so a flush mid-playback does not drop the interval in progress.
    expect(flushed.state.last).toEqual(playing(T0 + 4000, 4));
  });

  it('leaves rounding noise pending rather than writing it', () => {
    const state = run([playing(T0, 0), playing(T0 + 100, 0.1)]);
    expect(state.pendingSec).toBeLessThan(WATCH_TIME_MIN_FLUSH_SEC);
    const flushed = watchTimeFlush(state);
    expect(flushed.seconds).toBe(0);
    expect(flushed.state.pendingSec).toBe(state.pendingSec);
  });

  it('asks for a flush only once the balance is worth a storage write', () => {
    // Built from intervals under the rule-3 cap, so the balance is the sum of the ticks.
    // One 14 s gap would *not* reach the threshold — it caps at
    // WATCH_TIME_MAX_INTERVAL_SEC — which is the whole point of the cap.
    const under = run([playing(T0, 0), playing(T0 + 5000, 5), playing(T0 + 10_000, 10)]);
    expect(under.pendingSec).toBe(10);
    expect(WATCH_TIME_FLUSH_SEC).toBeGreaterThan(10);
    expect(watchTimeShouldFlush(under)).toBe(false);
    const over = watchTimeSample(under, playing(T0 + 15_000, 15));
    expect(over.pendingSec).toBe(15);
    expect(watchTimeShouldFlush(over)).toBe(true);
  });

  it('serialises to two decimals rather than a float tail', () => {
    const state = run([playing(T0, 0), playing(T0 + 1234, 1.234)]);
    expect(watchTimeFlush(state).seconds).toBe(1.23);
  });
});

describe('watchTimeInterrupt', () => {
  it('keeps what was earned but refuses to pair across the gap', () => {
    const state = watchTimeInterrupt(run([playing(T0, 0), playing(T0 + 3000, 3)]));
    expect(state.pendingSec).toBe(3);
    expect(state.last).toBeNull();
    // A sample an hour later starts a fresh interval instead of claiming the hour.
    const next = watchTimeSample(state, playing(T0 + 3_600_000, 3));
    expect(next.pendingSec).toBe(3);
  });
});

describe('watchTimeStop', () => {
  it('credits the fragment between the last tick and the pause', () => {
    // Without this, every pause in a study session silently loses up to a `timeupdate`.
    const state = watchTimeStop(run([playing(T0, 0), playing(T0 + 1000, 1)]), {
      atMs: T0 + 1240,
      positionSec: 1.24,
    });
    expect(state.pendingSec).toBeCloseTo(1.24, 5);
    expect(state.last).toBeNull();
  });

  it('credits nothing when playback had already stopped', () => {
    const state = watchTimeStop(run([playing(T0, 0), paused(T0 + 1000, 1)]), {
      atMs: T0 + 60_000,
      positionSec: 1,
    });
    expect(state.pendingSec).toBe(0);
  });
});

describe('a malformed sample', () => {
  it('is dropped and starts a fresh interval instead of bridging an unknown gap', () => {
    const good = run([playing(T0, 0), playing(T0 + 1000, 1)]);
    // `video.currentTime` is NaN between a source swap and the first metadata event.
    const broken = watchTimeSample(good, playing(T0 + 2000, Number.NaN));
    expect(broken.last).toBeNull();
    expect(broken.pendingSec).toBe(1);
    const next = watchTimeSample(broken, playing(T0 + 900_000, 5));
    expect(next.pendingSec).toBe(1);
  });
});
