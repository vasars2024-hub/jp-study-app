/**
 * Noctis Simulation Engine — public export surface and master evaluation.
 *
 * S(t+1) = F( S(t), I, delta-t ) — the single ordered pass of
 * SIMULATION_SYSTEMS.md Sections 1 and 6: elapsed-time evaluation D, then
 * reawakening, then the learning evaluation T, then the era gate, then
 * transition observation E over the before/after pair. Pure TypeScript only;
 * see docs/ARCHITECTURE.md for boundary laws.
 */

import { CivilizationState, EvaluationResult, InterpretedLearningInput } from './types';
import { applyElapsedTime, wakeIfEligible } from './time';
import { applyLearning } from './metabolism';
import { applyEraGate } from './era';
import { evaluateEvents } from './events';
import { assertLegacyPreserved, validateState } from './constraints';

export * from './types';
export * from './state';
export * from './constants';
export * from './constraints';
export * from './select';
export * from './interpretation';
export * from './metabolism';
export * from './time';
export * from './era';
export * from './events';

/**
 * One committed evaluation of the civilization state machine.
 *
 * @param state committed snapshot S(t)
 * @param input interpreted learning input I, or null for a pure checkpoint
 *              (launch, long-idle) evaluation
 * @param elapsedMinutes delta-t since the last committed evaluation, computed
 *              by the service layer from the persistence envelope — the only
 *              door time enters through (Section 4)
 */
export function evaluate(
  state: CivilizationState,
  input: InterpretedLearningInput | null,
  elapsedMinutes: number,
): EvaluationResult {
  const before = state;

  // D — cushion, renewable decay, dormancy (Section 5).
  let next = applyElapsedTime(before, elapsedMinutes);

  if (input !== null) {
    // Reawakening precedes the learning evaluation (Section 5).
    next = wakeIfEligible(next, input);
    // T — interpretation is already done; transmute and grow (Sections 6-9).
    next = applyLearning(next, input);
    // The era gate — a committed state change like any other (Section 15).
    next = applyEraGate(next);
  }

  // Physics self-checks: the committed state must be lawful and no legacy
  // value may ever have decreased (Laws 5 and the Section 1 invariants).
  validateState(next);
  assertLegacyPreserved(before, next);

  // E — transition observation over the before/after pair (Section 12).
  const flags = evaluateEvents(input, before, next);

  return { state: next, flags };
}
