/**
 * Noctis Simulation Engine — calibration constants.
 *
 * Every value below is an implementation-bound calibration constant carrying
 * its canon citation, as the Tier 7 blueprints require (SIMULATION_SYSTEMS.md,
 * "Refuses to bind"; DOCUMENT_ARCHITECTURE.md). Only three raw numeric anchors
 * are canon law themselves (NOCTIS_ECOLOGICAL_ENGINE.md section 7): the
 * three-consecutive-day consistency trigger, the five-day absence horizon,
 * and the ten-minute reawakening session. Everything else is tunable under
 * its stated constraint.
 *
 * Time unit: real-world minutes (SIMULATION_SYSTEMS.md, Notation).
 */

export const DAY_MINUTES = 1440;

// ---------------------------------------------------------------------------
// The three canonical numeric anchors (canon law, NOCTIS_ECOLOGICAL_ENGINE.md s7)
// ---------------------------------------------------------------------------

/** Consistency trigger for THE_PHEROMONE_PLUME: 3+ consecutive daily sessions. */
export const CONSISTENCY_PLUME_TRIGGER_DAYS = 3;

/** Absence horizon: with empty cushion and nominal rates, illumination must
 *  cross the dormancy threshold at ~5 days (SIMULATION_SYSTEMS.md Section 5,
 *  calibration constraint). */
export const ABSENCE_HORIZON_DAYS = 5;

/** Reawakening session: ten focused minutes wakes a hibernating world. */
export const REAWAKENING_MINUTES = 10;

// ---------------------------------------------------------------------------
// Elapsed-time evaluation D (SIMULATION_SYSTEMS.md Section 5)
// ---------------------------------------------------------------------------

/** theta_dormancy — illumination level below which hibernation begins. */
export const DORMANCY_ILLUMINATION_THRESHOLD = 0.05;

/**
 * lambda_L — nominal illumination decay per minute, derived so that L = 1
 * crosses theta_dormancy at exactly the five-day horizon with an empty
 * cushion: ln(1/theta) / (5 days). Canon: SIMULATION_SYSTEMS.md Section 5.
 */
export const LAMBDA_ILLUMINATION =
  Math.log(1 / DORMANCY_ILLUMINATION_THRESHOLD) / (ABSENCE_HORIZON_DAYS * DAY_MINUTES);

/** lambda_Phi — circulation decays at the illumination rate (shared horizon). */
export const LAMBDA_CIRCULATION = LAMBDA_ILLUMINATION;

/** lambda_sigma — stability decays gently, half the illumination rate. */
export const LAMBDA_STABILITY = LAMBDA_ILLUMINATION / 2;

/** lambda_reservoir — unconsumed nutrients settle out at twice the light rate. */
export const LAMBDA_RESERVOIR = LAMBDA_ILLUMINATION * 2;

/** lambda_A — citizen activity expression dims at the illumination rate. */
export const LAMBDA_ACTIVITY = LAMBDA_ILLUMINATION;

/** lambda_m — learning momentum fades at the illumination rate. */
export const LAMBDA_MOMENTUM = LAMBDA_ILLUMINATION;

/**
 * Crystal decay damping: damp(X_cry) = DAMP_MAX * X_cry / (X_cry + DAMP_SCALE),
 * bounded 0 <= damp < 1 (SIMULATION_SYSTEMS.md Section 5, lambda_effective).
 * Deep lattices slow the dimming; they never stop it entirely.
 */
export const CRYSTAL_DAMP_MAX = 0.5;
export const CRYSTAL_DAMP_SCALE = 200;

/**
 * delta_discharge — linear cushion discharge, one shield-minute per real
 * minute (a battery supplying a constant need; SIMULATION_SYSTEMS.md
 * Section 5, Phase 1). Energy is therefore measured in shield-minutes.
 */
export const ENERGY_DISCHARGE_PER_MINUTE = 1;

/** Base storage capacity: one day of shielding before any lattice growth. */
export const ENERGY_CAPACITY_BASE = DAY_MINUTES;

/** Added capacity per unit crystal mass (mathematics enlarges the battery —
 *  GAME_DESIGN.md Section 6, Energy). */
export const ENERGY_CAPACITY_PER_CRYSTAL = 20;

// ---------------------------------------------------------------------------
// Learning metabolism T (SIMULATION_SYSTEMS.md Section 7)
// ---------------------------------------------------------------------------

/**
 * Per-evaluation metabolizable effort cap, in quality-weighted minutes.
 * Saturation law: the ecology metabolizes at the pace of life, so daily
 * practice strictly dominates a binge without the binge being punished
 * (uptake = CAP * (1 - e^(-effort/CAP)); surplus banks, overflow dissipates).
 */
export const METABOLIC_CAP_MINUTES = 120;

/** Quality floor: q = QUALITY_FLOOR + (1 - QUALITY_FLOOR) * profileQuality.
 *  Quality weights effort but never inverts it — more honest minutes never
 *  yield less (SIMULATION_SYSTEMS.md Section 7). */
export const QUALITY_FLOOR = 0.5;

/** Nutrient units synthesized per effective (quality-weighted) minute. */
export const SYNTH_PER_EFFECTIVE_MINUTE = 1;

/** Fraction of synthesized nutrients consumed by living systems first
 *  (life before storage — GAME_DESIGN.md Section 6, Energy). */
