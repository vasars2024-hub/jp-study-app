/**
 * Damped-spring helper (Phase 4.5) — pure, framework-free.
 *
 * Used for motion that must be *interruptible*: a second view switch mid-slide
 * retargets from the current position and velocity instead of queueing or
 * restarting (the plan's pitfall — queued animations feel slower than none).
 * Because a spring carries its own state, retargeting is just assigning `to`.
 *
 * Semi-implicit Euler with a clamped sub-step: a long frame (dragged window,
 * GC pause) must not explode the integration.
 */

export interface SpringConfig {
  /** Angular frequency — higher is snappier. */
  stiffness: number;
  /** 1 = critically damped (no overshoot), <1 overshoots, >1 is sluggish. */
  damping: number;
  /** Distance + velocity below which the spring is considered at rest. */
  restDelta?: number;
}

export interface SpringState {
  value: number;
  velocity: number;
  to: number;
}

/**
 * Note: deliberately annotated rather than `as const satisfies` — this repo
 * pins typescript ~4.5 for eslint, whose parser cannot read `satisfies` and
 * fails the whole file.
 */
export const SPRING_PRESETS: Record<'pop' | 'slide' | 'meter' | 'toss', SpringConfig> = {
  /** Popups/modals: a touch of overshoot, settles fast. */
  pop: { stiffness: 26, damping: 0.68 },
  /** Viewport slides: confident, no overshoot. */
  slide: { stiffness: 18, damping: 1 },
  /** Meters/bars: smooth, never bouncy — a bouncing progress bar reads as a bug. */
  meter: { stiffness: 12, damping: 1 },
  /** Drag-throw / squash: loose and physical. */
  toss: { stiffness: 34, damping: 0.5 },
};

const MAX_STEP = 1 / 60;
const DEFAULT_REST_DELTA = 0.01;

export function createSpring(value: number, to = value): SpringState {
  return { value, velocity: 0, to };
}

/**
 * Advance a spring by `dt` seconds. Mutates and returns the state so a rAF
 * loop allocates nothing per frame.
 */
export function stepSpring(state: SpringState, cfg: SpringConfig, dt: number): SpringState {
  if (!Number.isFinite(dt) || dt <= 0) return state;
  // Clamp total elapsed: beyond ~0.1s a stiff spring integrates unstably.
  let remaining = Math.min(0.1, dt);
  const k = cfg.stiffness;
  const c = 2 * cfg.damping * Math.sqrt(Math.max(0, k));
  while (remaining > 0) {
    const h = Math.min(MAX_STEP, remaining);
    remaining -= h;
    const displacement = state.value - state.to;
    const accel = -k * displacement - c * state.velocity;
    state.velocity += accel * h;
    state.value += state.velocity * h;
  }
  if (isSpringAtRest(state, cfg)) {
    state.value = state.to;
    state.velocity = 0;
  }
  return state;
}

export function isSpringAtRest(state: SpringState, cfg: SpringConfig): boolean {
  const rest = cfg.restDelta ?? DEFAULT_REST_DELTA;
  return Math.abs(state.value - state.to) < rest && Math.abs(state.velocity) < rest;
}

/**
 * Retarget without losing momentum — the interruptible path. Passing the same
 * target is a no-op, so calling this every render is safe.
 */
export function retargetSpring(state: SpringState, to: number): SpringState {
  state.to = to;
  return state;
}

/** Jump to the target immediately (velocity 0 / Disabled mode). */
export function snapSpring(state: SpringState, to = state.to): SpringState {
  state.to = to;
  state.value = to;
  state.velocity = 0;
  return state;
}
