// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LexiconExplanation } from '../../shared/lexiconExplanations';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));

import EntryExplain from '../components/lexicon/EntryExplain';

const CLOUD_CONFIG = {
  engine: 'cloud' as const,
  providerId: 'gemini-2.5-flash' as const,
  apiKeysSet: { gemini: true, deepseek: false },
};

function explanation(overrides: Partial<LexiconExplanation> = {}): LexiconExplanation {
  return {
    lang: 'ja',
    text: '猫',
    reading: 'ねこ',
    glossLang: 'en',
    model: 'cloud:gemini-2.5-flash:default',
    promptVersion: 1,
    summary: 'A cat.',
    sections: [{ kind: 'nuance', body: 'Warmer than 猫科.' }],
    createdAt: 1_700_000_000_000,
    ...overrides,
  };
}

let aiGetConfig: ReturnType<typeof vi.fn>;
let dictExplanationGet: ReturnType<typeof vi.fn>;
let dictExplain: ReturnType<typeof vi.fn>;
let dictExplanationClear: ReturnType<typeof vi.fn>;

function stubApi(over: Partial<Record<string, unknown>> = {}): void {
  aiGetConfig = vi.fn(async () => CLOUD_CONFIG);
  dictExplanationGet = vi.fn(async () => null);
  dictExplain = vi.fn(async () => ({ ok: true, cached: false, explanation: explanation() }));
  dictExplanationClear = vi.fn(async () => ({ ok: true, removed: 1 }));
  (window as unknown as { api: Record<string, unknown> }).api = {
    aiGetConfig,
    dictExplanationGet,
    dictExplain,
    dictExplanationClear,
    ...over,
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  stubApi();
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

function need<T>(node: T | null, what: string): T {
  if (!node) throw new Error(`expected ${what} to be rendered`);
  return node;
}

const panel = () => host.querySelector<HTMLDetailsElement>('.lexicon-explain-entry');
const askButton = () =>
  need(host.querySelector<HTMLButtonElement>('.lexicon-explain-ask'), 'the ask button');
const forgetButton = () => host.querySelector<HTMLButtonElement>('.lexicon-explain-forget');

async function click(button: HTMLButtonElement): Promise<void> {
  await act(async () => {
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

const word = (
  <EntryExplain word="猫" reading="ねこ" lang="ja" senses={[{ partsOfSpeech: ['n'], definitions: ['cat'] }]} />
);

describe('EntryExplain', () => {
  it('reads the cache on open and sends nothing', async () => {
    await render(word);
    expect(dictExplanationGet).toHaveBeenCalledTimes(1);
    // The whole point of the panel: opening a word never costs a model call.
    expect(dictExplain).not.toHaveBeenCalled();
    expect(host.querySelector('.lexicon-explain-empty')?.textContent)
      .toBe('lexicon.wordExplain.empty');
  });

  it('reads the cache under the key derived from the configured provider', async () => {
    await render(word);
    expect(dictExplanationGet).toHaveBeenCalledWith({
      lang: 'ja',
      text: '猫',
      reading: 'ねこ',
      glossLang: 'en',
      model: 'cloud:gemini-2.5-flash:default',
      promptVersion: 1,
    });
  });

  it('renders a stored answer open, with its section heading translated', async () => {
    dictExplanationGet.mockResolvedValue(explanation());
    await render(word);
    expect(panel()?.open).toBe(true);
    expect(host.querySelector('.lexicon-explain-summary')?.textContent).toBe('A cat.');
    expect(host.querySelector('.lexicon-explain-section h4')?.textContent)
      .toBe('lexicon.wordExplain.section.nuance');
    expect(askButton().textContent).toBe('lexicon.wordExplain.again');
    expect(forgetButton()).not.toBeNull();
  });

  it('asks once on the button, with the entry glosses as grounding', async () => {
    await render(word);
    await click(askButton());
    expect(dictExplain).toHaveBeenCalledTimes(1);
    const request = dictExplain.mock.calls[0][0];
    expect(request.key).toEqual({ lang: 'ja', text: '猫', reading: 'ねこ', glossLang: 'en' });
    expect(request.grounding).toEqual({ glosses: ['cat'], partsOfSpeech: ['n'] });
    expect(request.policy.target).toEqual({ kind: 'cloud', providerId: 'gemini-2.5-flash' });
    // The first ask is not a refresh; only a word that already has an answer is.
    expect(request.refresh).toBe(false);
    expect(host.querySelector('.lexicon-explain-summary')?.textContent).toBe('A cat.');
  });

  it('asks again as a refresh once an answer is on screen', async () => {
    dictExplanationGet.mockResolvedValue(explanation());
    await render(word);
    await click(askButton());
    expect(dictExplain.mock.calls[0][0].refresh).toBe(true);
  });

  it('keeps the stored answer when a refresh fails, and shows the provider code', async () => {
    dictExplanationGet.mockResolvedValue(explanation());
    dictExplain.mockResolvedValue({
      ok: false,
      cached: false,
      explanation: null,
      error: 'provider-failed',
      code: 'output-truncated',
    });
    await render(word);
    await click(askButton());
    expect(host.querySelector('.lexicon-explain-summary')?.textContent).toBe('A cat.');
    const error = need(host.querySelector('.lexicon-explain-error'), 'the failure line');
    expect(error.textContent).toContain('lexicon.wordExplain.failedProvider');
    expect(host.querySelector('.lexicon-explain-code')?.textContent).toBe('output-truncated');
  });

  it('names an unknown failure rather than rendering nothing', async () => {
    dictExplain.mockResolvedValue({ ok: false, cached: false, explanation: null });
    await render(word);
    await click(askButton());
    expect(host.querySelector('.lexicon-explain-error')?.textContent)
      .toContain('lexicon.wordExplain.failedUnknown');
  });

  it('forgets the word, not the one model/language pair on screen', async () => {
    dictExplanationGet.mockResolvedValue(explanation());
    await render(word);
    await click(need(forgetButton(), 'the forget button'));
    expect(dictExplanationClear).toHaveBeenCalledWith({ lang: 'ja', text: '猫', reading: 'ねこ' });
    expect(host.querySelector('.lexicon-explain-summary')).toBeNull();
    expect(askButton().textContent).toBe('lexicon.wordExplain.ask');
  });

  it('says why, and offers no button, when the configured provider has no key', async () => {
    aiGetConfig.mockResolvedValue({
      engine: 'cloud',
      providerId: 'gemini-2.5-flash',
      apiKeysSet: { gemini: false, deepseek: false },
    });
    await render(word);
    expect(host.querySelector('.lexicon-explain-blocked')?.textContent)
      .toBe('lexicon.wordExplain.blockedKey');
    expect(host.querySelector('.lexicon-explain-ask')).toBeNull();
    expect(dictExplanationGet).not.toHaveBeenCalled();
  });

  /**
   * Regression: the ask used to send the provider that was selected when the panel MOUNTED.
   *
   * The effect that resolves the policy has the word in its deps, not the configuration, and
   * nothing re-runs it when the user changes their AI provider. Measured live: the app was
   * switched to `deepseek-v4-pro` with a key set for it (`aiGetConfig` confirmed
   * `providerId: 'deepseek-v4-pro'`), one click on the button answered, and the answer's own
   * provenance line read `From cloud:gemini-2.5-flash:default`. The request went to a provider the
   * user had stopped choosing, and was billed there.
   */
  it('sends the provider configured now, not the one configured at mount', async () => {
    await render(word);
    expect(aiGetConfig).toHaveBeenCalledTimes(1);

    aiGetConfig.mockResolvedValue({
      engine: 'cloud',
      providerId: 'deepseek-v4-pro',
      apiKeysSet: { gemini: true, deepseek: true },
    });

    await click(askButton());
    expect(dictExplain).toHaveBeenCalledTimes(1);
    expect(dictExplain.mock.calls[0][0].policy.target).toEqual({
      kind: 'cloud',
      providerId: 'deepseek-v4-pro',
    });
  });

  /**
   * The other half of reading it live: a configuration that has become unusable since mount must
   * render the blocked message rather than call a provider whose key is gone.
   */
  it('blocks instead of asking when the key disappeared after mount', async () => {
    await render(word);
    aiGetConfig.mockResolvedValue({
      engine: 'cloud',
      providerId: 'gemini-2.5-flash',
      apiKeysSet: { gemini: false, deepseek: false },
    });

    await click(askButton());
    expect(dictExplain).not.toHaveBeenCalled();
    expect(host.querySelector('.lexicon-explain-blocked')?.textContent)
      .toBe('lexicon.wordExplain.blockedKey');
  });

  it('stays absent when the preload cannot explain at all', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = { aiGetConfig };
    await render(word);
    expect(panel()).toBeNull();
    expect(aiGetConfig).not.toHaveBeenCalled();
  });
});
