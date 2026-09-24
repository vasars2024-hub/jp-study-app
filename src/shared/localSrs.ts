// Local-deck spaced repetition. An Anki-exported copy remains scheduled by
// Anki itself; this contract controls only the card in `jp-flashcard-deck`.

export type LocalSrsRating = 'again' | 'hard' | 'good' | 'easy';

/** Which scheduler produced a state. Absent on every version-1 state, which
 *  predates the choice and was always SM-2. */
export type LocalSrsAlgorithm = 'sm2' | 'fsrs';

/**
 * 1: the original SM-2 shape, still on disk in every deck written before the
 *    scheduler became configurable. It is read, never written.
 * 2: adds the FSRS memory pair and records which scheduler wrote the state, so
 *    a deck whose algorithm was switched is detectable rather than silently
 *    rescheduled against numbers that mean something else.
 */
export type LocalSrsVersion = 1 | 2;

export interface LocalSrsState {
  version: LocalSrsVersion;
  dueAt: number;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: number;
  lastRating: LocalSrsRating;
  /** Version 2 only, and only when FSRS wrote it. Days to 90% recall. */
  stability?: number;
  /** Version 2 only, and only when FSRS wrote it. 1..10. */
  difficulty?: number;
  /** Version 2 only. Read a missing value as `sm2`. */
  algorithm?: LocalSrsAlgorithm;
}

export const LOCAL_SRS_RELEARN_MINUTES = 10;
export const LOCAL_SRS_DEFAULT_EASE = 2.5;
export const LOCAL_SRS_MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 36_500;

/** Optional in the type, so absent passes; present must still be sane. */
function optionalNumber(value: unknown, low: number, high: number): boolean {
  if (value === undefined) return true;
  return typeof value === 'number' && Number.isFinite(value) && value >= low && value <= high;
}

export function isLocalSrsState(value: unknown): value is LocalSrsState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<LocalSrsState>;
  if (!optionalNumber(state.stability, 0, 36_500)) return false;
  if (!optionalNumber(state.difficulty, 1, 10)) return false;
  if (state.algorithm !== undefined && state.algorithm !== 'sm2' && state.algorithm !== 'fsrs') {
    return false;
  }
  return (
    (state.version === 1 || state.version === 2) &&
    typeof state.dueAt === 'number' && Number.isFinite(state.dueAt) && state.dueAt >= 0 &&
    typeof state.intervalDays === 'number' && Number.isFinite(state.intervalDays) && state.intervalDays >= 0 &&
    typeof state.ease === 'number' && Number.isFinite(state.ease) && state.ease >= LOCAL_SRS_MIN_EASE &&
    typeof state.repetitions === 'number' && Number.isInteger(state.repetitions) && state.repetitions >= 0 &&
    typeof state.lapses === 'number' && Number.isInteger(state.lapses) && state.lapses >= 0 &&
    typeof state.lastReviewedAt === 'number' && Number.isFinite(state.lastReviewedAt) && state.lastReviewedAt >= 0 &&
    ['again', 'hard', 'good', 'easy'].includes(state.lastRating ?? '')
  );
}

/** Unscheduled legacy cards are due so every existing deck can enter SRS. */
export function isLocalReviewDue(state: unknown, now = Date.now()): boolean {
  return !isLocalSrsState(state) || state.dueAt <= now;
}

export function filterLocalReviewsDue<T extends { srs?: unknown }>(
  cards: readonly T[],
  now = Date.now(),
): T[] {
  return cards.filter((card) => isLocalReviewDue(card.srs, now));
}

/**
 * Cap how many never-reviewed cards a sitting may introduce today.
 *
 * Every unscheduled card is due by definition (see `isLocalReviewDue`), so a
 * freshly imported 3,000-card deck used to put all 3,000 in front of the user
 * at once. Scheduled cards always pass; unscheduled ones pass in deck order
 * until `newPerDay` minus the cards already introduced today is used up.
 * `newPerDay` undefined means no cap (the profile does not set one).
 */
