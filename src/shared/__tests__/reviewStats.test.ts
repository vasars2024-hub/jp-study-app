/**
 * Review insights arithmetic on a fixed clock, the in-sitting step queue, the
 * cloze split, and the workbench browser's selection / sort fast paths.
 */
import { describe, expect, it } from 'vitest';

import type { ReviewLogEntry } from '../reviewLog';
import {
  activityMinutesByDay,
  answerTimeSummary,
  dailyReviewStats,
  deckStats,
  hourlyBreakdown,
  recallEstimate,
  retentionByInterval,
  reviewMaturity,
  weeklyRetention,
} from '../reviewStats';
import { nextSessionCardId, requeueStepCard } from '../reviewSessionQueue';
import { clozeParts, planFlashcardReview } from '../flashcardReview';
import {
  isRowSelected,
  selectRowRange,
  sortBrowserRows,
  toggleRowSelection,
  type BrowserRow,
} from '../ankiWorkbenchBrowser';

const DAY = 24 * 60 * 60 * 1000;
// Local noon, so day arithmetic never straddles midnight in any test timezone.
const NOW = new Date(2026, 9, 8, 12, 0, 0).getTime();

let seq = 0;
function review(daysAgo: number, correct: boolean, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  seq += 1;
  return {
    id: `r${seq}`,
    at: NOW - daysAgo * DAY,
    mode: 'review',
    correct,
    rating: correct ? 'good' : 'again',
    prevIntervalDays: 5,
    ...extra,
  };
}

describe('maturity', () => {
  it('follows Anki: learning under a day, young to 20, mature from 21', () => {
    expect(reviewMaturity({ isNew: true, prevIntervalDays: 30 })).toBe('learning');
    expect(reviewMaturity({ prevIntervalDays: 0 })).toBe('learning');
    expect(reviewMaturity({ prevIntervalDays: 20 })).toBe('young');
    expect(reviewMaturity({ prevIntervalDays: 21 })).toBe('mature');
  });
});

describe('dailyReviewStats', () => {
  it('buckets by local day, splits by maturity and sums answer time', () => {
    const rows = dailyReviewStats([
      review(0, true, { durationMs: 4000 }),
      review(0, false, { prevIntervalDays: 30, durationMs: 6000 }),
      review(1, true, { isNew: true }),
      review(40, true),
      { id: 'p', at: NOW, mode: 'learn', correct: true },
    ], 7, NOW);
    expect(rows).toHaveLength(7);
    const today = rows[6];
    expect(today).toMatchObject({ young: 1, mature: 1, learning: 0, passed: 1, timed: 2 });
    expect(today.seconds).toBeCloseTo(10, 6);
    expect(rows[5].learning).toBe(1);
    expect(rows.reduce((n, r) => n + r.young + r.mature + r.learning, 0)).toBe(3);
  });
});

describe('true retention', () => {
  it('per week, excluding learning reviews', () => {
    const weeks = weeklyRetention([
      review(0, true),
      review(1, false),
      review(2, true, { prevIntervalDays: 40 }),
      review(3, false, { isNew: true }),
      review(9, true),
    ], 2, NOW);
    expect(weeks).toHaveLength(2);
    expect(weeks[1].young).toEqual({ passed: 1, total: 2 });
    expect(weeks[1].mature).toEqual({ passed: 1, total: 1 });
    expect(weeks[0].young).toEqual({ passed: 1, total: 1 });
  });

  it('by the interval the card had waited', () => {
    const rows = retentionByInterval([
      review(0, true, { prevIntervalDays: 1 }),
      review(0, false, { prevIntervalDays: 3 }),
      review(0, true, { prevIntervalDays: 200 }),
      review(0, true, { prevIntervalDays: 0.5 }),
      review(0, true, { prevIntervalDays: 10, isNew: true }),
    ]);
    expect(rows[0]).toMatchObject({ min: 1, max: 1, passed: 1, total: 1 });
    expect(rows[1]).toMatchObject({ min: 2, max: 3, passed: 0, total: 1 });
    expect(rows[rows.length - 1]).toMatchObject({ min: 181, passed: 1, total: 1 });
    expect(rows.reduce((n, r) => n + r.total, 0)).toBe(3);
  });
});

describe('hours, time and activity', () => {
  it('counts reviews by local hour', () => {
    const hours = hourlyBreakdown([review(0, true), review(0, false), review(1, true)]);
    expect(hours[12]).toEqual({ hour: 12, reviews: 3, passed: 2 });
    expect(hours.reduce((n, h) => n + h.reviews, 0)).toBe(3);
  });

  it('averages only timed reviews', () => {
    expect(answerTimeSummary([review(0, true, { durationMs: 2000 }), review(0, true, { durationMs: 4000 }), review(0, true)]))
      .toEqual({ timed: 2, totalSeconds: 6, averageSeconds: 3 });
    expect(answerTimeSummary([review(0, true)]).averageSeconds).toBeNull();
  });

  it('stacks study minutes by activity, with review time from the log', () => {
    const daily = dailyReviewStats([review(0, true, { durationMs: 60_000 })], 2, NOW);
    const today = daily[1].date;
    const rows = activityMinutesByDay({ [today]: { seconds: 600, watchSeconds: 120, studySeconds: 60 } }, daily, 2, NOW);
    expect(rows[1]).toEqual({ date: today, reading: 10, watching: 2, listening: 0, study: 1, reviews: 1 });
    expect(rows[0].reading).toBe(0);
  });
});

