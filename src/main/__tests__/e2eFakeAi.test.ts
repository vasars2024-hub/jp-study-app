// @vitest-environment node
/**
 * The fake OpenAI-compatible AI server the headless harness puts around the app
 * (tools/e2e/world.cjs `startFakeAi`, opt-in with `startWorld(..., { ai: true })`).
 *
 * Its answers are pinned against the app's OWN pipeline: each study helper runs through
 * `runAiStudyFeature` (src/main/aiStudyAssist.ts — the zod shape check and the feature's
 * content checks), with the provider call replaced by a real HTTP request to the fake in
 * the chat-completions shape `providerRuntime.ts` sends a compatible server. So a reply
 * that the app would reject fails here, not halfway through an E2E run. Loopback,
 * ephemeral port only — never Ollama's 11434 or LM Studio's 1234.
 */
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const shared = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => shared.userData },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../mining', () => ({
  getConfiguredAiProvider: () => ({ providerId: 'openai-compatible', apiKey: '' }),
  getConfiguredAiEngine: () => 'cloud',
}));
vi.mock('../aiProviderClient', () => ({ callAiProvider: vi.fn() }));
vi.mock('../aiFeatureGate', () => ({
  aiFeaturesEnabled: () => true,
  aiCloudAllowedFor: () => true,
  AI_FEATURES_OFF_MESSAGE: 'off',
  AI_CLOUD_FEATURE_OFF_MESSAGE: 'cloud off',
}));

import {
  explainWordInContext,
  explainWrongAnswer,
  generateExampleSentences,
  resetAiStudyCacheForTests,
  suggestLeechRescue,
  type AiStudyDeps,
} from '../aiStudyAssist';
import { correctWriting, gradeJournalEntry, explainShadowing, replyAsConversationPartner } from '../aiSpeakAssist';
import { normalizeAiFeatureSettings, type AiCloudFeatureId } from '../../shared/aiSetup';

interface FakeAiHit {
  path: string;
  feature: string | null;
  model?: string | null;
  schema?: boolean;
  status?: number;
}

interface FakeAi {
  port: number;
  base: string;
  model: string;
  hits: FakeAiHit[];
  failNext(feature: string): void;
  count(feature?: string): number;
  prompts(feature: string): string[];
  close(): Promise<void>;
}

const require = createRequire(__filename);
const world = require('../../../tools/e2e/world.cjs') as {
  startFakeAi(options?: { model?: string }): Promise<FakeAi>;
  writeAiPreset(profileDir: string, ai: { base: string; model: string }): void;
  FAKE_AI_FEATURES: string[];
  FAKE_AI_SPEAK_FEATURES: string[];
};

let fake: FakeAi | null = null;

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'gum-fake-ai-'));
  resetAiStudyCacheForTests();
});

