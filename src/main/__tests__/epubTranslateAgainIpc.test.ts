// @vitest-environment node
/**
 * `mining:renderEpubDeck` with `{ freshTranslations: true }` — the EPUB panel's
 * "Translate again" — reaches the cloud batch as `fresh`, so the provider is
 * asked again instead of answering from its cache; a plain download does not.
 */
import fs from 'node:fs';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { registerMiningIpc } from '../mining';
import { DEFAULT_TRADITIONAL_MINING_CONFIG, type EpubMiningAnalysis } from '../../shared/mining';

const h = vi.hoisted(() => ({
  userData: `${process.env.TEMP || process.env.TMPDIR || '/tmp'}/jp-epub-fresh-${process.pid}`,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  apiCalls: [] as Array<{ items: unknown[]; options?: { fresh?: boolean } }>,
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
vi.mock('../dictionary', () => ({ lookupTermsBatch: async () => ({}) }));
vi.mock('../translate', () => ({
  isTranslateAvailable: (): boolean => false,
  runTranslationBatch: async () => [],
}));
vi.mock('../translateApi', () => ({
  isApiTranslationAvailable: (): boolean => true,
  runApiTranslationBatch: async (items: Array<{ id: string; target: string }>, _p: string, _k: string, options?: { fresh?: boolean }) => {
    h.apiCalls.push({ items, ...(options ? { options } : {}) });
    return items.map((item) => ({ id: item.id, text: options?.fresh ? 'свежий перевод' : 'кэш' }));
  },
}));
vi.mock('../credentials/ai', () => ({
  readAiProviderSecret: (): string => 'KEY',
  writeAiProviderSecret: () => ({ ok: true, messageKey: 'credential.result.stored' }),
  aiCredentialsUsable: () => ({ gemini: true, deepseek: false, anthropic: false, openai: false, 'openai-compatible': false }),
}));

registerMiningIpc();

function invoke(channel: string, ...args: unknown[]): Promise<unknown> {
  const handler = h.handlers.get(channel);
  if (!handler) throw new Error(`no handler for ${channel}`);
  return Promise.resolve(handler({}, ...args));
}

const analysis: EpubMiningAnalysis = {
  itemId: 'book',
  title: 'Book',
  totalCharacters: 10,
  analyzer: 'kuromoji',
  generatedAt: 0,
  candidates: [{ expression: '人間', reading: 'にんげん', count: 2, sampleSentence: '人間だ。', frequencies: { byDictionary: {} } }],
};
const config = {
  templates: { front: '{expression:ja}', back: '{expression:ru}', resetToAutomatic: false },
  export: { ...DEFAULT_TRADITIONAL_MINING_CONFIG.export, fillTranslations: true, translationEngine: 'api' as const, translationApiProvider: 'gemini-2.5-flash' as const },
};

beforeEach(() => {
  fs.rmSync(h.userData, { recursive: true, force: true });
  h.apiCalls.length = 0;
});
afterAll(() => fs.rmSync(h.userData, { recursive: true, force: true }));

describe('EPUB "Translate again"', () => {
  it('a plain download lets the provider answer from its cache', async () => {
    await invoke('mining:renderEpubDeck', analysis, config);
    expect(h.apiCalls.length).toBeGreaterThan(0);
    expect(h.apiCalls.every((call) => call.options?.fresh !== true)).toBe(true);
  });

  it('"Translate again" asks the provider afresh, even for a candidate already translated', async () => {
    const first = await invoke('mining:renderEpubDeck', analysis, config) as { enrichedCandidates: EpubMiningAnalysis['candidates'] };
    expect(first.enrichedCandidates[0].translations?.['expression:ru']).toBe('кэш');
    h.apiCalls.length = 0;
    // The panel sends the candidates back with their earlier translations on them.
    const again = await invoke(
      'mining:renderEpubDeck',
      { ...analysis, candidates: first.enrichedCandidates },
      config,
      { freshTranslations: true },
    ) as { enrichedCandidates: EpubMiningAnalysis['candidates'] };
    expect(h.apiCalls.length).toBeGreaterThan(0);
    expect(h.apiCalls.every((call) => call.options?.fresh === true)).toBe(true);
    expect(again.enrichedCandidates[0].translations?.['expression:ru']).toBe('свежий перевод');
  });
});
