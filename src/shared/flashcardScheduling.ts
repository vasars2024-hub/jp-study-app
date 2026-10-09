/**
 * Which scheduler a local deck uses, and the one call every review goes through.
 *
 * Before this file there was exactly one schedule, hardcoded: the SM-2 in
 * `localSrs.ts`. It still exists, unchanged, and is still the default — a user
 * who never opens the setting keeps the intervals their deck already has. What
 * this adds is the seam and a second implementation behind it, so the choice is
 * a setting rather than a rewrite.
 *
 * The load-bearing rule is that switching algorithms must not silently
 * reinterpret numbers. An SM-2 state carries an `ease`; an FSRS state carries
 * `stability` and `difficulty`; the two are not convertible without lying about
 * where they came from. So a state records which scheduler wrote it, and a
 * state handed to the OTHER scheduler is ADAPTED explicitly and once —
 * `adaptStateForAlgorithm` below — rather than having its fields read as if
 * they meant the same thing.
 *
 * Reset is a first-class operation for the same reason. There is no arithmetic
 * that turns a well-scheduled SM-2 card into a well-scheduled FSRS card, so a
 * user who wants a clean model gets a real reset instead of a silent one.
 *
 * Same-day steps (`learningSteps.ts`) sit in front of both schedulers. The
 * defaults reproduce the schedule this app always had — no learning steps, one
 * ten-minute relearning step — so turning steps on is the user's choice, and
 * Anki's "1m 10m" is one click away in the settings panel.
 */
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInterval,
  fsrsReview,
  fsrsShortTermReview,
  isValidFsrsWeights,
  type FsrsGrade,
  type FsrsMemory,
} from './fsrs';
import {
  DEFAULT_RELEARNING_STEPS,
  isInSteps,
  normalizeSteps,
  stepTransition,
  type SrsPhase,
} from './learningSteps';
import {
  LOCAL_SRS_DEFAULT_EASE,
  LOCAL_SRS_MIN_EASE,
  isLocalSrsState,
  scheduleLocalReview,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from './localSrs';
import { fuzzedInterval } from './srsFuzz';

const DAY_MS = 24 * 60 * 60 * 1000;
const MINUTE_MS = 60 * 1000;
const MAX_INTERVAL_CEILING = 36_500;

/** What a card that keeps lapsing gets: a tag only, or a tag and a suspension. */
export type LeechAction = 'tag' | 'suspend';

export interface SchedulingConfig {
  algorithm: LocalSrsAlgorithm;
  /**
   * FSRS only: the recall probability the intervals aim at. Higher means being
   * asked more often, not less — 0.95 is a stricter standard than 0.90.
   */
  desiredRetention: number;
  /** Both schedulers. A hard ceiling the user can lower; never raises one. */
  maximumIntervalDays: number;
  /** Same-day steps for a new card, in minutes. Empty: graduate on first Good. */
  learningStepsMinutes: number[];
  /** Same-day steps after a lapse, in minutes. Empty: straight back to a 1-day interval. */
  relearningStepsMinutes: number[];
  /**
   * Spread reviews: a small deterministic jitter on intervals of 3 days or more
   * (Anki's fuzz ranges), choosing the least-loaded day inside that range when
   * the caller can say how loaded each day is. Off by default so an existing
   * deck's intervals do not move on upgrade.
   */
  fuzz: boolean;
  /** Lapses at which a card becomes a leech (and again every half of it after). */
  leechThreshold: number;
  leechAction: LeechAction;
  /** FSRS: a personal fit from `fsrsOptimizer.ts`. Absent means the FSRS-5 defaults. */
  fsrsWeights?: number[];
}

export const DEFAULT_LOCAL_LEECH_THRESHOLD = 8;

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  // SM-2, because it is what every existing deck is already scheduled by.
  algorithm: 'sm2',
  desiredRetention: 0.9,
  maximumIntervalDays: MAX_INTERVAL_CEILING,
  learningStepsMinutes: [],
  relearningStepsMinutes: [...DEFAULT_RELEARNING_STEPS],
  fuzz: false,
  leechThreshold: DEFAULT_LOCAL_LEECH_THRESHOLD,
  leechAction: 'tag',
};

