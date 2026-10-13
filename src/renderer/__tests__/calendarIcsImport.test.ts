// @vitest-environment jsdom
/**
 * .ics import: everything the exporter writes comes back as the same events (round trip),
 * other calendars' files are read into the calendar's model with every approximation said,
 * and a second import of the same file adds nothing (dedupe by UID).
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { importCalendarEvents, loadEvents, type CalendarEvent } from '../calendar';
import { calendarEventsToIcs } from '../calendarIcs';
import { icsImportEvents, parseIcsCalendar, planIcsImport } from '../calendarIcsImport';

const base = { color: '#6c7bff', category: 'study' as const, reminder: 'none' as const, recurrence: 'none' as const, createdAt: Date.UTC(2026, 8, 1) };

const EVENTS: CalendarEvent[] = [
  { ...base, id: 'ev-a', title: 'Kanji; review, part 2', description: 'Line one\nLine two', date: '2026-10-12', startTime: '19:00', endTime: '19:30', reminder: '15m' },
  { ...base, id: 'ev-b', title: '模試', date: '2026-10-20', allDay: true, category: 'exam', color: '#ff2e4d', reminder: '1d' },
  { ...base, id: 'ev-c', title: 'Daily reading', date: '2026-10-05', startTime: '07:00', recurrence: 'daily', recurrenceEndDate: '2026-10-31', excludedDates: ['2026-10-07', '2026-10-10'] },
  { ...base, id: 'ev-d', title: 'Weekly class', date: '2026-10-06', startTime: '18:00', endTime: '19:30', recurrence: 'weekly', reminder: 'at' },
  { ...base, id: 'ev-e', title: 'Every 3 days', date: '2026-10-01', allDay: true, recurrence: 'custom', recurrenceInterval: 3, recurrenceEndDate: '2026-12-01', reminder: 'at' },
  { ...base, id: 'ev-f', title: 'Month end report', date: '2026-01-31', startTime: '09:00', recurrence: 'monthly', category: 'assignment', color: '#ff9f43', reminder: '1h' },
  // The model's newer fields: each has to come back exactly too.
  { ...base, id: 'ev-g', title: 'Tue/Thu, every other week', date: '2026-10-06', startTime: '18:00', endTime: '19:00', recurrence: 'weekly', recurrenceWeekdays: [2, 4], recurrenceInterval: 2, recurrenceWeekStart: 0, reminder: 'custom', reminderMinutes: 10, excludedDates: ['2026-10-20'] },
  { ...base, id: 'ev-h', title: 'Second Tuesday, quarterly', date: '2026-10-13', startTime: '12:00', recurrence: 'monthly', recurrenceNth: 2, recurrenceInterval: 3 },
  { ...base, id: 'ev-i', title: 'Last Friday', date: '2026-10-30', allDay: true, recurrence: 'monthly', recurrenceNth: -1, recurrenceEndDate: '2027-06-30' },
  { ...base, id: 'ev-j', title: 'Imported 31st (skip rule)', date: '2026-01-31', startTime: '08:00', recurrence: 'monthly', recurrenceMonthEnd: 'skip' },
  { ...base, id: 'ev-k', title: 'Leap day (clamp)', date: '2028-02-29', allDay: true, recurrence: 'yearly' },
  { ...base, id: 'ev-l', title: 'Leap day (skip)', date: '2028-02-29', startTime: '10:00', recurrence: 'yearly', recurrenceMonthEnd: 'skip' },
  { ...base, id: 'ev-m', title: 'Fourth Thursday of November', date: '2026-11-26', allDay: true, recurrence: 'yearly', recurrenceNth: 4, reminder: 'custom', reminderMinutes: 2880 },
  { ...base, id: 'ev-n', title: 'Winter intensive', date: '2026-12-28', endDate: '2027-01-02', allDay: true, reminder: '1d' },
  { ...base, id: 'ev-o', title: 'Night shift study', date: '2026-10-30', endDate: '2026-10-31', startTime: '22:00', endTime: '02:00', reminder: 'custom', reminderMinutes: 90 },
  { ...base, id: 'ev-p', title: 'Weekend retreat', date: '2026-10-10', endDate: '2026-10-11', allDay: true, recurrence: 'weekly', recurrenceInterval: 4 },
];

/** The fields an event is made of, minus identity and bookkeeping. */
function shape(e: Partial<CalendarEvent>) {
  return {
    title: e.title,
    description: e.description,
    date: e.date,
    allDay: Boolean(e.allDay),
    startTime: e.allDay ? undefined : e.startTime,
    endTime: e.allDay ? undefined : e.endTime,
    color: e.color,
    category: e.category,
    reminder: e.reminder,
    reminderMinutes: e.reminderMinutes,
    endDate: e.endDate,
    recurrence: e.recurrence,
    recurrenceInterval: e.recurrence === 'daily' || e.recurrence === 'none' ? undefined : e.recurrenceInterval,
    recurrenceWeekdays: e.recurrenceWeekdays,
    recurrenceWeekStart: e.recurrenceWeekStart,
    recurrenceNth: e.recurrenceNth,
    recurrenceMonthEnd: e.recurrenceMonthEnd,
    recurrenceEndDate: e.recurrenceEndDate,
    excludedDates: e.excludedDates?.length ? e.excludedDates : undefined,
  };
}

