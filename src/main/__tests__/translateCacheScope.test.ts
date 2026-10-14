// @vitest-environment node
/**
 * F2 (EPUB): the shared disk translation cache used one key for every engine,
 * so a cloud provider's batch answer was later served as the offline model's
 * (and vice versa). Cloud entries now live under their provider. Since W1-A the
 * offline entries live under their model FILE as well, and the whole cache is
 * bounded, least recently used first. The cloud runtime is a fake.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ userData: '', calls: 0 }));

vi.mock('electron', () => ({
  app: { getPath: () => h.userData },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: () => undefined },
}));
vi.mock('../llamaHost', () => ({
  isLlamaSessionLost: () => false,
  acquireLlamaSession: async () => {
    throw new Error('the offline model must not be reached');
  },
}));
vi.mock('../providerRuntime', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../providerRuntime')>();
  return {
    ...actual,
    runCloudAiRequest: async (req: { prompt: string }) => {
      h.calls += 1;
      const ids = [...req.prompt.matchAll(/^\[([^\]]+)\]/gm)].map((m) => m[1]);
      return { text: JSON.stringify(ids.map((id) => ({ id, text: `cloud ${h.calls}` }))) };
    },
  };
});

h.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-cache-scope-'));

import crypto from 'node:crypto';
import {
  MAX_TRANSLATION_CACHE_ENTRIES,
  flushTranslationCache,
  getCachedTranslation,
  resetTranslationCacheForTests,
  setCachedTranslation,
  translationCacheKey,
} from '../translate';
import { runApiTranslationBatch } from '../translateApi';

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('translation cache scope', () => {
  it('scopes the offline key by its model file (W1-A)', () => {
    const small = translationCacheKey('猫', 'ja', 'en', 'local', 'local:qwen3-1.7b.gguf:1223');
    expect(translationCacheKey('猫', 'ja', 'en', 'local', 'local:qwen3-1.7b.gguf:1223')).toBe(small);
    // Another model, or another quantisation under the same name, is another answer.
    expect(translationCacheKey('猫', 'ja', 'en', 'local', 'local:qwen3-4b.gguf:2500')).not.toBe(small);
    expect(translationCacheKey('猫', 'ja', 'en', 'local', 'local:qwen3-1.7b.gguf:2000')).not.toBe(small);
    // And no longer the pre-model key, which any installed model used to share.
    const legacy = crypto.createHash('sha256').update('ja\0en\0猫').digest('hex').slice(0, 24);
    expect(small).not.toBe(legacy);
  });

  it('keeps at most MAX_TRANSLATION_CACHE_ENTRIES, evicting the least recently used', () => {
    resetTranslationCacheForTests();
    const tag = Math.random().toString(36).slice(2);
    setCachedTranslation(`keep-${tag}`, 'ja', 'en', 'kept');
    setCachedTranslation(`drop-${tag}`, 'ja', 'en', 'dropped');
    // Reading the first makes it recent again; the second is now the oldest.
    expect(getCachedTranslation(`keep-${tag}`, 'ja', 'en')).toBe('kept');
    for (let i = 0; i < MAX_TRANSLATION_CACHE_ENTRIES - 1; i++) {
      setCachedTranslation(`fill-${tag}-${i}`, 'ja', 'en', 'x', 'gemini-2.5-flash');
    }
    expect(getCachedTranslation(`drop-${tag}`, 'ja', 'en')).toBeUndefined();
    expect(getCachedTranslation(`keep-${tag}`, 'ja', 'en')).toBe('kept');
    flushTranslationCache();
    const onDisk = JSON.parse(fs.readFileSync(path.join(h.userData, 'mining', 'translation-cache.json'), 'utf8'));
    expect(Object.keys(onDisk.entries).length).toBeLessThanOrEqual(MAX_TRANSLATION_CACHE_ENTRIES);
    // A file over the bound (written before it existed) is trimmed when it is read.
    const big: Record<string, string> = {};
    for (let i = 0; i < MAX_TRANSLATION_CACHE_ENTRIES + 50; i++) big[`k${i}`] = 'v';
    fs.writeFileSync(path.join(h.userData, 'mining', 'translation-cache.json'), JSON.stringify({ entries: big }));
    resetTranslationCacheForTests();
    getCachedTranslation('anything', 'ja', 'en');
    flushTranslationCache();
    const trimmed = JSON.parse(fs.readFileSync(path.join(h.userData, 'mining', 'translation-cache.json'), 'utf8'));
    expect(Object.keys(trimmed.entries)).toHaveLength(MAX_TRANSLATION_CACHE_ENTRIES);
    expect(trimmed.entries.k0).toBeUndefined();
    resetTranslationCacheForTests();
  });

  it('gives each cloud provider its own scope, apart from the offline one', () => {
    const local = translationCacheKey('猫', 'ja', 'en');
    expect(translationCacheKey('猫', 'ja', 'en', 'local')).toBe(local);
    expect(translationCacheKey('猫', 'ja', 'en', 'gemini-2.5-flash')).not.toBe(local);
    expect(translationCacheKey('猫', 'ja', 'en', 'gemini-2.5-flash'))
      .not.toBe(translationCacheKey('猫', 'ja', 'en', 'deepseek-v4-pro'));
  });

  it('a cloud batch neither reads nor writes the offline entry', async () => {
    const text = `猫が鳴いた${Math.random()}`;
    setCachedTranslation(text, 'ja', 'en', 'The cat meowed (offline).');
    const item = { id: 'a', text, source: 'ja', target: 'en' };
    const first = await runApiTranslationBatch([item], 'gemini-2.5-flash', 'k');
    expect(h.calls).toBe(1);
    expect(first[0].text).toBe('cloud 1');
    // The offline entry is still the offline model's own answer.
    expect(getCachedTranslation(text, 'ja', 'en')).toBe('The cat meowed (offline).');
    expect(getCachedTranslation(text, 'ja', 'en', 'gemini-2.5-flash')).toBe('cloud 1');

    // The same provider hits its own entry …
    await runApiTranslationBatch([item], 'gemini-2.5-flash', 'k');
    expect(h.calls).toBe(1);
    // … `fresh` busts it …
    const fresh = await runApiTranslationBatch([item], 'gemini-2.5-flash', 'k', { fresh: true });
    expect(h.calls).toBe(2);
    expect(fresh[0].text).toBe('cloud 2');
    // … and another provider does not inherit it.
    await runApiTranslationBatch([item], 'deepseek-v4-pro', 'k');
    expect(h.calls).toBe(3);
  });
});
