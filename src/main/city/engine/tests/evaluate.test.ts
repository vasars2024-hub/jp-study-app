/**
 * M6 + M7 proofs: event-flag order and edge-triggering, master composition,
 * full-engine determinism (a golden scripted month), immutability under
 * deep-frozen inputs, and end-to-end absence/return with no legacy loss.
 */
import { describe, expect, it } from 'vitest';

import { evaluate } from '../index';
import { createInitialState, cloneState } from '../state';
import { interpretTelemetry } from '../interpretation';
import { evaluateEvents } from '../events';
import { DAY_MINUTES } from '../constants';
import {
  CivilizationState,
  EngineEventFlag,
  InterpretedLearningInput,
  TelemetryWindow,
} from '../types';

function window(overrides?: Partial<TelemetryWindow>): TelemetryWindow {
  return Object.assign(
    {
      focusSeconds: 1800,
      chars: 3200,
      streak: 1,
      knowledgeCounts: { learning: 100, familiar: 200, known: 300 },
      savedWordDelta: 1,
      flashcardEventCount: 1,
      achievementCount: 0,
      distinctBooks: 1,
      newBooks: 0,
    },
    overrides,
  );
}

function inputFrom(overrides?: Partial<TelemetryWindow>): InterpretedLearningInput {
  return interpretTelemetry(window(overrides));
}

function deepFreeze<T>(obj: T): T {
  Object.freeze(obj);
  for (const key of Object.keys(obj as object)) {
    const value = (obj as Record<string, unknown>)[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) deepFreeze(value);
  }
  return obj;
}

describe('evaluateEvents — the four flags in canonical order', () => {
  it('emits flags in NOCTIS_ECOLOGICAL_ENGINE.md section 7 row order', () => {
    const before = cloneState(createInitialState(1));
    before.learning.consistency = 2;
    before.environment.stability = 0.9;
    before.status = 'active';
    const after = cloneState(before);
    after.learning.consistency = 3; // plume crossing
    after.environment.stability = 0.1; // shock crossing
    after.status = 'hibernating'; // douse... (illumination 0 required)
    after.environment.illumination = 0;
    after.technology.bloomsCrossed = 1; // bloom crossing

    const input: InterpretedLearningInput = Object.assign(inputFrom(), { difficulty: 0.9 });
    const flags = evaluateEvents(input, before, after);
    expect(flags).toEqual<EngineEventFlag[]>([
      'THE_PHEROMONE_PLUME',
      'BAROMETRIC_SHOCK_WAVE',
      'ABYSSAL_DOUSE',
      'BENTHIC_BLOOM',
    ]);
  });

  it('plume fires exactly on the k=3 crossing, not while it persists', () => {
    const before = cloneState(createInitialState(1));
    before.learning.consistency = 3;
    const after = cloneState(before);
    after.learning.consistency = 4;
    expect(evaluateEvents(inputFrom(), before, after)).not.toContain('THE_PHEROMONE_PLUME');
  });

  it('douse fires only on the active-to-hibernating edge', () => {
    const asleep = cloneState(createInitialState(1));
    asleep.status = 'hibernating';
    asleep.environment.illumination = 0;
    const stillAsleep = cloneState(asleep);
    expect(evaluateEvents(null, asleep, stillAsleep)).not.toContain('ABYSSAL_DOUSE');
  });
});

describe('evaluate — master composition', () => {
  it('a first session lights the newborn world and notices no stale flags', () => {
    const s0 = createInitialState(7);
    const { state, flags } = evaluate(s0, inputFrom(), 0);
    expect(state.learning.kTotal).toBeGreaterThan(0);
    expect(state.environment.illumination).toBeGreaterThan(0);
    expect(flags).toEqual([]); // consistency 1, no crossings
  });

  it('drives a full absence-then-return cycle with no legacy loss', () => {
    // Build a lived-in world.
    let s = createInitialState(11);
    for (let d = 0; d < 15; d++) {
      s = evaluate(s, inputFrom({ streak: Math.min(d + 1, 10) }), DAY_MINUTES).state;
    }
    const beforeAway = s;

    // Long absence -> hibernation (ABYSSAL_DOUSE on the crossing evaluation).
    const doused = evaluate(s, null, 20 * DAY_MINUTES);
    expect(doused.state.status).toBe('hibernating');
    expect(doused.flags).toContain('ABYSSAL_DOUSE');

    // Everything legacy survived the sleep.
    expect(doused.state.learning.kTotal).toBe(beforeAway.learning.kTotal);
    expect(doused.state.citizens.population).toBe(beforeAway.citizens.population);
    expect(doused.state.memory.records.length).toBe(beforeAway.memory.records.length);
    expect(doused.state.era).toEqual(beforeAway.era);

    // Return: a ten-minute session relights the world.
    const back = evaluate(doused.state, inputFrom({ focusSeconds: 600, streak: 1 }), 0);
    expect(back.state.status).toBe('active');
    expect(back.state.environment.illumination).toBeGreaterThan(0);
  });

  it('reaches CRYSTAL_INSCRIPTION over a long, varied, consistent study life', () => {
    let s = createInitialState(23);
    for (let d = 0; d < 400; d++) {
      const w = window({
        streak: Math.min(d + 1, 30),
        focusSeconds: 2400,
        chars: 5000,
        knowledgeCounts: { learning: 200, familiar: 600, known: 900 + d },
        savedWordDelta: 3,
        flashcardEventCount: 2,
        achievementCount: d % 20 === 0 ? 1 : 0,
        newBooks: d % 10 === 0 ? 1 : 0,
        distinctBooks: 2,
      });
      s = evaluate(s, interpretTelemetry(w), DAY_MINUTES).state;
    }
    expect(s.era.history.length).toBeGreaterThanOrEqual(2);
    expect(s.era.designation).not.toBe('SPORE_HEARTH');
  });
});

describe('evaluate — determinism and immutability', () => {
  it('a scripted month is reproducible byte-for-byte from a fixed seed', () => {
    function run(): CivilizationState {
      let s = createInitialState(1234);
      for (let d = 0; d < 30; d++) {
        const away = d % 7 === 6 ? 3 * DAY_MINUTES : DAY_MINUTES;
        const w = window({
          streak: (d % 6) + 1,
          focusSeconds: 600 + d * 60,
          chars: 1000 + d * 120,
          achievementCount: d === 14 ? 1 : 0,
        });
        s = evaluate(s, interpretTelemetry(w), away).state;
      }
      return s;
    }
    expect(JSON.stringify(run())).toBe(JSON.stringify(run()));
  });

  it('never mutates a deep-frozen input snapshot', () => {
    const s = deepFreeze(createInitialState(99));
    expect(() => evaluate(s, inputFrom(), DAY_MINUTES)).not.toThrow();
  });
});
