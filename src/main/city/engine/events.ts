/**
 * Noctis Simulation Engine — the transition observation E(I|none, S, S'').
 *
 * The four foundational world events (SIMULATION_SYSTEMS.md Section 12;
 * ARCHITECTURE.md Section 6) — a closed set no domain may extend. Each is an
 * edge-triggered noticing derived by comparing two committed snapshots: flags
 * carry no payload, mint nothing, and never modify state. Emitted in the
 * canonical row order of NOCTIS_ECOLOGICAL_ENGINE.md section 7.
 *
 * Finer domain transitions (vault breaches, succession advances, era
 * turnings) are committed-state changes read from the snapshot itself — they
 * are deliberately NOT flags (Section 12, domain transitions).
 */

import { CivilizationState, EngineEventFlag, InterpretedLearningInput } from './types';
import {
  CONSISTENCY_PLUME_TRIGGER_DAYS,
  SHOCK_DIFFICULTY_MIN,
  SHOCK_STABILITY_THRESHOLD,
} from './constants';

/**
 * Deterministic flag generator over the before/after pair of one committed
 * evaluation. Pure; identical inputs yield the identical ordered list.
 */
export function evaluateEvents(
  input: InterpretedLearningInput | null,
  before: CivilizationState,
  after: CivilizationState,
): EngineEventFlag[] {
  const flags: EngineEventFlag[] = [];

  // Row 1 — THE_PHEROMONE_PLUME: consistency reaches the canonical
  // three-consecutive-day trigger; the moth season activates. Edge-triggered:
  // fires on the crossing, not while the season persists.
  if (
    before.learning.consistency < CONSISTENCY_PLUME_TRIGGER_DAYS &&
    after.learning.consistency >= CONSISTENCY_PLUME_TRIGGER_DAYS
  ) {
    flags.push('THE_PHEROMONE_PLUME');
  }

  // Row 2 — BAROMETRIC_SHOCK_WAVE: atmospheric stability crosses below its
  // shock threshold under a difficulty signal. Protective fortification
  // posture; no loss.
  if (
    input !== null &&
    input.difficulty >= SHOCK_DIFFICULTY_MIN &&
    before.environment.stability >= SHOCK_STABILITY_THRESHOLD &&
    after.environment.stability < SHOCK_STABILITY_THRESHOLD
  ) {
    flags.push('BAROMETRIC_SHOCK_WAVE');
  }

  // Row 3 — ABYSSAL_DOUSE: the observed active-to-hibernating transition.
  // Safe dormancy, a fixed point of further decay.
  if (before.status === 'active' && after.status === 'hibernating') {
    flags.push('ABYSSAL_DOUSE');
  }

  // Row 4 — BENTHIC_BLOOM: research readiness crossed an emergence threshold
  // under a completion input (the crossing is committed by metabolism as
  // bloomsCrossed; an era boundary may be crossed in the same evaluation —
  // that is committed state, not a flag).
  if (after.technology.bloomsCrossed > before.technology.bloomsCrossed) {
    flags.push('BENTHIC_BLOOM');
  }

  return flags;
}
