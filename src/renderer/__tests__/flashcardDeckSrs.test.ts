// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDeckCardsTracked,
  loadDeck,
  reviewDeckCard,
  updateDeckCardAudioBatch,
} from '../flashcardDeck';

const NOW = Date.UTC(2026, 7, 12, 9);

beforeEach(() => {
  localStorage.clear();
  vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function addCard() {
  return addDeckCardsTracked([
    { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' },
  ])[0];
}

describe('local deck review persistence', () => {
  it('persists Easy as known with a four-day first interval', () => {
    const card = addCard();
    const [reviewed] = reviewDeckCard(card.id, 'easy', NOW);

    expect(reviewed.known).toBe(true);
    expect(reviewed.srs).toMatchObject({ intervalDays: 4, lastRating: 'easy' });
  });

  it('persists Good as known with a one-day due date', () => {
    const card = addCard();
    const [reviewed] = reviewDeckCard(card.id, 'good', NOW);

    expect(reviewed.known).toBe(true);
    expect(reviewed.srs).toMatchObject({
      // Version 2 since the scheduler became configurable: the state now
      // records which scheduler wrote it. The intervals are unchanged, which is
      // the half of that change that must never move.
      version: 2,
      algorithm: 'sm2',
      dueAt: NOW + 24 * 60 * 60 * 1000,
      intervalDays: 1,
      repetitions: 1,
      lastRating: 'good',
    });
    // SM-2 writes no FSRS memory. A stability here would mean the seam had
    // fabricated one from the ease factor.
    expect(reviewed.srs?.stability).toBeUndefined();
    expect(reviewed.srs?.difficulty).toBeUndefined();
    expect(loadDeck()[0].srs).toEqual(reviewed.srs);
  });

  it('keeps reading a version-1 schedule written before the scheduler was a setting', () => {
    const card = addCard();
    const legacy = {
      version: 1,
      dueAt: NOW - 1_000,
      intervalDays: 3,
      ease: 2.5,
      repetitions: 2,
      lapses: 0,
      lastReviewedAt: NOW - 3 * 24 * 60 * 60 * 1000,
      lastRating: 'good',
    };
    const store = JSON.parse(localStorage.getItem('jp-flashcard-deck') as string);
    store.cards[0].srs = legacy;
    localStorage.setItem('jp-flashcard-deck', JSON.stringify(store));

    const [reviewed] = reviewDeckCard(card.id, 'good', NOW);
    // Read, migrated and continued — repetitions 2 -> 3, not restarted at 1.
    expect(reviewed.srs).toMatchObject({ version: 2, algorithm: 'sm2', repetitions: 3 });
  });

  it('persists Again as unknown without discarding lapse history', () => {
    const card = addCard();
    reviewDeckCard(card.id, 'good', NOW);
    reviewDeckCard(card.id, 'again', NOW + 1_000);
    const [reviewed] = loadDeck();

    expect(reviewed.known).toBeUndefined();
    expect(reviewed.srs).toMatchObject({ repetitions: 0, lapses: 1, lastRating: 'again' });
  });

  it('does not write or emit a review event for an unknown id', () => {
    addCard();
    const before = localStorage.getItem('jp-flashcard-deck');
    vi.mocked(window.dispatchEvent).mockClear();

    reviewDeckCard('missing', 'good', NOW);

    expect(localStorage.getItem('jp-flashcard-deck')).toBe(before);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });

  it('attaches a generated-audio deck batch in one persisted update', () => {
    const first = addCard();
    const second = addDeckCardsTracked([
      { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'epub' },
    ])[0];
    vi.mocked(window.dispatchEvent).mockClear();

    const deck = updateDeckCardAudioBatch([
      { id: first.id, audioPath: 'C:/managed/cat.wav' },
      { id: second.id, audioPath: 'C:/managed/dog.wav' },
    ]);

    expect(deck.find((card) => card.id === first.id)?.audioPath).toContain('cat.wav');
    expect(deck.find((card) => card.id === second.id)?.audioPath).toContain('dog.wav');
    expect(window.dispatchEvent).toHaveBeenCalledTimes(1);
  });
});
