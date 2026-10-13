/**
 * Package #3, FSRS fidelity: the study day, learn-ahead, the memory replay and
 * queue-true Due — each pinned against what Anki does.
 *
 * - One day rule everywhere (`studyDay.ts`): a study day starts at 4 am by
 *   default. A review at 01:30 belongs to the evening before; 04:30 is a new
 *   day. The scheduler's short-term split, FSRS elapsed days, the optimiser,
 *   stats and the new-card budget all read it. Daylight-saving days are one
 *   day, whatever their length.
 * - Learn-ahead: when only learning steps are left, a step due within the
 *   limit (20 min) is shown early; a longer one is waited for.
 * - Replay: memory rebuilt from the log reproduces the live scheduler, and a
 *   history without its first review starts from the SM-2 estimate.
 * - Due: per-deck Due follows the queue's rule, not "every new card".
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_SCHEDULING_CONFIG,
  normalizeSchedulingConfig,
  previewScheduleDelays,
  scheduleReview,
  type SchedulingConfig,
} from '../flashcardScheduling';
import { fsrsMemoryFromSm2, fsrsReview, fsrsShortTermReview } from '../fsrs';
import { buildTrainingSequences } from '../fsrsOptimizer';
import { applyFsrsReplayEntry, planFsrsReplay, replayFsrsMemory } from '../fsrsMemoryReplay';
import { scheduleLocalReview, type LocalSrsRating, type LocalSrsState } from '../localSrs';
import { summarizeReviewLog, type ReviewLogEntry } from '../reviewLog';
import { isQueueDue, nextSessionCardId, nextStepWait } from '../reviewSessionQueue';
import { dailyReviewStats, deckStats, hourlyBreakdown } from '../reviewStats';
import {
  endOfStudyDay,
  getStudyDayStartHour,
  isSameStudyDay,
  lastStudyDayKeys,
  normalizeDayStartHour,
  setStudyDayStartHour,
  shiftStudyDayKey,
  startOfStudyDay,
  studyDayIndex,
  studyDayKey,
  studyDaysBetween,
} from '../studyDay';

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

const FSRS: SchedulingConfig = normalizeSchedulingConfig({ ...DEFAULT_SCHEDULING_CONFIG, algorithm: 'fsrs' });

/** Local wall-clock time. */
const at = (y: number, m: number, d: number, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();

function withTz<T>(tz: string, run: () => T): T {
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    return run();
  } finally {
    process.env.TZ = previous;
  }
}

afterEach(() => setStudyDayStartHour(4));

