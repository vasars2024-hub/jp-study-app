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
 */
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInterval,
  fsrsReview,
  type FsrsGrade,
  type FsrsMemory,
} from './fsrs';
import {
  LOCAL_SRS_DEFAULT_EASE,
  LOCAL_SRS_MIN_EASE,
  LOCAL_SRS_RELEARN_MINUTES,
  isLocalSrsState,
  scheduleLocalReview,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from './localSrs';

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_CEILING = 36_500;

export interface SchedulingConfig {
  algorithm: LocalSrsAlgorithm;
  /**
   * FSRS only: the recall probability the intervals aim at. Higher means being
   * asked more often, not less — 0.95 is a stricter standard than 0.90.
   */
  desiredRetention: number;
  /** Both schedulers. A hard ceiling the user can lower; never raises one. */
  maximumIntervalDays: number;
}

export const DEFAULT_SCHEDULING_CONFIG: SchedulingConfig = {
  // SM-2, because it is what every existing deck is already scheduled by.
  algorithm: 'sm2',
  desiredRetention: 0.9,
  maximumIntervalDays: MAX_INTERVAL_CEILING,
};

export const MIN_LOCAL_RETENTION = 0.7;
export const MAX_LOCAL_RETENTION = 0.97;

export function normalizeSchedulingConfig(
  value?: Partial<SchedulingConfig> | null,
): SchedulingConfig {
  const retention = Number(value?.desiredRetention);
  const maximum = Number(value?.maximumIntervalDays);
  return {
    algorithm: value?.algorithm === 'fsrs' ? 'fsrs' : 'sm2',
    desiredRetention: Number.isFinite(retention)
      ? Math.min(MAX_LOCAL_RETENTION, Math.max(MIN_LOCAL_RETENTION, retention))
      : DEFAULT_SCHEDULING_CONFIG.desiredRetention,
    maximumIntervalDays: Number.isFinite(maximum) && maximum >= 1
      ? Math.min(MAX_INTERVAL_CEILING, Math.floor(maximum))
      : DEFAULT_SCHEDULING_CONFIG.maximumIntervalDays,
  };
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
  return carried;
}

function elapsedDays(state: LocalSrsState | undefined, now: number): number {
  if (!state?.lastReviewedAt) return 0;
  return Math.max(0, (now - state.lastReviewedAt) / DAY_MS);
}

function scheduleFsrs(
  previous: LocalSrsState | undefined,
  rating: LocalSrsRating,
  config: SchedulingConfig,
  now: number,
): LocalSrsState {
  const memory = fsrsReview(
    memoryOf(previous),
    GRADES[rating],
    elapsedDays(previous, now),
    DEFAULT_FSRS_WEIGHTS,
  );

  // A lapse goes to the same fixed relearning step as the SM-2 path. FSRS's
  // same-day short-term steps are not implemented, and presenting a sub-day
  // number from the long-term model as if they were would be a false claim.
  if (rating === 'again') {
    return {
      version: 2,
      algorithm: 'fsrs',
      dueAt: now + LOCAL_SRS_RELEARN_MINUTES * 60 * 1000,
      intervalDays: 0,
      ease: previous?.ease ?? LOCAL_SRS_DEFAULT_EASE,
      repetitions: 0,
      lapses: (previous?.lapses ?? 0) + 1,
      lastReviewedAt: now,
      lastRating: rating,
      stability: memory.stability,
      difficulty: memory.difficulty,
    };
  }

  const raw = fsrsInterval(memory.stability, config.desiredRetention);
  const intervalDays = Math.min(
    config.maximumIntervalDays,
    Math.max(1, Math.round(raw)),
  );
  return {
    version: 2,
    algorithm: 'fsrs',
    dueAt: now + intervalDays * DAY_MS,
    intervalDays,
    ease: previous?.ease ?? LOCAL_SRS_DEFAULT_EASE,
    repetitions: (previous?.repetitions ?? 0) + 1,
    lapses: previous?.lapses ?? 0,
    lastReviewedAt: now,
    lastRating: rating,
    stability: memory.stability,
    difficulty: memory.difficulty,
  };
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
): LocalSrsState {
  const normalized = normalizeSchedulingConfig(config);
  const at = Number.isFinite(now) ? now : Date.now();
  const prior = adaptStateForAlgorithm(migrateSrsState(previous), normalized.algorithm);

  if (normalized.algorithm === 'fsrs') return scheduleFsrs(prior, rating, normalized, at);

  const next = scheduleLocalReview(prior, rating, at);
  if (next.intervalDays <= normalized.maximumIntervalDays) return next;
  // The ceiling is the user's, so it caps the due date too rather than being a
  // display-only number that the schedule ignores.
  return {
    ...next,
    intervalDays: normalized.maximumIntervalDays,
    dueAt: at + normalized.maximumIntervalDays * DAY_MS,
  };
}

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
  const ratings: LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];
  const preview = {} as Record<LocalSrsRating, number>;
  for (const rating of ratings) {
    preview[rating] = scheduleReview(previous, rating, config, at).intervalDays;
  }
  return preview;
}
