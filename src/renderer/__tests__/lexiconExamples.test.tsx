// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import type { LexiconExampleResult } from '../../shared/lexiconExamples';

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
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }],
};

const EXAMPLES: LexiconExampleResult = {
  query: '猫',
  examples: [
    {
      lang: 'ja',
      text: '猫が好きです。',
      translations: [
        { lang: 'en', text: 'I like cats.' },
        { lang: 'ru', text: 'Я люблю кошек.' },
      ],
      dictId: 'tatoeba',
      dictTitle: 'Tatoeba',
      sourceId: '1',
      licence: 'CC BY 2.0 FR',
    },
    {
      lang: 'ja',
      text: 'その大きな黒い猫は眠っています。',
      translations: [],
      dictId: 'tatoeba',
      dictTitle: 'Tatoeba',
      sourceId: '5',
    },
  ],
};

let exampleCalls: Array<[string, unknown]> = [];
let exampleReply: () => Promise<LexiconExampleResult> = async () => EXAMPLES;

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
    dictExamples: vi.fn(async (text: string, options: unknown) => {
      exampleCalls.push([text, options]);
      return exampleReply();
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
  exampleCalls = [];
  exampleReply = async () => EXAMPLES;
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

const section = () => host.querySelector('.lexicon-examples');
const runButton = () => host.querySelector<HTMLButtonElement>('.lexicon-examples-run');
const rows = () => [...host.querySelectorAll('.lexicon-examples-list li')];

async function click(button: HTMLButtonElement | null): Promise<void> {
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Example sentences', () => {
  it('costs nothing until the reader asks for it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(section()).not.toBeNull();
    expect(exampleCalls).toEqual([]);
    expect(rows()).toHaveLength(0);
  });

  it('asks about the matched headword, not the raw query string', async () => {
    stubApi({ query: 'ねこ', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="ねこ" variant="page" lang="ja" />);
    await click(runButton());

    expect(exampleCalls).toEqual([['猫', { sourceLangs: ['ja'] }]]);
  });

  it('shows each sentence, its translations and the corpus that supplied it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const [first, second] = rows();
    expect(first?.textContent).toContain('猫が好きです。');
    expect(first?.textContent).toContain('I like cats.');
    expect(first?.textContent).toContain('Я люблю кошек.');
    expect(first?.querySelector('.lexicon-examples-source')?.textContent)
      .toBe('lexicon.examples.credit:Tatoeba,CC BY 2.0 FR');
    // A sentence the corpus supplies no translation for still lists, with no
    // invented translation standing in for the missing one.
    expect(second?.querySelectorAll('.lexicon-examples-translation')).toHaveLength(0);
    // …and with no licence, the credit degrades to the corpus name alone rather
    // than to a "· undefined" tail.
    expect(second?.querySelector('.lexicon-examples-source')?.textContent).toBe('Tatoeba');
  });

  it('marks the queried word inside each sentence', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const marks = [...host.querySelectorAll('.lexicon-examples-sentence mark')];
    expect(marks.map((mark) => mark.textContent)).toEqual(['猫', '猫']);
  });

  it('tags the sentence and each translation with its own language', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const [first] = rows();
    expect(first?.querySelector('.lexicon-examples-sentence')?.getAttribute('lang')).toBe('ja');
    expect([...(first?.querySelectorAll('.lexicon-examples-translation') ?? [])]
      .map((node) => node.getAttribute('lang'))).toEqual(['en', 'ru']);
  });

  it('says nothing was found rather than showing an empty list', async () => {
    exampleReply = async () => ({ query: '猫', examples: [] });
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('.lexicon-examples-empty')?.textContent)
      .toBe('lexicon.examples.empty:猫');
  });

  it('reports a failed search instead of an empty one', async () => {
    exampleReply = async () => { throw new Error('no database'); };
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const error = host.querySelector('.lexicon-examples-error');
    expect(error?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.lexicon-examples-empty')).toBeNull();
  });

  it('does not render into the popup variant', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="popup" lang="ja" />);

    expect(section()).toBeNull();
  });
});
