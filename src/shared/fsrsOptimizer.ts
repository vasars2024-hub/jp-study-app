/**
 * FSRS-5 parameter optimisation from the user's own review log.
 *
 * `fsrs.ts` ships FSRS-5's population defaults. This fits the nineteen weights
 * to one person's history the way the reference optimiser (fsrs-rs, the one
 * Anki runs) does, in two stages:
 *
 * 1. **Pretrain the initial stabilities** (w0..w3). For every card whose first
 *    long-term review followed its first rating directly, the first rating and
 *    the recall outcome after `t` days are a sample of `R(t, S0)`. Each
 *    rating's `S0` is the one-dimensional maximum-likelihood fit, with a mild
 *    pull toward the default so a rating seen five times cannot run away.
 * 2. **Fit the rest by gradient descent** (w4..w18): replay every card's whole
 *    history through the FSRS-5 equations, predict recall at each review a day
 *    or more after the previous one, and minimise binary cross-entropy against
 *    what actually happened. Gradients are exact — forward-mode automatic
 *    differentiation over all nineteen weights, not finite differences — and
 *    the update is Adam (lr 0.04, cosine-annealed, 5 epochs, batches of ~512
 *    reviews), projected onto the FSRS-5 bounds after every step, with an L2
 *    penalty toward the starting weights scaled by fsrs-rs's per-weight
 *    standard deviations. Same-day reviews feed the short-term weights
 *    (w17, w18) through the state they produce but are not themselves scored,
 *    exactly as in the reference.
 *
 * Deterministic: batches are shuffled by a seeded generator and nothing reads
 * the clock, so the same log always yields the same weights. A fit is only
 * reported as an improvement when it lowers the log-loss on the same reviews.
 *
 * Known simplifications, stated: elapsed time is in whole days from a
 * configurable day boundary (as the reference does), and the initial
 * stabilities are not re-trained in stage 2.
 *
 * What the app offers goes through `optimizeFsrsWithHoldout`: only real review
 * rows train (game and practice answers never do), the log is split by TIME —
 * fit on the earlier reviews, judged on the latest ~20% — and new weights are
 * offered only when they predict those unseen reviews better than the weights
 * in use. A fit judged on its own training reviews always looks like a gain.
 */
import {
  DEFAULT_FSRS_WEIGHTS,
  FSRS_DECAY,
  FSRS_FACTOR,
  FSRS_WEIGHT_BOUNDS,
  type FsrsGrade,
} from './fsrs';
import type { LocalSrsRating } from './localSrs';

const DAY_MS = 24 * 60 * 60 * 1000;
const P = 19;

/** One graded review as the log stores it. */
export interface FsrsLogRow {
  cardId: string;
  at: number;
  rating: LocalSrsRating;
  /** The card's first review ever (or first after a schedule reset). */
  isNew?: boolean;
}

export interface FsrsTrainingReview {
  grade: FsrsGrade;
  /** Whole days since the previous review of this card; 0 on the first. */
  deltaDays: number;
  /** In the held-out (latest) slice of a time split: evaluated, never trained on. */
  heldOut?: true;
}

export type FsrsTrainingSequence = FsrsTrainingReview[];

export interface SequenceOptions {
  /** Local time minus UTC, in minutes (`-new Date().getTimezoneOffset()`). */
  utcOffsetMinutes?: number;
  /** Hour at which a new study day starts, as in Anki (default 4). */
  dayStartHour?: number;
  /** Reviews at or after this epoch ms are marked `heldOut` (see `holdoutCutoff`). */
  holdoutFrom?: number;
}

const GRADE: Record<LocalSrsRating, FsrsGrade> = { again: 1, hard: 2, good: 3, easy: 4 };

function dayIndex(at: number, options: SequenceOptions): number {
  const offset = (options.utcOffsetMinutes ?? 0) * 60_000 - (options.dayStartHour ?? 4) * 3_600_000;
  return Math.floor((at + offset) / DAY_MS);
}

