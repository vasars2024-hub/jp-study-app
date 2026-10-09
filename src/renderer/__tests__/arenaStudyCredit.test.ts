// @vitest-environment jsdom
/**
 * Game answers as study credit, counted once: every card's answer is practice credit tied to
 * the card (a due card is graded only with the opt-in setting, never when suspended or
 * Anki-owned), a word answered twice in one session is evidence once, and each Word Match
 * pair speaks for its own word.
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

import { setAnkiOwnsScheduling } from '../ankiSchedulingOwner';
import { bankArenaAnswer, bankArenaPairs, newArenaBankSession } from '../games/arenaStudyBridge';
import { saveGameArenaSettings } from '../games/settings';
import {
  addDeckCardsTracked,
  loadDeck,
  resetDeckMemoryForTests,
  resetReviewUndoForTests,
  reviewDeckCard,
  setDeckCardsSuspended,
} from '../flashcardDeck';
import { loadReviewLog, resetReviewLogForTests } from '../reviewLog';
import { isRecallReview } from '../../shared/reviewLog';
import { getStudyDayActivity, todayDayKey } from '../stats';

const DAY = 86_400_000;
const round = (word: string) => ({ word, jp: word, studyLang: 'ja' as const });

beforeEach(() => {
  localStorage.clear();
  resetDeckMemoryForTests();
  resetReviewUndoForTests();
  resetReviewLogForTests();
});

describe('arena study credit', () => {
  it('a learning card gets practice credit that names the card, and its schedule is untouched', async () => {
    const card = addDeckCardsTracked([{ word: '犬', reading: 'いぬ', meaning: 'dog', source: 'import' }])[0];
    reviewDeckCard(card.id, 'good');
    const before = loadDeck().find((c) => c.id === card.id)!.srs;
    resetReviewLogForTests();
    const outcome = bankArenaAnswer(round('犬'), true);
    expect(outcome).toEqual({ kind: 'practice', word: '犬', correct: true, cardId: card.id });
    expect(loadDeck().find((c) => c.id === card.id)!.srs).toEqual(before);
    const log = await loadReviewLog();
    expect(log.map((r) => [r.mode, r.cardId])).toEqual([['game', card.id]]);
  });

  it('a DUE card is practice by default: its schedule is untouched and no review row is written', async () => {
    const card = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }])[0];
    reviewDeckCard(card.id, 'good', Date.now() - 30 * DAY);
    const before = loadDeck().find((c) => c.id === card.id)!.srs;
    resetReviewLogForTests();
    const reviewsBefore = getStudyDayActivity(todayDayKey())?.reviews ?? 0;
    const session = newArenaBankSession();
    expect(bankArenaAnswer(round('猫'), false, Date.now(), session).kind).toBe('practice');
    expect(bankArenaAnswer(round('猫'), true, Date.now(), session).kind).toBe('repeat');
    expect(loadDeck().find((c) => c.id === card.id)!.srs).toEqual(before);
    const log = await loadReviewLog();
    expect(log.map((r) => [r.mode, r.cardId])).toEqual([['game', card.id]]);
    expect(getStudyDayActivity(todayDayKey())?.reviews ?? 0).toBe(reviewsBefore);
  });

  it('with the opt-in setting, a due card is graded once, tagged as a game review', async () => {
    saveGameArenaSettings({ gradeDueCards: true });
    const card = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }])[0];
    reviewDeckCard(card.id, 'good', Date.now() - 30 * DAY);
    resetReviewLogForTests();
    const reviewsBefore = getStudyDayActivity(todayDayKey())?.reviews ?? 0;
    const session = newArenaBankSession();
    expect(bankArenaAnswer(round('猫'), true, Date.now(), session).kind).toBe('review');
    expect(bankArenaAnswer(round('猫'), false, Date.now(), session).kind).toBe('repeat');
    const log = await loadReviewLog();
    expect(log.map((r) => [r.mode, r.source])).toEqual([['review', 'game']]);
    // Moved the schedule, but is not a recall test: out of FSRS training and true retention.
    expect(isRecallReview(log[0])).toBe(false);
    expect(getStudyDayActivity(todayDayKey())?.reviews).toBe(reviewsBefore + 1);
    // A new session counts again; the card is no longer due, so it is practice.
    expect(bankArenaAnswer(round('猫'), true, Date.now(), newArenaBankSession()).kind).toBe('practice');
  });

  it('never grades a suspended or Anki-owned card, even with the setting on', async () => {
    saveGameArenaSettings({ gradeDueCards: true });
    setAnkiOwnsScheduling(true);
    const [owned, paused] = addDeckCardsTracked([
      { word: '馬', reading: 'うま', meaning: 'horse', source: 'import', ankiNoteId: 42 },
      { word: '牛', reading: 'うし', meaning: 'cow', source: 'import' },
    ]);
    reviewDeckCard(owned.id, 'good', Date.now() - 30 * DAY);
    reviewDeckCard(paused.id, 'good', Date.now() - 30 * DAY);
    setDeckCardsSuspended([paused.id], true);
    const before = loadDeck().map((c) => c.srs);
    resetReviewLogForTests();
    const session = newArenaBankSession();
    expect(bankArenaAnswer(round('馬'), false, Date.now(), session).kind).toBe('practice');
    expect(bankArenaAnswer(round('牛'), false, Date.now(), session).kind).toBe('practice');
    expect(loadDeck().map((c) => c.srs)).toEqual(before);
    const log = await loadReviewLog();
    expect(log.map((r) => r.mode)).toEqual(['game', 'game']);
  });

  it('reads the deck once per session, not once per answer', () => {
    addDeckCardsTracked([
      { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'import' },
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' },
    ]);
    const session = newArenaBankSession();
    bankArenaAnswer(round('犬'), true, Date.now(), session);
    const index = session.cards;
    expect(index?.size).toBe(2);
    bankArenaAnswer(round('猫'), true, Date.now(), session);
    expect(session.cards).toBe(index);
  });

  it('banks each Word Match pair for its own word', async () => {
    const outcomes = bankArenaPairs('ja', [
      { jp: '鳥', correct: true },
      { jp: '魚', correct: false },
      { jp: '鳥', correct: true },
    ], Date.now(), newArenaBankSession());
    expect(outcomes.map((o) => [o.word, o.kind, o.correct])).toEqual([
      ['鳥', 'practice', true],
      ['魚', 'practice', false],
      ['鳥', 'repeat', true],
    ]);
    const log = await loadReviewLog();
    expect(log.map((r) => [r.word, r.correct])).toEqual([['鳥', true], ['魚', false]]);
  });
});