export const MIN_LOCAL_RETENTION = 0.7;
export const MAX_LOCAL_RETENTION = 0.97;

export function normalizeSchedulingConfig(
  value?: Partial<SchedulingConfig> | null,
): SchedulingConfig {
  const retention = Number(value?.desiredRetention);
  const maximum = Number(value?.maximumIntervalDays);
  const leech = Number(value?.leechThreshold);
  const config: SchedulingConfig = {
    algorithm: value?.algorithm === 'fsrs' ? 'fsrs' : 'sm2',
    desiredRetention: Number.isFinite(retention)
      ? Math.min(MAX_LOCAL_RETENTION, Math.max(MIN_LOCAL_RETENTION, retention))
      : DEFAULT_SCHEDULING_CONFIG.desiredRetention,
    maximumIntervalDays: Number.isFinite(maximum) && maximum >= 1
      ? Math.min(MAX_INTERVAL_CEILING, Math.floor(maximum))
      : DEFAULT_SCHEDULING_CONFIG.maximumIntervalDays,
    learningStepsMinutes: normalizeSteps(value?.learningStepsMinutes, DEFAULT_SCHEDULING_CONFIG.learningStepsMinutes),
    relearningStepsMinutes: normalizeSteps(
      value?.relearningStepsMinutes,
      DEFAULT_SCHEDULING_CONFIG.relearningStepsMinutes,
    ),
    fuzz: value?.fuzz === true,
    leechThreshold: Number.isFinite(leech) && leech >= 2
      ? Math.min(99, Math.floor(leech))
      : DEFAULT_LOCAL_LEECH_THRESHOLD,
    leechAction: value?.leechAction === 'suspend' ? 'suspend' : 'tag',
  };
  const weights = value?.fsrsWeights;
  if (isValidFsrsWeights(weights)) config.fsrsWeights = [...weights];
  return config;
}

/** Which scheduler wrote a state. Version-1 states predate the choice. */
export function stateAlgorithm(state: unknown): LocalSrsAlgorithm | null {
  if (!isLocalSrsState(state)) return null;
  return state.algorithm ?? 'sm2';
}

/**
 * Read an on-disk state, whatever version wrote it, or `undefined`.
 *
 * A version-1 state is stamped as the SM-2 state it always was. Nothing is
 * invented: no stability, no difficulty, no algorithm it never ran under.
 * Anything that is not a valid state at all comes back `undefined`, which every
 * caller already treats as "new card, due now".
 */
export function migrateSrsState(value: unknown): LocalSrsState | undefined {
  if (!isLocalSrsState(value)) return undefined;
  if (value.version === 2 && value.algorithm) return value;
  return { ...value, version: 2, algorithm: value.algorithm ?? 'sm2' };
}

/**
 * A card with no schedule at all: new, due now, no history.
 *
 * Returning `undefined` rather than a zeroed state is the point — every reader
 * in the app already treats a missing `srs` as an unseen card, so a reset card
 * is indistinguishable from one that was never studied, which is what a reset
 * is supposed to mean.
 */
export function resetSrsState(): undefined {
  return undefined;
}

const GRADES: Record<LocalSrsRating, FsrsGrade> = { again: 1, hard: 2, good: 3, easy: 4 };

function memoryOf(state: LocalSrsState | undefined): FsrsMemory | null {
  if (!state || state.stability === undefined || state.difficulty === undefined) return null;
  return { stability: state.stability, difficulty: state.difficulty };
}

/**
 * Bring a state under `algorithm` without pretending the old numbers were the
 * new ones.
 *
 * SM-2 → FSRS drops `stability`/`difficulty` if they are somehow present and
 * lets FSRS treat the card as new: the model has no history for it, and an ease
 * factor is not a difficulty. The card keeps its due date and its counts, so
 * the user does not lose their place — only the model restarts.
 *
 * FSRS → SM-2 keeps the ease the state already carries (or the default) and
 * drops the memory pair. Same bargain in the other direction.
 */