/**
 * Per-card review histories, each starting at a first review.
 *
 * Rows before a card's first `isNew` row are dropped: a history that starts in
 * the middle (log pruned, card imported with a schedule) has no first rating to
 * replay from. A later `isNew` row means the schedule was reset, and starts a
 * new history rather than gluing two lives of one card together.
 */
export function buildTrainingSequences(
  rows: readonly FsrsLogRow[],
  options: SequenceOptions = {},
): FsrsTrainingSequence[] {
  const byCard = new Map<string, FsrsLogRow[]>();
  for (const row of rows) {
    if (!row.cardId || !GRADE[row.rating] || !Number.isFinite(row.at)) continue;
    const list = byCard.get(row.cardId);
    if (list) list.push(row);
    else byCard.set(row.cardId, [row]);
  }
  const out: FsrsTrainingSequence[] = [];
  const ids = [...byCard.keys()].sort();
  for (const id of ids) {
    const list = byCard.get(id) ?? [];
    list.sort((a, b) => a.at - b.at);
    let current: FsrsTrainingSequence | null = null;
    let lastDay = 0;
    for (const row of list) {
      const day = dayIndex(row.at, options);
      const held = options.holdoutFrom !== undefined && row.at >= options.holdoutFrom ? { heldOut: true as const } : {};
      if (row.isNew) {
        if (current && current.length > 1) out.push(current);
        current = [{ grade: GRADE[row.rating], deltaDays: 0, ...held }];
      } else if (current) {
        current.push({ grade: GRADE[row.rating], deltaDays: Math.max(0, day - lastDay), ...held });
      }
      lastDay = day;
    }
    if (current && current.length > 1) out.push(current);
  }
  return out;
}

/** Reviews a day or more after the previous one: what the loss is scored on. */
export function countScoredReviews(sequences: readonly FsrsTrainingSequence[]): number {
  let n = 0;
  for (const seq of sequences) for (let i = 1; i < seq.length; i += 1) if (seq[i].deltaDays >= 1) n += 1;
  return n;
}

// ----- forward-mode dual numbers --------------------------------------------------

interface Dual {
  v: number;
  /** d v / d w_i for the nineteen weights; `null` for a constant. */
  g: number[] | null;
}

const constant = (v: number): Dual => ({ v, g: null });

function lin(ka: number, a: number[] | null, kb: number, b: number[] | null): number[] | null {
  if (!a && !b) return null;
  const out = new Array<number>(P);
  for (let i = 0; i < P; i += 1) out[i] = (a ? ka * a[i] : 0) + (b ? kb * b[i] : 0);
  return out;
}

const add = (a: Dual, b: Dual): Dual => ({ v: a.v + b.v, g: lin(1, a.g, 1, b.g) });
const sub = (a: Dual, b: Dual): Dual => ({ v: a.v - b.v, g: lin(1, a.g, -1, b.g) });
const mul = (a: Dual, b: Dual): Dual => ({ v: a.v * b.v, g: lin(b.v, a.g, a.v, b.g) });
const div = (a: Dual, b: Dual): Dual => ({ v: a.v / b.v, g: lin(1 / b.v, a.g, -a.v / (b.v * b.v), b.g) });
const scale = (a: Dual, k: number): Dual => ({ v: a.v * k, g: lin(k, a.g, 0, null) });
const addK = (a: Dual, k: number): Dual => ({ v: a.v + k, g: a.g });
function exp(a: Dual): Dual {
  const v = Math.exp(a.v);
  return { v, g: lin(v, a.g, 0, null) };
}
function powK(a: Dual, k: number): Dual {
  const v = a.v ** k;
  return { v, g: lin(k * a.v ** (k - 1), a.g, 0, null) };
}
/** a^b with both sides differentiable; `a` must be positive. */
function pow(a: Dual, b: Dual): Dual {
  const v = a.v ** b.v;
  return { v, g: lin(v * b.v / a.v, a.g, v * Math.log(a.v), b.g) };
}
function clampD(a: Dual, low: number, high: number): Dual {
  if (a.v < low) return constant(low);
  if (a.v > high) return constant(high);
  return a;
}
const minD = (a: Dual, b: Dual): Dual => (a.v <= b.v ? a : b);

