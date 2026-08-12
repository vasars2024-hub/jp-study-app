import { describe, expect, it } from 'vitest';

import {
  filterLocalReviewsDue,
  isLocalReviewDue,
  LOCAL_SRS_MIN_EASE,
  LOCAL_SRS_RELEARN_MINUTES,
  scheduleLocalReview,
} from '../localSrs';

const NOW = Date.UTC(2026, 7, 12, 9);
const DAY_MS = 24 * 60 * 60 * 1000;

describe('local SRS schedule', () => {
  it('treats every legacy or malformed schedule as due', () => {
    expect(isLocalReviewDue(undefined, NOW)).toBe(true);
    expect(isLocalReviewDue({ dueAt: NOW + DAY_MS }, NOW)).toBe(true);
    expect(isLocalReviewDue({
      ...scheduleLocalReview(undefined, 'good', NOW),
      repetitions: -1,
    }, NOW)).toBe(true);
  });

  it('graduates Good through 1 day, 3 days, then the ease factor', () => {
    const first = scheduleLocalReview(undefined, 'good', NOW);
    const second = scheduleLocalReview(first, 'good', first.dueAt);
    const third = scheduleLocalReview(second, 'good', second.dueAt);

    expect([first.intervalDays, second.intervalDays, third.intervalDays]).toEqual([1, 3, 8]);
    expect(first.dueAt).toBe(NOW + DAY_MS);
    expect(second.dueAt).toBe(first.dueAt + 3 * DAY_MS);
    expect(third.repetitions).toBe(3);
    expect(third.lapses).toBe(0);
  });

  it('resets repetitions on Again and schedules the relearning step', () => {
    const learned = scheduleLocalReview(scheduleLocalReview(undefined, 'good', NOW), 'good', NOW + DAY_MS);
    const lapsed = scheduleLocalReview(learned, 'again', NOW + 2 * DAY_MS);

    expect(lapsed.intervalDays).toBe(0);
    expect(lapsed.repetitions).toBe(0);
    expect(lapsed.lapses).toBe(1);
    expect(lapsed.dueAt).toBe(lapsed.lastReviewedAt + LOCAL_SRS_RELEARN_MINUTES * 60 * 1000);
    expect(lapsed.ease).toBeCloseTo(2.3);
  });

  it('never lowers ease below its floor after repeated lapses', () => {
    let state = scheduleLocalReview(undefined, 'again', NOW);
    for (let i = 1; i < 20; i += 1) state = scheduleLocalReview(state, 'again', NOW + i);
    expect(state.ease).toBe(LOCAL_SRS_MIN_EASE);
    expect(state.lapses).toBe(20);
  });

  it('becomes due exactly at the persisted due time', () => {
    const state = scheduleLocalReview(undefined, 'good', NOW);
    expect(isLocalReviewDue(state, state.dueAt - 1)).toBe(false);
    expect(isLocalReviewDue(state, state.dueAt)).toBe(true);
  });

  it('filters a mixed deck without changing its order', () => {
    const future = scheduleLocalReview(undefined, 'good', NOW);
    const due = { ...future, dueAt: NOW };
    const cards = [{ id: 'legacy' }, { id: 'future', srs: future }, { id: 'due', srs: due }];
    expect(filterLocalReviewsDue(cards, NOW).map((card) => card.id)).toEqual(['legacy', 'due']);
  });
});
