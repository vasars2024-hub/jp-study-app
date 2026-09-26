// @vitest-environment jsdom
/**
 * The Flashcards render path parsed the 3.7 MB deck ~43 times per render: every
 * due count asked `loadDeck()`, whose `readStore` parsed the cache each time,
 * and `dueDeckCards` had `countIntroducedToday(loadDeck())` as a default
 * parameter, asked once per <option> of the review picker.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({ kvGet: async () => undefined, kvSet: async () => undefined }));

import {
  FLASHCARD_DECK_STORAGE_KEY,
  addDeckCards,
  dueDeckCards,
  introducedTodayCount,
  loadDeck,
  onDeckChanged,
  resetDeckMemoryForTests,
  reviewSessionCards,
  reviewSessionCounts,
  type DeckFlashcard,
} from '../flashcardDeck';
import { countIntroducedToday } from '../../shared/localSrs';

const DAY = 86_400_000;
const NOW = new Date(2026, 8, 25, 15).getTime();

function deck(n: number): DeckFlashcard[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `fc-${i}`,
    word: `語${i}`,
    reading: '',
    meaning: `m${i}`,
    source: 'epub' as const,
    bookId: `b${i % 7}`,
    bookTitle: `Book ${i % 7}`,
    addedAt: 1,
    ...(i % 3 === 0 ? {} : {
      srs: { version: 2, dueAt: NOW + ((i % 5) - 2) * DAY, intervalDays: 3, ease: 2.5, repetitions: 2, lapses: 0, algorithm: 'sm2' },
      introducedAt: i % 4 === 0 ? NOW - (i % 10) * 3_600_000 : NOW - 5 * DAY,
    }),
    ...(i % 11 === 0 ? { audioPath: 'a.mp3' } : {}),
  })) as DeckFlashcard[];
}

beforeEach(() => {
  // The fixture's due dates are relative to NOW, and reviewSessionCards reads the
  // clock itself: pin it, or the comparison drifts as the real day moves on.
  vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
  localStorage.clear();
  resetDeckMemoryForTests();
  localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify({ folders: [], cards: deck(500), savedAt: 5 }));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('the deck read cache', () => {
  it('parses the cache once, however often the deck is read', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const first = loadDeck();
    for (let i = 0; i < 50; i++) expect(loadDeck()).toBe(first);
    const deckParses = parse.mock.calls.filter(([text]) => typeof text === 'string' && text.length > 10_000);
    expect(deckParses).toHaveLength(1);
  });

  it('sees a write from another window (a different cache text) at once', () => {
    expect(loadDeck()).toHaveLength(500);
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify({ folders: [], cards: deck(3), savedAt: 9 }));
    expect(loadDeck()).toHaveLength(3);
  });

  it('serves its own write without re-parsing it', () => {
    loadDeck();
    addDeckCards([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }]);
    const parse = vi.spyOn(JSON, 'parse');
    expect(loadDeck()[0].word).toBe('猫');
    expect(parse.mock.calls.filter(([text]) => typeof text === 'string' && text.length > 10_000)).toHaveLength(0);
  });
});

describe('due counts', () => {
  it('introducedTodayCount is countIntroducedToday over the deck, for any moment of the day', () => {
    for (const at of [NOW - 10 * 3_600_000, NOW - 3_600_000, NOW, NOW + 3_600_000]) {
      expect(introducedTodayCount(at)).toBe(countIntroducedToday(loadDeck(), at));
    }
  });

  it('counts every picker source in one pass, exactly as reviewSessionCards would', () => {
    const pool = loadDeck();
    for (const dueOnly of [true, false]) {
      for (const mode of ['mixed', 'text', 'audio'] as const) {
        const counts = reviewSessionCounts(pool, dueOnly, mode, NOW);
        const keys = ['all', ...new Set(pool.map((c) => `${c.bookId}::${c.bookTitle}`))];
        for (const key of keys) {
          const expected = mode === 'audio' || !dueOnly
            ? reviewSessionCards(pool, key, dueOnly, mode).length
            : filterByBookDue(pool, key);
          expect(counts.get(key)).toBe(expected);
        }
      }
    }
  });

  it('does not parse the deck per count', () => {
    const pool = loadDeck();
    const parse = vi.spyOn(JSON, 'parse');
    for (let i = 0; i < 40; i++) dueDeckCards(pool);
    reviewSessionCounts(pool, true, 'mixed');
    expect(parse.mock.calls.filter(([text]) => typeof text === 'string' && text.length > 10_000)).toHaveLength(0);
  });
});

/** reviewSessionCards with the same `now` the counts used. */
function filterByBookDue(pool: DeckFlashcard[], key: string): number {
  const byBook = key === 'all' ? pool : pool.filter((c) => `${c.bookId}::${c.bookTitle}` === key);
  return dueDeckCards(byBook, NOW).length;
}

describe('onDeckChanged', () => {
  it('ignores storage events for other keys', () => {
    const cb = vi.fn();
    const off = onDeckChanged(cb);
    window.dispatchEvent(new StorageEvent('storage', { key: 'jp-os-theme' }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'jp-word-knowledge-ja' }));
    expect(cb).not.toHaveBeenCalled();
    window.dispatchEvent(new StorageEvent('storage', { key: FLASHCARD_DECK_STORAGE_KEY }));
    window.dispatchEvent(new StorageEvent('storage', { key: null }));
    expect(cb).toHaveBeenCalledTimes(2);
    off();
  });
});
