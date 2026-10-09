// @vitest-environment node
/**
 * The translation router: local by default, cloud only with consent, offline
 * fallback on failure, progressive segments, glossary handling — with every
 * engine faked. No test here makes a network call or loads a model: `fetch` and
 * the cloud runtime are injected and asserted on.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TranslateRouteError,
  registerTranslateProviderIpc,
  resetTranslateProviderSettingsCache,
  resolveLargeTranslateModelFile,
  routeTranslation,
} from '../translateRouter';
import { defaultTranslateProviderSettings, withTranslateConsent } from '../../shared/translateProviders';

const shared = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  userData: '',
}));
const handlers = shared.handlers;

function handler(channel: string): (...args: unknown[]) => unknown {
  const fn = handlers.get(channel);
  if (!fn) throw new Error(`no handler for ${channel}`);
  return fn;
}

vi.mock('electron', () => ({
  app: { getPath: () => shared.userData },
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { handle: (channel: string, fn: (...args: unknown[]) => unknown) => shared.handlers.set(channel, fn) },
}));
vi.mock('../credentials/vault', () => ({ readSecret: () => '' }));
vi.mock('../localModelFiles', () => ({
  listLocalModelFiles: () => [],
  resolveQwenSmallModelPath: () => null,
}));

type Settings = ReturnType<typeof defaultTranslateProviderSettings>;

function settingsWith(consent: string[] = [], pairs: Record<string, string> = {}, fallbackToLocal = true): Settings {
  let s = defaultTranslateProviderSettings();
  for (const id of consent) s = withTranslateConsent(s, id as never, true, 1);
  return { ...s, pairs: pairs as Settings['pairs'], fallbackToLocal };
}

function fakeLocal(prefix = 'LOCAL') {
  return vi.fn(async (args: { text: string; modelFileName?: string; onSegment?: (i: number, s: { source: string; target: string }, n: number) => void }) => {
    const target = `${prefix}${args.modelFileName ? `(${args.modelFileName})` : ''}: I like cats.`;
    args.onSegment?.(0, { source: args.text, target }, 1);
    return { text: target, segments: [{ source: args.text, target }] };
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-router-'));
  resetTranslateProviderSettingsCache();
  handlers.clear();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('local is the default', () => {
  it('translates offline when the pair has no saved engine, and never touches the network', async () => {
    const local = fakeLocal();
    const fetchImpl = vi.fn();
    const runCloud = vi.fn();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'pair' },
      { local, fetchImpl, runCloud, settings: () => settingsWith(), unpaced: true },
    );
    expect(result.meta).toEqual({ provider: 'local' });
    expect(local).toHaveBeenCalledTimes(1);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runCloud).not.toHaveBeenCalled();
  });

  it('a request that names no engine (every surface but the workbench) stays offline even when the pair uses a cloud engine', async () => {
    const local = fakeLocal();
    const fetchImpl = vi.fn();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en' },
      {
        local, fetchImpl, readDeeplKey: () => 'k', spendAllows: () => true,
        settings: () => settingsWith(['deepl'], { 'ja>en': 'deepl' }), unpaced: true,
      },
    );
    expect(result.meta).toEqual({ provider: 'local' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('consent gate', () => {
  it('never sends text to a cloud provider the user has not allowed — falls back offline instead', async () => {
    const local = fakeLocal();
    const fetchImpl = vi.fn();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'deepl' },
      { local, fetchImpl, readDeeplKey: () => 'key:fx', settings: () => settingsWith(), unpaced: true, localAvailable: () => true },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.meta).toMatchObject({ provider: 'local', fallbackFrom: 'deepl', fallbackCode: 'consent' });
  });

  it('refuses outright, still without a request, when the offline fallback is off', async () => {
    const fetchImpl = vi.fn();
    const runCloud = vi.fn();
    await expect(routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      { local: fakeLocal(), fetchImpl, runCloud, cloudConfigured: () => true, settings: () => settingsWith([], {}, false), unpaced: true },
    )).rejects.toMatchObject({ code: 'consent', provider: 'gemini-2.5-flash' });
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(runCloud).not.toHaveBeenCalled();
  });

  it('consent for one provider is not consent for another', async () => {
    const runCloud = vi.fn();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'deepseek-v4-pro' },
      { local: fakeLocal(), runCloud, cloudConfigured: () => true, settings: () => settingsWith(['deepl']), unpaced: true, localAvailable: () => true },
    );
    expect(runCloud).not.toHaveBeenCalled();
    expect(result.meta.fallbackCode).toBe('consent');
  });
});

describe('DeepL', () => {
  it('sends the passage (one sentence per line) to the Free endpoint for a :fx key and keeps the alignment', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ translations: [{ text: 'I like cats.\nI like dogs.' }] }));
    const segments: Array<[number, string]> = [];
    const result = await routeTranslation(
      {
        text: '猫が好き。犬が好き。',
        source: 'ja',
        target: 'en',
        provider: 'pair',
        onSegment: (index, segment) => segments.push([index, segment.target]),
      },
      {
        local: fakeLocal(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        readDeeplKey: () => 'secret:fx',
        spendAllows: () => true,
        settings: () => settingsWith(['deepl'], { 'ja>en': 'deepl' }),
        unpaced: true,
      },
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api-free.deepl.com/v2/translate');
    expect((init.headers as Record<string, string>).Authorization).toBe('DeepL-Auth-Key secret:fx');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ text: ['猫が好き。\n犬が好き。'], source_lang: 'JA', target_lang: 'EN-US' });
    expect(body.tag_handling).toBeUndefined();
    expect(result.segments).toEqual([
      { source: '猫が好き。', target: 'I like cats.' },
      { source: '犬が好き。', target: 'I like dogs.' },
    ]);
    expect(result.text).toBe('I like cats. I like dogs.');
    expect(result.meta).toEqual({ provider: 'deepl' });
    expect(segments).toEqual([[0, 'I like cats.'], [1, 'I like dogs.']]);
  });

  it('protects glossary terms in an ignored tag, sends only the terms in the passage, and reports coverage', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ translations: [{ text: 'My <x>senpai</x> likes cats.' }] }));
    const result = await routeTranslation(
      {
        text: '先輩は猫が好き。',
        source: 'ja',
        target: 'en',
        provider: 'deepl',
        glossary: [{ source: '先輩', target: 'senpai' }, { source: '東京', target: 'Tokyo' }],
      },
      {
        local: fakeLocal(),
        fetchImpl: fetchImpl as unknown as typeof fetch,
        readDeeplKey: () => 'pro-key',
        spendAllows: () => true,
        settings: () => settingsWith(['deepl']),
        unpaced: true,
      },
    );
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.deepl.com/v2/translate');
    const sent = String(init.body);
    expect(sent).toContain('<x>senpai</x>');
    expect(sent).not.toContain('Tokyo');
    expect(JSON.parse(sent)).toMatchObject({ tag_handling: 'xml', ignore_tags: ['x'] });
    expect(result.text).toBe('My senpai likes cats.');
    expect(result.meta.glossary).toEqual({ applied: ['先輩'], missing: [] });
  });

  it('falls back offline on a rate limit and says why', async () => {
    const fetchImpl = vi.fn(async () => new Response('', { status: 429 }));
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'deepl' },
      {
        local: fakeLocal(), fetchImpl: fetchImpl as unknown as typeof fetch, readDeeplKey: () => 'k',
        spendAllows: () => true, settings: () => settingsWith(['deepl']), unpaced: true, localAvailable: () => true,
      },
    );
    expect(result.meta).toMatchObject({ provider: 'local', fallbackFrom: 'deepl', fallbackCode: 'rate-limit' });
    expect(result.text).toContain('LOCAL');
  });

  it('asks the monthly spending ceiling before sending, and sends nothing when it refuses', async () => {
    const fetchImpl = vi.fn();
    const spendAllows = vi.fn(() => false);
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'deepl' },
      {
        local: fakeLocal(), fetchImpl, readDeeplKey: () => 'pro-key', spendAllows,
        settings: () => settingsWith(['deepl']), unpaced: true, localAvailable: () => true,
      },
    );
    expect(spendAllows).toHaveBeenCalledWith(expect.any(Number));
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.meta.fallbackCode).toBe('spend');
  });

  it('a pair DeepL does not take is reported as unsupported, not attempted', async () => {
    const fetchImpl = vi.fn();
    const result = await routeTranslation(
      { text: 'Bonjour.', source: 'xx', target: 'en', provider: 'deepl' },
      {
        local: fakeLocal(), fetchImpl, readDeeplKey: () => 'k', settings: () => settingsWith(['deepl']),
        unpaced: true, localAvailable: () => true,
      },
    );
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(result.meta.fallbackCode).toBe('unsupported');
  });
});

describe('cloud LLMs', () => {
  it('streams: each sentence is reported as its line arrives, before the request resolves', async () => {
    const order: string[] = [];
    const runCloud = vi.fn(async (request: { prompt: string; onTextChunk?: (c: string) => void }) => {
      expect(request.prompt).toContain('[1] 猫が好き。');
      expect(request.prompt).toContain('[2] 犬が好き。');
      request.onTextChunk?.('[1] I like ca');
      order.push('chunk1');
      request.onTextChunk?.('ts.\n[2] I like dogs.');
      order.push('chunk2');
      return { text: '[1] I like cats.\n[2] I like dogs.' };
    });
    const result = await routeTranslation(
      {
        text: '猫が好き。犬が好き。',
        source: 'ja',
        target: 'en',
        provider: 'pair',
        onSegment: (index) => order.push(`segment${index}`),
      },
      {
        local: fakeLocal(),
        runCloud: runCloud as never,
        cloudConfigured: () => true,
        settings: () => settingsWith(['gemini-2.5-flash'], { 'ja>en': 'gemini-2.5-flash' }),
        unpaced: true,
      },
    );
    expect(order).toEqual(['chunk1', 'segment0', 'chunk2', 'segment1']);
    expect(result.meta).toEqual({ provider: 'gemini-2.5-flash' });
    expect(result.text).toBe('I like cats. I like dogs.');
  });

  it('carries the glossary as a prompt constraint and post-edits a term the model left untranslated', async () => {
    const runCloud = vi.fn(async (request: { prompt: string }) => {
      expect(request.prompt).toContain('先輩 -> senpai');
      return { text: '[1] My 先輩 likes cats.' };
    });
    const result = await routeTranslation(
      { text: '先輩は猫が好き。', source: 'ja', target: 'en', provider: 'deepseek-v4-flash', glossary: [{ source: '先輩', target: 'senpai' }] },
      { local: fakeLocal(), runCloud: runCloud as never, cloudConfigured: () => true, settings: () => settingsWith(['deepseek-v4-flash']), unpaced: true },
    );
    // A kanji term the model left in the English is replaced by its glossary rendering.
    expect(result.text).toBe('My senpai likes cats.');
    expect(result.meta.glossary).toEqual({ applied: ['先輩'], missing: [] });
  });

  it('a provider with no key is skipped without a request', async () => {
    const runCloud = vi.fn();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      { local: fakeLocal(), runCloud, cloudConfigured: () => false, settings: () => settingsWith(['gemini-2.5-flash']), unpaced: true, localAvailable: () => true },
    );
    expect(runCloud).not.toHaveBeenCalled();
    expect(result.meta.fallbackCode).toBe('no-key');
  });

  it('a reply with no usable line is invalid, and falls back', async () => {
    const runCloud = vi.fn(async () => ({ text: 'Sure! Here is the translation.' }));
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      { local: fakeLocal(), runCloud: runCloud as never, cloudConfigured: () => true, settings: () => settingsWith(['gemini-2.5-flash']), unpaced: true, localAvailable: () => true },
    );
    expect(result.meta.fallbackCode).toBe('invalid');
  });

  it('throws a typed error when neither the provider nor the offline model can answer', async () => {
    const runCloud = vi.fn(async () => {
      throw new Error('boom');
    });
    await expect(routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'gemini-2.5-flash' },
      { local: fakeLocal(), runCloud: runCloud as never, cloudConfigured: () => true, settings: () => settingsWith(['gemini-2.5-flash']), unpaced: true, localAvailable: () => false },
    )).rejects.toBeInstanceOf(TranslateRouteError);
  });
});

describe('the higher-quality local tier', () => {
  it('runs the installed larger model', async () => {
    const local = fakeLocal();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'local-large' },
      { local, largeModel: () => 'Qwen3-8B.gguf', settings: () => settingsWith(), unpaced: true },
    );
    expect(local.mock.calls[0][0].modelFileName).toBe('Qwen3-8B.gguf');
    expect(result.meta).toEqual({ provider: 'local-large' });
  });

  it('falls back to the small model when no larger one is installed', async () => {
    const local = fakeLocal();
    const result = await routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en', provider: 'local-large' },
      { local, largeModel: () => null, settings: () => settingsWith(), unpaced: true, localAvailable: () => true },
    );
    expect(local.mock.calls[0][0].modelFileName).toBeUndefined();
    expect(result.meta).toEqual({ provider: 'local', fallbackFrom: 'local-large', fallbackCode: 'not-installed' });
  });

  it('only picks models the catalog names, preferring 8B', () => {
    expect(resolveLargeTranslateModelFile(['Qwen3-14B.gguf', 'Qwen3-8B.gguf'])).toBe('Qwen3-8B.gguf');
    expect(resolveLargeTranslateModelFile(['qwen3-32b.gguf'])).toBe('qwen3-32b.gguf');
    expect(resolveLargeTranslateModelFile(['Qwen3-1.7B-Q8_0.gguf', 'Llama-70B.gguf'])).toBeNull();
  });
});

describe('IPC: choice and consent are main\'s to enforce', () => {
  it('refuses to save a cloud engine for a pair before consent; saves it after; revoking returns the pair to offline', async () => {
    registerTranslateProviderIpc();
    const setPair = handler('translate:setPairProvider');
    const setConsent = handler('translate:setProviderConsent');

    let snap = setPair({}, 'ja', 'en', 'deepl') as { settings: { pairs: Record<string, string>; consent: Record<string, number> } };
    expect(snap.settings.pairs['ja>en']).toBeUndefined();

    setConsent({}, 'deepl', true);
    snap = setPair({}, 'ja', 'en', 'deepl') as typeof snap;
    expect(snap.settings.pairs['ja>en']).toBe('deepl');
    expect(typeof snap.settings.consent.deepl).toBe('number');

    // Persisted to disk, not only in memory.
    resetTranslateProviderSettingsCache();
    const onDisk = JSON.parse(fs.readFileSync(path.join(shared.userData, 'translate', 'providers.json'), 'utf8'));
    expect(onDisk.pairs['ja>en']).toBe('deepl');

    snap = setConsent({}, 'deepl', false) as typeof snap;
    expect(snap.settings.pairs['ja>en']).toBeUndefined();
    expect(snap.settings.consent.deepl).toBeUndefined();
  });

  it('reports every engine, with no key and no model as not ready', () => {
    registerTranslateProviderIpc();
    const snap = handler('translate:providers')() as { providers: Array<{ id: string; ready: boolean; reason?: string }> };
    expect(snap.providers.map((p) => p.id)).toEqual([
      'local', 'local-large', 'deepl', 'gemini-2.5-flash', 'deepseek-v4-flash', 'deepseek-v4-pro',
    ]);
    expect(snap.providers.find((p) => p.id === 'local')).toMatchObject({ ready: false, reason: 'not-installed' });
    expect(snap.providers.find((p) => p.id === 'deepl')).toMatchObject({ ready: false, reason: 'no-key' });
  });
});
