/**
 * Noctis Simulation Engine — the learning evaluation T(S', I).
 *
 * Implements the transmutation of SIMULATION_SYSTEMS.md Section 7 in the
 * lifecycle order of Section 6: accumulation, nutrient synthesis along the
 * canonical pathways, uptake (living systems first, then reserve banking up
 * to lattice capacity, then transient dissipation), ecological growth,
 * succession, citizen emergence, research readiness, and memory recording.
 *
 * Conservation (Section 9): nothing appears from nowhere and nothing
 * vanishes silently — synthesized nutrients are consumed by life, held in
 * reservoirs, or dissipate; surplus effort banks as energy up to capacity.
 *
 * Cross-family reads use the pre-learning snapshot (the post-D state passed
 * in), honoring the no-same-step-circularity rule of Section 13.
 */

import { CivilizationState, InterpretedLearningInput, MemoryRecordType } from './types';
import {
  BLOOM_RESERVE_SURGE_FRACTION,
  BLOOM_THRESHOLDS,
  CONSISTENCY_PLUME_TRIGGER_DAYS,
  ENERGY_CAPACITY_BASE,
  ENERGY_CAPACITY_PER_CRYSTAL,
  GAMMA_CRYSTAL,
  GAMMA_FLOW,
  GAMMA_MYCELIAL,
  GAMMA_PHOTOPHORE,
  LIVING_UPTAKE_FRACTION,
  METABOLIC_CAP_MINUTES,
  POPULATION_GROWTH_MAX,
  PROSPERITY_FLOOR,
  QUALITY_FLOOR,
  RENEWAL_PER_NUTRIENT,
  RESEARCH_COMPLETION_BONUS,
  RESEARCH_GAIN_MAX,
  SHOCK_DIFFICULTY_MIN,
  SHOCK_STABILITY_DROP,
  STAGE_THRESHOLDS,
  SYNTH_PER_EFFECTIVE_MINUTE,
  VAULT_BASE,
  VAULT_RATIO,
  ECOLOGY_MASS_SCALE,
} from './constants';
import { cloneState } from './state';

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function sat(x: number, scale: number): number {
  if (x <= 0) return 0;
  return x / (x + scale);
}

/** Quiet, dignified record notes (GAME_DESIGN.md Section 9, Rules of Memory). */
const RECORD_NOTES: Record<MemoryRecordType, string> = {
  FIRST_LIGHT: 'The first light arrived, and the dark learned it could be fed.',
  MILESTONE: 'A threshold in the learning life was crossed and witnessed.',
  ERA_TRANSITION: 'The civilization found a new language for its knowledge.',
  VAULT_DISCOVERY: 'The roots breached an ancestral vault; a shard was carried to the archive.',
  SUCCESSION_ADVANCE: 'The living systems grew more deeply into one another.',
};

function record(state: CivilizationState, type: MemoryRecordType): void {
  state.memory.records.push({
    ordinal: state.memory.nextOrdinal,
    type,
    era: state.era.designation,
    note: RECORD_NOTES[type],
  });
  state.memory.nextOrdinal += 1;
}

/**
 * The learning evaluation. `state` is the post-elapsed-time snapshot S';
 * returns a fresh committed candidate S''. Pure — the input snapshot is
 * never mutated.
 */
