// @vitest-environment jsdom
/**
 * The engine picker, the consent step and the result's source line, against a
 * fake bridge. The rule under test: picking a cloud engine the user has not
 * agreed to sends nothing and saves nothing — it only shows the privacy note,
 * and only "Allow" records consent and switches the pair.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateProviderSnapshot } from '../../shared/translateProviders';

vi.mock('../i18n', () => {
  const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key);
  return { useT: () => ({ t, lang: 'en' }), t };
});

import { TranslateEngineBar, TranslateResultSource } from '../components/translate/TranslateEngineBar';
import { resetTranslateProviderClientForTests } from '../translateProviderClient';

function snapshot(overrides: Partial<TranslateProviderSnapshot['settings']> = {}, consented: string[] = []): TranslateProviderSnapshot {
  return {
    settings: { version: 1, pairs: {}, consent: {}, fallbackToLocal: true, ...overrides },
    providers: [
      { id: 'local', ready: true, consented: true, modelFileName: 'Qwen3-1.7B-Q8_0.gguf' },
      { id: 'local-large', ready: false, reason: 'not-installed', consented: true },
      { id: 'deepl', ready: true, consented: consented.includes('deepl') },
      { id: 'gemini-2.5-flash', ready: false, reason: 'no-key', consented: false },
      { id: 'deepseek-v4-flash', ready: false, reason: 'no-key', consented: false },
      { id: 'deepseek-v4-pro', ready: false, reason: 'no-key', consented: false },
    ],
  };
}

let root: Root;
let host: HTMLDivElement;
let current: TranslateProviderSnapshot;
const api = {
  translateProviders: vi.fn(async () => current),
  translateSetPairProvider: vi.fn(async (source: string, target: string, provider: string) => {
    current = { ...current, settings: { ...current.settings, pairs: { ...current.settings.pairs, [`${source}>${target}`]: provider as never } } };
    return current;
  }),
  translateSetProviderConsent: vi.fn(async (provider: string, granted: boolean) => {
    current = snapshot(
      granted ? { ...current.settings, consent: { ...current.settings.consent, [provider]: 1 } } : { pairs: {}, consent: {} },
      granted ? [provider] : [],
    );
    return current;
  }),
  translateSetFallback: vi.fn(async (on: boolean) => {
    current = { ...current, settings: { ...current.settings, fallbackToLocal: on } };
    return current;
  }),
  onTranslateProvidersChanged: vi.fn(() => () => undefined),
};

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
  await act(async () => { await Promise.resolve(); });
}

function select(): HTMLSelectElement {
  return host.querySelector('select') as HTMLSelectElement;
}

async function choose(value: string): Promise<void> {
  await act(async () => {
    const el = select();
    el.value = value;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no button ${label}: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

beforeEach(() => {
  resetTranslateProviderClientForTests();
  for (const fn of Object.values(api)) fn.mockClear();
  current = snapshot();
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('engine picker', () => {
  it('starts offline and marks engines that cannot run, with the reason', async () => {
    await render(<TranslateEngineBar source="ja" target="en" />);
    expect(select().value).toBe('local');
    const options = [...select().options];
    expect(options.find((o) => o.value === 'gemini-2.5-flash')?.disabled).toBe(true);
    expect(options.find((o) => o.value === 'gemini-2.5-flash')?.textContent).toContain('xlate2.engine.needsKey');
    expect(options.find((o) => o.value === 'local-large')?.textContent).toContain('xlate2.engine.notInstalled');
    expect(options.find((o) => o.value === 'deepl')?.disabled).toBe(false);
  });

  it('picking a cloud engine without consent shows the privacy note and saves nothing', async () => {
    await render(<TranslateEngineBar source="ja" target="en" />);
    await choose('deepl');
    const note = host.querySelector('.xlate2-consent');
    expect(note).not.toBeNull();
    expect(note?.textContent).toContain('api.deepl.com');
    expect(note?.textContent).toContain('xlate2.consent.scope');
    expect(api.translateSetPairProvider).not.toHaveBeenCalled();
    expect(api.translateSetProviderConsent).not.toHaveBeenCalled();

    await act(async () => button('xlate2.consent.decline').click());
    expect(host.querySelector('.xlate2-consent')).toBeNull();
    expect(select().value).toBe('local');
    expect(api.translateSetPairProvider).not.toHaveBeenCalled();
  });

  it('"Allow" records consent first, then switches this pair', async () => {
    await render(<TranslateEngineBar source="ja" target="en" />);
    await choose('deepl');
    await act(async () => {
      button('xlate2.consent.allow').click();
      await Promise.resolve();
    });
    await act(async () => { await Promise.resolve(); });
    expect(api.translateSetProviderConsent).toHaveBeenCalledWith('deepl', true);
    expect(api.translateSetPairProvider).toHaveBeenCalledWith('ja', 'en', 'deepl');
    expect(api.translateSetProviderConsent.mock.invocationCallOrder[0])
      .toBeLessThan(api.translateSetPairProvider.mock.invocationCallOrder[0]);
    expect(select().value).toBe('deepl');
    // While a cloud engine is active the surface says where the text goes, and offers to stop.
    expect(host.textContent).toContain('xlate2.engine.cloudActive');
    expect(button('xlate2.consent.revoke')).toBeTruthy();
  });

  it('switching back to offline needs no consent and is saved directly', async () => {
    current = snapshot({ pairs: { 'ja>en': 'deepl' }, consent: { deepl: 1 } }, ['deepl']);
    await render(<TranslateEngineBar source="ja" target="en" />);
    expect(select().value).toBe('deepl');
    await choose('local');
    expect(api.translateSetPairProvider).toHaveBeenCalledWith('ja', 'en', 'local');
  });

  it('the offline-fallback switch is saved in main', async () => {
    await render(<TranslateEngineBar source="ja" target="en" />);
    const box = host.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(box.checked).toBe(true);
    await act(async () => box.click());
    expect(api.translateSetFallback).toHaveBeenCalledWith(false);
  });
});

describe('result source line', () => {
  it('names the engine and, after a fallback, which engine failed and why', async () => {
    await render(<TranslateResultSource meta={{ provider: 'local', fallbackFrom: 'deepl', fallbackCode: 'rate-limit' }} />);
    expect(host.textContent).toContain('xlate2.result.by{"provider":"xlate2.provider.local"}');
    const status = host.querySelector('[role="status"]');
    expect(status?.textContent).toContain('"provider":"DeepL API"');
    expect(status?.textContent).toContain('xlate2.fallback.rateLimit');
  });

  it('reports glossary coverage, naming the terms that were not followed', async () => {
    await render(<TranslateResultSource meta={{ provider: 'deepl', glossary: { applied: ['先輩'], missing: ['東京'] } }} />);
    expect(host.textContent).toContain('xlate2.glossary.report{"count":1,"total":2}');
    expect(host.textContent).toContain('東京');
  });

  it('renders nothing without a result', async () => {
    await render(<TranslateResultSource meta={null} />);
    expect(host.textContent).toBe('');
  });
});
