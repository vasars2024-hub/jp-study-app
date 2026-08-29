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
      version: 1,
      dueAt: NOW + 24 * 60 * 60 * 1000,
      intervalDays: 1,
      repetitions: 1,
      lastRating: 'good',
    });
    expect(loadDeck()[0].srs).toEqual(reviewed.srs);
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
