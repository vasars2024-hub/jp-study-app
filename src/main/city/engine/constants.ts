import { EraContributions, EraDesignation } from './types';

/** New schema intentionally rejects the deleted pre-reconciliation engine save. */
export const NOCTIS_SCHEMA_VERSION = 2;

// The only three raw timing anchors fixed above implementation tier.
export const CONSISTENCY_TRIGGER_DAYS = 3;
export const ABSENCE_HORIZON_MINUTES = 5 * 24 * 60;
export const REAWAKENING_MINUTES = 10;

/**
 * Implementation calibration: a typical active Era I illumination of 0.18
 * reaches 0.02 after the canonical five-day horizon with no energy cushion.
 * SIMULATION_SYSTEMS.md Section 5.
 */
export const DORMANCY_ILLUMINATION = 0.02;
export const ILLUMINATION_DECAY_RATE = Math.log(0.18 / DORMANCY_ILLUMINATION) / ABSENCE_HORIZON_MINUTES;
export const CIRCULATION_DECAY_RATE = ILLUMINATION_DECAY_RATE * 1.1;
export const ACTIVITY_DECAY_RATE = ILLUMINATION_DECAY_RATE * 0.9;
export const RESERVOIR_DECAY_RATE = ILLUMINATION_DECAY_RATE * 0.45;
export const ACTIVE_DOMAIN_DECAY_RATE = ILLUMINATION_DECAY_RATE * 0.65;
export const ENERGY_DISCHARGE_PER_MINUTE = 1;
export const CRYSTAL_DAMPING_MAX = 0.45;

export const INITIAL_ILLUMINATION = 0.18;
export const INITIAL_CIRCULATION = 0.08;
export const INITIAL_STABILITY = 0.82;
export const INITIAL_POPULATION = 3;
export const ENERGY_CAPACITY_BASE = 90;
export const ENERGY_CAPACITY_CRYSTAL_SCALE = 360;

export const SHOCK_DIFFICULTY = 0.7;
export const SHOCK_STABILITY = 0.34;
export const BLOOM_READINESS = 0.42;

/** Implementation calibrations, not new canon anchors. ECOLOGY_SYSTEM.md Section 5. */
export const SUCCESSION_THRESHOLDS = [0, 55, 180, 420, 820];
export const VAULT_THRESHOLDS = [90, 240, 520, 960, 1500];

/** Positive equal defaults keep every domain present in the geometric gate. */
export const ERA_WEIGHTS: EraContributions = {
  technology: 1 / 6,
  ecology: 1 / 6,
  citizen: 1 / 6,
  culture: 1 / 6,
  memory: 1 / 6,
  economy: 1 / 6,
};

export interface EraGateCalibration {
  threshold: number;
  floors: EraContributions;
}

const floors = (value: number): EraContributions => ({
  technology: value,
  ecology: value,
  citizen: value,
  culture: value,
  memory: value,
  economy: value,
});

/** Strictly increasing readiness and floor calibrations. ERA_PROGRESSION.md Sections 6–7. */
export const ERA_GATES: Partial<Record<EraDesignation, EraGateCalibration>> = {
  CRYSTAL_INSCRIPTION: { threshold: 0.3, floors: floors(0.2) },
  PHONONIC_SUBTERRANEAN: { threshold: 0.48, floors: floors(0.36) },
  OPTOGENETIC_CIRCUIT: { threshold: 0.68, floors: floors(0.56) },
  COSMIC_STELLAR: { threshold: 0.86, floors: floors(0.76) },
};

export const MEMORY_NOTES = {
  firstLight: 'The first sustained light reached the ancestral basin.',
  milestone: 'A protected learning milestone entered the civic record.',
  succession: 'The living systems entered a deeper state of interdependence.',
  vault: 'A buried record surfaced through the mycelial archive.',
  era: 'The civilization crossed a quiet boundary in its relationship to knowledge.',
};
