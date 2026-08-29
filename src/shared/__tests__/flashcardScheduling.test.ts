/**
 * The configurable scheduler, its FSRS half, and the migration between them.
 *
 * Three things are pinned here because getting any of them wrong loses a user's
 * review history without anything looking broken:
 *
 * - The default is still SM-2 and still produces the SAME intervals it always
 *   did. A user who never opens the setting must not find their deck
 *   rescheduled by an upgrade.
 * - A version-1 state on disk migrates without inventing a stability, a
 *   difficulty or an algorithm it never ran under.
 * - Switching algorithms ADAPTS the state rather than reading an SM-2 ease as
 *   an FSRS difficulty. The two numbers are not the same quantity, and reading
 *   one as the other is the silent corruption this seam exists to prevent.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCHEDULING_CONFIG,
  MAX_LOCAL_RETENTION,
  MIN_LOCAL_RETENTION,
  adaptStateForAlgorithm,
  migrateSrsState,
  normalizeSchedulingConfig,
  previewSchedule,
  resetSrsState,
  scheduleReview,
  stateAlgorithm,
  type SchedulingConfig,
} from '../flashcardScheduling';
import {
  DEFAULT_FSRS_WEIGHTS,
  FSRS_MAX_DIFFICULTY,
  FSRS_MIN_DIFFICULTY,
  fsrsInitialMemory,
  fsrsInterval,
  fsrsRetrievability,
  fsrsReview,
} from '../fsrs';
import { isLocalSrsState, scheduleLocalReview, type LocalSrsState } from '../localSrs';

const NOW = Date.UTC(2026, 7, 29, 9);
const DAY_MS = 24 * 60 * 60 * 1000;

const fsrs: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, algorithm: 'fsrs' };

/** A version-1 state exactly as decks written before the setting carry it. */
const legacy = {
  version: 1,
  dueAt: NOW + 3 * DAY_MS,
  intervalDays: 3,
  ease: 2.5,
  repetitions: 2,
  lapses: 1,
  lastReviewedAt: NOW,
  lastRating: 'good',
} as const;

describe('fsrs memory model', () => {
  it('makes stability readable: at t = S, recall is 90%', () => {
    for (const stability of [1, 7, 40, 365]) {
      expect(fsrsRetrievability(stability, stability)).toBeCloseTo(0.9, 6);
    }
  });

  it('inverts cleanly — the interval to 90% IS the stability', () => {
    expect(fsrsInterval(30, 0.9)).toBeCloseTo(30, 6);
  });

  it('asks sooner when more retention is demanded', () => {
    const strict = fsrsInterval(30, 0.95);
    const relaxed = fsrsInterval(30, 0.85);
    expect(strict).toBeLessThan(30);
    expect(relaxed).toBeGreaterThan(30);
  });

  it('orders the first-review stabilities Again < Hard < Good < Easy', () => {
    const stabilities = ([1, 2, 3, 4] as const).map((g) => fsrsInitialMemory(g).stability);
    expect(stabilities).toEqual([...stabilities].sort((a, b) => a - b));
    expect(new Set(stabilities).size).toBe(4);
  });

  it('makes an Again card harder and an Easy card easier, within bounds', () => {
    const start = fsrsInitialMemory(3);
    let hardest = start;
    for (let i = 0; i < 30; i += 1) hardest = fsrsReview(hardest, 1, 1);
    let easiest = start;
    for (let i = 0; i < 30; i += 1) easiest = fsrsReview(easiest, 4, 1);
    expect(hardest.difficulty).toBeGreaterThan(start.difficulty);
    expect(easiest.difficulty).toBeLessThan(start.difficulty);
    expect(hardest.difficulty).toBeLessThanOrEqual(FSRS_MAX_DIFFICULTY);
    expect(easiest.difficulty).toBeGreaterThanOrEqual(FSRS_MIN_DIFFICULTY);
  });

  it('REFUSAL: forgetting a card never makes it wait longer', () => {
    let memory = fsrsInitialMemory(3);
    for (let i = 0; i < 5; i += 1) memory = fsrsReview(memory, 3, memory.stability);
    const lapsed = fsrsReview(memory, 1, memory.stability);
    expect(lapsed.stability).toBeLessThanOrEqual(memory.stability);
  });

  it('treats a card with no memory as new rather than as one with low stability', () => {
    expect(fsrsReview(null, 3, 999)).toEqual(fsrsInitialMemory(3));
    expect(DEFAULT_FSRS_WEIGHTS).toHaveLength(19);
  });
});

