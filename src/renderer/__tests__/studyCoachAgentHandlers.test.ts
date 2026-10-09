// @vitest-environment jsdom
/**
 * The study coach's tools against the real stores: each answers from the learner's data
 * and says where every figure came from; the two that write go through their owners
 * (`addEvent`, the Arena's own hand-off) and are safe to run twice.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  t: (key: string) => key,
  getUiLang: () => 'en',
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { createStudyCoachAgentHandlers, findCardCandidates } from '../studyCoachAgentHandlers';
import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests, reviewDeckCard } from '../flashcardDeck';
import { resetReviewLogForTests } from '../reviewLog';
import { loadEvents } from '../calendar';
import { setLevel } from '../knownWords';
import { STUDY_LANG_KEY } from '../studyEnvironment';
import { PENDING_HANDOFF_KEYS } from '../pendingHandoff';
import { studyAnswerOf } from '../../shared/agentStudyCoach';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);
const DAY = 86_400_000;

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  resetDeckMemoryForTests();
  resetReviewLogForTests();
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async (word: string) => ({
      query: word,
      entries: word === 'книга' ? [{ word, reading: 'кни́га', isCommon: true, jlpt: [], senses: [{ partsOfSpeech: [], definitions: ['book'], tags: [] }] }] : [],
    })),
  };
});

describe('what to study now', () => {
  it('ranks due reviews first and cites the deck, the review log and Statistics', async () => {
    const [due] = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }]);
    reviewDeckCard(due.id, 'good', Date.now() - 30 * DAY);
    const result = await createStudyCoachAgentHandlers(t)['study.recommend-next']!({});
    const answer = studyAnswerOf(result)!;
    expect(answer.titleKey).toBe('agent2.answer.recommend');
    expect(answer.lines[0]).toMatchObject({ key: 'agent2.rec.reviews', vars: { count: 1 } });
    expect(answer.citations.map((c) => c.source)).toEqual(expect.arrayContaining(['deck', 'review-log', 'stats']));
    expect(answer.actions?.[0]).toMatchObject({ kind: 'open-section', section: 'flashcards' });
  });
});

describe("today's mined words", () => {
  it('opens the Arena on them through its own hand-off, and says so when there are none', async () => {
    const handlers = createStudyCoachAgentHandlers(t);
    const none = studyAnswerOf(await handlers['study.quiz-mined-today']!({}))!;
    expect(none.lines[0].key).toBe('agent2.quiz.none');
    expect(sessionStorage.getItem(PENDING_HANDOFF_KEYS.gameArenaSelect)).toBeNull();

    addDeckCardsTracked([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'subtitle' },
      { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'subtitle' },
    ]);
    const result = await handlers['study.quiz-mined-today']!({}) as { gameId: string; words: string[] };
    expect(result.words.sort()).toEqual(['犬', '猫']);
    expect(JSON.parse(sessionStorage.getItem(PENDING_HANDOFF_KEYS.gameArenaSelect)!)).toMatchObject({
      gameId: 'reverse-recall', autostart: true, material: 'mined-today', rounds: 3,
    });
    expect(studyAnswerOf(result)!.citations[0]).toMatchObject({ source: 'mined', vars: { count: 2 } });
  });
});

describe('a week of study', () => {
  it('plans seven days and schedules them once, however often the step is run', async () => {
    const handlers = createStudyCoachAgentHandlers(t);
    const plan = await handlers['study.plan-week']!({ startTime: '07:30' }) as { days: unknown[]; sessions: Array<{ startTime: string }> };
    expect(plan.days).toHaveLength(7);
    expect(plan.sessions.length).toBeGreaterThan(0);
    expect(plan.sessions.every((s) => s.startTime === '07:30')).toBe(true);
    expect(studyAnswerOf(plan)!.citations.map((c) => c.source)).toEqual(['deck', 'review-log', 'calendar']);

    const first = await handlers['calendar.schedule-sessions']!({ sessions: plan.sessions }) as { createdIds: string[] };
    expect(first.createdIds).toHaveLength(plan.sessions.length);
    const again = await handlers['calendar.schedule-sessions']!({ sessions: plan.sessions }) as { createdIds: string[] };
    expect(again.createdIds).toHaveLength(0);
    expect(loadEvents()).toHaveLength(plan.sessions.length);
    expect(loadEvents().every((e) => e.category === 'study')).toBe(true);
    // A re-plan now skips the days that have a session.
    const replanned = await handlers['study.plan-week']!({}) as { days: Array<{ focus: string }> };
    expect(replanned.days.filter((d) => d.focus === 'skip').length).toBe(plan.sessions.length);
    await expect(Promise.resolve().then(() => handlers['calendar.schedule-sessions']!({ sessions: [] }))).rejects.toThrow();
  });
});

describe('cards from a text', () => {
  it('proposes unknown words that are not in the deck, with dictionary meanings', async () => {
    localStorage.setItem(STUDY_LANG_KEY, 'ru');
    addDeckCardsTracked([{ word: 'стол', reading: '', meaning: 'table', source: 'import', studyLang: 'ru' }]);
    setLevel('я', 3);
    const found = await findCardCandidates('Я читаю книга. Стол и книга.');
    expect(found.cards.map((c) => c.word)).toEqual(['книга', 'читаю', 'и']);
    expect(found.cards[0]).toMatchObject({ meaning: 'book', reading: 'кни́га', sentence: 'Я читаю книга.' });
    expect(found.known).toBe(1);
    expect(found.inDeck).toBe(1);
    const result = await createStudyCoachAgentHandlers(t)['study.cards-from-text']!({ text: 'Я читаю книга.' });
    const answer = studyAnswerOf(result)!;
    expect(answer.lines.map((l) => l.study)).toContain('книга');
    expect(answer.citations.map((c) => c.source)).toEqual(['known-words', 'deck', 'dictionary']);
  });
});

describe('grammar', () => {
  it('explains a pattern from the grammar library, with its form and an example', async () => {
    const result = await createStudyCoachAgentHandlers(t)['dictionary.explain-grammar']!({ term: '〜ている' });
    const answer = studyAnswerOf(result)!;
    expect(answer.lines[0]).toMatchObject({ key: 'agent2.grammar.hit', study: '〜ている' });
    expect(answer.citations[0]).toMatchObject({ source: 'grammar' });
    expect(answer.actions?.[0]).toMatchObject({ section: 'grammar' });
  });

  it('analyzes a sentence word by word and cites the known words it counted', async () => {
    localStorage.setItem(STUDY_LANG_KEY, 'ru');
    setLevel('я', 3);
    const result = await createStudyCoachAgentHandlers(t)['dictionary.analyze-sentence']!({ term: 'Я читаю книгу.' }) as {
      tokens: Array<{ surface: string; known: number }>;
    };
    expect(result.tokens.map((token) => token.surface)).toEqual(['Я', 'читаю', 'книгу']);
    const answer = studyAnswerOf(result)!;
    expect(answer.citations).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'known-words', vars: { count: 2 } }),
    ]));
    await expect(Promise.resolve().then(() => createStudyCoachAgentHandlers(t)['dictionary.analyze-sentence']!({}))).rejects.toThrow();
  });
});

it('reads the deck it was given and nothing else', () => {
  expect(loadDeck()).toEqual([]);
});