describe('the study day', () => {
  it('starts at 4 am by default, like Anki', () => {
    expect(getStudyDayStartHour()).toBe(4);
    expect(DEFAULT_SCHEDULING_CONFIG.dayStartHour).toBe(4);
    expect(normalizeDayStartHour(undefined)).toBe(4);
    expect(normalizeDayStartHour(25)).toBe(23);
    expect(normalizeDayStartHour(-3)).toBe(0);
  });

  it('puts a review at 01:30 on the evening before, and one at 04:30 on the new day', () => {
    const evening = at(2026, 10, 11, 22, 0);
    const early = at(2026, 10, 12, 1, 30);
    const morning = at(2026, 10, 12, 4, 30);
    expect(studyDayKey(early)).toBe('2026-10-11');
    expect(studyDayKey(morning)).toBe('2026-10-12');
    expect(isSameStudyDay(evening, early)).toBe(true);
    expect(isSameStudyDay(early, morning)).toBe(false);
    expect(studyDaysBetween(evening, morning)).toBe(1);
    // With the day starting at midnight the same reviews split differently.
    expect(studyDayKey(early, 0)).toBe('2026-10-12');
    expect(isSameStudyDay(evening, early, 0)).toBe(false);
  });

  it('has its bounds at the start hour, and lists days oldest first', () => {
    const now = at(2026, 10, 12, 2, 0);
    expect(startOfStudyDay(now)).toBe(at(2026, 10, 11, 4, 0));
    expect(endOfStudyDay(now)).toBe(at(2026, 10, 12, 4, 0));
    expect(lastStudyDayKeys(3, now)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    expect(shiftStudyDayKey('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('counts a daylight-saving day as one day (spring forward and fall back)', () => {
    withTz('America/New_York', () => {
      // 2026-03-08: clocks jump 02:00 -> 03:00, the day is 23 hours long.
      const before = new Date(2026, 2, 7, 23, 0).getTime();
      const after = new Date(2026, 2, 8, 23, 0).getTime();
      expect(after - before).toBe(23 * HOUR);
      expect(studyDaysBetween(before, after)).toBe(1);
      // The 02:00 jump falls inside the study day that began at 04:00 on the 7th.
      expect(endOfStudyDay(before) - startOfStudyDay(before)).toBe(23 * HOUR);
      expect(endOfStudyDay(after) - startOfStudyDay(after)).toBe(24 * HOUR);
      // 2026-11-01: clocks fall back 02:00 -> 01:00, a 25-hour day.
      const fallBefore = new Date(2026, 9, 31, 22, 0).getTime();
      const fallAfter = new Date(2026, 10, 1, 22, 0).getTime();
      expect(fallAfter - fallBefore).toBe(25 * HOUR);
      expect(studyDaysBetween(fallBefore, fallAfter)).toBe(1);
      // 03:30 on the fall-back night is still the 31st's study day.
      expect(studyDayKey(new Date(2026, 10, 1, 3, 30).getTime())).toBe('2026-10-31');
    });
  });

  it('is the day the optimiser trains on (no fixed UTC offset across DST)', () => {
    withTz('America/New_York', () => {
      const rows = [
        { cardId: 'x', at: new Date(2026, 2, 7, 22, 0).getTime(), rating: 'good' as const, isNew: true },
        { cardId: 'x', at: new Date(2026, 2, 8, 22, 0).getTime(), rating: 'good' as const },
        { cardId: 'x', at: new Date(2026, 2, 9, 3, 30).getTime(), rating: 'good' as const },
      ];
      const seq = buildTrainingSequences(rows, { dayStartHour: 4 })[0];
      expect(seq.map((r) => r.deltaDays)).toEqual([0, 1, 0]);
      expect(studyDayIndex(rows[2].at) - studyDayIndex(rows[1].at)).toBe(0);
    });
  });
});

describe('the scheduler on study days', () => {
  const first = at(2026, 10, 11, 21, 0);
  const card = scheduleReview(undefined, 'good', FSRS, first);

  it('treats a review at 01:30 after an evening review as same-day (short-term, w17/w18)', () => {
    const late = at(2026, 10, 12, 1, 30);
    const next = scheduleReview(card, 'good', FSRS, late);
    const memory = { stability: card.stability ?? 0, difficulty: card.difficulty ?? 0 };
    expect(next.stability).toBeCloseTo(fsrsShortTermReview(memory, 3).stability, 10);
  });

  it('treats a review at 04:30 as a new day (long-term, one whole elapsed day)', () => {
    const morning = at(2026, 10, 12, 4, 30);
    const next = scheduleReview(card, 'good', FSRS, morning);
    const memory = { stability: card.stability ?? 0, difficulty: card.difficulty ?? 0 };
    // Seven and a half hours, but one study day: delta_t = 1, as Anki counts it.
    expect(next.stability).toBeCloseTo(fsrsReview(memory, 3, 1).stability, 10);
  });

  it('makes a review card due from the START of its due study day, and labels it in whole days', () => {
    const next = scheduleReview(card, 'good', FSRS, at(2026, 10, 14, 20, 0));
    expect(next.intervalDays).toBeGreaterThanOrEqual(1);
    const dueDay = new Date(next.dueAt);
    expect(dueDay.getHours()).toBe(4);
    expect(dueDay.getMinutes()).toBe(0);
    expect(studyDaysBetween(at(2026, 10, 14, 20, 0), next.dueAt)).toBe(next.intervalDays);
    const delays = previewScheduleDelays(card, FSRS, at(2026, 10, 14, 20, 0));
    expect(Number.isInteger(delays.good)).toBe(true);
    expect(delays.good).toBe(next.intervalDays);
  });

  it('follows the configured hour', () => {
    const midnight = normalizeSchedulingConfig({ ...FSRS, dayStartHour: 0 });
    const c = scheduleReview(undefined, 'good', midnight, at(2026, 10, 11, 23, 0));
    const next = scheduleReview(c, 'good', midnight, at(2026, 10, 12, 1, 30));
    const memory = { stability: c.stability ?? 0, difficulty: c.difficulty ?? 0 };
    expect(next.stability).toBeCloseTo(fsrsReview(memory, 3, 1).stability, 10);
    expect(new Date(next.dueAt).getHours()).toBe(0);
  });

  it('keeps Hard <= Good < Easy even when a fit makes Hard grow faster than Good', () => {
    // A legal fit with a hard "penalty" above 1 and no easy bonus.
    const w = [...(FSRS.fsrsWeights ?? [])];
    const weights = w.length ? w : [
      0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046, 1.54575,
      0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 1, 1, 0.51655, 0.6621,
    ];
    weights[15] = 1;
    weights[16] = 1;
    const config = normalizeSchedulingConfig({ ...FSRS, fsrsWeights: weights });
    const review: LocalSrsState = {
      version: 2, algorithm: 'fsrs', dueAt: at(2026, 10, 20), intervalDays: 10, ease: 2.5,
      repetitions: 3, lapses: 0, lastReviewedAt: at(2026, 10, 10), lastRating: 'good',
      stability: 10, difficulty: 5,
    };
    const now = at(2026, 10, 20);
    const days = (rating: LocalSrsRating) => scheduleReview(review, rating, config, now).intervalDays;
    expect(days('hard')).toBeLessThanOrEqual(days('good'));
    expect(days('good')).toBeLessThan(days('easy'));
    // With equal growth Hard would equal Good; Good is pushed one day past it.
    expect(days('good')).toBe(days('hard') + 1);
  });

  it('carries an SM-2 card into FSRS with the memory_state_from_sm2 estimate, not as a new card', () => {
    // A 200-day SM-2 card: ease 2.5, interval 200.
    const sm2: LocalSrsState = {
      version: 2, algorithm: 'sm2', dueAt: at(2026, 10, 12), intervalDays: 200, ease: 2.5,
      repetitions: 8, lapses: 0, lastReviewedAt: at(2026, 3, 26), lastRating: 'good',
    };
    const next = scheduleReview(sm2, 'good', FSRS, at(2026, 10, 12));
    const estimate = fsrsMemoryFromSm2(2.5, 200);
    expect(estimate.stability).toBeCloseTo(200, 3);
    expect(next.stability).toBeGreaterThan(200);
    expect(next.intervalDays).toBeGreaterThan(200);
  });
});

describe('learn-ahead', () => {
  const NOW = at(2026, 10, 12, 20, 0);
  const step = (id: string, minutes: number) => ({ id, srs: { dueAt: NOW + minutes * MIN, phase: 'learning' as const } });

  it('defaults to Anki\'s 20 minutes, and is configurable', () => {
    expect(DEFAULT_SCHEDULING_CONFIG.learnAheadMinutes).toBe(20);
    expect(normalizeSchedulingConfig({ learnAheadMinutes: 45 }).learnAheadMinutes).toBe(45);
    expect(normalizeSchedulingConfig({ learnAheadMinutes: -1 }).learnAheadMinutes).toBe(20);
    expect(normalizeSchedulingConfig({ learnAheadMinutes: 0 }).learnAheadMinutes).toBe(0);
  });

  it('shows a step due within the limit early when nothing else is left', () => {
    expect(nextSessionCardId([step('a', 15)], new Set(), NOW)).toBe('a');
  });

  it('does not skip a step due beyond the limit: the sitting waits for it', () => {
    const cards = [step('long', 60), { id: 'done' }];
    const answered = new Set(['done']);
    expect(nextSessionCardId(cards, answered, NOW)).toBeNull();
    expect(nextStepWait(cards, answered)).toEqual({ cardId: 'long', dueAt: NOW + 60 * MIN, showAt: NOW + 40 * MIN });
    // At 40 minutes it comes inside the limit and is shown.
    expect(nextSessionCardId(cards, answered, NOW + 40 * MIN)).toBe('long');
    // A wider limit shows it at once; a zero limit only when due.
    expect(nextSessionCardId(cards, answered, NOW, 90)).toBe('long');
    expect(nextSessionCardId([step('a', 1)], new Set(), NOW, 0)).toBeNull();
  });

  it('never puts a step ahead of fresh cards just because it is inside the limit', () => {
    expect(nextSessionCardId([{ id: 'fresh' }, step('soon', 5)], new Set(), NOW)).toBe('fresh');
  });

  it('counts a step as due for the queue within the limit, and a review card only when due', () => {
    expect(isQueueDue({ dueAt: NOW + 10 * MIN, phase: 'learning' }, NOW)).toBe(true);
    expect(isQueueDue({ dueAt: NOW + 30 * MIN, phase: 'learning' }, NOW)).toBe(false);
    expect(isQueueDue({ dueAt: NOW + 10 * MIN }, NOW)).toBe(false);
    expect(isQueueDue(undefined, NOW)).toBe(true);
  });
});

describe('fsrsMemoryReplay', () => {
  it('rebuilds exactly the memory the live scheduler wrote (study days, short-term steps)', () => {
    const config = normalizeSchedulingConfig({ ...FSRS, learningStepsMinutes: [1, 10] });
    const times = [
      at(2026, 9, 1, 21, 0), at(2026, 9, 1, 21, 1), at(2026, 9, 2, 1, 30), // same study day
      at(2026, 9, 4, 8, 0), at(2026, 9, 12, 19, 0), at(2026, 9, 30, 7, 0),
    ];
    const ratings: LocalSrsRating[] = ['good', 'good', 'good', 'again', 'good', 'easy'];
    let state: LocalSrsState | undefined;
    const log: ReviewLogEntry[] = [];
    times.forEach((t, i) => {
      log.push({ id: `r${i}`, at: t, mode: 'review', cardId: 'c', rating: ratings[i], correct: ratings[i] !== 'again', ...(i === 0 ? { isNew: true } : {}) });
      state = scheduleReview(state, ratings[i], config, t);
    });
    const replay = replayFsrsMemory(log, { dayStartHour: 4 });
    expect(replay?.complete).toBe(true);
    expect(replay?.reviews).toBe(6);
    expect(replay?.memory.stability).toBeCloseTo(state?.stability ?? 0, 9);
    expect(replay?.memory.difficulty).toBeCloseTo(state?.difficulty ?? 0, 9);
  });

  it('starts a truncated history from the SM-2 estimate, and a reset from its last first review', () => {
    const truncated = replayFsrsMemory([
      { cardId: 'c', at: at(2026, 9, 10), rating: 'good', prevIntervalDays: 30 },
    ]);
    expect(truncated?.complete).toBe(false);
    expect(truncated?.memory.stability).toBeCloseTo(fsrsReview(fsrsMemoryFromSm2(2.5, 30), 3, 30).stability, 9);
    const reset = replayFsrsMemory([
      { cardId: 'c', at: at(2026, 1, 1), rating: 'easy', isNew: true },
      { cardId: 'c', at: at(2026, 5, 1), rating: 'again', isNew: true },
    ]);
    expect(reset?.reviews).toBe(1);
    expect(reset?.memory.stability).toBeCloseTo(0.40255, 9);
  });

  it('previews without moving due dates unless asked, and never applies over a newer review', () => {
    const last = at(2026, 9, 1, 20, 0);
    const sm2 = scheduleLocalReview(scheduleLocalReview(undefined, 'good', last - 3 * DAY), 'good', last);
    const cards = [{ id: 'a', srs: sm2 }, { id: 'new' }, { id: 'parked', suspended: true, srs: sm2 }];
    const config = { desiredRetention: 0.9, maximumIntervalDays: 36_500, dayStartHour: 4 };
    const now = at(2026, 9, 2, 12, 0);
    const memoryOnly = planFsrsReplay(cards, [], config, now, false);
    expect(memoryOnly.considered).toBe(1);
    expect(memoryOnly.fromSm2).toBe(1);
    expect(memoryOnly.moved).toBe(0);
    expect(memoryOnly.entries[0].after.dueAt).toBe(sm2.dueAt);
    const moving = planFsrsReplay(cards, [], { ...config, desiredRetention: 0.8 }, now, true);
    expect(moving.moved).toBe(1);
    const entry = moving.entries[0];
    expect(new Date(entry.after.dueAt).getHours()).toBe(4);
    const applied = applyFsrsReplayEntry(sm2, entry);
    expect(applied?.algorithm).toBe('fsrs');
    expect(applied?.stability).toBe(entry.after.stability);
    // Reviewed after the preview: the stale plan is refused.
    expect(applyFsrsReplayEntry({ ...sm2, lastReviewedAt: sm2.lastReviewedAt + 1 }, entry)).toBeNull();
  });
});

describe('stats on the study day, and queue-true Due', () => {
  const NOW = at(2026, 10, 12, 12, 0);
  const row = (id: string, t: number, extra: Partial<ReviewLogEntry> = {}): ReviewLogEntry => ({
    id, at: t, mode: 'review', cardId: 'c', rating: 'good', correct: true, prevIntervalDays: 5, ...extra,
  });

  it('counts a 01:30 review toward the day before in every summary', () => {
    const entries = [row('late', at(2026, 10, 12, 1, 30)), row('day', at(2026, 10, 12, 9, 0))];
    const daily = dailyReviewStats(entries, 2, NOW);
    expect(daily.map((d) => [d.date, d.young])).toEqual([['2026-10-11', 1], ['2026-10-12', 1]]);
    const summary = summarizeReviewLog(entries, 2, NOW);
    expect(summary.perDay.map((d) => d.reviews)).toEqual([1, 1]);
  });

  it('keeps game-graded reviews out of every pass rate', () => {
    const entries = [
      row('real', at(2026, 10, 12, 9), { correct: false, rating: 'again' }),
      row('game', at(2026, 10, 12, 10), { source: 'game' }),
    ];
    const [today] = dailyReviewStats(entries, 1, NOW);
    expect(today.young).toBe(2);
    expect(today.graded).toBe(1);
    expect(today.passed).toBe(0);
    const summary = summarizeReviewLog(entries, 1, NOW);
    expect(summary.reviews).toBe(1);
    expect(summary.perDay[0].passed).toBe(0);
    expect(summary.retention).toBe(0);
    expect(summary.gameAnswers).toBe(1);
    const hours = hourlyBreakdown(entries);
    expect(hours.reduce((n, h) => n + h.reviews, 0)).toBe(1);
  });

  it('shows per-deck Due as the queue would: new-card allowance, learn-ahead', () => {
    const cards = [
      ...Array.from({ length: 30 }, (_, i) => ({ id: `n${i}`, deckKey: 'big' })),
      { id: 'due', deckKey: 'big', srs: { dueAt: NOW - HOUR, intervalDays: 3, lapses: 0 } },
      { id: 'step', deckKey: 'big', srs: { dueAt: NOW + 10 * MIN, intervalDays: 0, lapses: 0, phase: 'learning' } },
      { id: 'later', deckKey: 'big', srs: { dueAt: NOW + 2 * DAY, intervalDays: 3, lapses: 0 } },
    ];
    const [big] = deckStats(cards, [], 0, NOW, { newAllowance: 20 });
    expect(big.newCards).toBe(30);
    expect(big.dueNow).toBe(20 + 1 + 1);
    // The renderer hands the queue's own per-source counts, which win.
    const [handed] = deckStats(cards, [], 0, NOW, { dueByDeck: new Map([['big', 7]]) });
    expect(handed.dueNow).toBe(7);
  });
});
