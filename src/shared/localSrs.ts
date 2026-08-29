// Local-deck spaced repetition. An Anki-exported copy remains scheduled by
// Anki itself; this contract controls only the card in `jp-flashcard-deck`.

export type LocalSrsRating = 'again' | 'hard' | 'good' | 'easy';

export interface LocalSrsState {
  version: 1;
  dueAt: number;
  intervalDays: number;
  ease: number;
  repetitions: number;
  lapses: number;
  lastReviewedAt: number;
  lastRating: LocalSrsRating;
}

export const LOCAL_SRS_RELEARN_MINUTES = 10;
export const LOCAL_SRS_DEFAULT_EASE = 2.5;
export const LOCAL_SRS_MIN_EASE = 1.3;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_INTERVAL_DAYS = 36_500;

export function isLocalSrsState(value: unknown): value is LocalSrsState {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<LocalSrsState>;
  return (
    state.version === 1 &&
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
      version: 1,
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
      version: 1,
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
      version: 1,
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
    version: 1,
    dueAt: now + intervalDays * DAY_MS,
    intervalDays,
    ease: prior?.ease ?? LOCAL_SRS_DEFAULT_EASE,
    repetitions,
    lapses: prior?.lapses ?? 0,
    lastReviewedAt: now,
    lastRating: rating,
  };
}