function weightDuals(w: readonly number[]): Dual[] {
  return w.map((v, i) => {
    const g = new Array<number>(P).fill(0);
    g[i] = 1;
    return { v, g };
  });
}

// ----- the FSRS-5 model over duals -------------------------------------------------

interface DualState {
  s: Dual;
  d: Dual;
}

const S_MIN = 0.01;
const S_MAX = 36_500;

function initialState(W: Dual[], grade: FsrsGrade): DualState {
  return {
    s: clampD(W[grade - 1], S_MIN, S_MAX),
    d: clampD(addK(sub(W[4], exp(scale(W[5], grade - 1))), 1), 1, 10),
  };
}

function retrievability(s: Dual, days: number): Dual {
  return powK(addK(scale(div(constant(days), s), FSRS_FACTOR), 1), FSRS_DECAY);
}

function nextDifficulty(W: Dual[], d: Dual, grade: FsrsGrade): Dual {
  const delta = scale(W[6], -(grade - 3));
  const damped = add(d, div(mul(delta, sub(constant(10), d)), constant(9)));
  const easyInit = addK(sub(W[4], exp(scale(W[5], 3))), 1);
  const reverted = add(mul(W[7], easyInit), mul(sub(constant(1), W[7]), damped));
  return clampD(reverted, 1, 10);
}

function step(W: Dual[], state: DualState, review: FsrsTrainingReview, r: Dual | null): DualState {
  const { grade } = review;
  const d = nextDifficulty(W, state.d, grade);
  let s: Dual;
  if (review.deltaDays < 1 || !r) {
    s = mul(state.s, exp(mul(W[17], addK(W[18], grade - 3))));
  } else if (grade === 1) {
    const lapsed = mul(
      mul(mul(W[11], pow(state.d, scale(W[12], -1))), addK(pow(addK(state.s, 1), W[13]), -1)),
      exp(mul(W[14], sub(constant(1), r))),
    );
    const ceiling = div(state.s, exp(mul(W[17], W[18])));
    s = minD(lapsed, ceiling);
  } else {
    let factor = mul(
      mul(mul(exp(W[8]), sub(constant(11), state.d)), pow(state.s, scale(W[9], -1))),
      addK(exp(mul(W[10], sub(constant(1), r))), -1),
    );
    if (grade === 2) factor = mul(factor, W[15]);
    if (grade === 4) factor = mul(factor, W[16]);
    s = mul(state.s, addK(factor, 1));
  }
  return { s: clampD(s, S_MIN, S_MAX), d };
}

const EPS = 1e-7;

/**
 * Replay one history; add each scored review's loss gradient into `grad` (when
 * given) and return the summed loss, squared error and count.
 */
function replay(
  W: Dual[],
  seq: FsrsTrainingSequence,
  grad: number[] | null,
  heldOutOnly = false,
): { loss: number; sq: number; n: number } {
  let state = initialState(W, seq[0].grade);
  let loss = 0;
  let sq = 0;
  let n = 0;
  for (let i = 1; i < seq.length; i += 1) {
    const review = seq[i];
    let r: Dual | null = null;
    if (review.deltaDays >= 1) {
      r = retrievability(state.s, review.deltaDays);
    }
    // A held-out evaluation replays the whole history (the state needs it) but
    // scores only the held-out reviews.
    if (r && (!heldOutOnly || review.heldOut)) {
      const y = review.grade > 1 ? 1 : 0;
      const p = Math.min(1 - EPS, Math.max(EPS, r.v));
      loss += -(y * Math.log(p) + (1 - y) * Math.log(1 - p));
      sq += (p - y) ** 2;
      n += 1;
      if (grad && r.g) {
        const coef = -y / p + (1 - y) / (1 - p);
        for (let k = 0; k < P; k += 1) grad[k] += coef * r.g[k];
      }
    }
    state = step(W, state, review, r);
  }
  return { loss, sq, n };
}

export interface FsrsFitQuality {
  /** Mean binary cross-entropy of predicted recall against the outcome. */
  logLoss: number;
  /** Root mean squared error of predicted recall against the outcome. */
  rmse: number;
  reviews: number;
}

