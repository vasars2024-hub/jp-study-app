// @vitest-environment jsdom
//
// The claim under test: the related-words panel shows relations a dictionary
// actually stated, grouped by the four kinds the schema documents, and marks
// which targets this install can look up — without rendering any of them as a
// link, because no panel in this column has word-click navigation. It is
// **absent**, not empty and not an error row, whenever nothing states a relation.
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import type { LexiconXrefResult } from '../../shared/lexiconXrefs';

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

const row = (over: Partial<LexiconXrefResult['xrefs'][number]>) => ({
  kind: 'syn' as const, text: 'x', lang: 'ja',
  dictId: 'wikt', dictTitle: 'Wiktionary (JA)', resolved: false, ...over,
});

// Deliberately arrives in an order that is NOT the schema's kind order, so the
// grouping is proved to reorder rather than to echo the reply.
const XREFS: LexiconXrefResult = {
  query: '犬',
  xrefs: [
    row({ kind: 'cf', text: '子犬' }),
    row({ kind: 'ant', text: '猫', resolved: true }),
    row({ kind: 'syn', text: '狗' }),
    row({ kind: 'syn', text: 'ワンちゃん', resolved: true }),
    row({ kind: 'see', text: '狼', dictTitle: 'Second source' }),
  ],
};

let xrefCalls: Array<[string, unknown]> = [];
let xrefReply: () => Promise<LexiconXrefResult> = async () => XREFS;

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
    dictXrefs: vi.fn(async (text: string, options: unknown) => {
      xrefCalls.push([text, options]);
      return xrefReply();
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
  xrefCalls = [];
  xrefReply = async () => XREFS;
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

const section = () => host.querySelector('.lexicon-xrefs');
const groups = () => [...host.querySelectorAll('.lexicon-xrefs-group')];
const words = () => [...host.querySelectorAll('.lexicon-xrefs-word')];

describe('Related words', () => {
  it('runs unasked and groups the relations in the schema’s kind order', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(xrefCalls).toEqual([['犬', { sourceLangs: ['ja'] }]]);
    expect(section()).not.toBeNull();
    expect(groups().map((g) => g.querySelector('.lexicon-xrefs-kind')?.textContent)).toEqual([
      'lexicon.xrefs.kind.syn',
      'lexicon.xrefs.kind.ant',
      'lexicon.xrefs.kind.see',
      'lexicon.xrefs.kind.cf',
    ]);
    // 狗 and ワンちゃん are the two synonyms, in reply order within their group.
    expect([...groups()[0].querySelectorAll('.lexicon-xrefs-text')].map((s) => s.textContent))
      .toEqual(['狗', 'ワンちゃん']);
  });

  it('marks a target no installed dictionary carries, and says so in words', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    const absent = words().filter((el) => el.classList.contains('is-absent'));
    expect(absent.map((el) => el.querySelector('.lexicon-xrefs-text')?.textContent)).toEqual(['狗', '狼', '子犬']);
    // The class alone is not the signal: a note in text carries the same meaning,
    // so it survives a monochrome or high-contrast rendering.
    for (const el of absent) {
      expect(el.querySelector('.lexicon-xrefs-absent-note')?.textContent)
        .toBe('lexicon.xrefs.notInstalled');
    }
    const present = words().filter((el) => !el.classList.contains('is-absent'));
    expect(present.map((el) => el.querySelector('.lexicon-xrefs-text')?.textContent)).toEqual(['ワンちゃん', '猫']);
    for (const el of present) {
      expect(el.querySelector('.lexicon-xrefs-absent-note')).toBeNull();
    }
  });

  it('renders no target as a link, because there is nowhere for one to go', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(section()?.querySelectorAll('a')).toHaveLength(0);
    expect(section()?.querySelectorAll('.lexicon-xrefs-word button')).toHaveLength(0);
  });

  it('tags each word with the language of the sense it came from', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(words().every((el) => el.getAttribute('lang') === 'ja')).toBe(true);
  });

  it('names every contributing dictionary once', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(host.querySelector('.lexicon-xrefs-source')?.textContent)
      .toBe('Wiktionary (JA) · Second source');
  });

  it('asks about the matched headword, not the raw query string', async () => {
    stubApi({ query: 'いぬ', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="いぬ" variant="page" lang="ja" />);

    expect(xrefCalls).toEqual([['犬', { sourceLangs: ['ja'] }]]);
  });

  it('is absent entirely when no dictionary states a relation', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    xrefReply = async () => ({ query: '犬', xrefs: [] });
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(section()).toBeNull();
    expect(words()).toHaveLength(0);
  });

  it('is absent, not an error row, when the read itself fails', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    xrefReply = async () => { throw new Error('db closed'); };
    await render(<DictionaryResults query="犬" variant="page" lang="ja" />);

    expect(section()).toBeNull();
  });

  it('stays out of the glance popup, like every other expansion', async () => {
    stubApi({ query: '犬', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="犬" variant="popup" lang="ja" />);

    expect(xrefCalls).toEqual([]);
    expect(section()).toBeNull();
  });
});
