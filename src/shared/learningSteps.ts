/**
 * Same-day learning and relearning steps — the part of an Anki schedule that
 * happens inside one sitting.
 *
 * A step list is minutes, e.g. `[1, 10]` ("1m 10m"). A card in steps is asked
 * again after the step's delay; Good moves it one step on, and past the last
 * step it graduates into the day-scale scheduler (SM-2 or FSRS). The rules are
 * Anki's v3 rules, so a user arriving from Anki finds the buttons doing what
 * they already expect:
 *
 * - Again  goes back to the first step.
 * - Hard   repeats the current step; on the first step it waits the average of
 *          the first two steps (or 1.5x a lone step, at most one day longer).
 * - Good   advances one step, or graduates after the last one.
 * - Easy   graduates immediately.
 *
 * Pure: no clock, no store. The scheduler in `flashcardScheduling.ts` decides
 * what graduating means for each algorithm.
 */
import type { LocalSrsRating } from './localSrs';

/** Where a card is inside its same-day steps. Absent on a state means "review". */
export type SrsPhase = 'learning' | 'relearning';

/** Anki's own defaults, offered as a one-click preset. */
export const ANKI_DEFAULT_LEARNING_STEPS: readonly number[] = [1, 10];
/** One ten-minute relearning step: exactly what Again always did here. */
export const DEFAULT_RELEARNING_STEPS: readonly number[] = [10];

/** One second, the finest step Anki accepts. */
export const MIN_STEP_MINUTES = 1 / 60;
/** Thirty days: anything longer is not a same-day step any more. */
export const MAX_STEP_MINUTES = 30 * 24 * 60;
export const MAX_LEARNING_STEPS = 10;

const MINUTES_PER_DAY = 24 * 60;

export type StepOutcome =
  | { kind: 'step'; step: number; delayMinutes: number }
  | { kind: 'graduate'; easy: boolean };

/** A clean step list from anything, or `fallback` when it is not one. */
export function normalizeSteps(value: unknown, fallback: readonly number[]): number[] {
  if (!Array.isArray(value)) return [...fallback];
  const out: number[] = [];
  for (const raw of value) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < MIN_STEP_MINUTES || n > MAX_STEP_MINUTES) return [...fallback];
    out.push(Math.round(n * 60) / 60);
    if (out.length > MAX_LEARNING_STEPS) return [...fallback];
  }
  return out;
}

const UNIT_MINUTES: Record<string, number> = { s: 1 / 60, m: 1, h: 60, d: MINUTES_PER_DAY };

/**
 * `"1m 10m 1h 2d"` → `[1, 10, 60, 2880]`. A bare number is minutes, as in
 * Anki. Returns `null` for anything that does not parse, so a typo is refused
 * rather than silently dropping a step. An empty string is an empty list
 * (no steps), which is a legitimate setting.
 */
export function parseStepList(text: string): number[] | null {
  const tokens = text.trim().split(/[\s,]+/).filter(Boolean);
  const out: number[] = [];
  for (const token of tokens) {
    const match = /^(\d+(?:\.\d+)?)([smhd]?)$/i.exec(token);
    if (!match) return null;
    const minutes = Number(match[1]) * UNIT_MINUTES[(match[2] || 'm').toLowerCase()];
    if (!Number.isFinite(minutes) || minutes < MIN_STEP_MINUTES || minutes > MAX_STEP_MINUTES) return null;
    out.push(Math.round(minutes * 60) / 60);
  }
  if (out.length > MAX_LEARNING_STEPS) return null;
  return out;
}

/** The inverse of `parseStepList`, in the largest whole unit for each step. */
export function formatStepList(steps: readonly number[]): string {
  return steps
    .map((minutes) => {
      if (minutes >= MINUTES_PER_DAY && minutes % MINUTES_PER_DAY === 0) return `${minutes / MINUTES_PER_DAY}d`;
      if (minutes >= 60 && minutes % 60 === 0) return `${minutes / 60}h`;
      if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes}m`;
      return `${Math.round(minutes * 60)}s`;
    })
    .join(' ');
}

/** The Hard delay on the first step (Anki v3). */
function hardDelayOnFirstStep(steps: readonly number[]): number {
  if (steps.length > 1) return (steps[0] + steps[1]) / 2;
  return Math.min(steps[0] * 1.5, steps[0] + MINUTES_PER_DAY);
}

/**
 * What one rating does to a card at `currentStep` of `steps`.
 *
 * `steps` must be non-empty: with no steps there is nothing same-day to do and
 * the caller graduates (or relapses) straight into the day scheduler.
 */
export function stepTransition(
  steps: readonly number[],
  currentStep: number,
  rating: LocalSrsRating,
): StepOutcome {
  if (steps.length === 0) return { kind: 'graduate', easy: rating === 'easy' };
  const current = Math.max(0, Math.min(steps.length - 1, Math.floor(currentStep) || 0));
  switch (rating) {
    case 'again':
      return { kind: 'step', step: 0, delayMinutes: steps[0] };
    case 'hard':
      return {
        kind: 'step',
        step: current,
        delayMinutes: current === 0 ? hardDelayOnFirstStep(steps) : steps[current],
      };
    case 'good': {
      const next = current + 1;
      if (next >= steps.length) return { kind: 'graduate', easy: false };
      return { kind: 'step', step: next, delayMinutes: steps[next] };
    }
    default:
      return { kind: 'graduate', easy: true };
  }
}

/** True for a state that is still inside its same-day steps. */
export function isInSteps(state: { phase?: SrsPhase } | null | undefined): boolean {
  return state?.phase === 'learning' || state?.phase === 'relearning';
}
