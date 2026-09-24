// @vitest-environment jsdom
/**
 * Statistics ▸ Grammar, and grammar answers reaching the review log.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const logRows = vi.hoisted(() => ({ entries: [] as unknown[] }));

vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));
vi.mock('../i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../i18n')>()),
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.entries(vars).map(([k, v]) => `${k}=${String(v)}`).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../reviewLog', () => ({
  loadReviewLog: async () => logRows.entries,
  onReviewLogChanged: () => () => undefined,
}));
vi.mock('../studyEnvironment', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../studyEnvironment')>()),
  getStudyLang: () => 'ja',
}));

import type { NormalizedGrammarPoint } from '../data/grammar/normalize';
import { setGrammarCorpusForTests } from '../grammarProgress';
import { FAMILIARITY_LS_KEY, FAMILIARITY_VERSION } from '../grammarFamiliarity';
import { GoalProgress, StatsGrammar } from '../components/stats/StatsContent';
import { normalizeReviewLogEntry, summarizeReviewLog } from '../../shared/reviewLog';

function point(id: string, level: string): NormalizedGrammarPoint {
  return { id, level, lang: 'ja', title: id, meaning: '', structure: '', explanation: '', examples: [] } as unknown as NormalizedGrammarPoint;
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  setGrammarCorpusForTests([point('a', 'N5'), point('b', 'N5'), point('c', 'N5'), point('d', 'N4')]);
  const now = Date.now();
  localStorage.setItem(FAMILIARITY_LS_KEY, JSON.stringify({
    v: FAMILIARITY_VERSION,
    e: {
      a: { l: 3, seen: 2, correct: 2, at: now },
      b: { l: 1, seen: 1, correct: 1, at: now - 3 * 86_400_000 },
      d: { l: 2, seen: 1, correct: 1, at: now - 30 * 86_400_000 },
    },
  }));
  logRows.entries = [
    { id: 'g1', at: now, mode: 'grammar', grammarId: 'a', correct: true },
    { id: 'g2', at: now, mode: 'grammar', grammarId: 'b', correct: false },
    { id: 'p1', at: now, mode: 'learn', cardId: 'c1', correct: true },
  ];
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  setGrammarCorpusForTests(null);
});

describe('Statistics grammar section', () => {
  it('shows known and learning per level, and points reviewed today and this week', async () => {
    root = createRoot(host);
    await act(async () => {
      root?.render(<StatsGrammar />);
    });
    const cards = [...host.querySelectorAll('.stats-card')].map((c) => [
      c.querySelector('.stats-card-lbl')?.textContent,
      c.querySelector('.stats-card-val')?.textContent,
    ]);
    expect(cards).toEqual([
      ['stats.grammar.reviewedToday', '1'],
      ['stats.grammar.reviewedWeek', '2'],
      ['stats.grammar.known', '2'],
    ]);
    const levels = [...host.querySelectorAll('.stats-grammar-level')].map((row) => row.getAttribute('aria-label'));
    expect(levels[0]).toBe('N5: stats.grammar.levelCount:known=1,learning=1,total=3');
    expect(levels[1]).toBe('N4: stats.grammar.levelCount:known=1,learning=0,total=1');
    expect(host.textContent).toContain('stats.grammar.answers:count=2,correct=1');
  });
});

describe('progress toward the JLPT goal', () => {
  it('shows grammar coverage at the target level, and asks for a word list instead of claiming 0%', async () => {
    root = createRoot(host);
    await act(async () => {
      root?.render(<GoalProgress target="N5" />);
    });
    const parts = [...host.querySelectorAll('.stats-level-goal > span')].map((el) => el.textContent);
    expect(parts).toEqual([
      'stats.level.goalVocabNoList:level=N5',
      'stats.level.goalGrammar:pct=33%,known=1,total=3',
    ]);
  });
});

describe('grammar rows in the review log', () => {
  it('are kept by normalisation and summarised apart from flashcard practice', () => {
    const row = normalizeReviewLogEntry({ id: 'g', at: 1, mode: 'grammar', grammarId: 'n5-te', correct: true });
    expect(row).toEqual({ id: 'g', at: 1, mode: 'grammar', grammarId: 'n5-te', correct: true });
    const now = Date.now();
    const summary = summarizeReviewLog([
      { id: 'a', at: now, mode: 'grammar', correct: true },
      { id: 'b', at: now, mode: 'grammar', correct: false },
      { id: 'c', at: now, mode: 'test', correct: true },
    ], 30, now);
    expect(summary).toMatchObject({ grammarAnswers: 2, grammarCorrect: 1, practiceAnswers: 1, practiceCorrect: 1, reviews: 0 });
  });
});