beforeEach(() => localStorage.clear());

describe('.ics round trip with the exporter', () => {
  it('reads back every event the exporter wrote, unchanged', () => {
    const parsed = parseIcsCalendar(calendarEventsToIcs(EVENTS, { calendarName: 'Gum' }));
    expect(parsed.calendarName).toBe('Gum');
    expect(parsed.cancelled + parsed.invalid).toBe(0);
    expect(parsed.events.map((p) => p.gumId)).toEqual(EVENTS.map((e) => e.id));
    for (const [i, entry] of parsed.events.entries()) {
      // The one note a round trip may carry: an event that keeps iCalendar's skip rule says so.
      expect(entry.warnings, EVENTS[i].title).toEqual(EVENTS[i].recurrenceMonthEnd === 'skip' ? ['month-end-skip'] : []);
      expect(shape(entry.event), EVENTS[i].title).toEqual(shape(EVENTS[i]));
    }
  });

  it('imports into an empty calendar with the same ids, and a second import adds nothing', () => {
    const text = calendarEventsToIcs(EVENTS);
    const first = planIcsImport(parseIcsCalendar(text), loadEvents());
    expect(first.fresh).toHaveLength(EVENTS.length);
    importCalendarEvents(icsImportEvents(first.fresh));
    const stored = loadEvents();
    expect(stored.map((e) => e.id).sort()).toEqual(EVENTS.map((e) => e.id).sort());
    expect(stored.find((e) => e.id === 'ev-a')?.createdAt).toBe(base.createdAt);
    const again = planIcsImport(parseIcsCalendar(text), loadEvents());
    expect(again.fresh).toHaveLength(0);
    expect(again.duplicates).toHaveLength(EVENTS.length);
    // And exporting the imported calendar gives the same document body.
    const strip = (s: string) => s.replace(/DTSTAMP:\S+/g, '');
    expect(strip(calendarEventsToIcs(stored.slice().sort((a, b) => a.id.localeCompare(b.id)))))
      .toBe(strip(calendarEventsToIcs(EVENTS)));
  });
});

