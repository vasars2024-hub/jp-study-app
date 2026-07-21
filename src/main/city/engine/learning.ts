import { CivilizationState, InterpretedLearningInput, LearningState } from './types';
import { mean, saturating, unit } from './math';

export function isMeaningfulInput(input: InterpretedLearningInput): boolean {
  return input.focusDuration > 0
    || input.profile.revisionStrength > 0
    || input.profile.curiosity > 0
    || input.completion;
}

/** Learning owns accumulated effort; downstream domains receive only interpreted signals. */
export function proposeLearning(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): LearningState {
  if (!isMeaningfulInput(input)) return { ...prior.learning };

  const profileQuality = mean([
    input.profile.conceptualDepth,
    input.profile.retention,
    input.profile.sustainedAttention,
    input.profile.mastery,
  ]);
  const effectiveMinutes = Math.max(
    input.focusDuration,
    input.profile.revisionStrength * 2,
    input.completion ? 1 : 0,
  );
  const securedDepth = Math.max(
    prior.learning.securedDepth,
    unit(input.profile.conceptualDepth * 0.72 + input.profile.mastery * 0.28),
  );
  const securedBreadth = Math.max(
    prior.learning.securedBreadth,
    unit(input.profile.disciplinaryExposure * 0.62 + input.profile.interdisciplinaryConnection * 0.38),
  );

  return {
    kTotal: prior.learning.kTotal + effectiveMinutes * (0.35 + profileQuality * 0.65),
    consistency: Math.max(prior.learning.consistency, input.consistency),
    momentum: unit(prior.learning.momentum * 0.58 + input.profile.sustainedAttention * 0.3 + input.profile.revisionStrength * 0.12),
    sessions: prior.learning.sessions + 1,
    securedDepth,
    securedBreadth,
  };
}

export function learningMaturity(state: LearningState): number {
  return unit(mean([
    saturating(state.kTotal, 360),
    state.securedDepth,
    state.securedBreadth,
    saturating(state.sessions, 80),
  ]));
}
