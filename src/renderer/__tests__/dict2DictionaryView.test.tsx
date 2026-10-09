// @vitest-environment jsdom
/** dict2 — the Dictionary page's recent-lookup chips and the saved-search toggle. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({
  default: ({ query }: { query: string }) => <div data-testid="results">{query}</div>,
}));
vi.mock('../components/lexicon/NotesBrowser', () => ({ default: () => null }));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarField: ({ children }: { children: ReactNode }) => <>{children}</>,
  StatusBarSpacer: () => null,
}));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
  }),
}));
vi.mock('../studyEnvironment', () => ({
  STUDY_LANG_KEY: 'jp-study-language',
  getStudyLang: () => 'ja',
  setStudyLang: () => undefined,
  onStudyLangChanged: () => () => undefined,
}));

import DictionaryView, { recentLookupChips } from '../views/DictionaryView';
import { LOOKUP_HISTORY_STORAGE_KEY, recordLookup, type LookupHistoryEntry } from '../lookupHistory';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => localStorage.clear());
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root?.render(<DictionaryView />));
  return host;
}

describe('recentLookupChips', () => {
  it('keeps the current language, newest first, capped', () => {
    const entry = (lemma: string, lang: 'ja' | 'zh', at: number): LookupHistoryEntry => ({
      query: lemma, lemma, lang, at, firstAt: at, count: 1, lookupTimes: [at],
    });
    const history = [entry('猫', 'ja', 3), entry('狗', 'zh', 2), entry('犬', 'ja', 1)];
    expect(recentLookupChips(history, 'ja').map((e) => e.lemma)).toEqual(['猫', '犬']);
    expect(recentLookupChips(history, 'ja', 1).map((e) => e.lemma)).toEqual(['猫']);
  });
});

describe('Dictionary page history', () => {
  it('shows recent lookups and runs one on click; clearing empties the strip', async () => {
    recordLookup({ query: '食べた', lemma: '食べる', lang: 'ja' }, 1000);
    recordLookup({ query: '食べる', lemma: '食べる', lang: 'ja' }, 2000);
    recordLookup({ query: '狗', lemma: '狗', lang: 'zh' }, 3000);
    const host = await mount();
    const chips = [...host.querySelectorAll<HTMLButtonElement>('.dict-recent-chip')];
    expect(chips.map((c) => c.textContent)).toEqual(['食べる dict2.history.times:2']);
    await act(async () => chips[0].click());
    expect(host.querySelector('[data-testid="results"]')?.textContent).toBe('食べる');

    const clear = [...host.querySelectorAll<HTMLButtonElement>('.dict-recent button')].find(
      (b) => b.textContent === 'dict2.history.clear',
    );
    await act(async () => clear?.click());
    expect(host.querySelector('.dict-recent')).toBeNull();
    expect(JSON.parse(localStorage.getItem(LOOKUP_HISTORY_STORAGE_KEY) ?? '[]')).toEqual([]);
  });

  it('turns Save search into a pressed toggle once the search is saved', async () => {
    const host = await mount();
    const input = host.querySelector<HTMLInputElement>('form.dict-search input')!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setter.call(input, '猫');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      host.querySelector('form.dict-search')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    const toggle = () => host.querySelector<HTMLButtonElement>('.dict-saved-searches-head button[aria-pressed]')!;
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    await act(async () => toggle().click());
    expect(toggle().getAttribute('aria-pressed')).toBe('true');
    expect(toggle().textContent).toBe('dict2.saved.savedToggle');
    expect(host.querySelector('.dict-saved-search button[aria-label]')?.getAttribute('aria-label')).toBe(
      'dict2.saved.removeNamed:猫',
    );
    await act(async () => toggle().click());
    expect(toggle().getAttribute('aria-pressed')).toBe('false');
    expect(host.querySelector('.dict-saved-search')).toBeNull();
  });
});
