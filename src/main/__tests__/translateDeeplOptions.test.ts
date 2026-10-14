// @vitest-environment node
/**
 * DeepL's formality and context (W1-A): stored by main, sent with every DeepL request, part of the
 * cached answer's key — and absent from the request when left at their defaults, so a DeepL
 * translation without them is byte-for-byte what it always was. `fetch` is injected; nothing here
 * reaches the network.
 *
 * Also here, because it is the same cache: the default offline model's file is part of the
 * workbench cache key, so a newly installed small model is not served the old one's answers.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readDeeplOptions,
  registerTranslateProviderIpc,
  resetTranslateProviderSettingsCache,
  routeTranslation,
} from '../translateRouter';
import { defaultTranslateProviderSettings, withTranslateConsent } from '../../shared/translateProviders';
import { TranslateResultCache } from '../../shared/translateCache';
import {
  DEEPL_CONTEXT_MAX_CHARS,
  deeplRequestFields,
  normalizeDeeplOptions,
  type DeeplOptions,
} from '../../shared/translateDeeplOptions';

const shared = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  userData: '',
}));

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

const settings = () => withTranslateConsent(defaultTranslateProviderSettings(), 'deepl', true, 1);

function deeplFetch() {
  return vi.fn(async (_url: string, _init: RequestInit) => new Response(
    JSON.stringify({ translations: [{ text: 'I like cats.' }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  ));
}

function sentBody(fetchImpl: ReturnType<typeof deeplFetch>, call = 0): Record<string, unknown> {
  const [, init] = fetchImpl.mock.calls[call] as unknown as [string, RequestInit];
  return JSON.parse(String(init.body)) as Record<string, unknown>;
}

async function viaDeepl(fetchImpl: ReturnType<typeof deeplFetch>, options?: DeeplOptions, cache?: TranslateResultCache) {
  return routeTranslation(
    { text: '猫が好き。', source: 'ja', target: 'en', provider: 'deepl' },
    {
      local: vi.fn(),
      fetchImpl: fetchImpl as unknown as typeof fetch,
      readDeeplKey: () => 'k:fx',
      spendAllows: () => true,
      settings,
      unpaced: true,
      ...(options ? { deeplOptions: () => options } : {}),
      ...(cache ? { cache } : {}),
    },
  );
}

beforeEach(() => {
  shared.userData = fs.mkdtempSync(path.join(os.tmpdir(), 'xlate-deepl-opts-'));
  resetTranslateProviderSettingsCache();
  shared.handlers.clear();
});

afterEach(() => {
  fs.rmSync(shared.userData, { recursive: true, force: true });
});

describe('normalizeDeeplOptions', () => {
  it('keeps the three formalities and a bounded, trimmed context', () => {
    expect(normalizeDeeplOptions(null)).toEqual({ formality: 'default', context: '' });
    expect(normalizeDeeplOptions({ formality: 'more', context: '  School anime.\r\n ' })).toEqual({ formality: 'more', context: 'School anime.' });
    expect(normalizeDeeplOptions({ formality: 'prefer_more' }).formality).toBe('default');
    expect(normalizeDeeplOptions({ context: 'x'.repeat(5000) }).context).toHaveLength(DEEPL_CONTEXT_MAX_CHARS);
  });

  it('asks DeepL for the prefer_ variants, which never fail on a language without formality', () => {
    expect(deeplRequestFields({ formality: 'default', context: '' })).toEqual({});
    expect(deeplRequestFields({ formality: 'more', context: '' })).toEqual({ formality: 'prefer_more' });
    expect(deeplRequestFields({ formality: 'less', context: 'Recipe.' })).toEqual({ formality: 'prefer_less', context: 'Recipe.' });
  });
});

describe('the DeepL request', () => {
  it('sends neither option at their defaults', async () => {
    const fetchImpl = deeplFetch();
    await viaDeepl(fetchImpl);
    expect(sentBody(fetchImpl)).not.toHaveProperty('formality');
    expect(sentBody(fetchImpl)).not.toHaveProperty('context');
  });

  it('sends the stored formality and context', async () => {
    const fetchImpl = deeplFetch();
    await viaDeepl(fetchImpl, { formality: 'more', context: 'Dialogue between coworkers.' });
    expect(sentBody(fetchImpl)).toMatchObject({ formality: 'prefer_more', context: 'Dialogue between coworkers.' });
  });

  it('reads what the IPC stored, from disk, at send time', async () => {
    registerTranslateProviderIpc();
    const set = shared.handlers.get('translate:setDeeplOptions')!;
    expect(set({}, { formality: 'less', context: 'Casual chat.' })).toEqual({ formality: 'less', context: 'Casual chat.' });
    const onDisk = JSON.parse(fs.readFileSync(path.join(shared.userData, 'translate', 'deepl-options.json'), 'utf8'));
    expect(onDisk).toEqual({ formality: 'less', context: 'Casual chat.' });
    resetTranslateProviderSettingsCache();
    expect(shared.handlers.get('translate:deeplOptions')!({})).toEqual({ formality: 'less', context: 'Casual chat.' });
    expect(readDeeplOptions().formality).toBe('less');
    const fetchImpl = deeplFetch();
    await viaDeepl(fetchImpl);
    expect(sentBody(fetchImpl)).toMatchObject({ formality: 'prefer_less', context: 'Casual chat.' });
    // A renderer cannot store anything but the normalised shape.
    expect(set({}, { formality: 'loud', context: 42, extra: true })).toEqual({ formality: 'default', context: '' });
  });

  it('a different formality is a different cached answer', async () => {
    const cache = new TranslateResultCache();
    const fetchImpl = deeplFetch();
    await viaDeepl(fetchImpl, { formality: 'more', context: '' }, cache);
    expect((await viaDeepl(fetchImpl, { formality: 'more', context: '' }, cache)).meta.cached).toBe(true);
    expect((await viaDeepl(fetchImpl, { formality: 'less', context: '' }, cache)).meta.cached).toBeUndefined();
    expect((await viaDeepl(fetchImpl, { formality: 'less', context: 'Recipe.' }, cache)).meta.cached).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});

describe('the default offline model in the workbench cache key', () => {
  it('a different small model file is not served the old one\'s answer', async () => {
    const cache = new TranslateResultCache();
    let small = 'Qwen3-1.7B-Q8_0.gguf';
    const local = vi.fn(async (args: { text: string }) => ({ text: 'I like cats.', segments: [{ source: args.text, target: 'I like cats.' }] }));
    const run = () => routeTranslation(
      { text: '猫が好き。', source: 'ja', target: 'en' },
      { local, cache, smallModel: () => small, settings: defaultTranslateProviderSettings },
    );
    await run();
    expect((await run()).meta.cached).toBe(true);
    small = 'Qwen3-1.7B-Q4_K_M.gguf';
    expect((await run()).meta.cached).toBeUndefined();
    expect(local).toHaveBeenCalledTimes(2);
  });
});
