// @vitest-environment jsdom
/**
 * D310 — the Study session source picker and the Start review button must be the
 * same question asked once.
 *
 * Measured live before the fix (pid 4652, window 1, a 4-card deck): typing a
 * query that matches nothing showed **"All in current folder (0)"** in the picker
 * and **"Start review (4)"** on the button directly beneath it, and the deck's
 * only book still read "(4)" in the same select as the "(0)". Three numbers, one
 * screen, two of them wrong — because the picker counted `filteredDeck` (folder
 * AND the find box) while a session is folder-only by deliberate design.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  filterDeckCards,
  reviewSessionCards,
  searchDeckCards,
  type DeckFlashcard,
} from '../flashcardDeck';
import type { LocalSrsState } from '../shared/localSrs';

const NOW = Date.UTC(2026, 8, 7, 12);

/**
 * D419. The clock has to be pinned, and it was not.
 *
 * `filterLocalReviewsDue` defaults its `now` to `Date.now()`, and `NOT_DUE`
 * below is `NOW + one day` — a fixed instant, 2026-09-08 12:00 UTC. So this
 * suite was true only for the 24 hours after it was written: at 12:00 UTC on
 * 2026-09-08 the "future" schedule became the past, card 3 became due, and
 * "drops a card scheduled into the future only when due-only is on" went red
 * on a tree nobody had touched. Caught in the full run 90 minutes after it
 * expired, on a turn that had changed nothing in flashcards.
 *
 * Freezing the clock at NOW is the fix rather than making NOT_DUE relative to
 * `Date.now()`: the rest of the fixture (`addedAt`, `lastReviewedAt`) is also
 * expressed against NOW, so one pinned instant keeps the whole deck coherent
 * and the suite says the same thing in a year as it does today.
 */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterAll(() => {
  vi.useRealTimers();
});

/** A valid future schedule, so `filterLocalReviewsDue` treats the card as NOT due. */
const NOT_DUE: LocalSrsState = {
  version: 2,
  dueAt: NOW + 86_400_000,
  intervalDays: 1,
  ease: 2.5,
  repetitions: 1,
  lapses: 0,
  lastReviewedAt: NOW - 1000,
  lastRating: 'good',
};

function card(over: Partial<DeckFlashcard> & { id: string }): DeckFlashcard {
  return {
    word: '猫',
    reading: 'ねこ',
    meaning: 'cat',
    source: 'epub',
    addedAt: NOW,
    bookId: 'b1',
    bookTitle: 'Book One',
    ...over,
  } as DeckFlashcard;
}

const B1 = 'b1::Book One';
const B2 = 'b2::Book Two';

const DECK: DeckFlashcard[] = [
  card({ id: '1' }),
  card({ id: '2', audioPath: 'C:/a.mp3' }),
  card({ id: '3', srs: NOT_DUE }),
  card({ id: '4', bookId: 'b2', bookTitle: 'Book Two', folder: 'Media', audioDataUrl: 'data:audio/mp3;base64,AA' }),
];

describe('reviewSessionCards', () => {
  it('draws the whole pool for the all-sources option', () => {
    expect(reviewSessionCards(DECK, 'all', false, 'mixed').map((c) => c.id)).toEqual(['1', '2', '3', '4']);
  });

  it('narrows to one book', () => {
    expect(reviewSessionCards(DECK, B1, false, 'mixed').map((c) => c.id)).toEqual(['1', '2', '3']);
    expect(reviewSessionCards(DECK, B2, false, 'mixed').map((c) => c.id)).toEqual(['4']);
  });

  it('drops a card scheduled into the future only when due-only is on', () => {
    // Control: with the checkbox off the same card is still in the session, so
    // "always drop it" cannot pass this pair.
    expect(reviewSessionCards(DECK, 'all', false, 'mixed').map((c) => c.id)).toContain('3');
    expect(reviewSessionCards(DECK, 'all', true, 'mixed', ).map((c) => c.id)).toEqual(['1', '2', '4']);
  });

  it('keeps only cards that have audio in audio mode, and filters nothing in the other two', () => {
    expect(reviewSessionCards(DECK, 'all', false, 'audio').map((c) => c.id)).toEqual(['2', '4']);
    // Controls: text and mixed must not inherit the audio narrowing.
    expect(reviewSessionCards(DECK, 'all', false, 'text')).toHaveLength(4);
    expect(reviewSessionCards(DECK, 'all', false, 'mixed')).toHaveLength(4);
  });

  it('is unmoved by the find box — the divergence D310 was filed for', () => {
    const pool = filterDeckCards(DECK, 'all');
    const searched = searchDeckCards(pool, 'zzzz-no-match-zzzz');
    // The two lists genuinely differ, so this is not a vacuous comparison.
    expect(searched).toHaveLength(0);
    expect(pool).toHaveLength(4);
    // A session started right now would contain the pool, not the search result.
    expect(reviewSessionCards(pool, 'all', false, 'mixed')).toHaveLength(4);
    expect(reviewSessionCards(pool, B1, false, 'mixed')).toHaveLength(3);
  });

  it('answers 0 for a book the folder scope excludes, instead of its whole-deck total', () => {
    // The old picker printed `inFolder || group.cards.length`, so Book Two read
    // "(1)" while a session from it would have been empty.
    const mediaOnly = filterDeckCards(DECK, 'Media');
    expect(reviewSessionCards(mediaOnly, B1, false, 'mixed')).toHaveLength(0);
    expect(reviewSessionCards(mediaOnly, B2, false, 'mixed')).toHaveLength(1);
  });
});

describe('the picker call site', () => {
  const SOURCE = readFileSync(
    resolve(__dirname, '../components/flashcards/FlashcardsContent.tsx'),
    'utf8',
  );
  // Comments stripped: the block carries a JSX comment that names the very
  // identifiers the ban below looks for, and prose about a defect is not the
  // defect. A raw-text guard that reads its own explanation is a false red.
  const PICKER = SOURCE.slice(
    SOURCE.indexOf("<select value={reviewBookKey}"),
    SOURCE.indexOf("{t('flash.dueOnly')}"),
  ).replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

  it('labels every option through the session predicate', () => {
    // Non-vacuity: the slice really is the picker.
    expect(PICKER).toContain('epubReviewBooks.map');
    expect(PICKER).toContain("reviewSourceCount('all')");
    expect(PICKER).toContain('reviewSourceCount(key)');
  });

  it('never counts the searched deck there again', () => {
    expect(PICKER).not.toContain('filteredDeck');
    expect(PICKER).not.toContain('group.cards.length');
  });

  it('builds the session pool from the same helper as the counts', () => {
    expect(SOURCE).toContain('reviewSessionCards(epubReviewPool, reviewBookKey, reviewDueOnly, reviewMode)');
    expect(SOURCE).toContain('reviewSessionCards(epubReviewPool, bookKey, reviewDueOnly, reviewMode)');
  });
});
