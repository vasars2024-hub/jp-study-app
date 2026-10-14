// @vitest-environment node
/**
 * F9 in main, against fake providers only: Explain, the translate analysis, the
 * study helpers and the media assistant stream their reply through `onTextChunk`,
 * a cancel stops them, and a streamed run returns and caches EXACTLY what the
 * unstreamed one does. Also W1-A's follow-ups: the offline engine keys its cache
 * on the model file and decodes structured replies under a JSON grammar.
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
vi.mock('../translateRouter', () => ({ readTranslateProviderSettings: () => ({ version: 1, pairs: {}, consent: {}, fallbackToLocal: true }) }));
vi.mock('../aiFeatureGate', () => ({
  aiFeaturesEnabled: () => true,
  aiCloudAllowedFor: () => true,
  AI_FEATURES_OFF_MESSAGE: 'off',
  AI_CLOUD_FEATURE_OFF_MESSAGE: 'cloud off',
}));
vi.mock('../providerRuntime', async (importOriginal) => ({
  ...await importOriginal<typeof import('../providerRuntime')>(),
  getAiProviderHealth: () => ({ providerId: 'gemini-2.5-flash', model: 'gemini-2.5-flash', credentialBucket: 'gemini', configured: true }),
}));

import { explainWrongAnswer, resetAiStudyCacheForTests, type AiStudyDeps } from '../aiStudyAssist';
import { analyzeTranslation, resetTranslateAnalysisCacheForTests } from '../translateAnalysis';
import { assistMediaStudy, resetMediaStudyAssistantCacheForTests } from '../mediaStudyAssistant';
import { runLexiconExplain } from '../dictionary/explainRun';
import { EXPLANATION_PROMPT_VERSION } from '../../shared/lexiconExplanations';
import type { AgentProviderPolicy } from '../../shared/agentWorkspace';
import { streamPreview } from '../../shared/aiStreamPreview';
import { AiProviderRuntimeError } from '../providerRuntime';

const WHY_REPLY = JSON.stringify({
  confusion: 'synonym',
  explanation: '暑い is about weather; "warm" is close but milder.',
  tip: 'Think of a hot summer day.',
  acceptable: true,
  acceptableReason: '"warm" is close enough here.',
});
const whyReq = {
  card: { word: '暑い', reading: 'あつい', meaning: 'hot (weather)', sentence: '今日は暑い。' },
  typed: 'warm',
  expected: 'hot (weather)',
  direction: 'target-to-meaning',
  verdict: 'wrong',
  neighbours: [],
  studyLang: 'ja',
  answerLang: 'en',
};

/** A fake provider that streams `reply` in `pieces` chunks, then returns it whole. */
function streamingCall(reply: string, pieces = 4) {
  return vi.fn(async (...args: unknown[]) => {
    const options = args[4] as { onTextChunk?: (t: string) => void } | undefined;
    const size = Math.ceil(reply.length / pieces);
    for (let i = 0; i < reply.length; i += size) options?.onTextChunk?.(reply.slice(i, i + size));
    return reply;
  });
}

