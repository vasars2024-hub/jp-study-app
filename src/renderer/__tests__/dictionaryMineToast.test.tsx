// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

/**
 * "+ Add" in the dictionary mines in two steps: the local card is saved first,
 * so nothing below it can lose the card, and the Anki half joins the same card
 * once examples and translations are ready. The second step found the card the
 * first had just made, reported `created: false`, and toasted "Already in your
 * deck" for a word that had never been mined before. One Add, one toast, and
 * the toast reflects that the card is new.
 */
const toasts = vi.hoisted(() => [] as Array<{ message: string; kind?: string }>);
vi.mock('../components/ui/Toast', () => ({
  showToast: (t: { message: string; kind?: string }) => {
    toasts.push(t);
  },
}));
vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }), t: (key: string) => key }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import { loadDeck } from '../flashcardDeck';

const ENTRY = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'] }],
};

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  toasts.length = 0;
  host = document.createElement('div');
  document.body.append(host);
  const result = { query: '食べる', entries: [ENTRY] } as DictResult;
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    // A setup that has never had Anki: the mine stays local.
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [], error: "Can't reach Anki." })),
    ankiLinkState: vi.fn(async () => ({ state: 'disconnected' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    ankiMineNote: vi.fn(async () => ({ ok: false, error: "Can't reach Anki." })),
    searchExamples: vi.fn(async () => ({ query: '食べる', examples: [] })),
    dictConjugation: vi.fn(async () => ({ query: '食べる', forms: [] })),
  };
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe('dictionary Add toast', () => {
  it('says a new card was saved, once, not that it was already there', async () => {
    root = createRoot(host);
    await act(async () => {
      root?.render(<DictionaryResults query="食べる" variant="page" lang="ja" />);
    });
    const add = [...host.querySelectorAll('button')].find((b) =>
      /dict\.results\.add|add to anki/i.test(b.textContent || ''),
    );
    expect(add, 'the "+ Add" button must be on screen').not.toBeUndefined();
    await act(async () => {
      add?.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(loadDeck().filter((card) => card.word === '食べる')).toHaveLength(1);
    expect(toasts.map((t) => t.message)).toEqual(['studyMine.toast.saved']);
  });
});