export function adaptStateForAlgorithm(
  state: LocalSrsState | undefined,
  algorithm: LocalSrsAlgorithm,
): LocalSrsState | undefined {
  if (!state) return undefined;
  if ((state.algorithm ?? 'sm2') === algorithm) return state;
  // Rebuilt field by field rather than spread-and-delete: the memory pair must
  // be ABSENT, and an `undefined` property still serialises into the store.
  const carried: LocalSrsState = {
    version: 2,
    algorithm,
    dueAt: state.dueAt,
    intervalDays: state.intervalDays,
    ease: Number.isFinite(state.ease) && state.ease >= LOCAL_SRS_MIN_EASE
      ? state.ease
      : LOCAL_SRS_DEFAULT_EASE,
    repetitions: state.repetitions,
    lapses: state.lapses,
    lastReviewedAt: state.lastReviewedAt,
    lastRating: state.lastRating,
  };
  // A card halfway through its steps stays there: the steps are the same for
  // both algorithms.
  if (state.phase) {
    carried.phase = state.phase;
    if (state.step !== undefined) carried.step = state.step;
  }
  return carried;
}

function elapsedDays(state: LocalSrsState | undefined, now: number): number {
  if (!state?.lastReviewedAt) return 0;
  return Math.max(0, (now - state.lastReviewedAt) / DAY_MS);
}

/** The step list a card in `phase` is walking, or a new card's. */
function stepsFor(phase: SrsPhase, config: SchedulingConfig): number[] {
  return phase === 'relearning' ? config.relearningStepsMinutes : config.learningStepsMinutes;
}

/** A state still inside steps: interval 0, due after the step's delay. */
function inStepState(
  base: LocalSrsState,
  phase: SrsPhase,
  step: number,
  delayMinutes: number,
  now: number,
): LocalSrsState {
  return {
    ...base,
    dueAt: now + Math.round(delayMinutes * MINUTE_MS),
    intervalDays: 0,
    lastReviewedAt: now,
    phase,
    step,
  };
}

/**
 * A graduated card outside steps, with a real day interval: the only state in
 * which an Again counts as a lapse (and so toward the leech threshold).
 *
 * Existing decks: before 2026-10-08 a new card's first Again (no learning
 * steps) and an Again on an interval-0 card each counted as a lapse, so some
 * stored `lapses` (and leech tags) are higher than Anki would show. Stored
 * counts are deliberately NOT rewritten — the review log cannot reliably say
 * which past lapses were spurious — so the inflation only stops growing.
 */
function isReviewState(state: LocalSrsState | undefined): boolean {
  return state !== undefined && !isInSteps(state) && state.intervalDays >= 1;
}

/** Copy without the step fields: the card has left its steps. */
function graduated(state: LocalSrsState): LocalSrsState {
  if (state.phase === undefined && state.step === undefined) return state;
  const rest: LocalSrsState = { ...state };
  delete rest.phase;
  delete rest.step;
  return rest;
}

/** Optional context a caller can give so intervals can be spread. */
export interface ScheduleOptions {
  /** A stable identity for this card (its id). Fuzz is seeded from it. */
  fuzzKey?: string;
  /** How many reviews already fall on the day `dayOffset` days from now. */
  dueLoad?: (dayOffset: number) => number;
}

function applyCeiling(state: LocalSrsState, config: SchedulingConfig, now: number): LocalSrsState {
  if (state.phase || state.intervalDays <= config.maximumIntervalDays) return state;
  // The ceiling is the user's, so it caps the due date too rather than being a
  // display-only number that the schedule ignores.
  return {
    ...state,
    intervalDays: config.maximumIntervalDays,
    dueAt: now + config.maximumIntervalDays * DAY_MS,
  };
}

function applyFuzz(
  state: LocalSrsState,
  config: SchedulingConfig,
  now: number,
  options: ScheduleOptions | undefined,
): LocalSrsState {
  if (!config.fuzz || !options?.fuzzKey || state.phase || state.intervalDays < 1) return state;
  const days = fuzzedInterval(state.intervalDays, {
    seed: `${options.fuzzKey}:${now}`,
    maximumIntervalDays: config.maximumIntervalDays,
    dueLoad: options.dueLoad,
  });
  if (days === state.intervalDays) return state;
  return { ...state, intervalDays: days, dueAt: now + days * DAY_MS };
}