const cloud = (call: ReturnType<typeof vi.fn>, extra: AiStudyDeps = {}): AiStudyDeps => ({
  enabled: () => true,
  engine: () => 'cloud',
  provider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
  configured: () => true,
  cloudAllowed: () => true,
  modelOf: () => 'gemini-2.5-flash',
  call: call as never,
  ...extra,
});

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-stream-'));
  resetAiStudyCacheForTests();
  resetTranslateAnalysisCacheForTests();
  resetMediaStudyAssistantCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('study helpers stream', () => {
  it('chunks reach the sink, and the streamed result equals the unstreamed one', async () => {
    const chunks: string[] = [];
    const streamed = await explainWrongAnswer({ ...whyReq, requestId: 'a1' }, cloud(streamingCall(WHY_REPLY), { onTextChunk: (c) => chunks.push(c) }));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(WHY_REPLY);
    // What the learner saw while it streamed is the prose of the final answer.
    expect(streamPreview(chunks.join(''))).toContain('暑い is about weather');

    resetAiStudyCacheForTests();
    fs.rmSync(path.join(shared.userData, 'mining'), { recursive: true, force: true });
    const plain = await explainWrongAnswer(whyReq, cloud(vi.fn(async () => WHY_REPLY)));
    expect(streamed).toEqual(plain);
    expect(streamed.ok).toBe(true);
  });

  it('passes the sink only when there is one', async () => {
    const call = vi.fn(async () => WHY_REPLY);
    await explainWrongAnswer(whyReq, cloud(call));
    expect((call.mock.calls[0] as unknown[])[4]).not.toHaveProperty('onTextChunk');
  });

  it('the offline engine streams too, under a JSON grammar, keyed on the model file', async () => {
    const runLocal = vi.fn(async (_prompt: string, options: { onTextChunk?: (t: string) => void }) => {
      options.onTextChunk?.(WHY_REPLY);
      return WHY_REPLY;
    });
    const chunks: string[] = [];
    const deps: AiStudyDeps = {
      enabled: () => true,
      engine: () => 'local-qwen',
      localAvailable: () => true,
      localModelKey: () => 'local:qwen3-1.7b.gguf:100',
      runLocal: runLocal as never,
      onTextChunk: (c) => chunks.push(c),
    };
    const first = await explainWrongAnswer(whyReq, deps);
    expect(first).toMatchObject({ ok: true, cached: false, engine: 'local' });
    expect(runLocal.mock.calls[0][1]).toMatchObject({ jsonGrammar: { kind: 'json' } });
    expect(chunks).toEqual([WHY_REPLY]);
    // Same file: served from the cache.
    expect(await explainWrongAnswer(whyReq, deps)).toMatchObject({ ok: true, cached: true });
    // Another local model is not served the first one's answer.
    const other = await explainWrongAnswer(whyReq, { ...deps, localModelKey: () => 'local:qwen3-8b.gguf:900' });
    expect(other).toMatchObject({ ok: true, cached: false });
    expect(runLocal).toHaveBeenCalledTimes(2);
  });
});

describe('translate analysis streams and cancels', () => {
  const req = { sourceText: 'はい。', translatedText: 'Yes.', source: 'ja', target: 'en', jaParticleTokens: [] };
  const GOOD = JSON.stringify({ formality: { casual: 'yeah', polite: 'Yes.', businessSafe: 'Certainly.' } });
  const base = { provider: () => ({ providerId: 'gemini-2.5-flash' as const, apiKey: 'k' }), consented: () => true, enabled: () => true };

  it('streams, with the same result as unstreamed', async () => {
    const chunks: string[] = [];
    const streamed = await analyzeTranslation(req, { ...base, call: streamingCall(GOOD) as never, onTextChunk: (c) => chunks.push(c) });
    expect(chunks.join('')).toBe(GOOD);
    resetTranslateAnalysisCacheForTests();
    fs.rmSync(path.join(shared.userData, 'mining'), { recursive: true, force: true });
    const plain = await analyzeTranslation(req, { ...base, call: vi.fn(async () => GOOD) as never });
    expect(streamed).toEqual(plain);
  });

  it('a cancel is `cancelled`, and nothing is cached', async () => {
    const controller = new AbortController();
    const call = vi.fn(async (...args: unknown[]) => {
      (args[4] as { onTextChunk?: (t: string) => void }).onTextChunk?.('{"formality":{"casual":"ye');
      controller.abort();
      throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
    });
    const res = await analyzeTranslation(req, { ...base, call: call as never, signal: controller.signal, onTextChunk: () => undefined });
    expect(res).toMatchObject({ ok: false, code: 'cancelled' });
    expect((call.mock.calls[0] as unknown[])[4]).toMatchObject({ signal: controller.signal });
    const again = await analyzeTranslation(req, { ...base, call: vi.fn(async () => GOOD) as never });
    expect(again.cached).toBeUndefined();
  });
});

