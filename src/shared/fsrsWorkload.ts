/**
 * What a desired-retention setting costs, before the user commits to it.
 *
 * Two estimates, both deterministic:
 *
 * - `simulateRetentionWorkload` follows a population of new cards through a
 *   year under FSRS at one retention: each review succeeds with the model's own
 *   recall probability (seeded, so the answer never wobbles), a lapse costs a
 *   relearning review, and the result is reviews per card per year plus the
 *   recall probability averaged over the year. Comparing two retentions gives the "about
 *   1.4x the reviews" figure the settings panel shows.
 * - `dailyReviewRate` is the deck as it stands today: each scheduled FSRS card
 *   comes back about once per interval, so the sum of `1 / interval` is the
 *   steady daily load at its current memory states.
 */
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInitialMemory,
  fsrsInterval,
  fsrsRetrievability,
  fsrsReview,
  fsrsShortTermReview,
} from './fsrs';

export interface RetentionWorkload {
  retention: number;
  /** Expected reviews (relearning included) per new card over the horizon. */
  reviewsPerCard: number;
  /** Recall probability averaged over every day of the horizon and every card. */
  averageRecall: number;
}

export interface WorkloadOptions {
  weights?: readonly number[];
  horizonDays?: number;
  cards?: number;
  seed?: number;
  maximumIntervalDays?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), a | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulateRetentionWorkload(
  retention: number,
  options: WorkloadOptions = {},
): RetentionWorkload {
  const weights = options.weights ?? DEFAULT_FSRS_WEIGHTS;
  const horizon = Math.max(30, Math.floor(options.horizonDays ?? 365));
  const cards = Math.max(50, Math.floor(options.cards ?? 400));
  const ceiling = Math.max(1, Math.floor(options.maximumIntervalDays ?? 36_500));
  // The same seed for every retention: the curves differ by the setting, not by luck.
  const random = mulberry32(options.seed ?? 7);
  let reviews = 0;
  let recall = 0;
  for (let c = 0; c < cards; c += 1) {
    let memory = fsrsInitialMemory(3, weights);
    reviews += 1;
    let day = 0;
    for (;;) {
      const interval = Math.min(ceiling, Math.max(1, Math.round(fsrsInterval(memory.stability, retention))));
      const span = Math.min(interval, horizon - day);
      for (let d = 1; d <= span; d += 1) recall += fsrsRetrievability(memory.stability, d);
      if (day + interval > horizon) break;
      day += interval;
      reviews += 1;
      const r = fsrsRetrievability(memory.stability, interval);
      if (random() < r) {
        memory = fsrsReview(memory, 3, interval, weights);
      } else {
        memory = fsrsReview(memory, 1, interval, weights);
        // The relearning step the lapse costs, answered Good the same day.
        reviews += 1;
        memory = fsrsShortTermReview(memory, 3, weights);
      }
    }
  }
  return { retention, reviewsPerCard: reviews / cards, averageRecall: recall / (cards * horizon) };
}

/** The workload curve over a range of retentions, e.g. 0.70 .. 0.97. */
export function retentionWorkloadCurve(
  retentions: readonly number[],
  options: WorkloadOptions = {},
): RetentionWorkload[] {
  return retentions.map((r) => simulateRetentionWorkload(r, options));
}

/** Reviews per day the deck's FSRS cards would ask for at `retention`, today. */
export function dailyReviewRate(
  stabilities: readonly number[],
  retention: number,
  maximumIntervalDays = 36_500,
): number {
  let rate = 0;
  for (const s of stabilities) {
    if (!Number.isFinite(s) || s <= 0) continue;
    rate += 1 / Math.min(maximumIntervalDays, Math.max(1, fsrsInterval(s, retention)));
  }
  return rate;
}
