// @vitest-environment node
/**
 * F2 for sentence analysis (Reading Lens, video grammar, extension): "Re-analyze"
 * sends `refresh` and gets a new answer instead of the cached one; the key holds
 * every prompt input (context, learner level); bad replies are coded errors and
 * never cached. The provider is a fake.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userData: '', call: null as null | ReturnType<typeof import('vitest').vi.fn> }));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../mining', () => ({
  getConfiguredAiEngine: () => 'cloud',
  getConfiguredAiProvider: () => ({ providerId: 'gemini-2.5-flash', apiKey: 'k' }),
}));
vi.mock('../aiProviderClient', () => ({
  callAiProvider: (...args: unknown[]) => (h.call as (...a: unknown[]) => unknown)(...args),
}));
vi.mock('../aiFeatureGate', () => ({ aiFeaturesEnabled: () => true, AI_FEATURES_OFF_MESSAGE: 'off' }));

import { analyzeSentence, sentenceAnalysisCacheKey } from '../sentenceAnalysis';

const reply = (en: string) => JSON.stringify({ translations: { en }, annotations: [], nuance: [], pitfalls: [] });

beforeEach(() => {
  h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'sentence-analysis-'));
  fs.mkdirSync(path.join(h.userData, 'mining'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('sentence analysis cache', () => {
  it('answers a repeat from the cache, and Re-analyze (refresh) asks again', async () => {
    const sentence = `猫が好きです${Math.random()}。`;
    h.call = vi.fn(async () => reply('first'));
    const first = await analyzeSentence({ text: sentence, lang: 'ja', explainIn: 'en' });
    expect(first.ok).toBe(true);
    const cached = await analyzeSentence({ text: sentence, lang: 'ja', explainIn: 'en' });
    expect(cached.cached).toBe(true);
    expect(h.call).toHaveBeenCalledTimes(1);

    h.call = vi.fn(async () => reply('second'));
    const fresh = await analyzeSentence({ text: sentence, lang: 'ja', explainIn: 'en', refresh: true });
    expect(fresh.cached).toBeUndefined();
    expect(fresh.result?.translations.en).toBe('second');
    expect(h.call).toHaveBeenCalledTimes(1);
    // And the refreshed answer is what the cache now holds.
    const after = await analyzeSentence({ text: sentence, lang: 'ja', explainIn: 'en' });
    expect(after.result?.translations.en).toBe('second');
  });

  it('keys on context and learner level, not only the sentence', () => {
    const base = sentenceAnalysisCacheKey('猫。', 'ja', 'p', 'f');
    expect(sentenceAnalysisCacheKey('猫。', 'ja', 'p', 'f', 'chapter 1')).not.toBe(base);
    expect(sentenceAnalysisCacheKey('猫。', 'ja', 'p', 'f', '', 'N2')).not.toBe(base);
  });

  it('a malformed reply is an `invalid` code and is not cached', async () => {
    const sentence = `犬が好きです${Math.random()}。`;
    h.call = vi.fn(async () => 'not json');
    const bad = await analyzeSentence({ text: sentence, lang: 'ja' });
    expect(bad).toMatchObject({ ok: false, code: 'invalid' });
    h.call = vi.fn(async () => reply('ok'));
    const good = await analyzeSentence({ text: sentence, lang: 'ja' });
    expect(good.ok).toBe(true);
    expect(good.cached).toBeUndefined();
  });
});
