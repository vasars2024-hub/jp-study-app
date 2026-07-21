import { MEMORY_NOTES, VAULT_THRESHOLDS } from './constants';
import {
  CivilizationState,
  EraDesignation,
  InterpretedLearningInput,
  MemoryRecordType,
  MemoryState,
} from './types';
import { mean, saturating, unit } from './math';

export function proposeMemoryContribution(
  prior: CivilizationState,
  input: InterpretedLearningInput,
): MemoryState {
  const next: MemoryState = {
    ...prior.memory,
    records: prior.memory.records.slice(),
  };
  const effort = Math.max(input.focusDuration, input.profile.revisionStrength * 2, input.completion ? 1 : 0);
  if (effort <= 0) return next;
  next.historicalDepth += effort * (0.3 + input.profile.retention * 0.7);
  next.archiveContinuity = Math.max(next.archiveContinuity, unit(mean([
    input.profile.retention,
    input.profile.revisionStrength,
    saturating(prior.learning.sessions, 90),
  ])));
  next.xMemory = Math.max(next.xMemory, unit(mean([
    saturating(next.historicalDepth, 360),
    next.archiveContinuity,
    saturating(next.records.length, 24),
  ])));
  return next;
}

function appendRecord(
  memory: MemoryState,
  evaluation: number,
  type: MemoryRecordType,
  era: EraDesignation,
  note: string,
): void {
  memory.records.push({ ordinal: memory.nextOrdinal, evaluation, type, era, note });
  memory.nextOrdinal += 1;
}

/** Memory observes committed crossings after the era gate; it never drives the same crossing it records. */
export function recordMemoryCrossings(
  before: CivilizationState,
  committed: CivilizationState,
  input: InterpretedLearningInput,
): MemoryState {
  const memory: MemoryState = { ...committed.memory, records: committed.memory.records.slice() };
  const evaluation = committed.evaluation;

  if (before.learning.sessions === 0 && committed.learning.sessions > 0) {
    appendRecord(memory, evaluation, 'FIRST_LIGHT', committed.era.designation, MEMORY_NOTES.firstLight);
  }
  if (input.completion) {
    appendRecord(memory, evaluation, 'MILESTONE', committed.era.designation, MEMORY_NOTES.milestone);
  }
  if (committed.ecology.successionStage > before.ecology.successionStage) {
    appendRecord(memory, evaluation, 'SUCCESSION_ADVANCE', committed.era.designation, MEMORY_NOTES.succession);
  }

  let vaultDepth = memory.vaultDepth;
  VAULT_THRESHOLDS.forEach((threshold, index) => {
    const depth = index + 1;
    if (memory.historicalDepth >= threshold && vaultDepth < depth) {
      appendRecord(memory, evaluation, 'VAULT_DISCOVERY', committed.era.designation, MEMORY_NOTES.vault);
      vaultDepth = depth;
    }
  });
  memory.vaultDepth = vaultDepth;

  if (committed.era.designation !== before.era.designation) {
    appendRecord(memory, evaluation, 'ERA_TRANSITION', committed.era.designation, MEMORY_NOTES.era);
  }
  return memory;
}
