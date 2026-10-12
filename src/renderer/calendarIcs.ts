/**
 * Calendar → iCalendar (RFC 5545), so a study plan can leave the app: Google Calendar,
 * Outlook, Apple Calendar and Thunderbird all import a `.ics` file.
 *
 * Every rule here mirrors how `calendar.ts` itself reads an event, so the exported
 * calendar shows the same occurrences the app does:
 *
 *   · Times are FLOATING (no `Z`, no `TZID`): an event at 19:00 is 19:00 wherever the
 *     importing calendar is, exactly as the app keeps wall-clock times in local day keys.
 *   · All-day events are `VALUE=DATE` with an exclusive next-day end.
 *   · Repeats map 1:1 — daily / weekly / every N days / monthly — with `UNTIL` taken
 *     from "Repeat until". The app clamps a monthly event on the 29th–31st to the last
 *     day of a shorter month; `BYMONTHDAY=28..d;BYSETPOS=-1` says exactly that.
 *   · A reminder becomes a `VALARM`. An all-day event's reminder is anchored at 09:00 on
 *     its day (`ALL_DAY_REMINDER_HOUR`), so its trigger is measured from that hour.
 */
import {
  ALL_DAY_REMINDER_HOUR,
  REMINDER_MINUTES,
  shiftDateKey,
  type CalendarEvent,
} from './calendar';

const CRLF = '\r\n';

/** `<event id>@gum-study-calendar`: how an event made here is named in a `.ics` file. */
export const GUM_UID_SUFFIX = '@gum-study-calendar';

/** RFC 5545 §3.3.11 TEXT escaping. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: lines longer than 75 octets are folded with CRLF + one space. Folds on
 * code-point boundaries, never inside a UTF-8 sequence — a Japanese title must survive.
 */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  // The first line may hold 75 octets; each continuation holds 74 after its leading space.
  let limit = 75;
  for (const ch of line) {
    const size = encoder.encode(ch).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74;
    }
    current += ch;
    bytes += size;
  }
  parts.push(current);
  return parts.join(`${CRLF} `);
}

function compactDate(key: string): string {
  return key.replace(/-/g, '');
}

function compactTime(hhmm: string): string {
  return `${hhmm.replace(':', '')}00`;
}