export function applyLearning(
  state: CivilizationState,
  input: InterpretedLearningInput,
): CivilizationState {
  const prev = state; // pre-learning snapshot for cross-family reads (Section 13)
  const next = cloneState(state);
  const env = next.environment;

  if (input.focusDuration <= 0) {
    // An empty window still mirrors consistency (it derives from real
    // session history, not from this window's minutes).
    next.learning.consistency = input.consistency;
    return next;
  }

  // --- 1. Accumulation (Section 2, learning-derived family) -----------------
  // Quality weights effort and never inverts it: more honest minutes never
  // yield less (Section 7).
  const profileQuality = (input.profile.conceptualDepth + input.profile.retention) / 2;
  const quality = QUALITY_FLOOR + (1 - QUALITY_FLOOR) * profileQuality;
  const effort = input.focusDuration * quality; // quality-weighted minutes

  const firstLightEver = prev.learning.kTotal === 0;
  next.learning.kTotal = prev.learning.kTotal + effort;
  next.learning.consistency = input.consistency;
  // Momentum rises with the session, saturating — composure, not a streak meter.
  next.learning.momentum = 1 - (1 - prev.learning.momentum) * Math.exp(-effort / 240);

  // --- 2. Saturating metabolization (Section 7) ------------------------------
  // The ecology metabolizes at the pace of life: uptake saturates per
  // evaluation; genuine daily practice strictly dominates a binge without the
  // binge being punished.
  const metabolized = METABOLIC_CAP_MINUTES * (1 - Math.exp(-effort / METABOLIC_CAP_MINUTES));
  const surplus = effort - metabolized;

  // --- 3. Nutrient synthesis along the canonical pathways -------------------
  const synthesized = metabolized * SYNTH_PER_EFFECTIVE_MINUTE;
  env.reservoirs.brine += synthesized * input.pathways.brine;
  env.reservoirs.glucans += synthesized * input.pathways.glucans;
  env.reservoirs.catalysts += synthesized * input.pathways.catalysts;

  // --- 4. Uptake: living systems first (GAME_DESIGN.md Section 6, Energy) ---
  const brineConsumed = env.reservoirs.brine * LIVING_UPTAKE_FRACTION;
  const glucansConsumed = env.reservoirs.glucans * LIVING_UPTAKE_FRACTION;
  const catalystsConsumed = env.reservoirs.catalysts * LIVING_UPTAKE_FRACTION;
  env.reservoirs.brine -= brineConsumed;
  env.reservoirs.glucans -= glucansConsumed;
  env.reservoirs.catalysts -= catalystsConsumed;
  const totalConsumed = brineConsumed + glucansConsumed + catalystsConsumed;

  // Renewable expression relights from consumption.
  env.illumination = clamp01(env.illumination + RENEWAL_PER_NUTRIENT * totalConsumed);
  env.circulation = clamp01(env.circulation + RENEWAL_PER_NUTRIENT * totalConsumed);
  next.citizens.activity = clamp01(
    prev.citizens.activity + RENEWAL_PER_NUTRIENT * totalConsumed,
  );

  // --- 5. Ecological growth (ECOLOGY_SYSTEM.md Section 4) -------------------
  // Moth-season acceleration: cross-pollination speeds pending mycelial
  // construction while the plume is active (NOCTIS_ECOLOGICAL_ENGINE.md s7).
  const mothAcceleration = input.consistency >= CONSISTENCY_PLUME_TRIGGER_DAYS ? 1.5 : 1;
  env.mycelialMass = prev.environment.mycelialMass + GAMMA_MYCELIAL * glucansConsumed * mothAcceleration;
  env.crystalMass = prev.environment.crystalMass + GAMMA_CRYSTAL * brineConsumed;
  env.photophoreDiversity = clamp01(
    prev.environment.photophoreDiversity + GAMMA_PHOTOPHORE * catalystsConsumed,
  );
  env.circulationReach = clamp01(
    prev.environment.circulationReach + GAMMA_FLOW * catalystsConsumed,
  );

  // Storage capacity follows the lattice (mathematics enlarges the battery).
  env.energyCapacity = ENERGY_CAPACITY_BASE + ENERGY_CAPACITY_PER_CRYSTAL * env.crystalMass;

  // --- 6. Reserve banking, then transient dissipation -----------------------
  // Surplus above metabolic need banks into the crystal lattice up to
  // capacity; overflow beyond storage dissipates as transient luminous
  // expression (Section 7). Nothing vanishes silently: the overflow is the
  // glow the user sees, not a stock.
  env.energy = Math.min(env.energyCapacity, env.energy + surplus);

  // --- 7. Difficulty pressure (fortification posture, no loss) --------------
  if (input.difficulty >= SHOCK_DIFFICULTY_MIN) {
    env.stability = Math.max(0, env.stability - SHOCK_STABILITY_DROP * input.difficulty);
  } else {
    // Ordinary sessions ease the posture back toward calm.
    env.stability = clamp01(env.stability + 0.02);
  }

  // --- 8. Ecological succession (ECOLOGY_SYSTEM.md Section 5) ---------------
  // theta_stage(n) over accumulated structure, never wall-clock age.
  const structure = env.mycelialMass + env.crystalMass + prev.citizens.population;
  while (
    next.succession.stage < 5 &&
    structure >= STAGE_THRESHOLDS[next.succession.stage - 1]
  ) {
    next.succession.stage += 1;
    record(next, 'SUCCESSION_ADVANCE');
  }

  // --- 9. Citizen emergence (CITIZEN_SYSTEM.md Section 4) --------------------
  // pi = prosperity(canopy expansion, substrate fertility, illumination,
  // energy sufficiency), read from the pre-learning snapshot (Section 13).
  const prosperity =
    (sat(prev.environment.mycelialMass, ECOLOGY_MASS_SCALE / 4) +
      prev.environment.illumination +
      prev.environment.energy / Math.max(1, prev.environment.energyCapacity)) /
    3;
  if (prosperity > PROSPERITY_FLOOR) {
    const growthFraction = clamp01((prosperity - PROSPERITY_FLOOR) / (1 - PROSPERITY_FLOOR));
    next.citizens.population =
      prev.citizens.population + Math.round(growthFraction * POPULATION_GROWTH_MAX);
  }

  // --- 10. Research readiness R (SIMULATION_SYSTEMS.md Sections 12, 16) -----
  // Monotone: readiness earned is permanent (BENTHIC_BLOOM semantics).
  const researchPressure = 0.5 * input.profile.difficulty + 0.5 * input.profile.novelty;
  let readiness =
    prev.technology.researchReadiness +
    RESEARCH_GAIN_MAX * researchPressure +
    (input.completion ? RESEARCH_COMPLETION_BONUS : 0);

  // Bloom crossing: under a completion input, R crossing an emergence
  // threshold surges banked reserves into permanent readiness (Section 12).
  let bloomsCrossed = prev.technology.bloomsCrossed;
  if (
    input.completion &&
    bloomsCrossed < BLOOM_THRESHOLDS.length &&
    readiness >= BLOOM_THRESHOLDS[bloomsCrossed]
  ) {
    const surge = env.energy * BLOOM_RESERVE_SURGE_FRACTION;
    env.energy -= surge;
    readiness += 0.02 * (surge / Math.max(1, env.energyCapacity));
    bloomsCrossed += 1;
  }
  next.technology.researchReadiness = clamp01(Math.max(prev.technology.researchReadiness, readiness));
  next.technology.bloomsCrossed = bloomsCrossed;

  // --- 11. Memory recording (MEMORY_SYSTEM.md; Section 21) -------------------
  if (firstLightEver) record(next, 'FIRST_LIGHT');
  if (input.completion) record(next, 'MILESTONE');

  // Vault breaches: strictly increasing depth thresholds over X_myc
  // (ECOLOGY_SYSTEM.md Section 7). Discovery is earned and lawful, never random.
  while (env.mycelialMass >= VAULT_BASE * Math.pow(VAULT_RATIO, next.memory.vaultDepth)) {
    next.memory.vaultDepth += 1;
    record(next, 'VAULT_DISCOVERY');
  }

  return next;
}
