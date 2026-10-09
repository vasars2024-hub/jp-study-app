// @vitest-environment jsdom
/**
 * The dictionary star is a deck card, not a third store.
 *
 * Before: starred words lived in `jp-saved-words-<lang>`, lost the sentence the
 * popup passed, could not be reviewed with a kept grade, and Study Mode's
 * `source: 'dictionary'` cards were filtered out of Flashcards entirely.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({ kvGet: async () => undefined, kvSet: async () => undefined }));

import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests, reviewDeckCard } from '../flashcardDeck';
import {
  addSaved,
  loadSaved,
  loadSavedCards,
  migrateSavedWordsToDeck,
  removeSaved,
  savedWordsKey,
} from '../savedWords';

beforeEach(() => {
  localStorage.clear();
  resetDeckMemoryForTests();
});

describe('saved words on the deck', () => {
  it('migrates the legacy list once, idempotently', () => {
    localStorage.setItem(savedWordsKey('ja'), JSON.stringify([
      { word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 1 },
      { word: '犬', reading: 'いぬ', meaning: 'dog', addedAt: 2 },
      { word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 3 },
    ]));
    expect(migrateSavedWordsToDeck('ja')).toBe(2);
    expect(migrateSavedWordsToDeck('ja')).toBe(0);
    // Even with the marker lost, nothing is added twice.
    localStorage.removeItem(`${savedWordsKey('ja')}-migrated`);
    expect(migrateSavedWordsToDeck('ja')).toBe(0);
    expect(loadDeck().filter((c) => c.source === 'dictionary').map((c) => c.word).sort()).toEqual(['犬', '猫']);
    expect(loadSaved()).toHaveLength(2);
  });

  it('keeps the sentence and becomes a reviewable card whose grade is kept', () => {
    addSaved({ word: '鳥', reading: 'とり', meaning: 'bird', sentence: '鳥が飛ぶ。', addedAt: 0 });
    const [card] = loadSavedCards();
    expect(card).toMatchObject({ word: '鳥', sentence: '鳥が飛ぶ。', source: 'dictionary' });
    reviewDeckCard(card.id, 'good');
    expect(loadDeck()[0].srs?.lastRating).toBe('good');
  });

  it('un-starring removes the card, but not one already sent to Anki', () => {
    addSaved({ word: '魚', reading: '', meaning: 'fish', addedAt: 0 });
    removeSaved('魚');
    expect(loadSaved()).toHaveLength(0);
  });

  it.each([
    ['ガクセイ', 'ｶﾞｸｾｲ'],
    ['ｶﾞｸｾｲ', 'ガクセイ'],
    ['がくせい', 'か\u3099くせい'],
    ['Ｄｏｇ', 'dog'],
    ['Dog', 'ＤＯＧ'],
  ])('searches dictionary saves using the same Unicode normalization: %s / %s', (meaning, query) => {
    addSaved({ word: '単語', reading: '', meaning, addedAt: 0 });
    expect(loadSaved(query).map((word) => word.word)).toEqual(['単語']);
    expect(loadSaved(query)[0].meaning).toBe(meaning);
    expect(loadSaved('missing')).toEqual([]);
    expect(loadSaved('　')).toEqual(loadSaved());
  });

  it('honours leech searches while keeping dictionary and study-language boundaries', () => {
    addSaved({ word: '猫', reading: 'ねこ', meaning: 'cat', addedAt: 0 });
    addSaved({ word: '犬', reading: 'いぬ', meaning: 'dog', addedAt: 0 });
    const cat = loadSavedCards().find((card) => card.word === '猫')!;
    // Real lapses, as Anki counts them: an Again on a card in REVIEW state, with
    // a successful relearning answer in between. Agains on a new or relearning
    // card are not lapses, so eight Agains in a row never made a leech.
    const dueOf = (): number => loadDeck().find((card) => card.id === cat.id)!.srs!.dueAt;
    let at = Date.now() - 400 * 86_400_000;
    reviewDeckCard(cat.id, 'good', at);
    for (let i = 0; i < 8; i++) {
      at = dueOf();
      reviewDeckCard(cat.id, 'again', at);
      at = dueOf();
      reviewDeckCard(cat.id, 'good', at);
    }
    const leech = loadDeck().find((card) => card.id === cat.id)!;
    expect(leech.srs?.lapses).toBe(8);
    expect(leech.tags).toContain('leech');
    addDeckCardsTracked([
      { ...leech, word: '鳥', source: 'epub' },
      { ...leech, word: 'cat', studyLang: 'en' },
    ]);
    expect(loadSaved(' ＩＳ：ＬＥＥＣＨ ').map((word) => word.word)).toEqual(['猫']);
  });
});
