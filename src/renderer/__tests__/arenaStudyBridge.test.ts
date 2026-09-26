// @vitest-environment jsdom
/**
 * Game Arena results reach the rest of the app: session time lands in the
 * day's study seconds, and a word's run of right answers becomes a known-word
 * level through the same interval thresholds the deck uses.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { bankArenaSession, correctStreakDays, levelForGameStreak } from '../games/arenaStudyBridge';
import { getSummary } from '../stats';
import type { ReviewLogEntry } from '../../shared/reviewLog';
import { summarizeReviewLog } from '../../shared/reviewLog';

const DAY = 86_400_000;
const row = (at: number, correct: boolean, word = '猫'): ReviewLogEntry => ({ id: `r${at}`, at, mode: 'game', word, correct });

beforeEach(() => localStorage.clear());

describe('arena study bridge', () => {
  it('counts a session as study time, apart from reading and watching', () => {
    const before = getSummary();
    const start = Date.now() - 95_000;
    expect(bankArenaSession(start, start + 90_000)).toBe(90);
    const after = getSummary();
    expect(after.todayStudySeconds - before.todayStudySeconds).toBe(90);
    expect(after.todaySeconds).toBe(before.todaySeconds);
    expect(after.daysActive).toBeGreaterThanOrEqual(1);
  });

  it('caps a session left open for hours', () => {
    const start = Date.now() - 10 * 3600_000;
    expect(bankArenaSession(start, Date.now())).toBe(3600);
  });

  it('measures an unbroken run of right answers in days', () => {
    const t0 = Date.UTC(2026, 8, 1);
    expect(correctStreakDays([row(t0, true), row(t0 + 3 * DAY, true)], '猫')).toBe(3);
    expect(correctStreakDays([row(t0, true), row(t0 + DAY, false), row(t0 + 2 * DAY, true)], '猫')).toBe(0);
    expect(correctStreakDays([row(t0, true), row(t0 + DAY, false)], '猫')).toBe(0);
    expect(correctStreakDays([row(t0, true, '犬')], '猫')).toBe(0);
  });

  it('maps a streak onto the known-word thresholds; a miss is Learning', () => {
    expect(levelForGameStreak(0, true)).toBe(1);
    expect(levelForGameStreak(2, true)).toBe(2);
    expect(levelForGameStreak(30, true)).toBe(3);
    expect(levelForGameStreak(30, false)).toBe(1);
  });

  it('summarises game answers on their own line', () => {
    const now = Date.now();
    const summary = summarizeReviewLog([row(now, true), row(now, false), { id: 'p', at: now, mode: 'learn', correct: true }], 30, now);
    expect(summary.gameAnswers).toBe(2);
    expect(summary.gameCorrect).toBe(1);
    expect(summary.practiceAnswers).toBe(1);
  });
});
