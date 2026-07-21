import { describe, expect, it } from 'vitest';
import {
  knownPercent,
  scoreComprehensibility,
  type KnowledgeLevel,
  type ScoredToken,
} from '../comprehensibility';

/** Build a token stream from a compact spec. */
function toks(...specs: Array<[lemma: string, content?: boolean, proper?: boolean]>): ScoredToken[] {
  return specs.map(([lemma, content = true, proper = false]) => ({ lemma, content, proper }));
}

/** knownLevel from a plain map, defaulting to 0 (New). */
function levels(map: Record<string, KnowledgeLevel>): (lemma: string) => KnowledgeLevel {
  return (lemma) => map[lemma] ?? 0;
}

describe('scoreComprehensibility — basics', () => {
  it('is empty for no scorable words', () => {
    const s = scoreComprehensibility([], levels({}));
    expect(s.totalWords).toBe(0);
    expect(s.knownRatio).toBe(0);
    expect(knownPercent(s)).toBe(0);
  });

  it('counts occurrences, not just unique words', () => {
    // 猫 known, appears 3×; 犬 unknown, appears 1×.
    const s = scoreComprehensibility(
      toks(['猫'], ['猫'], ['猫'], ['犬']),
      levels({ 猫: 3 }),
    );
    expect(s.totalWords).toBe(4);
    expect(s.knownWords).toBe(3);
    expect(s.knownRatio).toBeCloseTo(0.75, 5);
    expect(knownPercent(s)).toBe(75);
    // Unique coverage is harsher: 1 known of 2 distinct.
    expect(s.uniqueTotal).toBe(2);
    expect(s.uniqueKnown).toBe(1);
    expect(s.uniqueKnownRatio).toBeCloseTo(0.5, 5);
  });

  it('excludes non-content tokens (particles/aux) entirely', () => {
    const s = scoreComprehensibility(
      toks(['猫'], ['が', false], ['寝る']),
      levels({ 猫: 3, 寝る: 2 }),
    );
    expect(s.totalWords).toBe(2); // が not counted
    expect(s.knownWords).toBe(2);
  });
});

describe('scoreComprehensibility — proper-noun filtering (the pitfall)', () => {
  it('drops proper nouns so names do not drag the score down', () => {
    // 田中 (name, unknown) must NOT count against comprehensibility.
    const withName = scoreComprehensibility(
      toks(['猫'], ['田中', true, true], ['寝る']),
      levels({ 猫: 3, 寝る: 3 }),
    );
    expect(withName.totalWords).toBe(2); // name excluded
    expect(withName.knownRatio).toBe(1); // 100%, not 2/3
    expect(withName.properSkipped).toBe(1);
  });
});

describe('scoreComprehensibility — the Familiar+ threshold', () => {
  it('treats Familiar (2) and Known (3) as known by default', () => {
    const s = scoreComprehensibility(
      toks(['a'], ['b'], ['c'], ['d']),
      levels({ a: 0, b: 1, c: 2, d: 3 }),
    );
    expect(s.knownWords).toBe(2); // c, d
    expect(s.byLevel).toEqual({ 0: 1, 1: 1, 2: 1, 3: 1 });
  });

  it('honors a custom threshold', () => {
    const s = scoreComprehensibility(
      toks(['a'], ['b'], ['c'], ['d']),
      levels({ a: 0, b: 1, c: 2, d: 3 }),
      { knownThreshold: 3 },
    );
    expect(s.knownWords).toBe(1); // only d
  });
});

describe('scoreComprehensibility — caching consistency', () => {
  it('scores a repeated lemma the same every occurrence', () => {
    let calls = 0;
    const known = (lemma: string): KnowledgeLevel => {
      calls += 1;
      return lemma === '本' ? 3 : 0;
    };
    const s = scoreComprehensibility(toks(['本'], ['本'], ['本'], ['本'], ['本']), known);
    expect(s.knownWords).toBe(5);
    expect(calls).toBe(1); // 本 resolved once, cached for the rest
    expect(s.uniqueTotal).toBe(1);
  });
});
