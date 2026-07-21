// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  ABSENCE_HORIZON_MINUTES,
  AbyssalConstraintError,
  ERA_ORDER,
  InterpretedLearningInput,
  advanceCivilizationTime,
  createInitialState,
  evaluateCivilization,
  projectCityPresentation,
  validateState,
} from '../index';

function input(overrides: Partial<InterpretedLearningInput> = {}): InterpretedLearningInput {
  return {
    focusDuration: 45,
    profile: {
      conceptualDepth: 0.72,
      retention: 0.76,
      disciplinaryExposure: 0.46,
      interdisciplinaryConnection: 0.34,
      sustainedAttention: 0.8,
      mastery: 0.64,
      curiosity: 0.55,
      revisionStrength: 0.4,
      difficulty: 0.52,
      novelty: 0.48,
    },
    pathways: { brine: 0.1, glucans: 0.62, catalysts: 0.28 },
    difficulty: 0.52,
    difficultyConfidence: 'measured',
    consistency: 2,
    completion: false,
    ...overrides,
  };
}

describe('Noctis engine foundations', () => {
  it('is immutable and deterministic', () => {
    const state = createInitialState(41);
    const source = JSON.stringify(state);
    const first = evaluateCivilization(state, input());
    const second = evaluateCivilization(state, input());
    expect(JSON.stringify(state)).toBe(source);
    expect(first).toEqual(second);
    expect(first.state).not.toBe(state);
  });

  it('rejects unknown and non-finite state', () => {
    const invalid = createInitialState(1) as ReturnType<typeof createInitialState> & { extra?: number };
    invalid.extra = 1;
    expect(() => validateState(invalid)).toThrow(AbyssalConstraintError);
    delete invalid.extra;
    invalid.ecology.stability = Number.NaN;
    expect(() => validateState(invalid)).toThrow(AbyssalConstraintError);
  });

  it('makes elapsed-time evaluation composable before dormancy', () => {
    const charged = createInitialState(2);
    charged.ecology.energy = 90;
    const once = advanceCivilizationTime(charged, 180).state;
    const twice = advanceCivilizationTime(
      advanceCivilizationTime(charged, 60).state,
      120,
    ).state;
    expect(twice.ecology.illumination).toBeCloseTo(once.ecology.illumination, 12);
    expect(twice.ecology.energy).toBeCloseTo(once.ecology.energy, 12);
  });

  it('enters a fixed hibernation state after the absence horizon', () => {
    const dormant = advanceCivilizationTime(createInitialState(3), ABSENCE_HORIZON_MINUTES + 1).state;
    expect(dormant.status).toBe('hibernating');
    expect(dormant.ecology.illumination).toBe(0);
    const later = advanceCivilizationTime(dormant, ABSENCE_HORIZON_MINUTES).state;
    expect(later.ecology).toEqual(dormant.ecology);
  });

  it('requires ten focused minutes to wake and prevents dormant domain progress', () => {
    const dormant = advanceCivilizationTime(createInitialState(4), ABSENCE_HORIZON_MINUTES + 1).state;
    const short = evaluateCivilization(dormant, input({ focusDuration: 9 })).state;
    expect(short.status).toBe('hibernating');
    expect(short.learning.sessions).toBe(1);
    expect(short.ecology.energy).toBeGreaterThan(0);
    expect(short.citizen).toEqual(dormant.citizen);
    expect(short.era).toEqual(dormant.era);
    const awake = evaluateCivilization(short, input({ focusDuration: 10 })).state;
    expect(awake.status).toBe('active');
    expect(awake.ecology.illumination).toBeGreaterThan(0);
  });
});

describe('Noctis domain resolution', () => {
  it('emits the canonical consistency crossing and keeps every era contribution explicit', () => {
    const result = evaluateCivilization(createInitialState(5), input({ consistency: 3 }));
    expect(result.flags).toContain('THE_PHEROMONE_PLUME');
    expect(Object.keys(result.state.era.contributions).sort()).toEqual([
      'citizen', 'culture', 'ecology', 'economy', 'memory', 'technology',
    ]);
  });

  it('does not allow Technology alone to cross an era gate', () => {
    const state = createInitialState(6);
    state.technology.xTechnology = 1;
    state.technology.researchReadiness = 1;
    const result = evaluateCivilization(state, input({ focusDuration: 0, profile: { ...input().profile, revisionStrength: 0 } }));
    expect(result.state.era.designation).toBe('SPORE_HEARTH');
    expect(result.state.era.combinedReadiness).toBe(0);
  });

  it('advances at most one era in one evaluation', () => {
    let state = createInitialState(7);
    state.learning.kTotal = 1000;
    state.learning.sessions = 200;
    state.learning.securedDepth = 1;
    state.learning.securedBreadth = 1;
    state.ecology.xEcology = 1;
    state.citizen.xCitizen = 1;
    state.technology.xTechnology = 1;
    state.culture.xCulture = 1;
    state.memory.xMemory = 1;
    state.economy.xEconomy = 1;
    const before = ERA_ORDER.indexOf(state.era.designation);
    state = evaluateCivilization(state, input()).state;
    expect(ERA_ORDER.indexOf(state.era.designation) - before).toBeLessThanOrEqual(1);
  });

  it('records first light after resolution without rewriting prior records', () => {
    const first = evaluateCivilization(createInitialState(8), input()).state;
    expect(first.memory.records[0].type).toBe('FIRST_LIGHT');
    const record = JSON.stringify(first.memory.records[0]);
    const second = evaluateCivilization(first, input({ completion: true })).state;
    expect(JSON.stringify(second.memory.records[0])).toBe(record);
    expect(second.memory.records.some((entry) => entry.type === 'MILESTONE')).toBe(true);
  });

  it('keeps an ordinary first session in the ancestral era without stacked long-term discoveries', () => {
    const first = evaluateCivilization(createInitialState(81), input({ completion: true })).state;
    expect(first.era.designation).toBe('SPORE_HEARTH');
    expect(first.memory.records.map((record) => record.type)).toEqual(['FIRST_LIGHT', 'MILESTONE']);
  });

  it('projects a detached, structured presentation model', () => {
    const state = evaluateCivilization(createInitialState(9), input()).state;
    const model = projectCityPresentation(state, ['BENTHIC_BLOOM']);
    expect(model.atmosphere.eventAccent).toBe('BENTHIC_BLOOM');
    expect(model.era).toBe(state.era.designation);
    expect(Object.values(model.pathwayBlend).every(Number.isFinite)).toBe(true);
    expect('state' in (model as unknown as Record<string, unknown>)).toBe(false);
  });
});
