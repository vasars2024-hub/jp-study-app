// @vitest-environment jsdom
/**
 * Renderer halves of the AI fixes (docs/AI_AUDIT.md), against fake bridges:
 *  - F1: the Translate analysis panel sends nothing without Translate consent;
 *  - F2: "Re-analyze" (Translate panel, Reading Lens, video grammar) asks main
 *    to bypass its cache, once;
 *  - F5: the Whisper tier plan never hands Chinese to the Japanese-only model;
 *  - F3/F10: every `wb-ai*` class has CSS, and the Aero/Wired skins stay scoped.
 */
import React, { act, forwardRef } from 'react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => {
  const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key);
  return { useT: () => ({ t, lang: 'en' }), t };
});
vi.mock('../aiSetupClient', () => ({
  useAiReadiness: () => ({ loaded: true, enabled: true, cloudReady: true, providerId: 'gemini-2.5-flash' }),
  openAiSettings: () => undefined,
}));
vi.mock('../tokenizer', () => ({ getTokenizer: async () => undefined, tokenizeSync: () => [] }));
vi.mock('../analysisActions', () => ({
  useAnalysisActions: () => ({ prefs: {}, copy: () => undefined, mine: () => undefined, saveSentence: () => undefined, snapshot: () => undefined }),
}));
vi.mock('../components/analysis/SentenceAnalysisView', () => ({
  default: forwardRef(function FakeView(props: { actions: { onReanalyze?: () => void } }, _ref) {
    return <button type="button" className="fake-reanalyze" onClick={() => props.actions.onReanalyze?.()}>re</button>;
  }),
}));

import SentenceAnalysisPanel from '../components/SentenceAnalysisPanel';
import LensAnalysisPanel from '../components/lens/LensAnalysisPanel';
import { resetTranslateProviderClientForTests } from '../translateProviderClient';
import { useCueAnalysis } from '../../media/useCueAnalysis';
import { whisperTierPlan } from '../whisperSettings';
import type { SentenceAnalyzeRequest } from '../../shared/sentenceAnalysisCore';
import type { TranslateAnalyzeRequest } from '../../shared/translateAnalysisCore';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  resetTranslateProviderClientForTests();
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

async function mount(node: React.ReactNode): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(node));
  await settle();
}

async function settle(): Promise<void> {
  await act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
  });
}

function snapshot(consented: boolean) {
  return {
    settings: { version: 1, pairs: {}, consent: consented ? { 'gemini-2.5-flash': 1 } : {}, fallbackToLocal: true },
    providers: [
      { id: 'local', ready: true, consented: true },
      { id: 'gemini-2.5-flash', ready: true, consented },
    ],
  };
}

const GOOD = { ok: true, result: { formality: { casual: 'a', polite: 'b', businessSafe: 'c' } } };

describe('Translate analysis panel (F1 consent, F2 refresh)', () => {
  it('sends nothing to a provider without Translate consent, and says why', async () => {
    const translateAnalyze = vi.fn(async (_req: TranslateAnalyzeRequest) => GOOD);
    (window as unknown as { api: unknown }).api = {
      translateAnalyze,
      translateProviders: vi.fn(async () => snapshot(false)),
      onTranslateProvidersChanged: () => () => undefined,
      translateSetProviderConsent: vi.fn(async () => snapshot(true)),
    };
    await mount(<SentenceAnalysisPanel sourceText="我买了书。" translatedText="I bought a book." source="zh" target="en" />);
    expect(translateAnalyze).not.toHaveBeenCalled();
    expect(host!.textContent).toContain('aiFix.analysis.needsConsent');

    // The explicit "Allow" records consent, and only then is the sentence sent.
    const allow = [...host!.querySelectorAll('button')].find((b) => b.textContent?.startsWith('xlate2.consent.allow'))!;
    await act(async () => allow.click());
    await settle();
    expect(translateAnalyze).toHaveBeenCalledTimes(1);
    expect(translateAnalyze.mock.calls[0][0]).toMatchObject({ source: 'zh', explainIn: 'en' });
  });

  it('Re-analyze asks main to bypass its cache', async () => {
    const translateAnalyze = vi.fn(async (_req: TranslateAnalyzeRequest) => GOOD);
    (window as unknown as { api: unknown }).api = {
      translateAnalyze,
      translateProviders: vi.fn(async () => snapshot(true)),
      onTranslateProvidersChanged: () => () => undefined,
    };
    await mount(<SentenceAnalysisPanel sourceText="我买了书。" translatedText="I bought a book." source="zh" target="en" />);
    expect(translateAnalyze).toHaveBeenCalledTimes(1);
    expect(translateAnalyze.mock.calls[0][0]).not.toHaveProperty('refresh');
    const again = [...host!.querySelectorAll('button')].find((b) => b.textContent === 'lens.ai.reanalyze')!;
    await act(async () => again.click());
    await settle();
    expect(translateAnalyze).toHaveBeenCalledTimes(2);
    expect(translateAnalyze.mock.calls[1][0]).toMatchObject({ refresh: true });
  });

  it('shows a coded failure in the UI language', async () => {
    (window as unknown as { api: unknown }).api = {
      translateAnalyze: vi.fn(async () => ({ ok: false, code: 'timeout', error: 'AI request timed out after 45s' })),
      translateProviders: vi.fn(async () => snapshot(true)),
      onTranslateProvidersChanged: () => () => undefined,
    };
    await mount(<SentenceAnalysisPanel sourceText="我买了书。" translatedText="I bought a book." source="zh" target="en" />);
    expect(host!.textContent).toContain('aiError.timeout');
    expect(host!.textContent).not.toContain('timed out after');
  });
});

