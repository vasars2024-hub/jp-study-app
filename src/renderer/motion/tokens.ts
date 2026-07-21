/**
 * Motion tokens (Phase 4.5) — the single source of timing truth.
 *
 * These mirror the CSS custom properties in `theme/tokens.css`. CSS-driven
 * motion reads the properties directly; JS-driven motion (springs, canvas
 * bursts, count-up tickers) reads these constants. Both are scaled by the
 * Animation Velocity setting through `applyMotionPrefs`, which rewrites the
 * CSS properties on :root — so a view that uses a token, in either language,
 * is automatically covered by the slider.
 *
 * The plan's pitfall: "route ALL animations through the shared tokens or the
 * slider silently misses hard-coded ones." A view that hard-codes `250ms` is
 * a bug, not a style choice.
 */

/** Base durations in ms at velocity 1.0x. Keep in sync with tokens.css. */
export const DURATION = {
  instant: 80,
  fast: 140,
  normal: 240,
  slow: 380,
  xslow: 640,
} as const;

export type DurationId = keyof typeof DURATION;

/** Easing curves. Keep in sync with tokens.css. */
export const EASING = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  emphasized: 'cubic-bezier(0.2, 0, 0, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
  spring: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
  glass: 'cubic-bezier(0.16, 1, 0.3, 1)',
} as const;

export type EasingId = keyof typeof EASING;

/** Velocity slider bounds. 0 is a *snap*, not a divide-by-zero. */
export const VELOCITY_MIN = 0;
export const VELOCITY_MAX = 2;

/**
 * Scale a base duration by the velocity multiplier.
 *
 * Velocity is "how slow", not "how fast": 2.0x is the *slow* end of the
 * slider (2x the duration) and 0.0x is instant. This matches the plan's
 * table ("0.0x (instant) – 2.0x (slow)").
 *
 * Velocity 0 returns 0 — callers must treat 0 as "skip to the end state"
 * rather than dividing by it or starting a zero-length animation.
 */
export function scaleDuration(baseMs: number, velocity: number): number {
  if (!Number.isFinite(baseMs) || baseMs <= 0) return 0;
  const v = clampVelocity(velocity);
  if (v === 0) return 0;
  return Math.round(baseMs * v);
}

export function clampVelocity(velocity: number): number {
  if (!Number.isFinite(velocity)) return 1;
  return Math.min(VELOCITY_MAX, Math.max(VELOCITY_MIN, velocity));
}

/** True when motion should resolve instantly (velocity snap or Disabled mode). */
export function isSnap(velocity: number): boolean {
  return clampVelocity(velocity) === 0;
}