describe('media assistant streams and cancels', () => {
  const full = JSON.stringify({
    summary: 'A greeting.', translation: 'Good morning.', simplifiedJapanese: '',
    grammar: [{ pattern: 'ございます', explanation: 'polite', level: 'N4' }], vocabulary: [], examples: [], notes: [],
  });
  const req = { mode: 'explain-grammar', text: 'おはようございます', context: 'Episode 1' };
  const deps = { provider: () => ({ providerId: 'gemini-2.5-flash' as const, apiKey: 'k' }), enabled: () => true };

  it('streams to the sink', async () => {
    const chunks: string[] = [];
    const res = await assistMediaStudy(req, { ...deps, call: streamingCall(full) as never, onTextChunk: (c) => chunks.push(c) });
    expect(res.ok).toBe(true);
    expect(chunks.join('')).toBe(full);
  });

  it('a cancel is `cancelled`', async () => {
    const controller = new AbortController();
    controller.abort();
    const res = await assistMediaStudy(req, { ...deps, call: vi.fn(async () => { throw new Error('aborted'); }) as never, signal: controller.signal });
    expect(res).toMatchObject({ ok: false, code: 'cancelled' });
  });
});

describe('Explain streams and cancels', () => {
  const POLICY = { target: { kind: 'cloud', providerId: 'gemini-2.5-flash' }, allowCloud: true, cache: 'off' } as AgentProviderPolicy;
  const KEY = { lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en', model: 'cloud:gemini', promptVersion: EXPLANATION_PROMPT_VERSION };
  const REPLY = '{"summary":"A cat.","sections":[{"kind":"nuance","body":"Unmarked."}]}';

  it('passes the signal and the sink to the provider, and stores the whole reply', async () => {
    const controller = new AbortController();
    const onTextChunk = vi.fn();
    const runProvider = vi.fn(async (_p: unknown, _prompt: string, options: { onTextChunk?: (t: string) => void }) => {
      options.onTextChunk?.(REPLY);
      return { text: REPLY };
    });
    const store = vi.fn((_k, input) => ({ ...KEY, ...input, createdAt: 1 }));
    const res = await runLexiconExplain(
      { readCached: () => null, store, runProvider },
      { key: KEY, grounding: { glosses: ['cat'] }, policy: POLICY, signal: controller.signal, onTextChunk },
    );
    expect(res.ok).toBe(true);
    expect(onTextChunk).toHaveBeenCalledWith(REPLY);
    expect(runProvider.mock.calls[0][2]).toMatchObject({ allowLocalFallback: false, signal: controller.signal });
  });

  it('a cancel stores nothing, even when the reply had already arrived', async () => {
    const controller = new AbortController();
    const store = vi.fn();
    const res = await runLexiconExplain(
      {
        readCached: () => null,
        store,
        runProvider: async () => {
          controller.abort();
          return { text: REPLY };
        },
      },
      { key: KEY, grounding: { glosses: ['cat'] }, policy: POLICY, signal: controller.signal },
    );
    expect(res).toEqual({ ok: false, cached: false, explanation: null, error: 'cancelled' });
    expect(store).not.toHaveBeenCalled();
  });

  it('a cancel that interrupts the provider is `cancelled`, not a provider failure', async () => {
    const controller = new AbortController();
    const res = await runLexiconExplain(
      {
        readCached: () => null,
        store: vi.fn(),
        runProvider: async () => {
          controller.abort();
          throw new AiProviderRuntimeError('AI request was cancelled.', 'cancelled');
        },
      },
      { key: KEY, grounding: { glosses: ['cat'] }, policy: POLICY, signal: controller.signal },
    );
    expect(res.error).toBe('cancelled');
  });
});
