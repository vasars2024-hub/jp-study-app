// @vitest-environment jsdom
/**
 * Scorecard bug 8: imported weekly BYDAY rules landed on the wrong weekdays across time zones.
 *
 * `readRule` used to count BYDAY offsets from the start date AFTER it had been converted to
 * local time, so a Tue/Thu 09:00 Tokyo class imported in New York came out on Tue/Thu at
 * 20:00 — a day late every week; it is Mon/Wed there. The old test only checked `startTime`.
 *
 * Every case here pins the computer's zone (`process.env.TZ`) and checks the WEEKDAYS and the
 * expanded DATES, not just the time: a Tokyo, a Los Angeles and a UTC rule, each read from
 * another zone, and series that cross a daylight-saving change.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { expandOccurrences, parseDateKey, type CalendarEvent } from '../calendar';
import { parseIcsCalendar } from '../calendarIcsImport';

const ORIGINAL_TZ = process.env.TZ;

function inZone<T>(tz: string, run: () => T): T {
  process.env.TZ = tz;
  return run();
}

afterEach(() => {
  if (ORIGINAL_TZ === undefined) delete process.env.TZ;
  else process.env.TZ = ORIGINAL_TZ;
});

function ics(...lines: string[]): string {
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:t@example.com', 'SUMMARY:Class', ...lines, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
}

function only(text: string) {
  const parsed = parseIcsCalendar(text);
  expect(parsed.events).toHaveLength(1);
  return parsed.events[0];
}

/** The local dates of a series between two days. */
function dates(event: Omit<CalendarEvent, 'id' | 'createdAt'>, from: string, to: string): string[] {
  return expandOccurrences([{ ...event, id: 'x', createdAt: 0 }], parseDateKey(from), parseDateKey(to)).map((o) => o.occurrenceDate);
}

const weekday = (key: string) => parseDateKey(key).getDay();