function utcStamp(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

/** A signed RFC 5545 duration in minutes: `-PT15M`, `PT9H`, `-P1D`. */
function durationFromMinutes(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  let rest = Math.abs(Math.round(minutes));
  if (rest === 0) return 'PT0S';
  const days = Math.floor(rest / 1440);
  rest -= days * 1440;
  const hours = Math.floor(rest / 60);
  const mins = rest - hours * 60;
  const time = `${hours ? `${hours}H` : ''}${mins ? `${mins}M` : ''}`;
  return `${sign}P${days ? `${days}D` : ''}${time ? `T${time}` : ''}`;
}

function recurrenceRule(event: CalendarEvent): string | null {
  if (event.recurrence === 'none') return null;
  const parts: string[] = [];
  if (event.recurrence === 'daily') parts.push('FREQ=DAILY');
  else if (event.recurrence === 'weekly') parts.push('FREQ=WEEKLY');
  else if (event.recurrence === 'custom') {
    const interval = Number.isFinite(event.recurrenceInterval) ? Math.max(1, Math.trunc(event.recurrenceInterval ?? 1)) : 1;
    parts.push('FREQ=DAILY', ...(interval > 1 ? [`INTERVAL=${interval}`] : []));
  } else if (event.recurrence === 'monthly') {
    parts.push('FREQ=MONTHLY');
    const day = Number(event.date.slice(8, 10));
    if (day > 28) {
      const days = Array.from({ length: day - 27 }, (_, i) => 28 + i).join(',');
      parts.push(`BYMONTHDAY=${days}`, 'BYSETPOS=-1');
    }
  } else {
    return null;
  }
  if (event.recurrenceEndDate) {
    // UNTIL must match DTSTART's value type: a date for all-day, a floating date-time otherwise.
    parts.push(
      event.allDay || !event.startTime
        ? `UNTIL=${compactDate(event.recurrenceEndDate)}`
        : `UNTIL=${compactDate(event.recurrenceEndDate)}T235959`,
    );
  }
  return `RRULE:${parts.join(';')}`;
}

function alarmLines(event: CalendarEvent): string[] {
  if (!event.reminder || event.reminder === 'none' || !(event.reminder in REMINDER_MINUTES)) return [];
  const before = REMINDER_MINUTES[event.reminder];
  const allDay = event.allDay || !event.startTime;
  // Measured from DTSTART: midnight for an all-day event, so add the app's 09:00 anchor.
  const offset = (allDay ? ALL_DAY_REMINDER_HOUR * 60 : 0) - before;
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${escapeText(event.title)}`,
    `TRIGGER:${durationFromMinutes(offset)}`,
    'END:VALARM',
  ];
}

function eventLines(event: CalendarEvent, stamp: string): string[] {
  const allDay = event.allDay || !event.startTime;
  const lines = [
    'BEGIN:VEVENT',
    // An imported event keeps the UID it came with, so the other calendar recognises it.
    `UID:${escapeText(event.icsUid ?? `${event.id}${GUM_UID_SUFFIX}`)}`,
    `DTSTAMP:${stamp}`,
    `CREATED:${utcStamp(Number.isFinite(event.createdAt) ? event.createdAt : Date.now())}`,
  ];
  if (allDay) {
    lines.push(
      `DTSTART;VALUE=DATE:${compactDate(event.date)}`,
      `DTEND;VALUE=DATE:${compactDate(shiftDateKey(event.date, 1))}`,
    );
  } else {
    const start = event.startTime as string;
    lines.push(`DTSTART:${compactDate(event.date)}T${compactTime(start)}`);
    if (event.endTime && event.endTime > start) {
      lines.push(`DTEND:${compactDate(event.date)}T${compactTime(event.endTime)}`);
    }
  }
  lines.push(`SUMMARY:${escapeText(event.title)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  lines.push(`CATEGORIES:${escapeText(event.category.toUpperCase())}`);
  if (/^#[0-9a-f]{6}$/i.test(event.color)) lines.push(`X-APPLE-CALENDAR-COLOR:${event.color}`);
  const rule = recurrenceRule(event);
  if (rule) {
    lines.push(rule);
    // Occurrences removed or moved on their own (a moved one is exported as its own event).
    for (const key of event.excludedDates ?? []) {
      lines.push(allDay ? `EXDATE;VALUE=DATE:${compactDate(key)}` : `EXDATE:${compactDate(key)}T${compactTime(event.startTime as string)}`);
    }
  }
  lines.push(...alarmLines(event), 'END:VEVENT');
  return lines;
}

/** The whole calendar as one `.ics` document (CRLF line endings, folded, UTF-8). */
export function calendarEventsToIcs(
  events: readonly CalendarEvent[],
  options: { calendarName?: string; now?: number } = {},
): string {
  const stamp = utcStamp(options.now ?? Date.now());
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Gum//Study Calendar//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    ...(options.calendarName ? [`X-WR-CALNAME:${escapeText(options.calendarName)}`] : []),
    ...events.flatMap((event) => eventLines(event, stamp)),
    'END:VCALENDAR',
  ];
  return `${lines.map(foldLine).join(CRLF)}${CRLF}`;
}

/** Save the calendar as a `.ics` file through the renderer's download path. */
export function exportCalendarIcsFile(events: readonly CalendarEvent[], calendarName: string, now = new Date()): void {
  const text = calendarEventsToIcs(events, { calendarName, now: now.getTime() });
  const blob = new Blob([text], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  a.download = `gum-calendar-${day}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
