// @vitest-environment jsdom
/**
 * dict3 — Yomitan parity on the rendered entry: the conjugation trace with its
 * grammar links, one card per headword grouped or merged by dictionary with the
 * secondaries collapsed, per-sense structured HTML under its own part of speech,
 * the JMdict priority tooltip, "in Anki" across every configured deck, and the
 * per-entry audio source picker.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictEntry, DictResult } from '../../shared/types';
import type { StudyProfile } from '../../shared/profiles';

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
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
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));

const PROFILES = vi.hoisted(() => ({ list: [] as unknown[] }));
vi.mock('../profileState', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../profileState')>();
  return { ...actual, getProfiles: () => PROFILES.list };
});

import DictionaryResults from '../components/DictionaryResults';
import * as flashcardDeck from '../flashcardDeck';
import { resetWordFrequencyCache } from '../dictFrequencyCache';
import { resetPitchCache } from '../pitchLookupCache';
import { resetAnkiPresenceCache } from '../dictEntryPresence';
import { resetDictDisplayPrefsState } from '../dictDisplayPrefs';
import { resetAudioSourcesClient } from '../audioSourcesClient';
import { getActiveProfile } from '../profileState';

const NEKO_A: DictEntry = {
  word: '猫', reading: 'ねこ', isCommon: false, jlpt: [], source: 'JMdict',
  priorityTags: ['news1', 'ichi1', 'nf03'],
  senses: [{ partsOfSpeech: ['n'], definitions: ['cat'], tags: [] }],
};
const NEKO_B: DictEntry = {
  word: '猫', reading: 'ねこ', isCommon: false, jlpt: [], source: 'Jitendex',
  senses: [
    { partsOfSpeech: ['n'], definitions: ['cat'], tags: [], html: '<ul><li>cat</li></ul>' },
    { partsOfSpeech: ['n'], definitions: ['geisha'], tags: ['archaism'], html: '<ul><li>geisha</li></ul>' },
  ],
};
const NEKO_C: DictEntry = {
  word: '猫', reading: 'ねこ', isCommon: false, jlpt: [], source: 'Third',
  senses: [{ partsOfSpeech: [], definitions: ['kitty'], tags: [] }],
};

interface ApiOptions {
  result?: Partial<DictResult>;
  mode?: 'grouped' | 'merged';
  ankiConnected?: boolean;
  duplicatesByDeck?: Record<string, string[]>;
  audioSources?: Array<{ id: string; kind: 'jpod101' | 'local'; enabled: boolean; folder?: string }>;
}

function stubApi(options: ApiOptions = {}) {
  const result: DictResult = { query: '猫', entries: [NEKO_A, NEKO_B, NEKO_C], ...options.result };
  const api = {
    lookupTerm: vi.fn(async () => result),
    lookupChinese: vi.fn(async () => result),
    ankiStatus: vi.fn(async () => ({ connected: options.ankiConnected === true, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '猫', examples: [] })),
    dictFrequency: vi.fn(async (word: string) => ({ query: word, entries: [] })),
    dictPitch: vi.fn(async () => ({ available: true, entries: [] })),
    dictDisplayPrefsGet: vi.fn(async () => ({ mode: options.mode ?? 'grouped', collapseSecondary: true })),
    dictListSources: vi.fn(async () => [
      { id: 'jitendex', title: 'Jitendex', enabled: true },
      { id: 'jmdict', title: 'JMdict', enabled: true },
      { id: 'third', title: 'Third', enabled: true },
    ]),
    profileRulesGet: vi.fn(async () => ({ schemaVersion: 2, rules: [] })),
    dictAudioSourcesGet: vi.fn(async () => ({ sources: options.audioSources ?? [{ id: 'jpod101', kind: 'jpod101', enabled: true }] })),
    dictAudioAvailability: vi.fn(async () => [
      { id: 'local-1', kind: 'local', name: 'packs', available: 'yes' },
      { id: 'jpod101', kind: 'jpod101', name: 'JapanesePod101', available: 'unknown' },
    ]),
    dictAudio: vi.fn(async () => ({ query: '猫', status: 'none' })),
    ankiCheckDuplicates: vi.fn(async (terms: string[], target: { deckName: string }) => ({
      ok: true,
      duplicates: Object.fromEntries(terms.map((term) => [term, (options.duplicatesByDeck?.[target.deckName] ?? []).includes(term)])),
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
  resetDictDisplayPrefsState();
  resetAudioSourcesClient();
  PROFILES.list = [];
  vi.spyOn(flashcardDeck, 'loadDeck').mockReturnValue([]);
});

afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function render(node: ReactNode): Promise<void> {
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await settle();
  await settle();
}

const cards = (): HTMLElement[] => [...host.querySelectorAll<HTMLElement>('.dict-entries > .dict-entry')];

describe('dict3 conjugation trace', () => {
  it('reads surface ← each step ← lemma, and links a step the grammar corpus teaches', async () => {
    stubApi({
      result: {
        query: '食べさせられなかった',
        entries: [{ ...NEKO_A, word: '食べる', reading: 'たべる', priorityTags: undefined }],
        deinflection: { source: '食べさせられなかった', term: '食べる', reasons: ['causative', 'passive/potential', 'negative', 'past'] },
      },
    });
    await render(<DictionaryResults query="食べさせられなかった" variant="page" lang="ja" />);
    const trace = host.querySelector('.dict-deinflection .dict-trace');
    expect(trace?.textContent).toBe(
      '食べさせられなかった←deinflect.reason.causative←deinflect.reason.passivePotential←deinflect.reason.negative←deinflect.reason.past←食べる',
    );
    const links = [...(trace?.querySelectorAll<HTMLButtonElement>('button.dict-trace-step') ?? [])];
    expect(links.map((b) => b.textContent)).toEqual(['deinflect.reason.causative', 'deinflect.reason.passivePotential']);
    const opened: string[] = [];
    const onOpen = (event: Event) => opened.push((event as CustomEvent<{ id: string }>).detail.id);
    window.addEventListener('grammar:open-point', onOpen);
    await act(async () => links[0].click());
    window.removeEventListener('grammar:open-point', onOpen);
    expect(opened).toEqual(['n4-causative']);
    localStorage.clear();
  });
});

describe('dict3 grouped and merged results', () => {
  it('groups one headword’s dictionaries into one card, in dictionary order, collapsed after the first', async () => {
    stubApi();
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    expect(cards()).toHaveLength(1);
    const heads = () => [...cards()[0].querySelectorAll('.dict-section-head')].map((h) => h.textContent);
    expect(heads()).toEqual(['Jitendex']);
    const toggle = cards()[0].querySelector<HTMLButtonElement>('.dict-sections-toggle');
    expect(toggle?.textContent).toBe('dict3.sections.showMore:2');
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    await act(async () => toggle?.click());
    expect(heads()).toEqual(['Jitendex', 'JMdict', 'Third']);
    expect(toggle?.textContent).toBe('dict3.sections.showFewer');
  });

  it('draws marked structured senses one by one, each under its own part of speech', async () => {
    stubApi();
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    const items = [...cards()[0].querySelectorAll('.dict-section .dict-senses > li')];
    expect(items).toHaveLength(2);
    expect(items[1].querySelector('.dict-pos-tag')?.getAttribute('title')).toBe('dict2.pos.n');
    expect(items[1].querySelector('.dict-usage-tag')?.textContent).toBe('archaism');
    expect(items[1].querySelector('.dict-sense-html')?.innerHTML).toBe('<ul><li>geisha</li></ul>');
  });

  it('merges every dictionary into one labelled list in merged mode', async () => {
    stubApi({ mode: 'merged' });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    const items = [...cards()[0].querySelectorAll('.dict-senses.is-merged > li')];
    expect(items.map((li) => li.querySelector('.dict-sense-source')?.textContent)).toEqual(['Jitendex', 'Jitendex', 'JMdict', 'Third']);
    expect(cards()[0].querySelector('.dict-sections-toggle')).toBeNull();
  });
});

describe('dict3 JMdict priority', () => {
  it('explains the word lists behind "common" when the dictionary named them', async () => {
    stubApi();
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    const badge = cards()[0].querySelector('.dict-badge.common');
    expect(badge?.getAttribute('title')).toBe(
      'dict3.prio.title\nnews1: dict3.prio.news1\nichi1: dict3.prio.ichi1\nnf03: dict3.prio.nf:1001,1500',
    );
  });

  it('adds nothing to a plain common badge without codes', async () => {
    stubApi({ result: { entries: [{ ...NEKO_C, isCommon: true }] } });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    const badge = cards()[0].querySelector('.dict-badge.common');
    expect(badge?.textContent).toBe('dict.results.common');
    expect(badge?.hasAttribute('title')).toBe(false);
  });
});

describe('dict3 in Anki across configured decks', () => {
  it('asks every deck the settings route Japanese cards to, and names where the word is', async () => {
    const active = getActiveProfile();
    PROFILES.list = [
      { ...active, id: active.id, label: 'Main', targetLang: 'ja', anki: { ...active.anki, deckName: 'Vocab', modelName: 'Lapis' } },
      { ...active, id: 'sentences', label: 'Sentences', targetLang: 'ja', anki: { ...active.anki, deckName: 'Sentences', modelName: 'Sentence', fieldMap: { term: 'Word' } } },
    ] as StudyProfile[];
    const api = stubApi({ ankiConnected: true, duplicatesByDeck: { Sentences: ['猫'] } });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    await settle();
    const decks = api.ankiCheckDuplicates.mock.calls.map((call) => (call[1] as { deckName: string }).deckName);
    expect(decks).toEqual(expect.arrayContaining(['Vocab', 'Sentences']));
    expect(api.ankiCheckDuplicates).toHaveBeenCalledWith(['猫'], { deckName: 'Sentences', modelName: 'Sentence', termField: 'Word' });
    const marker = cards()[0].querySelector('.dict-presence.in-anki');
    expect(marker?.getAttribute('title')).toBe('dict3.presence.ankiWhere:Sentences · Sentence');
  });
});

describe('dict3 audio source picker', () => {
  it('offers a per-entry source only when there is more than one, and plays from the one picked', async () => {
    const api = stubApi({
      audioSources: [
        { id: 'local-1', kind: 'local', enabled: true, folder: 'D:/packs' },
        { id: 'jpod101', kind: 'jpod101', enabled: true },
      ],
    });
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    const picker = cards()[0].querySelector<HTMLSelectElement>('select.word-audio-source');
    expect(picker).not.toBeNull();
    expect([...(picker?.options ?? [])].map((o) => o.value)).toEqual(['', 'local-1', 'jpod101']);
    await act(async () => {
      picker?.dispatchEvent(new FocusEvent('focus'));
      picker?.focus();
    });
    await settle();
    expect(api.dictAudioAvailability).toHaveBeenCalledWith({ lang: 'ja', term: '猫', reading: 'ねこ' });
    expect(picker?.options[1].textContent).toBe('dict3.audio.optionHas:packs');
    await act(async () => {
      if (picker) {
        picker.value = 'local-1';
        picker.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    await act(async () => cards()[0].querySelector<HTMLButtonElement>('.word-audio')?.click());
    expect(api.dictAudio).toHaveBeenCalledWith({ lang: 'ja', term: '猫', reading: 'ねこ', sourceId: 'local-1' });
  });

  it('keeps the single play button when only one source is enabled', async () => {
    stubApi();
    await render(<DictionaryResults query="猫" variant="page" lang="ja" />);
    expect(cards()[0].querySelector('.word-audio')).not.toBeNull();
    expect(cards()[0].querySelector('select.word-audio-source')).toBeNull();
  });
});
