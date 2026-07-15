/**
 * Noctis Simulation Engine — elapsed-time evaluation D(S, delta-t).
 *
 * Implements SIMULATION_SYSTEMS.md Section 5 exactly: cushion before decay,
 * dormancy last, and hibernation as a fixed point of further evaluation.
 * Duration enters the engine exactly once, as the argument here; nothing
 * ticks, waits, or schedules (Section 1, hidden timers forbidden).
 *
 * Every process is composable: evaluating over delta-t equals evaluating over
 * any partition of delta-t into consecutive sub-intervals (Section 4), so the
 * lazy checkpoint model is exact, not approximate.
 *
 * D acts on the renewable-expression class only. It never touches legacy —
 * kTotal, memory, era, succession, network masses, population count all pass
 * through untouched (Law 5) — and the difference between presence and absence
 * is luminosity and active vitality, never legacy (Section 5).
 */

import { CivilizationState, InterpretedLearningInput } from './types';
import {
  CRYSTAL_DAMP_MAX,
  CRYSTAL_DAMP_SCALE,
  DORMANCY_ILLUMINATION_THRESHOLD,
  ENERGY_DISCHARGE_PER_MINUTE,
  LAMBDA_ACTIVITY,
  LAMBDA_CIRCULATION,
  LAMBDA_ILLUMINATION,
  LAMBDA_MOMENTUM,
  LAMBDA_RESERVOIR,
  LAMBDA_STABILITY,
  REAWAKENING_MINUTES,
} from './constants';
import { cloneState } from './state';

/**
 * Protective damping from accumulated crystal structure:
 * lambda_effective = lambda * (1 - damp), 0 <= damp < 1
 * (SIMULATION_SYSTEMS.md Section 5, Phase 2). Deep lattices slow the dimming;
 * they never stop it.
 */
function crystalDamping(crystalMass: number): number {
  return (CRYSTAL_DAMP_MAX * crystalMass) / (crystalMass + CRYSTAL_DAMP_SCALE);
}

function decayFactor(lambda: number, damping: number, minutes: number): number {
  return Math.exp(-lambda * (1 - damping) * minutes);
}

/**
 * The elapsed-time evaluation D(S, delta-t). Pure: returns a fresh snapshot,
 * never mutating its input (ARCHITECTURE.md Section 2 immutability).
 */
export function applyElapsedTime(
  state: CivilizationState,
  elapsedMinutes: number,
): CivilizationState {
  // Hibernation is a fixed point: D(S_hibernating, dt) = S_hibernating for
  // every dt. Dormancy never compounds, never deepens, never accrues debt.
  if (state.status === 'hibernating') return state;
  if (!(elapsedMinutes > 0)) return state;

  const next = cloneState(state);
  const env = next.environment;

  // Phase 1 — the energy cushion. Stored cognitive energy absorbs decay
  // first, discharging linearly (a battery supplying a constant need).
  const shieldableMinutes = env.energy / ENERGY_DISCHARGE_PER_MINUTE;
  const shieldedMinutes = Math.min(elapsedMinutes, shieldableMinutes);
  env.energy = Math.max(0, env.energy - ENERGY_DISCHARGE_PER_MINUTE * shieldedMinutes);
  const decayMinutes = elapsedMinutes - shieldedMinutes;

  if (decayMinutes > 0) {
    // Phase 2 — renewable decay, damped by protective crystal structure.
    const damping = crystalDamping(env.crystalMass);

    env.illumination *= decayFactor(LAMBDA_ILLUMINATION, damping, decayMinutes);
    env.circulation *= decayFactor(LAMBDA_CIRCULATION, damping, decayMinutes);
    env.reservoirs.brine *= decayFactor(LAMBDA_RESERVOIR, damping, decayMinutes);
    env.reservoirs.glucans *= decayFactor(LAMBDA_RESERVOIR, damping, decayMinutes);
    env.reservoirs.catalysts *= decayFactor(LAMBDA_RESERVOIR, damping, decayMinutes);
    next.citizens.activity *= decayFactor(LAMBDA_ACTIVITY, damping, decayMinutes);
    next.learning.momentum *= decayFactor(LAMBDA_MOMENTUM, damping, decayMinutes);

    // Stability is the exception: absence is quiet, not turbulence. The
    // fortification posture relaxes back toward calm (1) over elapsed time —
    // recovery, never loss, and still composable exponential form.
    env.stability = 1 - (1 - env.stability) * decayFactor(LAMBDA_STABILITY, 0, decayMinutes);

    // Phase 3 — the hibernation transition, a single structural change once
    // illumination falls beneath theta_dormancy. Population, memory, era,
    // succession, kTotal, and network masses hold exactly.
    if (env.illumination < DORMANCY_ILLUMINATION_THRESHOLD) {
      next.status = 'hibernating';
      env.illumination = 0;
      env.circulation = 0; // circulation is still
      next.citizens.activity = 0; // the citizens keep a quiet night watch indoors
      next.learning.momentum = 0;
    }
  }

  return next;
}

/**
 * Reawakening (SIMULATION_SYSTEMS.md Section 5): the first study session of
 * the canonical ten-minute length processed while hibernating transitions the
 * status back to active before the learning evaluation applies. A shorter
 * session is honored — its influence banks quietly — but the structural wake
 * awaits the canonical session, so the city does not flicker awake at a stray
 * half-minute of attention.
 */
export function wakeIfEligible(
  state: CivilizationState,
  input: InterpretedLearningInput,
): CivilizationState {
  if (state.status !== 'hibernating') return state;
  if (input.focusDuration < REAWAKENING_MINUTES) return state;

  const next = cloneState(state);
  next.status = 'active';
  // The world relights from its preserved structure: the first hearth-glow
  // returns at the dormancy threshold; the learning evaluation that follows
  // raises it further.
  next.environment.illumination = DORMANCY_ILLUMINATION_THRESHOLD;
  return next;
}
