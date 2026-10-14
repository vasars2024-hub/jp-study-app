/**
 * FSRS-6 against the reference implementations' own test data, the way
 * `fsrsReferenceVectors.test.ts` pins FSRS-5.
 *
 * Sources (the expected numbers are copied, not computed here):
 *
 * - fsrs-rs `src/inference_v6.rs`: `FSRS6_DEFAULT_PARAMETERS` (21 values, the
 *   decay w20 = `FSRS6_DEFAULT_DECAY` = 0.1542).
 * - py-fsrs 6 `tests/test_basic.py`:
 *   - `test_memo_state`: Again, then Good five times with 0, 1, 3, 8 and 21
 *     days between them, on the default parameters → S 53.62691, D 6.3574867
 *     (asserted there to 1e-4);
 *   - `test_review_card`: thirteen ratings (Good x6, Again x2, Good x5) with
 *     the default 1m/10m learning and 10m relearning steps, fuzz off, each
 *     answer given when the card falls due → intervals
 *     0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21 days;
 *   - `test_repeated_correct_reviews`: ten Easy answers moments apart leave
 *     difficulty at 1.
 *
 * The same values were also re-derived independently from the published
 * FSRS-6 equations before this file was written (a stand-alone script, not
 * this module) and agreed to 1e-7.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FSRS6_WEIGHTS,
  DEFAULT_FSRS_WEIGHTS,
  FSRS6_WEIGHT_BOUNDS,
  fsrsDecay,
  fsrsFactor,
  fsrsInterval,
  fsrsMemoryFromSm2,
  fsrsRetrievability,
  fsrsReview,
  fsrsShortTermReview,
  fsrsVersionOf,
  isValidFsrsWeights,
  upgradeFsrsWeights,
  type FsrsGrade,
  type FsrsMemory,
} from '../fsrs';
import { DEFAULT_SCHEDULING_CONFIG, scheduleReview, type SchedulingConfig } from '../flashcardScheduling';
import type { LocalSrsRating, LocalSrsState } from '../localSrs';

/** fsrs-rs `FSRS6_DEFAULT_PARAMETERS`, verbatim. */
const PUBLISHED_FSRS6_DEFAULTS = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835,
  0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912, 0.0658, 0.1542,
];

/** fsrs-rs `memory_state`: delta_t 0 after the first review is a short-term step. */
function memoryState(item: ReadonlyArray<[FsrsGrade, number]>, weights: readonly number[]): FsrsMemory {
  let memory: FsrsMemory | null = null;
  for (const [grade, deltaT] of item) {
    memory = memory && deltaT === 0
      ? fsrsShortTermReview(memory, grade, weights)
      : fsrsReview(memory, grade, deltaT, weights);
  }
  if (!memory) throw new Error('empty item');
  return memory;
}

describe('FSRS-6 defaults', () => {
  it('are fsrs-rs\'s twenty-one published parameters, in order, and valid', () => {
    expect([...DEFAULT_FSRS6_WEIGHTS]).toEqual(PUBLISHED_FSRS6_DEFAULTS);
    expect(fsrsVersionOf(DEFAULT_FSRS6_WEIGHTS)).toBe(6);
    expect(isValidFsrsWeights([...DEFAULT_FSRS6_WEIGHTS])).toBe(true);
    expect(FSRS6_WEIGHT_BOUNDS).toHaveLength(21);
  });

  it('read the decay from w20, and R(S, S) is still 0.9', () => {
    expect(fsrsDecay(DEFAULT_FSRS6_WEIGHTS)).toBe(-0.1542);
    expect(fsrsFactor(DEFAULT_FSRS6_WEIGHTS)).toBeCloseTo(0.9 ** (1 / -0.1542) - 1, 12);
    for (const s of [0.5, 3, 40, 900]) {
      expect(fsrsRetrievability(s, s, DEFAULT_FSRS6_WEIGHTS)).toBeCloseTo(0.9, 12);
      expect(fsrsInterval(s, 0.9, DEFAULT_FSRS6_WEIGHTS)).toBeCloseTo(s, 9);
    }
  });
});