describe('Reading Lens Re-analyze (F2)', () => {
  it('bypasses the cache on Re-analyze and says errors in the UI language', async () => {
    const sentenceAnalyze = vi.fn(async (_req: SentenceAnalyzeRequest) => ({ ok: true, result: { sentence: 's', translations: {}, annotations: [], nuance: [], pitfalls: [] } }));
    (window as unknown as { api: unknown }).api = { sentenceAnalyze };
    await mount(<LensAnalysisPanel text="猫が好き。" region={{ x: 0, y: 0, width: 10, height: 10 }} onLookup={() => undefined} onClose={() => undefined} />);
    expect(sentenceAnalyze).toHaveBeenCalledTimes(1);
    expect(sentenceAnalyze.mock.calls[0][0]).not.toHaveProperty('refresh');
    await act(async () => (host!.querySelector('.fake-reanalyze') as HTMLButtonElement).click());
    await settle();
    expect(sentenceAnalyze).toHaveBeenCalledTimes(2);
    expect(sentenceAnalyze.mock.calls[1][0]).toMatchObject({ refresh: true });

    sentenceAnalyze.mockResolvedValueOnce({ ok: false, code: 'rate-limit', error: 'Rate limited (English)' } as never);
    await act(async () => (host!.querySelector('.lens-analysis-retry') as HTMLButtonElement).click());
    await settle();
    expect(host!.textContent).toContain('aiError.rate-limit');
  });
});

describe('video grammar re-analysis (F2)', () => {
  it('reanalyze bypasses both caches once, and a later re-render does not resend', async () => {
    const result = { sentence: 'x', translations: { en: 'x' }, annotations: [], nuance: [], pitfalls: [] };
    const sentenceAnalyze = vi.fn(async (_req: SentenceAnalyzeRequest) => ({ ok: true, result }));
    (window as unknown as { api: unknown }).api = { sentenceAnalyze };
    const holder: { api: ReturnType<typeof useCueAnalysis> | null } = { api: null };
    function Probe({ auto }: { auto: boolean }): null {
      holder.api = useCueAnalysis({ text: `一緒に行こう${'。'}`, lang: 'ja', uiLang: 'en', auto, offline: false, errorLabel: 'failed' });
      return null;
    }
    await mount(<Probe auto />);
    expect(sentenceAnalyze).toHaveBeenCalledTimes(1);
    await act(async () => holder.api!.reanalyze());
    await settle();
    expect(sentenceAnalyze).toHaveBeenCalledTimes(2);
    expect(sentenceAnalyze.mock.calls[1][0]).toMatchObject({ refresh: true });
    // Pause/resume re-runs the effect: answered from the (refreshed) cache, not sent again.
    await act(async () => root!.render(<Probe auto={false} />));
    await act(async () => root!.render(<Probe auto />));
    await settle();
    expect(sentenceAnalyze).toHaveBeenCalledTimes(2);
  });
});

describe('Whisper tier plan (F5)', () => {
  it('swaps the Japanese-only pick for a multilingual tier for Chinese, and keeps it for Japanese', () => {
    localStorage.setItem('jp-study-whisper-model', 'kotoba-whisper');
    expect(whisperTierPlan('ja')).toEqual({ tier: 'kotoba-whisper', picked: 'kotoba-whisper' });
    expect(whisperTierPlan('zh')).toEqual({ tier: 'whisper-small', picked: 'kotoba-whisper' });
    expect(whisperTierPlan('zh', (t) => t === 'whisper-base').tier).toBe('whisper-base');
  });
});

describe('Deck Workbench AI CSS (F3/F10)', () => {
  const css = readFileSync(resolve(process.cwd(), 'src/renderer/components/anki/deckWorkbench.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const tsx = readFileSync(resolve(process.cwd(), 'src/renderer/components/anki/DeckWorkbenchAiPanel.tsx'), 'utf8');

  it('styles every wb-ai class the panel renders', () => {
    const used = new Set([...tsx.matchAll(/wb-ai(?:-[a-z]+)?/g)].map((m) => m[0]));
    for (const status of ['pending', 'generated', 'failed', 'cancelled']) used.add(`wb-ai-${status}`);
    used.delete('wb-ai-'); // the `wb-ai-${note.status}` template prefix
    expect(used.size).toBeGreaterThanOrEqual(19);
    for (const cls of used) {
      expect(css, `.${cls} has no rule`).toMatch(new RegExp(`\\.${cls}(?![a-z-])`));
    }
  });

  it('scopes every Aero and Wired rule to its own material set on :root', () => {
    const preludes = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((p) => p.includes('wb-ai'));
    for (const prelude of preludes) {
      for (const selector of prelude.split(',').map((s) => s.trim())) {
        if (/aero|wired/i.test(selector)) {
          expect(selector).toMatch(/^:root\[data-materials='(aero|wired)'\] /);
        }
      }
    }
    expect(preludes.some((p) => p.startsWith(":root[data-materials='aero']"))).toBe(true);
    expect(preludes.some((p) => p.startsWith(":root[data-materials='wired']"))).toBe(true);
  });
});