describe('deckStats and recall', () => {
  it('joins the log to decks by card id', () => {
    const stats = deckStats([
      { id: 'a', deckKey: 'A', srs: { dueAt: NOW - 1, intervalDays: 30, lapses: 0 } },
      { id: 'b', deckKey: 'A', srs: { dueAt: NOW + DAY, intervalDays: 3, lapses: 0 } },
      { id: 'c', deckKey: 'A' },
      { id: 'd', deckKey: 'B', suspended: true, srs: { dueAt: 0, intervalDays: 2, lapses: 9 } },
    ], [review(1, true, { cardId: 'a' }), review(2, false, { cardId: 'b' }), review(50, true, { cardId: 'a' })], NOW - 30 * DAY, NOW);
    const a = stats.find((s) => s.deckKey === 'A');
    expect(a).toMatchObject({ cards: 3, newCards: 1, young: 1, mature: 1, dueNow: 2, reviews: 2 });
    expect(a?.retention).toEqual({ passed: 1, total: 2 });
    expect(stats.find((s) => s.deckKey === 'B')).toMatchObject({ suspended: 1, dueNow: 0 });
  });

  it('estimates recall from stability and elapsed time', () => {
    const estimate = recallEstimate([
      { srs: { stability: 10, lastReviewedAt: NOW - 10 * DAY } },
      { srs: { stability: 10, lastReviewedAt: NOW } },
      { srs: { lastReviewedAt: NOW } },
      { suspended: true, srs: { stability: 1, lastReviewedAt: 0 } },
    ], NOW);
    expect(estimate.cards).toBe(2);
    expect(estimate.average).toBeCloseTo(0.95, 6);
    expect(estimate.bands).toEqual([0, 0, 0, 1, 1]);
  });
});

describe('the sitting queue with steps', () => {
  const cards = [
    { id: 'fresh1' },
    { id: 'step-late', srs: { dueAt: NOW + 60_000, phase: 'learning' as const } },
    { id: 'step-due', srs: { dueAt: NOW - 1000, phase: 'learning' as const } },
    { id: 'fresh2' },
  ];

  it('shows a due step card first, else the next fresh card, else the soonest step early', () => {
    expect(nextSessionCardId(cards, new Set(), NOW)).toBe('step-due');
    expect(nextSessionCardId(cards, new Set(['step-due']), NOW)).toBe('fresh1');
    expect(nextSessionCardId(cards, new Set(['step-due', 'fresh1', 'fresh2']), NOW)).toBe('step-late');
    expect(nextSessionCardId(cards, new Set(cards.map((c) => c.id)), NOW)).toBeNull();
  });

  it('requeues a step card at the end of the unanswered block', () => {
    const order = requeueStepCard([{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'done' }], 'a', new Set(['done']));
    expect(order.map((c) => c.id)).toEqual(['b', 'c', 'a', 'done']);
  });
});

describe('cloze prompts', () => {
  it('splits the mined sentence around the word, or refuses', () => {
    expect(clozeParts('毎朝パンを食べる。', '食べる')).toEqual({ before: '毎朝パンを', after: '。' });
    expect(clozeParts('食べる', '食べる')).toBeNull();
    expect(clozeParts('毎朝パンを食べた。', '飲む')).toBeNull();
    expect(clozeParts(undefined, '食べる')).toBeNull();
  });

  it('is only planned for a card whose sentence contains its word', () => {
    let n = 0;
    const random = (): number => ((n += 0.37) % 1);
    const plan = planFlashcardReview(
      Array.from({ length: 40 }, (_, i) => ({
        id: String(i),
        word: '食べる',
        sentence: i % 2 ? '毎朝パンを食べる。' : undefined,
      })),
      { mode: 'text', random },
    );
    const cloze = plan.filter((c) => c.promptKind === 'cloze');
    expect(cloze.length).toBeGreaterThan(0);
    expect(cloze.every((c) => c.sentence)).toBe(true);
  });
});

describe('workbench browser fast paths', () => {
  const rows: BrowserRow[] = Array.from({ length: 30_000 }, (_, i) => ({
    noteId: `n${i}`,
    guid: `g${i}`,
    noteTypeName: 'Basic',
    deckNames: [],
    tags: [],
    marked: false,
    cardCount: 1,
    modifiedAtSec: 0,
    cells: { word: `w${(i * 7919) % 30_000}` },
    fields: {},
    search: '',
  }));

  it('selects a 30,000-row span without duplicates and reads it back', () => {
    const all = selectRowRange({ mode: 'explicit', ids: ['n5'] }, rows, 'n0', 'n29999');
    expect(all.mode).toBe('explicit');
    if (all.mode !== 'explicit') return;
    expect(all.ids).toHaveLength(30_000);
    expect(new Set(all.ids).size).toBe(30_000);
    expect(isRowSelected(all, 'n29999')).toBe(true);
    const less = toggleRowSelection(all, 'n7');
    expect(isRowSelected(less, 'n7')).toBe(false);
    expect(isRowSelected(all, 'n7')).toBe(true);
    const except = selectRowRange({ mode: 'all-matching', except: ['n1', 'n50000'] }, rows, 'n0', 'n10');
    expect(except).toEqual({ mode: 'all-matching', except: ['n50000'] });
  });

  it('sorts numerically and stably with one collator', () => {
    const sorted = sortBrowserRows(rows.slice(0, 200), { columnId: 'word', dir: 'asc' });
    const keys = sorted.map((r) => r.cells.word);
    const expected = [...keys].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    expect(keys).toEqual(expected);
    expect(sortBrowserRows(rows, null)).toBe(rows);
  });
});
