/**
 * Calendar cells are calendar dates; study figures are filed by study day (4 am by default).
 * Between midnight and the day-start hour the two differ, and the Calendar used to highlight
 * the calendar date as today while its day panel called it 'future' and showed tomorrow's
 * schedule. `calendarCell` is the one rule now: today's cell shows the study day still
 * running, the cell before it shows events only. Pinned at 00:30 and at 12:00, with a 4 am
 * and a midnight day start.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildCalendarDayDetail,
  byCalendarCell,
  calendarCell,
  calendarCellStudyDay,
  streakDatesByCalendarCell,
} from '../calendarDayDetail';
import { DEFAULT_DAY_START_HOUR, setStudyDayStartHour } from '../studyDay';
import type { ReviewLogEntry } from '../reviewLog';

const AFTER_MIDNIGHT = new Date(2026, 9, 14, 0, 30);
const NOON = new Date(2026, 9, 14, 12, 0);
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime();
const row = (over: Partial<ReviewLogEntry>): ReviewLogEntry => ({ id: `r${Math.random()}`, at: 0, mode: 'review', correct: true, ...over });

afterEach(() => setStudyDayStartHour(DEFAULT_DAY_START_HOUR));

describe('calendarCell with a 4 am day start', () => {
  it('at 00:30 files the running study day under the calendar date and leaves the day before with events only', () => {
    setStudyDayStartHour(4);
    expect(calendarCell('2026-10-14', AFTER_MIDNIGHT)).toEqual({ kind: 'today', studyKey: '2026-10-13' });
    expect(calendarCell('2026-10-13', AFTER_MIDNIGHT)).toEqual({ kind: 'past', studyKey: null });
    expect(calendarCell('2026-10-12', AFTER_MIDNIGHT)).toEqual({ kind: 'past', studyKey: '2026-10-12' });
    expect(calendarCell('2026-10-15', AFTER_MIDNIGHT)).toEqual({ kind: 'future', studyKey: '2026-10-15' });
  });

  it('at 12:00 maps every cell to its own date', () => {
    setStudyDayStartHour(4);
    expect(calendarCell('2026-10-14', NOON)).toEqual({ kind: 'today', studyKey: '2026-10-14' });
    expect(calendarCell('2026-10-13', NOON)).toEqual({ kind: 'past', studyKey: '2026-10-13' });
    expect(calendarCell('2026-10-15', NOON)).toEqual({ kind: 'future', studyKey: '2026-10-15' });
  });
});

describe('calendarCell with a midnight day start', () => {
  it.each([
    ['00:30', AFTER_MIDNIGHT],
    ['12:00', NOON],
  ])('maps every cell to its own date at %s', (_label, now) => {
    setStudyDayStartHour(0);
    expect(calendarCell('2026-10-14', now)).toEqual({ kind: 'today', studyKey: '2026-10-14' });
    expect(calendarCell('2026-10-13', now)).toEqual({ kind: 'past', studyKey: '2026-10-13' });
    expect(calendarCell('2026-10-15', now)).toEqual({ kind: 'future', studyKey: '2026-10-15' });
  });
});

describe('the day panel at 00:30 (4 am day start)', () => {
  const reviewLog = [
    row({ at: at(13, 22) }),
    row({ at: at(14, 0, 10), correct: false, isNew: true }),
    row({ at: at(12, 20) }),
  ];
  const dueByDay = { '2026-10-13': 5, '2026-10-14': 2, '2026-10-15': 1 };
  const streakDates = new Set(['2026-10-13', '2026-10-12']);
  const input = { now: AFTER_MIDNIGHT, reviewLog, dueByDay, streakDates };

  it("shows tonight's study and what is owed by 4 am on today's cell, as 'today'", () => {
    setStudyDayStartHour(4);
    const today = buildCalendarDayDetail({ ...input, dateKey: '2026-10-14', day: { seconds: 600, reviews: 2 } });
    expect(today).toMatchObject({
      dateKey: '2026-10-14',
      kind: 'today',
      studyKey: '2026-10-13',
      reviews: { count: 2, passed: 1, newCards: 1 },
      due: 5,
      streak: 'streak',
      empty: false,
    });
    expect(today.minutes.total).toBe(10);
  });

  it("does not show the same figures again on the day before, and keeps the past and the future", () => {
    setStudyDayStartHour(4);
    const before = buildCalendarDayDetail({ ...input, dateKey: '2026-10-13', day: { seconds: 600, reviews: 2 } });
    expect(before).toMatchObject({ kind: 'past', studyKey: null, due: 0, empty: true });
    expect(before.reviews.count).toBe(0);
    expect(before.minutes.total).toBe(0);
    // Its streak badge stays: the streak ran through that date.
    expect(before.streak).toBe('streak');

    const older = buildCalendarDayDetail({ ...input, dateKey: '2026-10-12', day: { reviews: 1 } });
    expect(older).toMatchObject({ kind: 'past', studyKey: '2026-10-12', reviews: { count: 1 } });

    const next = buildCalendarDayDetail({ ...input, dateKey: '2026-10-15' });
    expect(next).toMatchObject({ kind: 'future', studyKey: '2026-10-15', due: 1 });
  });

  it('the grid line, the shading records and the streak markers follow the same rule', () => {
    setStudyDayStartHour(4);
    const days = { '2026-10-13': { seconds: 600, reviews: 2 }, '2026-10-12': { reviews: 1 } };
    expect(calendarCellStudyDay('2026-10-14', days, dueByDay, AFTER_MIDNIGHT)).toEqual({ minutes: 10, reviews: 2, due: 5 });
    expect(calendarCellStudyDay('2026-10-13', days, dueByDay, AFTER_MIDNIGHT)).toBeNull();
    expect(calendarCellStudyDay('2026-10-15', days, dueByDay, AFTER_MIDNIGHT)).toEqual({ minutes: 0, reviews: 0, due: 1 });

    expect(byCalendarCell(days, AFTER_MIDNIGHT)).toEqual({
      '2026-10-14': { seconds: 600, reviews: 2 },
      '2026-10-12': { reviews: 1 },
    });
    expect([...streakDatesByCalendarCell(streakDates, AFTER_MIDNIGHT)].sort())
      .toEqual(['2026-10-12', '2026-10-13', '2026-10-14']);
  });
});

describe('the day panel at 12:00 (4 am day start)', () => {
  it('reads every cell under its own date, and leaves the records untouched', () => {
    setStudyDayStartHour(4);
    const dueByDay = { '2026-10-14': 3, '2026-10-15': 1 };
    const reviewLog = [row({ at: at(14, 9) }), row({ at: at(13, 22) })];
    const today = buildCalendarDayDetail({ dateKey: '2026-10-14', now: NOON, day: { reviews: 1 }, reviewLog, dueByDay });
    expect(today).toMatchObject({ kind: 'today', studyKey: '2026-10-14', reviews: { count: 1 }, due: 3 });
    const before = buildCalendarDayDetail({ dateKey: '2026-10-13', now: NOON, day: { reviews: 1 }, reviewLog, dueByDay });
    expect(before).toMatchObject({ kind: 'past', studyKey: '2026-10-13', reviews: { count: 1 }, due: 0 });

    const days = { '2026-10-13': { reviews: 1 } };
    expect(byCalendarCell(days, NOON)).toBe(days);
    const streak = new Set(['2026-10-13']);
    expect(streakDatesByCalendarCell(streak, NOON)).toBe(streak);
  });
});

describe('the day panel with a midnight day start', () => {
  it.each([
    ['00:30', AFTER_MIDNIGHT],
    ['12:00', NOON],
  ])('reads today under its own date at %s', (_label, now) => {
    setStudyDayStartHour(0);
    const reviewLog = [row({ at: at(14, 0, 10) }), row({ at: at(13, 23) })];
    const dueByDay = { '2026-10-14': 4 };
    const today = buildCalendarDayDetail({ dateKey: '2026-10-14', now, reviewLog, dueByDay });
    expect(today).toMatchObject({ kind: 'today', studyKey: '2026-10-14', reviews: { count: 1 }, due: 4 });
    const before = buildCalendarDayDetail({ dateKey: '2026-10-13', now, reviewLog, dueByDay });
    expect(before).toMatchObject({ kind: 'past', studyKey: '2026-10-13', reviews: { count: 1 } });
    const days = { '2026-10-14': { reviews: 1 } };
    expect(byCalendarCell(days, now)).toBe(days);
  });
});
