// @vitest-environment jsdom
/**
 * Grammar familiarity used to be invisible to Statistics and to the level
 * estimate: the estimate read vocabulary coverage only, so knowing every N4
 * word while never having learnt its grammar still read as N4.
 *
 * These pin the new contract: per-level known/learning counts, the weighted
 * blend (and when it does NOT apply), the review windows, the goal progress,
 * and that the real `getLevelEstimate` moves when grammar is known or not.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const lists = vi.hoisted(() => ({
  words: {} as Record<string, string[]>,
  known: new Set<string>(),
}));

vi.mock('../levelLists', () => ({
  getSlotList: (slot: string) => (lists.words[slot] ? { id: slot, label: slot, kind: 'jlpt', slot, words: lists.words[slot] } : undefined),
  listProgress: (list: { words: string[] }) => {
    const learned = list.words.filter((w) => lists.known.has(w)).length;
    return { total: list.words.length, learned, pct: list.words.length ? (learned / list.words.length) * 100 : 0 };
  },
  loadLevelLists: () => Object.entries(lists.words).map(([slot, words]) => ({ id: slot, label: slot, kind: 'jlpt', slot, words })),
  onLevelListsChanged: () => () => undefined,
}));
vi.mock('../knownWords', () => ({ knowledgeCounts: () => ({ 0: 0, 1: 0, 2: 0, 3: 0 }) }));
vi.mock('../studyEnvironment', () => ({ getStudyLang: () => 'ja' }));

import type { NormalizedGrammarPoint } from '../data/grammar/normalize';
import {
  GRAMMAR_LEVEL_WEIGHT,
  blendGrammarCoverage,
  grammarCoverageBySlot,
  grammarLevelProgress,
  grammarReviewedSince,
  reviewWindows,
  setGrammarCorpusForTests,
} from '../grammarProgress';
import {
  FAMILIARITY_LS_KEY,
  FAMILIARITY_VERSION,
  type FamiliarityEntry,
  type FamiliarityState,
} from '../grammarFamiliarity';
import { getLevelEstimate, getTargetProgress } from '../levelService';

function point(id: string, level: string, lang: 'ja' | 'zh' = 'ja'): NormalizedGrammarPoint {
  return { id, level, lang, title: id, meaning: '', structure: '', explanation: '', examples: [] } as unknown as NormalizedGrammarPoint;
}

const entry = (l: 0 | 1 | 2 | 3, at = 0): FamiliarityEntry => ({ l, seen: 1, correct: 1, at });

const CORPUS: NormalizedGrammarPoint[] = [
  ...Array.from({ length: 10 }, (_, i) => point(`n5-${i}`, 'N5')),
  ...Array.from({ length: 10 }, (_, i) => point(`n4-${i}`, 'N4')),
  point('n4-0', 'N4'), // duplicated id — counted once
  point('hsk-a', 'HSK1', 'zh'),
];

function saveState(state: FamiliarityState): void {
  localStorage.setItem(FAMILIARITY_LS_KEY, JSON.stringify({ v: FAMILIARITY_VERSION, e: state }));
}

beforeEach(() => {
  localStorage.clear();
  lists.words = {};
  lists.known = new Set();
  setGrammarCorpusForTests(null);
});

afterEach(() => {
  setGrammarCorpusForTests(null);
});

describe('grammar progress per level', () => {
  it('counts known (Familiar or better) and learning per JLPT level, for the study language only', () => {
    const state: FamiliarityState = {
      'n5-0': entry(3), 'n5-1': entry(2), 'n5-2': entry(1), 'n5-3': { l: 0, seen: 2, correct: 0, at: 5 },
      'n4-0': entry(1), 'hsk-a': entry(3),
    };
    const rows = grammarLevelProgress(CORPUS, state, 'ja');
    expect(rows.map((r) => r.level)).toEqual(['N5', 'N4', 'N3', 'N2', 'N1']);
    expect(rows[0]).toMatchObject({ slot: 'jlpt-n5', total: 10, known: 2, learning: 1, assessed: 4 });
    expect(rows[1]).toMatchObject({ slot: 'jlpt-n4', total: 10, known: 0, learning: 1, assessed: 1 });
    expect(grammarLevelProgress(CORPUS, state, 'zh')[0]).toMatchObject({ level: 'HSK1', total: 1, known: 1 });
  });

  it('counts distinct points reviewed today and in the last seven days', () => {
    const now = new Date(2026, 8, 24, 15).getTime();
    const { today, week } = reviewWindows(now);
    const state: FamiliarityState = {
      'n5-0': entry(2, now - 60_000),
      'n5-1': entry(2, today - 1),
      'n5-2': entry(2, week + 1),
      'n5-3': entry(2, week - 1),
      'hsk-a': entry(2, now),
    };
    expect(grammarReviewedSince(CORPUS, state, today, 'ja')).toBe(1);
    expect(grammarReviewedSince(CORPUS, state, week, 'ja')).toBe(3);
  });
});

describe('the weighted blend', () => {
  it('weights grammar at GRAMMAR_LEVEL_WEIGHT where it has been assessed', () => {
    const grammar = { 'jlpt-n5': { coverage: 0.5, assessedShare: 0.6 } };
    const blended = blendGrammarCoverage({ 'jlpt-n5': 1 }, grammar);
    expect(blended['jlpt-n5']).toBeCloseTo((1 - GRAMMAR_LEVEL_WEIGHT) * 1 + GRAMMAR_LEVEL_WEIGHT * 0.5);
  });

  it('leaves vocabulary alone where grammar is barely assessed, and never proves a level from grammar alone', () => {
    const grammar = {
      'jlpt-n5': { coverage: 0, assessedShare: 0.1 },
      'jlpt-n4': { coverage: 1, assessedShare: 1 },
    };
    expect(blendGrammarCoverage({ 'jlpt-n5': 0.9 }, grammar)).toEqual({ 'jlpt-n5': 0.9 });
  });

  it('derives slot coverage from the counts', () => {
    const rows = grammarLevelProgress(CORPUS, { 'n5-0': entry(2), 'n5-1': entry(1) }, 'ja');
    expect(grammarCoverageBySlot(rows)['jlpt-n5']).toEqual({ coverage: 0.1, assessedShare: 0.2 });
    expect(grammarCoverageBySlot(rows)['jlpt-n3']).toBeUndefined();
  });
});

describe('the level estimate Statistics shows', () => {
  beforeEach(() => {
    lists.words['jlpt-n5'] = ['a', 'b', 'c', 'd', 'e'];
    lists.known = new Set(['a', 'b', 'c', 'd', 'e']);
    setGrammarCorpusForTests(CORPUS);
  });

  it('stays vocabulary-only for a learner who never touched grammar', () => {
    expect(getLevelEstimate('ja').short).toBe('N5');
  });

  it('drops a level whose grammar was worked through and is mostly unknown', () => {
    // Half of N5 grammar assessed, none known: 0.7 * 1 + 0.3 * 0 = 0.7 < 0.8.
    saveState(Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`n5-${i}`, entry(1)])));
    expect(getLevelEstimate('ja').tier).toBe(1);
  });

  it('keeps the level when that grammar is known', () => {
    saveState(Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`n5-${i}`, entry(3)])));
    expect(getLevelEstimate('ja').short).toBe('N5');
  });
});

describe('progress toward the profile goal', () => {
  it('reports vocabulary and grammar coverage at the target level', () => {
    lists.words['jlpt-n4'] = ['x', 'y', 'z', 'w'];
    lists.known = new Set(['x']);
    saveState({ 'n4-0': entry(2), 'n4-1': entry(3), 'n4-2': entry(1) });
    const progress = getTargetProgress('N4', CORPUS);
    expect(progress.vocabulary).toMatchObject({ slot: 'jlpt-n4', learned: 1, total: 4, pct: 25 });
    expect(progress.grammar).toEqual({ known: 2, learning: 1, total: 10, pct: 20 });
  });

  it('says there is no word list rather than claiming 0%, and waits for the corpus', () => {
    const progress = getTargetProgress('N2', null);
    expect(progress.vocabulary.total).toBe(0);
    expect(progress.grammar).toBeNull();
  });
});
