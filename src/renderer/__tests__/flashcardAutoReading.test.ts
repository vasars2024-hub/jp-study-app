// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// kuromoji's 20 MB IPADIC is not built in a unit run, so the tokenizer is the
// one thing stubbed. Everything below it — the alignment in shared/furigana, the
// selection rules, the persisted deck write — is the real code.
const tokenizeSync = vi.fn();
const getTokenizer = vi.fn(async () => ({}) as never);
vi.mock('../tokenizer', () => ({
  getTokenizer: (...args: unknown[]) => getTokenizer(...(args as [])),
  tokenizeSync: (...args: unknown[]) => tokenizeSync(...(args as [])),
}));

import {
  addDeckCardsTracked,
  loadDeck,
  updateDeckCardReadingBatch,
} from '../flashcardDeck';
import {
  annotateNewCards,
  loadAutoReadingPreferences,
  readingForText,
  saveAutoReadingPreferences,
  type AutoReadingReport,
} from '../flashcardAutoReading';
import { DEFAULT_AUTO_READING_PREFERENCES } from '../../shared/flashcardAutoReading';

const ALL_ON = {
  ...DEFAULT_AUTO_READING_PREFERENCES,
  epub: true,
  extension: true,
  media: true,
  import: true,
};

/** IPADIC hands back katakana readings; that is what alignment has to survive. */
function token(surface: string, reading?: string) {
  return { surface, lemma: surface, content: true, proper: false, pos: '名詞', posDetail: '*', reading };
}

beforeEach(() => {
  localStorage.clear();
  tokenizeSync.mockReset();
  getTokenizer.mockReset();
  getTokenizer.mockResolvedValue({} as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rendering one line into a reading', () => {
  it('produces Anki bracket ruby over the kanji runs only', () => {
    tokenizeSync.mockReturnValue([token('食べる', 'タベル')]);
    expect(readingForText('食べる', 'furigana')).toBe('食[た]べる');
  });

  it('produces the whole line in kana when that form is chosen', () => {
    tokenizeSync.mockReturnValue([token('食べる', 'タベル')]);
    expect(readingForText('食べる', 'kana')).toBe('たべる');
  });

  it('joins several tokens into one line', () => {
    tokenizeSync.mockReturnValue([token('日本', 'ニホン'), token('語', 'ゴ')]);
    expect(readingForText('日本語', 'furigana')).toBe('日本[にほん] 語[ご]');
  });

  it('returns nothing when IPADIC recognised none of it', () => {
    // The surface handed back unchanged is not a reading, and writing it would
    // make an unreadable card look annotated.
    tokenizeSync.mockReturnValue([token('鿃'), token('鿄')]);
    expect(readingForText('鿃鿄', 'furigana')).toBe('');
    expect(readingForText('鿃鿄', 'kana')).toBe('');
  });
});

describe('annotating a freshly mined batch', () => {
  it('is off by default, and returns null rather than running', async () => {
    addDeckCardsTracked([{ word: '猫', reading: '', meaning: 'cat', source: 'epub' }]);
    expect(await annotateNewCards(loadDeck())).toBeNull();
    expect(tokenizeSync).not.toHaveBeenCalled();
  });

  it('writes readings onto the chosen cards and reports the count', async () => {
    tokenizeSync.mockReturnValue([token('食べる', 'タベル')]);
    const created = addDeckCardsTracked([
      { word: '食べる', reading: '', meaning: 'to eat', source: 'epub' },
    ]);

    const report = await annotateNewCards(created, ALL_ON);

    expect(report).toMatchObject({ added: 1, failed: 0, deferred: 0 });
    expect(loadDeck()[0].reading).toBe('食[た]べる');
  });

  it('counts the cards it could not read instead of leaving them silent', async () => {
    // A card with an empty reading looks exactly like one that never needed a
    // reading, so the run has to say so out loud.
    tokenizeSync.mockReturnValue([token('鿃')]);
    const created = addDeckCardsTracked([
      { word: '鿃', reading: '', meaning: '?', source: 'media' },
    ]);

    const report = await annotateNewCards(created, ALL_ON);

    expect(report).toMatchObject({ added: 0, failed: 1 });
    expect(loadDeck()[0].reading).toBe('');
  });

  it('names a tokenizer that would not build, and writes nothing at all', async () => {
    getTokenizer.mockRejectedValue(new Error('dict missing'));
    const created = addDeckCardsTracked([
      { word: '食べる', reading: '', meaning: 'to eat', source: 'import' },
    ]);

    const report = await annotateNewCards(created, ALL_ON);

    expect(report).toMatchObject({ added: 0, failed: 1, tokenizerUnavailable: true });
    expect(tokenizeSync).not.toHaveBeenCalled();
    expect(loadDeck()[0].reading).toBe('');
  });

  it('announces what it did so the panel does not have to poll', async () => {
    tokenizeSync.mockReturnValue([token('食べる', 'タベル')]);
    const seen: AutoReadingReport[] = [];
    const handler = (event: Event): void => {
      seen.push((event as CustomEvent<AutoReadingReport>).detail);
    };
    window.addEventListener('flashcard-auto-reading', handler);

    await annotateNewCards(
      addDeckCardsTracked([{ word: '食べる', reading: '', meaning: '', source: 'epub' }]),
      ALL_ON,
    );
    window.removeEventListener('flashcard-auto-reading', handler);

    expect(seen).toHaveLength(1);
    expect(seen[0].added).toBe(1);
  });
});

describe('the persisted batch write', () => {
  it('refuses to overwrite an authored reading even when told to', async () => {
    // The guard lives in the deck write, not only in the selection, so it holds
    // whoever calls it.
    const [card] = addDeckCardsTracked([
      { word: '日本', reading: 'にっぽん', meaning: 'Japan', source: 'import' },
    ]);

    updateDeckCardReadingBatch([{ id: card.id, reading: '日本[にほん]' }]);

    expect(loadDeck()[0].reading).toBe('にっぽん');
  });

  it('leaves cards nobody named alone', () => {
    const [a, b] = addDeckCardsTracked([
      { word: '猫', reading: '', meaning: 'cat', source: 'epub' },
      { word: '犬', reading: '', meaning: 'dog', source: 'epub' },
    ]);

    updateDeckCardReadingBatch([{ id: a.id, reading: 'ねこ' }]);

    const deck = loadDeck();
    expect(deck.find((card) => card.id === a.id)?.reading).toBe('ねこ');
    expect(deck.find((card) => card.id === b.id)?.reading).toBe('');
  });
});

describe('preference storage', () => {
  it('round-trips, and a corrupt store falls back to the defaults', () => {
    const saved = saveAutoReadingPreferences({ ...ALL_ON, form: 'kana', maxPerBatch: 25 });
    expect(saved).toMatchObject({ form: 'kana', maxPerBatch: 25, epub: true });
    expect(loadAutoReadingPreferences()).toEqual(saved);

    localStorage.setItem('jp-flashcard-auto-reading-v1', '{ not json');
    expect(loadAutoReadingPreferences()).toEqual(DEFAULT_AUTO_READING_PREFERENCES);
  });
});
