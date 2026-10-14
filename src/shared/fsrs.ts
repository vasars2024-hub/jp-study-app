/**
 * FSRS-5 and FSRS-6, the memory model, with nothing around it.
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
 * Both halves of FSRS are here: the long-term step (`fsrsReview`) for a
 * review a day or more after the last one, and the short-term step
 * (`fsrsShortTermReview`, weights 17 and 18) for a same-day review inside
 * learning or relearning steps. Which one applies is the scheduler's decision.
 *
 * The weights default to FSRS-5's published population prior. A personal fit
 * comes from `fsrsOptimizer.ts`, fitted on the user's own review log, and is
 * passed in as `weights`; `isValidFsrsWeights` is the gate it goes through.
 *
 * FSRS-6 (Anki 25.02+, fsrs-rs 2+) is the same model with two more weights:
 * w19 makes the same-day step shrink as stability grows (`S^-w19`, and a Good
 * or Easy step never lowers stability), and w20 is a trainable decay, so the
 * shape of the forgetting curve is fitted instead of fixed at -0.5. Which model
 * runs is decided by the weights themselves — nineteen are FSRS-5, twenty-one
 * are FSRS-6, the rule Anki applies — so every function here takes the version
 * from what it is handed, and nineteen weights run exactly the FSRS-5 maths
 * they always did.
 */

/** Again / Hard / Good / Easy as the model numbers them. */
export type FsrsGrade = 1 | 2 | 3 | 4;

/** Which FSRS: nineteen weights are FSRS-5, twenty-one are FSRS-6. */
export type FsrsVersion = 5 | 6;

