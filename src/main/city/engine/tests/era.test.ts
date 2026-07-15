/**
 * M5 purity proofs: the no-single-domain law (geometric mean + floors),
 * monotone readiness, one-era-per-evaluation, non-regression, and the
 * permanent transition record.
 */
import { describe, expect, it } from 'vitest';

import { applyEraGate, combinedReadiness, deriveContributions, EraContributions } from '../era';
import { createInitialState, cloneState } from '../state';
import { ERA_FLOORS, ERA_THRESHOLDS } from '../constants';
import { CivilizationState } from '../types';

/** A civilization strong enough in every domain to clear the first gate. */
function strongWorld(): CivilizationState {
  const s = cloneState(createInitialState(3));
  s.technology.researchReadiness = 0.6;
  s.succession.stage = 3;
  s.environment.mycelialMass = 300;
  s.environment.crystalMass = 100;
  s.citizens.population = 40;
  s.learning.kTotal = 4000;
  s.environment.photophoreDiversity = 0.6;
  s.learning.momentum = 0.6;
  s.environment.energy = 800;
  s.environment.energyCapacity = 1440;
  s.environment.circulationReach = 0.5;
  s.memory.vaultDepth = 3;
  for (let i = 0; i < 20; i++) {
    s.memory.records.push({
      ordinal: i + 1,
      type: 'MILESTONE',
      era: 'SPORE_HEARTH',
      note: 'A threshold in the learning life was crossed and witnessed.',
    });
  }
  s.memory.nextOrdinal = 21;
  return s;
}

describe('combinedReadiness — the no-single-domain law', () => {
  const balanced: EraContributions = {
    technology: 0.6,
    ecology: 0.6,
    citizen: 0.6,
    culture: 0.6,
    memory: 0.6,
    economy: 0.6,
  };

  it('a collapsed domain collapses readiness structurally', () => {
    expect(combinedReadiness(balanced)).toBeCloseTo(0.6, 10);
    const collapsed = Object.assign({}, balanced, { culture: 0 });
    expect(combinedReadiness(collapsed)).toBe(0);
  });

  it('is monotone in every contribution', () => {
    const better = Object.assign({}, balanced, { ecology: 0.8 });
    expect(combinedReadiness(better)).toBeGreaterThan(combinedReadiness(balanced));
  });

  it('punishes imbalance: the geometric mean sits below the arithmetic', () => {
    const lopsided: EraContributions = {
      technology: 1,
      ecology: 1,
      citizen: 1,
      culture: 1,
      memory: 1,
      economy: 0.1,
    };
    // Arithmetic mean would be 0.85; the geometric mean is far lower.
    expect(combinedReadiness(lopsided)).toBeLessThan(0.7);
  });
});

describe('applyEraGate — crossing and refusal', () => {
  it('a balanced strong world crosses exactly one boundary', () => {
    const s = strongWorld();
    const after = applyEraGate(s);
    expect(after.era.designation).toBe('CRYSTAL_INSCRIPTION');
    expect(after.era.history).toEqual(['SPORE_HEARTH', 'CRYSTAL_INSCRIPTION']);
    const transitions = after.memory.records.filter((r) => r.type === 'ERA_TRANSITION');
    expect(transitions.length).toBe(1);
    expect(transitions[0].era).toBe('CRYSTAL_INSCRIPTION');
  });

  it('one lagging domain blocks despite five strong ones (floor law)', () => {
    const s = strongWorld();
    s.environment.photophoreDiversity = 0.05; // culture starves
    s.learning.momentum = 0.05;
    const c = deriveContributions(s);
    expect(c.culture).toBeLessThan(ERA_FLOORS[0]);
    const after = applyEraGate(s);
    expect(after.era.designation).toBe('SPORE_HEARTH'); // held
  });

  it('readiness below the threshold holds the gate', () => {
    const s = createInitialState(1); // newborn: everything near zero
    const after = applyEraGate(s);
    expect(after).toBe(s);
    expect(after.era.designation).toBe('SPORE_HEARTH');
  });

  it('advances at most one era per evaluation, however strong the state', () => {
    const s = strongWorld();
    // Absurdly strong in everything — still one step.
    s.technology.researchReadiness = 1;
    s.succession.stage = 5;
    s.environment.mycelialMass = 100000;
    s.citizens.population = 100000;
    s.learning.kTotal = 1000000;
    s.environment.photophoreDiversity = 1;
    s.learning.momentum = 1;
    s.environment.energy = 1440;
    s.environment.circulationReach = 1;
    const after = applyEraGate(s);
    expect(after.era.designation).toBe('CRYSTAL_INSCRIPTION');
  });

  it('the terminal era never advances further', () => {
    const s = strongWorld();
    s.era.designation = 'COSMIC_STELLAR';
    s.era.history = [
      'SPORE_HEARTH',
      'CRYSTAL_INSCRIPTION',
      'PHONONIC_SUBTERRANEAN',
      'OPTOGENETIC_CIRCUIT',
      'COSMIC_STELLAR',
    ];
    expect(applyEraGate(s)).toBe(s);
  });

  it('later thresholds demand strictly more', () => {
    for (let i = 1; i < ERA_THRESHOLDS.length; i++) {
      expect(ERA_THRESHOLDS[i]).toBeGreaterThan(ERA_THRESHOLDS[i - 1]);
    }
  });

  it('never mutates its input', () => {
    const s = strongWorld();
    const frozen = JSON.stringify(s);
    applyEraGate(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('deriveContributions — bounded projections', () => {
  it('all six contributions are bounded [0,1] on any lawful state', () => {
    for (const st of [createInitialState(1), strongWorld()]) {
      const c = deriveContributions(st);
      for (const v of Object.values(c)) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('the newborn world reads near-zero everywhere', () => {
    const c = deriveContributions(createInitialState(1));
    expect(combinedReadiness(c)).toBe(0);
  });
});