const FOREIGN = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'PRODID:-//Google Inc//Google Calendar 70.9054//EN',
  'X-WR-CALNAME:Uni',
  'BEGIN:VTIMEZONE',
  'TZID:Tokyo Standard Time',
  'BEGIN:STANDARD',
  'DTSTART:16010101T000000',
  'TZOFFSETFROM:+0900',
  'TZOFFSETTO:+0900',
  'END:STANDARD',
  'END:VTIMEZONE',
  // UTC
  'BEGIN:VEVENT',
  'UID:utc-1@google.com',
  'DTSTART:20261012T100000Z',
  'DTEND:20261012T110000Z',
  'SUMMARY:Seminar',
  'END:VEVENT',
  // TZID known to Intl, a weekly rule on two weekdays with COUNT, an alarm 10 minutes before
  'BEGIN:VEVENT',
  'UID:class-2@google.com',
  'DTSTART;TZID=Asia/Tokyo:20261013T090000',
  'DTEND;TZID=Asia/Tokyo:20261013T103000',
  'RRULE:FREQ=WEEKLY;BYDAY=TU,TH;COUNT=4',
  'EXDATE;TZID=Asia/Tokyo:20261015T090000',
  'SUMMARY:Japanese class',
  'CATEGORIES:Study',
  'BEGIN:VALARM',
  'ACTION:DISPLAY',
  'TRIGGER:-PT10M',
  'END:VALARM',
  'END:VEVENT',
  // Outlook's Windows zone name: resolved from the file's own VTIMEZONE
  'BEGIN:VEVENT',
  'UID:outlook-3',
  'DTSTART;TZID="Tokyo Standard Time":20261014T120000',
  'DURATION:PT45M',
  'SUMMARY:Lunch\\, with Aki',
  'END:VEVENT',
  // Cancelled
  'BEGIN:VEVENT',
  'UID:gone-4',
  'DTSTART;VALUE=DATE:20261016',
  'STATUS:CANCELLED',
  'SUMMARY:Off',
  'END:VEVENT',
  // A yearly rule on a three-day all-day event: one yearly series over three days
  'BEGIN:VEVENT',
  'UID:bday-5',
  'DTSTART;VALUE=DATE:20261101',
  'DTEND;VALUE=DATE:20261104',
  'RRULE:FREQ=YEARLY',
  'SUMMARY:Trip',
  'END:VEVENT',
  // A series and one moved occurrence of it
  'BEGIN:VEVENT',
  'UID:series-6',
  'DTSTART:20261019T200000',
  'RRULE:FREQ=DAILY;UNTIL=20261023T235959',
  'SUMMARY:Shadowing',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:series-6',
  'RECURRENCE-ID:20261021T200000',
  'DTSTART:20261021T213000',
  'SUMMARY:Shadowing (late)',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('.ics from other calendars', () => {
  const local = (ms: number) => {
    const d = new Date(ms);
    const pad = (n: number) => String(n).padStart(2, '0');
    return { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  };

  it('converts UTC and zoned times to local, keeps a several-weekday rule as one series, keeps skipped dates', () => {
    const parsed = parseIcsCalendar(FOREIGN);
    expect(parsed.calendarName).toBe('Uni');
    expect(parsed.cancelled).toBe(1);
    const byUid = new Map(parsed.events.map((p) => [p.uid, p]));

    const utc = byUid.get('utc-1@google.com')!.event;
    const at = local(Date.UTC(2026, 9, 12, 10, 0));
    expect(utc).toMatchObject({ date: at.date, startTime: at.time, allDay: false, category: 'personal' });

    // Tue/Thu 09:00 in Tokyo: ONE weekly series, on whatever local weekdays those instants
    // fall on here (Mon/Wed evening in New York, Tue/Thu in Tokyo itself).
    const cls = byUid.get('class-2@google.com')!;
    const tokyo9 = local(Date.UTC(2026, 9, 13, 0, 0));
    const localDay = (ms: number) => new Date(ms).getDay();
    expect(cls.event).toMatchObject({ recurrence: 'weekly', date: tokyo9.date, startTime: tokyo9.time, category: 'study' });
    const weekdays = [localDay(Date.UTC(2026, 9, 13)), localDay(Date.UTC(2026, 9, 15))].sort();
    expect(cls.event.recurrenceWeekdays ?? [localDay(Date.UTC(2026, 9, 13))]).toEqual(weekdays);
    // The exact reminder is kept (10 minutes), nothing rounded.
    expect(cls.event).toMatchObject({ reminder: 'custom', reminderMinutes: 10 });
    expect(cls.warnings).not.toContain('reminder-rounded');
    // COUNT=4 across both weekdays: Tue 13, Thu 15, Tue 20, Thu 22 (Tokyo).
    expect(cls.event.recurrenceEndDate).toBe(local(Date.UTC(2026, 9, 22, 0, 0)).date);
    expect(cls.event.excludedDates).toEqual([local(Date.UTC(2026, 9, 15, 0, 0)).date]);

    const lunch = byUid.get('outlook-3')!;
    const noonTokyo = local(Date.UTC(2026, 9, 14, 3, 0));
    expect(lunch.event).toMatchObject({ title: 'Lunch, with Aki', startTime: noonTokyo.time });
    expect(lunch.warnings).not.toContain('timezone-unknown');

    const trip = byUid.get('bday-5')!;
    expect(trip.event).toMatchObject({ allDay: true, recurrence: 'yearly', date: '2026-11-01', endDate: '2026-11-03' });
    expect(trip.warnings).toEqual([]);

    const series = byUid.get('series-6')!;
    expect(series.event).toMatchObject({ recurrence: 'daily', recurrenceEndDate: '2026-10-23', excludedDates: ['2026-10-21'] });
    expect(byUid.get('series-6#2026-10-21')!.event).toMatchObject({ date: '2026-10-21', startTime: '21:30', recurrence: 'none' });
  });

  it('remembers a foreign UID so the same file imports once', () => {
    const plan = planIcsImport(parseIcsCalendar(FOREIGN), loadEvents());
    importCalendarEvents(icsImportEvents(plan.fresh));
    const stored = loadEvents();
    expect(stored.some((e) => e.icsUid === 'utc-1@google.com')).toBe(true);
    // Exported back under the UID it came with.
    expect(calendarEventsToIcs(stored)).toContain('UID:utc-1@google.com');
    expect(planIcsImport(parseIcsCalendar(FOREIGN), loadEvents()).fresh).toHaveLength(0);
  });

  it('counts what it cannot read instead of failing the file', () => {
    const parsed = parseIcsCalendar('BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nSUMMARY:no start\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n');
    expect(parsed.events).toHaveLength(0);
    expect(parsed.invalid).toBe(1);
    expect(parseIcsCalendar('not a calendar').events).toHaveLength(0);
  });
});
