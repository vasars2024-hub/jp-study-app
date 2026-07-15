/**
 * Noctis Simulation Engine — trope guard and constraint validation.
 *
 * Enforces the state invariants of SIMULATION_SYSTEMS.md Section 1 and the
 * Trope Guard of ARCHITECTURE.md (Final Guardrails): invalid states throw
 * AbyssalConstraintError synchronously and are never committed.
 */

import { CivilizationState, ERA_ORDER } from './types';

/** Thrown when a transition would leave the lawful state region. */
export class AbyssalConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbyssalConstraintError';
    // TS ~4.5 targetting older lib: keep prototype chain intact for instanceof.
    Object.setPrototypeOf(this, AbyssalConstraintError.prototype);
  }
}

/**
 * Forbidden tokens (ARCHITECTURE.md Trope Guard; SIMULATION_SYSTEMS.md
 * Section 26). Matched as whole words against every key and string value in
 * committed state.
 */
const FORBIDDEN_TOKEN_RE =
  /^(thermal|heat|fire|flame|combust|smoke|steam|forge|daylight|sun|coin|gold|xp|score|build|construct|zone)$/i;

function scanForForbiddenTokens(value: unknown, path: string): void {
  if (typeof value === 'string') {
    const words = value.split(/[^A-Za-z]+/);
    for (const word of words) {
      if (word && FORBIDDEN_TOKEN_RE.test(word)) {
        throw new AbyssalConstraintError(
          `Trope Guard: forbidden token "${word}" in string at ${path}`,
        );
      }
    }
    return;
  }
  if (value === null || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      scanForForbiddenTokens(value[i], `${path}[${i}]`);
    }
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_TOKEN_RE.test(key)) {
      throw new AbyssalConstraintError(`Trope Guard: forbidden token in key "${path}.${key}"`);
    }
    scanForForbiddenTokens(record[key], `${path}.${key}`);
  }
}

function assertFinite(value: number, name: string): void {
  if (typeof value !== 'number' || !isFinite(value)) {
    throw new AbyssalConstraintError(`State invariant: ${name} must be finite, got ${value}`);
  }
}

function assertNonNegative(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0) {
    throw new AbyssalConstraintError(`State invariant: ${name} must be >= 0, got ${value}`);
  }
}

function assertUnit(value: number, name: string): void {
  assertFinite(value, name);
  if (value < 0 || value > 1) {
    throw new AbyssalConstraintError(`State invariant: ${name} must lie in [0,1], got ${value}`);
  }
}

/**
 * Validates every committed-state invariant (SIMULATION_SYSTEMS.md Section 1):
 * finite quantities, non-negative stocks, integer population, illumination in
 * the heatless waveband [0,1], canonical era, hibernation entailing zero
 * illumination — plus the Trope Guard scan. Throws AbyssalConstraintError.
 */
export function validateState(state: CivilizationState): CivilizationState {
  const env = state.environment;

  assertUnit(env.illumination, 'environment.illumination');
  assertUnit(env.circulation, 'environment.circulation');
  assertUnit(env.stability, 'environment.stability');
  assertUnit(env.photophoreDiversity, 'environment.photophoreDiversity');
  assertUnit(env.circulationReach, 'environment.circulationReach');
  assertNonNegative(env.reservoirs.brine, 'environment.reservoirs.brine');
  assertNonNegative(env.reservoirs.glucans, 'environment.reservoirs.glucans');
  assertNonNegative(env.reservoirs.catalysts, 'environment.reservoirs.catalysts');
  assertNonNegative(env.energy, 'environment.energy');
  assertNonNegative(env.energyCapacity, 'environment.energyCapacity');
  assertNonNegative(env.mycelialMass, 'environment.mycelialMass');
  assertNonNegative(env.crystalMass, 'environment.crystalMass');

  assertNonNegative(state.learning.kTotal, 'learning.kTotal');
  assertNonNegative(state.learning.consistency, 'learning.consistency');
  assertUnit(state.learning.momentum, 'learning.momentum');

  assertNonNegative(state.citizens.population, 'citizens.population');
  if (state.citizens.population !== Math.floor(state.citizens.population)) {
    throw new AbyssalConstraintError('State invariant: population must be an integer');
  }
  assertUnit(state.citizens.activity, 'citizens.activity');

  assertUnit(state.technology.researchReadiness, 'technology.researchReadiness');
  assertNonNegative(state.technology.bloomsCrossed, 'technology.bloomsCrossed');

  if (state.succession.stage < 1 || state.succession.stage > 5) {
    throw new AbyssalConstraintError(
      `State invariant: succession stage must be 1..5, got ${state.succession.stage}`,
    );
  }

  if (ERA_ORDER.indexOf(state.era.designation) < 0) {
    throw new AbyssalConstraintError(
      `State invariant: non-canonical era "${state.era.designation}"`,
    );
  }

  if (state.status === 'hibernating' && env.illumination !== 0) {
    throw new AbyssalConstraintError(
      'State invariant: hibernation entails zero illumination',
    );
  }

  assertNonNegative(state.memory.nextOrdinal, 'memory.nextOrdinal');
  assertNonNegative(state.memory.vaultDepth, 'memory.vaultDepth');

  scanForForbiddenTokens(state, 'state');

  return state;
}

/**
 * Legacy-projection guard (SIMULATION_SYSTEMS.md Law 5): asserts that no
 * legacy value decreased between two committed snapshots. Used by tests and
 * by the master evaluation as a final self-check.
 */
export function assertLegacyPreserved(
  before: CivilizationState,
  after: CivilizationState,
): void {
  const checks: Array<[string, number, number]> = [
    ['learning.kTotal', before.learning.kTotal, after.learning.kTotal],
    ['citizens.population', before.citizens.population, after.citizens.population],
    ['environment.mycelialMass', before.environment.mycelialMass, after.environment.mycelialMass],
    ['environment.crystalMass', before.environment.crystalMass, after.environment.crystalMass],
    ['succession.stage', before.succession.stage, after.succession.stage],
    ['memory.records.length', before.memory.records.length, after.memory.records.length],
    ['memory.vaultDepth', before.memory.vaultDepth, after.memory.vaultDepth],
    ['era.history.length', before.era.history.length, after.era.history.length],
    [
      'technology.researchReadiness',
      before.technology.researchReadiness,
      after.technology.researchReadiness,
    ],
  ];
  for (const [name, prev, next] of checks) {
    if (next < prev) {
      throw new AbyssalConstraintError(
        `Legacy protection: ${name} decreased from ${prev} to ${next}`,
      );
    }
  }
  const beforeEraIndex = ERA_ORDER.indexOf(before.era.designation);
  const afterEraIndex = ERA_ORDER.indexOf(after.era.designation);
  if (afterEraIndex < beforeEraIndex) {
    throw new AbyssalConstraintError(
      `Legacy protection: era regressed from ${before.era.designation} to ${after.era.designation}`,
    );
  }
}
