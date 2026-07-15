/**
 * M4 purity proofs: monotone-in-effort, saturation (daily practice dominates
 * a binge), banking and overflow, monotone legacy growth, vault thresholds,
 * succession advancement, citizen emergence, and immutability.
 */
import { describe, expect, it } from 'vitest';

import { applyLearning } from '../metabolism';
import { createInitialState, cloneState } from '../state';
import { validateState, assertLegacyPreserved } from '../constraints';
import { METABOLIC_CAP_MINUTES, VAULT_BASE } from '../constants';
import { CivilizationState, InterpretedLearningInput } from '../types';

function input(minutes: number, overrides?: Partial<InterpretedLearningInput>): InterpretedLearningInput {
  const base: InterpretedLearningInput = {
    focusDuration: minutes,
    profile: {
      conceptualDepth: 0.5,
      retention: 0.5,
      disciplinaryExposure: 0.3,
      interdisciplinaryConnection: 0,
      sustainedAttention: 0.5,
      mastery: 0.3,
      curiosity: 0.3,
      revisionStrength: 0.3,
      difficulty: 0.2,
      novelty: 0.3,
    },
    pathways: { brine: 0.05, glucans: 0.8, catalysts: 0.15 },
    difficulty: 0.2,
    difficultyConfidence: 'inferred',
    consistency: 1,
    completion: false,
  };
  return Object.assign(base, overrides);
}

function grownWorld(): CivilizationState {
  // A world after some weeks of study, for mid-life assertions.
  let s = createInitialState(5);
  for (let i = 0; i < 20; i++) {
    s = applyLearning(s, input(45, { consistency: Math.min(i + 1, 10) }));
  }
  return s;
}

describe('applyLearning — accumulation and validity', () => {
  it('grows kTotal, lights the world, and stays lawful', () => {
    const s0 = createInitialState(1);
    const s1 = applyLearning(s0, input(30));
    expect(s1.learning.kTotal).toBeGreaterThan(0);
    expect(s1.environment.illumination).toBeGreaterThan(0);
    expect(s1.environment.mycelialMass).toBeGreaterThan(0);
    expect(() => validateState(s1)).not.toThrow();
    assertLegacyPreserved(s0, s1);
  });

  it('records FIRST_LIGHT exactly once, on the first session ever', () => {
    const s0 = createInitialState(1);
    const s1 = applyLearning(s0, input(15));
    const s2 = applyLearning(s1, input(15));
    const firstLights = (st: CivilizationState) =>
      st.memory.records.filter((r) => r.type === 'FIRST_LIGHT').length;
    expect(firstLights(s1)).toBe(1);
    expect(firstLights(s2)).toBe(1);
  });

  it('never mutates its input snapshot', () => {
    const s = grownWorld();
    const frozen = JSON.stringify(s);
    applyLearning(s, input(60, { completion: true, difficulty: 0.9 }));
    expect(JSON.stringify(s)).toBe(frozen);
  });

  it('an empty window only mirrors consistency', () => {
    const s = grownWorld();
    const after = applyLearning(s, input(0, { consistency: 4 }));
    expect(after.learning.consistency).toBe(4);
    expect(after.learning.kTotal).toBe(s.learning.kTotal);
    expect(after.environment.illumination).toBe(s.environment.illumination);
  });
});

describe('applyLearning — monotone in honest effort', () => {
  it('more minutes never yield less', () => {
    const s = grownWorld();
    const short = applyLearning(s, input(15));
    const long = applyLearning(s, input(90));
    expect(long.learning.kTotal).toBeGreaterThan(short.learning.kTotal);
    expect(long.environment.mycelialMass).toBeGreaterThanOrEqual(short.environment.mycelialMass);
    expect(long.environment.energy).toBeGreaterThanOrEqual(short.environment.energy);
  });

  it('higher quality never yields less', () => {
    const s = grownWorld();
    const shallow = applyLearning(s, input(45));
    const deep = applyLearning(
      s,
      input(45, {
        profile: Object.assign({}, input(45).profile, { conceptualDepth: 0.9, retention: 0.9 }),
      }),
    );
    expect(deep.learning.kTotal).toBeGreaterThan(shallow.learning.kTotal);
  });
});

