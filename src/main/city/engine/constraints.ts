import { ERA_ORDER, CivilizationState, EraContributions, InterpretedLearningInput, InterpretedProfile, MemoryRecordType } from './types';
import { cloneState } from './state';
import { finiteNonNegative, unit } from './math';

const FORBIDDEN_TOKEN = /^(thermal|heat|fire|flame|combust|smoke|steam|forge|daylight|sun|coin|gold|xp|score|build|construct|zone)$/i;

export class AbyssalConstraintError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AbyssalConstraintError';
  }
}

function fail(message: string): never {
  throw new AbyssalConstraintError(message);
}

function assertFiniteNonNegative(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0) fail(`${path} must be finite and non-negative`);
}

function assertUnit(value: number, path: string): void {
  if (!Number.isFinite(value) || value < 0 || value > 1) fail(`${path} must be within [0,1]`);
}

function assertInteger(value: number, path: string): void {
  if (!Number.isInteger(value) || value < 0) fail(`${path} must be a non-negative integer`);
}

function assertExactKeys(value: object, expected: string[], path: string): void {
  const actual = Object.keys(value).sort();
  const wanted = expected.slice().sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    fail(`${path} has an unknown or missing key`);
  }
}

function identifierTokens(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((token) => token.toLowerCase());
}

function assertTropeGuard(value: unknown, path: string): void {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertTropeGuard(entry, `${path}[${index}]`));
    return;
  }
  Object.keys(value as Record<string, unknown>).forEach((key) => {
    const matched = identifierTokens(key).find((token) => FORBIDDEN_TOKEN.test(token));
    if (matched) fail(`${path}.${key} violates the Trope Guard (${matched})`);
    assertTropeGuard((value as Record<string, unknown>)[key], `${path}.${key}`);
  });
}

function assertContributions(value: EraContributions, path: string): void {
  assertExactKeys(value, ['technology', 'ecology', 'citizen', 'culture', 'memory', 'economy'], path);
  Object.keys(value).forEach((key) => assertUnit(value[key as keyof EraContributions], `${path}.${key}`));
}

