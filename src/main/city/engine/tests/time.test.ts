/**
 * M2 purity proofs: cushion ordering, composability, the five-day horizon,
 * the hibernation fixed point, reawakening, and legacy protection under D.
 */
import { describe, expect, it } from 'vitest';

import { applyElapsedTime, wakeIfEligible } from '../time';
import { createInitialState, cloneState } from '../state';
import { assertLegacyPreserved } from '../constraints';
import {
  ABSENCE_HORIZON_DAYS,
  DAY_MINUTES,
  DORMANCY_ILLUMINATION_THRESHOLD,
  REAWAKENING_MINUTES,
} from '../constants';
import { CivilizationState, InterpretedLearningInput, InterpretedProfile } from '../types';

function litWorld(): CivilizationState {
  const s = cloneState(createInitialState(9));
  s.environment.illumination = 1;
  s.environment.circulation = 0.8;
  s.environment.stability = 0.6;
  s.environment.reservoirs.glucans = 5;
  s.citizens.population = 4;
  s.citizens.activity = 0.9;
  s.learning.kTotal = 500;
  s.learning.momentum = 0.7;
  s.environment.mycelialMass = 80;
  s.memory.records.push({ ordinal: 1, type: 'FIRST_LIGHT', era: 'SPORE_HEARTH', note: 'first glow' });
  s.memory.nextOrdinal = 2;
  return s;
}

function neutralProfile(): InterpretedProfile {
  return {
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
  };
}

function sessionInput(minutes: number): InterpretedLearningInput {
  return {
    focusDuration: minutes,
    profile: neutralProfile(),
    pathways: { brine: 0.05, glucans: 0.8, catalysts: 0.15 },
    difficulty: 0.2,
    difficultyConfidence: 'inferred',
    consistency: 1,
    completion: false,
  };
}

describe('applyElapsedTime — cushion before decay', () => {
  it('a charged cushion fully absorbs decay', () => {
    const s = litWorld();
    s.environment.energy = 2 * DAY_MINUTES; // two days banked
    const after = applyElapsedTime(s, DAY_MINUTES); // one day away
    expect(after.environment.illumination).toBe(1); // untouched
    expect(after.environment.energy).toBe(DAY_MINUTES); // discharged linearly
  });

  it('decay begins only after the cushion empties', () => {
    const s = litWorld();
    s.environment.energy = DAY_MINUTES; // one day shield
    const after = applyElapsedTime(s, 2 * DAY_MINUTES); // two days away
    const unshielded = applyElapsedTime(litWorld(), DAY_MINUTES); // one raw day
    expect(after.environment.energy).toBe(0);
    expect(after.environment.illumination).toBeCloseTo(
      unshielded.environment.illumination,
      12,
    );
  });
});

describe('applyElapsedTime — composability (Law 2 corollary)', () => {
  it('one evaluation equals any partition of the same interval', () => {
    const s = litWorld();
    s.environment.energy = 300;
    const whole = applyElapsedTime(s, 5000);
    const split = applyElapsedTime(applyElapsedTime(applyElapsedTime(s, 1200), 2300), 1500);
    expect(split.environment.illumination).toBeCloseTo(whole.environment.illumination, 10);
    expect(split.environment.circulation).toBeCloseTo(whole.environment.circulation, 10);
    expect(split.environment.stability).toBeCloseTo(whole.environment.stability, 10);
    expect(split.environment.energy).toBeCloseTo(whole.environment.energy, 10);
    expect(split.citizens.activity).toBeCloseTo(whole.citizens.activity, 10);
    expect(split.status).toBe(whole.status);
  });
});

describe('applyElapsedTime — the five-day horizon and dormancy', () => {
  it('an unshielded world crosses into hibernation at ~5 days', () => {
    const s = litWorld();
    const justBefore = applyElapsedTime(s, ABSENCE_HORIZON_DAYS * DAY_MINUTES * 0.98);
    // Crystal damping is ~0 at this mass scale... mycelialMass 80 does not damp; crystalMass 0.
    expect(justBefore.status).toBe('active');
    const after = applyElapsedTime(s, ABSENCE_HORIZON_DAYS * DAY_MINUTES + 1);
    expect(after.status).toBe('hibernating');
    expect(after.environment.illumination).toBe(0);
    expect(after.environment.circulation).toBe(0);
    expect(after.citizens.activity).toBe(0);
  });

  it('deep crystal reserves lengthen the horizon (earned, lawful, intended)', () => {
    const s = litWorld();
    s.environment.crystalMass = 400; // heavy lattice damping
    const after = applyElapsedTime(s, ABSENCE_HORIZON_DAYS * DAY_MINUTES + 1);
    expect(after.status).toBe('active'); // still aglow past the nominal horizon
  });

  it('stability recovers toward calm during absence, never collapses', () => {
    const s = litWorld();
    s.environment.stability = 0.2; // recently shocked
    const after = applyElapsedTime(s, 3 * DAY_MINUTES);
    expect(after.environment.stability).toBeGreaterThan(0.2);
    expect(after.environment.stability).toBeLessThanOrEqual(1);
  });
});

describe('applyElapsedTime — hibernation is a fixed point', () => {
  it('five days and five hundred days produce the same sleeping city', () => {
    const s = litWorld();
    const asleep = applyElapsedTime(s, 10 * DAY_MINUTES);
    expect(asleep.status).toBe('hibernating');
    const longSleep = applyElapsedTime(asleep, 500 * DAY_MINUTES);
    expect(longSleep).toEqual(asleep);
  });
});

describe('applyElapsedTime — legacy protection (Law 5)', () => {
  it('no legacy value changes for any elapsed time', () => {
    const s = litWorld();
    for (const dt of [1, 600, DAY_MINUTES, 30 * DAY_MINUTES, 1000 * DAY_MINUTES]) {
      const after = applyElapsedTime(s, dt);
      assertLegacyPreserved(s, after);
      expect(after.learning.kTotal).toBe(s.learning.kTotal);
      expect(after.citizens.population).toBe(s.citizens.population);
      expect(after.environment.mycelialMass).toBe(s.environment.mycelialMass);
      expect(after.memory.records).toEqual(s.memory.records);
      expect(after.era).toEqual(s.era);
      expect(after.succession).toEqual(s.succession);
    }
  });

  it('never mutates its input snapshot', () => {
    const s = litWorld();
    const frozen = JSON.stringify(s);
    applyElapsedTime(s, 12345);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});

describe('wakeIfEligible — the ten-minute reawakening', () => {
  function sleeping(): CivilizationState {
    return applyElapsedTime(litWorld(), 10 * DAY_MINUTES);
  }

  it('a canonical session wakes the world and relights the first glow', () => {
    const woke = wakeIfEligible(sleeping(), sessionInput(REAWAKENING_MINUTES));
    expect(woke.status).toBe('active');
    expect(woke.environment.illumination).toBe(DORMANCY_ILLUMINATION_THRESHOLD);
  });

  it('a shorter session does not flicker the city awake', () => {
    const still = wakeIfEligible(sleeping(), sessionInput(REAWAKENING_MINUTES - 1));
    expect(still.status).toBe('hibernating');
    expect(still.environment.illumination).toBe(0);
  });

  it('is a no-op on an active world', () => {
    const s = litWorld();
    expect(wakeIfEligible(s, sessionInput(60))).toBe(s);
  });
});
