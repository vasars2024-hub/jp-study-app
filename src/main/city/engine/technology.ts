import { CivilizationState, InterpretedLearningInput, TechnologyState } from './types';
import { mean, saturating, unit } from './math';

export function proposeTechnology(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): TechnologyState {
  const effort = saturating(Math.max(input.focusDuration, input.profile.revisionStrength * 2), 120);
  const readinessCandidate = unit(mean([
    prior.learning.securedDepth,
    input.profile.conceptualDepth,
    input.profile.mastery,
    input.profile.novelty,
    saturating(prior.learning.kTotal, 420),
  ]));
  const researchReadiness = Math.max(prior.technology.researchReadiness, readinessCandidate);
  const heritage = Math.max(prior.technology.heritage, unit(mean([
    input.profile.retention,
    input.profile.revisionStrength,
    saturating(prior.learning.sessions, 90),
  ])));
  const adoptionReach = Math.max(prior.technology.adoptionReach, unit(mean([
    prior.citizen.skillTransmission,
    prior.citizen.institutionalParticipation,
    prior.ecology.circulationReach,
  ])));
  const infrastructureMaturity = Math.max(prior.technology.infrastructureMaturity, unit(mean([
    heritage,
    adoptionReach,
    prior.ecology.xEcology,
    prior.economy.maintenanceResilience,
  ])));
  const xTechnology = Math.max(prior.technology.xTechnology, unit(mean([
    researchReadiness,
    heritage,
    adoptionReach,
    infrastructureMaturity,
  ])));

  return {
    researchReadiness,
    heritage,
    activePractice: unit(prior.technology.activePractice + effort * (0.18 + input.profile.conceptualDepth * 0.34)),
    adoptionReach,
    infrastructureMaturity,
    bloomsCrossed: prior.technology.bloomsCrossed,
    xTechnology,
  };
}
