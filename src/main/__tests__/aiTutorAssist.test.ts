// @vitest-environment node
/**
 * The grammar, statistics, planning, onboarding and Blanc AI helpers in main,
 * against FAKE providers only — nothing leaves the process. Every family is run
 * through the shared runner's gates (AI off, no key, cloud consent denied, the
 * offline model missing), the study-data gate for the statistics and goal
 * helpers, invalid output (never cached), cancel, and the offline engine.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => shared.userData },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../mining', () => ({
  getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
  getConfiguredAiEngine: () => 'cloud',
}));
vi.mock('../aiProviderClient', () => ({ callAiProvider: vi.fn() }));
vi.mock('../aiFeatureGate', () => ({
  aiFeaturesEnabled: () => true,
  aiCloudAllowedFor: () => false,
  AI_FEATURES_OFF_MESSAGE: 'off',
  AI_CLOUD_FEATURE_OFF_MESSAGE: 'cloud off',
}));
vi.mock('../providerRuntime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../providerRuntime')>(),
  getAiProviderHealth: () => ({ providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash', credentialBucket: 'gemini', configured: false }),
}));

import { cancelAiStudyRequest, resetAiStudyCacheForTests, type AiStudyDeps } from '../aiStudyAssist';
import {
  answerSettingsWithModel,
  checkGrammarSightings,
  explainBlancMistake,
  explainGrammarPoint,
  explainStudyStats,
  generateGrammarExamples,
  gradeGrammarProduction,
  makePlacementQuiz,
  parseCalendarEventText,
  suggestDailyGoal,
  summarizeForBlanc,
} from '../aiTutorAssist';
import { AiProviderRuntimeError } from '../providerRuntime';

type Call = NonNullable<AiStudyDeps['call']>;
type Fake = ReturnType<typeof vi.fn>;

function cloudDeps(call: Fake, extra: AiStudyDeps = {}): AiStudyDeps {
  return {
    enabled: () => true,
    engine: () => 'cloud',
    provider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
    configured: () => true,
    cloudAllowed: () => true,
    modelOf: () => 'gemini-2.5-flash',
    call: call as unknown as Call,
    ...extra,
  };
}

const point = {
  id: 'n4-you-ni-suru',
  title: '〜ようにする',
  meaning: 'to make an effort to',
  structure: '〜ようにする',
  explanation: 'to make an effort to',
  level: 'N4',
  lang: 'ja',
};

const explainReply = JSON.stringify({
  summary: 'Making a habit of doing something.',
  formation: 'Dictionary or ない form + ようにする.',
  usage: 'Everyday resolutions.',
  nuance: '',
  examples: [
    { text: '毎日早く寝るようにしています。', translation: 'I try to go to bed early every day.' },
    { text: 'I try.', translation: 'not Japanese, dropped' },
  ],
});

const digest = {
  rangeDays: 30, reviews: 600, activeDays: 20, reviewsPerActiveDay: 30, newPerDay: 5,
  retentionPct: 78, matureRetentionPct: 80, weeklyRetentionPct: [85, 84, 70],
  dayparts: [{ part: 'morning', reviews: 300, passPct: 90 }, { part: 'evening', reviews: 300, passPct: 70 }],
  avgAnswerSeconds: 9, leeches: 6, dueNext7: [40, 20, 20, 20, 20, 20, 20],
};
const statsReply = JSON.stringify({
  summary: 'Retention is a little low.',
  suggestions: [
    { text: 'Add fewer new cards (retention 78%).', basis: 'retention' },
    { text: 'Review in the morning (90%).', basis: 'time-of-day' },
    { text: 'Fix the 6 leeches.', basis: 'leeches' },
    { text: 'Not a real chart.', basis: 'astrology' },
  ],
});

const history = { reviewsAvg: 30, newAvg: 5, minutesAvg: 20, activeDays: 10, retentionPct: 85, dueNext7Avg: 25 };
const current = { reviews: 50, newCards: 10, minutes: 30 };

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-tutor-'));
  resetAiStudyCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('gates (shared runner)', () => {
  it('AI off: nothing runs', async () => {
    const call = vi.fn();
    expect(await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call, { enabled: () => false })))
      .toMatchObject({ ok: false, aiOff: true, code: 'ai-off' });
    expect(call).not.toHaveBeenCalled();
  });

  it('every helper has its own cloud opt-in, and its default is OFF', async () => {
    const call = vi.fn();
    const deps = cloudDeps(call);
    delete deps.cloudAllowed; // the shared gate, mocked to the documented default (false)
    const runs = [
      explainGrammarPoint({ point, answerLang: 'en' }, deps),
      generateGrammarExamples({ point, answerLang: 'en' }, deps),
      gradeGrammarProduction({ point, sentence: '早く寝るようにする。', answerLang: 'en' }, deps),
      checkGrammarSightings({ point, sentences: [{ id: 's0', text: '寝るようにする' }], answerLang: 'en' }, deps),
      explainStudyStats({ digest, shareStudyData: 'allow', answerLang: 'en' }, deps),
      suggestDailyGoal({ history, current, shareStudyData: 'allow', answerLang: 'en' }, deps),
      parseCalendarEventText({ text: 'kanji tue 7pm', today: '2026-10-11', answerLang: 'en' }, deps),
      makePlacementQuiz({ studyLang: 'ja', answerLang: 'en' }, deps),
      answerSettingsWithModel({ question: 'x', candidates: [{ id: 'ui-language', title: 'Language' }], answerLang: 'en' }, deps),
      explainBlancMistake({ word: '書く', expected: '書いて', typed: '書きて', answerLang: 'en' }, deps),
      summarizeForBlanc({ kind: 'kanji', subject: '水', answerLang: 'en' }, deps),
    ];
    for (const out of await Promise.all(runs)) expect(out).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(call).not.toHaveBeenCalled();
  });

  it('consent is per feature id', async () => {
    const allowed = vi.fn((feature: string) => feature === 'grammarExplain');
    const call = vi.fn(async () => explainReply);
    expect((await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call, { cloudAllowed: allowed }))).ok).toBe(true);
    expect((await generateGrammarExamples({ point, answerLang: 'en' }, cloudDeps(call, { cloudAllowed: allowed }))).code).toBe('consent');
    expect(allowed).toHaveBeenCalledWith('grammarExamples');
  });

  it('no key: the setup prompt, not a call', async () => {
    const call = vi.fn();
    expect(await summarizeForBlanc({ kind: 'kanji', subject: '水', answerLang: 'en' }, cloudDeps(call, { configured: () => false })))
      .toMatchObject({ ok: false, needsKey: true, code: 'no-key' });
    expect(call).not.toHaveBeenCalled();
  });

  it('offline engine: no opt-in needed, never the cloud; missing model is no-local-model', async () => {
    const call = vi.fn();
    const runLocal = vi.fn(async () => explainReply);
    const local = cloudDeps(call, { engine: () => 'local-qwen', cloudAllowed: () => false, localAvailable: () => true, runLocal });
    expect(await explainGrammarPoint({ point, answerLang: 'en' }, local)).toMatchObject({ ok: true, engine: 'local' });
    expect(call).not.toHaveBeenCalled();
    expect(await explainGrammarPoint({ point, answerLang: 'en' }, { ...local, localAvailable: () => false }))
      .toMatchObject({ ok: false, needsLocalModel: true });
  });
});

describe('the study-data gate (statistics and goal)', () => {
  it('a cloud request carrying study statistics needs the Agent permission', async () => {
    const call = vi.fn(async () => statsReply);
    for (const share of ['unset', 'local-only', '']) {
      const out = await explainStudyStats({ digest, shareStudyData: share, answerLang: 'en' }, cloudDeps(call));
      expect(out).toMatchObject({ ok: false, code: 'consent', studyDataWithheld: true });
      const goal = await suggestDailyGoal({ history, current, shareStudyData: share, answerLang: 'en' }, cloudDeps(call));
      expect(goal).toMatchObject({ ok: false, studyDataWithheld: true });
    }
    expect(call).not.toHaveBeenCalled();
    expect((await explainStudyStats({ digest, shareStudyData: 'allow', answerLang: 'en' }, cloudDeps(call))).ok).toBe(true);
  });

  it('the offline engine is not gated by it', async () => {
    const runLocal = vi.fn(async () => statsReply);
    const out = await explainStudyStats({ digest, shareStudyData: 'unset', answerLang: 'en' }, cloudDeps(vi.fn(), {
      engine: () => 'local-qwen', localAvailable: () => true, runLocal,
    }));
    expect(out.ok).toBe(true);
  });

  it('only the numbers are sent', async () => {
    const call = vi.fn(async () => statsReply);
    await explainStudyStats({ digest: { ...digest, words: ['秘密'] }, shareStudyData: 'allow', answerLang: 'en' }, cloudDeps(call));
    expect(String((call.mock.calls[0] as unknown[])[2])).not.toContain('秘密');
  });
});

describe('validation and the cache', () => {
  it('grammar explanation: examples not in the study language are dropped; the answer is cached', async () => {
    const call = vi.fn(async () => explainReply);
    const first = await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call));
    expect(first.result?.examples.map((e) => e.text)).toEqual(['毎日早く寝るようにしています。']);
    expect((await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call))).cached).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('bad JSON and missing fields are invalid and never cached', async () => {
    const call = vi.fn(async () => 'Sure! {oops');
    expect(await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ summary: 'x' }));
    expect((await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(explainReply);
    expect((await explainGrammarPoint({ point, answerLang: 'en' }, cloudDeps(call))).cached).toBe(false);
  });

  it('generated examples must show the pattern', async () => {
    const call = vi.fn(async () => JSON.stringify({ sentences: [{ text: '今日は暑い。', reading: '', translation: 'Hot.' }] }));
    expect((await generateGrammarExamples({ point, answerLang: 'en' }, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(JSON.stringify({ sentences: [
      { text: '野菜を食べるようにしている。', reading: 'やさいをたべるようにしている。', translation: 'I try to eat vegetables.' },
      { text: '今日は暑い。', reading: '', translation: 'Hot.' },
    ] }));
    const ok = await generateGrammarExamples({ point, answerLang: 'en' }, cloudDeps(call));
    expect(ok.result?.sentences).toHaveLength(1);
  });

  it('production: the suggested rating follows the verdict, not the model', async () => {
    const call = vi.fn(async () => JSON.stringify({
      usesPattern: false, correct: true, natural: true, explanation: 'No pattern.', corrected: '', suggestedRating: 'good',
    }));
    const out = await gradeGrammarProduction({ point, sentence: '早く寝ます。', answerLang: 'en' }, cloudDeps(call));
    expect(out.result).toMatchObject({ usesPattern: false, correct: false, suggestedRating: 'hard' });
    expect((await gradeGrammarProduction({ point, sentence: 'hello', answerLang: 'en' }, cloudDeps(call))).code).toBe('empty-input');
  });

  it('sightings: every sentence needs its verdict, or the answer is unusable', async () => {
    const req = { point, sentences: [{ id: 's0', text: '寝るようにする' }, { id: 's1', text: 'ように見える' }], answerLang: 'en' };
    const call = vi.fn(async () => JSON.stringify({ verdicts: [{ id: 's0', uses: true, note: '' }] }));
    expect((await checkGrammarSightings(req, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(JSON.stringify({ verdicts: [{ id: 's1', uses: false, note: 'ように見える' }, { id: 's0', uses: true, note: '' }] }));
    const ok = await checkGrammarSightings(req, cloudDeps(call));
    expect(ok.result?.verdicts.map((v) => [v.id, v.uses])).toEqual([['s0', true], ['s1', false]]);
  });

  it('stats: suggestions with an unknown chart are dropped; fewer than three is invalid', async () => {
    const call = vi.fn(async () => statsReply);
    const ok = await explainStudyStats({ digest, shareStudyData: 'allow', answerLang: 'en' }, cloudDeps(call));
    expect(ok.result?.suggestions).toHaveLength(3);
    call.mockResolvedValue(JSON.stringify({ summary: 's', suggestions: [{ text: 'a', basis: 'retention' }] }));
    expect((await explainStudyStats({ digest, shareStudyData: 'allow', answerLang: 'ja' }, cloudDeps(call))).code).toBe('invalid');
  });

  it('goal: an absurd proposal is clamped onto the grid, not passed on', async () => {
    const call = vi.fn(async () => JSON.stringify({ reviews: 9999, newCards: 7, minutes: 33, reason: 'Because.' }));
    const out = await suggestDailyGoal({ history, current, shareStudyData: 'allow', answerLang: 'en' }, cloudDeps(call));
    expect(out.result?.targets.reviews).toBeLessThanOrEqual(90);
    expect((out.result?.targets.newCards ?? -1) % 5).toBe(0);
    expect((out.result?.targets.minutes ?? -1) % 5).toBe(0);
  });

  it('event: impossible dates and times are refused', async () => {
    const req = { text: 'kanji every tue 7pm', today: '2026-10-11', todayWeekday: 0, answerLang: 'en' };
    const call = vi.fn(async () => JSON.stringify({ title: 'Kanji', date: '2020-01-01', startTime: '19:00', endTime: '20:00', recurrence: 'weekly', weekdays: [2] }));
    expect((await parseCalendarEventText(req, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(JSON.stringify({ title: 'Kanji', date: '2026-10-13', startTime: '25:00', endTime: '', recurrence: 'weekly', weekdays: [2, 9] }));
    const out = await parseCalendarEventText({ ...req, refresh: true }, cloudDeps(call));
    expect(out.result).toMatchObject({ date: '2026-10-13', startTime: null, recurrence: 'weekly', weekdays: [2] });
  });

  it('placement: items without the study language or a valid key are dropped; too few is invalid', async () => {
    const item = (level: string, word: string, answer = 0) => ({
      level, word, prompt: `「${word}」の意味は？`, choices: ['a', 'b', 'c', 'd'], answer,
    });
    const good = [item('N5', '水'), item('N5', '山'), item('N4', '急ぐ'), item('N4', '集める'), item('N3', '比べる'), item('N2', '承る', 2)];
    const call = vi.fn(async () => JSON.stringify({ items: [...good.slice(0, 5), item('N9', '謎'), { ...item('N1', 'x'), word: 'x' }] }));
    expect((await makePlacementQuiz({ studyLang: 'ja', answerLang: 'en' }, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(JSON.stringify({ items: good }));
    const ok = await makePlacementQuiz({ studyLang: 'ja', answerLang: 'en', refresh: true }, cloudDeps(call));
    expect(ok.result?.items).toHaveLength(6);
  });

  it('settings help: only ids that were offered survive; an answer naming none of them is invalid', async () => {
    const req = { question: 'make text bigger', candidates: [{ id: 'ui-scale', title: 'Scale' }, { id: 'ui-language', title: 'Language' }], answerLang: 'en' };
    const call = vi.fn(async () => JSON.stringify({ matches: [{ id: 'made-up', reason: '' }] }));
    expect((await answerSettingsWithModel(req, cloudDeps(call))).code).toBe('invalid');
    call.mockResolvedValue(JSON.stringify({ matches: [{ id: 'made-up', reason: '' }, { id: 'ui-scale', reason: 'Zoom.' }] }));
    expect((await answerSettingsWithModel(req, cloudDeps(call))).result?.matches).toEqual([{ id: 'ui-scale', reason: 'Zoom.' }]);
    call.mockResolvedValue(JSON.stringify({ matches: [] }));
    expect((await answerSettingsWithModel({ ...req, question: 'print a fax' }, cloudDeps(call))).result?.matches).toEqual([]);
  });

  it('provider failures map to shared codes', async () => {
    const call = vi.fn(async () => {
      throw new AiProviderRuntimeError('slow', 'timeout');
    });
    expect(await explainBlancMistake({ word: '書く', expected: '書いて', typed: '書きて', answerLang: 'en' }, cloudDeps(call)))
      .toMatchObject({ ok: false, code: 'timeout' });
  });
});

describe('cancel', () => {
  it('aborts by request id through the shared aiStudy:cancel map; nothing is cached', async () => {
    let seen: AbortSignal | undefined;
    const call = vi.fn((...args: unknown[]) => new Promise<string>((_resolve, reject) => {
      seen = (args[4] as { signal: AbortSignal }).signal;
      seen.addEventListener('abort', () => reject(new AiProviderRuntimeError('cancelled', 'cancelled')));
    }));
    const pending = summarizeForBlanc({ requestId: 'ais-tutor-1', kind: 'kanji', subject: '水', answerLang: 'en' }, cloudDeps(call));
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
    expect(cancelAiStudyRequest('ais-tutor-1')).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
    expect(seen?.aborted).toBe(true);
    call.mockImplementation(async () => JSON.stringify({ headline: 'Water flows.', points: [] }));
    expect((await summarizeForBlanc({ kind: 'kanji', subject: '水', answerLang: 'en' }, cloudDeps(call))).cached).toBe(false);
  });
});
