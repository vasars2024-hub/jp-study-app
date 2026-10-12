// @vitest-environment node
/**
 * AI Card Studio keeps what it already paid for.
 *
 * `ai:generateDeck` used to throw on the first word or invent batch that
 * failed, so a 20-word run that failed on word 19 returned nothing — 18 paid
 * answers discarded. Now the finished items come back with each failure in its
 * place, marked retryable, and only a run that made nothing at all is refused.
 * Progress lines carry a catalog key so every window shows them in its own
 * language. Driven through the real IPC handler with the offline engine
 * scripted; nothing touches the network.
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMiningIpc } from '../mining';
import { setAiCloudFeatureReader, setAiFeaturesReader } from '../aiFeatureGate';
import { en } from '../../shared/i18n/catalogs';
import { AI_PROMPT_PRESETS } from '../../shared/aiMiningCatalog';
import type { AiEnrichmentResult, AiGenerationProgress } from '../../shared/mining';

const h = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-mining-partial-${process.pid}`,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  replies: [] as Array<string | (() => string)>,
  prompts: [] as string[],
  sent: [] as Array<{ channel: string; payload: unknown }>,
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
  BrowserWindow: {
    getAllWindows: () => [{ webContents: { send: (channel: string, payload: unknown) => h.sent.push({ channel, payload }) } }],
    fromWebContents: () => null,
  },
}));

vi.mock('../dictionary/yomitan', () => ({
  getFrequencyRank: (): number | undefined => undefined,
  initYomitan: () => Promise.resolve(),
  lookupGlossary: () => [],
}));

vi.mock('../translate', () => ({
  isTranslateAvailable: (): boolean => true,
  runLocalQwenPrompt: async (prompt: string): Promise<string> => {
    h.prompts.push(prompt);
    const next = h.replies.shift();
    if (next === undefined) throw new Error('no scripted reply');
    return typeof next === 'function' ? next() : next;
  },
}));

vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (): string => '',
  writeAiProviderSecret: () => ({ ok: true, messageKey: 'credential.result.stored' }),
  aiCredentialsUsable: () => ({ gemini: false, deepseek: false, anthropic: false, openai: false, 'openai-compatible': false }),
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

const enrichment = (expression: string) => JSON.stringify({
  expression,
  reading: 'よみ',
  meaning: `meaning of ${expression}`,
  sentence: `${expression}の文。`,
  suggestedFront: '{expression}',
  suggestedBack: '{meaning}',
});
const batch = (expressions: string[]) => JSON.stringify({ items: expressions.map((e) => JSON.parse(enrichment(e))) });
const progress = (): AiGenerationProgress[] =>
  h.sent.filter((s) => s.channel === 'ai:generateProgress').map((s) => s.payload as AiGenerationProgress);

const presetId = AI_PROMPT_PRESETS[0].id;

beforeEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
  writeConfig({ engine: 'local-qwen' });
  h.replies.length = 0;
  h.prompts.length = 0;
  h.sent.length = 0;
  setAiFeaturesReader(null);
  setAiCloudFeatureReader(null);
});

afterAll(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
  setAiFeaturesReader(null);
});

describe('dictionary source: one failed word costs that word only', () => {
  it('keeps the finished words and returns the failed one in place, retryable', async () => {
    h.replies.push(enrichment('猫'), 'not json at all', enrichment('犬'));
    const results = await invoke('ai:generateDeck', {
      source: 'dictionary',
      presetId,
      terms: [{ term: '猫' }, { term: '鳥', reading: 'とり', sentence: '鳥が飛ぶ。' }, { term: '犬' }],
    }) as AiEnrichmentResult[];
    expect(results.map((r) => r.expression)).toEqual(['猫', '鳥', '犬']);
    expect(results[0].cards.length).toBeGreaterThan(0);
    expect(results[2].cards.length).toBeGreaterThan(0);
    expect(results[1].cards).toEqual([]);
    expect(results[1].failure).toMatchObject({
      code: 'invalid-response',
      retry: { kind: 'term', term: '鳥', reading: 'とり', sentence: '鳥が飛ぶ。' },
    });
    expect(results[1].failure?.message).toBe(en['aiProv.error.invalid-response']);
  });

  it('a run-stopping failure keeps what was made and marks every remaining word retryable', async () => {
    let calls = 0;
    h.replies.push(() => {
      calls += 1;
      // "Use AI features" is switched off while the run is in flight.
      setAiFeaturesReader(() => false);
      return enrichment('猫');
    });
    const results = await invoke('ai:generateDeck', {
      source: 'dictionary',
      presetId,
      terms: [{ term: '猫' }, { term: '鳥' }, { term: '犬' }],
    }) as AiEnrichmentResult[];
    expect(calls).toBe(1);
    expect(h.prompts).toHaveLength(1);
    expect(results[0]).toMatchObject({ expression: '猫' });
    expect(results[0].failure).toBeUndefined();
    expect(results.slice(1).map((r) => [r.failure?.code, r.failure?.retry])).toEqual([
      ['ai-off', { kind: 'term', term: '鳥' }],
      ['ai-off', { kind: 'term', term: '犬' }],
    ]);
  });

  it('a run that made nothing is still refused, with the reason', async () => {
    h.replies.push('nope', 'nope');
    await expect(invoke('ai:generateDeck', { source: 'dictionary', presetId, terms: [{ term: '猫' }, { term: '犬' }] }))
      .rejects.toThrow(en['aiProv.error.invalid-response'] as string);
  });

  it('broadcasts progress by catalog key, with the line already localized', async () => {
    h.replies.push(enrichment('猫'), 'bad');
    await invoke('ai:generateDeck', { source: 'dictionary', presetId, terms: [{ term: '猫' }, { term: '犬' }] });
    const events = progress();
    expect(events[0]).toMatchObject({
      phase: 'enrich',
      messageKey: 'aiStudio.progress.msg.enriching',
      messageVars: { term: '猫', n: 1, total: 2 },
      message: (en['aiStudio.progress.msg.enriching'] as string).replace('{term}', '猫').replace('{n}', '1').replace('{total}', '2'),
    });
    const done = events.at(-1)!;
    expect(done).toMatchObject({ phase: 'done', messageKey: 'aiStudio.progress.msg.partial', messageVars: { count: 1, failed: 1 } });
    // No English prose left behind for a window to show verbatim.
    for (const event of events) expect(event.messageKey).toMatch(/^aiStudio\.progress\.msg\./);
  });
});

describe('preset source: one failed batch keeps the batches that worked', () => {
  it('returns the invented items and one retryable placeholder for the missing ones', async () => {
    const first = Array.from({ length: 10 }, (_, i) => `語${i}`);
    h.replies.push(batch(first), 'garbage');
    const results = await invoke('ai:generateDeck', { source: 'preset', presetId, wordCount: 15 }) as AiEnrichmentResult[];
    const finished = results.filter((r) => !r.failure);
    expect(finished.map((r) => r.expression)).toEqual(first);
    const failed = results.filter((r) => r.failure);
    expect(failed).toHaveLength(1);
    expect(failed[0].failure?.retry).toEqual({ kind: 'invent', count: 5, avoid: first });
    expect(failed[0].cards).toEqual([]);
  });

  it('a retry with avoidExpressions never returns them again', async () => {
    h.replies.push(batch(['語0', '新1', '新2']));
    const results = await invoke('ai:generateDeck', {
      source: 'preset',
      presetId,
      wordCount: 3,
      avoidExpressions: ['語0'],
    }) as AiEnrichmentResult[];
    expect(h.prompts[0]).toContain('Already invented — do not repeat: 語0');
    expect(results.filter((r) => !r.failure).map((r) => r.expression)).toEqual(['新1', '新2']);
    expect(results.filter((r) => r.failure).map((r) => r.failure?.retry)).toEqual([
      { kind: 'invent', count: 1, avoid: ['語0', '新1', '新2'] },
    ]);
  });

  it('a first batch that fails is refused as before (nothing was paid for)', async () => {
    h.replies.push('garbage');
    await expect(invoke('ai:generateDeck', { source: 'preset', presetId, wordCount: 3 }))
      .rejects.toThrow(en['aiProv.error.invalid-response'] as string);
  });
});
