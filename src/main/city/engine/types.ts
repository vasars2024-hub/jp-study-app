/**
 * Noctis Simulation Engine — public type surface.
 *
 * Pure TypeScript boundary: no Electron, React, Node, clock, or randomness.
 * Shapes specialize the state families of docs/SIMULATION_SYSTEMS.md Section 2
 * and the input contract of docs/LEARNING_INTEGRATION.md Section 5. Exact
 * field identifiers are implementation-owned (SIMULATION_SYSTEMS.md Section 2
 * defers them to this layer).
 */

/** The five canonical eras, fixed order, never regressing (SIMULATION_SYSTEMS.md Section 15). */
export type EraDesignation =
  | 'SPORE_HEARTH'
  | 'CRYSTAL_INSCRIPTION'
  | 'PHONONIC_SUBTERRANEAN'
  | 'OPTOGENETIC_CIRCUIT'
  | 'COSMIC_STELLAR';

/** Canonical era order for gating and validation. */
export const ERA_ORDER: EraDesignation[] = [
  'SPORE_HEARTH',
  'CRYSTAL_INSCRIPTION',
  'PHONONIC_SUBTERRANEAN',
  'OPTOGENETIC_CIRCUIT',
  'COSMIC_STELLAR',
];

/** Hibernation entails zero illumination (SIMULATION_SYSTEMS.md Section 1 invariants). */
export type CivilizationStatus = 'active' | 'hibernating';

/**
 * The four closed engine event flags (SIMULATION_SYSTEMS.md Section 12;
 * ARCHITECTURE.md Section 6). No domain may add a fifth. Emitted in the
 * canonical row order of NOCTIS_ECOLOGICAL_ENGINE.md section 7.
 */
export type EngineEventFlag =
  | 'THE_PHEROMONE_PLUME'
  | 'BAROMETRIC_SHOCK_WAVE'
  | 'ABYSSAL_DOUSE'
  | 'BENTHIC_BLOOM';

/**
 * The interpreted learning profile: bounded [0,1] dimensions, already
 * digested from raw telemetry (LEARNING_INTEGRATION.md Section 6). Every
 * downstream reading consumes these, never raw study data.
 */
export interface InterpretedProfile {
  conceptualDepth: number;
  retention: number;
  disciplinaryExposure: number;
  interdisciplinaryConnection: number;
  sustainedAttention: number;
  mastery: number;
  curiosity: number;
  revisionStrength: number;
  difficulty: number;
  novelty: number;
}

/**
 * Nutrient pathway weight vector w(c) (LEARNING_INTEGRATION.md Section 7;
 * SIMULATION_SYSTEMS.md Section 7). Components sum to 1. Symbolic ecological
 * tendency, never an unlock equation.
 */
export interface PathwayWeights {
  brine: number; // mathematics/logic tendency -> crystalline order
  glucans: number; // history/languages tendency -> mycelial reach
  catalysts: number; // creative + science/engineering tendency -> light and circulation
}

/**
 * The interpreted learning input I — the sole external payload the engine
 * accepts (SIMULATION_SYSTEMS.md Section 3; LEARNING_INTEGRATION.md Section 5).
 * No book title, word, id, or raw timestamp is ever present (privacy law,
 * LEARNING_INTEGRATION.md Section 9).
 */
export interface InterpretedLearningInput {
  /** d — real focused minutes in the interpreted window. */
  focusDuration: number;
  profile: InterpretedProfile;
  pathways: PathwayWeights;
  /** f — difficulty signal in [0,1]; low-confidence when inferred (Section 9). */
  difficulty: number;
  difficultyConfidence: 'measured' | 'inferred';
  /** k — consecutive-day study count, from real session history. */
  consistency: number;
  /** b — conservative breakthrough/milestone marker (Section 8). */
  completion: boolean;
}

/** Measured game round outcome (v1.01 Game Arena engine callback). Counts and bands only. */
export interface GameRoundResult {
  score: number; // 0..100
  accuracy: number; // 0..1
  mistakeCount: number;
}

/** Measured writing evaluation axes (v1.01 Mirror Writing), each 0..100. */
export interface WritingEvaluation {
  grammar: number;
  lexical: number;
  flow: number;
  semantic: number;
}

/**
 * The raw-telemetry window the renderer bridge accumulates and hands to the
 * interpretation membrane (LEARNING_INTEGRATION.md Sections 3-4). Core fields
 * exist in the app today; optional fields land with the v1.01 roadmap and
 * degrade gracefully when absent (invariants 4 and 9). Counts only — never
 * titles, ids, words, or notes.
 */
export interface TelemetryWindow {
  focusSeconds: number;
  chars: number;
  streak: number;
  knowledgeCounts: { learning: number; familiar: number; known: number };
  savedWordDelta: number;
  flashcardEventCount: number;
  achievementCount: number;
  distinctBooks: number;
  newBooks: number;
  // Optional v1.01 telemetry (IMPLEMENTATION_PLAN_V1.01.md accommodation):
  gameResults?: GameRoundResult[];
  writingEvaluations?: WritingEvaluation[];
  userLevel?: number; // 1..7 (LevelService)
  levelCoverage?: number; // 0..1
  levelUp?: boolean;
  pronunciationAttempts?: number;
}

