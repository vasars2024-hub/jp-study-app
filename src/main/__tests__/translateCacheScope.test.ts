// @vitest-environment node
/**
 * F2 (EPUB): the shared disk translation cache used one key for every engine,
 * so a cloud provider's batch answer was later served as the offline model's
 * (and vice versa). Cloud entries now live under their provider; the offline
 * key is unchanged so its existing cache still hits. The cloud runtime is a fake.
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

import { getCachedTranslation, setCachedTranslation, translationCacheKey } from '../translate';
import { runApiTranslationBatch } from '../translateApi';

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('translation cache scope', () => {
  it('keeps the offline key as it was, and gives each cloud provider its own', () => {
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
