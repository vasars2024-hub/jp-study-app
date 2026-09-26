// @vitest-environment jsdom
/**
 * The Dictionary window serves every study language (round-4 journeys audit).
 *
 * Gum studies Japanese, Chinese and Russian. The Dictionary window was a
 * two-way 日本語 / 中文 switch keyed on `lang === 'zh'`, so with Russian as the
 * study language it showed 日本語 as selected, "Search Japanese or English —
 * offline JMdict dictionaries", a 食べる placeholder and "JMdict / Jisho" as its
 * source, and offered no way to pick Russian.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { CATALOGS } from '../../shared/i18n/catalogs/all';

let studyLang = 'ru';
const setStudyLang = vi.fn((lang: string) => {
  studyLang = lang;
});

vi.mock('../lexiconHandoffClient', () => ({
  takeLexiconHandoff: vi.fn(async () => ({ ok: true, handoff: null })),
  onLexiconHandoffStaged: vi.fn(() => () => undefined),
}));
vi.mock('../components/lexicon/LexiconWorkbenchResults', () => ({
  default: ({ query, lang }: { query: string; lang: string }) => <div data-testid="results" data-lang={lang}>{query}</div>,
}));
vi.mock('../components/lexicon/NotesBrowser', () => ({ default: () => null }));
vi.mock('../components/ui', () => ({
  AppChrome: ({ children, status }: { children: ReactNode; status: ReactNode }) => (
    <>
      <div data-testid="status">{status}</div>
      {children}
    </>
  ),
  StatusBarField: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  StatusBarSpacer: () => null,
}));
vi.mock('../studyEnvironment', () => ({
  STUDY_LANG_KEY: 'jp-study-language',
  getStudyLang: () => studyLang,
  setStudyLang: (lang: string) => setStudyLang(lang),
  onStudyLangChanged: () => () => undefined,
}));

import DictionaryView from '../views/DictionaryView';

const en = (key: string): string => String(CATALOGS.en[key]);
let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
afterEach(() => {
  act(() => root?.unmount());
  root = null;
  document.body.replaceChildren();
});

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<DictionaryView />);
  });
}

const pressed = (): string[] =>
  [...host.querySelectorAll<HTMLButtonElement>('.dict-lang-toggle button[aria-pressed="true"]')].map((b) => b.textContent ?? '');

describe('Dictionary window, per study language', () => {
  it('with Russian studied, Русский is selected and the copy is Russian-dictionary copy', async () => {
    studyLang = 'ru';
    await mount();
    expect(pressed()).toEqual(['Русский']);
    expect(host.textContent).toContain(en('dict.view.desc.ru'));
    expect(host.textContent).not.toContain(en('dict.view.desc.ja'));
    expect(host.querySelector('input')?.placeholder).toBe(en('dict.view.placeholder.ru'));
    expect(host.querySelector('[data-testid="status"]')?.textContent).toContain(en('dict.view.source.ru'));
  });

  it('offers all three dictionaries and switches the study language', async () => {
    studyLang = 'ja';
    await mount();
    const labels = [...host.querySelectorAll('.dict-lang-toggle button')].map((b) => b.textContent);
    expect(labels).toEqual(['日本語', '中文', 'Русский']);
    expect(pressed()).toEqual(['日本語']);
    await act(async () => {
      [...host.querySelectorAll<HTMLButtonElement>('.dict-lang-toggle button')][2].click();
    });
    expect(setStudyLang).toHaveBeenLastCalledWith('ru');
    expect(pressed()).toEqual(['Русский']);
  });
});
