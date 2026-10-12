// @vitest-environment node
/**
 * F2 for the Media/VN Study Assistant cache, against a fake provider: only a
 * complete answer is stored, `refresh` bypasses the cache, the key carries the
 * model and prompt version, bad JSON is a coded error, and the store is bounded.
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
vi.mock('../mining', () => ({ getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }) }));
vi.mock('../aiProviderClient', () => ({ callAiProvider: vi.fn() }));
vi.mock('../aiFeatureGate', () => ({
  aiFeaturesEnabled: () => true,
  aiCloudAllowedFor: () => true,
  AI_FEATURES_OFF_MESSAGE: 'off',
  AI_CLOUD_FEATURE_OFF_MESSAGE: 'cloud off',
}));

import { assistMediaStudy, mediaStudyAssistantCacheKey, resetMediaStudyAssistantCacheForTests } from '../mediaStudyAssistant';

const full = JSON.stringify({
  summary: 'A greeting.',
  translation: 'Good morning.',
  simplifiedJapanese: '',
  grammar: [{ pattern: 'ございます', explanation: 'polite', level: 'N4' }],
  vocabulary: [],
  examples: [],
  notes: [],
});
const empty = JSON.stringify({
  summary: '', translation: '', simplifiedJapanese: '', grammar: [], vocabulary: [], examples: [], notes: [],
});
const noGrammar = JSON.stringify({
  summary: 'A greeting.', translation: 'Good morning.', simplifiedJapanese: '', grammar: [], vocabulary: [], examples: [], notes: [],
});

const deps = (call: ReturnType<typeof vi.fn>) => ({
  call: call as never,
  provider: () => ({ providerId: 'gemini-2.5-flash' as const, apiKey: 'k' }),
  enabled: () => true,
});
const req = { mode: 'explain-grammar', text: 'おはようございます', context: 'Episode 1' };

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'media-assistant-'));
  resetMediaStudyAssistantCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('media study assistant cache', () => {
  it('caches a complete answer and answers the repeat from it', async () => {
    const call = vi.fn(async () => full);
    expect((await assistMediaStudy(req, deps(call))).cached).toBe(false);
    expect((await assistMediaStudy(req, deps(call))).cached).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('refresh bypasses the cache', async () => {
    const call = vi.fn(async () => full);
    await assistMediaStudy(req, deps(call));
    const again = await assistMediaStudy({ ...req, refresh: true }, deps(call));
    expect(again.cached).toBe(false);
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('an empty answer is an error, an incomplete one is shown but never cached', async () => {
    const call = vi.fn(async () => empty);
    expect(await assistMediaStudy(req, deps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue(noGrammar);
    expect(await assistMediaStudy(req, deps(call))).toMatchObject({ ok: true, partial: true });
    expect((await assistMediaStudy(req, deps(call))).cached).toBe(false);
    expect(call).toHaveBeenCalledTimes(3);
  });

  it('bad JSON is a coded error and is not cached', async () => {
    const call = vi.fn(async () => 'Sure! {broken');
    expect(await assistMediaStudy(req, deps(call))).toMatchObject({ ok: false, code: 'invalid' });
    call.mockResolvedValue('```json\n' + full + '\n```');
    expect(await assistMediaStudy(req, deps(call))).toMatchObject({ ok: true, cached: false });
  });

  it('keys on the model', () => {
    const normalized = { mode: 'explain-grammar' as const, text: 'x', context: '', jlptLevel: null };
    expect(mediaStudyAssistantCacheKey(normalized, 'gemini-2.5-flash'))
      .not.toBe(mediaStudyAssistantCacheKey(normalized, 'deepseek-v4-pro'));
  });

  it('keeps the store bounded', async () => {
    const call = vi.fn(async () => full);
    for (let i = 0; i < 405; i += 1) await assistMediaStudy({ ...req, text: `行${i}` }, deps(call));
    const file = JSON.parse(fs.readFileSync(path.join(shared.userData, 'mining', 'media-study-assistant-cache.json'), 'utf8'));
    expect(Object.keys(file.entries).length).toBeLessThanOrEqual(400);
  });
});

describe('media study assistant: AI fix C', () => {
  it('keys on the study and answer languages, so a zh or ja-UI answer is never served for another', () => {
    const base = { mode: 'explain-grammar' as const, text: 'x', context: '', jlptLevel: null };
    const ja = mediaStudyAssistantCacheKey({ ...base, studyLang: 'ja', answerLang: 'en' }, 'gemini-2.5-flash');
    expect(mediaStudyAssistantCacheKey({ ...base, studyLang: 'zh', answerLang: 'en' }, 'gemini-2.5-flash')).not.toBe(ja);
    expect(mediaStudyAssistantCacheKey({ ...base, studyLang: 'ja', answerLang: 'ja' }, 'gemini-2.5-flash')).not.toBe(ja);
  });

  it('refuses with a code, before calling, when its cloud opt-in is off', async () => {
    const call = vi.fn(async () => full);
    const result = await assistMediaStudy(req, { ...deps(call), cloudAllowed: () => false });
    expect(result).toMatchObject({ ok: false, code: 'consent' });
    expect(call).not.toHaveBeenCalled();
  });

  it('runs on a keyless local OpenAI-compatible server and passes its feature id', async () => {
    const call = vi.fn(async () => full);
    const result = await assistMediaStudy(req, {
      call: call as never,
      enabled: () => true,
      cloudAllowed: () => true,
      provider: () => ({ providerId: 'openai-compatible' as const, apiKey: '' }),
      configured: (id) => id === 'openai-compatible',
    });
    expect(result).toMatchObject({ ok: true });
    expect((call.mock.calls[0] as unknown[])[4]).toMatchObject({ feature: 'mediaAssistant' });
    // …while a keyed provider with no key still asks for one.
    const missing = await assistMediaStudy(req, {
      call: call as never,
      enabled: () => true,
      cloudAllowed: () => true,
      provider: () => ({ providerId: 'claude-haiku-5-5' as const, apiKey: '' }),
      configured: () => false,
    });
    expect(missing).toMatchObject({ ok: false, needsKey: true, code: 'no-key' });
  });
});