describe('py-fsrs 6 reference vectors', () => {
  it('test_memo_state: 1/0, 3/0, 3/1, 3/3, 3/8, 3/21 → S 53.62691, D 6.3574867', () => {
    const memory = memoryState([[1, 0], [3, 0], [3, 1], [3, 3], [3, 8], [3, 21]], DEFAULT_FSRS6_WEIGHTS);
    expect(Math.abs(memory.stability - 53.62691)).toBeLessThan(1e-4);
    expect(Math.abs(memory.difficulty - 6.3574867)).toBeLessThan(1e-4);
  });

  it('test_review_card: the scheduler gives 0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21', () => {
    const config: SchedulingConfig = {
      ...DEFAULT_SCHEDULING_CONFIG,
      algorithm: 'fsrs',
      fsrsVersion: 6,
      learningStepsMinutes: [1, 10],
      relearningStepsMinutes: [10],
    };
    const ratings: LocalSrsRating[] = [
      'good', 'good', 'good', 'good', 'good', 'good', 'again', 'again', 'good', 'good', 'good', 'good', 'good',
    ];
    let state: LocalSrsState | undefined;
    let at = new Date(2022, 10, 29, 12, 30).getTime();
    const intervals: number[] = [];
    for (const rating of ratings) {
      state = scheduleReview(state, rating, config, at);
      intervals.push(state.intervalDays);
      // py-fsrs answers each card at its due time; a day card is due from its study day's start.
      at = state.dueAt;
    }
    expect(intervals).toEqual([0, 2, 11, 46, 163, 498, 0, 0, 2, 4, 7, 12, 21]);
  });

  it('test_repeated_correct_reviews: ten Easy answers moments apart take difficulty to 1', () => {
    let memory: FsrsMemory = fsrsReview(null, 4, 0, DEFAULT_FSRS6_WEIGHTS);
    for (let i = 1; i < 10; i += 1) memory = fsrsShortTermReview(memory, 4, DEFAULT_FSRS6_WEIGHTS);
    expect(memory.difficulty).toBe(1);
  });
});

describe('what FSRS-6 changes, and what it leaves alone', () => {
  it('a same-day Good or Easy never lowers stability; S^-w19 shrinks the gain of a stable card', () => {
    const w = DEFAULT_FSRS6_WEIGHTS;
    for (const s of [0.1, 2, 50, 3000]) {
      for (const grade of [3, 4] as FsrsGrade[]) {
        expect(fsrsShortTermReview({ stability: s, difficulty: 5 }, grade, w).stability).toBeGreaterThanOrEqual(s);
      }
    }
    const gain = (s: number) => fsrsShortTermReview({ stability: s, difficulty: 5 }, 4, w).stability / s;
    expect(gain(1)).toBeGreaterThan(gain(30));
  });

  it('nineteen weights still run FSRS-5 exactly (the FSRS-5 vectors are pinned elsewhere)', () => {
    expect(fsrsVersionOf(DEFAULT_FSRS_WEIGHTS)).toBe(5);
    expect(fsrsInterval(10, 0.9)).toBeCloseTo(10, 12);
    expect(fsrsInterval(10, 0.85)).toBe(fsrsInterval(10, 0.85, DEFAULT_FSRS_WEIGHTS));
  });

  it('an FSRS-5 fit carried over to FSRS-6 (w19 = 0, decay 0.5) schedules as FSRS-5 did', () => {
    const up = upgradeFsrsWeights(DEFAULT_FSRS_WEIGHTS);
    expect(up).toHaveLength(21);
    expect(up.slice(19)).toEqual([0, 0.5]);
    expect(isValidFsrsWeights(up)).toBe(true);
    const item: Array<[FsrsGrade, number]> = [[1, 0], [3, 0], [3, 1], [2, 3], [3, 8], [1, 21], [3, 0], [4, 5]];
    const five = memoryState(item, DEFAULT_FSRS_WEIGHTS);
    const six = memoryState(item, up);
    expect(six.stability).toBeCloseTo(five.stability, 9);
    expect(six.difficulty).toBeCloseTo(five.difficulty, 9);
    for (const r of [0.8, 0.9, 0.95]) expect(fsrsInterval(five.stability, r, up)).toBeCloseTo(fsrsInterval(five.stability, r), 9);
    expect(fsrsMemoryFromSm2(2.5, 10, 0.9, up).stability).toBeCloseTo(fsrsMemoryFromSm2(2.5, 10).stability, 9);
  });

  it('the fitted decay reshapes the curve: a flatter forgetting curve waits longer for the same retention', () => {
    const steep = [...DEFAULT_FSRS6_WEIGHTS.slice(0, 20), 0.6];
    const flat = [...DEFAULT_FSRS6_WEIGHTS.slice(0, 20), 0.15];
    // Below 90% the flatter curve takes longer to fall to the target.
    expect(fsrsInterval(10, 0.8, flat)).toBeGreaterThan(fsrsInterval(10, 0.8, steep));
    expect(fsrsRetrievability(10, 30, flat)).toBeGreaterThan(fsrsRetrievability(10, 30, steep));
  });
});
