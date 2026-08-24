// @vitest-environment jsdom
/**
 * `Example sentences` is the ONE Dictionary control that starts an offline model load — measured
 * live 2026-08-24 (`src/.coordination/liquid-workplace/L7_PERF_DICTIONARY.md`): six other
 * candidates stayed silent for 8 s each and this one emitted `translate:progress` after 1 s, then
 * took main from 420.7 MB to 3,323 MB over ~15 s.
 *
 * For those 15 s the panel said "Translating examples…", which is a state the app knows to be
 * wrong about itself: nothing is being translated yet. These cases pin the honest one.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult, ExampleSentence } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  // The percent has to survive interpolation, so the fake renders it rather than the key alone.
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      (vars && 'pct' in vars ? `${key}:${vars.pct}` : key),
    lang: 'en',
  }),
}));

/** Held open so the panel stays in its loading state while the assertions run. */
let releaseTranslate: (() => void) | null = null;
vi.mock('../translator', () => ({
  translateTo: () => new Promise<string>((resolve) => {
    releaseTranslate = () => resolve('Мне нравятся кошки.');
  }),
}));

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }],
};

type ModelProgress = { status?: string; file?: string; progress?: number };
let emitModelProgress: ((p: ModelProgress) => void) | null = null;
let unsubscribes = 0;

function stubApi(examples: ExampleSentence[]): void {
  const result: DictResult = { query: '猫', entries: [ENTRY] } as DictResult;
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '猫', examples })),
    onTranslateModelProgress: vi.fn((cb: (p: ModelProgress) => void) => {
      emitModelProgress = cb;
      return () => {
        unsubscribes += 1;
      };
    }),
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
  emitModelProgress = null;
  releaseTranslate = null;
  unsubscribes = 0;
  // A language beyond Tatoeba's own English is what routes examples through the local model at
  // all — with English only, `qwenLangs` is empty and nothing loads, which is the point of
  // `defaultExLangs` and is covered in `dictionaryExampleLangDefault.test.tsx`.
  localStorage.clear();
  localStorage.setItem('jp-study-ex-langs', JSON.stringify(['en', 'ru']));
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

function status(): string {
  return host.querySelector('.dict-ex-status')?.textContent ?? '';
}

async function loadExamples(): Promise<void> {
  await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
  const load = host.querySelector<HTMLButtonElement>('.dict-ex-btn');
  expect(load).not.toBeNull();
  await act(async () => {
    load?.click();
  });
}

describe('Dictionary example sentences — the model load is stated, not hidden', () => {
  it('reports the model load with its percent instead of claiming to translate', async () => {
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);
    await loadExamples();

    // Nothing has been emitted yet: the model may well be resident, and inventing a load would be
    // the opposite defect.
    expect(status()).toBe('dict.results.translatingExamples');

    expect(emitModelProgress).not.toBeNull();
    await act(async () => {
      emitModelProgress?.({ status: 'init', progress: 0 });
    });
    expect(status()).toBe('dict.results.loadingModelPct:0');

    await act(async () => {
      emitModelProgress?.({ status: 'progress', progress: 45.4 });
    });
    expect(status()).toBe('dict.results.loadingModelPct:45');
  });

  it('goes back to translating once the model reports ready', async () => {
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);
    await loadExamples();

    await act(async () => {
      emitModelProgress?.({ status: 'progress', progress: 80 });
    });
    expect(status()).toBe('dict.results.loadingModelPct:80');

    await act(async () => {
      emitModelProgress?.({ status: 'ready', progress: 100 });
    });
    expect(status()).toBe('dict.results.translatingExamples');
  });

  it('clears the status entirely once the translations arrive', async () => {
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);
    await loadExamples();

    await act(async () => {
      emitModelProgress?.({ status: 'progress', progress: 20 });
    });
    expect(status()).toBe('dict.results.loadingModelPct:20');

    await act(async () => {
      releaseTranslate?.();
    });
    expect(host.querySelector('.dict-ex-status')).toBeNull();
  });

  /**
   * `translator.ts`'s `onModelProgress` holds ONE global callback, so a listener that outlives its
   * component would take a reader's or the Translate view's progress away. This one unsubscribes.
   */
  it('unsubscribes from model progress when the panel goes away', async () => {
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);
    await loadExamples();
    expect(unsubscribes).toBe(0);

    await act(async () => root?.unmount());
    root = null;

    expect(unsubscribes).toBeGreaterThan(0);
  });
});
