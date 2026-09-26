// Daily study goal: how many reviews, how many new cards and how many minutes
// today, against a target. The pure half — targets, their defaults, the
// up/down step, and "today's progress" counted from the review log and the
// day's study seconds. Persistence and the React hook live in
// `renderer/dailyGoal.ts`.
//
// Progress is never stored. It is recounted from the same review log and
// statistics the Statistics window reads, for the local calendar day that
// contains `now`, so the goal resets at local midnight by construction and can
// never disagree with Statistics about what was done today.

import type { ReviewLogEntry } from './reviewLog';

export type DailyGoalMetric = 'reviews' | 'newCards' | 'minutes';

export const DAILY_GOAL_METRICS: readonly DailyGoalMetric[] = ['reviews', 'newCards', 'minutes'];

export type DailyGoalTargets = Record<DailyGoalMetric, number>;
export type DailyGoalProgress = Record<DailyGoalMetric, number>;

/** One press of − / + moves a target by this much. */
export const DAILY_GOAL_STEP: Readonly<DailyGoalTargets> = { reviews: 10, newCards: 5, minutes: 5 };

/** Upper bound per target; 0 is the lower bound and means "not part of today's goal". */
export const DAILY_GOAL_MAX: Readonly<DailyGoalTargets> = { reviews: 2000, newCards: 500, minutes: 600 };

/** New-card allowance when the active profile does not set `newPerDay`. */
export const DAILY_GOAL_FALLBACK_NEW = 10;
/** Reviews per new card: the usual steady-state load of a spaced-repetition deck. */
export const DAILY_GOAL_REVIEWS_PER_NEW = 5;
export const DAILY_GOAL_DEFAULT_MINUTES = 30;

function clampTarget(metric: DailyGoalMetric, value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(DAILY_GOAL_MAX[metric], Math.round(value)));
}

/**
 * Targets derived from the active study profile: the profile's own new-card
 * allowance (the one the flashcard scheduler already enforces), reviews at five
 * per new card, and half an hour of reading or watching.
 */
export function defaultDailyGoalTargets(newPerDay?: number): DailyGoalTargets {
  const perDay =
    typeof newPerDay === 'number' && Number.isFinite(newPerDay) && newPerDay >= 0
      ? Math.round(newPerDay)
      : DAILY_GOAL_FALLBACK_NEW;
  return {
    newCards: clampTarget('newCards', perDay),
    reviews: clampTarget('reviews', Math.max(DAILY_GOAL_STEP.reviews, perDay * DAILY_GOAL_REVIEWS_PER_NEW)),
    minutes: DAILY_GOAL_DEFAULT_MINUTES,
  };
}

/**
 * The user's own targets, as stored. Only the metrics the user has changed are
 * present; the rest keep following the profile, so switching to a profile with
 * a different `newPerDay` moves every target the user never touched.
 */
export type DailyGoalOverrides = Partial<DailyGoalTargets>;

export function normalizeDailyGoalOverrides(value: unknown): DailyGoalOverrides {
  if (!value || typeof value !== 'object') return {};
  const raw = value as Record<string, unknown>;
  const out: DailyGoalOverrides = {};
  for (const metric of DAILY_GOAL_METRICS) {
    const v = raw[metric];
    if (typeof v === 'number' && Number.isFinite(v)) out[metric] = clampTarget(metric, v);
  }
  return out;
}

export function resolveDailyGoalTargets(overrides: DailyGoalOverrides, newPerDay?: number): DailyGoalTargets {
  const defaults = defaultDailyGoalTargets(newPerDay);
  const out = { ...defaults };
  for (const metric of DAILY_GOAL_METRICS) {
    const v = overrides[metric];
    if (typeof v === 'number') out[metric] = clampTarget(metric, v);
  }
  return out;
}

/**
 * Move one target a step up (`+1`) or down (`-1`), clamped to 0…max. Returns
 * the new overrides. A target moved back onto its profile default is dropped
 * from the overrides, so it follows the profile again.
 */
export function adjustDailyGoalTarget(
  overrides: DailyGoalOverrides,
  metric: DailyGoalMetric,
  direction: 1 | -1,
  newPerDay?: number,
): DailyGoalOverrides {
  const current = resolveDailyGoalTargets(overrides, newPerDay)[metric];
  const step = DAILY_GOAL_STEP[metric];
  // Snap to the step grid first, so a profile default of 15 new cards goes
  // 15 → 20 → 15 → 10 rather than drifting off the grid forever.
  const next =
    direction > 0
      ? (Math.floor(current / step) + 1) * step
      : (Math.ceil(current / step) - 1) * step;
  const value = clampTarget(metric, next);
  const out = { ...overrides };
  if (value === defaultDailyGoalTargets(newPerDay)[metric]) delete out[metric];
  else out[metric] = value;
  return out;
}

/** [start, end) of the local calendar day containing `now`, epoch ms. */
export function localDayBounds(now = Date.now()): { start: number; end: number } {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start: start.getTime(), end: end.getTime() };
}

/**
 * Today's progress. `reviews` and `newCards` come from the review log's
 * flashcard-review rows (practice and grammar answers are not reviews);
 * `studySecondsToday` is the day's reading plus watching time from the study
 * statistics.
 */
export function dailyGoalProgress(
  entries: readonly ReviewLogEntry[],
  studySecondsToday: number,
  now = Date.now(),
): DailyGoalProgress {
  const { start, end } = localDayBounds(now);
  let reviews = 0;
  let newCards = 0;
  for (const entry of entries) {
    if (entry.mode !== 'review' || entry.at < start || entry.at >= end) continue;
    reviews += 1;
    if (entry.isNew) newCards += 1;
  }
  const seconds = Number.isFinite(studySecondsToday) ? Math.max(0, studySecondsToday) : 0;
  return { reviews, newCards, minutes: Math.floor(seconds / 60) };
}

/** 0…1 share of one target reached; a target of 0 is not part of the goal and reads null. */
export function dailyGoalRatio(
  progress: DailyGoalProgress,
  targets: DailyGoalTargets,
  metric: DailyGoalMetric,
): number | null {
  const target = targets[metric];
  if (target <= 0) return null;
  return Math.min(1, Math.max(0, progress[metric] / target));
}

/** True when every metric that has a target is met (and at least one has a target). */
export function dailyGoalMet(progress: DailyGoalProgress, targets: DailyGoalTargets): boolean {
  const active = DAILY_GOAL_METRICS.filter((m) => targets[m] > 0);
  return active.length > 0 && active.every((m) => progress[m] >= targets[m]);
}
