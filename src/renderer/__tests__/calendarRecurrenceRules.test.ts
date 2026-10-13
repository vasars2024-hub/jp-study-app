// @vitest-environment jsdom
/**
 * The repeat rules the calendar gained for scorecard package 8, by their expanded dates:
 * several weekdays in one weekly series, every N weeks / months / years, the Nth (or last)
 * weekday, yearly, the two month-end rules (Gum's clamp for events made here, iCalendar's
 * skip for imported ones), and events over several days.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  detachOccurrence,
  expandDayOccurrences,
  expandOccurrences,
  getTodayOccurrences,
  getUpcomingOccurrences,
  normalizeEventFields,
  nthOccurrenceDate,
  occurrenceEndsAt,
  parseDateKey,
  rescheduleEventPatch,
  type CalendarEvent,
} from '../calendar';
import { calendarEventsToIcs } from '../calendarIcs';
import { parseIcsCalendar, planIcsImport } from '../calendarIcsImport';
import { LS_KEYS } from '../storage/storage';

function ev(patch: Partial<CalendarEvent>): CalendarEvent {
  return {
    id: 'e',
    title: 'E',
    date: '2026-01-31',
    color: '#6c7bff',
    category: 'study',
    reminder: 'none',
    recurrence: 'none',
    createdAt: 0,
    ...patch,
  };
}

const keys = (event: CalendarEvent, from: string, to: string) =>
  expandOccurrences([event], parseDateKey(from), parseDateKey(to)).map((o) => o.occurrenceDate);

describe('monthly on the 29th–31st: Gum clamps, iCalendar skips', () => {
  it('an event made here takes the last day of a shorter month', () => {
    expect(keys(ev({ recurrence: 'monthly' }), '2026-01-01', '2026-05-31'))
      .toEqual(['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30', '2026-05-31']);
  });

  it('an imported one (skip rule) has no occurrence in a month without the day', () => {
    expect(keys(ev({ recurrence: 'monthly', recurrenceMonthEnd: 'skip' }), '2026-01-01', '2026-07-31'))
      .toEqual(['2026-01-31', '2026-03-31', '2026-05-31', '2026-07-31']);
  });

  it('a plain FREQ=MONTHLY on the 31st imports with the skip rule and says so; the exporter’s clamp does not', () => {
    const plain = parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART;VALUE=DATE:20260131\r\nRRULE:FREQ=MONTHLY\r\nEND:VEVENT\r\nEND:VCALENDAR').events[0];
    expect(plain.event).toMatchObject({ recurrence: 'monthly', recurrenceMonthEnd: 'skip' });
    expect(plain.warnings).toEqual(['month-end-skip']);
    const ours = parseIcsCalendar(calendarEventsToIcs([ev({ id: 'g', allDay: true, recurrence: 'monthly' })])).events[0];
    expect(ours.event.recurrenceMonthEnd).toBeUndefined();
    expect(ours.warnings).toEqual([]);
    // On the 15th the two rules are the same rule, so nothing is stored or said.
    const mid = parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:b\r\nDTSTART;VALUE=DATE:20260115\r\nRRULE:FREQ=MONTHLY\r\nEND:VEVENT\r\nEND:VCALENDAR').events[0];
    expect(mid.event.recurrenceMonthEnd).toBeUndefined();
    expect(mid.warnings).toEqual([]);
  });

  it('every 2 months', () => {
    expect(keys(ev({ date: '2026-01-15', recurrence: 'monthly', recurrenceInterval: 2 }), '2026-01-01', '2026-08-31'))
      .toEqual(['2026-01-15', '2026-03-15', '2026-05-15', '2026-07-15']);
  });
});

describe('the Nth weekday', () => {
  it('the 2nd Tuesday and the last Friday of each month', () => {
    expect(keys(ev({ date: '2026-10-13', recurrence: 'monthly', recurrenceNth: 2 }), '2026-10-01', '2027-01-31'))
      .toEqual(['2026-10-13', '2026-11-10', '2026-12-08', '2027-01-12']);
    expect(keys(ev({ date: '2026-10-30', recurrence: 'monthly', recurrenceNth: -1 }), '2026-10-01', '2027-01-31'))
      .toEqual(['2026-10-30', '2026-11-27', '2026-12-25', '2027-01-29']);
  });

  it('a 5th weekday skips the months without one', () => {
    expect(keys(ev({ date: '2026-10-29', recurrence: 'monthly', recurrenceNth: 5 }), '2026-10-01', '2027-01-31'))
      .toEqual(['2026-10-29', '2026-12-31']);
  });

  it('imports BYDAY=2TU and Outlook’s BYDAY=TU;BYSETPOS=2 the same way, starting on the first match', () => {
    const read = (rule: string) => parseIcsCalendar(`BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:n\r\nDTSTART:20261001T120000\r\nRRULE:${rule}\r\nEND:VEVENT\r\nEND:VCALENDAR`).events[0];
    for (const rule of ['FREQ=MONTHLY;BYDAY=2TU', 'FREQ=MONTHLY;BYDAY=TU;BYSETPOS=2']) {
      const entry = read(rule);
      expect(entry.event, rule).toMatchObject({ date: '2026-10-13', recurrence: 'monthly', recurrenceNth: 2 });
      expect(entry.warnings, rule).toEqual([]);
    }
    expect(read('FREQ=MONTHLY;BYDAY=-1FR').event).toMatchObject({ date: '2026-10-30', recurrenceNth: -1 });
  });
});

describe('yearly', () => {
  it('the same date every year, and every 2 years', () => {
    expect(keys(ev({ date: '2026-11-03', recurrence: 'yearly' }), '2026-01-01', '2029-12-31'))
      .toEqual(['2026-11-03', '2027-11-03', '2028-11-03', '2029-11-03']);
    expect(keys(ev({ date: '2026-11-03', recurrence: 'yearly', recurrenceInterval: 2 }), '2026-01-01', '2030-12-31'))
      .toEqual(['2026-11-03', '2028-11-03', '2030-11-03']);
  });

  it('February 29: Feb 28 in common years (Gum), or leap years only (iCalendar)', () => {
    expect(keys(ev({ date: '2028-02-29', recurrence: 'yearly' }), '2028-01-01', '2032-12-31'))
      .toEqual(['2028-02-29', '2029-02-28', '2030-02-28', '2031-02-28', '2032-02-29']);
    expect(keys(ev({ date: '2028-02-29', recurrence: 'yearly', recurrenceMonthEnd: 'skip' }), '2028-01-01', '2032-12-31'))
      .toEqual(['2028-02-29', '2032-02-29']);
  });

  it('the 4th Thursday of November', () => {
    expect(keys(ev({ date: '2026-11-26', recurrence: 'yearly', recurrenceNth: 4 }), '2026-01-01', '2028-12-31'))
      .toEqual(['2026-11-26', '2027-11-25', '2028-11-23']);
  });

  it('a yearly rule imports as yearly, not as its first date', () => {
    const entry = parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:y\r\nDTSTART;VALUE=DATE:20261103\r\nRRULE:FREQ=YEARLY;COUNT=3\r\nEND:VEVENT\r\nEND:VCALENDAR').events[0];
    expect(entry.event).toMatchObject({ recurrence: 'yearly', date: '2026-11-03', recurrenceEndDate: '2028-11-03' });
    expect(entry.warnings).toEqual([]);
  });
});

describe('weekly on several weekdays', () => {
  it('one series on Tue and Thu', () => {
    expect(keys(ev({ date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [2, 4] }), '2026-10-01', '2026-10-20'))
      .toEqual(['2026-10-06', '2026-10-08', '2026-10-13', '2026-10-15', '2026-10-20']);
  });

  it('every other week, counted from the week the series starts in', () => {
    expect(keys(ev({ date: '2026-10-08', recurrence: 'weekly', recurrenceWeekdays: [2, 4], recurrenceInterval: 2 }), '2026-10-01', '2026-11-01'))
      .toEqual(['2026-10-08', '2026-10-20', '2026-10-22']);
  });

  it('COUNT counts across every listed weekday (and skipped dates still count)', () => {
    const series = ev({ date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [2, 4], excludedDates: ['2026-10-08'] });
    expect(nthOccurrenceDate(series, 1)).toBe('2026-10-06');
    expect(nthOccurrenceDate(series, 4)).toBe('2026-10-15');
  });

  it('a series moved a day turns its weekdays with it', () => {
    expect(rescheduleEventPatch(ev({ date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [2, 4] }), '2026-10-06', '2026-10-07'))
      .toMatchObject({ date: '2026-10-07', recurrenceWeekdays: [3, 5] });
  });

  it('the store keeps no field that says the same as its absence', () => {
    expect(normalizeEventFields(ev({ date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [2], recurrenceInterval: 1, recurrenceWeekStart: 1 })))
      .not.toHaveProperty('recurrenceWeekdays');
    expect(normalizeEventFields(ev({ date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [4] })).recurrenceWeekdays).toEqual([2, 4]);
    expect(normalizeEventFields(ev({ reminder: 'custom', reminderMinutes: 60 }))).toMatchObject({ reminder: '1h' });
  });

  it('planning an import recognises a series earlier versions split into one event per weekday', () => {
    const text = 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:class@x\r\nDTSTART:20261006T180000\r\nRRULE:FREQ=WEEKLY;BYDAY=TU,TH\r\nEND:VEVENT\r\nEND:VCALENDAR';
    const plan = planIcsImport(parseIcsCalendar(text), [ev({ id: 'old', icsUid: 'class@x#TU' }), ev({ id: 'old2', icsUid: 'class@x#TH' })]);
    expect(plan.fresh).toHaveLength(0);
    expect(plan.duplicates).toHaveLength(1);
  });
});

describe('events over several days', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    localStorage.clear();
  });
  afterEach(() => {
    vi.useRealTimers();
    localStorage.clear();
  });

  const trip = ev({ id: 'trip', date: '2026-10-30', endDate: '2026-11-02', allDay: true });

  it('draws on every day it covers, including a range that starts mid-way', () => {
    const days = expandDayOccurrences([trip], parseDateKey('2026-11-01'), parseDateKey('2026-11-07'));
    expect(days.map((o) => [o.spanDay, o.occurrenceDate, o.spanIndex, o.spanDays])).toEqual([
      ['2026-11-01', '2026-10-30', 2, 4],
      ['2026-11-02', '2026-10-30', 3, 4],
    ]);
    // The plain expansion still gives it once, on its first day.
    expect(keys(trip, '2026-10-01', '2026-11-30')).toEqual(['2026-10-30']);
  });

  it('ends on its last day, and is "today" and "upcoming" while it runs', () => {
    const timed = ev({ id: 'night', date: '2026-10-30', endDate: '2026-10-31', startTime: '22:00', endTime: '02:00' });
    const [o] = expandOccurrences([timed], parseDateKey('2026-10-30'), parseDateKey('2026-10-30'));
    expect(occurrenceEndsAt(o)).toBe(new Date(2026, 9, 31, 2, 0).getTime());
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify([trip, timed]));
    vi.setSystemTime(new Date(2026, 9, 31, 1, 0));
    expect(getTodayOccurrences().map((x) => x.id).sort()).toEqual(['night', 'trip']);
    expect(getUpcomingOccurrences(10, 0).map((x) => x.id).sort()).toEqual(['night', 'trip']);
    vi.setSystemTime(new Date(2026, 10, 2, 12, 0));
    expect(getUpcomingOccurrences(10, 0).map((x) => x.id)).toEqual(['trip']);
    vi.setSystemTime(new Date(2026, 10, 3, 0, 1));
    expect(getUpcomingOccurrences(10, 0)).toEqual([]);
  });

  it('a repeating one keeps its length when one date is split off', () => {
    const weekend = ev({ id: 'w', date: '2026-10-10', endDate: '2026-10-11', allDay: true, recurrence: 'weekly', recurrenceWeekdays: [6] });
    const split = detachOccurrence(weekend, '2026-10-17', '2026-10-24');
    expect(split?.single).toMatchObject({ date: '2026-10-24', endDate: '2026-10-25', recurrence: 'none' });
    expect(split?.single).not.toHaveProperty('recurrenceWeekdays');
  });

  it('a timed event past midnight imports as one event over two days, not cut at 23:59', () => {
    const entry = parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:m\r\nDTSTART:20261030T220000\r\nDTEND:20261031T020000\r\nEND:VEVENT\r\nEND:VCALENDAR').events[0];
    expect(entry.event).toMatchObject({ date: '2026-10-30', endDate: '2026-10-31', startTime: '22:00', endTime: '02:00' });
    expect(entry.warnings).toEqual([]);
  });
});

describe('reminders kept exactly on import', () => {
  const alarm = (trigger: string) => parseIcsCalendar(
    `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:r\r\nDTSTART:20261030T100000\r\nBEGIN:VALARM\r\nTRIGGER:${trigger}\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR`,
  ).events[0];

  it('a picker choice when one matches, otherwise the exact minutes', () => {
    expect(alarm('-PT15M').event).toMatchObject({ reminder: '15m' });
    expect(alarm('-PT10M').event).toMatchObject({ reminder: 'custom', reminderMinutes: 10 });
    expect(alarm('-PT2H').event).toMatchObject({ reminder: 'custom', reminderMinutes: 120 });
    expect(alarm('-P1W').event).toMatchObject({ reminder: 'custom', reminderMinutes: 10080 });
    expect(alarm('-PT10M').warnings).toEqual([]);
  });

  it('only a reminder after the start is moved (to the start), and said', () => {
    const late = alarm('PT5M');
    expect(late.event).toMatchObject({ reminder: 'at' });
    expect(late.warnings).toEqual(['reminder-rounded']);
  });
});
