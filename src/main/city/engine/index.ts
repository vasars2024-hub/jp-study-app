export * from './types';
export * from './constants';
export * from './constraints';
export * from './interpretation';
export * from './presentation';
export * from './state';

import { proposeCitizen } from './citizen';
import { assertLegacyPreserved, lawfulClone, normalizeInput, validateState } from './constraints';
import { proposeCulture } from './culture';
import { proposeEcology } from './ecology';
import { proposeEconomy } from './economy';
import { resolveEra } from './era';
import { deriveEventFlags } from './events';
import { isMeaningfulInput, proposeLearning } from './learning';
import { proposeMemoryContribution, recordMemoryCrossings } from './memory';
import { cloneState } from './state';
import { proposeTechnology } from './technology';
import { applyElapsedTime, canWake, wake } from './time';
import { CivilizationState, EvaluationResult, InterpretedLearningInput } from './types';

/** Pure time-only evaluation used once on service initialization. */
export function advanceCivilizationTime(
  state: CivilizationState,
  elapsedMinutes: number,
): EvaluationResult {
  const before = lawfulClone(state);
  const next = applyElapsedTime(before, elapsedMinutes);
  next.evaluation += 1;
  next.revision += 1;
  const flags = deriveEventFlags(before, next);
  validateState(next);
  assertLegacyPreserved(before, next);
  return { state: next, flags };
}

/**
 * Deterministic proposal/resolution pass. Every domain proposal reads the same
 * committed prior snapshot; no domain observes a peer's same-step proposal.
 */
export function evaluateCivilization(
  state: CivilizationState,
  rawInput: InterpretedLearningInput,
  elapsedMinutes = 0,
): EvaluationResult {
  const original = lawfulClone(state);
  const input = normalizeInput(rawInput);
  const elapsed = applyElapsedTime(original, elapsedMinutes);
  const wasHibernating = elapsed.status === 'hibernating';
  const awakened = wasHibernating && canWake(input);
  const prior = awakened ? wake(elapsed, input) : elapsed;
  const activeGrowth = prior.status === 'active';
  const meaningful = isMeaningfulInput(input);

  const next = cloneState(prior);
  if (meaningful) next.learning = proposeLearning(prior, input);
  next.ecology = proposeEcology(prior, input, activeGrowth && meaningful);

  if (activeGrowth && meaningful) {
    next.citizen = proposeCitizen(prior, input);
    next.technology = proposeTechnology(prior, input);
    next.culture = proposeCulture(prior, input);
    next.economy = proposeEconomy(prior, input);
    next.memory = proposeMemoryContribution(prior, input);
  }

  next.evaluation += 1;
  next.revision += 1;
  if (activeGrowth && meaningful) {
    next.era = resolveEra(next);
    next.memory = recordMemoryCrossings(original, next, input);
    if (original.technology.researchReadiness < 0.42 && next.technology.researchReadiness >= 0.42) {
      next.technology.bloomsCrossed += 1;
    }
  }

  const flags = deriveEventFlags(original, next, input);
  validateState(next);
  assertLegacyPreserved(original, next);
  return { state: next, flags };
}
