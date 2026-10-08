// @vitest-environment jsdom
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

// The subject is the knowledge overlay on a result row, so everything the row
// renders around it that would need its own IPC is stubbed out. `knownWords`
// itself is deliberately NOT stubbed: the whole point of the slice is that the
// list reads and writes the same localStorage store the popup does.
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
import { KNOWLEDGE_LEVEL_KEYS } from '../components/lexicon/WordKnowledge';
import { getLevel, knowledgeKey, setLevel, WK_LEVELS } from '../knownWords';
import { STUDY_LANG_EVENT, STUDY_LANG_KEY } from '../studyEnvironment';

const TABERU = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['v1'], definitions: ['to eat'] }],
};
const NOMU = {
  word: '飲む',
  reading: 'のむ',
  isCommon: true,
  jlpt: ['N5'],
  senses: [{ partsOfSpeech: ['v5m'], definitions: ['to drink'] }],
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

/**
 * `knownWords` memoizes the parsed store at module scope and drops that cache
 * on a `storage` event or a study-language change — never on a bare
 * `localStorage.clear()`, which fires nothing in the same window. Without this
 * the second test in the file reads the first one's words. Dispatching the real
 * invalidation event is the store's own documented path, so this resets it the
 * way another window would rather than reaching into module internals.
 */
function resetKnowledgeStore(): void {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
}

beforeEach(() => {
  resetKnowledgeStore();
  host = document.createElement('div');
  document.body.append(host);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  resetKnowledgeStore();
  vi.clearAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
}

const chips = (): HTMLButtonElement[] =>
  Array.from(host.querySelectorAll<HTMLButtonElement>('.lexicon-knowledge'));

describe('Known-word overlay on Lexicon results', () => {
  it('labels every result row with the level already stored for that headword', async () => {
    // Two different levels, so a chip that ignored its own word and showed one
    // shared value would have to pick the wrong one for at least one row.
    setLevel('食べる', 3);
    setLevel('飲む', 1);
    stubApi({ query: '食べる', entries: [TABERU, NOMU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    expect(chips().map((c) => c.textContent)).toEqual([
      'lexicon.knowledge.known',
      'lexicon.knowledge.learning',
    ]);
    // The accessible name names the word, not just the level: in a list of rows
    // the control's position is otherwise the only thing that identifies it.
    expect(chips()[1].getAttribute('aria-label')).toBe(
      'lexicon.knowledge.action:飲む,lexicon.knowledge.learning,lexicon.knowledge.familiar',
    );
  });

  it('shows New for a word with nothing stored, and stores nothing for it', async () => {
    stubApi({ query: '食べる', entries: [TABERU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    expect(chips()[0].textContent).toBe('lexicon.knowledge.new');
    // Level 0 is absence, not a stored zero — the store must stay empty until
    // the reader actually grades something.
    expect(localStorage.getItem(knowledgeKey('ja'))).toBeNull();
    expect(chips()[0].className).not.toContain('active');
  });

  it('writes the level to the shared store when the chip is clicked', async () => {
    stubApi({ query: '食べる', entries: [TABERU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    await act(async () => chips()[0].click());
    expect(getLevel('食べる')).toBe(1);
    expect(chips()[0].textContent).toBe('lexicon.knowledge.learning');
    expect(chips()[0].className).toContain('active');
  });

  it('cycles through every level and back to New, pinning New by hand', async () => {
    stubApi({ query: '食べる', entries: [TABERU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);

    for (const expected of [1, 2, 3] as const) {
      await act(async () => chips()[0].click());
      expect(getLevel('食べる')).toBe(expected);
    }
    await act(async () => chips()[0].click());
    // Back to New. A hand-set New is stored as `{ l: 0, m: 1 }` so the next Anki
    // sync cannot raise the word again (knownWords.ts); it still reads as New.
    expect(getLevel('食べる')).toBe(0);
    expect(JSON.parse(localStorage.getItem(knowledgeKey('ja')) ?? '{}')).toEqual({ 食べる: { l: 0, m: 1 } });
    expect(chips()[0].textContent).toBe('lexicon.knowledge.new');
  });

  it('re-reads the store when another surface grades the same word', async () => {
    stubApi({ query: '食べる', entries: [TABERU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="page" lang="ja" />);
    expect(chips()[0].textContent).toBe('lexicon.knowledge.new');

    // What the dictionary popup, the Lens reader and an Anki sync all do.
    await act(async () => setLevel('食べる', 2));
    expect(chips()[0].textContent).toBe('lexicon.knowledge.familiar');
  });

  it('offers no chip in the popup, which grades the clicked token itself', async () => {
    stubApi({ query: '食べる', entries: [TABERU] } as DictResult);
    await render(<DictionaryResults query="食べる" variant="popup" lang="ja" />);

    expect(chips()).toHaveLength(0);
  });

  it('offers no chip when the dictionary is not the study language', async () => {
    // The store is `jp-word-knowledge-ja` here, so grading a Chinese headword
    // would write it into the Japanese vocabulary.
    localStorage.setItem(STUDY_LANG_KEY, 'ja');
    stubApi({ query: '猫', entries: [{ ...TABERU, word: '貓' }] } as DictResult);
    await render(<DictionaryResults query="貓" variant="page" lang="zh" />);

    expect(chips()).toHaveLength(0);
    expect(localStorage.getItem(knowledgeKey('zh'))).toBeNull();
  });

  it('offers the chip once the study language matches the dictionary', async () => {
    localStorage.setItem(STUDY_LANG_KEY, 'zh');
    stubApi({ query: '貓', entries: [{ ...TABERU, word: '貓' }] } as DictResult);
    await render(<DictionaryResults query="貓" variant="page" lang="zh" />);

    await act(async () => chips()[0].click());
    // And it lands in the Chinese store, not the Japanese one.
    expect(JSON.parse(localStorage.getItem(knowledgeKey('zh')) ?? '{}')).toEqual({
      貓: { l: 1, m: 1 },
    });
    expect(localStorage.getItem(knowledgeKey('ja'))).toBeNull();
  });

  it('picks the chip up when the study language is switched to match', async () => {
    // The switcher lives outside this component, so without a subscription the
    // results on screen would keep the answer they were mounted with until the
    // next lookup. Real `setStudyLang` is avoided here only because it also
    // rewrites the Whisper model tier, which is nothing to do with this.
    localStorage.setItem(STUDY_LANG_KEY, 'ja');
    stubApi({ query: '貓', entries: [{ ...TABERU, word: '貓' }] } as DictResult);
    await render(<DictionaryResults query="貓" variant="page" lang="zh" />);
    expect(chips()).toHaveLength(0);

    localStorage.setItem(STUDY_LANG_KEY, 'zh');
    await act(async () => {
      window.dispatchEvent(new CustomEvent(STUDY_LANG_EVENT, { detail: 'zh' }));
    });
    expect(chips()).toHaveLength(1);
    expect(chips()[0].textContent).toBe('lexicon.knowledge.new');
  });

  it('has exactly one label key per level the store can hold', () => {
    // A fifth level added to WK_LEVELS without a key here would render
    // `undefined` in the chip rather than fail anywhere.
    expect(KNOWLEDGE_LEVEL_KEYS).toHaveLength(WK_LEVELS.length);
  });
});
