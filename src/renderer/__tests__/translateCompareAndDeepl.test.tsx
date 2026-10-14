// @vitest-environment jsdom
/**
 * W1-A, the Translate workbench's renderer half, against a fake bridge:
 *
 *  - "Compare engines" runs the passage through every ready, allowed engine at once — one
 *    ordinary `translateRun` per engine — and lists the others with the reason they are not
 *    offered. A cloud engine the offline model stood in for is shown as failed, not as the
 *    offline model's text under the cloud engine's name. "Use for" switches the pair.
 *  - DeepL's formality and context are read from and saved to main, shown only while DeepL is
 *    the pair's (allowed) engine.
 *  - A failure is said in the UI language: main's coded errors are, and platform text never
 *    reaches the screen.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TranslateProviderSnapshot } from '../../shared/translateProviders';

vi.mock('../i18n', () => {
  const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key);
  return { useT: () => ({ t, lang: 'en' }), t };
});

import { TranslateComparePanel } from '../components/translate/TranslateComparePanel';
import { TranslateEngineBar } from '../components/translate/TranslateEngineBar';
import { translateErrorText } from '../components/translate/translateErrorText';
import type { TranslateController } from '../components/translate/TranslateContent';
import { resetTranslateProviderClientForTests } from '../translateProviderClient';

function snapshot(pairs: Record<string, string> = {}): TranslateProviderSnapshot {
  return {
    settings: { version: 1, pairs: pairs as never, consent: { deepl: 1 }, fallbackToLocal: true },
    providers: [
      { id: 'local', ready: true, consented: true, modelFileName: 'Qwen3-1.7B-Q8_0.gguf' },
      { id: 'local-large', ready: false, reason: 'not-installed', consented: true },
      { id: 'deepl', ready: true, consented: true },
      { id: 'gemini-2.5-flash', ready: true, consented: false },
      { id: 'deepseek-v4-flash', ready: false, reason: 'no-key', consented: false },
      { id: 'deepseek-v4-pro', ready: true, consented: true },
    ],
  };
}

type RunReq = { id: number; text: string; source: string; target: string; provider?: string };
let current: TranslateProviderSnapshot;
let runs: RunReq[];
let deeplStored: { formality: string; context: string };
const api = {
  translateProviders: vi.fn(async () => current),
  translateSetPairProvider: vi.fn(async (source: string, target: string, provider: string) => {
    current = snapshot({ [`${source}>${target}`]: provider });
    return current;
  }),
  translateSetProviderConsent: vi.fn(async () => current),
  translateSetFallback: vi.fn(async () => current),
  onTranslateProvidersChanged: vi.fn(() => () => undefined),
  onTranslateModelProgress: vi.fn(() => () => undefined),
  onTranslatePartial: vi.fn(() => () => undefined),
  translateCancel: vi.fn(async () => ({ ok: true })),
  translateRun: vi.fn(async (req: RunReq) => {
    runs.push(req);
    if (req.provider === 'local') return { ok: true, text: 'The cat slept by the window.', meta: { provider: 'local' } };
    if (req.provider === 'deepl') return { ok: true, text: 'The cat was sleeping at the window.', meta: { provider: 'deepl' } };
    // DeepSeek failed and the offline model stood in for it.
    return {
      ok: true,
      text: 'The cat slept by the window.',
      meta: { provider: 'local', fallbackFrom: req.provider, fallbackCode: 'auth' },
    };
  }),
  translateDeeplOptions: vi.fn(async () => deeplStored),
  translateSetDeeplOptions: vi.fn(async (options: { formality: string; context: string }) => {
    deeplStored = options;
    return deeplStored;
  }),
};

let root: Root;
let host: HTMLDivElement;

async function render(node: React.ReactNode): Promise<void> {
  await act(async () => root.render(node));
  await act(async () => { await Promise.resolve(); });
}

async function flush(): Promise<void> {
  for (let i = 0; i < 5; i++) await act(async () => { await Promise.resolve(); });
}

function button(label: string): HTMLButtonElement {
  const found = [...host.querySelectorAll('button')].find((b) => b.textContent?.startsWith(label));
  if (!found) throw new Error(`no button ${label}: ${[...host.querySelectorAll('button')].map((b) => b.textContent).join(' | ')}`);
  return found as HTMLButtonElement;
}

function controller(input: string): TranslateController {
  return { source: 'ja', target: 'en', input, style: 'natural' } as unknown as TranslateController;
}

beforeEach(() => {
  resetTranslateProviderClientForTests();
  for (const fn of Object.values(api)) fn.mockClear();
  current = snapshot();
  runs = [];
  deeplStored = { formality: 'default', context: '' };
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('Compare engines', () => {
  it('offers only ready, allowed engines and says why the others are not', async () => {
    await render(<TranslateComparePanel id="c" state={controller('猫は窓辺で眠っていた。')} />);
    const rows = [...host.querySelectorAll('.xlate2-compare-engine')].map((el) => ({
      id: el.getAttribute('data-provider'),
      text: el.textContent ?? '',
      on: (el.querySelector('input') as HTMLInputElement).checked,
      disabled: (el.querySelector('input') as HTMLInputElement).disabled,
    }));
    expect(rows.filter((r) => r.on && !r.disabled).map((r) => r.id)).toEqual(['local', 'deepl', 'deepseek-v4-pro']);
    expect(rows.find((r) => r.id === 'gemini-2.5-flash')?.text).toContain('xlate2.compare.notAllowed');
    expect(rows.find((r) => r.id === 'deepseek-v4-flash')?.text).toContain('xlate2.engine.needsKey');
    expect(rows.find((r) => r.id === 'local-large')?.text).toContain('xlate2.engine.notInstalled');
  });

  it('runs every chosen engine at once over the existing channel, side by side', async () => {
    await render(<TranslateComparePanel id="c" state={controller('猫は窓辺で眠っていた。')} />);
    await act(async () => button('xlate2.compare.run').click());
    await flush();
    expect(runs.map((r) => r.provider).sort()).toEqual(['deepl', 'deepseek-v4-pro', 'local']);
    expect(new Set(runs.map((r) => r.id)).size).toBe(3);
    const cells = Object.fromEntries([...host.querySelectorAll('.xlate2-compare-cell')].map((el) => [
      el.getAttribute('data-provider'), el.textContent ?? '',
    ]));
    expect(cells.local).toContain('The cat slept by the window.');
    expect(cells.deepl).toContain('The cat was sleeping at the window.');
    // The offline model's stand-in answer is not shown as DeepSeek's.
    expect(cells['deepseek-v4-pro']).not.toContain('The cat slept');
    expect(cells['deepseek-v4-pro']).toContain('xlate2.error.cloud');
    expect(cells['deepseek-v4-pro']).toContain('xlate2.fallback.auth');
  });

  it('"Use for" makes that engine the pair\'s', async () => {
    await render(<TranslateComparePanel id="c" state={controller('猫。')} />);
    await act(async () => button('xlate2.compare.run').click());
    await flush();
    const deepl = host.querySelector('.xlate2-compare-cell[data-provider="deepl"]') as HTMLElement;
    const use = [...deepl.querySelectorAll('button')].find((b) => b.textContent?.startsWith('xlate2.compare.use')) as HTMLButtonElement;
    await act(async () => use.click());
    await flush();
    expect(api.translateSetPairProvider).toHaveBeenCalledWith('ja', 'en', 'deepl');
  });

  it('asks for text first, and sends nothing without it', async () => {
    await render(<TranslateComparePanel id="c" state={controller('   ')} />);
    await act(async () => button('xlate2.compare.run').click());
    expect(runs).toHaveLength(0);
    expect(host.textContent).toContain('xlate2.compare.needText');
  });
});

describe('DeepL options', () => {
  it('appear only while DeepL is the pair\'s allowed engine, and save to main', async () => {
    await render(<TranslateEngineBar source="ja" target="en" />);
    expect(host.textContent).not.toContain('xlate2.deepl.toggle');

    current = snapshot({ 'ja>en': 'deepl' });
    resetTranslateProviderClientForTests();
    act(() => root.unmount());
    root = createRoot(host);
    await render(<TranslateEngineBar source="ja" target="en" />);
    await act(async () => button('xlate2.deepl.toggle').click());
    await flush();
    expect(api.translateDeeplOptions).toHaveBeenCalled();

    const formality = host.querySelector('.xlate2-deepl select') as HTMLSelectElement;
    await act(async () => {
      formality.value = 'more';
      formality.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(api.translateSetDeeplOptions).toHaveBeenLastCalledWith({ formality: 'more', context: '' });
    expect(host.textContent).toContain('xlate2.deepl.saved');

    const context = host.querySelector('.xlate2-deepl textarea') as HTMLTextAreaElement;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
      setter.call(context, '  Dialogue between coworkers.  ');
      context.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('common.save').click());
    await flush();
    expect(api.translateSetDeeplOptions).toHaveBeenLastCalledWith({ formality: 'more', context: 'Dialogue between coworkers.' });
  });
});

describe('translateErrorText', () => {
  const t = (key: string) => `T(${key})`;
  it('keeps a message main already worded, and never shows platform text', () => {
    expect(translateErrorText(new Error('T(xlate2.error.tooLong)'), t)).toBe('T(xlate2.error.tooLong)');
    expect(translateErrorText(new Error("Error invoking remote method 'translate:run': Error: boom"), t)).toBe('T(translate.error.failed)');
    expect(translateErrorText(new TypeError('window.api.translateRun is not a function'), t)).toBe('T(translate.error.failed)');
    expect(translateErrorText('boom', t)).toBe('T(translate.error.failed)');
    expect(translateErrorText(new Error('  '), t)).toBe('T(translate.error.failed)');
  });
});
