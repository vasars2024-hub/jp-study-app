// @vitest-environment jsdom
/**
 * The deck's day queries and the Calendar's hand-offs into Flashcards: `added:`, `reviewed:`
 * and `due:` narrow the deck to one local day, "Study ahead" picks the scheduled cards due by
 * a day's end, and "Review now" brings one card into today's reviews without touching the
 * rest of its schedule.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import {
  aheadDeckCards,
  deckCardMatchesDate,
  dueDeckCardNow,
  endOfLocalDay,
  loadDeck,
  resetDeckMemoryForTests,
  searchDeckCards,
  type DeckFlashcard,
} from '../flashcardDeck';
import { requestFlashcardsFocus, takeFlashcardsFocus } from '../openIntents';

const ms = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h).getTime();
const srs = (dueAt: number, lastReviewedAt = ms(2026, 10, 1)) => ({
  version: 1 as const, dueAt, intervalDays: 3, ease: 2.5, repetitions: 2, lapses: 0, lastReviewedAt, lastRating: 'good' as const,
});
const card = (id: string, over: Partial<DeckFlashcard> = {}): DeckFlashcard => ({
  id, word: id, reading: '', meaning: id, source: 'import', addedAt: ms(2026, 10, 1), ...over,
});

beforeEach(() => {
  localStorage.clear();
  resetDeckMemoryForTests();
});

describe('day queries', () => {
  const deck = [
    card('added-7', { addedAt: ms(2026, 10, 7, 9) }),
    card('reviewed-7', { srs: srs(ms(2026, 10, 12), ms(2026, 10, 7, 20)) }),
    card('due-9', { srs: srs(ms(2026, 10, 9, 8)) }),
    card('due-11', { srs: srs(ms(2026, 10, 11, 8)) }),
    card('new'),
  ];

  it('narrows the find box to the cards of one local day', () => {
    expect(searchDeckCards(deck, 'added:2026-10-07').map((c) => c.id)).toEqual(['added-7']);
    expect(searchDeckCards(deck, 'reviewed:2026-10-07').map((c) => c.id)).toEqual(['reviewed-7']);
    // due: is everything scheduled by the end of that day, so overdue cards are in it too.
    expect(searchDeckCards(deck, 'due:2026-10-09').map((c) => c.id)).toEqual(['due-9']);
    expect(searchDeckCards(deck, 'due:2026-10-11').map((c) => c.id)).toEqual(['due-9', 'due-11']);
    // A date query is not a substring search: nothing matches the literal text.
    expect(searchDeckCards(deck, 'added:2026-10-08')).toEqual([]);
    expect(deckCardMatchesDate(card('x'), 'reviewed', '2026-10-01')).toBe(false);
    expect(endOfLocalDay('2026-10-31')).toBe(new Date(2026, 10, 1).getTime());
  });

  it('studies ahead on scheduled cards only, soonest first, never on new cards', () => {
    expect(aheadDeckCards(deck, '2026-10-11').map((c) => c.id)).toEqual(['due-9', 'due-11']);
    expect(aheadDeckCards(deck, '2026-10-08')).toEqual([]);
  });
});

describe('Review now', () => {
  it('brings a scheduled card forward and leaves everything else about it alone', () => {
    const future = card('later', { srs: srs(Date.now() + 5 * 86_400_000) });
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: [future, card('new')], savedAt: Date.now() }));
    resetDeckMemoryForTests();
    const now = Date.now();
    expect(dueDeckCardNow('later', now)).toBe(true);
    const moved = loadDeck().find((c) => c.id === 'later')!;
    expect(moved.srs?.dueAt).toBe(now);
    expect(moved.srs?.intervalDays).toBe(3);
    expect(moved.srs?.repetitions).toBe(2);
    // Already due, unscheduled, or missing: nothing to move.
    expect(dueDeckCardNow('later', now)).toBe(false);
    expect(dueDeckCardNow('new', now)).toBe(false);
    expect(dueDeckCardNow('missing', now)).toBe(false);
  });
});

describe('Flashcards focus hand-off', () => {
  it('carries a day query and a study-ahead request, and drops malformed ones', () => {
    requestFlashcardsFocus({ folder: null, cardId: null, search: 'added:2026-10-07' });
    expect(takeFlashcardsFocus()).toEqual({ folder: null, cardId: null, search: 'added:2026-10-07' });
    requestFlashcardsFocus({ folder: null, cardId: null, review: 'ahead', aheadUntil: '2026-10-10' });
    expect(takeFlashcardsFocus()).toEqual({ folder: null, cardId: null, review: 'ahead', aheadUntil: '2026-10-10' });
    requestFlashcardsFocus({ folder: null, cardId: null, review: 'ahead', aheadUntil: 'tomorrow' });
    expect(takeFlashcardsFocus()).toBeNull();
    // Taken once.
    expect(takeFlashcardsFocus()).toBeNull();
  });
});
