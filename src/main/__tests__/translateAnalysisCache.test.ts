// @vitest-environment node
/**
 * F1/F2 for the Translate analysis panel, against a fake provider:
 *  - nothing is sent while AI is off or the provider lacks Translate consent;
 *  - bad JSON is an error, never `{}`, and is never cached;
 *  - the cache key holds the SOURCE sentence (two sentences with the same
 *    translation are two analyses), and `refresh` bypasses it;
 *  - a partial analysis is shown but not cached.
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
vi.mock('../translateRouter', () => ({ readTranslateProviderSettings: () => ({ version: 1, pairs: {}, consent: {}, fallbackToLocal: true }) }));
vi.mock('../aiFeatureGate', () => ({ aiFeaturesEnabled: () => true, AI_FEATURES_OFF_MESSAGE: 'off' }));

import { analysisCacheKey, analyzeTranslation, resetTranslateAnalysisCacheForTests } from '../translateAnalysis';

const GOOD = JSON.stringify({ formality: { casual: 'yeah', polite: 'Yes.', businessSafe: 'Certainly.' } });
const req = (over: Record<string, unknown> = {}) => ({
  sourceText: 'はい。',
  translatedText: 'Yes.',
  source: 'ja',
  target: 'en',
  jaParticleTokens: [],
  ...over,
});
const provider = () => ({ providerId: 'gemini-2.5-flash' as const, apiKey: 'k' });

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-analysis-'));
  resetTranslateAnalysisCacheForTests();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('translate analysis gating', () => {
  it('sends nothing while "Use AI features" is off', async () => {
    const call = vi.fn();
    const res = await analyzeTranslation(req(), { call, provider, consented: () => true, enabled: () => false });
    expect(res).toMatchObject({ ok: false, aiOff: true, code: 'ai-off' });
    expect(call).not.toHaveBeenCalled();
  });

  it('sends nothing to a provider without Translate consent', async () => {
    const call = vi.fn();
    const res = await analyzeTranslation(req(), { call, provider, consented: () => false, enabled: () => true });
    expect(res).toMatchObject({ ok: false, needsConsent: true, code: 'consent' });
    expect(call).not.toHaveBeenCalled();
  });

  it('reads consent from the Translate settings by default (none recorded → refused)', async () => {
    const call = vi.fn();
    const res = await analyzeTranslation(req(), { call, provider, enabled: () => true });
    expect(res.needsConsent).toBe(true);
    expect(call).not.toHaveBeenCalled();
  });
});

describe('translate analysis cache', () => {
  const deps = (call: ReturnType<typeof vi.fn>) => ({ call: call as never, provider, consented: () => true, enabled: () => true });

  it('bad JSON is an invalid error, and the next request asks again', async () => {
    const call = vi.fn(async () => 'Sure! Here is the analysis.');
    const first = await analyzeTranslation(req(), deps(call));
    expect(first).toMatchObject({ ok: false, code: 'invalid' });
    expect(first.result).toBeUndefined();
    call.mockResolvedValueOnce(GOOD);
    const second = await analyzeTranslation(req(), deps(call));
    expect(second.ok).toBe(true);
    expect(second.cached).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('caches a complete analysis, keyed on the source sentence too', async () => {
    const call = vi.fn(async () => GOOD);
    await analyzeTranslation(req(), deps(call));
    const hit = await analyzeTranslation(req(), deps(call));
    expect(hit.cached).toBe(true);
    // Same translation, different source sentence: a different analysis.
    const other = await analyzeTranslation(req({ sourceText: 'ええ。' }), deps(call));
    expect(other.cached).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(2);
    expect(analysisCacheKey(req(), 'gemini-2.5-flash')).not.toBe(analysisCacheKey(req({ sourceText: 'ええ。' }), 'gemini-2.5-flash'));
  });

  it('switching the model asks again: the model is part of the key (W1-A)', async () => {
    const call = vi.fn(async () => GOOD);
    let model = 'gpt-5-mini';
    const withModel = { ...deps(call), modelOf: () => model };
    await analyzeTranslation(req(), withModel);
    expect((await analyzeTranslation(req(), withModel)).cached).toBe(true);
    model = 'gpt-5';
    const switched = await analyzeTranslation(req(), withModel);
    expect(switched.cached).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(2);
    // And the first model's answer is still there for it.
    model = 'gpt-5-mini';
    expect((await analyzeTranslation(req(), withModel)).cached).toBe(true);
  });

  it('refresh bypasses the cache', async () => {
    const call = vi.fn(async () => GOOD);
    await analyzeTranslation(req(), deps(call));
    const fresh = await analyzeTranslation(req({ refresh: true }), deps(call));
    expect(fresh.cached).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('a partial analysis is shown but not cached', async () => {
    // Particle notes for one of two particles, and no formality.
    const call = vi.fn(async () => JSON.stringify({ particleNotes: ['topic'] }));
    const partial = await analyzeTranslation(req({ jaParticleTokens: ['は', 'が'] }), deps(call));
    expect(partial).toMatchObject({ ok: true, partial: true });
    const again = await analyzeTranslation(req({ jaParticleTokens: ['は', 'が'] }), deps(call));
    expect(again.cached).toBeUndefined();
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('a provider error is a code, never cached', async () => {
    const call = vi.fn(async () => {
      throw Object.assign(new Error('AI request timed out after 45s'), { code: 'timeout' });
    });
    const res = await analyzeTranslation(req(), deps(call));
    expect(res).toMatchObject({ ok: false, code: 'timeout' });
  });
});
