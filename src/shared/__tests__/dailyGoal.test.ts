/**
 * J7: a real daily study goal. The old goal widget was free text whose counters never
 * reset and whose target could only go up; the goal is now reviews, new cards and
 * minutes, counted from the review log and study statistics for the local day.
 */
import { describe, expect, it } from 'vitest';
import {
  adjustDailyGoalTarget,
  dailyGoalMet,
  dailyGoalProgress,
  dailyGoalRatio,
  defaultDailyGoalTargets,
  localDayBounds,
  normalizeDailyGoalOverrides,
  resolveDailyGoalTargets,
} from '../dailyGoal';
import type { ReviewLogEntry } from '../reviewLog';

const NOON = new Date(2026, 8, 25, 12, 0, 0).getTime();

function row(at: number, patch: Partial<ReviewLogEntry> = {}): ReviewLogEntry {
  return { id: String(at), at, mode: 'review', correct: true, ...patch };
}

describe('targets', () => {
  it('follow the profile: its new-card allowance, reviews at five per new card, 30 minutes', () => {
    expect(defaultDailyGoalTargets(20)).toEqual({ newCards: 20, reviews: 100, minutes: 30 });
    expect(defaultDailyGoalTargets(undefined)).toEqual({ newCards: 10, reviews: 50, minutes: 30 });
  });

  it('step on the grid, go down to 0 (off), and drop back to following the profile', () => {
    let o = adjustDailyGoalTarget({}, 'newCards', 1, 15);
    expect(resolveDailyGoalTargets(o, 15).newCards).toBe(20);
    o = adjustDailyGoalTarget(o, 'newCards', -1, 15);
    // 20 -> 15 is the profile default again, so it stops being an override.
    expect(o).toEqual({});
    let m = {};
    for (let i = 0; i < 10; i += 1) m = adjustDailyGoalTarget(m, 'minutes', -1);
    expect(resolveDailyGoalTargets(m).minutes).toBe(0);
  });

  it('ignores junk in storage', () => {
    expect(normalizeDailyGoalOverrides({ reviews: 'lots', minutes: 1e9, newCards: -3 })).toEqual({ minutes: 600, newCards: 0 });
  });
});

describe('progress', () => {
  it('counts today\'s flashcard reviews and first reviews, not practice or yesterday', () => {
    const { start } = localDayBounds(NOON);
    const entries = [
      row(start + 1000),
      row(start + 2000, { isNew: true }),
      row(start + 3000, { mode: 'practice' as ReviewLogEntry['mode'] }),
      row(start - 1000),
    ];
    expect(dailyGoalProgress(entries, 25 * 60 + 59, NOON)).toEqual({ reviews: 2, newCards: 1, minutes: 25 });
  });

  it('a target of 0 is not part of the goal; met means every active target is reached', () => {
    const targets = { reviews: 10, newCards: 0, minutes: 30 };
    expect(dailyGoalRatio({ reviews: 5, newCards: 3, minutes: 0 }, targets, 'newCards')).toBeNull();
    expect(dailyGoalRatio({ reviews: 5, newCards: 3, minutes: 0 }, targets, 'reviews')).toBe(0.5);
    expect(dailyGoalMet({ reviews: 10, newCards: 0, minutes: 29 }, targets)).toBe(false);
    expect(dailyGoalMet({ reviews: 10, newCards: 0, minutes: 30 }, targets)).toBe(true);
    expect(dailyGoalMet({ reviews: 0, newCards: 0, minutes: 0 }, { reviews: 0, newCards: 0, minutes: 0 })).toBe(false);
  });
});
