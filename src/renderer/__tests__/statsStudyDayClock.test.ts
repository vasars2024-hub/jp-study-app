// @vitest-environment jsdom
/**
 * The stats paths agree on one "day" at any hour.
 *
 * `shared/studyDay.ts` made the stats store file everything under the STUDY day (4 am
 * rollover, as in Anki), but several readers kept asking the calendar: the heatmap's
 * today, game answers, the Calendar's due counts and day panel, the streak run it draws,
 * the daily goal's review bars. At 12:00 the two answers are the same day and every test
 * passed; between 00:00 and 04:00 they are a day apart and the app split one evening's
 * study across two dates.
 *
 * This runs the same scenario with the clock pinned at several hours and reduces each
 * result to offsets from the study day `now` is on. The reductions must be identical:
 * 01:30 means exactly what 12:00 means, one study day later or earlier.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getActiveStudyDates,
  getMediaActivityByDay,
  getStudyDaysByKey,
  getSummary,
  recordLinesStudied,
  recordMediaMined,
  recordReviewActivity,
  todayDayKey,
} from '../stats';
import {
  buildStudyHeatmap,
  calendarStudyDay,
  daysFromToday,
  dueByDate,
  gameAnswersByDay,
} from '../../shared/studyActivityHeatmap';
import { calendarDayKind, streakRunDates } from '../../shared/calendarDayDetail';
import { localDueForecast } from '../../shared/reviewForecast';
import { dailyGoalProgress } from '../../shared/dailyGoal';
import { dailyReviewStats } from '../../shared/reviewStats';
import type { ReviewLogEntry } from '../../shared/reviewLog';
import { endOfStudyDay, shiftStudyDayKey, startOfStudyDay, studyDayIndexOfKey, studyDayKey } from '../../shared/studyDay';

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

function logRow(at: number, mode: ReviewLogEntry['mode'] = 'review'): ReviewLogEntry {
  return { at, mode, correct: true, cardId: 'c', rating: 'good' } as unknown as ReviewLogEntry;
}

/** Everything the scenario observes, with every day key turned into an offset from today. */
function scenario(now: Date) {
  vi.setSystemTime(now);
  localStorage.clear();
  const t = now.getTime();
  const today = studyDayKey(t);
  const off = (key: string) => studyDayIndexOfKey(key) - studyDayIndexOfKey(today);
  const offsets = (keys: Iterable<string>) => [...keys].map(off).sort((a, b) => a - b);

  // Tonight: a review and a mined card now; yesterday's study day: lines studied.
  recordReviewActivity('review', true, t);
  recordMediaMined(2, t);
  recordLinesStudied(3, t - DAY);
  // Eight study days back: outside the week, inside all time.
  recordMediaMined(5, t - 8 * DAY);

  const summary = getSummary();
  const days = getStudyDaysByKey();
  const heat = buildStudyHeatmap(days, gameAnswersByDay([logRow(t, 'game')]), now, 7);

  // A card due later in today's study day (half-way to its end), and one a minute into the next.
  const forecast = localDueForecast(
    [{ srs: { dueAt: t + (endOfStudyDay(t) - t) / 2 } }, { srs: { dueAt: endOfStudyDay(t) + MINUTE } }],
    7,
    t,
  );
  const due = dueByDate(forecast, now);

  // Review-log rows: one now, one a minute before today's study day began.
  const log = [logRow(t), logRow(startOfStudyDay(t) - MINUTE)];

  return {
    todayIsStudyDay: todayDayKey() === today,
    todayMediaMined: summary.todayMediaMined,
    weekMediaMined: summary.weekMediaMined,
    totalMediaMined: summary.totalMediaMined,
    weekLinesStudied: summary.weekLinesStudied,
    todayReviews: summary.todayReviews,
    streak: summary.streak,
    recentLast: off(summary.recent[summary.recent.length - 1].date),
    recentMined: summary.recent.filter((d) => (d.mediaMined ?? 0) > 0).map((d) => off(d.date)),
    activeDays: offsets(getActiveStudyDates()),
    streakRun: streakRunDates(getActiveStudyDates(), new Set(), now).map(off),
    mediaDays: offsets(Object.keys(getMediaActivityByDay())),
    heatLast: off(heat.cells[heat.cells.length - 1].date),
    heatActive: heat.cells.filter((c) => c.level > 0).map((c) => off(c.date)),
    heatGamesToday: heat.cells[heat.cells.length - 1].games,
    forecastDays: forecast.days.map((d) => d.due),
    dueDays: offsets(Object.keys(due)),
    todayKind: calendarDayKind(today, now),
    yesterdayKind: calendarDayKind(shiftStudyDayKey(today, -1), now),
    daysFromToday: daysFromToday(today, now),
    calendarToday: calendarStudyDay(today, days[today], due, now),
    goal: dailyGoalProgress(log, 0, t).reviews,
    chartToday: dailyReviewStats(log, 2, t).map((r) => r.learning + r.young + r.mature),
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe('stats bucketing does not depend on the hour', () => {
  const at = (h: number, m: number) => new Date(2026, 9, 13, h, m);

  it('files today, the week, the streak, the heatmap, the due counts and the goal the same way at 01:30 as at 12:00', () => {
    const noon = scenario(at(12, 0));
    expect(noon).toEqual({
      todayIsStudyDay: true,
      todayMediaMined: 2,
      weekMediaMined: 2,
      totalMediaMined: 7,
      weekLinesStudied: 3,
      todayReviews: 1,
      streak: 2,
      recentLast: 0,
      recentMined: [-8, 0],
      activeDays: [-8, -1, 0],
      streakRun: [0, -1],
      mediaDays: [-8, -1, 0],
      heatLast: 0,
      heatActive: [0],
      heatGamesToday: 1,
      forecastDays: [1, 1, 0, 0, 0, 0, 0],
      dueDays: [0, 1],
      todayKind: 'today',
      yesterdayKind: 'past',
      daysFromToday: 0,
      calendarToday: { minutes: 0, reviews: 1, due: 1 },
      goal: 1,
      chartToday: [1, 1],
    });
    expect(scenario(at(1, 30))).toEqual(noon);
  });

  it.each([
    [0, 0], [3, 59], [4, 0], [4, 1], [23, 30],
  ])('gives the same answer at %i:%i', (h, m) => {
    const noon = scenario(at(12, 0));
    expect(scenario(at(h, m))).toEqual(noon);
  });

  it('puts 01:30 on the evening before and 04:00 on the new day', () => {
    vi.setSystemTime(at(1, 30));
    expect(todayDayKey()).toBe('2026-10-12');
    vi.setSystemTime(at(4, 0));
    expect(todayDayKey()).toBe('2026-10-13');
  });
});
