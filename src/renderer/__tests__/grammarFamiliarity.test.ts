import { describe, expect, it, vi } from 'vitest';

// `knownWords.ts` registers a `storage` listener at module scope, and this repo
// has no DOM test environment — adding one would mean a root config change,
// which CLAUDE.md forbids. A minimal stub lets the scale-drift guard below
// import the real `WK_LEVELS` rather than duplicating the literal, which is the
// entire value of that test: a copy cannot detect drift from its original.
vi.hoisted(() => {
  const g = globalThis as unknown as { window?: unknown };
  if (!g.window) {
    g.window = { addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => true };
  }
});

import {
  applyFamiliarity,
  applyGrade,
  clearFamiliarity,
  GRADE_DELTA,
  familiarityCounts,
  getFamiliarity,
  isGrammarKnown,
  isManual,
  parseFamiliarity,
  recordAnswer,
  setFamiliarity,
  FAMILIARITY_VERSION,
  GX_KNOWN_THRESHOLD,
  GX_LEVELS,
  type FamiliarityState,
} from '../grammarFamiliarity';
import { WK_LEVELS } from '../knownWords';
import { GRAMMAR } from '../data/grammar';

describe('the scale mirrors the vocabulary scale', () => {
  // The whole point of Phase 3 reusing this scale is that the app holds ONE
  // opinion about what "known" means. If someone edits either list, this fails
  // rather than letting the two drift silently apart.
  it('is identical to WK_LEVELS, in the same order', () => {
    expect([...GX_LEVELS]).toEqual([...WK_LEVELS]);
  });

  it('treats Familiar-or-better as known, like levelService', () => {
    expect(GX_KNOWN_THRESHOLD).toBe(2);
    expect(GX_LEVELS[GX_KNOWN_THRESHOLD]).toBe('Familiar');
    expect(isGrammarKnown({ a: { l: 1, seen: 1, correct: 0, at: 1 } }, 'a')).toBe(false);
    expect(isGrammarKnown({ a: { l: 2, seen: 1, correct: 1, at: 1 } }, 'a')).toBe(true);
    expect(isGrammarKnown({ a: { l: 3, seen: 1, correct: 1, at: 1 } }, 'a')).toBe(true);
  });
});

describe('setFamiliarity', () => {
  it('marks a hand-set level as manual', () => {
    const s = setFamiliarity({}, 'a', 2);
    expect(s.a.l).toBe(2);
    expect(isManual(s, 'a')).toBe(true);
  });

  it('deletes the entry when cleared back to New by hand', () => {
    const s = setFamiliarity(setFamiliarity({}, 'a', 3), 'a', 0);
    expect(s.a).toBeUndefined();
    expect(getFamiliarity(s, 'a')).toBe(0);
  });

  it('does not mutate the state it is given', () => {
    // The shallow-copy trap that bit grammarPresets: a caller holding the old
    // state must still see the old state.
    const before: FamiliarityState = { a: { l: 1, seen: 2, correct: 1, at: 5 } };
    const after = setFamiliarity(before, 'a', 3);
    expect(before.a.l).toBe(1);
    expect(after.a.l).toBe(3);
    expect(after).not.toBe(before);
  });

  it('preserves the answer statistics when a level is set by hand', () => {
    const answered = recordAnswer({}, 'a', true, 100);
    const s = setFamiliarity(answered, 'a', 3);
    expect(s.a.seen).toBe(1);
    expect(s.a.correct).toBe(1);
  });
});

