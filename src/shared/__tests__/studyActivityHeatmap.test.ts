import { describe, expect, it } from 'vitest';
import {
  addLocalDays,
  buildStudyHeatmap,
  calendarStudyDay,
  daysFromToday,
  dueByDate,
  gameAnswersByDay,
  heatmapLevel,
  localDayKey,
  studyActivityScore,
  studyDayFigures,
} from '../studyActivityHeatmap';

// Local noon, so no test depends on the machine's time zone or a DST edge.
const NOW = new Date(2026, 9, 8, 12, 0, 0);

describe('studyDayFigures', () => {
  it('adds every time channel into minutes and keeps the counts', () => {
    expect(studyDayFigures('2026-10-08', {
      seconds: 600,
      watchSeconds: 1200,
      listenSeconds: 60,
      studySeconds: 120,
      reviews: 40,
      mediaMined: 3,
    }, 12)).toEqual({ date: '2026-10-08', minutes: 33, reviews: 40, games: 12, mined: 3 });
  });

  it('reads a missing or corrupt day as nothing', () => {
    expect(studyDayFigures('2026-10-08', undefined)).toEqual({ date: '2026-10-08', minutes: 0, reviews: 0, games: 0, mined: 0 });
    expect(studyDayFigures('2026-10-08', { seconds: Number.NaN, reviews: -4 }).reviews).toBe(0);
  });
});

describe('gameAnswersByDay', () => {
  it('counts only game answers, per local day', () => {
    const at = (day: number, hour: number) => new Date(2026, 9, day, hour).getTime();
    expect(gameAnswersByDay([
      { at: at(7, 9), mode: 'game' },
      { at: at(7, 23), mode: 'game' },
      { at: at(8, 1), mode: 'game' },
      { at: at(8, 2), mode: 'review' },
    ])).toEqual({ '2026-10-07': 2, '2026-10-08': 1 });
  });
});

describe('buildStudyHeatmap', () => {
  it('covers exactly the last 365 days, oldest first, ending today', () => {
    const map = buildStudyHeatmap({}, {}, NOW, 365);
    expect(map.cells).toHaveLength(365);
    expect(map.cells[364].date).toBe('2026-10-08');
    expect(map.cells[0].date).toBe(localDayKey(addLocalDays(NOW, -364)));
    expect(map.activeDays).toBe(0);
    expect(map.cells.every((cell) => cell.level === 0)).toBe(true);
  });

  it('pads the first column to a whole week', () => {
    const map = buildStudyHeatmap({}, {}, NOW, 7, 0);
    const firstWeekday = addLocalDays(NOW, -6).getDay();
    expect(map.leadingBlanks).toBe(firstWeekday);
    expect(buildStudyHeatmap({}, {}, NOW, 7, 1).leadingBlanks).toBe((firstWeekday + 6) % 7);
  });

  it('shades days against the busiest one and totals every channel', () => {
    const map = buildStudyHeatmap(
      {
        '2026-10-08': { seconds: 3600 },
        '2026-10-07': { reviews: 40 },
        '2026-10-06': { mediaMined: 2 },
      },
      { '2026-10-05': 8 },
      NOW,
      30,
    );
    const byDate = Object.fromEntries(map.cells.map((cell) => [cell.date, cell]));
    expect(byDate['2026-10-08'].level).toBe(4);
    expect(byDate['2026-10-07'].level).toBe(1);
    expect(byDate['2026-10-05'].games).toBe(8);
    expect(byDate['2026-10-04'].level).toBe(0);
    expect(map.activeDays).toBe(4);
    expect(map.totals).toEqual({ minutes: 60, reviews: 40, games: 8, mined: 2 });
  });

  it('weights reviews, games and mining into one ordering score', () => {
    expect(studyActivityScore({ minutes: 10, reviews: 8, games: 4, mined: 1 })).toBe(14);
    expect(heatmapLevel(0, 10)).toBe(0);
    expect(heatmapLevel(0.1, 10)).toBe(1);
    expect(heatmapLevel(10, 10)).toBe(4);
  });
});

describe('due reviews by date', () => {
  it('maps forecast offsets onto local dates, with overdue cards due today', () => {
    expect(dueByDate({
      overdue: 5,
      days: [
        { offsetDays: 0, due: 2 },
        { offsetDays: 1, due: 0 },
        { offsetDays: 3, due: 9 },
      ],
    }, NOW)).toEqual({ '2026-10-08': 7, '2026-10-11': 9 });
  });

  it('crosses a month boundary by calendar day', () => {
    expect(dueByDate({ overdue: 0, days: [{ offsetDays: 30, due: 1 }] }, NOW)).toEqual({ '2026-11-07': 1 });
    expect(daysFromToday('2026-11-07', NOW)).toBe(30);
    expect(daysFromToday('2026-10-01', NOW)).toBe(-7);
  });
});

describe('calendarStudyDay', () => {
  const due = { '2026-10-08': 4, '2026-10-10': 6, '2026-10-01': 99 };

  it('shows study done on past days and today, and due reviews on today and after', () => {
    expect(calendarStudyDay('2026-10-01', { seconds: 1800, reviews: 12 }, due, NOW))
      .toEqual({ minutes: 30, reviews: 12, due: 0 });
    expect(calendarStudyDay('2026-10-08', { reviews: 3 }, due, NOW))
      .toEqual({ minutes: 0, reviews: 3, due: 4 });
    expect(calendarStudyDay('2026-10-10', { seconds: 9999 }, due, NOW))
      .toEqual({ minutes: 0, reviews: 0, due: 6 });
  });

  it('says nothing about a day with nothing', () => {
    expect(calendarStudyDay('2026-10-09', undefined, due, NOW)).toBeNull();
    expect(calendarStudyDay('2026-09-01', {}, due, NOW)).toBeNull();
  });
});