function scheduleSm2(
  prior: LocalSrsState | undefined,
  rating: LocalSrsRating,
  config: SchedulingConfig,
  now: number,
): LocalSrsState {
  const learningNew = !prior && config.learningStepsMinutes.length > 0;
  if (learningNew || (prior && isInSteps(prior))) {
    const phase: SrsPhase = prior?.phase ?? 'learning';
    const outcome = stepTransition(stepsFor(phase, config), prior?.step ?? 0, rating);
    if (outcome.kind === 'step') {
      const base: LocalSrsState = prior ?? {
        version: 2,
        algorithm: 'sm2',
        dueAt: now,
        intervalDays: 0,
        ease: LOCAL_SRS_DEFAULT_EASE,
        repetitions: 0,
        lapses: 0,
        lastReviewedAt: now,
        lastRating: rating,
      };
      return inStepState({ ...base, lastRating: rating }, phase, outcome.step, outcome.delayMinutes, now);
    }
    // Graduating is the day scheduler's first Good (1 day) or Easy (4 days) —
    // the same numbers a card without steps gets, so steps only ADD reviews.
    return scheduleLocalReview(prior ? graduated(prior) : undefined, outcome.easy ? 'easy' : 'good', now);
  }

  if (rating === 'again') {
    // Only a card in review state lapses (Anki's rule). A new card's first
    // Again with no learning steps, or an Again on a legacy interval-0 card, is
    // not a lapse: the day scheduler counts one regardless, so it is undone here.
    const raw = scheduleLocalReview(prior, 'again', now);
    const lapsed = isReviewState(prior) ? raw : { ...raw, lapses: prior?.lapses ?? 0 };
    if (!prior) return lapsed;
    const steps = config.relearningStepsMinutes;
    if (steps.length === 0) {
      // No relearning steps: Anki puts the card straight back at the minimum interval.
      return { ...lapsed, intervalDays: 1, dueAt: now + DAY_MS };
    }
    return inStepState(lapsed, 'relearning', 0, steps[0], now);
  }

  return scheduleLocalReview(prior, rating, now);
}

function scheduleFsrs(
  previous: LocalSrsState | undefined,
  rating: LocalSrsRating,
  config: SchedulingConfig,
  now: number,
): LocalSrsState {
  const weights = config.fsrsWeights ?? DEFAULT_FSRS_WEIGHTS;
  const grade = GRADES[rating];
  const prior = memoryOf(previous);
  const elapsed = elapsedDays(previous, now);
  const inSteps = previous ? isInSteps(previous) : config.learningStepsMinutes.length > 0;
  // A review less than a day after the last one is a short-term review
  // (FSRS-5's w17/w18) — the relearning step after a lapse, a learning step, a
  // card studied twice in one day. A day or more is a long-term one. This is
  // the same split the optimiser trains on.
  const memory = !prior
    ? fsrsReview(null, grade, elapsed, weights)
    : elapsed < 1
      ? fsrsShortTermReview(prior, grade, weights)
      : fsrsReview(prior, grade, elapsed, weights);

  const common = {
    version: 2 as const,
    algorithm: 'fsrs' as const,
    ease: previous?.ease ?? LOCAL_SRS_DEFAULT_EASE,
    lastReviewedAt: now,
    lastRating: rating,
    stability: memory.stability,
    difficulty: memory.difficulty,
  };
  const reviewState = (lapses: number, repetitions: number): LocalSrsState => {
    const raw = fsrsInterval(memory.stability, config.desiredRetention);
    const intervalDays = Math.min(config.maximumIntervalDays, Math.max(1, Math.round(raw)));
    return { ...common, dueAt: now + intervalDays * DAY_MS, intervalDays, repetitions, lapses };
  };

  if (inSteps) {
    const phase: SrsPhase = previous?.phase ?? 'learning';
    const outcome = stepTransition(stepsFor(phase, config), previous?.step ?? 0, rating);
    if (outcome.kind === 'step') {
      return {
        ...common,
        dueAt: now + Math.round(outcome.delayMinutes * MINUTE_MS),
        intervalDays: 0,
        repetitions: previous?.repetitions ?? 0,
        lapses: previous?.lapses ?? 0,
        phase,
        step: outcome.step,
      };
    }
    return reviewState(previous?.lapses ?? 0, (previous?.repetitions ?? 0) + 1);
  }

  if (rating === 'again') {
    // A lapse is forgetting a card in review state. A brand-new card's first
    // Again (no learning steps) is not one: Anki leaves its lapse count at 0.
    const lapses = (previous?.lapses ?? 0) + (isReviewState(previous) ? 1 : 0);
    const steps = config.relearningStepsMinutes;
    if (steps.length === 0) return reviewState(lapses, 0);
    return {
      ...common,
      dueAt: now + Math.round(steps[0] * MINUTE_MS),
      intervalDays: 0,
      repetitions: 0,
      lapses,
      phase: 'relearning',
      step: 0,
    };
  }

  return reviewState(previous?.lapses ?? 0, (previous?.repetitions ?? 0) + 1);
}