/**
 * How well `weights` predict the scored reviews in `sequences` — or, with
 * `heldOutOnly`, only the reviews marked `heldOut`.
 */
export function evaluateFsrsWeights(
  weights: readonly number[],
  sequences: readonly FsrsTrainingSequence[],
  options: { heldOutOnly?: boolean } = {},
): FsrsFitQuality {
  const W = weights.map(constant);
  let loss = 0;
  let sq = 0;
  let n = 0;
  for (const seq of sequences) {
    const part = replay(W, seq, null, options.heldOutOnly === true);
    loss += part.loss;
    sq += part.sq;
    n += part.n;
  }
  return n ? { logLoss: loss / n, rmse: Math.sqrt(sq / n), reviews: n } : { logLoss: 0, rmse: 0, reviews: 0 };
}

/**
 * Mean log-loss over the scored reviews and its exact gradient with respect to
 * all nineteen weights. What stage 2 descends; exported so the derivative can
 * be checked against finite differences.
 */
export function fsrsLossGradient(
  weights: readonly number[],
  sequences: readonly FsrsTrainingSequence[],
): { loss: number; gradient: number[]; reviews: number } {
  const W = weightDuals(weights);
  const grad = new Array<number>(P).fill(0);
  let loss = 0;
  let n = 0;
  for (const seq of sequences) {
    const part = replay(W, seq, grad);
    loss += part.loss;
    n += part.n;
  }
  return n
    ? { loss: loss / n, gradient: grad.map((g) => g / n), reviews: n }
    : { loss: 0, gradient: grad, reviews: 0 };
}

// ----- stage 1: initial stability -------------------------------------------------

function bce(p: number, y: number): number {
  const q = Math.min(1 - EPS, Math.max(EPS, p));
  return -(y * Math.log(q) + (1 - y) * Math.log(1 - q));
}

function recallAt(stability: number, days: number): number {
  return (1 + FSRS_FACTOR * (days / stability)) ** FSRS_DECAY;
}

/** Minimum samples of a first rating before its S0 is fitted rather than kept. */
export const MIN_PRETRAIN_SAMPLES = 8;

/**
 * Fit w0..w3. Exported for its own test; `optimizeFsrsWeights` calls it.
 */
export function pretrainInitialStability(
  sequences: readonly FsrsTrainingSequence[],
  start: readonly number[] = DEFAULT_FSRS_WEIGHTS,
): number[] {
  const samples: Array<Array<{ t: number; y: number }>> = [[], [], [], []];
  for (const seq of sequences) {
    if (seq.length < 2 || seq[1].deltaDays < 1) continue;
    samples[seq[0].grade - 1].push({ t: seq[1].deltaDays, y: seq[1].grade > 1 ? 1 : 0 });
  }
  const fitted = start.slice(0, 4);
  for (let g = 0; g < 4; g += 1) {
    const data = samples[g];
    if (data.length < MIN_PRETRAIN_SAMPLES) continue;
    const prior = Math.log(start[g]);
    const objective = (logS: number): number => {
      const s = Math.exp(logS);
      let total = 0;
      for (const { t, y } of data) total += bce(recallAt(s, t), y);
      return total + (logS - prior) ** 2;
    };
    // Golden-section search on ln S over the FSRS-5 bound.
    let lo = Math.log(FSRS_WEIGHT_BOUNDS[g][0]);
    let hi = Math.log(FSRS_WEIGHT_BOUNDS[g][1]);
    const phi = (Math.sqrt(5) - 1) / 2;
    let a = hi - phi * (hi - lo);
    let b = lo + phi * (hi - lo);
    let fa = objective(a);
    let fb = objective(b);
    for (let iter = 0; iter < 80; iter += 1) {
      if (fa < fb) {
        hi = b;
        b = a;
        fb = fa;
        a = hi - phi * (hi - lo);
        fa = objective(a);
      } else {
        lo = a;
        a = b;
        fa = fb;
        b = lo + phi * (hi - lo);
        fb = objective(b);
      }
    }
    fitted[g] = Math.exp((lo + hi) / 2);
  }
  // Again < Hard < Good < Easy must survive noisy data, or a Hard first answer
  // could be scheduled further out than a Good one.
  for (let g = 1; g < 4; g += 1) {
    if (fitted[g] <= fitted[g - 1]) fitted[g] = fitted[g - 1] * 1.05;
  }
  return fitted.map((v, g) => Math.min(FSRS_WEIGHT_BOUNDS[g][1], Math.max(FSRS_WEIGHT_BOUNDS[g][0], v)));
}

