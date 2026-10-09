import { describe, expect, it } from 'vitest';
import {
  agentStudyAnswer,
  cardCandidatesFromText,
  detectAgentStudyIntent,
  grammarTitleForms,
  matchSentenceGrammar,
  partOfSpeechKey,
  planStudyWeek,
  recipeText,
  recommendNextStudy,
  splitStudySentences,
  STUDY_RECIPE_OPERATIONS,
  studyAnswerOf,
  studyRecipeSteps,
  weekPlanSessions,
} from '../agentStudyCoach';
import { createAgentTask, evaluateAgentToolAccess, getAgentToolOperation } from '../localAgent';
import { agentPlanDisabledReason, type AgentComposerState } from '../agentComposerReason';
import { operationsForPlanner } from '../agentCloudStudyDataGate';
import { buildLocalAgentSystemPrompt } from '../localAgentPrompt';

describe('recognising the everyday requests in every UI language', () => {
  it.each([
    ['What should I study now?', 'recommend'],
    ['今、何を勉強すればいい？', 'recommend'],
    ['我现在该学什么？', 'recommend'],
    ['Что мне учить сейчас?', 'recommend'],
    ["Quiz me on today's mined words", 'quiz-mined'],
    ['今日マイニングした単語でクイズして', 'quiz-mined'],
    ['用今天挖掘的单词测验我', 'quiz-mined'],
    ['Проверь меня по словам, добытым сегодня', 'quiz-mined'],
    ['Plan my week', 'plan-week'],
    ['今週の計画を立てて', 'plan-week'],
    ['规划我的这一周', 'plan-week'],
    ['Спланируй мою неделю', 'plan-week'],
  ])('%s → %s', (objective, intent) => {
    expect(detectAgentStudyIntent(objective)).toEqual({ intent });
  });

  it('needs the text for the two text requests, and takes it from a colon, quotes or the next line', () => {
    expect(detectAgentStudyIntent('Make cards from this text: 猫が好きです。')).toEqual({ intent: 'cards-from-text', text: '猫が好きです。' });
    expect(detectAgentStudyIntent('このテキストからカードを作って\n昨日は雨でした。')).toEqual({ intent: 'cards-from-text', text: '昨日は雨でした。' });
    expect(detectAgentStudyIntent("Explain this sentence's grammar 「食べています」")).toEqual({ intent: 'explain-grammar', text: '食べています' });
    expect(detectAgentStudyIntent('Объясни грамматику: Я читаю книгу.')).toEqual({ intent: 'explain-grammar', text: 'Я читаю книгу.' });
    // No text, no recipe: the model planner can ask for it.
    expect(detectAgentStudyIntent('Make cards from this text')).toBeNull();
  });

  it('matches the instruction, never the study text inside it', () => {
    // "week" is in the pasted sentence, not in the request.
    expect(detectAgentStudyIntent('Explain the grammar: I will plan my week tomorrow.')?.intent).toBe('explain-grammar');
    expect(detectAgentStudyIntent('Look up 猫')).toBeNull();
    expect(detectAgentStudyIntent('Explain this')).toBeNull();
    expect(recipeText('a: b')).toBe('b');
  });
});