export function validateState(state: CivilizationState): CivilizationState {
  if (!state || typeof state !== 'object') fail('state must be an object');
  assertTropeGuard(state, 'state');
  assertExactKeys(state, ['seed', 'revision', 'evaluation', 'status', 'learning', 'ecology', 'citizen', 'technology', 'culture', 'memory', 'economy', 'era'], 'state');

  assertInteger(state.seed, 'state.seed');
  assertInteger(state.revision, 'state.revision');
  assertInteger(state.evaluation, 'state.evaluation');
  if (state.status !== 'active' && state.status !== 'hibernating') fail('state.status is not canonical');

  assertExactKeys(state.learning, ['kTotal', 'consistency', 'momentum', 'sessions', 'securedDepth', 'securedBreadth'], 'state.learning');
  assertFiniteNonNegative(state.learning.kTotal, 'state.learning.kTotal');
  assertInteger(state.learning.consistency, 'state.learning.consistency');
  assertUnit(state.learning.momentum, 'state.learning.momentum');
  assertInteger(state.learning.sessions, 'state.learning.sessions');
  assertUnit(state.learning.securedDepth, 'state.learning.securedDepth');
  assertUnit(state.learning.securedBreadth, 'state.learning.securedBreadth');

  assertExactKeys(state.ecology, ['illumination', 'circulation', 'stability', 'reservoirs', 'energy', 'energyCapacity', 'mycelialRecord', 'mycelialActivity', 'crystalRecord', 'crystalActivity', 'photophoreDiversity', 'circulationReach', 'successionStage', 'xEcology'], 'state.ecology');
  assertUnit(state.ecology.illumination, 'state.ecology.illumination');
  assertUnit(state.ecology.circulation, 'state.ecology.circulation');
  assertUnit(state.ecology.stability, 'state.ecology.stability');
  assertExactKeys(state.ecology.reservoirs, ['brine', 'glucans', 'catalysts'], 'state.ecology.reservoirs');
  Object.keys(state.ecology.reservoirs).forEach((key) => assertFiniteNonNegative(state.ecology.reservoirs[key as keyof typeof state.ecology.reservoirs], `state.ecology.reservoirs.${key}`));
  ['energy', 'energyCapacity', 'mycelialRecord', 'mycelialActivity', 'crystalRecord', 'crystalActivity'].forEach((key) => assertFiniteNonNegative(state.ecology[key as keyof typeof state.ecology] as number, `state.ecology.${key}`));
  assertUnit(state.ecology.photophoreDiversity, 'state.ecology.photophoreDiversity');
  assertUnit(state.ecology.circulationReach, 'state.ecology.circulationReach');
  if (!Number.isInteger(state.ecology.successionStage) || state.ecology.successionStage < 1 || state.ecology.successionStage > 5) fail('state.ecology.successionStage must be 1..5');
  assertUnit(state.ecology.xEcology, 'state.ecology.xEcology');
  if (state.ecology.energy > state.ecology.energyCapacity) fail('state.ecology.energy exceeds capacity');

  assertExactKeys(state.citizen, ['population', 'activity', 'adaptationBreadth', 'roleDifferentiation', 'institutionalParticipation', 'skillTransmission', 'xCitizen'], 'state.citizen');
  assertInteger(state.citizen.population, 'state.citizen.population');
  ['activity', 'adaptationBreadth', 'roleDifferentiation', 'institutionalParticipation', 'skillTransmission', 'xCitizen'].forEach((key) => assertUnit(state.citizen[key as keyof typeof state.citizen] as number, `state.citizen.${key}`));

  assertExactKeys(state.technology, ['researchReadiness', 'heritage', 'activePractice', 'adoptionReach', 'infrastructureMaturity', 'bloomsCrossed', 'xTechnology'], 'state.technology');
  ['researchReadiness', 'heritage', 'activePractice', 'adoptionReach', 'infrastructureMaturity', 'xTechnology'].forEach((key) => assertUnit(state.technology[key as keyof typeof state.technology] as number, `state.technology.${key}`));
  assertInteger(state.technology.bloomsCrossed, 'state.technology.bloomsCrossed');

  assertExactKeys(state.culture, ['activeExpression', 'transmissionFidelity', 'institutionalContinuity', 'interpretiveBreadth', 'tensionCapacity', 'xCulture'], 'state.culture');
  Object.keys(state.culture).forEach((key) => assertUnit(state.culture[key as keyof typeof state.culture], `state.culture.${key}`));

  assertExactKeys(state.memory, ['records', 'nextOrdinal', 'historicalDepth', 'archiveContinuity', 'vaultDepth', 'xMemory'], 'state.memory');
  assertInteger(state.memory.nextOrdinal, 'state.memory.nextOrdinal');
  assertInteger(state.memory.vaultDepth, 'state.memory.vaultDepth');
  assertFiniteNonNegative(state.memory.historicalDepth, 'state.memory.historicalDepth');
  assertUnit(state.memory.archiveContinuity, 'state.memory.archiveContinuity');
  assertUnit(state.memory.xMemory, 'state.memory.xMemory');
  let priorOrdinal = 0;
  const memoryTypes: MemoryRecordType[] = ['FIRST_LIGHT', 'MILESTONE', 'ERA_TRANSITION', 'VAULT_DISCOVERY', 'SUCCESSION_ADVANCE'];
  state.memory.records.forEach((record, index) => {
    assertExactKeys(record, ['ordinal', 'evaluation', 'type', 'era', 'note'], `state.memory.records[${index}]`);
    assertInteger(record.ordinal, `state.memory.records[${index}].ordinal`);
    assertInteger(record.evaluation, `state.memory.records[${index}].evaluation`);
    if (record.ordinal <= priorOrdinal) fail('memory ordinals must be strictly increasing');
    priorOrdinal = record.ordinal;
    if (memoryTypes.indexOf(record.type) < 0) fail('memory record type is not canonical');
    if (ERA_ORDER.indexOf(record.era) < 0) fail('memory record era is not canonical');
    if (typeof record.note !== 'string' || record.note.length === 0) fail('memory record note is required');
  });
  if (state.memory.nextOrdinal <= priorOrdinal) fail('memory nextOrdinal must follow the record ledger');

  assertExactKeys(state.economy, ['activeCoordination', 'productiveCapacity', 'distributionReach', 'institutionalCoordination', 'maintenanceResilience', 'regionalIntegration', 'specialistSupport', 'xEconomy'], 'state.economy');
  Object.keys(state.economy).forEach((key) => assertUnit(state.economy[key as keyof typeof state.economy], `state.economy.${key}`));

  assertExactKeys(state.era, ['designation', 'history', 'contributions', 'combinedReadiness'], 'state.era');
  const eraIndex = ERA_ORDER.indexOf(state.era.designation);
  if (eraIndex < 0) fail('state.era.designation is not canonical');
  if (state.era.history.length !== eraIndex + 1 || state.era.history.some((era, index) => era !== ERA_ORDER[index])) fail('state.era.history must be a canonical prefix ending at designation');
  assertContributions(state.era.contributions, 'state.era.contributions');
  assertUnit(state.era.combinedReadiness, 'state.era.combinedReadiness');

  if (state.status === 'hibernating' && (state.ecology.illumination !== 0 || state.ecology.circulation !== 0)) fail('hibernation entails zero illumination and circulation');
  return state;
}