describe('BYDAY is counted in the event’s own zone, then moved to local days', () => {
  it('TZID=Asia/Tokyo Tue/Thu 09:00, read in New York: Mon/Wed 20:00', () => {
    inZone('America/New_York', () => {
      const entry = only(ics(
        'DTSTART;TZID=Asia/Tokyo:20261013T090000',
        'DTEND;TZID=Asia/Tokyo:20261013T103000',
        'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=6',
      ));
      expect(entry.event).toMatchObject({
        date: '2026-10-12',
        startTime: '20:00',
        endTime: '21:30',
        recurrence: 'weekly',
        recurrenceWeekdays: [1, 3],
      });
      // Six classes: Tokyo Tue 13, Thu 15, Tue 20, Thu 22, Tue 27, Thu 29 → New York the evening before.
      expect(dates(entry.event, '2026-10-01', '2026-12-31')).toEqual([
        '2026-10-12', '2026-10-14', '2026-10-19', '2026-10-21', '2026-10-26', '2026-10-28',
      ]);
      expect(dates(entry.event, '2026-10-01', '2026-12-31').map(weekday)).toEqual([1, 3, 1, 3, 1, 3]);
      // The six end before New York's clocks change (Nov 1): nothing drifts, nothing is said.
      expect(entry.warnings).toEqual([]);
    });
  });

  it('the same class without an end drifts after New York leaves DST, and says so', () => {
    inZone('America/New_York', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261013T090000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH'));
      expect(entry.event).toMatchObject({ date: '2026-10-12', startTime: '20:00', recurrenceWeekdays: [1, 3] });
      expect(entry.warnings).toEqual(['timezone-shift']);
    });
  });

  it('the same file read in Tokyo stays Tue/Thu 09:00, with nothing to warn about', () => {
    inZone('Asia/Tokyo', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261013T090000', 'RRULE:FREQ=WEEKLY;BYDAY=TU,TH'));
      expect(entry.event).toMatchObject({ date: '2026-10-13', startTime: '09:00', recurrenceWeekdays: [2, 4] });
      expect(entry.warnings).toEqual([]);
    });
  });

  it('TZID=America/Los_Angeles Mon/Wed/Fri 17:00, read in Tokyo: Tue/Thu/Sat 09:00', () => {
    inZone('Asia/Tokyo', () => {
      const entry = only(ics(
        'DTSTART;TZID=America/Los_Angeles:20261005T170000',
        'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR;UNTIL=20261017T000000Z',
      ));
      expect(entry.event).toMatchObject({ date: '2026-10-06', startTime: '09:00', recurrenceWeekdays: [2, 4, 6] });
      // UNTIL is Oct 17 00:00Z = Fri Oct 16 17:00 in LA, the last class: Sat Oct 17 09:00 here.
      expect(entry.event.recurrenceEndDate).toBe('2026-10-17');
      expect(dates(entry.event, '2026-10-01', '2026-10-31')).toEqual([
        '2026-10-06', '2026-10-08', '2026-10-10', '2026-10-13', '2026-10-15', '2026-10-17',
      ]);
      // Los Angeles leaves daylight saving on Nov 1, but the series ends before then.
      expect(entry.warnings).toEqual([]);
    });
  });

  it('an unbounded Los Angeles series read in Tokyo says it drifts after LA’s clock change', () => {
    inZone('Asia/Tokyo', () => {
      const entry = only(ics('DTSTART;TZID=America/Los_Angeles:20261005T170000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR'));
      expect(entry.warnings).toEqual(['timezone-shift']);
    });
  });

  it('UTC (…Z) Mon/Thu 23:00, read in Tokyo: Tue/Fri 08:00, and in UTC unchanged', () => {
    const text = ics('DTSTART:20261012T230000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261102T230000Z');
    inZone('Asia/Tokyo', () => {
      const entry = only(text);
      expect(entry.event).toMatchObject({ date: '2026-10-13', startTime: '08:00', recurrenceWeekdays: [2, 5] });
      // The last one is Mon Nov 2 23:00Z — Tue Nov 3 here; Thu Nov 5 23:00Z is past UNTIL.
      expect(entry.event.recurrenceEndDate).toBe('2026-11-03');
      expect(dates(entry.event, '2026-10-01', '2026-11-30').slice(-2)).toEqual(['2026-10-30', '2026-11-03']);
      // Neither UTC nor Tokyo changes its clocks.
      expect(entry.warnings).toEqual([]);
    });
    inZone('UTC', () => {
      const entry = only(text);
      expect(entry.event).toMatchObject({ date: '2026-10-12', startTime: '23:00', recurrenceWeekdays: [1, 4] });
      expect(entry.event.recurrenceEndDate).toBe('2026-11-02');
    });
  });

  it('a UTC series read where the clocks change is said to drift', () => {
    inZone('Europe/London', () => {
      const entry = only(ics('DTSTART:20261012T090000Z', 'RRULE:FREQ=WEEKLY;BYDAY=MO'));
      expect(entry.event).toMatchObject({ startTime: '10:00' });
      expect(entry.warnings).toEqual(['timezone-shift']);
    });
  });

  it('every other week on two days keeps the counted weeks in step after the move', () => {
    inZone('America/New_York', () => {
      // Tokyo: Tue/Thu every 2 weeks from Tue Oct 13, weeks counted from Monday (WKST=MO).
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261013T090000', 'RRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=TU,TH'));
      expect(entry.event).toMatchObject({ date: '2026-10-12', recurrenceWeekdays: [1, 3], recurrenceInterval: 2, recurrenceWeekStart: 0 });
      expect(dates(entry.event, '2026-10-01', '2026-11-15')).toEqual([
        '2026-10-12', '2026-10-14', '2026-10-26', '2026-10-28', '2026-11-09', '2026-11-11',
      ]);
    });
  });
});