// ----- stage 2: gradient descent ----------------------------------------------------

/** fsrs-rs's per-weight standard deviations, used to scale the L2 penalty. */
const WEIGHT_STD: readonly number[] = [
  6.61, 9.52, 17.69, 27.74, 0.55, 0.28, 0.67, 0.12, 0.4, 0.18,
  0.34, 0.27, 0.08, 0.14, 0.57, 0.25, 1.03, 0.27, 0.39,
];

/** Weights stage 2 moves. The initial stabilities belong to stage 1. */
const TRAINABLE_FROM = 4;

/** Below this many scored reviews nothing is fitted. */
export const MIN_OPTIMIZER_REVIEWS = 100;
/** Below this many, a fit is offered but labelled as based on little data. */
export const RECOMMENDED_OPTIMIZER_REVIEWS = 1000;

export interface OptimizeOptions {
  epochs?: number;
  /** Scored reviews per batch (whole histories are kept together). */
  batchSize?: number;
  learningRate?: number;
  seed?: number;
  /** Strength of the pull toward the starting weights. */
  gamma?: number;
  start?: readonly number[];
  /**
   * Called after each descent step with the share of steps done (0..1]. Only
   * reports; it cannot change the result, so the fit stays deterministic.
   */
  onProgress?: (fraction: number) => void;
}