describe('normalizeSchedulingConfig', () => {
  it('defaults to SM-2, so an untouched deck keeps the schedule it has', () => {
    expect(normalizeSchedulingConfig().algorithm).toBe('sm2');
    expect(normalizeSchedulingConfig(null)).toEqual(DEFAULT_SCHEDULING_CONFIG);
    expect(normalizeSchedulingConfig({ algorithm: 'nonsense' as never }).algorithm).toBe('sm2');
  });

  it('clamps retention and the interval ceiling instead of trusting them', () => {
    expect(normalizeSchedulingConfig({ desiredRetention: 0.999 }).desiredRetention)
      .toBe(MAX_LOCAL_RETENTION);
    expect(normalizeSchedulingConfig({ desiredRetention: 0.1 }).desiredRetention)
      .toBe(MIN_LOCAL_RETENTION);
    expect(normalizeSchedulingConfig({ desiredRetention: Number.NaN }).desiredRetention)
      .toBe(DEFAULT_SCHEDULING_CONFIG.desiredRetention);
    expect(normalizeSchedulingConfig({ maximumIntervalDays: 0 }).maximumIntervalDays)
      .toBe(DEFAULT_SCHEDULING_CONFIG.maximumIntervalDays);
    expect(normalizeSchedulingConfig({ maximumIntervalDays: 1e9 }).maximumIntervalDays)
      .toBe(36_500);
  });
});

describe('migrateSrsState', () => {
  it('stamps a version-1 state as the SM-2 state it always was, inventing nothing', () => {
    const migrated = migrateSrsState(legacy);
    expect(migrated).toBeDefined();
    expect(migrated?.version).toBe(2);
    expect(migrated?.algorithm).toBe('sm2');
    expect(migrated?.stability).toBeUndefined();
    expect(migrated?.difficulty).toBeUndefined();
    // Everything the user's history actually consists of survives untouched.
    expect(migrated).toMatchObject({
      dueAt: legacy.dueAt,
      intervalDays: legacy.intervalDays,
      ease: legacy.ease,
      repetitions: legacy.repetitions,
      lapses: legacy.lapses,
      lastRating: 'good',
    });
  });

  it('leaves an already-migrated state alone and refuses a broken one', () => {
    const already = scheduleReview(undefined, 'good', fsrs, NOW);
    expect(migrateSrsState(already)).toBe(already);
    expect(migrateSrsState(undefined)).toBeUndefined();
    expect(migrateSrsState({ version: 1 })).toBeUndefined();
    expect(migrateSrsState({ ...legacy, repetitions: -1 })).toBeUndefined();
    expect(migrateSrsState({ ...legacy, version: 3 })).toBeUndefined();
  });

  it('rejects a state whose FSRS numbers are out of range rather than clamping them', () => {
    expect(isLocalSrsState({ ...legacy, version: 2, difficulty: 42 })).toBe(false);
    expect(isLocalSrsState({ ...legacy, version: 2, stability: -1 })).toBe(false);
    expect(isLocalSrsState({ ...legacy, version: 2, algorithm: 'sm3' })).toBe(false);
    expect(isLocalSrsState({ ...legacy, version: 2, stability: 5, difficulty: 5 })).toBe(true);
  });

  it('reads a missing algorithm as SM-2 and a missing state as nothing', () => {
    expect(stateAlgorithm(legacy)).toBe('sm2');
    expect(stateAlgorithm(scheduleReview(undefined, 'good', fsrs, NOW))).toBe('fsrs');
    expect(stateAlgorithm(undefined)).toBeNull();
    expect(stateAlgorithm({ nonsense: true })).toBeNull();
  });
});

describe('scheduleReview under SM-2', () => {
  it('is byte-for-byte what the old hardcoded scheduler produced', () => {
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const seam = scheduleReview(undefined, rating, DEFAULT_SCHEDULING_CONFIG, NOW);
      const direct = scheduleLocalReview(undefined, rating, NOW);
      expect(seam).toEqual(direct);
    }
    const learned = scheduleReview(legacy, 'good', DEFAULT_SCHEDULING_CONFIG, NOW);
    expect(learned).toEqual(scheduleLocalReview(migrateSrsState(legacy), 'good', NOW));
  });

  it('honours the user interval ceiling on the due date, not only the label', () => {
    const capped: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, maximumIntervalDays: 5 };
    let state = scheduleReview(undefined, 'easy', capped, NOW);
    for (let i = 0; i < 6; i += 1) state = scheduleReview(state, 'easy', capped, state.dueAt);
    expect(state.intervalDays).toBe(5);
    expect(state.dueAt).toBe(state.lastReviewedAt + 5 * DAY_MS);
  });
});

