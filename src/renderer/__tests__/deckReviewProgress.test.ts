// @vitest-environment jsdom
/**
 * Reviews count as knowledge and progress (MASTER_PLAN.md §14 "Track learning
 * progress"), and the local deck is durable.
 *
 * Before: `reviewDeckCard` only rescheduled the card. A word reviewed to a
 * three-week interval stayed "new" in every reader highlight unless Anki
 * happened to sync it; a day spent reviewing broke the streak; nothing could
 * be undone; every unscheduled card was due at once; and the deck was read
 * from localStorage only, so a lost cache meant a lost deck.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => {
    const next = update(idb.get(key));
    if (next !== undefined) idb.set(key, JSON.parse(JSON.stringify(next)));
    return next ?? idb.get(key);
  },
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvBatch: async (ops: Array<{ type: 'put' | 'delete'; key: string; value?: unknown }>) => {
    for (const op of ops) {
      if (op.type === 'put') idb.set(op.key, JSON.parse(JSON.stringify(op.value)));
      else idb.delete(op.key);
    }
  },
  kvScanPrefix: async (prefix: string) => [...idb.entries()].filter(([key]) => key.startsWith(prefix)),
}));

import {
  addDeckCardsTracked,
  dueDeckCards,
  FLASHCARD_DECK_STORAGE_EVENT,
  FLASHCARD_DECK_STORAGE_KEY,
  loadDeck,
  resetDeckMemoryForTests,
  resetReviewUndoForTests,
  restoreDeckFromIdb,
  reviewDeckCard,
  undoLastReview,
  type DeckFlashcard,
} from '../flashcardDeck';
import { getLevel, setLevel } from '../knownWords';
import { getSummary } from '../stats';
import { flushReviewLogWrites, loadReviewLog, resetReviewLogForTests } from '../reviewLog';
import { limitNewCards } from '../../shared/localSrs';

const DAY = 24 * 60 * 60 * 1000;

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
  resetReviewUndoForTests();
  resetReviewLogForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function add(word: string, extra: Partial<DeckFlashcard> = {}): DeckFlashcard {
  return addDeckCardsTracked([{ word, reading: '', meaning: 'm', source: 'epub', ...extra }])[0];
}

describe('a review is evidence about the word', () => {
  it('sets the known-word level from the new interval, with the Anki thresholds', () => {
    const card = add('猫');
    const now = Date.now();
    reviewDeckCard(card.id, 'good', now); // 1 day   -> familiar (threshold 1)
    expect(getLevel('猫')).toBe(2);
    reviewDeckCard(card.id, 'again', now + DAY);
    expect(getLevel('猫')).toBe(1);
  });

  it('never overrides a level the user set by hand', () => {
    const card = add('犬');
    setLevel('犬', 3, true);
    reviewDeckCard(card.id, 'again');
    expect(getLevel('犬')).toBe(3);
  });

  it('does not grade a sentence card as a word', () => {
    const card = add('猫が好きです。', { studyKind: 'sentence', sentence: '猫が好きです。' });
    reviewDeckCard(card.id, 'easy');
    expect(getLevel('猫が好きです。')).toBe(0);
  });
});

describe('a review is progress', () => {
  it('logs the review, counts it today and keeps the streak alive', async () => {
    const card = add('鳥');
    reviewDeckCard(card.id, 'good');
    reviewDeckCard(card.id, 'again');

    const summary = getSummary();
    expect(summary.todayReviews).toBe(2);
    expect(summary.streak).toBe(1);
    const log = await loadReviewLog();
    expect(log.map((row) => row.rating)).toEqual(['good', 'again']);
    expect(log[0]).toMatchObject({ mode: 'review', cardId: card.id, isNew: true, correct: true });
    await flushReviewLogWrites();
    // Appended, one record per answer (the log is append-only).
    expect([...idb.keys()].filter((key) => key.startsWith('review-log-row:'))).toHaveLength(2);
  });
});

describe('undo last rating', () => {
  it('restores the schedule, the log, the day count and the knowledge level', async () => {
    const card = add('魚');
    reviewDeckCard(card.id, 'easy');
    expect(getLevel('魚')).toBe(2);

    const undone = undoLastReview();

    expect(undone?.undo.cardId).toBe(card.id);
    const restored = loadDeck().find((c) => c.id === card.id)!;
    expect(restored.srs).toBeUndefined();
    expect(restored.known).toBeUndefined();
    expect(restored.introducedAt).toBeUndefined();
    expect(getLevel('魚')).toBe(0);
    expect(getSummary().todayReviews).toBe(0);
    expect(await loadReviewLog()).toHaveLength(0);
    expect(undoLastReview()).toBeNull();
  });
});

describe('new cards per day', () => {
  it('lets through scheduled cards and only the day\'s allowance of new ones', () => {
    const scheduled = { srs: { version: 2, dueAt: 0, intervalDays: 1, ease: 2.5, repetitions: 1, lapses: 0, lastReviewedAt: 0, lastRating: 'good' } };
    const fresh = Array.from({ length: 30 }, () => ({ srs: undefined }));
    expect(limitNewCards([scheduled, ...fresh], 20, 5)).toHaveLength(1 + 15);
    expect(limitNewCards(fresh, undefined, 0)).toHaveLength(30);
  });

  it('reads the profile allowance and counts cards introduced today', () => {
    for (let i = 0; i < 25; i += 1) add(`w${i}`);
    // Seed profile p1 allows 20 new cards a day.
    expect(dueDeckCards(loadDeck())).toHaveLength(20);
    const first = loadDeck()[0];
    reviewDeckCard(first.id, 'again');
    // The reviewed card is scheduled 10 minutes out; one of today's 20 is used.
    expect(dueDeckCards(loadDeck())).toHaveLength(19);
  });
});

describe('durable deck', () => {
  it('restores a newer IndexedDB copy over a stale cache', async () => {
    add('古い');
    const durable = { folders: [], cards: [{ id: 'fc-x', word: '新しい', reading: '', meaning: '', source: 'epub', addedAt: 1 }], savedAt: Date.now() + 10_000 };
    idb.set('flashcard-deck', durable);

    expect(await restoreDeckFromIdb()).toBe('durable');
    expect(loadDeck().map((c) => c.word)).toEqual(['新しい']);
  });

  it('merges a card mined while the durable copy was being read', async () => {
    const durable = { folders: [], cards: [{ id: 'fc-d', word: '保存', reading: '', meaning: '', source: 'epub', addedAt: 1 }], savedAt: Date.now() + 10_000 };
    const outcome = await restoreDeckFromIdb(async () => {
      add('途中');
      return durable;
    });
    expect(outcome).toBe('durable');
    expect(loadDeck().map((c) => c.word)).toEqual(['途中', '保存']);
  });

  it('refills a lost cache from IndexedDB', async () => {
    idb.set('flashcard-deck', { folders: ['A'], cards: [{ id: 'fc-y', word: '残る', reading: '', meaning: '', source: 'epub', addedAt: 1 }] });
    expect(await restoreDeckFromIdb()).toBe('durable');
    expect(loadDeck()[0].word).toBe('残る');
    expect(JSON.parse(localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY)!).cards).toHaveLength(1);
  });

  it('keeps a newer cache and never lets the older durable copy win', async () => {
    idb.set('flashcard-deck', { folders: [], cards: [], savedAt: 1 });
    add('今');
    expect(await restoreDeckFromIdb()).toBe('local');
    expect(loadDeck()[0].word).toBe('今');
  });

  it('reports a full cache and keeps serving the deck it could not cache', () => {
    add('一');
    const onFull = vi.fn();
    window.addEventListener(FLASHCARD_DECK_STORAGE_EVENT, onFull);
    const real = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key: string, value: string) {
      if (key === FLASHCARD_DECK_STORAGE_KEY) throw new DOMException('full', 'QuotaExceededError');
      return real.call(this, key, value);
    });
    add('二');
    // The cache still holds one card; the deck the app sees has both.
    expect(JSON.parse(localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY)!).cards).toHaveLength(1);
    expect(loadDeck().map((c) => c.word).sort()).toEqual(['一', '二']);
    expect(onFull).toHaveBeenCalled();
    window.removeEventListener(FLASHCARD_DECK_STORAGE_EVENT, onFull);
  });
});
