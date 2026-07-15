/**
 * Noctis Simulation Engine — initial state factory and snapshot helpers.
 *
 * The newborn world is Stage 1, Dormant Substrate (ECOLOGY_SYSTEM.md
 * Section 5): "the world before the first light arrives, the state the first
 * study session awakens." Not a punishment state — everything that follows is
 * already latent here.
 */

import {
  CivilizationState,
  EnvironmentState,
  NoctisStateEnvelope,
} from './types';
import { ENERGY_CAPACITY_BASE } from './constants';
import { validateState } from './constraints';

/** Current persisted-envelope schema version. */
export const NOCTIS_SCHEMA_VERSION = 1;

function createInitialEnvironment(): EnvironmentState {
  return {
    illumination: 0,
    circulation: 0,
    stability: 1, // still air; nothing has ever been disturbed
    reservoirs: { brine: 0, glucans: 0, catalysts: 0 },
    energy: 0,
    energyCapacity: ENERGY_CAPACITY_BASE,
    mycelialMass: 0,
    crystalMass: 0,
    photophoreDiversity: 0,
    circulationReach: 0,
  };
}

/**
 * Creates the newborn civilization state. The seed is committed exactly once
 * here and is the engine's sole entropy source thereafter
 * (SIMULATION_SYSTEMS.md Section 11). The service layer supplies it; the
 * engine never reads a clock or hardware randomness.
 */
export function createInitialState(seed: number): CivilizationState {
  const state: CivilizationState = {
    seed: seed >>> 0,
    status: 'active',
    learning: { kTotal: 0, consistency: 0, momentum: 0 },
    environment: createInitialEnvironment(),
    succession: { stage: 1 },
    citizens: { population: 0, activity: 0 },
    technology: { researchReadiness: 0, bloomsCrossed: 0 },
    era: { designation: 'SPORE_HEARTH', history: ['SPORE_HEARTH'] },
    memory: { records: [], nextOrdinal: 1, vaultDepth: 0 },
  };
  return validateState(state);
}

/** Wraps a state in the persisted envelope. savedAt is stamped by the caller
 *  (service layer owns the wall clock; ARCHITECTURE.md engine purity). */
export function createEnvelope(state: CivilizationState, savedAt: number): NoctisStateEnvelope {
  return { schemaVersion: NOCTIS_SCHEMA_VERSION, savedAt, state };
}

/** Structural deep-clone of a snapshot (plain data only, TS 4.5-safe). */
export function cloneState(state: CivilizationState): CivilizationState {
  return JSON.parse(JSON.stringify(state)) as CivilizationState;
}