describe('scheduleReview under FSRS', () => {
  it('records the memory pair and says which scheduler wrote it', () => {
    const state = scheduleReview(undefined, 'good', fsrs, NOW);
    expect(state.algorithm).toBe('fsrs');
    expect(state.version).toBe(2);
    expect(state.stability).toBeGreaterThan(0);
    expect(state.difficulty).toBeGreaterThanOrEqual(FSRS_MIN_DIFFICULTY);
    expect(isLocalSrsState(state)).toBe(true);
  });

  it('orders Hard < Good < Easy on a card with history', () => {
    const seen = scheduleReview(undefined, 'good', fsrs, NOW);
    const later = seen.dueAt;
    const hard = scheduleReview(seen, 'hard', fsrs, later).intervalDays;
    const good = scheduleReview(seen, 'good', fsrs, later).intervalDays;
    const easy = scheduleReview(seen, 'easy', fsrs, later).intervalDays;
    expect(hard).toBeLessThanOrEqual(good);
    expect(good).toBeLessThan(easy);
  });

  it('sends Again to the same ten-minute step as SM-2, and counts the lapse', () => {
    const seen = scheduleReview(undefined, 'good', fsrs, NOW);
    const lapsed = scheduleReview(seen, 'again', fsrs, seen.dueAt);
    expect(lapsed.intervalDays).toBe(0);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.dueAt - lapsed.lastReviewedAt).toBe(10 * 60 * 1000);
  });

  it('makes the retention setting actually shorten intervals', () => {
    const relaxed: SchedulingConfig = { ...fsrs, desiredRetention: 0.8 };
    const strict: SchedulingConfig = { ...fsrs, desiredRetention: 0.95 };
    let a = scheduleReview(undefined, 'good', relaxed, NOW);
    let b = scheduleReview(undefined, 'good', strict, NOW);
    for (let i = 0; i < 4; i += 1) {
      a = scheduleReview(a, 'good', relaxed, a.dueAt);
      b = scheduleReview(b, 'good', strict, b.dueAt);
    }
    expect(b.intervalDays).toBeLessThan(a.intervalDays);
  });

  it('grows a well-known card without ever exceeding the ceiling', () => {
    const capped: SchedulingConfig = { ...fsrs, maximumIntervalDays: 90 };
    let state = scheduleReview(undefined, 'easy', capped, NOW);
    for (let i = 0; i < 20; i += 1) state = scheduleReview(state, 'easy', capped, state.dueAt);
    expect(state.intervalDays).toBe(90);
    expect(state.dueAt).toBe(state.lastReviewedAt + 90 * DAY_MS);
  });
});

describe('switching algorithms', () => {
  it('REFUSAL: an SM-2 ease is never read as an FSRS difficulty', () => {
    const sm2 = scheduleReview(undefined, 'hard', DEFAULT_SCHEDULING_CONFIG, NOW);
    expect(sm2.ease).toBeLessThan(2.5);
    const adapted = adaptStateForAlgorithm(sm2, 'fsrs');
    expect(adapted?.algorithm).toBe('fsrs');
    // No memory was fabricated from the ease, so the next FSRS review treats
    // this as a first sighting instead of a card of difficulty 2.35.
    expect(adapted?.stability).toBeUndefined();
    expect(adapted?.difficulty).toBeUndefined();
    const next = scheduleReview(sm2, 'good', fsrs, NOW);
    expect(next.stability).toBe(fsrsInitialMemory(3).stability);
    // The user does not lose their place: counts and history carry over.
    expect(next.lapses).toBe(sm2.lapses);
  });

  it('drops the memory pair on the way back to SM-2', () => {
    const state = scheduleReview(undefined, 'good', fsrs, NOW);
    const back = adaptStateForAlgorithm(state, 'sm2');
    expect(back?.algorithm).toBe('sm2');
    expect(back?.stability).toBeUndefined();
    expect(back?.difficulty).toBeUndefined();
    expect(back?.ease).toBeGreaterThanOrEqual(1.3);
    expect(isLocalSrsState(back)).toBe(true);
  });

  it('leaves a state alone when the algorithm has not changed', () => {
    const state = scheduleReview(undefined, 'good', fsrs, NOW);
    expect(adaptStateForAlgorithm(state, 'fsrs')).toBe(state);
    expect(adaptStateForAlgorithm(undefined, 'fsrs')).toBeUndefined();
  });

  it('resets to an unseen card rather than to a zeroed schedule', () => {
    // Every reader in the app treats a missing schedule as new and due, so a
    // reset card must be indistinguishable from one never studied.
    expect(resetSrsState()).toBeUndefined();
  });
});

describe('previewSchedule', () => {
  it('shows all four buttons and never claims Again is a long wait', () => {
    for (const config of [DEFAULT_SCHEDULING_CONFIG, fsrs]) {
      const preview = previewSchedule(legacy, config, NOW);
      expect(Object.keys(preview).sort()).toEqual(['again', 'easy', 'good', 'hard']);
      expect(preview.again).toBe(0);
      expect(preview.easy).toBeGreaterThanOrEqual(preview.good);
      expect(preview.good).toBeGreaterThanOrEqual(preview.hard);
    }
  });

  it('predicts exactly what pressing the button then does', () => {
    const preview = previewSchedule(legacy, fsrs, NOW);
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const applied: LocalSrsState = scheduleReview(legacy, rating, fsrs, NOW);
      expect(applied.intervalDays).toBe(preview[rating]);
    }
  });
});
