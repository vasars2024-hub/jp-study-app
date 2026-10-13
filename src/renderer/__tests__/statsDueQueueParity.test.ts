// @vitest-environment jsdom
/**
 * Statistics' per-deck Due is the number Review would open (scorecard bug 39:
 * the table counted every new card — 3,001 shown against 21 in the queue).
 *
 * `StatsReviewInsights` hands `deckStats` the review picker's own per-source
 * counts; this pins that those are exactly the size of the session each source
 * would start, with the new-card allowance, suspended and Anki-owned cards and
 * learn-ahead all applied, and that the Due column then agrees with them.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  loadDeck,
  replaceImportedDeck,
  reviewDeckCard,
  reviewSessionCards,
  reviewSessionCounts,
  setDeckCardsSuspended,
  UNKNOWN_BOOK_TITLE,
  type DeckFlashcard,
} from '../flashcardDeck';
import { saveSchedulingConfig } from '../flashcardScheduling';
import { setAnkiOwnsScheduling } from '../ankiSchedulingOwner';
import { getActiveProfile } from '../profileState';
import { deckStats } from '../../shared/reviewStats';

const keyOf = (card: DeckFlashcard) => `${card.bookId || 'unknown'}::${card.bookTitle || UNKNOWN_BOOK_TITLE}`;

function words(prefix: string, count: number) {
  return Array.from({ length: count }, (_, i) => ({
    word: `${prefix}${i}`, reading: '', meaning: `${prefix} ${i}`, source: 'import' as const,
  }));
}

beforeEach(() => {
  localStorage.clear();
  replaceImportedDeck('big', 'Big import', words('b', 40));
  replaceImportedDeck('small', 'Small', words('s', 3));
});

describe('per-deck Due = what Review would open', () => {
  it('matches the session each source would start, new-card allowance included', () => {
    saveSchedulingConfig({ algorithm: 'fsrs', learningStepsMinutes: [1, 10] });
    const now = Date.now();
    const deck = loadDeck();
    // One card in a 1-minute step (inside learn-ahead), one suspended, one Anki-owned.
    reviewDeckCard(deck[0].id, 'again', now - 1000);
    setDeckCardsSuspended([deck[1].id], true);
    setAnkiOwnsScheduling(true);
    const live = loadDeck().map((card, i) => (i === 2 ? { ...card, ankiNoteId: 99 } : card));

    const counts = reviewSessionCounts(live, true, 'mixed', now);
    const rows = deckStats(
      live.map((card) => ({ id: card.id, deckKey: keyOf(card), suspended: card.suspended, srs: card.srs })),
      [],
      0,
      now,
      { dueByDeck: counts },
    );
    for (const row of rows) {
      const session = reviewSessionCards(live, row.deckKey, true, 'mixed');
      expect(row.dueNow, row.deckKey).toBe(session.length);
    }
    const big = [...rows].sort((a, b) => b.cards - a.cards)[0];
    expect(big.cards).toBeGreaterThanOrEqual(40);
    const newPerDay = getActiveProfile().deckParams.newPerDay;
    if (newPerDay !== undefined && Number.isFinite(newPerDay)) {
      // Dozens of unseen cards, never all of them "due".
      expect(big.dueNow).toBeLessThan(big.newCards);
    }
    setAnkiOwnsScheduling(false);
  });
});
