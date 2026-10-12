// @vitest-environment jsdom
/**
 * The study planner pass: drag-to-reschedule maths, the strict date/time readers the
 * Agent's calendar tools share with the Calendar, and the iCalendar export.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  addEvent,
  daysBetweenKeys,
  detachOccurrence,
  excludeOccurrence,
  expandOccurrences,
  isCalendarDateKey,
  loadEvents,
  normalizeClockTime,
  parseDateKey,
  rescheduleEventPatch,
  shiftDateKey,
  updateEvent,
  type CalendarEvent,
} from '../calendar';
import { calendarEventsToIcs } from '../calendarIcs';

afterEach(() => localStorage.clear());

const base: Omit<CalendarEvent, 'id' | 'createdAt'> = {
  title: 'Kanji review',
  date: '2026-10-05',
  startTime: '19:00',
  endTime: '19:30',
  allDay: false,
  color: '#6c7bff',
  category: 'study',
  reminder: 'none',
  recurrence: 'none',
};

describe('calendar date and time readers', () => {
  it('accepts only real dates', () => {
    expect(isCalendarDateKey('2026-02-28')).toBe(true);
    expect(isCalendarDateKey('2028-02-29')).toBe(true);
    expect(isCalendarDateKey('2026-02-29')).toBe(false);
    expect(isCalendarDateKey('2026-02-31')).toBe(false);
    expect(isCalendarDateKey('2026-13-01')).toBe(false);
    expect(isCalendarDateKey('26-10-01')).toBe(false);
    expect(isCalendarDateKey(20261001)).toBe(false);
  });

  it('pads and validates clock times so string order is time order', () => {
    expect(normalizeClockTime('9:05')).toBe('09:05');
    expect(normalizeClockTime('23:59')).toBe('23:59');
    expect(normalizeClockTime('24:00')).toBeNull();
    expect(normalizeClockTime('9am')).toBeNull();
    expect(normalizeClockTime(900)).toBeNull();
  });

  it('shifts and diffs date keys by calendar days across month, year and DST edges', () => {
    expect(shiftDateKey('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftDateKey('2026-12-31', 1)).toBe('2027-01-01');
    // Spring-forward and fall-back weeks in both hemispheres' common rules.
    expect(shiftDateKey('2026-03-07', 2)).toBe('2026-03-09');
    expect(shiftDateKey('2026-10-24', 3)).toBe('2026-10-27');
    expect(daysBetweenKeys('2026-03-01', '2026-04-01')).toBe(31);
    expect(daysBetweenKeys('2026-11-03', '2026-10-25')).toBe(-9);
  });
});

describe('drag-to-reschedule', () => {
  it('moves a one-off event to the drop day', () => {
    expect(rescheduleEventPatch(base, '2026-10-05', '2026-10-08')).toEqual({ date: '2026-10-08' });
    expect(rescheduleEventPatch(base, '2026-10-05', '2026-10-05')).toBeNull();
    expect(rescheduleEventPatch(base, '2026-10-05', 'not-a-day')).toBeNull();
  });

  it('moves a repeating series so the dragged occurrence lands where it was dropped', () => {
    const weekly = { ...base, recurrence: 'weekly' as const, recurrenceEndDate: '2026-11-30' };
    // Drag the Oct 19 occurrence to Oct 21: the whole series moves two days.
    const patch = rescheduleEventPatch(weekly, '2026-10-19', '2026-10-21');
    expect(patch).toEqual({ date: '2026-10-07', recurrenceEndDate: '2026-12-02' });
    const created = addEvent(weekly);
    updateEvent(created.id, patch!);
    const moved = loadEvents().find((event) => event.id === created.id)!;
    const dates = expandOccurrences([moved], parseDateKey('2026-10-01'), parseDateKey('2026-10-31'))
      .map((o) => o.occurrenceDate);
    expect(dates).toContain('2026-10-21');
    expect(dates).not.toContain('2026-10-19');
  });
});

describe('single occurrences of a repeating event', () => {
  const daily = { ...base, recurrence: 'daily' as const, recurrenceEndDate: '2026-10-10' };
  const datesOf = (id: string) => expandOccurrences(loadEvents().filter((e) => e.id === id), parseDateKey('2026-10-01'), parseDateKey('2026-10-31'))
    .map((o) => o.occurrenceDate);

  it('skips one date and keeps the rest', () => {
    const created = addEvent(daily);
    excludeOccurrence(created, '2026-10-07');
    expect(datesOf(created.id)).toEqual(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09', '2026-10-10']);
  });

  it('splits a date off as its own one-off event', () => {
    const created = addEvent({ ...daily, reminder: '15m' });
    const split = detachOccurrence(created, '2026-10-06', '2026-10-20')!;
    expect(split.seriesPatch).toEqual({ excludedDates: ['2026-10-06'] });
    expect(split.single).toMatchObject({ date: '2026-10-20', recurrence: 'none', reminder: '15m', title: 'Kanji review' });
    expect(split.single).not.toHaveProperty('recurrenceEndDate');
    expect(detachOccurrence({ ...created, recurrence: 'none' }, '2026-10-06')).toBeNull();
  });
});

describe('iCalendar export', () => {
  const event = (patch: Partial<CalendarEvent>): CalendarEvent => ({
    ...base,
    id: 'ev-1',
    createdAt: Date.UTC(2026, 9, 1, 12),
    ...patch,
  });
  const NOW = Date.UTC(2026, 9, 9, 8, 30);

  it('writes a valid VCALENDAR with floating local times and CRLF lines', () => {
    const ics = calendarEventsToIcs([event({})], { now: NOW, calendarName: 'Study' });
    expect(ics.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true);
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('DTSTART:20261005T190000\r\n');
    expect(ics).toContain('DTEND:20261005T193000\r\n');
    expect(ics).toContain('DTSTAMP:20261009T083000Z\r\n');
    expect(ics).toContain('UID:ev-1@gum-study-calendar');
    expect(ics).toContain('X-WR-CALNAME:Study');
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it('writes all-day events as dates with an exclusive end', () => {
    const ics = calendarEventsToIcs([event({ allDay: true, startTime: undefined, endTime: undefined, date: '2026-12-31' })], { now: NOW });
    expect(ics).toContain('DTSTART;VALUE=DATE:20261231');
    expect(ics).toContain('DTEND;VALUE=DATE:20270101');
  });

  it('maps every repeat the app offers, including month-end clamping', () => {
    const rules = (patch: Partial<CalendarEvent>) =>
      calendarEventsToIcs([event(patch)], { now: NOW }).split('\r\n').filter((line) => line.startsWith('RRULE'));
    expect(rules({ recurrence: 'daily' })).toEqual(['RRULE:FREQ=DAILY']);
    expect(rules({ recurrence: 'weekly', recurrenceEndDate: '2026-12-01' })).toEqual(['RRULE:FREQ=WEEKLY;UNTIL=20261201T235959']);
    expect(rules({ recurrence: 'custom', recurrenceInterval: 3 })).toEqual(['RRULE:FREQ=DAILY;INTERVAL=3']);
    expect(rules({ recurrence: 'monthly' })).toEqual(['RRULE:FREQ=MONTHLY']);
    expect(rules({ recurrence: 'monthly', date: '2026-01-31' })).toEqual(['RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1']);
    expect(rules({ recurrence: 'daily', allDay: true, startTime: undefined, recurrenceEndDate: '2026-10-10' }))
      .toEqual(['RRULE:FREQ=DAILY;UNTIL=20261010']);
  });

  it('exports skipped and moved-away dates as EXDATE', () => {
    const lines = (patch: Partial<CalendarEvent>) =>
      calendarEventsToIcs([event(patch)], { now: NOW }).split('\r\n').filter((line) => line.startsWith('EXDATE'));
    expect(lines({ recurrence: 'daily', excludedDates: ['2026-10-07'] })).toEqual(['EXDATE:20261007T190000']);
    expect(lines({ recurrence: 'weekly', allDay: true, startTime: undefined, excludedDates: ['2026-10-12'] }))
      .toEqual(['EXDATE;VALUE=DATE:20261012']);
    expect(lines({ recurrence: 'none', excludedDates: ['2026-10-07'] })).toEqual([]);
  });

  it('turns reminders into alarms that fire when the app would', () => {
    const trigger = (patch: Partial<CalendarEvent>) =>
      calendarEventsToIcs([event(patch)], { now: NOW }).split('\r\n').find((line) => line.startsWith('TRIGGER'));
    expect(trigger({ reminder: '15m' })).toBe('TRIGGER:-PT15M');
    expect(trigger({ reminder: 'at' })).toBe('TRIGGER:PT0S');
    expect(trigger({ reminder: '1d' })).toBe('TRIGGER:-P1D');
    // All-day reminders are anchored at 09:00 on the day.
    expect(trigger({ reminder: 'at', allDay: true, startTime: undefined })).toBe('TRIGGER:PT9H');
    expect(trigger({ reminder: '1d', allDay: true, startTime: undefined })).toBe('TRIGGER:-PT15H');
    expect(trigger({ reminder: 'none' })).toBeUndefined();
  });

  it('escapes text and folds long lines without splitting a character', () => {
    const title = '漢字テスト; 第1課, 復習\n'.repeat(6);
    const ics = calendarEventsToIcs([event({ title, description: 'a\\b' })], { now: NOW });
    expect(ics).toContain('SUMMARY:漢字テスト\\; 第1課\\, 復習\\n');
    expect(ics).toContain('DESCRIPTION:a\\\\b');
    const encoder = new TextEncoder();
    for (const line of ics.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding restores the original line exactly.
    const unfolded = ics.replace(/\r\n /g, '');
    expect(unfolded).toContain(`SUMMARY:${title.replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')}`);
  });
});
