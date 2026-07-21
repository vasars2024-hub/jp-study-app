import { BLOOM_READINESS, CONSISTENCY_TRIGGER_DAYS, SHOCK_DIFFICULTY, SHOCK_STABILITY } from './constants';
import { CivilizationState, EngineEventFlag, InterpretedLearningInput } from './types';

/** Canonical order makes otherwise simultaneous flags deterministic. */
export function deriveEventFlags(
  before: CivilizationState,
  after: CivilizationState,
  input?: InterpretedLearningInput,
): EngineEventFlag[] {
  const flags: EngineEventFlag[] = [];
  if (before.learning.consistency < CONSISTENCY_TRIGGER_DAYS
    && after.learning.consistency >= CONSISTENCY_TRIGGER_DAYS) {
    flags.push('THE_PHEROMONE_PLUME');
  }
  if (input
    && input.difficulty >= SHOCK_DIFFICULTY
    && before.ecology.stability >= SHOCK_STABILITY
    && after.ecology.stability < SHOCK_STABILITY) {
    flags.push('BAROMETRIC_SHOCK_WAVE');
  }
  if (before.status === 'active' && after.status === 'hibernating') {
    flags.push('ABYSSAL_DOUSE');
  }
  if (before.technology.researchReadiness < BLOOM_READINESS
    && after.technology.researchReadiness >= BLOOM_READINESS) {
    flags.push('BENTHIC_BLOOM');
  }
  return flags;
}