describe('applyGrade — three grades, three outcomes', () => {
  it('good promotes, hard demotes, okay holds', () => {
    // Okay must be its own outcome. Folding it into either neighbour is the
    // whole reason this is not a boolean.
    let s = applyGrade({}, 'a', 'good', 1);
    expect(s.a.l).toBe(1);
    s = applyGrade(s, 'a', 'okay', 2);
    expect(s.a.l).toBe(1);
    s = applyGrade(s, 'a', 'good', 3);
    expect(s.a.l).toBe(2);
    s = applyGrade(s, 'a', 'hard', 4);
    expect(s.a.l).toBe(1);
  });

  it('okay still records an answer, and counts as recalled', () => {
    const s = applyGrade({}, 'a', 'okay', 5);
    expect(s.a.seen).toBe(1);
    // The user produced the answer, so accuracy must not score it a miss.
    expect(s.a.correct).toBe(1);
    expect(s.a.at).toBe(5);
  });

  it('only hard counts as a miss', () => {
    let s = applyGrade({}, 'a', 'hard', 1);
    expect(s.a.correct).toBe(0);
    s = applyGrade(s, 'a', 'good', 2);
    expect(s.a.correct).toBe(1);
  });

  it('matches GRADE_DELTA', () => {
    expect(GRADE_DELTA).toEqual({ hard: -1, okay: 0, good: 1 });
  });

  it('leaves a hand-set level alone whatever the grade', () => {
    const manual = setFamiliarity({}, 'a', 2);
    expect(applyGrade(manual, 'a', 'good', 1).a.l).toBe(2);
    expect(applyGrade(manual, 'a', 'hard', 1).a.l).toBe(2);
  });

  it('holding at New does not create a phantom entry level', () => {
    const s = applyGrade({}, 'a', 'okay', 1);
    expect(s.a.l).toBe(0);
    expect(s.a.seen).toBe(1);
  });
});

describe('recordAnswer', () => {
  it('maps a machine-marked answer onto the outer two grades', () => {
    expect(recordAnswer({}, 'a', true, 1).a.l).toBe(applyGrade({}, 'a', 'good', 1).a.l);
    expect(recordAnswer({}, 'b', false, 1).a).toBeUndefined();
    expect(recordAnswer({}, 'b', false, 1).b.correct).toBe(0);
  });

  it('promotes one band on a correct answer and demotes on a wrong one', () => {
    const up = recordAnswer({}, 'a', true, 1);
    expect(up.a.l).toBe(1);
    const up2 = recordAnswer(up, 'a', true, 2);
    expect(up2.a.l).toBe(2);
    const down = recordAnswer(up2, 'a', false, 3);
    expect(down.a.l).toBe(1);
  });

  it('clamps at both ends of the scale', () => {
    let s = recordAnswer({}, 'a', false, 1);
    expect(s.a.l).toBe(0);
    s = { a: { l: 3, seen: 0, correct: 0, at: 0 } };
    s = recordAnswer(s, 'a', true, 2);
    expect(s.a.l).toBe(3);
  });

  it('accumulates statistics', () => {
    let s = recordAnswer({}, 'a', true, 1);
    s = recordAnswer(s, 'a', false, 2);
    s = recordAnswer(s, 'a', true, 3);
    expect(s.a.seen).toBe(3);
    expect(s.a.correct).toBe(2);
    expect(s.a.at).toBe(3);
  });

  it('never moves a hand-set level, but still records the answer', () => {
    // Mirrors bulkSetFromAnki in knownWords.ts refusing to touch manual words.
    const manual = setFamiliarity({}, 'a', 2);
    const answered = recordAnswer(manual, 'a', false, 10);
    expect(answered.a.l).toBe(2);
    expect(answered.a.m).toBe(1);
    expect(answered.a.seen).toBe(1);
    expect(answered.a.correct).toBe(0);
    expect(answered.a.at).toBe(10);
  });

  it('does not mutate the state it is given', () => {
    const before: FamiliarityState = { a: { l: 1, seen: 1, correct: 1, at: 1 } };
    const after = recordAnswer(before, 'a', true, 2);
    expect(before.a.seen).toBe(1);
    expect(after.a.seen).toBe(2);
  });
});

describe('clearFamiliarity', () => {
  it('removes only the named ids', () => {
    const s = setFamiliarity(setFamiliarity({}, 'a', 2), 'b', 3);
    const cleared = clearFamiliarity(s, ['a']);
    expect(cleared.a).toBeUndefined();
    expect(cleared.b.l).toBe(3);
  });
});

