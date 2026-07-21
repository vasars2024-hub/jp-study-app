import { CivilizationState, EconomyState, InterpretedLearningInput } from './types';
import { mean, saturating, unit } from './math';

export function proposeEconomy(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): EconomyState {
  const effort = saturating(Math.max(input.focusDuration, input.profile.revisionStrength * 2), 120);
  const productiveCapacity = Math.max(prior.economy.productiveCapacity, unit(mean([
    prior.citizen.activity,
    prior.technology.activePractice,
    prior.ecology.stability,
  ])));
  const distributionReach = Math.max(prior.economy.distributionReach, unit(mean([
    prior.ecology.circulationReach,
    prior.technology.adoptionReach,
    prior.citizen.adaptationBreadth,
  ])));
  const institutionalCoordination = Math.max(prior.economy.institutionalCoordination, unit(mean([
    prior.citizen.institutionalParticipation,
    prior.culture.institutionalContinuity,
    input.profile.sustainedAttention,
  ])));
  const maintenanceResilience = Math.max(prior.economy.maintenanceResilience, unit(mean([
    input.profile.retention,
    input.profile.revisionStrength,
    prior.technology.heritage,
    prior.ecology.stability,
  ])));
  const regionalIntegration = Math.max(prior.economy.regionalIntegration, unit(mean([
    distributionReach,
    institutionalCoordination,
    prior.citizen.roleDifferentiation,
  ])));
  const specialistSupport = Math.max(prior.economy.specialistSupport, unit(mean([
    prior.citizen.roleDifferentiation,
    prior.technology.researchReadiness,
    prior.learning.securedDepth,
  ])));
  const xEconomy = Math.max(prior.economy.xEconomy, unit(mean([
    productiveCapacity,
    distributionReach,
    institutionalCoordination,
    maintenanceResilience,
    regionalIntegration,
    specialistSupport,
  ])));

  return {
    activeCoordination: unit(prior.economy.activeCoordination + effort * (0.12 + input.profile.sustainedAttention * 0.28)),
    productiveCapacity,
    distributionReach,
    institutionalCoordination,
    maintenanceResilience,
    regionalIntegration,
    specialistSupport,
    xEconomy,
  };
}