export const FSRS5_WEIGHT_COUNT = 19;
export const FSRS6_WEIGHT_COUNT = 21;

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
 * The published FSRS-6 defaults (fsrs-rs `FSRS6_DEFAULT_PARAMETERS`, py-fsrs
 * 6's `DEFAULT_PARAMETERS`). Twenty-one; w20 is the decay, 0.1542.
 */
export const DEFAULT_FSRS6_WEIGHTS: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722,
  0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729, 0.5425, 0.0912,
  0.0658, 0.1542,
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

/**
 * fsrs-rs's FSRS-6 clamps: the FSRS-5 ranges with the initial stabilities
 * allowed down to 0.001, w19 in [0, 0.8] and the decay w20 in [0.1, 0.8].
 * (fsrs-rs tightens w17/w18 further for presets with several relearning
 * steps; 2 is its ceiling for one step, which is the bound kept here.)
 */
export const FSRS6_WEIGHT_BOUNDS: ReadonlyArray<readonly [number, number]> = [
  [0.001, 100], [0.001, 100], [0.001, 100], [0.001, 100],
  [1, 10], [0.001, 4], [0.001, 4], [0.001, 0.75],
  [0, 4.5], [0, 0.8], [0.001, 3.5], [0.001, 5],
  [0.001, 0.25], [0.001, 0.9], [0, 4], [0, 1],
  [1, 6], [0, 2], [0, 2], [0, 0.8], [0.1, 0.8],
];

/** The model a weight vector runs: twenty-one weights are FSRS-6, anything else FSRS-5. */
export function fsrsVersionOf(weights: readonly number[]): FsrsVersion {
  return weights.length === FSRS6_WEIGHT_COUNT ? 6 : 5;
}

/** The published population prior of one version. */
export function defaultFsrsWeights(version: FsrsVersion): readonly number[] {
  return version === 6 ? DEFAULT_FSRS6_WEIGHTS : DEFAULT_FSRS_WEIGHTS;
}

/** The clamp ranges of one version. */
export function fsrsWeightBounds(version: FsrsVersion): ReadonlyArray<readonly [number, number]> {
  return version === 6 ? FSRS6_WEIGHT_BOUNDS : FSRS_WEIGHT_BOUNDS;
}

/**
 * Nineteen finite weights inside the FSRS-5 bounds, or twenty-one inside the
 * FSRS-6 bounds.
 */
export function isValidFsrsWeights(value: unknown): value is number[] {
  if (!Array.isArray(value)) return false;
  if (value.length !== FSRS5_WEIGHT_COUNT && value.length !== FSRS6_WEIGHT_COUNT) return false;
  const bounds = fsrsWeightBounds(fsrsVersionOf(value));
  return value.every((w, i) => {
    const [low, high] = bounds[i];
    return typeof w === 'number' && Number.isFinite(w) && w >= low && w <= high;
  });
}

/**
 * FSRS-5 weights as the FSRS-6 weights that schedule the same way: w19 = 0 (no
 * stability-dependent same-day term) and FSRS-5's decay of 0.5. This is how
 * Anki carries an FSRS-5 fit over to FSRS-6 until the user optimises again.
 * FSRS-6 weights come back unchanged.
 */
export function upgradeFsrsWeights(weights: readonly number[]): number[] {
  if (weights.length === FSRS6_WEIGHT_COUNT) return [...weights];
  return [...weights.slice(0, FSRS5_WEIGHT_COUNT), 0, 0.5];
}

/** Project weights onto their version's bounds (for a vector read from another app). */
export function clampFsrsWeights(weights: readonly number[]): number[] {
  const bounds = fsrsWeightBounds(fsrsVersionOf(weights));
  return weights.map((w, i) => Math.min(bounds[i][1], Math.max(bounds[i][0], w)));
}

export const FSRS_DECAY = -0.5;
/** 0.9^(1/DECAY) - 1, i.e. the constant that makes R(S, S) = 0.9. */
export const FSRS_FACTOR = 19 / 81;

export const FSRS_MIN_STABILITY = 0.01;
/** FSRS-6's floor (fsrs-rs `S_MIN`). FSRS-5 keeps its own 0.01. */
export const FSRS6_MIN_STABILITY = 0.001;
export const FSRS_MAX_STABILITY = 36_500;
export const FSRS_MIN_DIFFICULTY = 1;
export const FSRS_MAX_DIFFICULTY = 10;

/** The forgetting curve's exponent: -0.5 under FSRS-5, -w20 under FSRS-6. */
export function fsrsDecay(weights: readonly number[] = DEFAULT_FSRS_WEIGHTS): number {
  return fsrsVersionOf(weights) === 6 ? -weights[20] : FSRS_DECAY;
}

/** 0.9^(1/decay) - 1 for these weights: what makes R(S, S) = 0.9 under either version. */
export function fsrsFactor(weights: readonly number[] = DEFAULT_FSRS_WEIGHTS): number {
  if (fsrsVersionOf(weights) !== 6) return FSRS_FACTOR;
  return 0.9 ** (1 / fsrsDecay(weights)) - 1;
}

function clamp(value: number, low: number, high: number): number {
  if (!Number.isFinite(value)) return low;
  return Math.min(high, Math.max(low, value));
}

function clampStability(value: number, weights: readonly number[]): number {
  const floor = fsrsVersionOf(weights) === 6 ? FSRS6_MIN_STABILITY : FSRS_MIN_STABILITY;
  return clamp(value, floor, FSRS_MAX_STABILITY);
}

function clampDifficulty(value: number): number {
  return clamp(value, FSRS_MIN_DIFFICULTY, FSRS_MAX_DIFFICULTY);
}

/**
 * Probability of recall after `elapsedDays` on a card of this stability.
 *
 * At `elapsedDays === stability` this is 0.9 by construction, which is what
 * makes stability readable as "days until 90% recall". The curve's shape is
 * FSRS-5's fixed one, or the FSRS-6 decay in `weights`.
 */
export function fsrsRetrievability(
  stability: number,
  elapsedDays: number,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): number {
  const s = clampStability(stability, weights);
  const t = Math.max(0, elapsedDays);
  return (1 + fsrsFactor(weights) * (t / s)) ** fsrsDecay(weights);
}

/**
 * How many days until recall falls to `desiredRetention`.
 *
 * The inverse of `fsrsRetrievability`. Higher retention means a shorter answer:
 * asking to remember 95% of the time means being asked sooner than 90%.
 */
export function fsrsInterval(
  stability: number,
  desiredRetention: number,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): number {
  const s = clampStability(stability, weights);
  const r = clamp(desiredRetention, 0.5, 0.999);
  return (s / fsrsFactor(weights)) * (r ** (1 / fsrsDecay(weights)) - 1);
}

/** A card seen for the first time, rated `grade`. */
export function fsrsInitialMemory(
  grade: FsrsGrade,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  const w = weights;
  return {
    stability: clampStability(w[grade - 1], w),
    difficulty: clampDifficulty(w[4] - Math.exp(w[5] * (grade - 1)) + 1),
  };
}

/**
 * Difficulty after a review.
 *
 * Two stages, the same in FSRS-5 and FSRS-6: the rating moves difficulty,
 * damped so a card already at the ceiling barely moves; then the result reverts
 * a little toward the difficulty a brand-new Easy card would have, so a single
 * bad day cannot permanently condemn a card.
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
  return clampStability(memory.stability * growth, w);
}

/**
 * Stability after a lapse.
 *
 * Never above the stability the card already had: forgetting a card cannot be
 * what makes the app wait longer to ask it again. FSRS caps it a little
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
  return clampStability(Math.min(lapsed, ceiling), w);
}

/**
 * The short-term step: a review on the same day as the last one, inside
 * learning or relearning steps. Stability is scaled by `e^(w17 * (G - 3 + w18))`
 * — Good on a step grows it, Again shrinks it — and difficulty moves exactly as
 * it does on a long-term review.
 *
 * FSRS-6 multiplies that by `S^-w19`, so a card that is already stable gains
 * less from a second look the same day, and never lets a Good or Easy step
 * lower stability (fsrs-rs `stability_short_term`).
 */
export function fsrsShortTermReview(
  memory: FsrsMemory,
  grade: FsrsGrade,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  const w = weights;
  const current: FsrsMemory = {
    stability: clampStability(memory.stability, w),
    difficulty: clampDifficulty(memory.difficulty),
  };
  let growth = Math.exp(w[17] * (grade - 3 + w[18]));
  if (fsrsVersionOf(w) === 6) {
    growth *= current.stability ** -w[19];
    if (grade >= 3) growth = Math.max(growth, 1);
  }
  return {
    stability: clampStability(current.stability * growth, w),
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
    stability: clampStability(memory.stability, weights),
    difficulty: clampDifficulty(memory.difficulty),
  };
  const retrievability = fsrsRetrievability(current.stability, elapsedDays, weights);
  const difficulty = nextDifficulty(current.difficulty, grade, weights);
  const stability = grade === 1
    ? stabilityOnLapse(current, retrievability, weights)
    : stabilityOnRecall(current, retrievability, grade, weights);
  return { stability, difficulty };
}

/**
 * A memory state for a card that only has an SM-2 schedule: fsrs-rs's
 * `memory_state_from_sm2`, which Anki uses when FSRS is switched on for a card
 * whose review history is missing or incomplete.
 *
 * Stability is the interval the card was given, scaled from the retention SM-2
 * is assumed to have achieved (`sm2Retention`, 0.9 by default, where the
 * stability IS the interval). Difficulty is whatever difficulty would have made
 * FSRS grow stability by the card's ease factor on a review at that retention.
 * Without this a 200-day SM-2 card switched to FSRS restarted as a new card.
 * Under FSRS-6 the stability is read off the fitted forgetting curve.
 */
export function fsrsMemoryFromSm2(
  easeFactor: number,
  intervalDays: number,
  sm2Retention = 0.9,
  weights: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): FsrsMemory {
  const w = weights;
  const r = clamp(sm2Retention, 0.5, 0.999);
  const ease = Number.isFinite(easeFactor) ? easeFactor : 2.5;
  const interval = Number.isFinite(intervalDays) ? Math.max(intervalDays, FSRS_MIN_STABILITY) : FSRS_MIN_STABILITY;
  const stability = clampStability((interval * fsrsFactor(w)) / (r ** (1 / fsrsDecay(w)) - 1), w);
  const growth = Math.exp(w[8]) * stability ** -w[9] * Math.expm1((1 - r) * w[10]);
  const difficulty = growth > 0 ? 11 - (ease - 1) / growth : FSRS_MAX_DIFFICULTY;
  return { stability, difficulty: clampDifficulty(difficulty) };
}
