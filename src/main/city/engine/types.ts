/**
 * Noctis deterministic engine public contracts.
 *
 * This boundary contains plain structured-clone-safe data only. It imports no
 * Electron, DOM, Node, clock, timer, or presentation implementation.
 */

export type EraDesignation =
  | 'SPORE_HEARTH'
  | 'CRYSTAL_INSCRIPTION'
  | 'PHONONIC_SUBTERRANEAN'
  | 'OPTOGENETIC_CIRCUIT'
  | 'COSMIC_STELLAR';

export const ERA_ORDER: EraDesignation[] = [
  'SPORE_HEARTH',
  'CRYSTAL_INSCRIPTION',
  'PHONONIC_SUBTERRANEAN',
  'OPTOGENETIC_CIRCUIT',
  'COSMIC_STELLAR',
];

export type CivilizationStatus = 'active' | 'hibernating';

/** Closed set fixed by ARCHITECTURE.md Section 6 and SIMULATION_SYSTEMS.md Section 12. */
export type EngineEventFlag =
  | 'THE_PHEROMONE_PLUME'
  | 'BAROMETRIC_SHOCK_WAVE'
  | 'ABYSSAL_DOUSE'
  | 'BENTHIC_BLOOM';

export type DomainName =
  | 'learning'
  | 'ecology'
  | 'citizen'
  | 'technology'
  | 'culture'
  | 'memory'
  | 'economy'
  | 'era';

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

export interface PathwayWeights {
  brine: number;
  glucans: number;
  catalysts: number;
}

/** The only learning payload accepted by the simulation. */
export interface InterpretedLearningInput {
  focusDuration: number;
  profile: InterpretedProfile;
  pathways: PathwayWeights;
  difficulty: number;
  difficultyConfidence: 'measured' | 'inferred';
  consistency: number;
  completion: boolean;
}

export interface GameRoundResult {
  score: number;
  accuracy: number;
  mistakeCount: number;
}

export interface WritingEvaluation {
  grammar: number;
  lexical: number;
  flow: number;
  semantic: number;
}

/** Renderer-local, counts-only source window consumed by interpretation.ts. */
export interface TelemetryWindow {
  focusSeconds: number;
  chars: number;
  streak: number;
  knowledgeCounts: { learning: number; familiar: number; known: number };
  savedWordDelta: number;
  flashcardEventCount: number;
  knowledgeChangeCount?: number;
  achievementCount: number;
  distinctBooks: number;
  newBooks: number;
  gameResults?: GameRoundResult[];
  writingEvaluations?: WritingEvaluation[];
  userLevel?: number;
  levelCoverage?: number;
  levelUp?: boolean;
  pronunciationAttempts?: number;
}

export interface LearningState {
  kTotal: number;
  consistency: number;
  momentum: number;
  sessions: number;
  securedDepth: number;
  securedBreadth: number;
}

export interface NutrientReservoirs {
  brine: number;
  glucans: number;
  catalysts: number;
}

export interface EcologyState {
  illumination: number;
  circulation: number;
  stability: number;
  reservoirs: NutrientReservoirs;
  energy: number;
  energyCapacity: number;
  mycelialRecord: number;
  mycelialActivity: number;
  crystalRecord: number;
  crystalActivity: number;
  photophoreDiversity: number;
  circulationReach: number;
  successionStage: number;
  xEcology: number;
}

export interface CitizenState {
  population: number;
  activity: number;
  adaptationBreadth: number;
  roleDifferentiation: number;
  institutionalParticipation: number;
  skillTransmission: number;
  xCitizen: number;
}

export interface TechnologyState {
  researchReadiness: number;
  heritage: number;
  activePractice: number;
  adoptionReach: number;
  infrastructureMaturity: number;
  bloomsCrossed: number;
  xTechnology: number;
}

export interface CultureState {
  activeExpression: number;
  transmissionFidelity: number;
  institutionalContinuity: number;
  interpretiveBreadth: number;
  tensionCapacity: number;
  xCulture: number;
}

export type MemoryRecordType =
  | 'FIRST_LIGHT'
  | 'MILESTONE'
  | 'ERA_TRANSITION'
  | 'VAULT_DISCOVERY'
  | 'SUCCESSION_ADVANCE';

export interface MemoryRecord {
  ordinal: number;
  evaluation: number;
  type: MemoryRecordType;
  era: EraDesignation;
  note: string;
}

export interface MemoryState {
  records: MemoryRecord[];
  nextOrdinal: number;
  historicalDepth: number;
  archiveContinuity: number;
  vaultDepth: number;
  xMemory: number;
}

export interface EconomyState {
  activeCoordination: number;
  productiveCapacity: number;
  distributionReach: number;
  institutionalCoordination: number;
  maintenanceResilience: number;
  regionalIntegration: number;
  specialistSupport: number;
  xEconomy: number;
}

export interface EraContributions {
  technology: number;
  ecology: number;
  citizen: number;
  culture: number;
  memory: number;
  economy: number;
}

export interface EraState {
  designation: EraDesignation;
  history: EraDesignation[];
  contributions: EraContributions;
  combinedReadiness: number;
}

export interface CivilizationState {
  seed: number;
  revision: number;
  evaluation: number;
  status: CivilizationStatus;
  learning: LearningState;
  ecology: EcologyState;
  citizen: CitizenState;
  technology: TechnologyState;
  culture: CultureState;
  memory: MemoryState;
  economy: EconomyState;
  era: EraState;
}

export interface EvaluationResult {
  state: CivilizationState;
  flags: EngineEventFlag[];
}

export interface NoctisStateEnvelope {
  schemaVersion: number;
  savedAt: number;
  appliedSessionIds: string[];
  state: CivilizationState;
}

/** Pure downstream projection defined by VISUAL_PIPELINE.md Section 2. */
export interface CityPresentationModel {
  sceneId: string;
  seed: number;
  revision: number;
  era: EraDesignation;
  status: CivilizationStatus;
  illumination01: number;
  circulation01: number;
  stability01: number;
  activity01: number;
  pathwayBlend: { brine01: number; glucan01: number; catalyst01: number };
  ecology: {
    succession: number;
    crystalMaturity01: number;
    mycelialMaturity01: number;
  };
  civic: {
    density01: number;
    institutionalMaturity01: number;
  };
  atmosphere: {
    intensity01: number;
    eventAccent: EngineEventFlag | null;
  };
  memoryCount: number;
}