export const LIVING_UPTAKE_FRACTION = 0.6;

/** Renewable replenishment per consumed nutrient unit (illumination,
 *  circulation, stability, activity all draw on this pool). */
export const RENEWAL_PER_NUTRIENT = 0.012;

// ---------------------------------------------------------------------------
// Ecological growth (ECOLOGY_SYSTEM.md Section 4 coefficient families)
// ---------------------------------------------------------------------------

/** gamma_myc — root expansion per unit glucan uptake (monotone). */
export const GAMMA_MYCELIAL = 0.5;

/** gamma_cry — lattice growth per unit brine uptake (monotone). */
export const GAMMA_CRYSTAL = 0.5;

/** gamma_pho — photophore diversification per unit catalyst uptake
 *  (monotone, expression-bounded per era). */
export const GAMMA_PHOTOPHORE = 0.004;

/** gamma_flow — circulation reach per unit catalyst uptake (saturating). */
export const GAMMA_FLOW = 0.004;

/**
 * theta_vault(i) — vault breach depth thresholds over X_myc: a fixed,
 * strictly increasing series (ECOLOGY_SYSTEM.md Section 7, Archive system).
 * theta_vault(i) = VAULT_BASE * VAULT_RATIO^i.
 */
export const VAULT_BASE = 50;
export const VAULT_RATIO = 1.6;

/**
 * theta_stage(n) — succession stage thresholds over accumulated structure
 * (ECOLOGY_SYSTEM.md Section 5): a monotone function of network masses and
 * established relationships, never wall-clock age. Indexed by target stage
 * (2..5) over the structure metric of metabolism.ts.
 */
export const STAGE_THRESHOLDS: number[] = [10, 60, 250, 800];

// ---------------------------------------------------------------------------
// Citizens (CITIZEN_SYSTEM.md Section 4)
// ---------------------------------------------------------------------------

/** Prosperity threshold below which population growth is zero. */
export const PROSPERITY_FLOOR = 0.25;

/** Maximum new citizens per evaluation (growth saturates; never a flood). */
export const POPULATION_GROWTH_MAX = 3;

/** Population normalization scale for the era contribution (saturating). */
export const POPULATION_SCALE = 60;

// ---------------------------------------------------------------------------
// Research readiness R and BENTHIC_BLOOM (SIMULATION_SYSTEMS.md Section 12)
// ---------------------------------------------------------------------------

/** Research pressure gain per evaluation at full difficulty/novelty signal. */
export const RESEARCH_GAIN_MAX = 0.03;

/** Completion (breakthrough) bonus applied to research readiness. */
export const RESEARCH_COMPLETION_BONUS = 0.05;

/** Emergence thresholds for BENTHIC_BLOOM: R crossing one of these under a
 *  completion input surges reserves into permanent readiness. */
export const BLOOM_THRESHOLDS: number[] = [0.2, 0.4, 0.6, 0.8];

/** Reserve surge fraction on bloom: this share of banked energy converts to
 *  permanent readiness expression (reserves surge and become permanent —
 *  SIMULATION_SYSTEMS.md Section 12). */
export const BLOOM_RESERVE_SURGE_FRACTION = 0.5;

// ---------------------------------------------------------------------------
// BAROMETRIC_SHOCK_WAVE (SIMULATION_SYSTEMS.md Section 12)
// ---------------------------------------------------------------------------

/** Stability shock threshold: crossing below this under difficulty fires the flag. */
export const SHOCK_STABILITY_THRESHOLD = 0.35;

/** Minimum difficulty signal for a shock (high difficulty / failure rate). */
export const SHOCK_DIFFICULTY_MIN = 0.6;

/** Stability drop per unit difficulty in one evaluation (fortification, no loss). */
export const SHOCK_STABILITY_DROP = 0.3;

// ---------------------------------------------------------------------------
// Era gate (ERA_PROGRESSION.md Sections 6-7)
// ---------------------------------------------------------------------------

/**
 * Theta_era — the four thresholds, strictly increasing: later eras demand
 * proportionally more from more domains at once (ERA_PROGRESSION.md Section 6).
 * Index 0 gates CRYSTAL_INSCRIPTION ... index 3 gates COSMIC_STELLAR.
 */
export const ERA_THRESHOLDS: number[] = [0.35, 0.55, 0.72, 0.86];

/**
 * Per-domain floors, non-decreasing across boundaries: no single collapsed
 * domain may be compensated away (ERA_PROGRESSION.md Section 7, the
 * no-single-domain-defines-the-era property as structure, not promise).
 */
export const ERA_FLOORS: number[] = [0.15, 0.25, 0.35, 0.45];

/** w_d — six equal contribution weights (Technology, Ecology, Citizen,
 *  Culture, Memory, Economy), v1 calibration (ERA_PROGRESSION.md Section 7). */
export const ERA_CONTRIBUTION_WEIGHT = 1 / 6;

// ---------------------------------------------------------------------------
// Contribution normalization scales (ERA_PROGRESSION.md Section 10, v1 projections)
// ---------------------------------------------------------------------------

/** Network mass normalization for the ecology contribution (saturating). */
export const ECOLOGY_MASS_SCALE = 400;

/** Memory record-count normalization for the memory contribution (saturating). */
export const MEMORY_RECORD_SCALE = 40;

/** K_total normalization for learning-maturity readings (saturating). */
export const KNOWLEDGE_SCALE = 6000;