export function limitNewCards<T extends { srs?: unknown }>(
  cards: readonly T[],
  newPerDay: number | undefined,
  introducedToday: number,
): T[] {
  if (newPerDay === undefined || !Number.isFinite(newPerDay)) return [...cards];
  let remaining = Math.max(0, Math.floor(newPerDay) - Math.max(0, introducedToday));
  const out: T[] = [];
  for (const card of cards) {
    if (isLocalSrsState(card.srs)) {
      out.push(card);
    } else if (remaining > 0) {
      out.push(card);
      remaining -= 1;
    }
  }
  return out;
}

/** Cards whose first review happened on the local day containing `now`. */
export function countIntroducedToday(
  cards: readonly { introducedAt?: number }[],
  now = Date.now(),
): number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  let n = 0;
  for (const card of cards) {
    if (typeof card.introducedAt === 'number' && card.introducedAt >= from && card.introducedAt <= now) n += 1;
  }
  return n;
}

/**
 * An SM-2-style four-button schedule. Again starts a ten-minute relearning
 * step; Hard grows slowly and lowers ease; Good graduates through 1 and 3 days;
 * Easy starts at four days and raises ease.
 */
export function scheduleLocalReview(
  previous: unknown,
  rating: LocalSrsRating,
  reviewedAt = Date.now(),
): LocalSrsState {
  const prior = isLocalSrsState(previous) ? previous : undefined;
  const now = Number.isFinite(reviewedAt) ? reviewedAt : Date.now();

  if (rating === 'again') {
    const ease = Math.max(LOCAL_SRS_MIN_EASE, (prior?.ease ?? LOCAL_SRS_DEFAULT_EASE) - 0.2);
    return {
      version: 2,
      algorithm: 'sm2',
      dueAt: now + LOCAL_SRS_RELEARN_MINUTES * 60 * 1000,
      intervalDays: 0,
      ease,
      repetitions: 0,
      lapses: (prior?.lapses ?? 0) + 1,
      lastReviewedAt: now,
      lastRating: rating,
    };
  }

  if (rating === 'hard') {
    const repetitions = (prior?.repetitions ?? 0) + 1;
    const intervalDays = prior?.repetitions
      ? Math.max(1, Math.min(MAX_INTERVAL_DAYS, Math.round((prior.intervalDays || 1) * 1.2)))
      : 0.5;
    const ease = Math.max(LOCAL_SRS_MIN_EASE, (prior?.ease ?? LOCAL_SRS_DEFAULT_EASE) - 0.15);
    return {
      version: 2,
      algorithm: 'sm2',
      dueAt: now + intervalDays * DAY_MS,
      intervalDays,
      ease,
      repetitions,
      lapses: prior?.lapses ?? 0,
      lastReviewedAt: now,
      lastRating: rating,
    };
  }

  if (rating === 'easy') {
    const repetitions = (prior?.repetitions ?? 0) + 1;
    const ease = (prior?.ease ?? LOCAL_SRS_DEFAULT_EASE) + 0.15;
    const intervalDays = repetitions === 1
      ? 4
      : Math.min(
          MAX_INTERVAL_DAYS,
          Math.max(4, Math.round((prior?.intervalDays || 1) * ease * 1.3)),
        );
    return {
      version: 2,
      algorithm: 'sm2',
      dueAt: now + intervalDays * DAY_MS,
      intervalDays,
      ease,
      repetitions,
      lapses: prior?.lapses ?? 0,
      lastReviewedAt: now,
      lastRating: rating,
    };
  }

  const repetitions = (prior?.repetitions ?? 0) + 1;
  const intervalDays = repetitions === 1
    ? 1
    : repetitions === 2
      ? 3
      : Math.min(
          MAX_INTERVAL_DAYS,
          Math.max(1, Math.round((prior?.intervalDays || 1) * (prior?.ease ?? LOCAL_SRS_DEFAULT_EASE))),
        );
  return {
    version: 2,
    algorithm: 'sm2',
    dueAt: now + intervalDays * DAY_MS,
    intervalDays,
    ease: prior?.ease ?? LOCAL_SRS_DEFAULT_EASE,
    repetitions,
    lapses: prior?.lapses ?? 0,
    lastReviewedAt: now,
    lastRating: rating,
  };
}
