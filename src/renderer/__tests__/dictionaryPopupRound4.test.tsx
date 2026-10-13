// @vitest-environment jsdom
/**
 * Dictionary / popup round 4 (SCORECARD "Dictionary / popup"), the renderer half,
 * against the REAL kuromoji the reader uses:
 *
 * - the popup grades the keys the reader reads (`shared/knowledgeKey`): 携帯電話
 *   grades 携帯 AND 電話, not just the first token, and shows each part's level;
 * - a results row for a compound shows its parts' combined state instead of 0;
 * - longest match across the cursor: a click on 携帯 in 携帯電話を opens on 携帯電話,
 *   with the clicked word one click away; a deliberate selection is not widened;
 * - nested lookup inside the popup, with Back (button, Backspace);
 * - keyboard: 1-4 grade, P plays the active entry's audio;
 * - the Add button says "Add again" when Anki already holds the word;
 * - frequency chips in dictionary order, pitch for the entry's own reading first.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DictResult } from '../../shared/types';

const h = vi.hoisted(() => ({
  hit: null as null | { query: string; x: number; y: number; context?: string },
  audioClicks: 0,
  inAnki: new Set<string>(),
}));

vi.mock('../components/AnkiSetup', () => ({ default: () => null }));
vi.mock('../components/Icons', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataPanel', () => ({ default: () => null }));
vi.mock('../components/lexicon/CharacterMetadataUnavailable', () => ({ default: () => null }));
vi.mock('../components/lexicon/ConjugationTable', () => ({ default: () => null }));
vi.mock('../components/lexicon/EntryNote', () => ({ default: () => null }));
vi.mock('../components/lexicon/SemanticNeighbors', () => ({ default: () => null }));
vi.mock('../components/lexicon/KanjiBreakdown', () => ({ default: () => null }));
vi.mock('../components/lexicon/EntryPitch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/lexicon/EntryPitch')>()),
  default: () => null,
}));
vi.mock('../components/lexicon/EntryFrequencies', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../components/lexicon/EntryFrequencies')>()),
  default: () => null,
}));
vi.mock('../components/lexicon/WordAudio', () => ({
  default: ({ word }: { word: string }) => (
    <button type="button" className="word-audio" aria-label={`audio ${word}`} onClick={() => { h.audioClicks += 1; }} />
  ),
}));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));
vi.mock('../translator', () => ({ translateTo: async () => '' }));
vi.mock('../wordLookup', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../wordLookup')>()),
  lookupWordAtPoint: () => h.hit,
}));
vi.mock('../dictEntryPresence', async (importOriginal) => {
  const real = await importOriginal<typeof import('../dictEntryPresence')>();
  return {
    ...real,
    deckPresenceByWord: (_deck: unknown, words: string[]) =>
      new Map(words.filter((word) => h.inAnki.has(word)).map((word) => [word, { inDeck: false, inAnki: true }])),
  };
});

import { buildRealKuromoji } from './helpers/realKuromoji';
import DictionaryPopup from '../components/DictionaryPopup';
import DictionaryResults from '../components/DictionaryResults';
import GlobalDictionaryOverlay from '../components/GlobalDictionaryOverlay';
import { getLevel, isManualLevel, resetKnownWordsCacheForTests, setLevel } from '../knownWords';
import { STUDY_LANG_KEY } from '../studyEnvironment';
import {
  combinedLevel,
  knowledgeTargets,
  knowledgeTargetsSync,
} from '../components/lexicon/knowledgeTargets';
import { acceptLongestMatch, canScanLonger, scanWindowFor } from '../components/lexicon/popupScan';
import { orderFrequencyChips } from '../components/lexicon/EntryFrequencies';
import { orderPitchEntries } from '../components/lexicon/EntryPitch';

const entry = (word: string, reading: string, definition: string) => ({
  word,
  reading,
  isCommon: true,
  jlpt: [],
  senses: [{ partsOfSpeech: ['n'], definitions: [definition], tags: [] }],
});

const ENTRIES: Record<string, ReturnType<typeof entry>> = {
  携帯電話: entry('携帯電話', 'けいたいでんわ', 'mobile phone; 電話 you carry'),
  携帯: entry('携帯', 'けいたい', 'carrying'),
  電話: entry('電話', 'でんわ', 'telephone'),
  食べる: entry('食べる', 'たべる', 'to eat'),
};

interface StubApi {
  lookupTerm: ReturnType<typeof vi.fn>;
  dictScanLongest: ReturnType<typeof vi.fn>;
}

function stubApi(scanAnswer: string | null = null): StubApi {
  const lookupTerm = vi.fn(async (query: string) => {
    const hit = ENTRIES[query];
    return { query, entries: hit ? [hit] : [] } as unknown as DictResult;
  });
  const dictScanLongest = vi.fn(async () => ({ matched: scanAnswer ?? '' }));
  (window as unknown as { api: Record<string, unknown> }).api = {
    lookupTerm,
    lookupChinese: vi.fn(async () => ({ query: '', entries: [] })),
    dictScanLongest,
    ankiStatus: vi.fn(async () => ({ connected: false, decks: [], models: [] })),
    ankiLinkState: vi.fn(async () => ({ state: 'idle' })),
    onAnkiLinkChanged: vi.fn(() => () => undefined),
    searchExamples: vi.fn(async () => ({ query: '', examples: [] })),
  };
  return { lookupTerm, dictScanLongest };
}

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  await buildRealKuromoji();
}, 60_000);

beforeEach(() => {
  localStorage.clear();
  resetKnownWordsCacheForTests();
  localStorage.setItem(STUDY_LANG_KEY, 'ja');
  host = document.createElement('div');
  document.body.append(host);
  h.hit = null;
  h.audioClicks = 0;
  h.inAnki.clear();
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
  // The scan and the knowledge keys settle on promises.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const popup = (): HTMLElement => host.querySelector<HTMLElement>('.dict-popup') as HTMLElement;
const gradeButton = (index: number): HTMLButtonElement =>
  host.querySelectorAll<HTMLButtonElement>('.wk-grade .wk-grade-btn')[index];
const lookedUp = (api: StubApi): string[] => api.lookupTerm.mock.calls.map((call) => call[0] as string);

describe('knowledge targets: the keys the reader reads', () => {
  it('a noun compound is its parts; one word is its dictionary form', async () => {
    expect(await knowledgeTargets('携帯電話', 'ja')).toEqual(['携帯', '電話']);
    expect(await knowledgeTargets('食べた', 'ja')).toEqual(['食べる']);
    expect(await knowledgeTargets('勉強する', 'ja')).toEqual(['勉強']);
    // A set phrase stays whole: its parts are not evidence.
    expect(await knowledgeTargets('気をつける', 'ja')).toEqual(['気をつける']);
  });

  it("a word is graded under the spelling the reader colours (ネコ graded as ねこ)", () => {
    setLevel('ねこ', 3);
    expect(knowledgeTargetsSync('ネコ', 'ja')).toEqual(['ねこ']);
  });

  it('the combined level of a compound is its least-known part', () => {
    setLevel('携帯', 3);
    expect(combinedLevel(['携帯', '電話'])).toBe(0);
    setLevel('電話', 2);
    expect(combinedLevel(['携帯', '電話'])).toBe(2);
  });
});

describe('popup grading', () => {
  it('grading 携帯電話 grades 携帯 and 電話 — not only the first token', async () => {
    stubApi();
    await render(<DictionaryPopup query="携帯電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    await act(async () => gradeButton(3).click());
    expect(getLevel('携帯')).toBe(3);
    expect(getLevel('電話')).toBe(3);
    expect(isManualLevel('電話')).toBe(true);
    // Nothing is filed under the compound itself: the reader never looks it up.
    expect(getLevel('携帯電話')).toBe(0);
  });

  it("shows each part's level, and the buttons show the least-known part", async () => {
    stubApi();
    setLevel('携帯', 3);
    await render(<DictionaryPopup query="携帯電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    const parts = [...host.querySelectorAll('.dict-popup-parts .wk-part')].map((el) => el.className);
    expect(parts).toEqual(['wk-part wk-g-3', 'wk-part wk-g-0']);
    expect(gradeButton(0).getAttribute('aria-pressed')).toBe('true');
    // Another surface grading a part shows up here at once.
    await act(async () => setLevel('電話', 1));
    expect(gradeButton(1).getAttribute('aria-pressed')).toBe('true');
  });

  it('an inflected word grades its dictionary form, with no parts row', async () => {
    stubApi();
    await render(<DictionaryPopup query="食べた" x={10} y={10} lang="ja" onClose={() => undefined} />);
    await act(async () => gradeButton(2).click());
    expect(getLevel('食べる')).toBe(2);
    expect(getLevel('食べた')).toBe(0);
    expect(host.querySelector('.dict-popup-parts')).toBeNull();
  });

  it('1-4 on the keyboard grade the word', async () => {
    stubApi();
    await render(<DictionaryPopup query="食べた" x={10} y={10} lang="ja" onClose={() => undefined} />);
    await act(async () => {
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: '2', bubbles: true }));
    });
    expect(getLevel('食べる')).toBe(1);
  });
});

describe('results row for a compound', () => {
  it('shows the parts\' combined state instead of 0, and grading it grades the parts', async () => {
    stubApi();
    setLevel('携帯', 3);
    setLevel('電話', 1);
    await render(<DictionaryResults query="携帯電話" variant="page" lang="ja" />);
    const chip = host.querySelector<HTMLButtonElement>('.lexicon-knowledge');
    expect(chip?.className).toContain('wk-g-1');
    expect(chip?.getAttribute('aria-label')).toContain('dict4.knowledge.partsAction');
    expect(chip?.getAttribute('aria-label')).toContain('携帯 lexicon.knowledge.known');
    await act(async () => chip?.click());
    expect(getLevel('携帯')).toBe(2);
    expect(getLevel('電話')).toBe(2);
  });
});

describe('longest match across the cursor', () => {
  it('pure helpers: the window, whether to ask, and what to accept', () => {
    expect(scanWindowFor('携帯', '昨日、携帯電話を買った。')).toBe('携帯電話を買った。');
    expect(scanWindowFor('猫', '犬が好き')).toBe('');
    expect(canScanLonger('携帯', '携帯電話を買った')).toBe(true);
    expect(canScanLonger('携帯', '携帯。')).toBe(false);
    expect(canScanLonger('携帯', '携帯')).toBe(false);
    expect(canScanLonger('cat', 'catalog')).toBe(false);
    expect(acceptLongestMatch('携帯', '携帯電話')).toBe('携帯電話');
    expect(acceptLongestMatch('携帯', '携帯')).toBe('');
    expect(acceptLongestMatch('携帯電話', '携帯')).toBe('');
    expect(acceptLongestMatch('携帯', '電話')).toBe('');
  });

  it('opens on 携帯電話 from a click on 携帯, without first showing 携帯', async () => {
    const api = stubApi('携帯電話');
    await render(<DictionaryPopup query="携帯" context="携帯電話を使う" x={10} y={10} lang="ja" onClose={() => undefined} />);
    expect(api.dictScanLongest).toHaveBeenCalledWith('携帯電話を使う', 'ja');
    expect(lookedUp(api)).toEqual(['携帯電話']);
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯電話');

    // The clicked word is one click away.
    const options = [...host.querySelectorAll<HTMLButtonElement>('.dict-scan-opt')];
    expect(options.map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['携帯電話', 'true'],
      ['携帯', 'false'],
    ]);
    await act(async () => options[1].click());
    await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯');
    expect(lookedUp(api)).toContain('携帯');
  });

  it('does not ask when nothing longer can follow, or when the text was selected on purpose', async () => {
    const api = stubApi('携帯電話');
    await render(<DictionaryPopup query="携帯" context="携帯。" x={10} y={10} lang="ja" onClose={() => undefined} />);
    expect(api.dictScanLongest).not.toHaveBeenCalled();
    await act(async () => root?.unmount());
    root = null;

    await render(<DictionaryPopup query="携帯" context="携帯電話を使う" scan={false} x={10} y={10} lang="ja" onClose={() => undefined} />);
    expect(api.dictScanLongest).not.toHaveBeenCalled();
    expect(lookedUp(api)).toEqual(['携帯', '携帯']);
  });

  it('a word the user selected by hand in a reader is not widened', async () => {
    const api = stubApi('携帯電話');
    const text = document.createElement('p');
    text.textContent = '携帯電話を使う';
    document.body.append(text);
    const range = document.createRange();
    range.setStart(text.firstChild as Text, 0);
    range.setEnd(text.firstChild as Text, 2);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await render(<DictionaryPopup query="携帯" context="携帯電話を使う" x={10} y={10} lang="ja" onClose={() => undefined} />);
    window.getSelection()?.removeAllRanges();
    expect(api.dictScanLongest).not.toHaveBeenCalled();
    expect(lookedUp(api)).toEqual(['携帯']);
  });

  it('a scan miss shows the clicked word', async () => {
    const api = stubApi('');
    await render(<DictionaryPopup query="携帯" context="携帯電話を使う" x={10} y={10} lang="ja" onClose={() => undefined} />);
    expect(lookedUp(api)).toEqual(['携帯']);
    expect(host.querySelector('.dict-scan-choice')).toBeNull();
  });
});

describe('the OS-wide overlay', () => {
  it('a view asking for a word by name gets exactly that word, never a wider match', async () => {
    const api = stubApi('携帯電話');
    await render(<GlobalDictionaryOverlay />);
    await act(async () => {
      window.dispatchEvent(new CustomEvent('dict:lookup', { detail: { query: '携帯', context: '携帯電話を使う' } }));
    });
    for (let i = 0; i < 5 && !host.querySelector('.dict-q'); i += 1) await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯');
    expect(api.dictScanLongest).not.toHaveBeenCalled();
    expect(lookedUp(api)).toEqual(['携帯']);
  });
});

describe('nested lookup', () => {
  it('a word clicked in a definition is looked up in place, and Back returns', async () => {
    const api = stubApi();
    await render(<DictionaryPopup query="携帯電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    h.hit = { query: '電話', x: 0, y: 0 };
    const sense = host.querySelector<HTMLElement>('.dict-senses li');
    expect(sense).toBeTruthy();
    await act(async () => sense?.click());
    await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('電話');
    expect(lookedUp(api).at(-1)).toBe('電話');

    const back = host.querySelector<HTMLButtonElement>('.dict-popup-back');
    expect(back?.getAttribute('aria-label')).toBe('dict4.nested.back:携帯電話');
    await act(async () => back?.click());
    await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯電話');
    expect(host.querySelector('.dict-popup-back')).toBeNull();
  });

  it('Backspace goes back too; an English word in a gloss is not looked up', async () => {
    stubApi();
    await render(<DictionaryPopup query="携帯電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    h.hit = { query: 'mobile', x: 0, y: 0 };
    await act(async () => host.querySelector<HTMLElement>('.dict-senses li')?.click());
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯電話');

    h.hit = { query: '電話', x: 0, y: 0 };
    await act(async () => host.querySelector<HTMLElement>('.dict-senses li')?.click());
    await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('電話');
    await act(async () => {
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'Backspace', bubbles: true }));
    });
    await flush();
    expect(host.querySelector('.dict-q')?.textContent).toBe('携帯電話');
  });
});

describe('audio and Anki in the popup', () => {
  it('P plays the active entry\'s audio', async () => {
    stubApi();
    await render(<DictionaryPopup query="電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    await act(async () => {
      popup().dispatchEvent(new KeyboardEvent('keydown', { key: 'p', bubbles: true }));
    });
    expect(h.audioClicks).toBe(1);
  });

  it('the Add button says "Add again" when Anki already holds the word', async () => {
    stubApi();
    h.inAnki.add('電話');
    await render(<DictionaryPopup query="電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    const add = host.querySelector<HTMLButtonElement>('.dict-add');
    expect(add?.textContent).toBe('dict4.anki.addAgain');
    expect(add?.className).toContain('is-dup-known');
    expect(add?.title).toBe('dict4.anki.addAgainTitle');
  });

  it('a word Anki does not hold keeps the plain Add', async () => {
    stubApi();
    await render(<DictionaryPopup query="電話" x={10} y={10} lang="ja" onClose={() => undefined} />);
    expect(host.querySelector('.dict-add')?.textContent).toBe('dict.results.add');
  });
});

describe('frequency and pitch display order', () => {
  it('frequency chips follow the dictionary order, not each word\'s best rank', () => {
    const ranks = [
      { corpusId: 'a', corpusTitle: 'Anime', rank: 300 },
      { corpusId: 'n', corpusTitle: 'Novels', rank: 9000 },
      { corpusId: 'x', corpusTitle: 'Unlisted', rank: 5 },
    ];
    expect(orderFrequencyChips(ranks, ['Novels', 'Anime']).map((r) => r.corpusTitle)).toEqual(['Novels', 'Anime', 'Unlisted']);
    // With no order known, best rank first, as before.
    expect(orderFrequencyChips(ranks, []).map((r) => r.corpusTitle)).toEqual(['Unlisted', 'Anime', 'Novels']);
  });

  it("pitch rows lead with the entry's own reading", () => {
    const rows = [
      { reading: 'うわて', positions: [0] },
      { reading: 'ジョウズ', positions: [3] },
      { reading: 'かみて', positions: [0] },
    ];
    expect(orderPitchEntries(rows, 'じょうず').map((r) => r.reading)).toEqual(['ジョウズ', 'うわて', 'かみて']);
    expect(orderPitchEntries(rows, '').map((r) => r.reading)).toEqual(['うわて', 'ジョウズ', 'かみて']);
  });
});
