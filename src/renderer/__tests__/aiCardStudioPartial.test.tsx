// @vitest-environment jsdom
/**
 * AI Card Studio in the renderer: a run that partly failed shows what it made,
 * lists what it did not, and "Retry failed items" makes only those again; the
 * progress line is rendered from its catalog key; a Chinese study profile is
 * offered the Chinese presets.
 */
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { button, cleanup, click, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';
import { AI_MINING_FORMATS, AI_PROMPT_PRESETS } from '../../shared/aiMiningCatalog';
import { failedAiEnrichmentResult } from '../../shared/aiCardStudioRetry';
import type { AiDeckGenerationRequest, AiEnrichmentResult, AiGenerationProgress } from '../../shared/mining';
import { SEED_PROFILES } from '../../shared/seedProfiles';
import { en } from '../../shared/i18n/catalogs';

const profile = vi.hoisted(() => ({ lang: 'ja' as 'ja' | 'zh' }));

vi.mock('../profileState', async (importOriginal) => {
  const real = await importOriginal<typeof import('../profileState')>();
  return {
    ...real,
    getActiveProfile: () => (profile.lang === 'zh' ? SEED_PROFILES['seed-zh-en'] : SEED_PROFILES['p1-ja-focus']),
  };
});

const READY_CONFIG = {
  apiKeysSet: { gemini: true },
  engine: 'cloud',
  providerId: 'gemini-2.5-flash',
  selectedPresetId: 'idiom-slang',
  selectedFormatId: 'idiom-slang-recognition',
  cardCount: 1,
  outputFormat: 'anki',
};

function ok(expression: string): AiEnrichmentResult {
  return {
    ...failedAiEnrichmentResult({ presetId: 'idiom-slang', formatId: 'idiom-slang-recognition', failure: { message: '', retry: { kind: 'term', term: expression } } }),
    failure: undefined,
    cards: [{ formatId: 'idiom-slang-recognition', label: 'Recognition', front: expression, back: 'b', tags: [] }],
    csv: 'x',
  };
}

let progressCb: ((p: AiGenerationProgress) => void) | null = null;

function bridge(generate: (req: AiDeckGenerationRequest) => Promise<AiEnrichmentResult[]>, selectPreset = vi.fn()) {
  stubBridge({
    aiGetConfig: READY_CONFIG,
    aiListPresets: [...AI_PROMPT_PRESETS],
    aiListFormats: [...AI_MINING_FORMATS],
    ankiStatus: { connected: false, decks: [], models: [] },
    agentCardBatchTake: { ok: true, batch: null },
    aiGenerateDeck: generate,
    aiSelectPreset: selectPreset,
    onAiGenerateProgress: (cb: (p: AiGenerationProgress) => void) => {
      progressCb = cb;
      return () => undefined;
    },
  });
}

beforeAll(() => installJsdomShims());
beforeEach(() => {
  localStorage.clear();
  profile.lang = 'ja';
  progressCb = null;
});
afterEach(async () => {
  await cleanup();
});

async function mountStudio(): Promise<HTMLDivElement> {
  const { default: AiCardStudio } = await import('../components/AiCardStudio');
  const { host } = await mount(createElement(AiCardStudio), 80);
  await settle(30);
  return host;
}

describe('AI Card Studio — partial results', () => {
  it('keeps the finished items, lists the failed ones and retries only those', async () => {
    const failed = failedAiEnrichmentResult({
      presetId: 'idiom-slang',
      formatId: 'idiom-slang-recognition',
      failure: { message: 'The provider timed out.', code: 'timeout', retry: { kind: 'term', term: '鳥' } },
    });
    const generate = vi.fn()
      .mockResolvedValueOnce([ok('猫'), failed])
      .mockResolvedValueOnce([ok('鳥')]);
    bridge(generate);
    const host = await mountStudio();
    await click(button(host, new RegExp(`^\\s*${en['aiStudio.btn.generate'] as string}`)));
    await settle(30);
    expect(generate).toHaveBeenCalledTimes(1);
    const list = host.querySelector('[data-testid="ai-studio-failed"]');
    expect(list?.textContent).toContain('鳥');
    expect(list?.textContent).toContain('The provider timed out.');
    expect(host.textContent).toContain('猫');

    const retry = host.querySelector<HTMLButtonElement>('[data-testid="ai-studio-retry-failed"]');
    expect(retry?.textContent).toContain('(1)');
    await click(retry);
    await settle(30);
    expect(generate).toHaveBeenCalledTimes(2);
    const retryRequest = generate.mock.calls[1][0] as AiDeckGenerationRequest;
    expect(retryRequest).toMatchObject({ source: 'dictionary', terms: [{ term: '鳥' }], presetId: 'idiom-slang' });
    expect(host.querySelector('[data-testid="ai-studio-failed"]')).toBeNull();
    expect(host.querySelector('[data-testid="ai-studio-retry-failed"]')).toBeNull();
  });

  it('renders the progress line from its key, not main\'s prose', async () => {
    let finish: (v: AiEnrichmentResult[]) => void = () => undefined;
    bridge(() => new Promise((resolve) => { finish = resolve; }));
    const host = await mountStudio();
    await click(button(host, new RegExp(`^\\s*${en['aiStudio.btn.generate'] as string}`)));
    expect(progressCb).toBeTypeOf('function');
    const { act } = await import('react');
    await act(async () => {
      progressCb?.({
        phase: 'invent',
        done: 1,
        total: 4,
        message: 'MAIN PROSE',
        messageKey: 'aiStudio.progress.msg.invented',
        messageVars: { done: 1, total: 4 },
      });
    });
    await settle(10);
    expect(host.textContent).toContain('Invented 1 of 4 items');
    expect(host.textContent).not.toContain('MAIN PROSE');
    await act(async () => finish([ok('猫')]));
  });
});

describe('AI Card Studio — presets follow the study language', () => {
  it('a Chinese profile is offered the Chinese presets and moved off a Japanese one', async () => {
    profile.lang = 'zh';
    const selectPreset = vi.fn((id: string) => Promise.resolve({ ok: true, ...READY_CONFIG, selectedPresetId: id }));
    bridge(() => Promise.resolve([]), selectPreset);
    const host = await mountStudio();
    const options = [...host.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(options).toContain('zh-chengyu');
    expect(options).not.toContain('idiom-slang');
    expect(selectPreset).toHaveBeenCalledWith('zh-chengyu');
    expect(host.querySelector('[data-testid="ai-studio-preset-lang"]')?.textContent).toContain(en['aiStudio.lang.zh'] as string);
  });

  it('a Japanese profile sees no Chinese presets', async () => {
    const selectPreset = vi.fn();
    bridge(() => Promise.resolve([]), selectPreset);
    const host = await mountStudio();
    const options = [...host.querySelectorAll('option')].map((o) => o.getAttribute('value'));
    expect(options).toContain('idiom-slang');
    expect(options.some((v) => v?.startsWith('zh-'))).toBe(false);
    expect(selectPreset).not.toHaveBeenCalled();
  });
});
