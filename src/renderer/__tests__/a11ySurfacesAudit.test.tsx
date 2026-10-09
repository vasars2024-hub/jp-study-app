// @vitest-environment jsdom
/**
 * a11y2 — the ARIA contract audit (helpers/ariaAudit.ts) over the surfaces the
 * accessibility review named: Settings (rail, search, two pages), a Flashcards
 * review, and Dictionary results. Each is mounted for real with the bridge
 * stubbed; the audit must find nothing.
 */
import { act, createElement, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import { auditAria, tabOrder, type AriaFinding } from './helpers/ariaAudit';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

const ENTRY = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: [] as string[],
  senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'] }],
};

const API_SHAPES: Record<string, unknown> = {
  lookupTerm: { query: '食べる', entries: [ENTRY] } as DictResult,
  lookupChinese: { query: '', entries: [] },
  ankiStatus: { connected: false, decks: [], models: [] },
  ankiLinkState: { state: 'idle' },
  searchExamples: { query: '', examples: [] },
  dictConjugation: { query: '', forms: [] },
  listLibrary: [],
  jitenGetStore: { plan: [] },
  displayList: [],
  displayGetVirtualCount: 0,
};

function stubApi(): void {
  const api = new Proxy({}, {
    get: (_t, prop) => {
      if (typeof prop !== 'string') return undefined;
      if (prop.startsWith('on')) return () => () => undefined;
      return () => Promise.resolve(prop in API_SHAPES ? API_SHAPES[prop] : null);
    },
  });
  Object.defineProperty(window, 'api', { value: api, configurable: true, writable: true });
}

const fmt = (findings: AriaFinding[]): string[] => findings.map((f) => `${f.rule}: ${f.where}${f.detail ? ` (${f.detail})` : ''}`);

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  stubApi();
  const none = (): void => undefined;
  (globalThis as Record<string, unknown>).ResizeObserver ??= class {
    observe = none;
    unobserve = none;
    disconnect = none;
  };
  Element.prototype.scrollIntoView ??= (): undefined => undefined;
  window.matchMedia ??= ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: none, removeEventListener: none, addListener: none, removeListener: none,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await new Promise((r) => setTimeout(r, 20));
  });
}

async function withSettings(node: ReactNode): Promise<void> {
  const { SettingsProvider } = await import('../components/settings/SettingsContext');
  const ctrl = {
    zoom: 1, setZoomValue: vi.fn(), bumpZoomBy: vi.fn(), seg: () => 'btn', focusSettingId: null,
    advancedMode: true, navigate: vi.fn(),
  };
  await render(createElement(SettingsProvider, { value: ctrl as never }, node));
}

describe('Settings', () => {
  it('the rail', async () => {
    const { default: SettingsNav } = await import('../components/settings/SettingsNav');
    await render(createElement(SettingsNav, { page: 'home', onNavigate: vi.fn(), advancedMode: true, onToggleAdvanced: vi.fn() }));
    expect(fmt(auditAria(host))).toEqual([]);
  });

  it('search, open with results', async () => {
    const { default: SettingsSearch } = await import('../components/settings/SettingsSearch');
    await render(createElement(SettingsSearch, { onNavigate: vi.fn() }));
    const input = host.querySelector('input') as HTMLInputElement;
    expect(input).not.toBeNull();
    await act(async () => {
      input.focus();
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
      setter?.call(input, 'theme');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(host.querySelectorAll('[role="option"]').length, 'results listed').toBeGreaterThan(0);
    expect(fmt(auditAria(host))).toEqual([]);
  });

  it('Display page', async () => {
    const { default: DisplayPage } = await import('../components/settings/pages/DisplayPage');
    await withSettings(createElement(DisplayPage));
    expect(fmt(auditAria(host))).toEqual([]);
  });

  it('Motion page', async () => {
    const { default: MotionPage } = await import('../components/settings/pages/MotionPage');
    await withSettings(createElement(MotionPage));
    expect(fmt(auditAria(host))).toEqual([]);
  });
});

describe('Flashcards review', () => {
  it('a card under review, before and after the answer is shown', async () => {
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: [
      { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1, bookTitle: 'Book' },
      { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2, bookTitle: 'Book' },
    ] }));
    const { useFlashcards, FlashcardReviewMode } = await import('../components/flashcards/FlashcardsContent');
    type State = ReturnType<typeof useFlashcards>;
    let state!: State;
    function Harness() {
      state = useFlashcards();
      return state.mode === 'review' ? <FlashcardReviewMode state={state} /> : null;
    }
    await render(<Harness />);
    await act(async () => state.startEpubReview());
    expect(host.childElementCount, 'review rendered').toBeGreaterThan(0);
    expect(fmt(auditAria(host))).toEqual([]);
    // The grading controls are reachable by Tab once the answer is up.
    const reveal = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => /show|reveal|answer/i.test(`${b.className} ${b.textContent}`));
    if (reveal) await act(async () => reveal.click());
    expect(fmt(auditAria(host))).toEqual([]);
    expect(tabOrder(host).length).toBeGreaterThan(1);
  });
});

describe('Dictionary', () => {
  it('results for a word', async () => {
    // Only the bindings the results page needs; optional panels check for theirs
    // with `typeof … === 'function'` and stay absent, as in a lean preload.
    Object.defineProperty(window, 'api', { configurable: true, writable: true, value: {
      lookupTerm: async () => API_SHAPES.lookupTerm,
      lookupChinese: async () => API_SHAPES.lookupChinese,
      ankiStatus: async () => API_SHAPES.ankiStatus,
      ankiLinkState: async () => API_SHAPES.ankiLinkState,
      onAnkiLinkChanged: () => () => undefined,
      searchExamples: async () => API_SHAPES.searchExamples,
      dictConjugation: async () => API_SHAPES.dictConjugation,
    } });
    const { default: DictionaryResults } = await import('../components/DictionaryResults');
    await render(createElement(DictionaryResults, { query: '食べる', variant: 'page', lang: 'ja' }));
    expect(host.textContent).toContain('食べる');
    expect(fmt(auditAria(host))).toEqual([]);
  });
});
