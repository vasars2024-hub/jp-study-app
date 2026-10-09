/**
 * Same-day learning and relearning steps, interval fuzz / load balancing and
 * leech points — the scheduling math, on a fixed clock.
 *
 * The defaults are pinned first: no learning steps and one ten-minute
 * relearning step, which is the schedule this app always had, so an upgrade
 * moves nobody's deck. Everything after that is a configured deck.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SCHEDULING_CONFIG,
  isLeechLapse,
  normalizeSchedulingConfig,
  previewSchedule,
  previewScheduleDelays,
  scheduleReview,
  type SchedulingConfig,
} from '../flashcardScheduling';
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInitialMemory,
  fsrsInterval,
  fsrsShortTermReview,
  isValidFsrsWeights,
} from '../fsrs';
import {
  ANKI_DEFAULT_LEARNING_STEPS,
  formatStepList,
  isInSteps,
  normalizeSteps,
  parseStepList,
  stepTransition,
} from '../learningSteps';
import { isLocalSrsState, scheduleLocalReview } from '../localSrs';
import { fuzzBounds, fuzzedInterval, seededUnit } from '../srsFuzz';

const NOW = Date.UTC(2026, 9, 8, 9);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

const sm2Steps: SchedulingConfig = {
  ...DEFAULT_SCHEDULING_CONFIG,
  learningStepsMinutes: [...ANKI_DEFAULT_LEARNING_STEPS],
};
const fsrsSteps: SchedulingConfig = { ...sm2Steps, algorithm: 'fsrs' };

describe('step lists', () => {
  it('parses Anki notation and refuses typos instead of dropping a step', () => {
    expect(parseStepList('1m 10m')).toEqual([1, 10]);
    expect(parseStepList('30s, 1h 1d')).toEqual([0.5, 60, 1440]);
    expect(parseStepList('5')).toEqual([5]);
    expect(parseStepList('')).toEqual([]);
    expect(parseStepList('1m tenm')).toBeNull();
    expect(parseStepList('0m')).toBeNull();
    expect(parseStepList('31d')).toBeNull();
  });

  it('formats back in the largest whole unit', () => {
    expect(formatStepList([1, 10, 60, 1440, 0.5])).toBe('1m 10m 1h 1d 30s');
    expect(parseStepList(formatStepList([1, 10, 90]))).toEqual([1, 10, 90]);
  });

  it('normalizes stored lists and falls back on garbage', () => {
    expect(normalizeSteps([1, 10], [10])).toEqual([1, 10]);
    expect(normalizeSteps('1m', [10])).toEqual([10]);
    expect(normalizeSteps([1, -3], [10])).toEqual([10]);
    expect(normalizeSteps([], [10])).toEqual([]);
  });

  it('follows the Anki v3 transitions', () => {
    const steps = [1, 10];
    expect(stepTransition(steps, 0, 'again')).toEqual({ kind: 'step', step: 0, delayMinutes: 1 });
    expect(stepTransition(steps, 1, 'again')).toEqual({ kind: 'step', step: 0, delayMinutes: 1 });
    // Hard on the first step: the average of the first two.
    expect(stepTransition(steps, 0, 'hard')).toEqual({ kind: 'step', step: 0, delayMinutes: 5.5 });
    expect(stepTransition(steps, 1, 'hard')).toEqual({ kind: 'step', step: 1, delayMinutes: 10 });
    // Hard on a lone step: 1.5x.
    expect(stepTransition([10], 0, 'hard')).toEqual({ kind: 'step', step: 0, delayMinutes: 15 });
    expect(stepTransition(steps, 0, 'good')).toEqual({ kind: 'step', step: 1, delayMinutes: 10 });
    expect(stepTransition(steps, 1, 'good')).toEqual({ kind: 'graduate', easy: false });
    expect(stepTransition(steps, 0, 'easy')).toEqual({ kind: 'graduate', easy: true });
  });
});

describe('defaults keep the old schedule', () => {
  it('has no learning steps and one ten-minute relearning step', () => {
    expect(DEFAULT_SCHEDULING_CONFIG.learningStepsMinutes).toEqual([]);
    expect(DEFAULT_SCHEDULING_CONFIG.relearningStepsMinutes).toEqual([10]);
    expect(DEFAULT_SCHEDULING_CONFIG.fuzz).toBe(false);
    for (const rating of ['again', 'hard', 'good', 'easy'] as const) {
      const direct = scheduleLocalReview(undefined, rating, NOW);
      // Same schedule; only the new-card Again is no longer counted as a lapse (Anki's rule).
      expect(scheduleReview(undefined, rating, DEFAULT_SCHEDULING_CONFIG, NOW))
        .toEqual(rating === 'again' ? { ...direct, lapses: 0 } : direct);
    }
  });

  it('a lapse is still a ten-minute step, then one day on Good', () => {
    const learned = scheduleReview(scheduleReview(undefined, 'good', undefined, NOW), 'good', undefined, NOW + DAY);
    const lapsed = scheduleReview(learned, 'again', undefined, NOW + 4 * DAY);
    expect(lapsed.phase).toBe('relearning');
    expect(lapsed.dueAt - lapsed.lastReviewedAt).toBe(10 * MIN);
    expect(lapsed.lapses).toBe(1);
    const back = scheduleReview(lapsed, 'good', undefined, lapsed.dueAt);
    expect(back.phase).toBeUndefined();
    expect(back.step).toBeUndefined();
    expect(back.intervalDays).toBe(1);
  });
});

describe('SM-2 with learning steps 1m 10m', () => {
  it('walks a new card through both steps before it graduates to one day', () => {
    const first = scheduleReview(undefined, 'good', sm2Steps, NOW);
    expect(first).toMatchObject({ phase: 'learning', step: 1, intervalDays: 0, dueAt: NOW + 10 * MIN, lapses: 0 });
    expect(isLocalSrsState(first)).toBe(true);
    const graduated = scheduleReview(first, 'good', sm2Steps, first.dueAt);
    expect(graduated.phase).toBeUndefined();
    expect(graduated.intervalDays).toBe(1);
    expect(graduated.dueAt).toBe(first.dueAt + DAY);
  });

  it('Again restarts at one minute without counting a lapse on a new card', () => {
    const again = scheduleReview(undefined, 'again', sm2Steps, NOW);
    expect(again).toMatchObject({ phase: 'learning', step: 0, dueAt: NOW + MIN, lapses: 0 });
    const hard = scheduleReview(again, 'hard', sm2Steps, again.dueAt);
    expect(hard.dueAt - hard.lastReviewedAt).toBe(5.5 * MIN);
  });

  it('Easy graduates straight to the four-day easy interval', () => {
    const easy = scheduleReview(undefined, 'easy', sm2Steps, NOW);
    expect(easy.phase).toBeUndefined();
    expect(easy.intervalDays).toBe(4);
  });

  it('Again inside relearning neither counts a second lapse nor lowers ease twice', () => {
    const learned = scheduleReview(undefined, 'easy', sm2Steps, NOW);
    const lapsed = scheduleReview(learned, 'again', sm2Steps, NOW + 4 * DAY);
    const again = scheduleReview(lapsed, 'again', sm2Steps, lapsed.dueAt);
    expect(again.lapses).toBe(lapsed.lapses);
    expect(again.ease).toBe(lapsed.ease);
    expect(again.phase).toBe('relearning');
  });

  it('with no relearning steps a lapse goes straight to a one-day interval', () => {
    const none: SchedulingConfig = { ...sm2Steps, relearningStepsMinutes: [] };
    const learned = scheduleReview(undefined, 'easy', none, NOW);
    const lapsed = scheduleReview(learned, 'again', none, NOW + 4 * DAY);
    expect(lapsed.phase).toBeUndefined();
    expect(lapsed.intervalDays).toBe(1);
    expect(lapsed.lapses).toBe(1);
  });

  it('previews the step delays the buttons will actually produce', () => {
    const delays = previewScheduleDelays(undefined, sm2Steps, NOW);
    expect(delays.again * 24 * 60).toBeCloseTo(1, 6);
    expect(delays.hard * 24 * 60).toBeCloseTo(5.5, 6);
    expect(delays.good * 24 * 60).toBeCloseTo(10, 6);
    expect(delays.easy).toBe(4);
    // The interval preview still reads 0 for a step: it is not a day-scale interval.
    expect(previewSchedule(undefined, sm2Steps, NOW).good).toBe(0);
  });
});

describe('FSRS with learning steps', () => {
  it('uses the FSRS-5 short-term formula for a same-day step', () => {
    const memory = fsrsInitialMemory(3);
    const next = fsrsShortTermReview(memory, 3);
    const w = DEFAULT_FSRS_WEIGHTS;
    expect(next.stability).toBeCloseTo(memory.stability * Math.exp(w[17] * w[18]), 10);
    const lower = fsrsShortTermReview(memory, 1);
    expect(lower.stability).toBeLessThan(memory.stability);
    expect(lower.difficulty).toBeGreaterThan(memory.difficulty);
  });

  it('graduates from the steps with an interval from the short-term stability', () => {
    const first = scheduleReview(undefined, 'good', fsrsSteps, NOW);
    expect(first).toMatchObject({ phase: 'learning', step: 1, algorithm: 'fsrs', dueAt: NOW + 10 * MIN });
    expect(first.stability).toBeCloseTo(fsrsInitialMemory(3).stability, 10);
    const graduated = scheduleReview(first, 'good', fsrsSteps, first.dueAt);
    const expectedS = fsrsShortTermReview(fsrsInitialMemory(3), 3).stability;
    expect(graduated.phase).toBeUndefined();
    expect(graduated.stability).toBeCloseTo(expectedS, 10);
    expect(graduated.intervalDays).toBe(Math.max(1, Math.round(fsrsInterval(expectedS, 0.9))));
  });

  it('a review lapse enters relearning and counts exactly one lapse', () => {
    const seen = scheduleReview(undefined, 'easy', fsrsSteps, NOW);
    const lapsed = scheduleReview(seen, 'again', fsrsSteps, seen.dueAt);
    expect(lapsed).toMatchObject({ phase: 'relearning', step: 0, lapses: 1, intervalDays: 0 });
    expect(lapsed.dueAt - lapsed.lastReviewedAt).toBe(10 * MIN);
    expect(lapsed.stability).toBeLessThan(seen.stability ?? 0);
    const relearned = scheduleReview(lapsed, 'good', fsrsSteps, lapsed.dueAt);
    expect(relearned.phase).toBeUndefined();
    expect(relearned.lapses).toBe(1);
    expect(relearned.intervalDays).toBeGreaterThanOrEqual(1);
  });

  it('uses a personal weight fit when one is configured', () => {
    const custom = [...DEFAULT_FSRS_WEIGHTS];
    custom[2] = 9;
    const withFit = normalizeSchedulingConfig({ ...DEFAULT_SCHEDULING_CONFIG, algorithm: 'fsrs', fsrsWeights: custom });
    expect(withFit.fsrsWeights).toEqual(custom);
    expect(scheduleReview(undefined, 'good', withFit, NOW).stability).toBe(9);
    // An out-of-range fit is refused rather than trusted.
    const broken = [...custom];
    broken[7] = 3;
    expect(isValidFsrsWeights(broken)).toBe(false);
    expect(normalizeSchedulingConfig({ fsrsWeights: broken }).fsrsWeights).toBeUndefined();
  });
});

describe('fuzz and load balancing', () => {
  it('uses Anki’s fuzz ranges and leaves short intervals alone', () => {
    expect(fuzzBounds(1)).toEqual([1, 1]);
    expect(fuzzBounds(2)).toEqual([2, 2]);
    // 10 days: 1 + 0.15 * 4.5 + 0.1 * 3 = 1.975 → [8, 12]
    expect(fuzzBounds(10)).toEqual([8, 12]);
    // 100 days: 1 + 0.675 + 1.3 + 0.05 * 80 = 6.975 → [93, 107]
    expect(fuzzBounds(100)).toEqual([93, 107]);
    expect(fuzzBounds(100, 100)).toEqual([93, 100]);
  });

  it('is deterministic for one seed and spreads across seeds', () => {
    expect(seededUnit('card-1:1')).toBe(seededUnit('card-1:1'));
    const picks = new Set<number>();
    for (let i = 0; i < 40; i += 1) picks.add(fuzzedInterval(100, { seed: `card-${i}` }));
    expect(picks.size).toBeGreaterThan(5);
    for (const pick of picks) {
      expect(pick).toBeGreaterThanOrEqual(93);
      expect(pick).toBeLessThanOrEqual(107);
    }
  });

  it('load balancing picks the least-loaded day in the range', () => {
    const load = (day: number): number => (day === 11 ? 0 : 50);
    expect(fuzzedInterval(10, { seed: 'x', dueLoad: load })).toBe(11);
  });

  it('applies only when enabled and given a card identity; previews stay unfuzzed', () => {
    const on: SchedulingConfig = { ...DEFAULT_SCHEDULING_CONFIG, fuzz: true };
    let state = scheduleReview(undefined, 'easy', on, NOW);
    for (let i = 0; i < 4; i += 1) state = scheduleReview(state, 'good', on, state.dueAt);
    const plain = scheduleReview(state, 'good', on, state.dueAt);
    const fuzzed = scheduleReview(state, 'good', on, state.dueAt, { fuzzKey: 'card-a', dueLoad: () => 0 });
    const [low, high] = fuzzBounds(plain.intervalDays);
    expect(fuzzed.intervalDays).toBeGreaterThanOrEqual(low);
    expect(fuzzed.intervalDays).toBeLessThanOrEqual(high);
    expect(fuzzed.dueAt).toBe(state.dueAt + fuzzed.intervalDays * DAY);
    const off = scheduleReview(state, 'good', DEFAULT_SCHEDULING_CONFIG, state.dueAt, { fuzzKey: 'card-a' });
    expect(off.intervalDays).toBe(plain.intervalDays);
    expect(previewSchedule(state, on, state.dueAt).good).toBe(plain.intervalDays);
  });

  it('never fuzzes a card that is still inside its steps', () => {
    const on: SchedulingConfig = { ...sm2Steps, fuzz: true };
    const step = scheduleReview(undefined, 'good', on, NOW, { fuzzKey: 'c' });
    expect(step.dueAt).toBe(NOW + 10 * MIN);
  });
});

describe('leech points', () => {
  it('fires at the threshold and every half-threshold after', () => {
    expect(isLeechLapse(7, 8)).toBe(false);
    expect(isLeechLapse(8, 8)).toBe(true);
    expect(isLeechLapse(9, 8)).toBe(false);
    expect(isLeechLapse(12, 8)).toBe(true);
    expect(isLeechLapse(16, 8)).toBe(true);
    expect(isLeechLapse(5, 5)).toBe(true);
    expect(isLeechLapse(8, 5)).toBe(true);
  });

  it('normalizes the leech settings', () => {
    expect(normalizeSchedulingConfig({ leechThreshold: 1 }).leechThreshold).toBe(8);
    expect(normalizeSchedulingConfig({ leechThreshold: 4.7 }).leechThreshold).toBe(4);
    expect(normalizeSchedulingConfig({ leechAction: 'suspend' }).leechAction).toBe('suspend');
    expect(normalizeSchedulingConfig({ leechAction: 'delete' as never }).leechAction).toBe('tag');
  });
});

describe('state shape', () => {
  it('accepts in-step states and refuses a nonsense phase', () => {
    const step = scheduleReview(undefined, 'good', sm2Steps, NOW);
    expect(isInSteps(step)).toBe(true);
    expect(isLocalSrsState({ ...step, phase: 'limbo' })).toBe(false);
    expect(isLocalSrsState({ ...step, step: -1 })).toBe(false);
  });
});