export interface FsrsOptimizeResult {
  status: 'ok' | 'insufficient-data';
  weights: number[];
  sequences: number;
  before: FsrsFitQuality;
  after: FsrsFitQuality;
  /** True only when the fit predicts these reviews better than the start did. */
  improved: boolean;
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

function project(w: number[]): number[] {
  return w.map((v, i) => Math.min(FSRS_WEIGHT_BOUNDS[i][1], Math.max(FSRS_WEIGHT_BOUNDS[i][0], v)));
}

/**
 * Fit FSRS-5 weights to `sequences`. Synchronous and bounded (a handful of
 * passes over the log); a caller with a very large log should run it off the
 * interaction path.
 */
export function optimizeFsrsWeights(
  sequences: readonly FsrsTrainingSequence[],
  options: OptimizeOptions = {},
): FsrsOptimizeResult {
  const start = [...(options.start ?? DEFAULT_FSRS_WEIGHTS)];
  const usable = sequences.filter((seq) => seq.length > 1);
  const before = evaluateFsrsWeights(start, usable);
  if (before.reviews < MIN_OPTIMIZER_REVIEWS) {
    return { status: 'insufficient-data', weights: start, sequences: usable.length, before, after: before, improved: false };
  }

  const epochs = Math.max(1, Math.floor(options.epochs ?? 5));
  const batchSize = Math.max(16, Math.floor(options.batchSize ?? 512));
  const baseLr = options.learningRate ?? 0.04;
  const gamma = options.gamma ?? 1;
  const random = mulberry32(options.seed ?? 42);

  let w = project([...pretrainInitialStability(usable, start), ...start.slice(4)]);
  const anchor = [...w];
  const total = before.reviews;

  // Batches: whole histories, in a seeded shuffle, grouped to ~batchSize scored reviews.
  const scored = usable.map((seq) => countScoredReviews([seq]));
  const order = usable.map((_, i) => i);
  const batchesPerEpoch = Math.max(1, Math.ceil(total / batchSize));
  const totalSteps = epochs * batchesPerEpoch;
  const m = new Array<number>(P).fill(0);
  const v = new Array<number>(P).fill(0);
  const beta1 = 0.9;
  const beta2 = 0.999;
  let t = 0;

  for (let epoch = 0; epoch < epochs; epoch += 1) {
    for (let i = order.length - 1; i > 0; i -= 1) {
      const j = Math.floor(random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let cursor = 0;
    while (cursor < order.length) {
      const grad = new Array<number>(P).fill(0);
      const W = weightDuals(w);
      let n = 0;
      while (cursor < order.length && n < batchSize) {
        const index = order[cursor];
        cursor += 1;
        if (scored[index] === 0) continue;
        n += replay(W, usable[index], grad).n;
      }
      if (n === 0) continue;
      t += 1;
      const lr = baseLr * 0.5 * (1 + Math.cos(Math.PI * Math.min(1, (t - 1) / Math.max(1, totalSteps))));
      for (let k = TRAINABLE_FROM; k < P; k += 1) {
        const penalty = (2 * gamma * (w[k] - anchor[k])) / (WEIGHT_STD[k] * WEIGHT_STD[k] * total);
        const gk = grad[k] / n + penalty;
        m[k] = beta1 * m[k] + (1 - beta1) * gk;
        v[k] = beta2 * v[k] + (1 - beta2) * gk * gk;
        const mHat = m[k] / (1 - beta1 ** t);
        const vHat = v[k] / (1 - beta2 ** t);
        w[k] -= (lr * mHat) / (Math.sqrt(vHat) + 1e-8);
      }
      w = project(w);
      options.onProgress?.(Math.min(1, t / totalSteps));
    }
  }

  // Four decimals is what gets stored and shown; judge the weights as stored.
  const rounded = project(w.map((x) => Math.round(x * 1e4) / 1e4));
  const after = evaluateFsrsWeights(rounded, usable);
  const improved = after.logLoss < before.logLoss;
  return {
    status: 'ok',
    weights: improved ? rounded : start,
    sequences: usable.length,
    before,
    after: improved ? after : before,
    improved,
  };
}

// ----- what the app runs: real reviews only, time-split validation ---------------

/** The review-log fields the optimiser reads (a subset of `ReviewLogEntry`). */
export interface FsrsLogEntryLike {
  mode: string;
  /** Set on a `review` row that did not come from a review surface (a game). */
  source?: string;
  cardId?: string;
  at: number;
  rating?: LocalSrsRating;
  isNew?: boolean;
}

/**
 * The rows FSRS may learn from: `review` rows from a review surface, with a
 * card and a rating. Game and practice answers (`game`, `learn`, `test`, ...)
 * and reviews graded from a game (`source` set) are recognition, not recall
 * after a scheduled gap, and would teach the model the wrong forgetting curve.
 */
export function selectTrainingRows(entries: readonly FsrsLogEntryLike[]): { rows: FsrsLogRow[]; excluded: number } {
  const rows: FsrsLogRow[] = [];
  let excluded = 0;
  for (const entry of entries) {
    if (entry.mode === 'review' && entry.source === undefined && entry.cardId && entry.rating && GRADE[entry.rating]) {
      rows.push({ cardId: entry.cardId, at: entry.at, rating: entry.rating, ...(entry.isNew ? { isNew: true } : {}) });
    } else {
      excluded += 1;
    }
  }
  return { rows, excluded };
}

/** Share of the latest reviews held out for validation. */
export const HOLDOUT_FRACTION = 0.2;
/** Fewer held-out scored reviews than this cannot tell two parameter sets apart. */
export const MIN_HOLDOUT_REVIEWS = 30;

/**
 * The time at which the latest `fraction` of `rows` begins. Rows at or after it
 * are held out. `Infinity` (nothing held out) for an empty log.
 */
export function holdoutCutoff(rows: readonly Pick<FsrsLogRow, 'at'>[], fraction = HOLDOUT_FRACTION): number {
  const times = rows.map((row) => row.at).filter(Number.isFinite).sort((a, b) => a - b);
  if (!times.length || !(fraction > 0)) return Number.POSITIVE_INFINITY;
  const index = Math.min(times.length - 1, Math.max(0, Math.floor(times.length * (1 - Math.min(1, fraction)))));
  return times[index];
}

/**
 * Training histories (each cut before its first held-out review) and the
 * histories that contain held-out reviews (whole, so replay has their past).
 */
export function splitHeldOut(sequences: readonly FsrsTrainingSequence[]): {
  train: FsrsTrainingSequence[];
  heldOut: FsrsTrainingSequence[];
} {
  const train: FsrsTrainingSequence[] = [];
  const heldOut: FsrsTrainingSequence[] = [];
  for (const seq of sequences) {
    const cut = seq.findIndex((review) => review.heldOut);
    if (cut < 0) {
      train.push(seq);
      continue;
    }
    heldOut.push(seq);
    if (cut > 1) train.push(seq.slice(0, cut));
  }
  return { train, heldOut };
}

export interface FsrsHoldoutOptions extends OptimizeOptions, Omit<SequenceOptions, 'holdoutFrom'> {
  /** The weights in use now: what a fit has to beat. Defaults to FSRS-5's. */
  current?: readonly number[];
  holdoutFraction?: number;
}

export interface FsrsHoldoutResult {
  status: 'ok' | 'insufficient-data';
  /** The fitted weights when `improved`, otherwise the current ones. */
  weights: number[];
  /** Scored reviews the fit was trained on (the earlier ~80%). */
  trainReviews: number;
  /** Log rows left out because they are not review-surface reviews. */
  excluded: number;
  /** The current weights on the held-out reviews. */
  current: FsrsFitQuality;
  /** The fitted weights on the same held-out reviews. */
  fitted: FsrsFitQuality;
  /** True only when the fit predicts the unseen latest reviews better than the current weights. */
  improved: boolean;
  /** Why the fit was not attempted, when `status` is `insufficient-data`. */
  shortOf?: 'train' | 'held-out';
  /** The data thresholds, carried so a caller need not import this module to show them. */
  thresholds: { train: number; heldOut: number; recommended: number };
}

const THRESHOLDS = {
  train: MIN_OPTIMIZER_REVIEWS,
  heldOut: MIN_HOLDOUT_REVIEWS,
  recommended: RECOMMENDED_OPTIMIZER_REVIEWS,
} as const;

/**
 * Fit on the earlier reviews, judge on the latest ones. Pure and deterministic
 * (same log and options, same answer); a Web Worker runs it in the app.
 */
export function optimizeFsrsWithHoldout(
  entries: readonly FsrsLogEntryLike[],
  options: FsrsHoldoutOptions = {},
): FsrsHoldoutResult {
  const current = [...(options.current ?? DEFAULT_FSRS_WEIGHTS)];
  const { rows, excluded } = selectTrainingRows(entries);
  const cutoff = holdoutCutoff(rows, options.holdoutFraction ?? HOLDOUT_FRACTION);
  const sequences = buildTrainingSequences(rows, {
    utcOffsetMinutes: options.utcOffsetMinutes,
    dayStartHour: options.dayStartHour,
    holdoutFrom: cutoff,
  });
  const { train, heldOut } = splitHeldOut(sequences);
  const trainReviews = countScoredReviews(train);
  const currentQuality = evaluateFsrsWeights(current, heldOut, { heldOutOnly: true });
  const refuse = (shortOf: 'train' | 'held-out'): FsrsHoldoutResult => ({
    status: 'insufficient-data',
    weights: current,
    trainReviews,
    excluded,
    current: currentQuality,
    fitted: currentQuality,
    improved: false,
    shortOf,
    thresholds: { ...THRESHOLDS },
  });
  if (trainReviews < MIN_OPTIMIZER_REVIEWS) return refuse('train');
  if (currentQuality.reviews < MIN_HOLDOUT_REVIEWS) return refuse('held-out');

  const fit = optimizeFsrsWeights(train, { ...options, start: options.start ?? DEFAULT_FSRS_WEIGHTS });
  const fitted = evaluateFsrsWeights(fit.weights, heldOut, { heldOutOnly: true });
  const improved = fit.status === 'ok' && fitted.logLoss < currentQuality.logLoss;
  return {
    status: 'ok',
    weights: improved ? fit.weights : current,
    trainReviews,
    excluded,
    current: currentQuality,
    fitted,
    improved,
    thresholds: { ...THRESHOLDS },
  };
}
