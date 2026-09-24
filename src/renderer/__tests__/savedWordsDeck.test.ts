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

import { loadDeck, resetDeckMemoryForTests, reviewDeckCard } from '../flashcardDeck';
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
});