afterEach(async () => {
  await fake?.close();
  fake = null;
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

/** The body `providerRuntime.ts` sends an OpenAI-compatible server for a JSON feature. */
async function chat(ai: FakeAi, prompt: string, schema: unknown, model = ai.model): Promise<Response> {
  return fetch(`${ai.base}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: `Respond with valid JSON only.\n\nReturn valid JSON matching this schema:\n${JSON.stringify(schema)}` },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'response', schema } },
      max_tokens: 2048,
      stream: false,
    }),
  });
}

/** The study runner, with its provider call going over HTTP to the fake. */
function viaFake(ai: FakeAi): AiStudyDeps {
  return {
    enabled: () => true,
    engine: () => 'cloud',
    provider: () => ({ providerId: 'openai-compatible', apiKey: '' }),
    configured: () => true,
    cloudAllowed: () => true,
    modelOf: () => ai.model,
    call: (async (_providerId: string, _key: string, prompt: string, schema: unknown) => {
      const res = await chat(ai, prompt, schema);
      if (!res.ok) throw new Error(`fake AI answered ${res.status}`);
      const body = (await res.json()) as { choices: Array<{ message: { content: string } }> };
      return body.choices[0].message.content;
    }) as unknown as NonNullable<AiStudyDeps['call']>,
  };
}

describe('fake OpenAI-compatible AI server (tools/e2e/world.cjs)', () => {
  it('listens on an ephemeral loopback port, never the real Ollama / LM Studio ports', async () => {
    fake = await world.startFakeAi();
    expect([11434, 1234]).not.toContain(fake.port);
    expect(fake.base).toBe(`http://127.0.0.1:${fake.port}/v1`);
    const models = (await (await fetch(`${fake.base}/models`)).json()) as { data: Array<{ id: string }> };
    expect(models.data.map((m) => m.id)).toEqual([fake.model]);
  });

  it('"Why was I wrong?": a typed answer is judged acceptable, a flip-card Again never is', async () => {
    fake = await world.startFakeAi();
    const typed = await explainWrongAnswer({
      card: { word: '暑い', reading: 'あつい', meaning: 'hot (weather)', sentence: '' },
      typed: 'warm',
      expected: 'hot (weather)',
      direction: 'target-to-meaning',
      verdict: 'wrong',
      neighbours: [],
      studyLang: 'ja',
      answerLang: 'en',
    }, viaFake(fake));
    expect(typed.ok).toBe(true);
    expect(typed.result).toMatchObject({ confusion: 'synonym', acceptable: true });
    expect(typed.result?.explanation).toContain('暑い');
    expect(typed.result?.acceptableReason).toContain('warm');

    const flip = await explainWrongAnswer({
      card: { word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '' },
      direction: 'review',
      verdict: 'again',
      studyLang: 'ja',
      answerLang: 'en',
    }, viaFake(fake));
    expect(flip.ok).toBe(true);
    expect(flip.result).toMatchObject({ acceptable: false, acceptableReason: '' });
    expect(fake.count('whyWrong')).toBe(2);
  });

  it('example sentences: the one without the word is dropped by validation, the rest use it', async () => {
    fake = await world.startFakeAi();
    const reply = await generateExampleSentences({ word: '猫', reading: 'ねこ', meaning: 'cat', knownWords: [], count: 3, studyLang: 'ja', answerLang: 'en' }, viaFake(fake));
    expect(reply.ok).toBe(true);
    const texts = (reply.result?.sentences ?? []).map((s) => s.text);
    expect(texts).toHaveLength(2);
    expect(texts.every((text) => text.includes('猫'))).toBe(true);
    expect(texts[0]).toBe('猫です。');
  });

  it('leech rescue: every part, the distinction only when similar cards were sent', async () => {
    fake = await world.startFakeAi();
    const card = { word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '', lapses: 4 };
    const withSimilar = await suggestLeechRescue({ card, similar: [{ word: '子猫', reading: 'こねこ', meaning: 'kitten' }], studyLang: 'ja', answerLang: 'en' }, viaFake(fake));
    expect(withSimilar.ok).toBe(true);
    expect(withSimilar.result?.mnemonic).toContain('猫');
    expect(withSimilar.result?.clearerMeaning).not.toBe('');
    expect(withSimilar.result?.distinction).not.toBe('');
    const alone = await suggestLeechRescue({ card, similar: [], studyLang: 'ja', answerLang: 'en' }, viaFake(fake));
    expect(alone.ok).toBe(true);
    expect(alone.result?.distinction).toBe('');
  });

  it('explain in context: picks a sense inside the list (the second when there are two)', async () => {
    fake = await world.startFakeAi();
    const two = await explainWordInContext({ word: '台所', reading: 'だいどころ', lang: 'ja', sentence: '台所で猫が眠っていた。', senses: ['kitchen', 'household finances'], answerLang: 'en' }, viaFake(fake));
    expect(two.ok).toBe(true);
    expect(two.result).toMatchObject({ senseIndex: 1, confidence: 'high' });
    const one = await explainWordInContext({ word: '猫', reading: 'ねこ', lang: 'ja', sentence: '猫が眠っていた。', senses: ['cat'], answerLang: 'en' }, viaFake(fake));
    expect(one.result?.senseIndex).toBe(0);
  });

  it('fails on request, refuses what it does not answer, and records every hit', async () => {
    fake = await world.startFakeAi();
    fake.failNext('leechRescue');
    const card = { word: '猫', reading: 'ねこ', meaning: 'cat', sentence: '', lapses: 4 };
    const failed = await suggestLeechRescue({ card, similar: [], studyLang: 'ja', answerLang: 'en' }, viaFake(fake));
    expect(failed.ok).toBe(false);
    const after = await suggestLeechRescue({ card, similar: [], studyLang: 'ja', answerLang: 'en', refresh: true }, viaFake(fake));
    expect(after.ok).toBe(true);

    const unknown = await chat(fake, 'Translate this subtitle line.', { type: 'object', properties: { text: { type: 'string' } } });
    expect(unknown.status).toBe(400);
    const wrongModel = await chat(fake, 'Which sense does the word have IN THIS SENTENCE?', { type: 'object', properties: { sense: { type: 'integer' } } }, 'qwen3:8b');
    expect(wrongModel.status).toBe(404);
    expect(fake.hits.map((h) => h.status)).toEqual([500, 200, 400, 404]);
  });

  it('presets a fresh profile: AI on, the local compatible server at the fake, the helpers allowed', async () => {
    fake = await world.startFakeAi();
    world.writeAiPreset(shared.userData, fake);
    const settings = JSON.parse(fs.readFileSync(path.join(shared.userData, 'ai', 'settings-v1.json'), 'utf8'));
    expect(settings).toMatchObject({ version: 1, enabled: true, compatBaseUrl: fake.base, compatModel: fake.model });
    for (const feature of world.FAKE_AI_FEATURES) expect(settings.cloudFeatures[feature]).toBe(true);
    // Read back the way main reads it: nothing in the preset is dropped as malformed.
    const normalized = normalizeAiFeatureSettings(settings);
    expect(normalized).toMatchObject({ enabled: true, compatBaseUrl: fake.base, compatModel: fake.model });
    for (const feature of world.FAKE_AI_FEATURES) expect(normalized.cloudFeatures[feature as AiCloudFeatureId]).toBe(true);
    const mining = JSON.parse(fs.readFileSync(path.join(shared.userData, 'mining', 'config.json'), 'utf8'));
    expect(mining).toEqual({ providerId: 'openai-compatible', engine: 'cloud' });
  });
});

