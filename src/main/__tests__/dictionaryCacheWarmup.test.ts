// The in-process cache warm-up: that it runs every leg, that it drains the loop
// before each one, that a failing leg cannot take the warm-up (or a boot) down,
// and that it happens exactly once per process.
//
// The value it delivers — a first merged interlinear that cost 27,962 ms on a
// cold OS file cache and 4,368 ms on a warm one, answering in 92-96 ms instead —
// is a property of a 537 MB database and a 551,605-rank table, so it is measured
// against those (twice per arm) and recorded in the plan, never asserted here.
// What IS asserted here is every part of the orchestration that a later edit
// could break silently while all of those numbers still looked fine.
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DICT_CACHE_WARMUP_DELAY_MS,
  cancelScheduledDictionaryCacheWarmup,
  resetDictionaryCacheWarmupForTests,
  runDictionaryCacheWarmup,
  scheduleDictionaryCacheWarmup,
  type CacheWarmupLeg,
} from '../dictionary/cacheWarmup';
import { DICT_WARMUP_DELAY_MS } from '../dictionary';

/** A sink for the warm-up's log line. Not `() => {}`: eslint rejects an empty body. */
const silent = (): undefined => undefined;

/** A clock that only moves when a leg says it did, so a leg's ms is exact. */
function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => { t += ms; } };
}

beforeEach(() => {
  resetDictionaryCacheWarmupForTests();
});

describe('runDictionaryCacheWarmup', () => {
  it('runs every leg and reports each one by name, in order', async () => {
    const clock = fakeClock();
    // The three measured costs, so the report's arithmetic is checkable.
    const legs: CacheWarmupLeg[] = [
      { name: 'frequency', run: () => { clock.advance(2315); } },
      { name: 'tokenizer', run: () => { clock.advance(938); } },
      { name: 'interlinear', run: () => { clock.advance(86); } },
    ];
    const report = await runDictionaryCacheWarmup({ legs, now: clock.now, log: silent });

    expect(report.legs.map((leg) => leg.name)).toEqual(['frequency', 'tokenizer', 'interlinear']);
    expect(report.legs.map((leg) => leg.ms)).toEqual([2315, 938, 86]);
    expect(report.totalMs).toBe(3339);
    expect(report.longestLegMs).toBe(2315);
    expect(report.legs.every((leg) => leg.ok)).toBe(true);
  });

  it('drains the event loop before every leg, not merely between them', async () => {
    // The order is the point: a drain recorded only AFTER a leg would mean the
    // first leg ran in its scheduler's own tick — i.e. back on the boot path.
    const order: string[] = [];
    const legs: CacheWarmupLeg[] = [
      { name: 'a', run: () => { order.push('leg:a'); } },
      { name: 'b', run: () => { order.push('leg:b'); } },
    ];
    await runDictionaryCacheWarmup({
      legs,
      log: silent,
      yieldToLoop: async () => { order.push('yield'); },
    });

    expect(order).toEqual(['yield', 'leg:a', 'yield', 'leg:b']);
  });

  it('keeps going when a leg throws, and records the failure instead of surfacing it', async () => {
    const legs: CacheWarmupLeg[] = [
      { name: 'frequency', run: () => { throw new Error('no rank tables on disk'); } },
      { name: 'tokenizer', run: () => 'built' },
    ];
    const report = await runDictionaryCacheWarmup({ legs, log: silent });

    expect(report.legs[0]).toMatchObject({
      name: 'frequency',
      ok: false,
      error: 'no rank tables on disk',
    });
    expect(report.legs[1]).toMatchObject({ name: 'tokenizer', ok: true });
  });

  it('awaits an async leg rather than timing only its synchronous head', async () => {
    // kuromoji's build is a callback wrapped in a promise; timing only the call
    // that starts it would report ~0 ms for the most expensive leg there is.
    const clock = fakeClock();
    const legs: CacheWarmupLeg[] = [
      {
        name: 'tokenizer',
        run: async () => {
          await Promise.resolve();
          clock.advance(938);
        },
      },
    ];
    const report = await runDictionaryCacheWarmup({ legs, now: clock.now, log: silent });

    expect(report.legs[0].ms).toBe(938);
  });

  it('runs once per process: a second call pays nothing and returns the first report', async () => {
    let runs = 0;
    const legs: CacheWarmupLeg[] = [{ name: 'frequency', run: () => { runs += 1; } }];

    const first = await runDictionaryCacheWarmup({ legs, log: silent });
    const second = await runDictionaryCacheWarmup({ legs, log: silent });

    expect(runs).toBe(1);
    expect(second).toBe(first);
  });
});

describe('scheduleDictionaryCacheWarmup', () => {
  it('arms a timer and touches no leg before it fires', async () => {
    let fired: (() => void) | null = null;
    let delay = -1;
    let ran = false;
    const legs: CacheWarmupLeg[] = [{ name: 'frequency', run: () => { ran = true; } }];

    scheduleDictionaryCacheWarmup({
      legs,
      log: silent,
      schedule: (fn, ms) => { fired = fn; delay = ms; return null; },
    });

    expect(delay).toBe(DICT_CACHE_WARMUP_DELAY_MS);
    expect(ran).toBe(false);

    fired!();
    await expect.poll(() => ran).toBe(true);
  });

  it('arms only one timer no matter how many times it is scheduled', () => {
    let armed = 0;
    const legs: CacheWarmupLeg[] = [{ name: 'frequency', run: silent }];
    const schedule = () => { armed += 1; return null; };

    scheduleDictionaryCacheWarmup({ legs, log: silent, schedule });
    scheduleDictionaryCacheWarmup({ legs, log: silent, schedule });

    expect(armed).toBe(1);
  });

  it('cancels a scheduled-but-not-started warm-up', () => {
    let fired: (() => void) | null = null;
    let ran = false;
    const legs: CacheWarmupLeg[] = [{ name: 'frequency', run: () => { ran = true; } }];

    scheduleDictionaryCacheWarmup({
      legs,
      log: silent,
      schedule: (fn) => { fired = fn; return null; },
    });
    cancelScheduledDictionaryCacheWarmup();
    // Re-arming must now be possible; if cancel merely cleared a handle without
    // releasing the guard, this second call would be a silent no-op.
    let rearmed = false;
    scheduleDictionaryCacheWarmup({
      legs,
      log: silent,
      schedule: () => { rearmed = true; return null; },
    });

    expect(rearmed).toBe(true);
    expect(ran).toBe(false);
    expect(fired).not.toBeNull();
  });

  it('lands after the page warm-up, because that is what makes its own last leg cheap', () => {
    // `dictionary/warmup.ts` reads dict.db into the OS file cache. Running the
    // in-process warm-up first would make its interlinear leg a cold disk read —
    // exactly the cost the page warm-up exists to have already paid.
    expect(DICT_CACHE_WARMUP_DELAY_MS).toBeGreaterThan(DICT_WARMUP_DELAY_MS);
    // ...and late enough that first paint and the renderer's first render are done.
    expect(DICT_CACHE_WARMUP_DELAY_MS).toBeGreaterThanOrEqual(10_000);
  });
});
