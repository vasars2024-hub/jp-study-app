// @vitest-environment jsdom
/**
 * A Game Arena answer counts once, and is practice: a card's schedule is touched only for a
 * DUE card with the opt-in "grade due cards" setting.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();
vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, JSON.parse(JSON.stringify(value)));
  },
  kvUpdate: async (key: string, update: (current: unknown) => unknown) => update(idb.get(key)),
  kvDelete: async (key: string) => {
    idb.delete(key);
  },
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { bankArenaAnswer } from '../games/arenaStudyBridge';
import { saveGameArenaSettings } from '../games/settings';
import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests, resetReviewUndoForTests, reviewDeckCard } from '../flashcardDeck';
import { loadReviewLog, resetReviewLogForTests } from '../reviewLog';
import type { GameRound } from '../games/engine';

const DAY = 86_400_000;

beforeEach(() => {
  localStorage.clear();
  idb.clear();
  resetDeckMemoryForTests();
  resetReviewUndoForTests();
  resetReviewLogForTests();
});

const round = (word: string): GameRound => ({ word, jp: word, studyLang: 'ja' } as unknown as GameRound);

describe('arena answer banking', () => {
  it('a due card: practice by default — one game row, schedule untouched', async () => {
    const card = addDeckCardsTracked([{ word: '猫', reading: '', meaning: 'cat', source: 'epub' }])[0];
    const t0 = Date.now() - 30 * DAY;
    reviewDeckCard(card.id, 'good', t0); // due a day later — long past
    const before = loadDeck().find((c) => c.id === card.id)!.srs;
    resetReviewLogForTests();
    bankArenaAnswer(round('猫'), true);
    const log = await loadReviewLog();
    expect(log.map((r) => r.mode)).toEqual(['game']);
    expect(loadDeck().find((c) => c.id === card.id)!.srs).toEqual(before);
  });

  it('a due card with the opt-in setting: graded once, as a game-sourced review row', async () => {
    saveGameArenaSettings({ gradeDueCards: true });
    const card = addDeckCardsTracked([{ word: '猫', reading: '', meaning: 'cat', source: 'epub' }])[0];
    reviewDeckCard(card.id, 'good', Date.now() - 30 * DAY);
    resetReviewLogForTests();
    bankArenaAnswer(round('猫'), true);
    const log = await loadReviewLog();
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ mode: 'review', source: 'game' });
  });

  it('a card that is not due keeps its schedule after a game miss', async () => {
    const card = addDeckCardsTracked([{ word: '犬', reading: '', meaning: 'dog', source: 'epub' }])[0];
    reviewDeckCard(card.id, 'easy');
    const before = loadDeck().find((c) => c.id === card.id)!.srs;
    resetReviewLogForTests();
    bankArenaAnswer(round('犬'), false);
    expect(loadDeck().find((c) => c.id === card.id)!.srs).toEqual(before);
    const log = await loadReviewLog();
    expect(log.map((r) => r.mode)).toEqual(['game']);
  });
});
