import { describe, expect, it } from 'vitest';
import { computeStreak, todayDayKey } from '../stats';

function keyDaysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function daysWith(active: number[]) {
  const days: Record<string, { seconds: number; chars: number; reviews: number }> = {};
  for (const n of active) days[keyDaysAgo(n)] = { seconds: 0, chars: 0, reviews: 3 };
  return days;
}

describe('computeStreak rest day', () => {
  it('breaks on a missed day by default', () => {
    expect(todayDayKey()).toBe(keyDaysAgo(0));
    expect(computeStreak(daysWith([0, 1, 3, 4]))).toBe(2);
  });

  it('bridges one missed day and does not count it', () => {
    expect(computeStreak(daysWith([0, 1, 3, 4]), true)).toBe(4);
  });

  it('bridges at most one missed day per week', () => {
    expect(computeStreak(daysWith([0, 2, 4, 5]), true)).toBe(2);
    expect(computeStreak(daysWith([0, 2, 3, 5]), true)).toBe(3);
    expect(computeStreak(daysWith([0, 2, 3, 4, 5, 6, 7, 8, 10]), true)).toBe(9);
  });

  it('does not bridge two consecutive missed days', () => {
    expect(computeStreak(daysWith([0, 3, 4]), true)).toBe(1);
  });

  it('does not invent a streak from nothing', () => {
    expect(computeStreak(daysWith([2, 3]), true)).toBe(0);
  });
});
