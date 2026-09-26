// @vitest-environment jsdom
/**
 * Grammar review is scheduled by the flashcard scheduler, and the learner's
 * favourites / study queue are filter axes rather than write-only sets.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  dueGrammarIds,
  enrolGrammarPoints,
  loadGrammarSrs,
  parseGrammarSrs,
  ratingForTestAnswer,
  reviewGrammarPoint,
  saveGrammarSrs,
  seedMissed,
} from '../grammarSrs';
import {
  applyCollections,
  loadCollections,
  saveCollections,
  withListMembership,
  FAVORITES_KEY,
} from '../grammarCollections';
import { GRAMMAR } from '../data/grammar';
import {
  DEFAULT_PRACTICE_FILTERS,
  filterGrammarPoints,
  hasActiveFilters,
  listFilterCounts,
  loadPracticeFilters,
} from '../data/grammar/practiceFilters';
import { DEFAULT_SCHEDULING_CONFIG } from '../../shared/flashcardScheduling';
import { recentlyMissed } from '../grammarSessionHistory';

const DAY = 86_400_000;
const T0 = Date.UTC(2026, 8, 1);

beforeEach(() => localStorage.clear());

describe('grammar SRS', () => {
  it('schedules through the flashcard scheduler: Good pushes the point out, Again brings it back', () => {
    let s = reviewGrammarPoint({}, 'p1', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    expect(s.p1.dueAt).toBeGreaterThan(T0);
    expect(dueGrammarIds(s, T0)).toEqual([]);
    s = reviewGrammarPoint(s, 'p1', 'good', DEFAULT_SCHEDULING_CONFIG, s.p1.dueAt);
    expect(s.p1.intervalDays).toBeGreaterThan(1);
    s = reviewGrammarPoint(s, 'p1', 'again', DEFAULT_SCHEDULING_CONFIG, s.p1.dueAt);
    expect(s.p1.dueAt - s.p1.lastReviewedAt).toBeLessThan(DAY);
  });

  it('honours the FSRS setting', () => {
    const s = reviewGrammarPoint({}, 'p1', 'good', { ...DEFAULT_SCHEDULING_CONFIG, algorithm: 'fsrs' }, T0);
    expect(s.p1.algorithm).toBe('fsrs');
    expect(s.p1.stability).toBeGreaterThan(0);
  });

  it('maps test grades: a wrong answer is Again', () => {
    expect(ratingForTestAnswer('hard')).toBe('again');
    expect(ratingForTestAnswer('good')).toBe('good');
  });

  it('seeds recently missed points as due now, without overwriting a real schedule', () => {
    const scheduled = reviewGrammarPoint({}, 'kept', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    const missed = recentlyMissed([
      { at: T0, requested: 2, delivered: 2, correct: 0, direction: 'mixed', types: [], mastered: 'exclude', missed: ['m1', 'kept'] },
    ]);
    const s = seedMissed(scheduled, missed, T0);
    expect(dueGrammarIds(s, T0)).toEqual(['m1']);
    expect(s.kept).toBe(scheduled.kept);
  });

  it('enrolled points are due now and review as new cards', () => {
    const s = enrolGrammarPoints({}, ['q1', 'q2'], T0);
    expect(dueGrammarIds(s, T0).sort()).toEqual(['q1', 'q2']);
    const after = reviewGrammarPoint(s, 'q1', 'good', DEFAULT_SCHEDULING_CONFIG, T0);
    expect(after.q1.repetitions).toBe(1);
    expect(dueGrammarIds(after, T0)).toEqual(['q2']);
  });

  it('round-trips through storage and drops corrupt rows', () => {
    saveGrammarSrs(reviewGrammarPoint({}, 'p1', 'good', DEFAULT_SCHEDULING_CONFIG, T0));
    expect(Object.keys(loadGrammarSrs())).toEqual(['p1']);
    expect(parseGrammarSrs('{"bad":{"dueAt":"x"}}')).toEqual({});
    expect(parseGrammarSrs('not json')).toEqual({});
  });
});

describe('favourites and study queue', () => {
  it('persist under the Explorer keys and decorate points', () => {
    const [a, b] = GRAMMAR;
    let c = withListMembership(loadCollections(), 'favorites', [a.id], true);
    c = withListMembership(c, 'queue', [b.id], true);
    saveCollections(c);
    expect(JSON.parse(localStorage.getItem(FAVORITES_KEY)!)).toEqual([a.id]);
    const decorated = applyCollections([a, b], loadCollections());
    expect(decorated[0].favorite).toBe(true);
    expect(decorated[1].queued).toBe(true);
  });

  it('are filter axes: Favourites / Queued narrow the list and count', () => {
    const [a, b, c] = GRAMMAR;
    const corpus = applyCollections([a, b, c], {
      favorites: new Set([a.id]),
      queue: new Set([b.id, c.id]),
    });
    const filters = { ...DEFAULT_PRACTICE_FILTERS, lists: ['queue' as const] };
    expect(filterGrammarPoints(corpus, filters).map((p) => p.id).sort()).toEqual([b.id, c.id].sort());
    expect(hasActiveFilters(filters)).toBe(true);
    expect(listFilterCounts(corpus, DEFAULT_PRACTICE_FILTERS)).toEqual({ favorites: 1, queue: 2 });
    const both = { ...DEFAULT_PRACTICE_FILTERS, lists: ['favorites' as const, 'queue' as const] };
    expect(filterGrammarPoints(corpus, both)).toHaveLength(3);
  });

  it('saved filters keep the lists axis and reject junk', () => {
    localStorage.setItem('k', JSON.stringify({ lists: ['queue', 'nope'] }));
    expect(loadPracticeFilters('k').lists).toEqual(['queue']);
  });
});
