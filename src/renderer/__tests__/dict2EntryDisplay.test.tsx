// @vitest-environment jsdom
/**
 * dict2 — the Yomitan-grade entry row: per-corpus frequency chips, the pitch contour
 * with its downstep number on the page variant, explained part-of-speech tags, the
 * de-inflection chain as steps, "in deck / in Anki" before Add, the kanji breakdown,
 * and keyboard travel between entries.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictEntry, DictResult } from '../../shared/types';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
// The page variant's unasked expansion panels are not the subject here.
vi.mock('../components/lexicon/ConjugationTable', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconCollocations', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconCompounds', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconExamples', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconEtymology', () => ({ default: () => null }));
vi.mock('../components/lexicon/WordFrequency', () => ({ default: () => null }));
vi.mock('../components/lexicon/LexiconXrefs', () => ({ default: () => null }));
vi.mock('../components/lexicon/EntryNote', () => ({ default: () => null }));
vi.mock('../components/lexicon/EntryExplain', () => ({ default: () => null }));
vi.mock('../components/lexicon/SemanticNeighbors', () => ({ default: () => null }));
vi.mock('../components/lexicon/WordAudio', () => ({ default: () => null }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

import DictionaryResults from '../components/DictionaryResults';
import * as flashcardDeck from '../flashcardDeck';
import { resetWordFrequencyCache } from '../dictFrequencyCache';
import { resetPitchCache } from '../pitchLookupCache';
import { resetAnkiPresenceCache } from '../dictEntryPresence';

const TABERU: DictEntry = {
  word: '食べる',
  reading: 'たべる',
  isCommon: true,
  jlpt: [],
  senses: [{ partsOfSpeech: ['v1', 'vt', 'zz-unknown'], definitions: ['to eat'], tags: [] }],
};
const TABEMONO: DictEntry = {
  word: '食べ物',
  reading: 'たべもの',
  isCommon: true,
  jlpt: [],
  senses: [{ partsOfSpeech: ['n'], definitions: ['food'], tags: [] }],
};

interface ApiOptions {
  result?: Partial<DictResult>;
  frequency?: Record<string, Array<{ corpusId: string; corpusTitle: string; rank: number }>>;
  ankiConnected?: boolean;
  duplicates?: Record<string, boolean>;
  character?: Record<string, NonNullable<DictResult['character']>>;
}

function stubApi(options: ApiOptions = {}) {
  const result: DictResult = { query: '食べた', entries: [TABERU, TABEMONO], ...options.result };
  const api = {
    lookupTerm: vi.fn(async (q: string) => {
      const facts = options.character?.[q];
      if (facts) return { query: q, entries: [], character: facts } as DictResult;
      return result;
    }),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: options.ankiConnected === true, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '食べる', examples: [] })),
    dictFrequency: vi.fn(async (word: string) => ({
      query: word,
      entries: options.frequency?.[word] ?? [],
      ...(options.frequency?.[word]?.length ? { band: 'veryCommon' } : {}),
    })),
    dictPitch: vi.fn(async (term: string) =>
      term === '食べる' ? { available: true, entries: [{ reading: 'たべる', positions: [2] }] } : { available: true, entries: [] }),
    ankiCheckDuplicates: vi.fn(async (terms: string[]) => ({
      ok: true,
      duplicates: Object.fromEntries(terms.map((term) => [term, options.duplicates?.[term] === true])),
    })),
  };
  (window as unknown as { api: Record<string, unknown> }).api = api;
  return api;
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  resetWordFrequencyCache();
  resetPitchCache();
  resetAnkiPresenceCache();
  vi.spyOn(flashcardDeck, 'loadDeck').mockReturnValue([]);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  // Let the per-entry reads (frequency, pitch, Anki) settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function entryRows(): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>('.dict-entries > .dict-entry')];
}

describe('dict2 frequency chips', () => {
  it('shows one chip per installed corpus, with the full title and band in its name', async () => {
    stubApi({
      frequency: {
        食べる: [
          { corpusId: 'jpdb', corpusTitle: 'Japanese frequency (JPDB v2.2)', rank: 357 },
          { corpusId: 'novels', corpusTitle: 'Novels', rank: 1200 },
        ],
      },
    });
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    const chips = [...entryRows()[0].querySelectorAll('.dict-freq-chip')];
    expect(chips).toHaveLength(2);
    expect(chips[0].querySelector('.dict-freq-chip-src')?.textContent).toBe('JPDB v2.2');
    expect(chips[0].getAttribute('title')).toBe(
      'dict2.freq.chipTitle:Japanese frequency (JPDB v2.2),357,lexicon.frequency.band.veryCommon',
    );
    expect(chips[1].querySelector('.dict-freq-chip-rank')?.textContent).toBe('1,200');
    // The merged single badge is replaced, not shown beside the chips.
    expect(entryRows()[0].querySelector('.dict-badge.freq')).toBeNull();
  });

  it('keeps the merged badge when no corpus ranks the word', async () => {
    stubApi({ result: { entries: [{ ...TABERU, frequency: 81, frequencySource: 'JPDB' }] } });
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    expect(entryRows()[0].querySelector('.dict-freq-chip')).toBeNull();
    expect(entryRows()[0].querySelector('.dict-badge.freq')?.textContent).toBe('#81JPDB');
  });
});

describe('dict2 pitch, part of speech, inflection', () => {
  it('draws the contour with its downstep number on the page variant too', async () => {
    stubApi();
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    const pitch = entryRows()[0].querySelector('.dict-pitch');
    expect(pitch?.getAttribute('data-pitch-source')).toBe('contour');
    expect(pitch?.querySelector('.pitch-downstep')?.textContent).toBe('[2]');
  });

  it('explains known part-of-speech codes and leaves unknown ones bare', async () => {
    stubApi();
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    const tags = [...entryRows()[0].querySelectorAll('.dict-pos .dict-pos-tag')];
    expect(tags.map((tag) => tag.tagName)).toEqual(['ABBR', 'ABBR', 'SPAN']);
    expect(tags[0].getAttribute('title')).toBe('dict2.pos.v1');
    expect(tags[1].getAttribute('title')).toBe('dict2.pos.vt');
    expect(tags[2].textContent).toBe('zz-unknown');
  });

  it('lists each de-inflection step as its own item', async () => {
    stubApi({ result: { deinflection: { source: '食べさせられた', term: '食べる', reasons: ['causative', 'passive', 'past'] } } });
    await render(<DictionaryResults query="食べさせられた" variant="page" lang="ja" />);
    const steps = [...host.querySelectorAll('.dict-deinflection-reasons [role="listitem"]')];
    expect(steps.map((s) => s.textContent)).toEqual([
      'deinflect.reason.causative',
      '›deinflect.reason.passive',
      '›deinflect.reason.past',
    ]);
  });
});

describe('dict2 in deck / in Anki before Add', () => {
  it('marks a word the local deck holds, and one Anki already has', async () => {
    vi.spyOn(flashcardDeck, 'loadDeck').mockReturnValue([
      { id: 'c1', word: '食べ物', reading: 'たべもの', meaning: 'food', source: 'dictionary', addedAt: 1 } as flashcardDeck.DeckFlashcard,
    ]);
    const api = stubApi({ ankiConnected: true, duplicates: { 食べる: true } });
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const [taberu, tabemono] = entryRows();
    expect(taberu.querySelector('.dict-presence.in-anki')?.textContent).toBe('dict2.presence.inAnki');
    expect(taberu.querySelector('.dict-presence.in-deck')).toBeNull();
    expect(tabemono.querySelector('.dict-presence.in-deck')?.textContent).toBe('dict2.presence.inDeck');
    expect(tabemono.querySelector('.dict-presence.in-anki')).toBeNull();
    expect(api.ankiCheckDuplicates).toHaveBeenCalledWith(['食べる', '食べ物'], expect.objectContaining({ deckName: expect.any(String) }));
  });

  it('never asks Anki while it is not connected', async () => {
    const api = stubApi({ ankiConnected: false });
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    expect(api.ankiCheckDuplicates).not.toHaveBeenCalled();
    expect(host.querySelector('.dict-presence')).toBeNull();
  });
});

describe('dict2 kanji breakdown', () => {
  it('stays closed until asked, then shows each character from the character dictionary', async () => {
    const api = stubApi({
      character: {
        食: {
          lang: 'ja', char: '食', strokes: 9, components: ['人', '良'], readings: ['ショク', 'た.べる'],
          meanings: ['eat', 'food'], jlpt: 'N4', sources: [],
        },
      },
    });
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    const toggle = entryRows()[0].querySelector<HTMLButtonElement>('.dict-kanji-toggle');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    const callsBefore = api.lookupTerm.mock.calls.length;
    await act(async () => {
      toggle?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    expect(api.lookupTerm.mock.calls.length).toBe(callsBefore + 1);
    expect(api.lookupTerm).toHaveBeenLastCalledWith('食', 1, 'ja');
    const row = entryRows()[0].querySelector('.dict-kanji-row');
    expect(row?.querySelector('.dict-kanji-meanings')?.textContent).toBe('eat, food');
    expect(row?.textContent).toContain('ショク · た.べる');
    expect(row?.textContent).toContain('lexicon.character.jlpt N4');
  });
});

describe('dict2 examples ranked i+1', () => {
  it('puts the sentence whose other words are all known first, and badges it', async () => {
    localStorage.setItem('jp-study-dict-lang', 'zh');
    const { setLevel, resetKnownWordsCacheForTests } = await import('../knownWords');
    resetKnownWordsCacheForTests();
    setLevel('我', 3);
    setLevel('吃', 3);
    const api = stubApi({
      result: { query: '苹果', entries: [{ word: '苹果', reading: 'píng guǒ', isCommon: true, jlpt: [], senses: [{ partsOfSpeech: [], definitions: ['apple'], tags: [] }] }] },
    });
    api.searchExamples.mockResolvedValue({
      query: '苹果',
      examples: [
        { jp: '老师批评学生偷苹果。', en: 'The teacher scolded the student for stealing apples.' },
        { jp: '我吃苹果。', en: 'I eat apples.' },
      ],
    } as never);
    await render(<DictionaryResults query="苹果" variant="popup" lang="zh" />);
    const button = host.querySelector<HTMLButtonElement>('.dict-ex-btn');
    await act(async () => {
      button?.click();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const items = [...host.querySelectorAll('.dict-ex-list > li')];
    expect(items[0].querySelector('.dict-ex-jp')?.textContent).toBe('我吃苹果。');
    expect(items[0].querySelector('.dict-ex-standing.is-iplus1')?.textContent).toBe('dict2.ex.iPlusOne');
    expect(items[1].querySelector('.dict-ex-standing')?.className).not.toContain('is-iplus1');
    localStorage.clear();
    resetKnownWordsCacheForTests();
  });
});

describe('dict2 keyboard travel between entries', () => {
  it('keeps one tab stop and moves it with the arrow keys', async () => {
    stubApi();
    await render(<DictionaryResults query="食べた" variant="page" lang="ja" />);
    const [first, second] = entryRows();
    expect(first.tabIndex).toBe(0);
    expect(second.tabIndex).toBe(-1);
    first.focus();
    await act(async () => {
      first.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    expect(document.activeElement).toBe(second);
    expect(second.tabIndex).toBe(0);
    expect(first.tabIndex).toBe(-1);
    // From a control inside an entry, plain arrows are left alone; Alt+arrow travels.
    const add = second.querySelector<HTMLButtonElement>('.dict-add');
    add?.focus();
    await act(async () => {
      add?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    });
    expect(document.activeElement).toBe(add);
    await act(async () => {
      add?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(first);
  });
});