describe('parseFamiliarity', () => {
  it('reads the versioned envelope it writes', () => {
    const state = setFamiliarity({}, 'a', 2);
    const raw = JSON.stringify({ v: FAMILIARITY_VERSION, e: state });
    expect(parseFamiliarity(raw)).toEqual(state);
  });

  it('migrates an unversioned bare map forward instead of discarding it', () => {
    const legacy = JSON.stringify({ a: { l: 2, seen: 4, correct: 3, at: 9 } });
    const parsed = parseFamiliarity(legacy);
    expect(parsed.a.l).toBe(2);
    expect(parsed.a.seen).toBe(4);
  });

  it('rejects junk without throwing', () => {
    expect(parseFamiliarity(null)).toEqual({});
    expect(parseFamiliarity('not json')).toEqual({});
    expect(parseFamiliarity('[1,2,3]')).toEqual({});
    expect(parseFamiliarity(JSON.stringify({ a: 'nope' }))).toEqual({});
    expect(parseFamiliarity(JSON.stringify({ a: { l: 99 } }))).toEqual({});
    expect(parseFamiliarity(JSON.stringify({ a: { l: -1 } }))).toEqual({});
  });

  it('drops a New entry that records nothing, since it is absence', () => {
    expect(parseFamiliarity(JSON.stringify({ a: { l: 0, seen: 0, correct: 0, at: 0 } }))).toEqual(
      {},
    );
    // ...but keeps one that has been answered, or that was set by hand.
    const answered = parseFamiliarity(JSON.stringify({ a: { l: 0, seen: 2, correct: 0, at: 1 } }));
    expect(answered.a.seen).toBe(2);
  });

  it('preserves the manual flag across a round trip', () => {
    const state = setFamiliarity({}, 'a', 3);
    const parsed = parseFamiliarity(JSON.stringify({ v: FAMILIARITY_VERSION, e: state }));
    expect(parsed.a.m).toBe(1);
  });
});

describe('against the shipped corpus', () => {
  it('counts every point exactly once, and a cold profile is all New', () => {
    const counts = familiarityCounts(GRAMMAR, {});
    expect(counts[0]).toBe(GRAMMAR.length);
    expect(counts[1] + counts[2] + counts[3]).toBe(0);
  });

  it('moves exactly one point between bands when one point is answered', () => {
    const id = GRAMMAR[0].id;
    const counts = familiarityCounts(GRAMMAR, recordAnswer({}, id, true, 1));
    expect(counts[1]).toBe(1);
    expect(counts[0]).toBe(GRAMMAR.length - 1);
    expect(counts[0] + counts[1] + counts[2] + counts[3]).toBe(GRAMMAR.length);
  });

  it('does not let a stale entry for a deleted record inflate any band', () => {
    // Learner state is applied OVER a regenerable corpus, so ids that no longer
    // exist are expected and must simply be ignored.
    const stale = setFamiliarity({}, 'no-such-grammar-id', 3);
    const counts = familiarityCounts(GRAMMAR, stale);
    expect(counts[3]).toBe(0);
    expect(counts[0]).toBe(GRAMMAR.length);
  });

  it('applyFamiliarity decorates without adding, dropping or reordering records', () => {
    const state = setFamiliarity({}, GRAMMAR[5].id, 2);
    const applied = applyFamiliarity(GRAMMAR, state);
    expect(applied.length).toBe(GRAMMAR.length);
    expect(applied.map((p) => p.id)).toEqual(GRAMMAR.map((p) => p.id));
    expect(applied[5].familiarity).toBe(2);
    expect(applied[5].familiarityManual).toBe(true);
    expect(applied[0].familiarity).toBe(0);
  });

  it('leaves the generated corpus objects untouched', () => {
    // The rule the whole corpus effort runs on: a verdict, or a level, is data
    // ABOUT a record and never an edit TO it.
    const before = JSON.stringify(GRAMMAR[0]);
    applyFamiliarity(GRAMMAR, setFamiliarity({}, GRAMMAR[0].id, 3));
    expect(JSON.stringify(GRAMMAR[0])).toBe(before);
  });
});