/** Learning-derived accumulators (SIMULATION_SYSTEMS.md Section 2, learning family). */
export interface LearningState {
  /** K_total — lifetime accumulated knowledge. Legacy: monotone, never decreases. */
  kTotal: number;
  /** k — consecutive-day consistency, mirrored from the latest input. */
  consistency: number;
  /** m — learning momentum, a renewable expression in [0,1]. */
  momentum: number;
}

/** Nutrient reservoirs (renewable expression; SIMULATION_SYSTEMS.md Section 5). */
export interface NutrientReservoirs {
  brine: number;
  glucans: number;
  catalysts: number;
}

/** Environmental / ecological family (ECOLOGY_SYSTEM.md; SIMULATION_SYSTEMS.md Section 2). */
export interface EnvironmentState {
  /** L — illumination, strictly [0,1] (heatless waveband law). Renewable. */
  illumination: number;
  /** Phi — circulation, [0,1]. Renewable. */
  circulation: number;
  /** sigma — atmospheric stability, [0,1]. Renewable. */
  stability: number;
  reservoirs: NutrientReservoirs;
  /** E — banked cognitive energy in shield-minutes. Renewable (discharges). */
  energy: number;
  /** C_E — storage capacity, grows with crystal mass. Derived-but-committed. */
  energyCapacity: number;
  /** X_myc — cumulative mycelial record. Legacy: monotone (ECOLOGY_SYSTEM.md Section 7). */
  mycelialMass: number;
  /** X_cry — cumulative crystal record. Legacy: monotone. */
  crystalMass: number;
  /** Photophore expressive diversity, [0,1]. Cumulative expression, monotone. */
  photophoreDiversity: number;
  /** Circulation routing reach, [0,1], saturating toward the era ceiling. */
  circulationReach: number;
}

/** Ecological succession stage 1..5, monotone, distinct from eras (ECOLOGY_SYSTEM.md Section 5). */
export interface SuccessionState {
  stage: number;
}

/** Citizen family: aggregate count and activity only (CITIZEN_SYSTEM.md Section 3). */
export interface CitizenState {
  /** P — non-negative integer; user absence never reduces it (Laws 5-6). */
  population: number;
  /** A_P — activity expression [0,1]. Renewable. */
  activity: number;
}

/** Technology family, v1 fidelity: civilization-level research readiness R. */
export interface TechnologyState {
  /** R — research readiness [0,1]. Permanent readiness once earned (Section 12, BENTHIC_BLOOM). */
  researchReadiness: number;
  /** Count of bloom thresholds already crossed (edge-trigger memory). */
  bloomsCrossed: number;
}

/** Era family (SIMULATION_SYSTEMS.md Section 15; ERA_PROGRESSION.md). */
export interface EraState {
  designation: EraDesignation;
  /** Eras reached, in order. Legacy: append-only. */
  history: EraDesignation[];
}

export type MemoryRecordType =
  | 'FIRST_LIGHT'
  | 'MILESTONE'
  | 'ERA_TRANSITION'
  | 'VAULT_DISCOVERY'
  | 'SUCCESSION_ADVANCE';

/**
 * A permanent memory record (MEMORY_SYSTEM.md; GAME_DESIGN.md Section 9).
 * Immutable once written; absence never erases it; notes are quiet and
 * carry no raw telemetry.
 */
export interface MemoryRecord {
  ordinal: number;
  type: MemoryRecordType;
  era: EraDesignation;
  note: string;
}

/** Memory family: the legacy ledger (SIMULATION_SYSTEMS.md Sections 10, 21). */
export interface MemoryState {
  records: MemoryRecord[];
  nextOrdinal: number;
  /** Vault breach count — index into the strictly increasing theta_vault series. Legacy. */
  vaultDepth: number;
}

/**
 * The committed civilization state snapshot S (SIMULATION_SYSTEMS.md Section 1).
 * Every evaluation returns a fresh object; inputs are never mutated.
 */
export interface CivilizationState {
  /** Civilization seed, committed once at creation; sole entropy source (Section 11). */
  seed: number;
  status: CivilizationStatus;
  learning: LearningState;
  environment: EnvironmentState;
  succession: SuccessionState;
  citizens: CitizenState;
  technology: TechnologyState;
  era: EraState;
  memory: MemoryState;
}

/** Result of one committed evaluation: new snapshot plus ordered event flags. */
export interface EvaluationResult {
  state: CivilizationState;
  flags: EngineEventFlag[];
}

/**
 * The persisted envelope (ARCHITECTURE.md persistence contract). savedAt is
 * stamped by the service layer (the engine never reads a clock).
 */
export interface NoctisStateEnvelope {
  schemaVersion: number;
  savedAt: number;
  state: CivilizationState;
}
