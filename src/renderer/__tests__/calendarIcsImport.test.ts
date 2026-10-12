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
    recurrence: e.recurrence,
    recurrenceInterval: e.recurrence === 'custom' ? e.recurrenceInterval : undefined,
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
      expect(entry.warnings, EVENTS[i].title).toEqual([]);
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
  // A yearly rule: first date only, said
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

  it('converts UTC and zoned times to local, splits multi-day weekly rules, keeps skipped dates', () => {
    const parsed = parseIcsCalendar(FOREIGN);
    expect(parsed.calendarName).toBe('Uni');
    expect(parsed.cancelled).toBe(1);
    const byUid = new Map(parsed.events.map((p) => [p.uid, p]));

    const utc = byUid.get('utc-1@google.com')!.event;
    const at = local(Date.UTC(2026, 9, 12, 10, 0));
    expect(utc).toMatchObject({ date: at.date, startTime: at.time, allDay: false, category: 'personal' });

    const tue = byUid.get('class-2@google.com#TU')!;
    const thu = byUid.get('class-2@google.com#TH')!;
    const tokyo9 = local(Date.UTC(2026, 9, 13, 0, 0));
    expect(tue.event).toMatchObject({ recurrence: 'weekly', startTime: tokyo9.time, category: 'study', reminder: '5m' });
    // Rounded to the nearest choice (10 minutes → 5, the first of the two equally near), and said.
    expect(tue.warnings).toContain('reminder-rounded');
    // COUNT=4 across both weekdays: one end date for both parts.
    expect(tue.event.recurrenceEndDate).toBeTruthy();
    expect(tue.event.recurrenceEndDate).toBe(thu.event.recurrenceEndDate);
    const skipped = local(Date.UTC(2026, 9, 15, 0, 0)).date;
    expect([...(tue.event.excludedDates ?? []), ...(thu.event.excludedDates ?? [])]).toContain(skipped);

    const lunch = byUid.get('outlook-3')!;
    const noonTokyo = local(Date.UTC(2026, 9, 14, 3, 0));
    expect(lunch.event).toMatchObject({ title: 'Lunch, with Aki', startTime: noonTokyo.time });
    expect(lunch.warnings).not.toContain('timezone-unknown');

    const trip = byUid.get('bday-5')!;
    expect(trip.event).toMatchObject({ allDay: true, recurrence: 'none', date: '2026-11-01' });
    expect(trip.warnings).toEqual(expect.arrayContaining(['repeat-unsupported', 'multi-day']));

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
