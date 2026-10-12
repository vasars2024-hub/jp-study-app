// @vitest-environment node
/**
 * F2: a cloud answer that skipped sentences is never shown or cached as a
 * complete translation. The skipped ones are asked for once more; whatever is
 * still missing is reported in `meta.partial` and the result is not cached.
 * Every engine is faked — no network, no model.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetTranslateProviderSettingsCache, routeTranslation } from '../translateRouter';
import { defaultTranslateProviderSettings, withTranslateConsent } from '../../shared/translateProviders';
import { TranslateResultCache } from '../../shared/translateCache';

const shared = vi.hoisted(() => ({ userData: '' }));

vi.mock('electron', () => ({
  app: { getPath: () => shared.userData },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../credentials/vault', () => ({ readSecret: () => '' }));
vi.mock('../localModelFiles', () => ({
  listLocalModelFiles: () => [],
  resolveQwenSmallModelPath: () => null,
}));

const PASSAGE = '猫が好き。犬が好き。鳥が好き。';

function settings() {
  return withTranslateConsent(defaultTranslateProviderSettings(), 'gemini-2.5-flash', true, 1);
}

function baseDeps(runCloud: unknown, cache: TranslateResultCache) {
  return {
    local: vi.fn(),
    runCloud: runCloud as never,
    cloudConfigured: () => true,
    settings,
    unpaced: true,
    localAvailable: () => false,
    cache,
  };
}

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-partial-'));
  resetTranslateProviderSettingsCache();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('a cloud answer missing sentences', () => {
  it('re-asks only the missing sentences, without the session cache, and then caches the complete result', async () => {
    const prompts: Array<{ prompt: string; cache?: string }> = [];
    const runCloud = vi.fn(async (req: { prompt: string; cache?: string }) => {
      prompts.push({ prompt: req.prompt, cache: req.cache });
      if (prompts.length === 1) return { text: '[1] I like cats.\n[3] I like birds.' };
      return { text: '[1] I like dogs.' };
    });
    const cache = new TranslateResultCache();
    const result = await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      baseDeps(runCloud, cache),
    );
    expect(runCloud).toHaveBeenCalledTimes(2);
    // The retry carries only the skipped sentence, renumbered.
    expect(prompts[1].prompt).toContain('[1] 犬が好き。');
    expect(prompts[1].prompt).not.toContain('猫が好き');
    expect(prompts[1].cache).toBe('off');
    expect(result.segments.map((s) => s.target)).toEqual(['I like cats.', 'I like dogs.', 'I like birds.']);
    expect(result.meta.partial).toBeUndefined();

    // Complete, so the next identical request is answered from the cache.
    const again = await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      baseDeps(runCloud, cache),
    );
    expect(again.meta.cached).toBe(true);
    expect(runCloud).toHaveBeenCalledTimes(2);
  });

  it('marks a still-incomplete answer partial and never caches it', async () => {
    const runCloud = vi.fn(async (req: { prompt: string }) => (
      req.prompt.includes('[3]') ? { text: '[1] I like cats.\n[3] I like birds.' } : { text: '' }
    ));
    const cache = new TranslateResultCache();
    const result = await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      baseDeps(runCloud, cache),
    );
    expect(result.meta.partial).toEqual({ missing: [1], total: 3 });
    expect(result.segments[1].target).toBe('');
    expect(result.text).toBe('I like cats. I like birds.');

    // Not cached: the same request goes to the provider again.
    const again = await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      baseDeps(runCloud, cache),
    );
    expect(again.meta.cached).toBeUndefined();
    expect(runCloud.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('keeps the first answer, marked partial, when the retry itself fails', async () => {
    let n = 0;
    const runCloud = vi.fn(async () => {
      n += 1;
      if (n === 1) return { text: '[1] I like cats.\n[2] I like dogs.' };
      throw new Error('upstream');
    });
    const result = await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      baseDeps(runCloud, new TranslateResultCache()),
    );
    expect(result.meta.provider).toBe('gemini-2.5-flash');
    expect(result.meta.partial).toEqual({ missing: [2], total: 3 });
  });

  it('a "translate again" request skips the runtime session cache', async () => {
    const runCloud = vi.fn(async (req: { cache?: string }) => {
      expect(req.cache).toBe('off');
      return { text: '[1] I like cats.\n[2] I like dogs.\n[3] I like birds.' };
    });
    await routeTranslation(
      { text: PASSAGE, source: 'ja', target: 'en', provider: 'gemini-2.5-flash', fresh: true },
      baseDeps(runCloud, new TranslateResultCache()),
    );
    expect(runCloud).toHaveBeenCalledTimes(1);
  });
});