describe('applyLearning — saturation: practice dominates the binge', () => {
  it('metabolized uptake saturates while the surplus banks, never punished', () => {
    const s = grownWorld();
    const binge = applyLearning(s, input(600)); // one 10-hour binge
    let daily = s;
    for (let d = 0; d < 10; d++) daily = applyLearning(daily, input(60));

    // The binge banked heavily (surplus energy) but grew the ecology less
    // than ten spaced hours: metabolism runs at the pace of life.
    const bingeGrowth = binge.environment.mycelialMass - s.environment.mycelialMass;
    const dailyGrowth = daily.environment.mycelialMass - s.environment.mycelialMass;
    expect(dailyGrowth).toBeGreaterThan(bingeGrowth);

    // But the binge is never punished: everything is >= the starting state.
    assertLegacyPreserved(s, binge);
    expect(binge.environment.energy).toBeGreaterThan(s.environment.energy);
  });

  it('banking respects lattice capacity (overflow dissipates)', () => {
    const s = grownWorld();
    const after = applyLearning(s, input(100000)); // absurd input
    expect(after.environment.energy).toBeLessThanOrEqual(after.environment.energyCapacity);
    expect(() => validateState(after)).not.toThrow();
  });

  it('effort cap constant stays sane', () => {
    expect(METABOLIC_CAP_MINUTES).toBeGreaterThan(0);
  });
});

describe('applyLearning — growth, succession, vaults, citizens', () => {
  it('glucan-weighted study grows mycelium ahead of crystal', () => {
    const s = grownWorld();
    expect(s.environment.mycelialMass).toBeGreaterThan(s.environment.crystalMass);
  });

  it('sustained study advances succession monotonically with records', () => {
    const s = grownWorld();
    expect(s.succession.stage).toBeGreaterThanOrEqual(2);
    const advances = s.memory.records.filter((r) => r.type === 'SUCCESSION_ADVANCE');
    expect(advances.length).toBe(s.succession.stage - 1);
  });

  it('vault breaches follow the strictly increasing depth series', () => {
    const s = grownWorld();
    const breaches = s.memory.records.filter((r) => r.type === 'VAULT_DISCOVERY').length;
    expect(breaches).toBe(s.memory.vaultDepth);
    if (s.environment.mycelialMass >= VAULT_BASE) {
      expect(breaches).toBeGreaterThan(0);
    }
  });

  it('citizens emerge from prosperity, never from a spawn control', () => {
    const s = grownWorld();
    expect(s.citizens.population).toBeGreaterThan(0);
    expect(Number.isInteger(s.citizens.population)).toBe(true);
  });

  it('moth-season consistency accelerates mycelial growth', () => {
    const s = grownWorld();
    const calm = applyLearning(s, input(45, { consistency: 1 }));
    const plume = applyLearning(s, input(45, { consistency: 3 }));
    const calmGrowth = calm.environment.mycelialMass - s.environment.mycelialMass;
    const plumeGrowth = plume.environment.mycelialMass - s.environment.mycelialMass;
    expect(plumeGrowth).toBeGreaterThan(calmGrowth);
  });
});

describe('applyLearning — research readiness and blooms', () => {
  it('readiness is monotone and completion-boosted', () => {
    const s = grownWorld();
    const plain = applyLearning(s, input(45));
    const breakthrough = applyLearning(s, input(45, { completion: true }));
    expect(plain.technology.researchReadiness).toBeGreaterThanOrEqual(
      s.technology.researchReadiness,
    );
    expect(breakthrough.technology.researchReadiness).toBeGreaterThan(
      plain.technology.researchReadiness,
    );
    expect(breakthrough.memory.records.some((r) => r.type === 'MILESTONE')).toBe(true);
  });

  it('a bloom crossing surges reserves into permanent readiness', () => {
    let s = grownWorld();
    // Push readiness near the first emergence threshold with hard, novel work.
    const hard = () =>
      input(60, {
        completion: false,
        profile: Object.assign({}, input(60).profile, { difficulty: 1, novelty: 1 }),
      });
    while (s.technology.researchReadiness < 0.18) s = applyLearning(s, hard());
    const energyBefore = applyLearning(s, hard()).environment.energy;

    const bloomed = applyLearning(s, input(60, {
      completion: true,
      profile: Object.assign({}, input(60).profile, { difficulty: 1, novelty: 1 }),
    }));
    expect(bloomed.technology.bloomsCrossed).toBe(1);
    expect(bloomed.environment.energy).toBeLessThan(energyBefore); // the surge spent reserves
    expect(bloomed.technology.researchReadiness).toBeGreaterThanOrEqual(0.2);
  });
});
