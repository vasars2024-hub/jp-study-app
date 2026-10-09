import { describe, expect, it } from 'vitest';
import {
  buildCalendarDayDetail,
  calendarDayKind,
  formatCalendarDaySummary,
  formatCalendarMonthSummary,
  heatLevelsFor,
  monthDateKeys,
  streakRunDates,
  yearHeatmap,
} from '../calendarDayDetail';
import type { ReviewLogEntry } from '../reviewLog';

const NOW = new Date(2026, 9, 8, 15, 0); // 2026-10-08, a Thursday
const at = (day: number, hour = 12) => new Date(2026, 9, day, hour).getTime();
const t = (key: string, vars?: Record<string, string | number>) =>
  vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key;

const row = (over: Partial<ReviewLogEntry>): ReviewLogEntry => ({ id: `r${Math.random()}`, at: at(7), mode: 'review', correct: true, ...over });

describe('buildCalendarDayDetail', () => {
  it('folds a past day: reviews with accuracy and new cards from the log, time, books, shows, scenes, games', () => {
    const detail = buildCalendarDayDetail({
      dateKey: '2026-10-07',
      now: NOW,
      day: {
        seconds: 600, watchSeconds: 1200, listenSeconds: 0, studySeconds: 300, chars: 2400,
        reviews: 99, reviewsPassed: 1, mediaMined: 1, linesStudied: 4,
        books: { b1: { title: '吾輩は猫である', seconds: 600, chars: 2400 } },
        shows: { 'file:c:/v/ep1.mkv': { title: 'Frieren #1', seconds: 1200 } },
      },
      reviewLog: [
        row({ correct: true, isNew: true }),
        row({ correct: false }),
        row({ correct: true }),
        row({ correct: true, at: at(6) }), // another day: ignored
        row({ mode: 'game', correct: true }),
        row({ mode: 'learn', correct: false }),
      ],
      deck: [{ id: 'c1', addedAt: at(7, 9) }, { id: 'c2', addedAt: at(5) }],
      games: [{ id: 'g1', gameId: 'cloze-blitz', score: 80, accuracy: 0.8, mistakes: 1, createdAt: at(7, 20) }],
      scenes: [
        { key: 's1', localFilePath: 'C:/v/ep1.mkv', cueStartSec: 12, sentence: '行こう', title: 'Frieren', at: at(7, 21) },
        { key: 's2', localFilePath: 'C:/v/ep1.mkv', cueStartSec: 30, sentence: '別の日', title: 'Frieren', at: at(3) },
      ],
      streakDates: new Set(['2026-10-07']),
    });
    expect(detail.kind).toBe('past');
    // The log knows accuracy exactly: 2 of 3 on that day (the stats count of 99 is the fallback only).
    expect(detail.reviews).toEqual({ count: 3, passed: 2, accuracy: 2 / 3, newCards: 1 });
    expect(detail.practice).toEqual({ count: 1, correct: 0 });
    expect(detail.games.answers).toBe(1);
    expect(detail.games.sessions.map((g) => g.id)).toEqual(['g1']);
    expect(detail.minutes).toEqual({ reading: 10, watching: 20, listening: 0, study: 5, total: 35 });
    expect(detail.books).toEqual([{ id: 'b1', title: '吾輩は猫である', minutes: 10, chars: 2400 }]);
    expect(detail.shows).toEqual([{ id: 'file:c:/v/ep1.mkv', title: 'Frieren #1', minutes: 20 }]);
    expect(detail.mined.scenes.map((s) => s.key)).toEqual(['s1']);
    expect(detail.mined.count).toBe(1);
    expect(detail.addedCards).toBe(1);
    expect(detail.due).toBe(0); // a past day has nothing due that today's schedule can know
    expect(detail.streak).toBe('streak');
    expect(detail.empty).toBe(false);
  });

  it('falls back to the stats tallies when the log has no rows for the day', () => {
    const detail = buildCalendarDayDetail({
      dateKey: '2026-10-07',
      now: NOW,
      day: { reviews: 10, reviewsPassed: 7, practice: 4, practiceCorrect: 3 },
    });
    expect(detail.reviews).toEqual({ count: 10, passed: 7, accuracy: 0.7, newCards: 0 });
    expect(detail.practice).toEqual({ count: 4, correct: 3 });
  });

  it('shows a coming day only for what is due, and a rest day as rest', () => {
    const future = buildCalendarDayDetail({
      dateKey: '2026-10-10',
      now: NOW,
      day: { seconds: 999, reviews: 5 },
      reviewLog: [row({ at: at(10) })],
      dueByDay: { '2026-10-10': 12 },
    });
    expect(future.kind).toBe('future');
    expect(future.reviews.count).toBe(0);
    expect(future.minutes.total).toBe(0);
    expect(future.due).toBe(12);
    expect(future.empty).toBe(false);

    const rest = buildCalendarDayDetail({ dateKey: '2026-10-05', now: NOW, restDates: new Set(['2026-10-05']) });
    expect(rest.streak).toBe('rest');
    expect(rest.empty).toBe(true);
  });

  it('names today as today and keeps its due count', () => {
    expect(calendarDayKind('2026-10-08', NOW)).toBe('today');
    const today = buildCalendarDayDetail({ dateKey: '2026-10-08', now: NOW, dueByDay: { '2026-10-08': 3 } });
    expect(today.due).toBe(3);
  });
});

