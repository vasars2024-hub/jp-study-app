// @vitest-environment jsdom
//
// The claim under test: the origin panel shows the dictionary's own prose,
// attributed, and is **absent** — not empty, not an error row — whenever the
// installed dictionaries state no origin. That absence is the honest default on
// every install that has not imported a Wiktextract dump.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import type { LexiconEtymologyResult } from '../../shared/lexiconEtymology';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataUnavailable', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';

const ENTRY = {
  word: '犬',
  reading: 'いぬ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['dog'] }],
};

const ETYMOLOGY: LexiconEtymologyResult = {
  query: '犬',
  etymologies: [
    {
      lang: 'ja',
      text: 'From Old Japanese.\n\nCognate with the Ryukyuan forms.',
      dictId: 'wikt',
      dictTitle: 'Wiktionary (JA)',
      pos: 'noun',
    },
    {
      lang: 'ja',
      text: 'A second source, stating no part of speech.',
      dictId: 'other',
      dictTitle: 'Second source',
    },
  ],
};

let etymologyCalls: Array<[string, unknown]> = [];
let etymologyReply: () => Promise<LexiconEtymologyResult> = async () => ETYMOLOGY;

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
    dictEtymology: vi.fn(async (text: string, options: unknown) => {
      etymologyCalls.push([text, options]);
      return etymologyReply();
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
  etymologyCalls = [];
  etymologyReply = async () => ETYMOLOGY;
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

const section = () => host.querySelector('.lexicon-etymology');
const rows = () => [...host.querySelectorAll('.lexicon-etymology-list li')];

describe('Origin', () => {
  it('runs unasked and shows each source’s own paragraph, attributed', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(etymologyCalls).toEqual([['犬', { sourceLangs: ['ja'] }]]);
    expect(section()).not.toBeNull();
    const [first, second] = rows();
    expect(first?.querySelector('.lexicon-etymology-text')?.textContent)
      .toBe('From Old Japanese.\n\nCognate with the Ryukyuan forms.');
    expect(first?.textContent).toContain('Wiktionary (JA)');
    expect(first?.querySelector('.lexicon-etymology-pos')?.textContent).toBe('noun');
    // A source that files no part of speech gets no invented one.
    expect(second?.textContent).toContain('Second source');
    expect(second?.querySelector('.lexicon-etymology-pos')).toBeNull();
  });

  it('asks about the matched headword, not the raw query string', async () => {
    stubApi({ query: 'いぬ', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="いぬ" variant="page" lang="ja" />);

    expect(etymologyCalls).toEqual([['犬', { sourceLangs: ['ja'] }]]);
  });

  it('is absent entirely when no dictionary states an origin', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    etymologyReply = async () => ({ query: '犬', etymologies: [] });
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(section()).toBeNull();
    expect(rows()).toHaveLength(0);
  });

  it('is absent, not an error row, when the read itself fails', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    etymologyReply = async () => { throw new Error('db closed'); };
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(section()).toBeNull();
  });

  it('stays out of the glance popup, like every other expansion', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="popup" lang="ja" />);

    expect(etymologyCalls).toEqual([]);
    expect(section()).toBeNull();
  });
});
