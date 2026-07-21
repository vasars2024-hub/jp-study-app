import { CivilizationState, CultureState, InterpretedLearningInput } from './types';
import { mean, saturating, unit } from './math';

export function proposeCulture(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): CultureState {
  const effort = saturating(Math.max(input.focusDuration, input.profile.revisionStrength * 2), 100);
  const transmissionFidelity = Math.max(prior.culture.transmissionFidelity, unit(mean([
    input.profile.retention,
    input.profile.mastery,
    prior.citizen.skillTransmission,
  ])));
  const institutionalContinuity = Math.max(prior.culture.institutionalContinuity, unit(mean([
    prior.citizen.institutionalParticipation,
    saturating(prior.learning.sessions, 80),
    prior.memory.archiveContinuity,
  ])));
  const interpretiveBreadth = Math.max(prior.culture.interpretiveBreadth, unit(mean([
    input.profile.disciplinaryExposure,
    input.profile.interdisciplinaryConnection,
    input.profile.curiosity,
  ])));
  const tensionCapacity = Math.max(prior.culture.tensionCapacity, unit(mean([
    input.difficulty,
    input.profile.retention,
    prior.ecology.stability,
  ])));
  const xCulture = Math.max(prior.culture.xCulture, unit(mean([
    transmissionFidelity,
    institutionalContinuity,
    interpretiveBreadth,
    tensionCapacity,
  ])));

  return {
    activeExpression: unit(prior.culture.activeExpression + effort * (0.15 + input.profile.curiosity * 0.32)),
    transmissionFidelity,
    institutionalContinuity,
    interpretiveBreadth,
    tensionCapacity,
    xCulture,
  };
}
