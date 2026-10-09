/**
 * FSRS-5, the memory model, with nothing around it.
 *
 * Pure arithmetic over three numbers — stability, difficulty, retrievability —
 * so it tests without a deck, a store or a clock. The scheduler that decides
 * what to do with an interval lives in `flashcardScheduling.ts`; this file only
 * answers "how long until recall falls to the retention you asked for".
 *
 * Why this and not more SM-2 tuning: SM-2 multiplies an interval by an ease
 * factor and has no notion of how likely the user is to remember. FSRS models
 * that probability directly, which is what makes a desired-retention setting
 * mean anything at all — at 0.95 the user is asked more often because the model
 * says recall has fallen to 95%, not because a constant was made smaller.
 *
 * Both halves of FSRS-5 are here: the long-term step (`fsrsReview`) for a
 * review a day or more after the last one, and the short-term step
 * (`fsrsShortTermReview`, weights 17 and 18) for a same-day review inside
 * learning or relearning steps. Which one applies is the scheduler's decision.
 *
 * The weights default to FSRS-5's published population prior. A personal fit
 * comes from `fsrsOptimizer.ts`, fitted on the user's own review log, and is
 * passed in as `weights`; `isValidFsrsWeights` is the gate it goes through.
 */

/** Again / Hard / Good / Easy as the model numbers them. */
export type FsrsGrade = 1 | 2 | 3 | 4;

export interface FsrsMemory {
  /** Days at which recall probability has fallen to 90%. Always > 0. */
  stability: number;
  /** How hard this card is for this user, 1 (easiest) to 10 (hardest). */
  difficulty: number;
}

/** The published FSRS-5 defaults. Nineteen of them, order is load-bearing. */
export const DEFAULT_FSRS_WEIGHTS: readonly number[] = [
  0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
  0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898, 0.51655, 0.6621,
];

/**
 * The range each weight may take, as fsrs-rs clamps them for FSRS-5. The
 * optimiser projects onto these after every step, and a stored personal fit
 * outside them is refused rather than trusted.
 */
export const FSRS_WEIGHT_BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [0.01, 100], [0.01, 100], [0.01, 100], [0.01, 100],
  [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75],
  [0, 4.5], [0, 0.8], [0.001, 3.5], [0.001, 5],
  [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1],
  [1, 6], [0, 2], [0, 2],
];

/** Nineteen finite weights, each inside its FSRS-5 bound. */
export function isValidFsrsWeights(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length !== DEFAULT_FSRS_WEIGHTS.length) return false;
  return value.every((w, i) => {
    const [low, high] = FSRS_WEIGHT_BOUNDS[i];
    return typeof w === 'number' && Number.isFinite(w) && w >= low && w <= high;
  });
}

export const FSRS_DECAY = -0.5;
/** 0.9^(1/DECAY) - 1, i.e. the constant that makes R(S, S) = 0.9. */
export const FSRS_FACTOR = 19 / 81;

export const FSRS_MIN_STABILITY = 0.01;
export const FSRS_MAX_STABILITY = 36_500;
export const FSRS_MIN_DIFFICULTY = 1;
export const FSRS_MAX_DIFFICULTY = 10;

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

function clampStability(value: number): number {
  return clamp(value, FSRS_MIN_STABILITY, FSRS_MAX_STABILITY);
}

function clampDifficulty(value: number): number {
  return clamp(value, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
}

/**
 * Probability of recall after `elapsedDays` on a card of this stability.
 *
 * At `elapsedDays === stability` this is 0.9 by construction, which is what
 * makes stability readable as "days until 90% recall".
 */
export function fsrsRetrievability(stability: number, elapsedDays: number): number {
  const s = clampStability(stability);
  const t = Math.max(0, elapsedDays);
  return (1 + FSRS_FACTOR * (t / s)) ** FSRS_DECAY;
}

/**
 * How many days until recall falls to `desiredRetention`.
 *
 * The inverse of `fsrsRetrievability`. Higher retention means a shorter answer:
 * asking to remember 95% of the time means being asked sooner than 90%.
 */
export function fsrsInterval(stability: number, desiredRetention: number): number {
  const s = clampStability(stability);
  const r = clamp(desiredRetention, 0.5, 0.999);
  return (s / FSRS_FACTOR) * (r ** (1 / FSRS_DECAY) - 1);
}

/** A card seen for the first time, rated `grade`. */
export function fsrsInitialMemory(
  grade: FsrsGrade,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  const w = weights;
  return {
    stability: clampStability(w[grade - 1]),
    difficulty: clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1),
  };
}

