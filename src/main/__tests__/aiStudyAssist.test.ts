// @vitest-environment node
/**
 * The optional AI study helpers in main (N1 why-wrong, N2 example sentences,
 * N3 leech rescue, N5 explain-in-context), against FAKE providers only — no
 * request ever leaves the process. Each gate is exercised: AI off, no key,
 * cloud consent denied, offline model missing; invalid output (bad JSON, wrong
 * shape, content that fails the feature's own checks) is a coded error and never
 * cached; a cancel aborts the in-flight call; the offline engine needs no cloud
 * opt-in; and only validated, complete answers are cached.
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
  aiStudyCacheKey,
  cancelAiStudyRequest,
  explainWordInContext,
  explainWrongAnswer,
  generateExampleSentences,
  resetAiStudyCacheForTests,
  suggestLeechRescue,
  type AiStudyDeps,
} from '../aiStudyAssist';
import { AiProviderRuntimeError } from '../providerRuntime';

type Call = NonNullable<AiStudyDeps['call']>;
type RunLocal = NonNullable<AiStudyDeps['runLocal']>;

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

const whyWrongReq = {
  card: { word: '暑い', reading: 'あつい', meaning: 'hot (weather)', sentence: '今日は暑い。' },
  typed: 'warm',
  expected: 'hot (weather)',
  direction: 'target-to-meaning',
  verdict: 'wrong',
  neighbours: [{ word: '熱い', reading: 'あつい', meaning: 'hot (to the touch)' }],
  studyLang: 'ja',
  answerLang: 'en',
};
const whyWrongReply = JSON.stringify({
  confusion: 'synonym',
  explanation: '暑い is about weather; "warm" is close but milder.',
  tip: 'Think of a hot summer day.',
  acceptable: true,
  acceptableReason: 'Warm weather is a reasonable gloss in many contexts.',
});

const examplesReq = {
  word: '食べる',
  reading: 'たべる',
  meaning: 'to eat',
  knownWords: ['私', '毎日', 'パン', 'りんご'],
  count: 3,
  studyLang: 'ja',
  answerLang: 'en',
};

const leechReq = {
  card: { word: '暑い', reading: 'あつい', meaning: 'hot', sentence: '', lapses: 9 },
  similar: [{ word: '熱い', reading: 'あつい', meaning: 'hot (to touch)' }],
  studyLang: 'ja',
  answerLang: 'en',
};

const contextReq = {
  word: 'かける',
  reading: 'かける',
  lang: 'ja',
  sentence: '眼鏡をかける。',
  senses: ['to hang', 'to put on (glasses)', 'to make a phone call'],
  answerLang: 'en',
};

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-study-'));
  resetAiStudyCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('gates', () => {
  it('AI off: nothing runs and the surface is told to hide', async () => {
    const call = vi.fn();
    const out = await explainWrongAnswer(whyWrongReq, cloudDeps(call, { enabled: () => false }));
    expect(out).toMatchObject({ ok: false, aiOff: true, code: 'ai-off' });
    expect(call).not.toHaveBeenCalled();
  });

  it('cloud consent denied for the feature: refused before any call', async () => {
    const call = vi.fn();
    const allowed = vi.fn(() => false);
    const out = await generateExampleSentences(examplesReq, cloudDeps(call, { cloudAllowed: allowed }));
    expect(out).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(allowed).toHaveBeenCalledWith('exampleSentences');
    expect(call).not.toHaveBeenCalled();
  });

  it('consent is checked per feature, by id', async () => {
    const call = vi.fn(async () => whyWrongReply);
    const allowed = (feature: string) => feature === 'whyWrong';
    expect((await explainWrongAnswer(whyWrongReq, cloudDeps(call, { cloudAllowed: allowed }))).ok).toBe(true);
    expect((await suggestLeechRescue(leechReq, cloudDeps(call, { cloudAllowed: allowed }))).code).toBe('consent');
  });

  it('without an override the shared gate decides (its default for these features is OFF)', async () => {
    // No `cloudAllowed` override: `aiCloudAllowedFor` (mocked here to the
    // documented default, false — see aiSetup.test.ts) is what is consulted.
    const call = vi.fn();
    const deps = cloudDeps(call);
    delete deps.cloudAllowed;
    expect(await explainWordInContext(contextReq, deps)).toMatchObject({ ok: false, code: 'consent' });
    expect(call).not.toHaveBeenCalled();
  });

  it('no key: the setup prompt, not a call', async () => {
    const call = vi.fn();
    const out = await suggestLeechRescue(leechReq, cloudDeps(call, { configured: () => false }));
    expect(out).toMatchObject({ ok: false, needsKey: true, code: 'no-key' });
    expect(call).not.toHaveBeenCalled();
  });

  it('offline engine without its model: no-local-model, and the cloud is never tried', async () => {
    const call = vi.fn();
    const runLocal = vi.fn();
    const out = await explainWrongAnswer(whyWrongReq, cloudDeps(call, {
      engine: () => 'local-qwen',
      localAvailable: () => false,
      runLocal,
    }));
    expect(out).toMatchObject({ ok: false, needsLocalModel: true, code: 'no-local-model' });
    expect(call).not.toHaveBeenCalled();
    expect(runLocal).not.toHaveBeenCalled();
  });

  it('offline engine needs no cloud opt-in and never touches the cloud client', async () => {
    const call = vi.fn();
    const runLocal = vi.fn<RunLocal>(async () => whyWrongReply);
    const out = await explainWrongAnswer(whyWrongReq, cloudDeps(call, {
      engine: () => 'local-qwen',
      cloudAllowed: () => false,
      localAvailable: () => true,
      runLocal,
    }));
    expect(out).toMatchObject({ ok: true, engine: 'local' });
    expect(call).not.toHaveBeenCalled();
    expect(String(runLocal.mock.calls[0][0])).toContain('single JSON object');
  });

  it('a request with nothing to ask about is empty-input', async () => {
    const call = vi.fn();
    expect((await explainWordInContext({ ...contextReq, senses: [] }, cloudDeps(call))).code).toBe('empty-input');
    expect((await generateExampleSentences({ word: '' }, cloudDeps(call))).code).toBe('empty-input');
    expect(call).not.toHaveBeenCalled();
  });
});

describe('the cloud call', () => {
  it('passes the feature id (per-feature consent in the client) and an abort signal', async () => {
    const call = vi.fn<Call>(async () => whyWrongReply);
    await explainWrongAnswer(whyWrongReq, cloudDeps(call));
    const options = call.mock.calls[0][4] as { feature: string; signal: AbortSignal };
    expect(options.feature).toBe('whyWrong');
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('maps provider failures to shared codes and caches nothing', async () => {
    const call = vi.fn<Call>(async () => {
      throw new AiProviderRuntimeError('slow', 'timeout');
    });
    expect(await explainWrongAnswer(whyWrongReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'timeout' });
    call.mockResolvedValue(whyWrongReply);
    expect((await explainWrongAnswer(whyWrongReq, cloudDeps(call))).cached).toBe(false);
  });

  it('a local timeout is `timeout`, not `other`', async () => {
    const runLocal = vi.fn(async () => {
      throw new Error('Local Qwen timed out after 120s.');
    });
    const out = await explainWrongAnswer(whyWrongReq, cloudDeps(vi.fn(), {
      engine: () => 'local-qwen', localAvailable: () => true, runLocal,
    }));
    expect(out.code).toBe('timeout');
  });
});

describe('validation and the cache', () => {
  it('caches a validated answer and answers the repeat from it; refresh asks again', async () => {
    const call = vi.fn(async () => whyWrongReply);
    const first = await explainWrongAnswer(whyWrongReq, cloudDeps(call));
    expect(first).toMatchObject({ ok: true, cached: false });
    expect(first.result).toMatchObject({ confusion: 'synonym', acceptable: true });
    expect((await explainWrongAnswer(whyWrongReq, cloudDeps(call))).cached).toBe(true);
    expect((await explainWrongAnswer({ ...whyWrongReq, refresh: true }, cloudDeps(call))).cached).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('bad JSON and a wrong shape are `invalid` and never cached', async () => {
    const call = vi.fn(async () => 'Sure! {broken');
    expect(await suggestLeechRescue(leechReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ hook: 'wrong field names' }));
    expect(await suggestLeechRescue(leechReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue('```json\n{"mnemonic":"It is hot like a fire.","clearerMeaning":"hot (weather)","distinction":"熱い is for touch."}\n```');
    expect(await suggestLeechRescue(leechReq, cloudDeps(call))).toMatchObject({ ok: true, cached: false });
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('content checks: an out-of-range sense is invalid, not a guess', async () => {
    const call = vi.fn(async () => JSON.stringify({ sense: 7, explanation: 'x', confidence: 'high' }));
    expect(await explainWordInContext(contextReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ sense: 2, explanation: '眼鏡を goes with putting on.', confidence: 'high' }));
    const ok = await explainWordInContext(contextReq, cloudDeps(call));
    expect(ok.result).toMatchObject({ senseIndex: 1, confidence: 'high' });
  });

  it('content checks: example sentences without the target word are dropped; none left is invalid', async () => {
    const call = vi.fn(async () => JSON.stringify({ sentences: [{ text: '私は毎日走る。', translation: 'I run.' }] }));
    expect(await generateExampleSentences(examplesReq, cloudDeps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(JSON.stringify({ sentences: [
      { text: '私は毎日パンを食べます。', translation: 'I eat bread every day.' },
      { text: '私は毎日走る。', translation: 'I run every day.' },
      { text: 'りんごを食べた。', translation: 'I ate an apple.' },
    ] }));
    const ok = await generateExampleSentences(examplesReq, cloudDeps(call));
    expect(ok.result?.sentences.map((s) => s.text)).toEqual(['私は毎日パンを食べます。', 'りんごを食べた。']);
  });

  it('a "Why was I wrong?" verdict without a typed answer is never acceptable', async () => {
    const call = vi.fn(async () => whyWrongReply);
    const out = await explainWrongAnswer({ ...whyWrongReq, direction: 'review', typed: 'warm' }, cloudDeps(call));
    expect(out.result).toMatchObject({ acceptable: false, acceptableReason: '' });
  });

  it('keys the cache on the model and the prompt version', () => {
    const parts = ['a', 'b'];
    expect(aiStudyCacheKey('whyWrong', 1, 'gemini-2.5-flash:gemini-2.5-flash', parts))
      .not.toBe(aiStudyCacheKey('whyWrong', 1, 'local-qwen', parts));
    expect(aiStudyCacheKey('whyWrong', 1, 'local-qwen', parts)).not.toBe(aiStudyCacheKey('whyWrong', 2, 'local-qwen', parts));
    expect(aiStudyCacheKey('whyWrong', 1, 'local-qwen', parts)).not.toBe(aiStudyCacheKey('leechRescue', 1, 'local-qwen', parts));
  });

  it('a different model does not answer from another model\'s cache', async () => {
    const call = vi.fn(async () => whyWrongReply);
    await explainWrongAnswer(whyWrongReq, cloudDeps(call));
    const other = await explainWrongAnswer(whyWrongReq, cloudDeps(call, { modelOf: () => 'gemini-3-pro' }));
    expect(other.cached).toBe(false);
  });

  it('a damaged cache entry is ignored, not served', async () => {
    const call = vi.fn(async () => whyWrongReply);
    await explainWrongAnswer(whyWrongReq, cloudDeps(call));
    const file = path.join(shared.userData, 'mining', 'ai-study-cache.json');
    const stored = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: Record<string, unknown> };
    for (const key of Object.keys(stored.entries)) stored.entries[key] = { explanation: '' };
    fs.writeFileSync(file, JSON.stringify(stored));
    resetAiStudyCacheForTests();
    expect((await explainWrongAnswer(whyWrongReq, cloudDeps(call))).cached).toBe(false);
  });
});

describe('cancel', () => {
  it('aborts the in-flight call by request id and reports `cancelled`', async () => {
    let seen: AbortSignal | undefined;
    const call = vi.fn((...args: unknown[]) => new Promise<string>((_resolve, reject) => {
      seen = (args[4] as { signal: AbortSignal }).signal;
      seen.addEventListener('abort', () => reject(new AiProviderRuntimeError('AI request was cancelled.', 'cancelled')));
    }));
    const pending = explainWrongAnswer({ ...whyWrongReq, requestId: 'ais-test-1' }, cloudDeps(call));
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
    expect(cancelAiStudyRequest('ais-test-1')).toBe(true);
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
    expect(seen?.aborted).toBe(true);
    // Nothing was cached: the next ask goes out again.
    call.mockImplementation(async () => whyWrongReply);
    expect((await explainWrongAnswer(whyWrongReq, cloudDeps(call))).cached).toBe(false);
  });

  it('a reply that lands after a cancel is still dropped', async () => {
    let finish: (value: string) => void = () => undefined;
    const call = vi.fn(() => new Promise<string>((resolve) => {
      finish = resolve;
    }));
    const pending = generateExampleSentences({ ...examplesReq, requestId: 'ais-test-2' }, cloudDeps(call));
    await vi.waitFor(() => expect(call).toHaveBeenCalled());
    cancelAiStudyRequest('ais-test-2');
    finish(JSON.stringify({ sentences: [{ text: 'パンを食べる。', translation: 'eat bread' }] }));
    expect(await pending).toMatchObject({ ok: false, code: 'cancelled' });
  });

  it('unknown or malformed ids are a no-op', () => {
    expect(cancelAiStudyRequest('nope')).toBe(false);
    expect(cancelAiStudyRequest({ id: 1 })).toBe(false);
    expect(cancelAiStudyRequest('../../etc')).toBe(false);
  });
});
