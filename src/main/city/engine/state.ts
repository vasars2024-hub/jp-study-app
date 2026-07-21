import { ENERGY_CAPACITY_BASE, INITIAL_CIRCULATION, INITIAL_ILLUMINATION, INITIAL_POPULATION, INITIAL_STABILITY, NOCTIS_SCHEMA_VERSION } from './constants';
import { CivilizationState, NoctisStateEnvelope } from './types';

export function createInitialState(seed: number): CivilizationState {
  return {
    seed: seed >>> 0,
    revision: 0,
    evaluation: 0,
    status: 'active',
    learning: {
      kTotal: 0,
      consistency: 0,
      momentum: 0,
      sessions: 0,
      securedDepth: 0,
      securedBreadth: 0,
    },
    ecology: {
      illumination: INITIAL_ILLUMINATION,
      circulation: INITIAL_CIRCULATION,
      stability: INITIAL_STABILITY,
      reservoirs: { brine: 0, glucans: 0, catalysts: 0 },
      energy: 0,
      energyCapacity: ENERGY_CAPACITY_BASE,
      mycelialRecord: 0,
      mycelialActivity: 0,
      crystalRecord: 0,
      crystalActivity: 0,
      photophoreDiversity: 0,
      circulationReach: 0,
      successionStage: 1,
      xEcology: 0,
    },
    citizen: {
      population: INITIAL_POPULATION,
      activity: 0.12,
      adaptationBreadth: 0,
      roleDifferentiation: 0,
      institutionalParticipation: 0,
      skillTransmission: 0,
      xCitizen: 0,
    },
    technology: {
      researchReadiness: 0,
      heritage: 0,
      activePractice: 0,
      adoptionReach: 0,
      infrastructureMaturity: 0,
      bloomsCrossed: 0,
      xTechnology: 0,
    },
    culture: {
      activeExpression: 0,
      transmissionFidelity: 0,
      institutionalContinuity: 0,
      interpretiveBreadth: 0,
      tensionCapacity: 0,
      xCulture: 0,
    },
    memory: {
      records: [],
      nextOrdinal: 1,
      historicalDepth: 0,
      archiveContinuity: 0,
      vaultDepth: 0,
      xMemory: 0,
    },
    economy: {
      activeCoordination: 0,
      productiveCapacity: 0,
      distributionReach: 0,
      institutionalCoordination: 0,
      maintenanceResilience: 0,
      regionalIntegration: 0,
      specialistSupport: 0,
      xEconomy: 0,
    },
    era: {
      designation: 'SPORE_HEARTH',
      history: ['SPORE_HEARTH'],
      contributions: { technology: 0, ecology: 0, citizen: 0, culture: 0, memory: 0, economy: 0 },
      combinedReadiness: 0,
    },
  };
}

export function cloneState(state: CivilizationState): CivilizationState {
  return JSON.parse(JSON.stringify(state)) as CivilizationState;
}

export function createEnvelope(
  state: CivilizationState,
  savedAt: number,
  appliedSessionIds: string[] = [],
): NoctisStateEnvelope {
  return { schemaVersion: NOCTIS_SCHEMA_VERSION, savedAt, appliedSessionIds: appliedSessionIds.slice(), state };
}
