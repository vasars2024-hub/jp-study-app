// @vitest-environment node
/**
 * The optional AI helpers for watching and reading in main (video brief, i+1
 * line pick, reader explain / simplify, VN explain / translate, the Study
 * command fallback), against FAKE providers only — no request ever leaves the
 * process. Each gate is exercised: AI off, no key, cloud consent denied (per
 * feature, including the reader/VN split of one spec), offline model missing;
 * invalid output is a coded error and never cached; a cancel aborts the
 * in-flight call; the offline engine needs no cloud opt-in; and only validated,
 * complete answers are cached.
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

import {
  briefMediaChunk,
  cancelAiImmerseRequest,
  explainImmerseLine,
  interpretStudyCommand,
  pickTeachableLines,
  resetAiImmerseCacheForTests,
  simplifyReaderText,
  translateLineInContext,
  type AiImmerseDeps,
} from '../aiImmerseAssist';
import { AiProviderRuntimeError } from '../providerRuntime';
import type { AiImmerseFeature } from '../../shared/aiImmerseCommon';

type Call = NonNullable<AiImmerseDeps['call']>;

function cloudDeps(call: ReturnType<typeof vi.fn>, extra: AiImmerseDeps = {}): AiImmerseDeps {
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

const briefReq = {
  title: 'Episode 1',
  studyLang: 'ja',
  answerLang: 'en',
  level: 'knows 88% of the words',
  chunkIndex: 0,
  chunkCount: 1,
  questionCount: 3,
  cues: [
    { id: 0, text: '今日は学校に行きます。' },
    { id: 1, text: '先生が遅れて来ました。' },
    { id: 2, text: '雨が降っていたからです。' },
  ],
};
const briefReply = JSON.stringify({
  summary: 'A student goes to school; the teacher is late because of the rain.',
  questions: [
    { question: '先生はどうして遅れましたか。', answer: '雨が降っていたから。', cueId: 2 },
    { question: 'どこに行きますか。', answer: '学校。', cueId: 0 },
    { question: 'Who was late?', answer: 'The teacher', cueId: 1 }, // not in the study language: dropped
  ],
});

const pickReq = {
  studyLang: 'ja',
  answerLang: 'en',
  level: 'stretch',
  pickCount: 2,
  candidates: [
    { id: 0, text: '猫が窓から外を見ている。', target: '窓' },
    { id: 3, text: '彼は約束を守った。', target: '約束' },
  ],
};

const explainReq = {
  surface: 'reader',
  text: '彼は約束を守った。',
  target: '約束',
  context: '昨日のこと。彼は約束を守った。',
  studyLang: 'ja',
  answerLang: 'en',
};
const explainReply = JSON.stringify({
  translation: 'He kept his promise.',
  explanation: 'A plain past statement.',
  grammar: [{ pattern: 'を守る', note: 'to keep (a promise, a rule)' }],
  targetMeaning: 'promise',
});

const simplifyReq = {
  text: '政府は新たな経済政策を発表した。',
  studyLang: 'ja',
  answerLang: 'en',
  level: 'hard',
  unknownWords: ['政府', '経済政策'],
};

const translateReq = {
  text: 'まさか、本当に来るとは思わなかった。',
  context: '【岡部】待っていたぞ。',
  speaker: '紅莉栖',
  studyLang: 'ja',
  targetLang: 'en',
};

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-immerse-'));
  resetAiImmerseCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('gates', () => {
  it('AI off: nothing runs and the surface is told to hide', async () => {
    const call = vi.fn();
    const result = await briefMediaChunk(briefReq, cloudDeps(call, { enabled: () => false }));
    expect(result).toMatchObject({ ok: false, aiOff: true, code: 'ai-off' });
    expect(call).not.toHaveBeenCalled();
  });

  it('no key: a coded needsKey, no call', async () => {
    const call = vi.fn();
    const result = await pickTeachableLines(pickReq, cloudDeps(call, { configured: () => false }));
    expect(result).toMatchObject({ ok: false, needsKey: true, code: 'no-key' });
    expect(call).not.toHaveBeenCalled();
  });

  it('cloud consent denied: a coded needsConsent, no call', async () => {
    const call = vi.fn();
    const result = await simplifyReaderText(simplifyReq, cloudDeps(call, { cloudAllowed: () => false }));
    expect(result).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(call).not.toHaveBeenCalled();
  });

  it('one explain spec, two consents: the reader and the VN are asked about separately', async () => {
    const asked: AiImmerseFeature[] = [];
    const call = vi.fn<(...args: unknown[]) => Promise<string>>(async () => explainReply);
    const deps = cloudDeps(call, {
      cloudAllowed: (feature) => {
        asked.push(feature);
        return feature === 'vnExplain';
      },
    });
    expect(await explainImmerseLine(explainReq, deps)).toMatchObject({ ok: false, code: 'consent' });
    expect(await explainImmerseLine({ ...explainReq, surface: 'vn' }, deps)).toMatchObject({ ok: true });
    expect(asked).toEqual(['readerExplain', 'vnExplain']);
    // The cloud call names the feature, so main's own gate checks the same opt-in.
    expect(call.mock.calls[0][4]).toMatchObject({ feature: 'vnExplain' });
  });

  it('offline engine: no cloud opt-in needed, but the model file is', async () => {
    const runLocal = vi.fn(async () => briefReply);
    const missing = await briefMediaChunk(briefReq, {
      enabled: () => true,
      engine: () => 'local-qwen',
      localAvailable: () => false,
      runLocal,
    });
    expect(missing).toMatchObject({ ok: false, needsLocalModel: true, code: 'no-local-model' });
    const ok = await briefMediaChunk(briefReq, {
      enabled: () => true,
      engine: () => 'local-qwen',
      localAvailable: () => true,
      cloudAllowed: () => false,
      runLocal,
    });
    expect(ok).toMatchObject({ ok: true, engine: 'local' });
    expect(runLocal).toHaveBeenCalledTimes(1);
  });

  it('a transcript chunk over the size cap is refused, not sent', async () => {
    const call = vi.fn();
    const huge = { ...briefReq, cues: Array.from({ length: 80 }, (_, id) => ({ id, text: 'あ'.repeat(200) })) };
    expect(await briefMediaChunk(huge, cloudDeps(call))).toMatchObject({ ok: false, code: 'empty-input' });
    expect(call).not.toHaveBeenCalled();
  });
});

describe('video brief and line pick', () => {
  it('keeps only questions in the study language naming a cue of this chunk, and caches the result', async () => {
    const call = vi.fn(async () => briefReply);
    const first = await briefMediaChunk(briefReq, cloudDeps(call));
    expect(first.ok).toBe(true);
    expect(first.result?.questions.map((q) => q.cueId)).toEqual([2, 0]);
    const again = await briefMediaChunk(briefReq, cloudDeps(call));
    expect(again).toMatchObject({ ok: true, cached: true });
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('a brief whose questions all name unknown cues is invalid and never cached', async () => {
    const call = vi.fn(async () => JSON.stringify({ summary: 'x', questions: [{ question: '何？', answer: 'a', cueId: 99 }] }));
    expect(await briefMediaChunk(briefReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    expect(await briefMediaChunk(briefReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('malformed JSON is a coded invalid', async () => {
    const call = vi.fn(async () => 'not json at all');
    expect(await pickTeachableLines(pickReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('a pick may only name offered ids, once each', async () => {
    const call = vi.fn(async () => JSON.stringify({
      picks: [{ id: 3, reason: 'Useful word.' }, { id: 3, reason: 'again' }, { id: 7, reason: 'made up' }],
    }));
    const result = await pickTeachableLines(pickReq, cloudDeps(call));
    expect(result.result?.picks).toEqual([{ id: 3, reason: 'Useful word.' }]);
  });

  it('provider errors become shared codes', async () => {
    const call = vi.fn(async () => {
      throw new AiProviderRuntimeError('slow', 'timeout');
    });
    expect(await pickTeachableLines(pickReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'timeout' });
  });
});

describe('reader and visual novel', () => {
  it('explain: a "translation" that repeats the line is no answer', async () => {
    const call = vi.fn(async () => JSON.stringify({
      translation: '彼は約束を守った。',
      explanation: 'x',
      grammar: [],
      targetMeaning: '',
    }));
    expect(await explainImmerseLine(explainReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
  });

  it('simplify: the rewrite must be in the study language and not the same text', async () => {
    const english = vi.fn(async () => JSON.stringify({ simplified: 'The government announced a new policy.', notes: [] }));
    expect(await simplifyReaderText(simplifyReq, cloudDeps(english))).toMatchObject({ ok: false, code: 'invalid' });
    const good = vi.fn(async () => JSON.stringify({ simplified: '国は新しいお金のルールを出した。', notes: ['政府 → 国'] }));
    expect(await simplifyReaderText(simplifyReq, cloudDeps(good))).toMatchObject({
      ok: true,
      result: { simplified: '国は新しいお金のルールを出した。', notes: ['政府 → 国'] },
    });
  });

  it('translate with context: markup is stripped, the answer is plain text', async () => {
    const call = vi.fn<(...args: unknown[]) => Promise<string>>(async () => JSON.stringify({ translation: '<b>No way</b>, I never thought you would actually come.' }));
    const result = await translateLineInContext(translateReq, cloudDeps(call));
    expect(result.result?.translation).toBe('No way, I never thought you would actually come.');
    expect(call.mock.calls[0][2]).toContain('紅莉栖');
    expect(call.mock.calls[0][2]).toContain('待っていたぞ');
  });

  it('cancel: the in-flight call is aborted and reported as cancelled, not cached', async () => {
    let seen: AbortSignal | undefined;
    const call = vi.fn((...args: unknown[]) => new Promise<string>((_resolve, reject) => {
      seen = (args[4] as { signal: AbortSignal }).signal;
      seen.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    }));
    const pending = translateLineInContext({ ...translateReq, requestId: 'vn-1' }, cloudDeps(call));
    await vi.waitFor(() => expect(seen).toBeDefined());
    expect(cancelAiImmerseRequest('vn-1')).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
    expect(cancelAiImmerseRequest('vn-1')).toBe(false);
  });
});

describe('Study command fallback', () => {
  it('maps free text to a typed filter and nothing else', async () => {
    const call = vi.fn(async () => JSON.stringify({
      op: 'filter',
      excludedJlptLevels: ['n3', 'N9', 'N2'],
      minimumOccurrences: 3,
      maximumCards: 0,
      excludeKnown: 'on',
      excludeInternalDuplicates: 'unchanged',
      excludeAnkiDuplicates: 'off',
      excludeProperNouns: 'unchanged',
    }));
    const result = await interpretStudyCommand({ text: 'N3とN2を外して、3回以上の単語だけ' }, cloudDeps(call));
    expect(result.result).toEqual({
      op: 'filter',
      args: { excludedJlptLevels: ['N2', 'N3'], minimumOccurrences: 3, excludeKnown: true, excludeAnkiDuplicates: false },
    });
  });

  it('"none" is a coded no-answer, never cached as an operation', async () => {
    const call = vi.fn(async () => JSON.stringify({
      op: 'none',
      excludedJlptLevels: [],
      minimumOccurrences: 0,
      maximumCards: 0,
      excludeKnown: 'unchanged',
      excludeInternalDuplicates: 'unchanged',
      excludeAnkiDuplicates: 'unchanged',
      excludeProperNouns: 'unchanged',
    }));
    expect(await interpretStudyCommand({ text: 'delete my whole deck' }, cloudDeps(call))).toMatchObject({ ok: false, code: 'no-answer' });
    expect(await interpretStudyCommand({ text: 'delete my whole deck' }, cloudDeps(call))).toMatchObject({ ok: false, code: 'no-answer' });
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('an unknown op is refused', async () => {
    const call = vi.fn(async () => JSON.stringify({ op: 'export-anki' }));
    expect(await interpretStudyCommand({ text: 'export everything' }, cloudDeps(call))).toMatchObject({ ok: false, code: 'no-answer' });
  });
});
