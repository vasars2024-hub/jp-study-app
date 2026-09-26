// @vitest-environment jsdom
//
// A Russian word is looked up in Russian (audit 4): the pop-up asked
// `lookupTerm` with no language, and the main process answered «погода» with
// 天気 from JMdict's Russian glosses. The pop-up now names the word's language,
// and when no Russian dictionary is installed it says so, with a link to
// Models & dictionaries, instead of "no match" or Japanese entries. The
// live-captions bar passes its own spoken language to the pop-up.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => <div className="anki-setup-stub" /> }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key} ${JSON.stringify(vars)}` : key), lang: 'en' }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import DictionaryPopup from '../components/DictionaryPopup';

const TENKI: DictResult['entries'][number] = {
  word: '天気', reading: 'てんき', isCommon: true, jlpt: [],
  senses: [{ partsOfSpeech: ['n'], definitions: ['погода'], tags: [] }],
  source: 'JMdict (Japanese–Russian)',
} as DictResult['entries'][number];

/** The main process as it answers: unpinned = every dictionary's glosses; pinned ru = Russian only. */
function stubApi(): { lookupTerm: ReturnType<typeof vi.fn>; openSettings: ReturnType<typeof vi.fn> } {
  const lookupTerm = vi.fn(async (query: string, _limit?: number, lang?: string) =>
    (lang === 'ru'
      ? { query, entries: [], missingSourceLangs: ['ru'] }
      : { query, entries: [TENKI] }) as DictResult);
  const openSettings = vi.fn(async () => ({ ok: true }));
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm,
    lookupChinese: vi.fn(async () => ({ query: '', entries: [] }) as DictResult),
    captionsOpenSettings: openSettings,
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '', examples: [] })),
    dictConjugation: vi.fn(async () => ({ query: '', forms: [] })),
    analyzeConjugation: vi.fn(async () => null),
  };
  return { lookupTerm, openSettings };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  localStorage.clear();
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

describe('a Russian word in the dictionary pop-up', () => {
  it('is looked up as Russian, and a missing Russian dictionary is named with a way to get one', async () => {
    const { lookupTerm, openSettings } = stubApi();
    await render(<DictionaryResults query="погода" variant="popup" lang="ru" />);
    expect(lookupTerm).toHaveBeenCalledWith('погода', expect.any(Number), 'ru');
    expect(host.textContent).not.toContain('天気');
    expect(host.textContent).toContain('dict.results.noDictionary.ru {"query":"погода"}');
    expect(host.textContent).not.toContain('dict.results.noMatch');

    const link = [...host.querySelectorAll('button')].find((b) => b.textContent === 'dict.results.getDictionary');
    expect(link).toBeTruthy();
    await act(async () => link?.click());
    expect(openSettings).toHaveBeenCalledWith('dictionaries');
  });

  it('the live-captions pop-up uses the language it was given, not the app-wide one', async () => {
    const { lookupTerm } = stubApi();
    localStorage.setItem('jp-study-dict-lang', 'ja');
    await render(<DictionaryPopup query="погода" x={10} y={10} lang="ru" onClose={() => undefined} />);
    expect(lookupTerm).toHaveBeenCalledWith('погода', expect.any(Number), 'ru');
    expect(host.textContent).not.toContain('天気');
  });
});