/**
 * Difficulty after a review.
 *
 * Two stages, both from FSRS-5: the rating moves difficulty, damped so a card
 * already at the ceiling barely moves; then the result reverts a little toward
 * the difficulty a brand-new Easy card would have, so a single bad day cannot
 * permanently condemn a card.
 */
function nextDifficulty(
  difficulty: number,
  grade: FsrsGrade,
  weights: readonly number[],
): number {
  const w = weights;
  const delta = -w[6] * (grade - 3);
  const damped = difficulty + delta * ((FSRS_MAX_DIFFICULTY - difficulty) / 9);
  const easyInitial = w[4] - Math.exp(w[5] * 3) + 1;
  return clampDifficulty(w[7] * easyInitial + (1 - w[7]) * damped);
}

/** Stability after a successful recall (Hard, Good or Easy). */
function stabilityOnRecall(
  memory: FsrsMemory,
  retrievability: number,
  grade: FsrsGrade,
  weights: readonly number[],
): number {
  const w = weights;
  const hardPenalty = grade === 2 ? w[15] : 1;
  const easyBonus = grade === 4 ? w[16] : 1;
  const growth = 1
    + Math.exp(w[8])
      * (11 - memory.difficulty)
      * memory.stability ** -w[9]
      * (Math.exp(w[10] * (1 - retrievability)) - 1)
      * hardPenalty
      * easyBonus;
  return clampStability(memory.stability * growth);
}

/**
 * Stability after a lapse.
 *
 * Never above the stability the card already had: forgetting a card cannot be
 * what makes the app wait longer to ask it again. FSRS-5 caps it a little
 * lower still, at `S / e^(w17 * w18)` — the stability a same-day Good would
 * have to multiply back up to the old one.
 */
function stabilityOnLapse(
  memory: FsrsMemory,
  retrievability: number,
  weights: readonly number[],
): number {
  const w = weights;
  const lapsed = w[11]
    * memory.difficulty ** -w[12]
    * ((memory.stability + 1) ** w[13] - 1)
    * Math.exp(w[14] * (1 - retrievability));
  const ceiling = memory.stability / Math.exp(w[17] * w[18]);
  return clampStability(Math.min(lapsed, ceiling));
}

/**
 * The FSRS-5 short-term step: a review on the same day as the last one, inside
 * learning or relearning steps. Stability is scaled by `e^(w17 * (G - 3 + w18))`
 * — Good on a step grows it, Again shrinks it — and difficulty moves exactly as
 * it does on a long-term review.
 */
export function fsrsShortTermReview(
  memory: FsrsMemory,
  grade: FsrsGrade,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  const w = weights;
  const current: FsrsMemory = {
    stability: clampStability(memory.stability),
    difficulty: clampDifficulty(memory.difficulty),
  };
  return {
    stability: clampStability(current.stability * Math.exp(w[17] * (grade - 3 + w[18]))),
    difficulty: nextDifficulty(current.difficulty, grade, w),
  };
}

/**
 * The whole step: memory in, rating and elapsed time in, memory out.
 *
 * `memory` is `null` for a card the model has not seen, which is not the same
 * as a card with low stability — a new card has no history to update.
 */
export function fsrsReview(
  memory: FsrsMemory | null,
  grade: FsrsGrade,
  elapsedDays: number,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  if (!memory) return fsrsInitialMemory(grade, weights);
  const current: FsrsMemory = {
    stability: clampStability(memory.stability),
    difficulty: clampDifficulty(memory.difficulty),
  };
  const retrievability = fsrsRetrievability(current.stability, elapsedDays);
  const difficulty = nextDifficulty(current.difficulty, grade, weights);
  const stability = grade === 1
    ? stabilityOnLapse(current, retrievability, weights)
    : stabilityOnRecall(current, retrievability, grade, weights);
  return { stability, difficulty };
}