describe('streakRunDates', () => {
  it('runs back from today while days are studied, across a spent rest day', () => {
    const active = new Set(['2026-10-08', '2026-10-07', '2026-10-05', '2026-10-04']);
    expect(streakRunDates(active, new Set(['2026-10-06']), NOW)).toEqual([
      '2026-10-08', '2026-10-07', '2026-10-06', '2026-10-05', '2026-10-04',
    ]);
  });

  it('starts yesterday while today is not studied yet, and stops at a gap', () => {
    const active = new Set(['2026-10-07', '2026-10-06', '2026-10-04']);
    expect(streakRunDates(active, new Set(), NOW)).toEqual(['2026-10-07', '2026-10-06']);
  });

  it('is empty with no recent study', () => {
    expect(streakRunDates(new Set(['2026-09-01']), new Set(), NOW)).toEqual([]);
  });
});

describe('heat levels and the year view', () => {
  it('shades against the busiest day in view, 0 only for nothing', () => {
    const levels = heatLevelsFor(['a', 'b', 'c'], { a: { seconds: 3600 }, b: { seconds: 600 } });
    expect(levels).toEqual({ a: 4, b: 1, c: 0 });
  });

  it('builds twelve month blocks with weekday-aligned blanks', () => {
    const months = yearHeatmap(2026, { '2026-03-15': { reviews: 40 } }, {}, 1);
    expect(months).toHaveLength(12);
    expect(months.reduce((sum, m) => sum + m.days.length, 0)).toBe(365);
    // 2026-01-01 is a Thursday: three blanks before it in a Monday-first week.
    expect(months[0].leadingBlanks).toBe(3);
    expect(months[2].days.find((d) => d.date === '2026-03-15')).toMatchObject({ level: 4, reviews: 40 });
    expect(monthDateKeys(2028, 1)).toHaveLength(29);
  });
});

describe('export', () => {
  it('writes a day as Markdown in the UI language, study content verbatim', () => {
    const detail = buildCalendarDayDetail({
      dateKey: '2026-10-07',
      now: NOW,
      day: { reviews: 4, reviewsPassed: 3, seconds: 600, books: { b: { title: '雪国', seconds: 600, chars: 900 } } },
      scenes: [{ key: 's', localFilePath: 'x.mkv', cueStartSec: 1, sentence: '行こう', title: 'Ep', at: at(7) }],
    });
    const text = formatCalendarDaySummary(detail, t, 'Oct 7');
    expect(text.split('\n')[0]).toBe('## Oct 7');
    expect(text).toContain('cal2.day.reviewsLine(count=4,accuracy=75)');
    expect(text).toContain('雪国');
    expect(text).toContain('行こう (Ep)');
  });

  it('says so for an empty day, and totals a month', () => {
    const empty = buildCalendarDayDetail({ dateKey: '2026-10-01', now: NOW });
    expect(formatCalendarDaySummary(empty, t, 'Oct 1')).toContain('cal2.day.nothing');
    const busy = buildCalendarDayDetail({ dateKey: '2026-10-02', now: NOW, day: { reviews: 10, reviewsPassed: 5, seconds: 120 } });
    const month = formatCalendarMonthSummary([empty, busy], t, 'October 2026', (key) => key);
    expect(month).toContain('# cal2.export.monthTitle(month=October 2026)');
    expect(month).toContain('cal2.export.activeDays(count=1)');
    expect(month).toContain('## 2026-10-02');
    expect(month).not.toContain('## 2026-10-01');
  });
});
