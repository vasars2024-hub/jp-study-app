// @vitest-environment node
/**
 * AI Card Studio's two IPC entry points (`ai:enrichCard`, `ai:generateDeck`),
 * driven through the real handlers `registerMiningIpc` installs.
 *
 * Audit F4 found three things wrong here:
 *  - R1: `req.providerId` crossed the bridge unvalidated, and an unknown id was
 *    mapped onto Gemini's key and DeepSeek's endpoint;
 *  - the "Use AI features" switch did not gate the OFFLINE engine at all;
 *  - nothing could cancel a run.
 * And errors reached the renderer as English prose. Nothing here touches the
 * network: every fetch is answered by the stub below or refused.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
// vitest hoists the `vi.mock` calls below above these imports.
import { registerMiningIpc } from '../mining';
import { setAiCloudFeatureReader, setAiFeaturesReader } from '../aiFeatureGate';
import { clearAiProviderSessionCache } from '../providerRuntime';
import { en } from '../../shared/i18n/catalogs';
import { AI_PROMPT_PRESETS } from '../../shared/aiMiningCatalog';

const h = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-mining-ai-${process.pid}`,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  keys: {} as Record<string, string>,
  localAvailable: true,
  localCalls: [] as Array<{ prompt: string; signal?: AbortSignal }>,
  localReply: '',
}));

vi.mock('electron', () => ({
  app: { getPath: (): string => h.userData, on: (): undefined => undefined, whenReady: () => Promise.resolve() },
  dialog: { showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }) },
  ipcMain: {
    handle: (channel: string, fn: (...args: unknown[]) => unknown): void => {
      h.handlers.set(channel, fn);
    },
    removeHandler: (): undefined => undefined,
    on: (): undefined => undefined,
  },
  BrowserWindow: { getAllWindows: () => [], fromWebContents: () => null },
}));

vi.mock('../dictionary/yomitan', () => ({
  getFrequencyRank: (): number | undefined => undefined,
  initYomitan: () => Promise.resolve(),
  lookupGlossary: () => [],
}));

vi.mock('../translate', () => ({
  isTranslateAvailable: (): boolean => h.localAvailable,
  runLocalQwenPrompt: async (prompt: string, options?: { signal?: AbortSignal }): Promise<string> => {
    h.localCalls.push({ prompt, signal: options?.signal });
    return h.localReply;
  },
}));

vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (bucket: string): string => h.keys[bucket] ?? '',
  writeAiProviderSecret: () => ({ ok: true, messageKey: 'credential.result.stored' }),
  aiCredentialsUsable: () => ({
    gemini: Boolean(h.keys.gemini),
    deepseek: Boolean(h.keys.deepseek),
    anthropic: Boolean(h.keys.anthropic),
    openai: Boolean(h.keys.openai),
    'openai-compatible': false,
  }),
}));

registerMiningIpc();

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(handler({}, ...args));
}

function writeConfig(config: Record<string, unknown>): void {
  const dir = path.join(h.userData, 'mining');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify(config));
}

const ENRICHMENT = {
  expression: '猫',
  reading: 'ねこ',
  meaning: 'cat',
  sentence: '猫がいる。',
  suggestedFront: '{expression}',
  suggestedBack: '{meaning}',
};

function enrichRequest(over: Record<string, unknown> = {}) {
  return { term: '猫', sentence: '猫がいる。', presetId: AI_PROMPT_PRESETS[0].id, ...over };
}

const fetchCalls: string[] = [];

beforeEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
  h.keys = {};
  h.localAvailable = true;
  h.localCalls.length = 0;
  h.localReply = `\`\`\`json\n${JSON.stringify(ENRICHMENT)}\n\`\`\``;
  fetchCalls.length = 0;
  clearAiProviderSessionCache();
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(null);
  vi.stubGlobal('fetch', (url: string) => {
    fetchCalls.push(String(url));
    return Promise.reject(new Error('no network in this test'));
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(null);
});

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
});

describe('ai:enrichCard / ai:generateDeck', () => {
  it('refuses an unknown provider id at the entry point, before any key or request (R1)', async () => {
    writeConfig({ engine: 'cloud', providerId: 'gemini-2.5-flash' });
    h.keys.gemini = 'G-KEY';
    await expect(invoke('ai:enrichCard', enrichRequest({ providerId: 'evil-provider' })))
      .rejects.toThrow(en['aiProv.error.unknown-provider'] as string);
    await expect(invoke('ai:generateDeck', { source: 'preset', presetId: AI_PROMPT_PRESETS[0].id, providerId: 'evil-provider' }))
      .rejects.toThrow(en['aiProv.error.unknown-provider'] as string);
    expect(fetchCalls.filter((url) => /googleapis|deepseek|anthropic|openai/.test(url))).toEqual([]);
  });

  it('"Use AI features" off stops the OFFLINE engine too, before the model is asked', async () => {
    writeConfig({ engine: 'local-qwen' });
    setAiFeaturesReader(() => false);
    await expect(invoke('ai:enrichCard', enrichRequest())).rejects.toThrow(en['aiProv.error.ai-off'] as string);
    await expect(invoke('ai:generateDeck', { source: 'preset', presetId: AI_PROMPT_PRESETS[0].id, wordCount: 2 }))
      .rejects.toThrow(en['aiProv.error.ai-off'] as string);
    expect(h.localCalls).toEqual([]);
  });

  it('runs the offline engine when AI is on, and tolerates a fenced reply', async () => {
    writeConfig({ engine: 'local-qwen' });
    const result = await invoke('ai:enrichCard', enrichRequest()) as { expression: string; meaning: string };
    expect(result).toMatchObject({ expression: '猫', meaning: 'cat' });
    expect(h.localCalls).toHaveLength(1);
  });

  it('refuses the cloud engine when AI Card Studio is not allowed to use the cloud', async () => {
    writeConfig({ engine: 'cloud', providerId: 'gemini-2.5-flash' });
    h.keys.gemini = 'G-KEY';
    setAiCloudFeatureReader((feature) => feature !== 'cardGen');
    await expect(invoke('ai:enrichCard', enrichRequest())).rejects.toThrow(en['aiProv.error.cloud-disabled'] as string);
    expect(fetchCalls.filter((url) => url.includes('googleapis'))).toEqual([]);
  });

  it('says which key is missing, in the UI language', async () => {
    writeConfig({ engine: 'cloud', providerId: 'claude-sonnet-5-5' });
    await expect(invoke('ai:enrichCard', enrichRequest()))
      .rejects.toThrow((en['aiProv.mining.needKey'] as string).replace('{provider}', 'Claude Sonnet 5.5'));
  });

  it('a wrong-typed field in the reply is rejected instead of written into a card', async () => {
    writeConfig({ engine: 'local-qwen' });
    h.localReply = JSON.stringify({ ...ENRICHMENT, reading: 42 });
    await expect(invoke('ai:enrichCard', enrichRequest())).rejects.toThrow(en['aiProv.error.invalid-response'] as string);
  });

  it('ai:cancelGenerate aborts the in-flight cloud request', async () => {
    writeConfig({ engine: 'cloud', providerId: 'gemini-2.5-flash' });
    h.keys.gemini = 'G-KEY';
    let aborted = false;
    vi.stubGlobal('fetch', (url: string, init?: RequestInit) => {
      fetchCalls.push(String(url));
      if (!String(url).includes('googleapis')) return Promise.reject(new Error('no network'));
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          aborted = true;
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        });
      });
    });
    const run = invoke('ai:generateDeck', { source: 'preset', presetId: AI_PROMPT_PRESETS[0].id, wordCount: 3 });
    await vi.waitFor(() => expect(fetchCalls.some((url) => url.includes('googleapis'))).toBe(true));
    await expect(invoke('ai:cancelGenerate')).resolves.toEqual({ ok: true, cancelled: 1 });
    await expect(run).rejects.toThrow(en['aiProv.error.cancelled'] as string);
    expect(aborted).toBe(true);
    expect(await invoke('ai:cancelGenerate')).toEqual({ ok: true, cancelled: 0 });
  });
});
