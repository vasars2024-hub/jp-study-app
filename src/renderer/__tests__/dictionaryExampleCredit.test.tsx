// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult, ExampleSentence } from '../../shared/types';

// The Tatoeba credit is the whole subject here, so only the panel's incidental
// neighbours are stubbed: the Anki setup dialog, the icon sprite, and the
// character panel each pull their own IPC and none of them render the credit.
vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../i18n', () => ({ useT: () => ({ t: (key: string) => key, lang: 'en' }) }));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }],
};

function stubApi(examples: ExampleSentence[]): void {
  const result: DictResult = { query: '猫', entries: [ENTRY] } as DictResult;
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '猫', examples })),
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

function credit(): HTMLAnchorElement | null {
  return host.querySelector('.dict-ex-credit a');
}

describe('Dictionary example-sentence attribution', () => {
  it('credits Tatoeba once example sentences are on screen', async () => {
    stubApi([{ jp: '猫が好きです。', en: 'I like cats.' }]);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    // Before the fetch the panel shows only the load button — nothing to credit.
    expect(credit()).toBeNull();

    const load = host.querySelector<HTMLButtonElement>('.dict-ex-btn');
    expect(load).not.toBeNull();
    await act(async () => {
      load?.click();
    });

    expect(host.querySelectorAll('.dict-ex-list li').length).toBe(1);
    const link = credit();
    expect(link).not.toBeNull();
    expect(link?.getAttribute('href')).toBe('https://tatoeba.org');
    expect(link?.getAttribute('rel')).toBe('noreferrer');
    // The credit text is a shared catalog key, not a literal — the same key
    // Grammar renders for the same corpus.
    expect(link?.textContent).toBe('grammar.examples.tatoebaCredit');
  });

  it('does not credit a corpus it never showed anything from', async () => {
    stubApi([]);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    await act(async () => {
      host.querySelector<HTMLButtonElement>('.dict-ex-btn')?.click();
    });

    expect(host.querySelector('.dict-ex-status')).not.toBeNull();
    expect(credit()).toBeNull();
  });
});
