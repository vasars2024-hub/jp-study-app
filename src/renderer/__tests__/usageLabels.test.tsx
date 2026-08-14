// @vitest-environment jsdom
//
// `DictSense.tags` has been on the shared contract since the first Jisho mapper
// and no surface has ever rendered it, from any of its three producers. These
// tests hold the render honest in both shapes a result can take: a list of
// senses (what a bundled dictionary produces, because the import strips its
// structured glossary) and a single HTML block (what a user-imported dictionary
// produces, where there are no sense boundaries left to attribute a label to).

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../components/lexicon/ConjugationTable', () => ({ default: () => null }));
vi.mock('../components/lexicon/EntryNote', () => ({ default: () => null }));
vi.mock('../components/lexicon/SemanticNeighbors', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import { entryUsageTags } from '../components/lexicon/UsageLabels';

const KISAMA = {
  word: '貴様',
  reading: 'きさま',
  isCommon: false,
  jlpt: [],
  senses: [
    { partsOfSpeech: ['n'], definitions: ['you', 'you bastard'], tags: ['colloquialism', 'derogatory'] },
  ],
};
const NEKO = {
  word: '猫',
  reading: 'ねこ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }],
};

function stubApi(result: DictResult): void {
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: result.query, examples: [] })),
  };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

const labels = (): string[] =>
  Array.from(host.querySelectorAll('.dict-usage-tag')).map((el) => el.textContent ?? '');

describe('entryUsageTags', () => {
  it('collects every sense in order and drops repeats', () => {
    expect(
      entryUsageTags({
        word: 'x',
        reading: 'x',
        isCommon: false,
        jlpt: [],
        senses: [
          { partsOfSpeech: [], definitions: ['a'], tags: ['archaism', 'colloquialism'] },
          { partsOfSpeech: [], definitions: ['b'], tags: ['colloquialism', 'Kansai-ben'] },
        ],
      }),
    ).toEqual(['archaism', 'colloquialism', 'Kansai-ben']);
  });

  it('is empty for an entry whose senses carry no tags', () => {
    expect(entryUsageTags(NEKO)).toEqual([]);
  });

  it('survives a sense with no tag field at all', () => {
    // `DictSense.tags` is declared required, but a `DictResult` crosses IPC and
    // comes out of persisted caches written before the field existed. The first
    // cut of this component read `.length` off it unguarded and took down every
    // other suite that renders a result — nine files' worth — so the absent
    // case is held here rather than left to the type.
    expect(
      entryUsageTags({
        word: 'x',
        reading: 'x',
        isCommon: false,
        jlpt: [],
        senses: [{ partsOfSpeech: [], definitions: ['a'] }],
      } as unknown as Parameters<typeof entryUsageTags>[0]),
    ).toEqual([]);
  });
});

describe('Usage labels on Lexicon results', () => {
  it('renders the dictionary’s own labels on the sense that carries them', async () => {
    stubApi({ query: '貴様', entries: [KISAMA] } as DictResult);
    await render(<DictionaryResults query="貴様" variant="page" lang="ja" />);

    expect(labels()).toEqual(['colloquialism', 'derogatory']);
    // Inside the sense list item, so a reader sees which meaning is qualified.
    expect(host.querySelector('.dict-senses li .dict-usage')).not.toBeNull();
  });

  it('leaves a sense with no tags with no labels at all', async () => {
    stubApi({ query: '猫', entries: [NEKO] } as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(labels()).toEqual([]);
    // Not an empty container either — nothing at all, so the row does not gain
    // a stray gap where a dictionary simply had nothing to say.
    expect(host.querySelector('.dict-usage')).toBeNull();
  });

  it('attributes labels to the right row when only one of two is tagged', async () => {
    stubApi({ query: '貴様', entries: [NEKO, KISAMA] } as DictResult);
    await render(<DictionaryResults query="貴様" variant="page" lang="ja" />);

    const rows = Array.from(host.querySelectorAll('.dict-entry'));
    expect(rows.length).toBe(2);
    expect(rows[0].querySelectorAll('.dict-usage-tag').length).toBe(0);
    expect(rows[1].querySelectorAll('.dict-usage-tag').length).toBe(2);
  });

  it('names what the labels are for a screen reader', async () => {
    stubApi({ query: '貴様', entries: [KISAMA] } as DictResult);
    await render(<DictionaryResults query="貴様" variant="page" lang="ja" />);

    // The labels are the dictionary's words and are never translated; only the
    // prefix that says what they are goes through i18n.
    expect(host.querySelector('.dict-usage .sr-only')?.textContent?.trim()).toBe(
      'dict.results.usage',
    );
  });

  it('collapses to the entry when the result is one structured glossary block', async () => {
    stubApi({
      query: '貴様',
      entries: [{ ...KISAMA, glossaryHtml: '<span>you</span>' }],
    } as DictResult);
    await render(<DictionaryResults query="貴様" variant="page" lang="ja" />);

    // The sense list is not rendered in this branch at all, so a per-sense-only
    // implementation would show nothing here.
    expect(host.querySelector('.dict-senses')).toBeNull();
    expect(host.querySelector('.dict-glossary-html')).not.toBeNull();
    expect(labels()).toEqual(['colloquialism', 'derogatory']);
  });

  it('renders a result whose senses have no tag field without throwing', async () => {
    // The regression that broke characterMetadataUnavailable, semanticNeighbors,
    // dictionaryExampleCredit and wordKnowledgeOverlay: their fixtures omit
    // `tags`, and an unguarded read threw during render, so nothing mounted.
    stubApi({
      query: '猫',
      entries: [{ word: '猫', reading: 'ねこ', isCommon: true, jlpt: [], senses: [{ partsOfSpeech: ['n'], definitions: ['cat'] }] }],
    } as unknown as DictResult);
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);

    expect(host.querySelector('.dict-senses')).not.toBeNull();
    expect(labels()).toEqual([]);
  });

  it('shows the labels in the popup too, where the reader has no list to fall back on', async () => {
    stubApi({ query: '貴様', entries: [KISAMA] } as DictResult);
    await render(<DictionaryResults query="貴様" variant="popup" lang="ja" />);

    expect(labels()).toEqual(['colloquialism', 'derogatory']);
  });
});