export function assertLegacyPreserved(before: CivilizationState, after: CivilizationState): void {
  const monotone: Array<[number, number, string]> = [
    [before.learning.kTotal, after.learning.kTotal, 'learning.kTotal'],
    [before.learning.sessions, after.learning.sessions, 'learning.sessions'],
    [before.learning.securedDepth, after.learning.securedDepth, 'learning.securedDepth'],
    [before.learning.securedBreadth, after.learning.securedBreadth, 'learning.securedBreadth'],
    [before.ecology.mycelialRecord, after.ecology.mycelialRecord, 'ecology.mycelialRecord'],
    [before.ecology.crystalRecord, after.ecology.crystalRecord, 'ecology.crystalRecord'],
    [before.ecology.photophoreDiversity, after.ecology.photophoreDiversity, 'ecology.photophoreDiversity'],
    [before.ecology.circulationReach, after.ecology.circulationReach, 'ecology.circulationReach'],
    [before.ecology.successionStage, after.ecology.successionStage, 'ecology.successionStage'],
    [before.ecology.xEcology, after.ecology.xEcology, 'ecology.xEcology'],
    [before.citizen.population, after.citizen.population, 'citizen.population'],
    [before.citizen.xCitizen, after.citizen.xCitizen, 'citizen.xCitizen'],
    [before.technology.researchReadiness, after.technology.researchReadiness, 'technology.researchReadiness'],
    [before.technology.heritage, after.technology.heritage, 'technology.heritage'],
    [before.technology.xTechnology, after.technology.xTechnology, 'technology.xTechnology'],
    [before.culture.xCulture, after.culture.xCulture, 'culture.xCulture'],
    [before.memory.historicalDepth, after.memory.historicalDepth, 'memory.historicalDepth'],
    [before.memory.xMemory, after.memory.xMemory, 'memory.xMemory'],
    [before.economy.xEconomy, after.economy.xEconomy, 'economy.xEconomy'],
  ];
  monotone.forEach(([previous, next, path]) => {
    if (next + Number.EPSILON < previous) fail(`legacy regressed at ${path}`);
  });
  if (after.memory.records.length < before.memory.records.length) fail('memory record ledger regressed');
  before.memory.records.forEach((record, index) => {
    if (JSON.stringify(record) !== JSON.stringify(after.memory.records[index])) fail(`memory record ${record.ordinal} was rewritten`);
  });
  if (ERA_ORDER.indexOf(after.era.designation) < ERA_ORDER.indexOf(before.era.designation)) fail('era regressed');
}

const PROFILE_KEYS: Array<keyof InterpretedProfile> = [
  'conceptualDepth', 'retention', 'disciplinaryExposure', 'interdisciplinaryConnection', 'sustainedAttention',
  'mastery', 'curiosity', 'revisionStrength', 'difficulty', 'novelty',
];

export function normalizeInput(input: InterpretedLearningInput): InterpretedLearningInput {
  const profile = {} as InterpretedProfile;
  PROFILE_KEYS.forEach((key) => { profile[key] = unit(Number(input.profile[key])); });
  let brine = finiteNonNegative(Number(input.pathways.brine));
  let glucans = finiteNonNegative(Number(input.pathways.glucans));
  let catalysts = finiteNonNegative(Number(input.pathways.catalysts));
  const total = brine + glucans + catalysts;
  if (total > 0) {
    brine /= total;
    glucans /= total;
    catalysts /= total;
  } else {
    glucans = 1;
  }
  return {
    focusDuration: finiteNonNegative(Number(input.focusDuration)),
    profile,
    pathways: { brine, glucans, catalysts },
    difficulty: unit(Number(input.difficulty)),
    difficultyConfidence: input.difficultyConfidence === 'measured' ? 'measured' : 'inferred',
    consistency: Math.floor(finiteNonNegative(Number(input.consistency))),
    completion: input.completion === true,
  };
}

export function lawfulClone(state: CivilizationState): CivilizationState {
  return validateState(cloneState(state));
}
