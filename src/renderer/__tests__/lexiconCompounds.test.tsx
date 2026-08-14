// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import {
  splitCompoundText,
  type LexiconCompoundResult,
} from '../../shared/lexiconCompounds';

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

const COMPOUNDS: LexiconCompoundResult = {
  query: '猫',
  compounds: [
    {
      lang: 'ja',
      text: '子猫',
      reading: 'こねこ',
      dictId: 'jmdict-en',
      dictTitle: 'JMdict (English)',
      gloss: 'kitten',
    },
    {
      lang: 'ja',
      text: '猫背',
      reading: 'ねこぜ',
      dictId: 'jmdict-en',
      dictTitle: 'JMdict (English)',
    },
  ],
};

let compoundCalls: Array<[string, unknown]> = [];
let compoundReply: () => Promise<LexiconCompoundResult> = async () => COMPOUNDS;

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
    dictCompounds: vi.fn(async (text: string, options: unknown) => {
      compoundCalls.push([text, options]);
      return compoundReply();
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
  compoundCalls = [];
  compoundReply = async () => COMPOUNDS;
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

const section = () => host.querySelector('.lexicon-compounds');
const runButton = () => host.querySelector<HTMLButtonElement>('.lexicon-compounds-run');
const rows = () => [...host.querySelectorAll('.lexicon-compounds-list li')];

async function click(button: HTMLButtonElement | null): Promise<void> {
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('splitCompoundText', () => {
  it('marks every occurrence of the query inside the word', () => {
    expect(splitCompoundText('猫背', '猫')).toEqual([
      { text: '猫', match: true },
      { text: '背', match: false },
    ]);
    expect(splitCompoundText('子猫', '猫')).toEqual([
      { text: '子', match: false },
      { text: '猫', match: true },
    ]);
    expect(splitCompoundText('猫も杓子も猫', '猫')).toEqual([
      { text: '猫', match: true },
      { text: 'も杓子も', match: false },
      { text: '猫', match: true },
    ]);
  });

  // A row can match on the folded index and still not contain the query as it was
  // typed. Marking a guessed offset there would highlight a span the reader cannot
  // check, so the whole word stays unmarked instead.
  it('marks nothing when the displayed word does not contain the query as typed', () => {
    expect(splitCompoundText('ネコ科', '猫')).toEqual([{ text: 'ネコ科', match: false }]);
    expect(splitCompoundText('子猫', '  ')).toEqual([{ text: '子猫', match: false }]);
  });
});

describe('Words containing this one', () => {
  it('costs nothing until the reader asks for it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(section()).not.toBeNull();
    expect(compoundCalls).toEqual([]);
    expect(rows()).toHaveLength(0);
  });

  it('asks about the matched headword, not the raw query string', async () => {
    stubApi({ query: 'ねこ', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="ねこ" variant="page" lang="ja" />);
    await click(runButton());

    expect(compoundCalls).toEqual([['猫', { sourceLangs: ['ja'] }]]);
  });

  it('shows the word, its reading, its gloss and the dictionary that supplied it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const [first, second] = rows();
    expect(first?.textContent).toContain('子猫');
    expect(first?.textContent).toContain('こねこ');
    expect(first?.textContent).toContain('kitten');
    expect(first?.textContent).toContain('JMdict (English)');
    // A compound the dictionary carries no gloss for still lists, without an
    // invented meaning standing in for the missing one.
    expect(second?.textContent).toContain('猫背');
    expect(second?.querySelector('.lexicon-compounds-gloss')).toBeNull();
  });

  it('marks the queried word inside each compound', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    expect(rows().map((row) => row.querySelector('mark')?.textContent)).toEqual(['猫', '猫']);
  });

  it('says plainly when nothing contains the word instead of showing an empty list', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    compoundReply = async () => ({ query: '猫', compounds: [] });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('.lexicon-compounds-empty')?.textContent)
      .toContain('lexicon.compounds.empty:猫');
  });

  it('reports a failed search rather than an empty result', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    compoundReply = async () => { throw new Error('db closed'); };
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const alert = host.querySelector('.lexicon-compounds-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.lexicon-compounds-empty')).toBeNull();
  });

  it('stays out of the pop-up, which is a glance surface', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="popup" lang="ja" />);

    expect(section()).toBeNull();
  });
});
