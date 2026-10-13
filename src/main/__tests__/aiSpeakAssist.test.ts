// @vitest-environment node
/**
 * The speaking and writing helpers in main (N18 shadowing explanation, N19
 * writing correction and journal grade, N20 conversation partner), against FAKE
 * providers only — nothing ever leaves the process. Each gate: AI off, no key,
 * cloud consent denied (per feature id, default OFF), offline model missing;
 * invalid output is a coded error and never cached; cancel aborts; the offline
 * engine needs no opt-in; and the known-word sample only reaches the cloud with
 * the learner's study-data permission.
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
vi.mock('../aiFeatureGate', async () => {
  const { AI_CLOUD_FEATURES } = await import('../../shared/aiSetup');
  return {
    aiFeaturesEnabled: () => true,
    // The documented defaults, as the real gate reads them with no store registered.
    aiCloudAllowedFor: (feature: string) => AI_CLOUD_FEATURES.find((entry) => entry.id === feature)?.defaultAllowed ?? false,
    AI_FEATURES_OFF_MESSAGE: 'off',
    AI_CLOUD_FEATURE_OFF_MESSAGE: 'cloud off',
  };
});
vi.mock('../providerRuntime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../providerRuntime')>(),
  getAiProviderHealth: () => ({ providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash', credentialBucket: 'gemini', configured: false }),
}));

import { cancelAiStudyRequest, resetAiStudyCacheForTests, type AiStudyDeps } from '../aiStudyAssist';
import {
  correctWriting,
  explainShadowing,
  gradeJournalEntry,
  replyAsConversationPartner,
  withholdKnownWordsForCloud,
} from '../aiSpeakAssist';
import { AiProviderRuntimeError } from '../providerRuntime';

type Call = NonNullable<AiStudyDeps['call']>;

function cloudDeps(call: ReturnType<typeof vi.fn>, extra: AiStudyDeps = {}): AiStudyDeps {
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

const shadowReq = {
  lang: 'ja', expected: 'ありがとうございます', heard: 'ありがとございます', score: 90,
  missed: ['ありがとう'], extra: [], hints: ['long-vowel'], pace: 'ok', answerLang: 'en',
};
const shadowReply = JSON.stringify({
  summary: 'The long う in ありがとう was cut short.',
  issues: [{ focus: 'long-vowel', explanation: 'とう needs two beats.', tip: 'Tap two beats on とう.' }],
});

const chatReq = {
  studyLang: 'ja', answerLang: 'en', scenario: 'restaurant', formality: 'polite', level: 'N4',
  knownWords: ['水', '食べる'], history: [{ role: 'partner', text: 'いらっしゃいませ。' }],
  message: '水がください', correct: true, shareStudyData: 'unset',
};
const chatReply = JSON.stringify({
  reply: 'はい、お水ですね。ほかに何かいかがですか？',
  translation: 'Sure, water. Anything else?',
  correction: { corrected: '水をください。', explanation: 'ください takes the object particle を.' },
});

const writeReq = { text: '昨日は雨がふるでした。', studyLang: 'ja', answerLang: 'en' };
const writeReply = JSON.stringify({
  edits: [{ original: 'ふるでした', corrected: '降りました', explanation: 'Past of 降る.', kind: 'conjugation' }],
  overall: 'One verb form to fix.',
});

const journalReq = {
  words: [{ word: '公園', reading: 'こうえん', meaning: 'park' }, { word: '静か', reading: 'しずか', meaning: 'quiet' }],
  text: '公園に行きました。', studyLang: 'ja', answerLang: 'en',
};
const journalReply = JSON.stringify({
  words: [{ word: '公園', used: true, correct: true, note: 'Good.' }, { word: '静か', used: true, correct: true, note: 'x' }],
  feedback: 'Nice and short.',
});

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-speak-'));
  resetAiStudyCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('gates', () => {
  it('AI off: nothing runs, for every helper', async () => {
    const call = vi.fn();
    const off = cloudDeps(call, { enabled: () => false });
    for (const run of [explainShadowing, replyAsConversationPartner, correctWriting, gradeJournalEntry]) {
      expect(await run({}, off)).toMatchObject({ ok: false, aiOff: true, code: 'ai-off' });
    }
    expect(call).not.toHaveBeenCalled();
  });

  it('cloud consent is per feature and every one starts OFF', async () => {
    const call = vi.fn(async () => writeReply);
    const deps = cloudDeps(call);
    delete deps.cloudAllowed;
    expect(await explainShadowing(shadowReq, deps)).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(await replyAsConversationPartner(chatReq, deps)).toMatchObject({ code: 'consent' });
    expect(await correctWriting(writeReq, deps)).toMatchObject({ code: 'consent' });
    expect(await gradeJournalEntry(journalReq, deps)).toMatchObject({ code: 'consent' });
    expect(call).not.toHaveBeenCalled();
    const allowed = vi.fn((feature: string) => feature === 'writingCorrection');
    expect((await correctWriting(writeReq, cloudDeps(call, { cloudAllowed: allowed }))).ok).toBe(true);
    expect(allowed).toHaveBeenCalledWith('writingCorrection');
  });

  it('no key: the setup prompt, not a call', async () => {
    const call = vi.fn();
    expect(await correctWriting(writeReq, cloudDeps(call, { configured: () => false }))).toMatchObject({ needsKey: true, code: 'no-key' });
    expect(call).not.toHaveBeenCalled();
  });

  it('offline engine: no model is no-local-model; with the model it needs no cloud opt-in', async () => {
    const call = vi.fn();
    const missing = await explainShadowing(shadowReq, cloudDeps(call, { engine: () => 'local-qwen', localAvailable: () => false }));
    expect(missing).toMatchObject({ needsLocalModel: true, code: 'no-local-model' });
    const runLocal = vi.fn(async () => shadowReply);
    const ok = await explainShadowing(shadowReq, cloudDeps(call, {
      engine: () => 'local-qwen', localAvailable: () => true, cloudAllowed: () => false, runLocal,
    }));
    expect(ok).toMatchObject({ ok: true, engine: 'local' });
    expect(call).not.toHaveBeenCalled();
  });

  it('nothing to ask about is empty-input', async () => {
    const call = vi.fn();
    expect((await correctWriting({ text: '   ' }, cloudDeps(call))).code).toBe('empty-input');
    expect((await replyAsConversationPartner({ ...chatReq, message: '' }, cloudDeps(call))).code).toBe('empty-input');
    expect((await gradeJournalEntry({ ...journalReq, words: [] }, cloudDeps(call))).code).toBe('empty-input');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('the known-word sample is study data', () => {
  it('stripped for the cloud unless sharing is allowed; kept for the offline model', async () => {
    const call = vi.fn(async (..._args: unknown[]) => chatReply);
    const withheld = await replyAsConversationPartner(chatReq, cloudDeps(call));
    expect(String(call.mock.calls[0][2])).not.toContain('水, 食べる');
    expect(withheld.result?.knownSampleSent).toBe(false);

    const shared = await replyAsConversationPartner({ ...chatReq, shareStudyData: 'allow' }, cloudDeps(call));
    expect(String(call.mock.calls[1][2])).toContain('水, 食べる');
    expect(shared.result?.knownSampleSent).toBe(true);

    const runLocal = vi.fn(async (..._args: unknown[]) => chatReply);
    const local = await replyAsConversationPartner(chatReq, cloudDeps(call, { engine: () => 'local-qwen', localAvailable: () => true, runLocal }));
    expect(String(runLocal.mock.calls[0][0])).toContain('水, 食べる');
    expect(local.result?.knownSampleSent).toBe(true);
  });

  it('the helper itself', () => {
    expect(withholdKnownWordsForCloud({ knownWords: ['a'], shareStudyData: 'local-only' }, 'cloud')).toMatchObject({ knownWords: [] });
    expect(withholdKnownWordsForCloud({ knownWords: ['a'], shareStudyData: 'allow' }, 'cloud')).toMatchObject({ knownWords: ['a'] });
    expect(withholdKnownWordsForCloud({ knownWords: ['a'] }, 'local-qwen')).toMatchObject({ knownWords: ['a'] });
  });
});

describe('validation and the cache', () => {
  it('a valid reply is cached and answers the repeat; the correction is kept beside the message', async () => {
    const call = vi.fn(async (..._args: unknown[]) => chatReply);
    const first = await replyAsConversationPartner(chatReq, cloudDeps(call));
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.result?.correction).toMatchObject({ corrected: '水をください。' });
    expect((await replyAsConversationPartner(chatReq, cloudDeps(call))).cached).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
    const options = call.mock.calls[0][4] as { feature: string; signal: AbortSignal };
    expect(options.feature).toBe('conversationPartner');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('invalid output is `invalid` and never cached: bad JSON, wrong shape, wrong language, unplaceable edits', async () => {
    const call = vi.fn(async () => 'Sure! {broken');
    expect(await correctWriting(writeReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ edits: [{ original: '雪', corrected: '雨', explanation: 'x', kind: 'word' }], overall: '' }));
    expect(await correctWriting(writeReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ reply: 'Here is your water.', translation: '', correction: null }));
    expect(await replyAsConversationPartner(chatReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(writeReply);
    const ok = await correctWriting(writeReq, cloudDeps(call));
    expect(ok).toMatchObject({ ok: true, cached: false });
    expect(ok.result?.edits[0]).toMatchObject({ start: 5, original: 'ふるでした', corrected: '降りました' });
  });

  it('the journal grade checks "used" itself', async () => {
    const call = vi.fn(async () => journalReply);
    const out = await gradeJournalEntry(journalReq, cloudDeps(call));
    expect(out.result?.words).toEqual([
      { word: '公園', used: true, correct: true, note: 'Good.' },
      { word: '静か', used: false, correct: false, note: 'x' },
    ]);
  });

  it('provider failures map to shared codes', async () => {
    const call = vi.fn(async () => {
      throw new AiProviderRuntimeError('slow', 'timeout');
    });
    expect(await explainShadowing(shadowReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'timeout' });
  });
});

describe('cancel', () => {
  it('aborts the in-flight call by request id through the shared cancel', async () => {
    let seen: AbortSignal | undefined;
    const call = vi.fn((...args: unknown[]) => new Promise<string>((_resolve, reject) => {
      seen = (args[4] as { signal: AbortSignal }).signal;
      seen.addEventListener('abort', () => reject(new AiProviderRuntimeError('cancelled', 'cancelled')));
    }));
    const pending = correctWriting({ ...writeReq, requestId: 'ais-speak-1' }, cloudDeps(call));
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
    expect(cancelAiStudyRequest('ais-speak-1')).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
    expect(seen?.aborted).toBe(true);
    call.mockImplementation(async () => writeReply);
    expect((await correctWriting(writeReq, cloudDeps(call))).cached).toBe(false);
  });
});

describe('round 2: the opening is fresh, earlier-session words are study data, pitch findings reach the prompt', () => {
  const opening = { ...chatReq, history: [], message: '', correct: false };

  it('an opening asked with `refresh` is a new call, not the cached line (bug 44: Start after Clear)', async () => {
    const call = vi.fn(async (..._args: unknown[]) => JSON.stringify({ reply: 'いらっしゃいませ。', translation: 'Welcome.', correction: null }));
    expect((await replyAsConversationPartner(opening, cloudDeps(call))).cached).toBe(false);
    expect((await replyAsConversationPartner(opening, cloudDeps(call))).cached).toBe(true);
    expect((await replyAsConversationPartner({ ...opening, refresh: true }, cloudDeps(call))).cached).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('recall words: stripped for the cloud unless sharing is allowed; sent to the offline model', async () => {
    const call = vi.fn(async (..._args: unknown[]) => chatReply);
    const req = { ...chatReq, recallWords: ['改札', '乗り換え'] };
    const withheld = await replyAsConversationPartner(req, cloudDeps(call));
    expect(String(call.mock.calls[0][2])).not.toContain('改札');
    expect(withheld.result?.recallSent).toBe(false);
    const allowed = await replyAsConversationPartner({ ...req, shareStudyData: 'allow' }, cloudDeps(call));
    expect(String(call.mock.calls[1][2])).toContain('改札, 乗り換え');
    expect(allowed.result?.recallSent).toBe(true);
    const runLocal = vi.fn(async (..._args: unknown[]) => chatReply);
    await replyAsConversationPartner(req, cloudDeps(call, { engine: () => 'local-qwen', localAvailable: () => true, runLocal }));
    expect(String(runLocal.mock.calls[0][0])).toContain('改札, 乗り換え');
    expect(withholdKnownWordsForCloud({ recallWords: ['a'], knownWords: ['b'] }, 'cloud')).toMatchObject({ recallWords: [], knownWords: [] });
  });

  it('the measured pitch accent and pauses are sent as text', async () => {
    const call = vi.fn(async (..._args: unknown[]) => shadowReply);
    await explainShadowing({ ...shadowReq, accent: ['箸: 1 → 2'], pauses: ['inside 図書館 0.4s'] }, cloudDeps(call));
    const prompt = String(call.mock.calls[0][2]);
    expect(prompt).toContain('箸: 1 → 2');
    expect(prompt).toContain('inside 図書館 0.4s');
  });
});
