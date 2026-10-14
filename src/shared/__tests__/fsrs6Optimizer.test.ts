/**
 * The optimiser fitting FSRS-6: twenty-one weights, the trainable decay (w20)
 * and the stability-dependent same-day term (w19), on synthetic logs drawn from
 * an FSRS-6 model whose true weights are known — the FSRS-5 suite's method
 * (`fsrsOptimizer.test.ts`) with the version FSRS-6 adds.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FSRS6_WEIGHTS,
  DEFAULT_FSRS_WEIGHTS,
  FSRS6_WEIGHT_BOUNDS,
  fsrsInitialMemory,
  fsrsInterval,
  fsrsRetrievability,
  fsrsReview,
  fsrsShortTermReview,
  isValidFsrsWeights,
  type FsrsGrade,
} from '../fsrs';
import {
  buildTrainingSequences,
  evaluateFsrsWeights,
  fsrsLossGradient,
  optimizeFsrsWeights,
  optimizeFsrsWithHoldout,
  type FsrsLogRow,
} from '../fsrsOptimizer';
import type { LocalSrsRating } from '../localSrs';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1, 12);

/** A learner who forgets along a much steeper curve than the population. */
const TRUE_WEIGHTS: number[] = (() => {
  const w = [...DEFAULT_FSRS6_WEIGHTS];
  w[2] = 3.1;
  w[8] = 1.6;
  w[19] = 0.2;
  w[20] = 0.45;
  return w;
})();

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const RATING: Record<FsrsGrade, LocalSrsRating> = { 1: 'again', 2: 'hard', 3: 'good', 4: 'easy' };

function synthLog(weights: readonly number[], cards: number, days: number, seed: number): FsrsLogRow[] {
  const random = rng(seed);
  const rows: FsrsLogRow[] = [];
  for (let c = 0; c < cards; c += 1) {
    const cardId = `card-${c}`;
    const u = random();
    const first: FsrsGrade = u < 0.15 ? 1 : u < 0.25 ? 2 : u < 0.9 ? 3 : 4;
    let memory = fsrsInitialMemory(first, weights);
    let day = Math.floor(random() * 20);
    rows.push({ cardId, at: T0 + day * DAY, rating: RATING[first], isNew: true });
    // A same-day second look, so the short-term terms have something to fit.
    if (random() < 0.5) {
      rows.push({ cardId, at: T0 + day * DAY + 10 * 60 * 1000, rating: 'good' });
      memory = fsrsShortTermReview(memory, 3, weights);
    }
    for (;;) {
      const interval = Math.max(1, Math.round(fsrsInterval(memory.stability, 0.9, weights) * (0.5 + random() * 1.2)));
      day += interval;
      if (day > days) break;
      const recalled = random() < fsrsRetrievability(memory.stability, interval, weights);
      let grade: FsrsGrade = 1;
      if (recalled) {
        const g = random();
        grade = g < 0.1 ? 2 : g < 0.93 ? 3 : 4;
      }
      rows.push({ cardId, at: T0 + day * DAY, rating: RATING[grade] });
      memory = fsrsReview(memory, grade, interval, weights);
      if (grade === 1) {
        rows.push({ cardId, at: T0 + day * DAY + 10 * 60 * 1000, rating: 'good' });
        memory = fsrsShortTermReview(memory, 3, weights);
      }
    }
  }
  return rows;
}

const LOG = synthLog(TRUE_WEIGHTS, 400, 360, 23);
const SEQUENCES = buildTrainingSequences(LOG);

describe('FSRS-6 gradient', () => {
  it('matches central finite differences on all twenty-one weights, the decay included', () => {
    const sample = SEQUENCES.slice(0, 50);
    const at = [...DEFAULT_FSRS6_WEIGHTS];
    const { gradient } = fsrsLossGradient(at, sample);
    expect(gradient).toHaveLength(21);
    for (let i = 0; i < at.length; i += 1) {
      const h = Math.max(1e-6, Math.abs(at[i]) * 1e-5);
      const up = [...at];
      const down = [...at];
      up[i] += h;
      down[i] -= h;
      const numeric = (evaluateFsrsWeights(up, sample).logLoss - evaluateFsrsWeights(down, sample).logLoss) / (2 * h);
      expect(gradient[i], `w${i}`).toBeCloseTo(numeric, 4);
    }
    // The decay matters on this log: its gradient is not zero.
    expect(Math.abs(gradient[20])).toBeGreaterThan(1e-4);
  });
});

describe('fitting FSRS-6', () => {
  const fit = optimizeFsrsWeights(SEQUENCES, { start: DEFAULT_FSRS6_WEIGHTS });

  it('fits twenty-one weights inside the FSRS-6 bounds, better than the defaults and close to the truth', () => {
    expect(fit.status).toBe('ok');
    expect(fit.improved).toBe(true);
    expect(fit.weights).toHaveLength(21);
    expect(isValidFsrsWeights(fit.weights)).toBe(true);
    fit.weights.forEach((w, i) => {
      expect(w).toBeGreaterThanOrEqual(FSRS6_WEIGHT_BOUNDS[i][0]);
      expect(w).toBeLessThanOrEqual(FSRS6_WEIGHT_BOUNDS[i][1]);
    });
    const truth = evaluateFsrsWeights(TRUE_WEIGHTS, SEQUENCES).logLoss;
    expect(fit.after.logLoss).toBeLessThan(truth + 0.01);
  });

  it('moves the decay toward the learner\'s steeper curve', () => {
    expect(fit.weights[20]).toBeGreaterThan(DEFAULT_FSRS6_WEIGHTS[20]);
  });

  it('is deterministic', () => {
    expect(optimizeFsrsWeights(SEQUENCES, { start: DEFAULT_FSRS6_WEIGHTS })).toEqual(fit);
  });

  it('a first FSRS-6 fit is judged against the FSRS-5 weights in use, on the same unseen reviews', () => {
    const entries = LOG.map((row) => ({ ...row, mode: 'review' }));
    const result = optimizeFsrsWithHoldout(entries, {
      start: DEFAULT_FSRS6_WEIGHTS,
      current: DEFAULT_FSRS_WEIGHTS,
      epochs: 3,
    });
    expect(result.status).toBe('ok');
    expect(result.improved).toBe(true);
    expect(result.weights).toHaveLength(21);
    expect(result.fitted.logLoss).toBeLessThan(result.current.logLoss);
  });
});