describe('fake AI: the speaking and writing helpers (tools/e2e/flows/88b-speak.cjs)', () => {
  const chatBase = {
    studyLang: 'ja', answerLang: 'en', scenario: 'free', formality: 'polite', level: 'N4',
    knownWords: [], recallWords: [], shareStudyData: 'allow',
  };

  it("the partner opens, answers and corrects through the app's own validation; prompts are kept", async () => {
    fake = await world.startFakeAi();
    const opening = await replyAsConversationPartner({ ...chatBase, history: [], message: '', correct: false }, viaFake(fake));
    expect(opening).toMatchObject({ ok: true, result: { reply: 'いらっしゃいませ。改札はあちらです。', correction: null } });
    const reply = await replyAsConversationPartner({
      ...chatBase, recallWords: ['改札'], history: [{ role: 'partner', text: 'いらっしゃいませ。' }], message: '水がください', correct: true,
    }, viaFake(fake));
    expect(reply.result?.correction).toMatchObject({ corrected: '水をください' });
    expect(fake.prompts('conversationPartner')).toHaveLength(2);
    expect(fake.prompts('conversationPartner')[1]).toContain('Learner: 水がください');
    expect(fake.prompts('conversationPartner')[1]).toMatch(/earlier conversations[^\n]*改札/);
  });

  it("writing correction, journal grade and the shadowing explanation pass the app's checks", async () => {
    fake = await world.startFakeAi();
    const corrected = await correctWriting({ text: '私はは学生です。', studyLang: 'ja', answerLang: 'en' }, viaFake(fake));
    expect(corrected.result?.edits).toMatchObject([{ original: '私はは', corrected: '私は', kind: 'particle', start: 0 }]);
    const graded = await gradeJournalEntry({
      words: [{ word: '公園', reading: 'こうえん', meaning: 'park' }], text: '公園に行きました。', studyLang: 'ja', answerLang: 'en',
    }, viaFake(fake));
    expect(graded.result?.words).toEqual([{ word: '公園', used: true, correct: true, note: 'E2E fake AI: 公園 fits.' }]);
    const shadow = await explainShadowing({
      lang: 'ja', expected: '箸が', heard: '箸が', score: 100, missed: [], extra: [], hints: [], pace: 'ok', answerLang: 'en',
    }, viaFake(fake));
    expect(shadow.ok).toBe(true);
    expect(fake.count('writingCorrection') + fake.count('journalGrade') + fake.count('shadowingFeedback')).toBe(3);
  });

  it('the preset allows the speaking helpers too', async () => {
    fake = await world.startFakeAi();
    world.writeAiPreset(shared.userData, fake);
    const normalized = normalizeAiFeatureSettings(JSON.parse(fs.readFileSync(path.join(shared.userData, 'ai', 'settings-v1.json'), 'utf8')));
    for (const feature of world.FAKE_AI_SPEAK_FEATURES) expect(normalized.cloudFeatures[feature as AiCloudFeatureId]).toBe(true);
  });
});
