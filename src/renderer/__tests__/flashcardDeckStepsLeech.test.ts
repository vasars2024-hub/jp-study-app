// @vitest-environment jsdom
/**
 * The deck half of same-day steps, leech handling and answer timing: what
 * `reviewDeckCard` persists and what `undoLastReview` takes back, over the real
 * store on a fixed clock.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  addDeckCardsTracked,
  dueDeckCards,
  LEECH_TAG,
  loadDeck,
  peekReviewUndo,
  resetReviewUndoForTests,
  reviewDeckCard,
  searchDeckCards,
  setDeckCardsSuspended,
  SUSPENDED_QUERY,
  undoLastReview,
} from '../flashcardDeck';
import { saveSchedulingConfig } from '../flashcardScheduling';

const NOW = Date.UTC(2026, 9, 8, 9);
const MIN = 60 * 1000;
const DAY = 24 * 60 * MIN;

beforeEach(() => {
  localStorage.clear();
  resetReviewUndoForTests();
  vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function addCard() {
  return addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub' }])[0];
}

describe('learning steps through the deck', () => {
  it('keeps a new card in its steps, then graduates it, and undo walks it back', () => {
    saveSchedulingConfig({ learningStepsMinutes: [1, 10] });
    const card = addCard();
    let [state] = reviewDeckCard(card.id, 'good', NOW);
    expect(state.srs).toMatchObject({ phase: 'learning', step: 1, dueAt: NOW + 10 * MIN });
    [state] = reviewDeckCard(card.id, 'good', NOW + 10 * MIN);
    expect(state.srs?.phase).toBeUndefined();
    expect(state.srs?.intervalDays).toBe(1);
    const undone = undoLastReview();
    expect(undone?.cards[0].srs).toMatchObject({ phase: 'learning', step: 1 });
    expect(loadDeck()[0].srs).toMatchObject({ phase: 'learning', step: 1 });
  });
});

describe('answer time', () => {
  it('logs the time to answer, capped at a minute', () => {
    const card = addCard();
    reviewDeckCard(card.id, 'good', NOW, { durationMs: 4200 });
    expect(peekReviewUndo()?.log.durationMs).toBe(4200);
    reviewDeckCard(card.id, 'good', NOW + DAY, { durationMs: 5 * 60_000 });
    expect(peekReviewUndo()?.log.durationMs).toBe(60_000);
    reviewDeckCard(card.id, 'good', NOW + 3 * DAY);
    expect(peekReviewUndo()?.log.durationMs).toBeUndefined();
  });
});

describe('leeches', () => {
  /** Learn the card, then lapse it `n` times, each a day apart. */
  function lapse(id: string, n: number): void {
    let at = NOW;
    reviewDeckCard(id, 'easy', at);
    for (let i = 0; i < n; i += 1) {
      at += 5 * DAY;
      reviewDeckCard(id, 'again', at);
      reviewDeckCard(id, 'good', at + 10 * MIN);
    }
  }

  it('tags at the threshold and suspends when asked; due lists skip it', () => {
    saveSchedulingConfig({ leechThreshold: 3, leechAction: 'suspend' });
    const card = addCard();
    lapse(card.id, 2);
    expect(loadDeck()[0].tags ?? []).not.toContain(LEECH_TAG);
    reviewDeckCard(card.id, 'again', NOW + 30 * DAY);
    const leech = loadDeck()[0];
    expect(leech.srs?.lapses).toBe(3);
    expect(leech.tags).toContain(LEECH_TAG);
    expect(leech.suspended).toBe(true);
    expect(peekReviewUndo()?.leech).toEqual({ tagged: true, suspended: true });
    expect(dueDeckCards(loadDeck(), NOW + 400 * DAY, undefined, 0)).toHaveLength(0);
    expect(searchDeckCards(loadDeck(), SUSPENDED_QUERY)).toHaveLength(1);
  });

  it('undo takes the tag and the suspension back with the review', () => {
    saveSchedulingConfig({ leechThreshold: 2, leechAction: 'suspend' });
    const card = addCard();
    lapse(card.id, 1);
    reviewDeckCard(card.id, 'again', NOW + 30 * DAY);
    expect(loadDeck()[0].suspended).toBe(true);
    undoLastReview();
    const back = loadDeck()[0];
    expect(back.suspended).toBeUndefined();
    expect(back.tags ?? []).not.toContain(LEECH_TAG);
    expect(back.srs?.lapses).toBe(1);
  });

  it('tag-only leaves the card in the reviews, and unsuspend restores a suspended one', () => {
    saveSchedulingConfig({ leechThreshold: 2, leechAction: 'tag' });
    const card = addCard();
    lapse(card.id, 2);
    expect(loadDeck()[0].tags).toContain(LEECH_TAG);
    expect(loadDeck()[0].suspended).toBeUndefined();
    expect(setDeckCardsSuspended([card.id], true)).toBe(1);
    expect(dueDeckCards(loadDeck(), NOW + 400 * DAY, undefined, 0)).toHaveLength(0);
    expect(setDeckCardsSuspended([card.id], false)).toBe(1);
    expect(setDeckCardsSuspended([card.id], false)).toBe(0);
    expect(dueDeckCards(loadDeck(), NOW + 400 * DAY, undefined, 0)).toHaveLength(1);
  });
});

describe('spread reviews', () => {
  it('fuzzes a long interval inside its range when switched on', () => {
    saveSchedulingConfig({ fuzz: true });
    const card = addCard();
    let at = NOW;
    let [state] = reviewDeckCard(card.id, 'easy', at);
    for (let i = 0; i < 4; i += 1) {
      at = state.srs?.dueAt ?? at;
      [state] = reviewDeckCard(card.id, 'good', at);
    }
    const interval = state.srs?.intervalDays ?? 0;
    expect(interval).toBeGreaterThan(3);
    expect(state.srs?.dueAt).toBe(at + interval * DAY);
  });
});
