import { CivilizationState, CitizenState, InterpretedLearningInput } from './types';
import { mean, saturating, unit } from './math';

export function proposeCitizen(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): CitizenState {
  const effort = saturating(Math.max(input.focusDuration, input.profile.revisionStrength * 2), 100);
  const adaptationBreadth = Math.max(prior.citizen.adaptationBreadth, unit(mean([
    input.profile.disciplinaryExposure,
    input.profile.interdisciplinaryConnection,
    input.profile.curiosity,
  ])));
  const roleDifferentiation = Math.max(prior.citizen.roleDifferentiation, unit(mean([
    prior.learning.securedBreadth,
    adaptationBreadth,
    prior.ecology.photophoreDiversity,
  ])));
  const institutionalParticipation = Math.max(prior.citizen.institutionalParticipation, unit(mean([
    saturating(prior.learning.sessions, 60),
    input.profile.sustainedAttention,
    prior.culture.institutionalContinuity,
  ])));
  const skillTransmission = Math.max(prior.citizen.skillTransmission, unit(mean([
    input.profile.retention,
    input.profile.revisionStrength,
    prior.learning.securedDepth,
  ])));
  const xCitizen = Math.max(prior.citizen.xCitizen, unit(mean([
    adaptationBreadth,
    roleDifferentiation,
    institutionalParticipation,
    skillTransmission,
    saturating(prior.citizen.population - 3, 80),
  ])));
  const habitatSupport = mean([prior.ecology.xEcology, prior.ecology.stability, prior.ecology.circulationReach]);
  const supportedPopulation = 3 + Math.floor(120 * unit(habitatSupport * 0.65 + xCitizen * 0.35));

  return {
    population: Math.max(prior.citizen.population, supportedPopulation),
    activity: unit(prior.citizen.activity + effort * (0.16 + input.profile.sustainedAttention * 0.3)),
    adaptationBreadth,
    roleDifferentiation,
    institutionalParticipation,
    skillTransmission,
    xCitizen,
  };
}
