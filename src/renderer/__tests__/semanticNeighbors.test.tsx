// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';
import type { LexiconNeighborResult } from '../../shared/lexiconNeighbors';

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

const NEIGHBORS: LexiconNeighborResult = {
  query: '猫',
  probedSenses: ['cat'],
  neighbors: [
    {
      lang: 'ja',
      text: '子猫',
      reading: 'こねこ',
      dictId: 'jmdict-en',
      dictTitle: 'JMdict (English)',
      sharedSenses: ['cat', 'kitten'],
    },
  ],
};

let neighborCalls: Array<[string, unknown]> = [];
let neighborReply: () => Promise<LexiconNeighborResult> = async () => NEIGHBORS;

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
    dictSemanticNeighbors: vi.fn(async (text: string, options: unknown) => {
      neighborCalls.push([text, options]);
      return neighborReply();
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
  neighborCalls = [];
  neighborReply = async () => NEIGHBORS;
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

const section = () => host.querySelector('.lexicon-neighbors');
const runButton = () => host.querySelector<HTMLButtonElement>('.lexicon-neighbors-run');
const rows = () => [...host.querySelectorAll('.lexicon-neighbors-list li')];

async function click(button: HTMLButtonElement | null): Promise<void> {
  await act(async () => {
    button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  });
}

describe('Semantic neighbours', () => {
  it('costs nothing until the reader asks for it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(section()).not.toBeNull();
    expect(neighborCalls).toEqual([]);
    expect(rows()).toHaveLength(0);
  });

  it('asks about the matched headword, not the raw query string', async () => {
    stubApi({ query: 'ねこ', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="ねこ" variant="page" lang="ja" />);
    await click(runButton());

    expect(neighborCalls).toEqual([['猫', { sourceLangs: ['ja'] }]]);
  });

  it('names the shared gloss and the dictionary that supplied it', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const [row] = rows();
    expect(row?.textContent).toContain('子猫');
    expect(row?.textContent).toContain('こねこ');
    // The gloss the two words literally share is on screen, so the relationship
    // is checkable rather than asserted.
    expect(row?.textContent).toContain('lexicon.neighbors.shares:cat · kitten');
    expect(row?.textContent).toContain('JMdict (English)');
  });

  it('follows a neighbour when the host owns a search box, and only then', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    const onLookup = vi.fn();
    await render(<DictionaryResults query="猫" variant="page" lang="ja" onLookup={onLookup} />);
    await click(runButton());

    const link = host.querySelector<HTMLButtonElement>('.lexicon-neighbors-link');
    expect(link?.title).toBe('lexicon.lookup.word:子猫');
    await click(link);
    expect(onLookup.mock.calls).toEqual([['子猫']]);
  });

  it('leaves every neighbour a plain label in a host with nowhere to run a lookup', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    expect(rows()).not.toHaveLength(0);
    expect(host.querySelector('.lexicon-neighbors-link')).toBeNull();
  });

  it('says plainly when nothing shares a sense instead of showing an empty list', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    neighborReply = async () => ({ query: '猫', probedSenses: ['cat'], neighbors: [] });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    expect(rows()).toHaveLength(0);
    expect(host.querySelector('.lexicon-neighbors-empty')?.textContent)
      .toContain('lexicon.neighbors.empty:猫');
  });

  it('reports a failed search rather than an empty result', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    neighborReply = async () => { throw new Error('db closed'); };
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await click(runButton());

    const alert = host.querySelector('.lexicon-neighbors-error');
    expect(alert?.getAttribute('role')).toBe('alert');
    expect(host.querySelector('.lexicon-neighbors-empty')).toBeNull();
  });

  it('stays out of the pop-up, which is a glance surface', async () => {
    stubApi({ query: '猫', entries: [ENTRY] } as DictResult);
    await render(<DictionaryResults query="猫" variant="popup" lang="ja" />);

    expect(section()).toBeNull();
  });

  it('is absent when the lookup found nothing to expand', async () => {
    stubApi({ query: '存在しない語', entries: [] } as DictResult);
    await render(<DictionaryResults query="存在しない語" variant="page" lang="ja" />);

    expect(section()).toBeNull();
  });
});