describe('recipe plans', () => {
  const label = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${JSON.stringify(vars)}` : key);

  it('reads first, and plans a write step only with what it will write', () => {
    const steps = studyRecipeSteps({ intent: 'cards-from-text', text: '猫が好き' }, label, 't1', {
      cards: [{ word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫が好き' }],
    });
    expect(steps.map((s) => s.request.operation)).toEqual(['study.cards-from-text', 'flashcard.add-cards']);
    expect(steps[1].request.arguments).toEqual({ cards: [{ word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '猫が好き' }] });
    expect(steps[1].label).toBe('agent2.step.addCards:{"count":1}');
    // Nothing found: no write step at all.
    expect(studyRecipeSteps({ intent: 'cards-from-text', text: 'x' }, label, 't2').map((s) => s.request.operation))
      .toEqual(['study.cards-from-text']);
    // Every recipe is a valid task over declared operations with its required arguments.
    for (const intent of Object.keys(STUDY_RECIPE_OPERATIONS) as Array<keyof typeof STUDY_RECIPE_OPERATIONS>) {
      const recipe = studyRecipeSteps({ intent, text: 'テキスト' }, label, `t-${intent}`, {
        cards: [{ word: '猫' }],
        sessions: [{ title: 'Study', date: '2026-10-09', startTime: '19:00', endTime: '19:30' }],
      });
      expect(() => createAgentTask(`task-${intent}`, 'objective', recipe)).not.toThrow();
      for (const step of recipe) {
        expect(STUDY_RECIPE_OPERATIONS[intent]).toContain(step.request.operation);
        expect(getAgentToolOperation(step.request.operation)).toBeDefined();
      }
    }
  });

  it('keeps the approval system in front of every write: a batch of calendar sessions needs its own confirmation', () => {
    const access = evaluateAgentToolAccess(
      { callId: 'c', operation: 'calendar.schedule-sessions', arguments: {} },
      'limited-actions',
    );
    expect(access.status).toBe('confirmation-required');
    expect(evaluateAgentToolAccess({ callId: 'c', operation: 'study.recommend-next', arguments: {} }, 'read-only').status)
      .toBe('allowed');
    expect(evaluateAgentToolAccess({ callId: 'c', operation: 'study.quiz-mined-today', arguments: {} }, 'read-only').status)
      .toBe('denied');
  });
});

describe('what to study now', () => {
  it('puts due reviews first, then fresh mined words, the warm-up, and reading', () => {
    const recs = recommendNextStudy({
      dueNow: 30, learning: 5, newAvailable: 20, minedToday: 4, reviewsToday: 0, dailyAverage: 25,
      warmUpDone: false, book: { title: '雪国', minutesToday: 0 }, secondsPerReview: 8,
    });
    expect(recs.map((r) => r.id)).toEqual(['reviews', 'mined', 'warm-up', 'new-cards', 'reading']);
    expect(recs[0].vars).toEqual({ count: 30, minutes: 4 });
    expect(recs[1].action).toMatchObject({ kind: 'arena', material: 'mined-today' });
    expect(recs.at(-1)?.study).toBe('雪国');
  });

  it('suggests practising learning words when nothing is due, and rest when there is nothing at all', () => {
    expect(recommendNextStudy({ dueNow: 0, learning: 3, newAvailable: 0, minedToday: 0, reviewsToday: 40, dailyAverage: 30, warmUpDone: true })
      .map((r) => r.id)).toEqual(['learning']);
    expect(recommendNextStudy({ dueNow: 0, learning: 0, newAvailable: 0, minedToday: 0, reviewsToday: 40, dailyAverage: 30, warmUpDone: true }))
      .toEqual([{ id: 'rest', key: 'agent2.rec.rest', vars: { reviews: 40 } }]);
  });
});

describe('a week of study', () => {
  it('sizes each day to its reviews, keeps one light day, and skips days already planned', () => {
    const plan = planStudyWeek({
      today: '2026-10-08',
      duePerDay: [120, 40, 10, 60, 30, 200, 80],
      dailyAverage: 50,
      busyDays: new Set(['2026-10-11']),
      newPerDay: 10,
    });
    expect(plan.map((d) => d.date)).toEqual(['2026-10-08', '2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14']);
    expect(plan.find((d) => d.date === '2026-10-11')).toMatchObject({ focus: 'skip', minutes: 0 });
    expect(plan.find((d) => d.date === '2026-10-10')?.focus).toBe('light');
    for (const day of plan.filter((d) => d.focus !== 'skip')) {
      expect(day.minutes).toBeGreaterThanOrEqual(10);
      expect(day.minutes).toBeLessThanOrEqual(60);
    }
    expect(plan.find((d) => d.date === '2026-10-13')?.minutes).toBe(30);
    const sessions = weekPlanSessions(plan, '07:30', (day) => `Study ${day.minutes}`);
    expect(sessions).toHaveLength(6);
    expect(sessions[0]).toEqual({ title: 'Study 20', date: '2026-10-08', startTime: '07:30', endTime: '07:50' });
    expect(weekPlanSessions(plan, 'bad', () => 'x')[0].startTime).toBe('19:00');
  });
});

describe('cards from a text', () => {
  it('proposes unknown content words not in the deck, most frequent first, each with its sentence', () => {
    const sentences = splitStudySentences('猫が好き。犬も好き。\n猫は寝る。');
    expect(sentences).toEqual(['猫が好き。', '犬も好き。', '猫は寝る。']);
    const words = (text: string) => [...text].filter((ch) => /\p{Script=Han}/u.test(ch)).map((ch) => ({ surface: ch, lemma: ch, content: true }));
    const found = cardCandidatesFromText(
      sentences.map((sentence) => ({ sentence, words: [...words(sentence), { surface: 'が', lemma: 'が', content: false }] })),
      (lemma) => (lemma === '好' ? 3 : 0),
      (lemma) => lemma === '寝',
    );
    expect(found.candidates.map((c) => [c.word, c.count, c.sentence])).toEqual([
      ['猫', 2, '猫が好き。'],
      ['犬', 1, '犬も好き。'],
    ]);
    expect(found.known).toBe(1);
    expect(found.inDeck).toBe(1);
  });
});

describe('grammar of a sentence', () => {
  const patterns = [
    { id: 'teiru', title: '〜ている', meaning: 'ongoing action', level: 'N5' },
    { id: 'te', title: '〜て', meaning: 'te-form', level: 'N5' },
    { id: 'tari', title: '〜たり〜たりする', meaning: 'do things like', level: 'N4' },
    { id: 'kara', title: 'から／ので', meaning: 'because', level: 'N5' },
  ];

  it('finds a pattern in the dictionary-form spelling as well as the surface', () => {
    // 食べています: the lemmas read 食べる・て・いる・ます, which contain ている.
    const hits = matchSentenceGrammar('パンを食べています', 'パンを食べるているます', patterns);
    expect(hits.map((h) => h.id)).toEqual(['teiru']);
    expect(matchSentenceGrammar('雨だから行かない', '雨だから行くない', patterns).map((h) => h.id)).toEqual(['kara']);
    expect(grammarTitleForms('〜たり〜たりする')).toEqual(['たりたりする']);
    expect(grammarTitleForms('から／ので')).toEqual(['から', 'ので']);
    expect(partOfSpeechKey('助詞')).toBe('agent2.pos.particle');
    expect(partOfSpeechKey('unknown')).toBe('agent2.pos.other');
  });
});

describe('answers and the consent gate', () => {
  it('recognises a persisted study answer and nothing else', () => {
    const answer = agentStudyAnswer('agent2.answer.recommend', [{ key: 'agent2.rec.rest', vars: { reviews: 1 } }], [
      { source: 'deck', key: 'agent2.cite.deckQueue', vars: { due: 0, learning: 0, fresh: 0 } },
    ]);
    expect(studyAnswerOf({ answer })).toBe(answer);
    expect(studyAnswerOf({ answer: { kind: 'other' } })).toBeNull();
    expect(studyAnswerOf('text')).toBeNull();
  });

  it('keeps the coach tools that read study data away from a cloud planner without consent', () => {
    const ops = ['study.recommend-next', 'study.cards-from-text', 'study.quiz-mined-today', 'study.plan-week', 'dictionary.analyze-sentence', 'calendar.schedule-sessions', 'dictionary.explain-grammar'];
    expect(operationsForPlanner(ops, 'cloud', 'unset')).toEqual(['calendar.schedule-sessions', 'dictionary.explain-grammar']);
    expect(operationsForPlanner(ops, 'cloud', 'allow')).toEqual(ops);
    expect(operationsForPlanner(ops, 'local', 'local-only')).toEqual(ops);
  });

  it('tells the model planner which operation answers each everyday request, only when approved', () => {
    const prompt = buildLocalAgentSystemPrompt({ permission: 'limited-actions', availableOperations: ['study.recommend-next'] });
    expect(prompt).toContain('What should I study now / what is next -> study.recommend-next');
    expect(prompt).not.toContain('study.plan-week');
  });
});

describe('composer: a study request plans without a model', () => {
  const base: AgentComposerState = {
    busy: false, planning: false, attachmentReading: false, attachmentCount: 0, draft: 'Plan my week',
    planObjectiveTooLong: false, knownInputOverBudget: false, visionUnsupported: false,
    sensitiveConsentRequired: false, cloudSensitiveConsent: false,
    setup: { aiEnabled: true, targetIsLocal: true, targetReady: false, agentEnabled: true, plannerReady: false, anythingReady: false },
  };

  it('lifts only the "no planner" rule', () => {
    expect(agentPlanDisabledReason(base)).toBe('settings.ai.setup.notReady');
    expect(agentPlanDisabledReason({ ...base, recipeReady: true })).toBeUndefined();
    expect(agentPlanDisabledReason({ ...base, recipeReady: true, setup: { ...base.setup!, aiEnabled: false } }))
      .toBe('agent.execute.reason.aiOff');
    expect(agentPlanDisabledReason({ ...base, recipeReady: true, setup: { ...base.setup!, agentEnabled: false } }))
      .toBe('agent.plan.reason.agentDisabled');
  });
});
