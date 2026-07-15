/**
 * M1 purity proofs: initial state validity, constraint enforcement,
 * Trope Guard, and seeded-selection determinism.
 */
import { describe, expect, it } from 'vitest';

import { createInitialState, cloneState, createEnvelope, NOCTIS_SCHEMA_VERSION } from '../state';
import {
  AbyssalConstraintError,
  assertLegacyPreserved,
  validateState,
} from '../constraints';
import { selectIndex, selectUnit } from '../select';
import { ERA_THRESHOLDS, ERA_FLOORS, LAMBDA_ILLUMINATION, DORMANCY_ILLUMINATION_THRESHOLD, ABSENCE_HORIZON_DAYS, DAY_MINUTES } from '../constants';

describe('createInitialState', () => {
  it('produces a valid newborn Stage-1 world', () => {
    const s = createInitialState(42);
    expect(s.succession.stage).toBe(1);
    expect(s.era.designation).toBe('SPORE_HEARTH');
    expect(s.era.history).toEqual(['SPORE_HEARTH']);
    expect(s.citizens.population).toBe(0);
    expect(s.status).toBe('active');
    expect(s.environment.illumination).toBe(0);
    expect(() => validateState(s)).not.toThrow();
  });

  it('commits the seed as an unsigned integer', () => {
    expect(createInitialState(-1).seed).toBe(0xffffffff);
    expect(createInitialState(7).seed).toBe(7);
  });

  it('wraps into a versioned envelope with caller-stamped time', () => {
    const s = createInitialState(1);
    const env = createEnvelope(s, 123456);
    expect(env.schemaVersion).toBe(NOCTIS_SCHEMA_VERSION);
    expect(env.savedAt).toBe(123456);
    expect(env.state).toBe(s);
  });
});

describe('validateState invariants', () => {
  it('rejects out-of-band illumination', () => {
    const s = createInitialState(1);
    const bad = cloneState(s);
    bad.environment.illumination = 1.2;
    expect(() => validateState(bad)).toThrow(AbyssalConstraintError);
  });

  it('rejects negative stocks', () => {
    const s = cloneState(createInitialState(1));
    s.environment.reservoirs.glucans = -0.001;
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });

  it('rejects non-integer population', () => {
    const s = cloneState(createInitialState(1));
    s.citizens.population = 1.5;
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });

  it('rejects non-canonical eras', () => {
    const s = cloneState(createInitialState(1));
    (s.era as { designation: string }).designation = 'DAWN_AGE';
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });

  it('rejects hibernation with nonzero illumination', () => {
    const s = cloneState(createInitialState(1));
    s.status = 'hibernating';
    s.environment.illumination = 0.3;
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });

  it('rejects non-finite quantities', () => {
    const s = cloneState(createInitialState(1));
    s.learning.kTotal = Number.NaN;
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });
});

describe('Trope Guard', () => {
  it('rejects forbidden tokens inside memory notes', () => {
    const s = cloneState(createInitialState(1));
    s.memory.records.push({
      ordinal: 1,
      type: 'MILESTONE',
      era: 'SPORE_HEARTH',
      note: 'the fire of ambition',
    });
    expect(() => validateState(s)).toThrow(AbyssalConstraintError);
  });

  it('matches whole words only, never substrings', () => {
    const s = cloneState(createInitialState(1));
    s.memory.records.push({
      ordinal: 1,
      type: 'MILESTONE',
      era: 'SPORE_HEARTH',
      // "goldenrod" contains "gold"; "sunken" contains "sun" — both lawful words.
      note: 'goldenrod spores settled over the sunken vault',
    });
    expect(() => validateState(s)).not.toThrow();
  });
});

describe('assertLegacyPreserved', () => {
  it('accepts identical snapshots and growth', () => {
    const a = createInitialState(1);
    const b = cloneState(a);
    b.learning.kTotal = 10;
    b.citizens.population = 2;
    expect(() => assertLegacyPreserved(a, b)).not.toThrow();
  });

  it('rejects any legacy decrease', () => {
    const a = cloneState(createInitialState(1));
    a.learning.kTotal = 10;
    const b = cloneState(a);
    b.learning.kTotal = 9.999;
    expect(() => assertLegacyPreserved(a, b)).toThrow(AbyssalConstraintError);
  });

  it('rejects era regression', () => {
    const a = cloneState(createInitialState(1));
    a.era.designation = 'CRYSTAL_INSCRIPTION';
    const b = cloneState(a);
    b.era.designation = 'SPORE_HEARTH';
    expect(() => assertLegacyPreserved(a, b)).toThrow(AbyssalConstraintError);
  });
});

describe('seeded selection', () => {
  it('is deterministic across calls', () => {
    expect(selectUnit(42, 'moth:route:7')).toBe(selectUnit(42, 'moth:route:7'));
    expect(selectIndex(42, 'vault:3', 5)).toBe(selectIndex(42, 'vault:3', 5));
  });

  it('varies with seed and context', () => {
    expect(selectUnit(1, 'a')).not.toBe(selectUnit(2, 'a'));
    expect(selectUnit(1, 'a')).not.toBe(selectUnit(1, 'b'));
  });

  it('stays in range', () => {
    for (let i = 0; i < 50; i++) {
      const u = selectUnit(7, `ctx:${i}`);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThan(1);
      const idx = selectIndex(7, `ctx:${i}`, 4);
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThan(4);
    }
    expect(selectIndex(7, 'empty', 0)).toBe(-1);
  });
});

describe('calibration constraints on constants', () => {
  it('era thresholds and floors are strictly/weakly increasing', () => {
    for (let i = 1; i < ERA_THRESHOLDS.length; i++) {
      expect(ERA_THRESHOLDS[i]).toBeGreaterThan(ERA_THRESHOLDS[i - 1]);
      expect(ERA_FLOORS[i]).toBeGreaterThanOrEqual(ERA_FLOORS[i - 1]);
    }
    expect(ERA_THRESHOLDS.length).toBe(4);
    expect(ERA_FLOORS.length).toBe(4);
  });

  it('nominal illumination decay crosses dormancy at the five-day horizon', () => {
    const minutes = ABSENCE_HORIZON_DAYS * DAY_MINUTES;
    const remaining = 1 * Math.exp(-LAMBDA_ILLUMINATION * minutes);
    expect(remaining).toBeCloseTo(DORMANCY_ILLUMINATION_THRESHOLD, 10);
  });
});
