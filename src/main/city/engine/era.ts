/**
 * Noctis Simulation Engine — the era gate.
 *
 * Implements ERA_PROGRESSION.md Sections 6-7 over the protocol of
 * SIMULATION_SYSTEMS.md Section 15: era advances when
 * readiness(contributions) >= Theta_era(next), eras never regress, and no
 * single domain silently defines the era.
 *
 * The readiness is a weighted geometric mean over six bounded [0,1] domain
 * contributions (Technology, Ecology, Citizen, Culture, Memory, Economy),
 * with per-domain floors. The geometric mean makes the
 * no-single-domain-defines-it law structural: any contribution collapsing
 * toward zero collapses the whole readiness, and the floors block
 * compensation outright. Learning maturity feeds every contribution upstream
 * and is never a direct seventh term (ERA_PROGRESSION.md Section 5).
 *
 * At most one era boundary is crossed per evaluation, preserving the
 * invisible-threshold pacing of GAME_DESIGN.md Section 7. The transition is
 * a committed state change like any other — no new engine flag; the
 * BENTHIC_BLOOM interaction is observed by events.ts from the before/after
 * pair. Memory records the transition as a permanent legacy anchor.
 */

import { CivilizationState, EraDesignation, ERA_ORDER } from './types';
import {
  ECOLOGY_MASS_SCALE,
  ERA_CONTRIBUTION_WEIGHT,
  ERA_FLOORS,
  ERA_THRESHOLDS,
  KNOWLEDGE_SCALE,
  MEMORY_RECORD_SCALE,
  POPULATION_SCALE,
} from './constants';
import { cloneState } from './state';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function sat(x: number, scale: number): number {
  if (x <= 0) return 0;
  return x / (x + scale);
}

/** The six era-readiness contributions, each a bounded reading of what its
 *  domain already exposes (ERA_PROGRESSION.md Section 10, v1 projections). */
export interface EraContributions {
  technology: number;
  ecology: number;
  citizen: number;
  culture: number;
  memory: number;
  economy: number;
}

/**
 * Derives the six contributions from committed state. Each is a projection,
 * not a new stock; each cites the peer passage it specializes.
 */
export function deriveContributions(state: CivilizationState): EraContributions {
  const env = state.environment;

  // Technology: w_era — research readiness as the maturity signal
  // (TECHNOLOGY_SYSTEM.md, coefficient table).
  const technology = clamp01(state.technology.researchReadiness);

  // Ecology: succession stage plus network masses — "ecological succession"
  // (SIMULATION_SYSTEMS.md Section 15; ECOLOGY_SYSTEM.md Section 5).
  const ecology = clamp01(
    0.5 * ((state.succession.stage - 1) / 4) +
      0.5 * sat(env.mycelialMass + env.crystalMass, ECOLOGY_MASS_SCALE),
  );

  // Citizen: population AND activity/knowledge maturity — never count alone
  // (ERA_PROGRESSION.md Section 10; CITIZEN_SYSTEM.md).
  const citizen = clamp01(
    0.6 * sat(state.citizens.population, POPULATION_SCALE) +
      0.4 * sat(state.learning.kTotal, KNOWLEDGE_SCALE),
  );

  // Culture: maturity of expressive relationship to knowledge — photophore
  // diversity (dialect complexity substrate) and momentum, an explicitly
  // derived projection, never a raw "culture stock" (CULTURE_SYSTEM.md
  // Section 17 rule).
  const culture = clamp01(0.7 * env.photophoreDiversity + 0.3 * state.learning.momentum);

  // Memory: historical-accumulation depth — breadth of the secured record
  // (MEMORY_SYSTEM.md era clause).
  const memory = clamp01(
    0.7 * sat(state.memory.records.length, MEMORY_RECORD_SCALE) +
      0.3 * sat(state.memory.vaultDepth, 6),
  );

  // Economy: energy sufficiency and distribution reach — productive capacity
  // and coordination (ECONOMY_SYSTEM.md Section 18).
  const economy = clamp01(
    0.5 * (env.energy / Math.max(1, env.energyCapacity)) + 0.5 * env.circulationReach,
  );

  return { technology, ecology, citizen, culture, memory, economy };
}

/** Weighted geometric mean over the six contributions (equal weights, v1). */
export function combinedReadiness(c: EraContributions): number {
  const values = [c.technology, c.ecology, c.citizen, c.culture, c.memory, c.economy];
  let product = 1;
  for (const v of values) {
    if (v <= 0) return 0; // a collapsed domain collapses readiness — structural law
    product *= Math.pow(v, ERA_CONTRIBUTION_WEIGHT);
  }
  return clamp01(product);
}

/**
 * The gate. Returns a fresh state, advanced by at most one era when both the
 * combined readiness clears Theta_era(next) and every contribution clears the
 * per-domain floor. Never regresses; a transition appends the permanent
 * ERA_TRANSITION legacy anchor (Memory as recorder-of-record).
 *
 * Crossing the gate only widens the capability envelope: nothing is
 * installed, granted, or solved by it (SIMULATION_SYSTEMS.md Section 15;
 * ECONOMY_SYSTEM.md Section 18).
 */
export function applyEraGate(state: CivilizationState): CivilizationState {
  const currentIndex = ERA_ORDER.indexOf(state.era.designation);
  if (currentIndex >= ERA_ORDER.length - 1) return state; // COSMIC_STELLAR is terminal

  const contributions = deriveContributions(state);
  const readiness = combinedReadiness(contributions);
  const threshold = ERA_THRESHOLDS[currentIndex];
  const floor = ERA_FLOORS[currentIndex];

  if (readiness < threshold) return state;
  const values = [
    contributions.technology,
    contributions.ecology,
    contributions.citizen,
    contributions.culture,
    contributions.memory,
    contributions.economy,
  ];
  for (const v of values) {
    if (v < floor) return state; // one lagging domain holds the whole gate
  }

  const next = cloneState(state);
  const newEra: EraDesignation = ERA_ORDER[currentIndex + 1];
  next.era.designation = newEra;
  next.era.history.push(newEra);
  next.memory.records.push({
    ordinal: next.memory.nextOrdinal,
    type: 'ERA_TRANSITION',
    era: newEra,
    note: 'The civilization found a new language for its knowledge.',
  });
  next.memory.nextOrdinal += 1;
  return next;
}
