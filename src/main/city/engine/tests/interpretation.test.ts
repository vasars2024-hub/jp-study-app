/**
 * M3 purity proofs: bounded dimensions, determinism, privacy irreversibility,
 * graceful degradation without v1.01 telemetry, measured-difficulty upgrade,
 * and conservative milestone detection.
 */
import { describe, expect, it } from 'vitest';

import { interpretTelemetry } from '../interpretation';
import { AbyssalConstraintError } from '../constraints';
import { TelemetryWindow } from '../types';

function baseWindow(): TelemetryWindow {
  return {
    focusSeconds: 1800, // 30 minutes
    chars: 3200,
    streak: 4,
    knowledgeCounts: { learning: 120, familiar: 300, known: 500 },
    savedWordDelta: 2,
    flashcardEventCount: 1,
    achievementCount: 0,
    distinctBooks: 1,
    newBooks: 0,
  };
}

describe('interpretTelemetry — shape and bounds', () => {
  it('produces the canonical five-field input with a bounded 10-dim profile', () => {
    const i = interpretTelemetry(baseWindow());
    expect(i.focusDuration).toBe(30);
    expect(i.consistency).toBe(4);
    expect(i.completion).toBe(false);
    expect(i.difficultyConfidence).toBe('inferred');
    const dims = Object.values(i.profile);
    expect(dims.length).toBe(10);
    for (const d of dims) {
      expect(d).toBeGreaterThanOrEqual(0);
      expect(d).toBeLessThanOrEqual(1);
    }
    const w = i.pathways;
    expect(w.brine + w.glucans + w.catalysts).toBeCloseTo(1, 10);
    expect(w.glucans).toBeGreaterThan(w.brine); // language study is mycelial
  });

  it('is deterministic: same telemetry, same interpreted input', () => {
    expect(interpretTelemetry(baseWindow())).toEqual(interpretTelemetry(baseWindow()));
  });

  it('rejects malformed telemetry as a developer error', () => {
    const bad = baseWindow();
    bad.chars = -5;
    expect(() => interpretTelemetry(bad)).toThrow(AbyssalConstraintError);
  });
});

describe('interpretTelemetry — privacy irreversibility', () => {
  it('output carries no strings beyond the confidence enum', () => {
    const i = interpretTelemetry(baseWindow());
    const strings: string[] = [];
    JSON.stringify(i, (_key, value) => {
      if (typeof value === 'string') strings.push(value);
      return value;
    });
    expect(strings).toEqual(['inferred']);
  });
});

describe('interpretTelemetry — graceful degradation and v1.01 upgrades', () => {
  it('works with zeroed telemetry (a silent window)', () => {
    const i = interpretTelemetry({
      focusSeconds: 0,
      chars: 0,
      streak: 0,
      knowledgeCounts: { learning: 0, familiar: 0, known: 0 },
      savedWordDelta: 0,
      flashcardEventCount: 0,
      achievementCount: 0,
      distinctBooks: 0,
      newBooks: 0,
    });
    expect(i.focusDuration).toBe(0);
    expect(i.profile.retention).toBe(0);
    expect(i.profile.mastery).toBe(0);
    expect(i.completion).toBe(false);
  });

  it('game results upgrade difficulty to measured', () => {
    const w = baseWindow();
    w.gameResults = [
      { score: 40, accuracy: 0.4, mistakeCount: 9 },
      { score: 55, accuracy: 0.5, mistakeCount: 6 },
    ];
    const i = interpretTelemetry(w);
    expect(i.difficultyConfidence).toBe('measured');
    expect(i.difficulty).toBeCloseTo(1 - 0.45, 10);
  });

  it('writing evaluations shift pathway weight toward the creative register', () => {
    const w = baseWindow();
    w.writingEvaluations = [{ grammar: 70, lexical: 60, flow: 55, semantic: 75 }];
    const withWriting = interpretTelemetry(w);
    const without = interpretTelemetry(baseWindow());
    expect(withWriting.pathways.catalysts).toBeGreaterThan(without.pathways.catalysts);
    expect(withWriting.pathways.glucans).toBeLessThan(without.pathways.glucans);
    expect(
      withWriting.pathways.brine + withWriting.pathways.glucans + withWriting.pathways.catalysts,
    ).toBeCloseTo(1, 10);
  });

  it('level coverage strengthens mastery', () => {
    const w = baseWindow();
    w.levelCoverage = 0.9;
    w.userLevel = 4;
    const upgraded = interpretTelemetry(w);
    const plain = interpretTelemetry(baseWindow());
    expect(upgraded.profile.mastery).toBeGreaterThan(plain.profile.mastery);
  });
});

describe('interpretTelemetry — conservative milestone detection', () => {
  it('an ordinary session is not a milestone', () => {
    expect(interpretTelemetry(baseWindow()).completion).toBe(false);
  });

  it('achievement events, level-ups, and threshold streaks qualify', () => {
    const a = baseWindow();
    a.achievementCount = 1;
    expect(interpretTelemetry(a).completion).toBe(true);

    const b = baseWindow();
    b.levelUp = true;
    expect(interpretTelemetry(b).completion).toBe(true);

    const c = baseWindow();
    c.streak = 30;
    expect(interpretTelemetry(c).completion).toBe(true);

    const d = baseWindow();
    d.streak = 29;
    expect(interpretTelemetry(d).completion).toBe(false);
  });
});