describe('daylight-saving transitions', () => {
  it('a Los Angeles series starting on the day DST begins, read in Los Angeles', () => {
    inZone('America/Los_Angeles', () => {
      const entry = only(ics('DTSTART;TZID=America/Los_Angeles:20260308T093000', 'RRULE:FREQ=WEEKLY;BYDAY=SU,WE'));
      expect(entry.event).toMatchObject({ date: '2026-03-08', startTime: '09:30', recurrenceWeekdays: [0, 3] });
      expect(dates(entry.event, '2026-03-01', '2026-03-20')).toEqual(['2026-03-08', '2026-03-11', '2026-03-15', '2026-03-18']);
      // Same zone, same clock changes: no drift.
      expect(entry.warnings).toEqual([]);
    });
  });

  it('a wall-clock time the DST jump skips (02:30 on Mar 8) lands at the next real minute', () => {
    inZone('America/Los_Angeles', () => {
      const entry = only(ics('DTSTART;TZID=America/Los_Angeles:20260308T023000', 'RRULE:FREQ=WEEKLY;BYDAY=SU'));
      expect(entry.event).toMatchObject({ date: '2026-03-08', startTime: '03:30', recurrence: 'weekly' });
      // One weekday, the start's own: stored as plain weekly.
      expect(entry.event.recurrenceWeekdays).toBeUndefined();
    });
  });

  it('New York read in Los Angeles changes clocks on the same dates: no drift; London does not', () => {
    const text = ics('DTSTART;TZID=America/New_York:20260302T100000', 'RRULE:FREQ=WEEKLY;BYDAY=MO,TH');
    inZone('America/Los_Angeles', () => {
      const entry = only(text);
      expect(entry.event).toMatchObject({ date: '2026-03-02', startTime: '07:00', recurrenceWeekdays: [1, 4] });
      expect(entry.warnings).toEqual([]);
    });
    inZone('Europe/London', () => {
      // US clocks change Mar 8, UK clocks Mar 29: 15:00 for three weeks, 14:00 after.
      const entry = only(text);
      expect(entry.event).toMatchObject({ startTime: '15:00', recurrenceWeekdays: [1, 4] });
      expect(entry.warnings).toEqual(['timezone-shift']);
    });
  });

  it('a series crossing the night between zones on a DST weekend keeps its weekdays', () => {
    inZone('Asia/Tokyo', () => {
      // Sat 20:00 in LA on the weekend LA leaves DST (Nov 1): Sun 12:00 in Tokyo, then Sun 13:00.
      const entry = only(ics('DTSTART;TZID=America/Los_Angeles:20261024T200000', 'RRULE:FREQ=WEEKLY;BYDAY=SA;COUNT=3'));
      expect(entry.event).toMatchObject({ date: '2026-10-25', startTime: '12:00', recurrence: 'weekly' });
      expect(dates(entry.event, '2026-10-01', '2026-12-31')).toEqual(['2026-10-25', '2026-11-01', '2026-11-08']);
      expect(entry.warnings).toEqual(['timezone-shift']);
    });
  });
});

describe('monthly and yearly rules across zones', () => {
  it('a month day that stays inside the month moves with the date', () => {
    inZone('America/New_York', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261015T090000', 'RRULE:FREQ=MONTHLY'));
      expect(entry.event).toMatchObject({ date: '2026-10-14', startTime: '20:00', recurrence: 'monthly' });
      expect(dates(entry.event, '2026-10-01', '2027-01-31')).toEqual(['2026-10-14', '2026-11-14', '2026-12-14', '2027-01-14']);
    });
  });

  it('the 1st in Tokyo is the last day of the month before in New York: imported once, and said', () => {
    inZone('America/New_York', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261101T090000', 'RRULE:FREQ=MONTHLY'));
      expect(entry.event).toMatchObject({ date: '2026-10-31', recurrence: 'none' });
      expect(entry.warnings).toContain('repeat-zone');
    });
  });

  it('the 2nd Tuesday in Tokyo is not an Nth weekday in New York: imported once, and said', () => {
    inZone('America/New_York', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261013T090000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'));
      expect(entry.event).toMatchObject({ recurrence: 'none' });
      expect(entry.warnings).toContain('repeat-zone');
    });
    inZone('Asia/Tokyo', () => {
      const entry = only(ics('DTSTART;TZID=Asia/Tokyo:20261013T090000', 'RRULE:FREQ=MONTHLY;BYDAY=2TU'));
      expect(entry.event).toMatchObject({ recurrence: 'monthly', recurrenceNth: 2, date: '2026-10-13' });
    });
  });
});
