// @vitest-environment jsdom
// jsdom because both the deck store and the scheduling setting are
// localStorage-backed, and the point of these tests is what lands on disk.
/**
 * The deck-wide scheduling operations, and the setting that drives a review.
 *
 * The pure arithmetic is pinned in `shared/__tests__/flashcardScheduling`. What
 * only a store-backed pass can show:
 *
 * - a review actually goes through the seam, so flipping the setting changes
 *   what gets PERSISTED and not merely what a preview says;
 * - converting is idempotent — running it twice reports zero the second time
 *   rather than rewriting thousands of cards for nothing;
 * - a reset leaves a card indistinguishable from one never studied, which is
 *   what makes it a reset and not a zeroed schedule;
 * - a folder-scoped reset does not touch the rest of the deck.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import {
  convertDeckSchedule,
  loadDeck,
  replaceImportedDeck,
  resetDeckSchedule,
  reviewDeckCard,
} from '../flashcardDeck';
import { loadSchedulingConfig, saveSchedulingConfig } from '../flashcardScheduling';
import { DEFAULT_SCHEDULING_CONFIG } from '../../shared/flashcardScheduling';
import { isLocalSrsState } from '../../shared/localSrs';

const NOW = Date.UTC(2026, 7, 29, 9);

function seed(): void {
  replaceImportedDeck('seed-book', 'Seed', [
    { word: '食べる', reading: 'たべる', meaning: 'to eat', folder: 'verbs' },
    { word: '飲む', reading: 'のむ', meaning: 'to drink', folder: 'verbs' },
    { word: '猫', reading: 'ねこ', meaning: 'cat', folder: 'nouns' },
  ]);
}

function card(index: number) {
  return loadDeck()[index];
}

beforeEach(() => {
  localStorage.clear();
  seed();
});

describe('the scheduling setting', () => {
  it('defaults to SM-2 and survives a round trip', () => {
    expect(loadSchedulingConfig()).toEqual(DEFAULT_SCHEDULING_CONFIG);
    saveSchedulingConfig({ algorithm: 'fsrs', desiredRetention: 0.95 });
    expect(loadSchedulingConfig()).toMatchObject({
      algorithm: 'fsrs',
      desiredRetention: 0.95,
    });
  });

  it('normalizes what it reads back rather than trusting the store', () => {
    localStorage.setItem(
      'jp-flashcard-scheduling-v1',
      JSON.stringify({ algorithm: 'telepathy', desiredRetention: 5 }),
    );
    const config = loadSchedulingConfig();
    expect(config.algorithm).toBe('sm2');
    expect(config.desiredRetention).toBeLessThanOrEqual(0.97);
  });

  it('survives a store that cannot be parsed at all', () => {
    localStorage.setItem('jp-flashcard-scheduling-v1', 'not json');
    expect(loadSchedulingConfig()).toEqual(DEFAULT_SCHEDULING_CONFIG);
  });
});

describe('reviewDeckCard through the seam', () => {
  it('writes an SM-2 state by default, stamped with the algorithm that wrote it', () => {
    reviewDeckCard(card(0).id, 'good', NOW);
    const srs = card(0).srs;
    expect(isLocalSrsState(srs)).toBe(true);
    expect(srs?.algorithm).toBe('sm2');
    expect(srs?.stability).toBeUndefined();
    expect(srs?.intervalDays).toBe(1);
  });

  it('writes an FSRS state once the setting says so — the choice reaches the store', () => {
    saveSchedulingConfig({ algorithm: 'fsrs' });
    reviewDeckCard(card(0).id, 'good', NOW);
    const srs = card(0).srs;
    expect(srs?.algorithm).toBe('fsrs');
    expect(srs?.stability).toBeGreaterThan(0);
    expect(srs?.difficulty).toBeGreaterThanOrEqual(1);
  });

  it('adapts a card reviewed under the other algorithm instead of misreading it', () => {
    reviewDeckCard(card(0).id, 'hard', NOW);
    const before = card(0).srs;
    expect(before?.algorithm).toBe('sm2');
    saveSchedulingConfig({ algorithm: 'fsrs' });
    reviewDeckCard(card(0).id, 'good', NOW + 60_000);
    const after = card(0).srs;
    expect(after?.algorithm).toBe('fsrs');
    // History carried, model restarted: the lapse count is the user's, the
    // stability is the model's first sighting.
    expect(after?.lapses).toBe(before?.lapses);
    expect(after?.repetitions).toBe((before?.repetitions ?? 0) + 1);
  });
});

describe('convertDeckSchedule', () => {
  it('converts only the scheduled cards and counts the rest honestly', () => {
    reviewDeckCard(card(0).id, 'good', NOW);
    reviewDeckCard(card(1).id, 'good', NOW);
    const report = convertDeckSchedule('fsrs');
    expect(report).toEqual({ changed: 2, unscheduled: 1, total: 3 });
    expect(loadDeck().filter((c) => c.srs?.algorithm === 'fsrs')).toHaveLength(2);
    // The never-studied card is still never-studied. Conversion is not a review.
    expect(card(2).srs).toBeUndefined();
  });

  it('is idempotent — the second run reports zero rather than churning the store', () => {
    reviewDeckCard(card(0).id, 'good', NOW);
    expect(convertDeckSchedule('fsrs').changed).toBe(1);
    expect(convertDeckSchedule('fsrs').changed).toBe(0);
  });

  it('keeps due dates and counts across the conversion', () => {
    reviewDeckCard(card(0).id, 'easy', NOW);
    const before = card(0).srs;
    convertDeckSchedule('fsrs');
    const after = card(0).srs;
    expect(after?.dueAt).toBe(before?.dueAt);
    expect(after?.intervalDays).toBe(before?.intervalDays);
    expect(after?.repetitions).toBe(before?.repetitions);
  });
});

describe('resetDeckSchedule', () => {
  it('returns a card to the unseen state, not to a zeroed schedule', () => {
    reviewDeckCard(card(0).id, 'good', NOW);
    expect(card(0).srs).toBeDefined();
    const report = resetDeckSchedule();
    expect(report).toEqual({ changed: 1, unscheduled: 2, total: 3 });
    // Indistinguishable from a card never studied — which is the whole point.
    expect(card(0).srs).toBeUndefined();
  });

  it('leaves the card itself alone: only the schedule goes', () => {
    reviewDeckCard(card(0).id, 'good', NOW);
    const before = card(0);
    resetDeckSchedule();
    const after = card(0);
    expect(after.word).toBe(before.word);
    expect(after.meaning).toBe(before.meaning);
    expect(after.folder).toBe(before.folder);
    expect(loadDeck()).toHaveLength(3);
  });

  it('scopes to one folder and reports that folder size, not the deck size', () => {
    for (const c of loadDeck()) reviewDeckCard(c.id, 'good', NOW);
    const report = resetDeckSchedule('nouns');
    expect(report).toEqual({ changed: 1, unscheduled: 0, total: 1 });
    expect(loadDeck().filter((c) => c.srs).map((c) => c.folder)).toEqual(['verbs', 'verbs']);
  });
});