/**
 * Schedule one review under whichever algorithm the deck is configured for.
 *
 * The single entry point: nothing else in the app should call a scheduler
 * directly, or the setting stops meaning anything on that path.
 */
export function scheduleReview(
  previous: unknown,
  rating: LocalSrsRating,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
  options?: ScheduleOptions,
): LocalSrsState {
  const normalized = normalizeSchedulingConfig(config);
  const at = Number.isFinite(now) ? now : Date.now();
  const prior = adaptStateForAlgorithm(migrateSrsState(previous), normalized.algorithm);
  const next = normalized.algorithm === 'fsrs'
    ? scheduleFsrs(prior, rating, normalized, at)
    : scheduleSm2(prior, rating, normalized, at);
  return applyFuzz(applyCeiling(next, normalized, at), normalized, at, options);
}

const RATINGS: LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];

/**
 * What each of the four buttons would do, without doing it.
 *
 * The host already showed Hard/Good/Easy previews by calling the scheduler
 * three times; this makes that one call and covers Again too, so a user can see
 * that Again is a ten-minute step rather than guessing.
 */
export function previewSchedule(
  previous: unknown,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
): Record<LocalSrsRating, number> {
  const at = Number.isFinite(now) ? now : Date.now();
  const preview = {} as Record<LocalSrsRating, number>;
  for (const rating of RATINGS) {
    preview[rating] = scheduleReview(previous, rating, config, at).intervalDays;
  }
  return preview;
}

/**
 * The wait each button would produce, in (fractional) days — what a button
 * label should say. Unlike `previewSchedule` this sees a step: a 1-minute
 * learning step reads as one minute, not as a zero-day interval. Never fuzzed:
 * a preview shows the schedule, the jitter is applied when the grade lands.
 */
export function previewScheduleDelays(
  previous: unknown,
  config: SchedulingConfig = DEFAULT_SCHEDULING_CONFIG,
  now = Date.now(),
): Record<LocalSrsRating, number> {
  const at = Number.isFinite(now) ? now : Date.now();
  const preview = {} as Record<LocalSrsRating, number>;
  for (const rating of RATINGS) {
    const next = scheduleReview(previous, rating, config, at);
    preview[rating] = Math.max(0, next.dueAt - at) / DAY_MS;
  }
  return preview;
}

/**
 * Whether a lapse count just reached a leech point: the threshold itself, then
 * every half-threshold after it (Anki's rule), so a card that keeps failing is
 * flagged again rather than only once.
 */
export function isLeechLapse(lapses: number, threshold: number): boolean {
  const limit = Math.max(1, Math.floor(threshold));
  if (lapses < limit) return false;
  const every = Math.max(1, Math.ceil(limit / 2));
  return (lapses - limit) % every === 0;
}
