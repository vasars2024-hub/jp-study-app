/**
 * iCalendar (RFC 5545) → Calendar: the other half of `calendarIcs.ts`.
 *
 * Reads what Google Calendar, Outlook, Apple Calendar and Thunderbird write, and everything
 * the exporter writes, into the calendar's own model — which is smaller than iCalendar's,
 * so every place the two differ is decided here and SAID (a warning code per event), never
 * silently approximated:
 *
 *   · Times: floating stays wall-clock; `…Z` (UTC) and `TZID=` are converted to this
 *     computer's local time. A TZID the runtime does not know (Outlook's Windows names)
 *     falls back to the file's own VTIMEZONE standard offset, else floating.
 *   · All-day: `VALUE=DATE`; a longer one (or a timed one past midnight) becomes a
 *     multi-day event (`endDate`).
 *   · Repeats are read in the event's OWN zone and then moved to local days, so a weekday
 *     rule lands on the right local weekdays across time zones: DAILY / every N days,
 *     WEEKLY on one or several weekdays (one series) every N weeks, MONTHLY / YEARLY on the
 *     start's day or on its Nth weekday ("the 2nd Tuesday", "the last Friday"), with UNTIL
 *     or COUNT. A plain monthly rule on the 29th–31st follows iCalendar's skip rule
 *     (`month-end-skip`); the exporter's `BYMONTHDAY=28..31;BYSETPOS=-1` is Gum's clamp.
 *     Anything else is imported as its first date only (`repeat-unsupported`, or
 *     `repeat-zone` when only the time-zone move makes it inexpressible). A series from
 *     another zone whose local hour changes with daylight saving says so (`timezone-shift`).
 *   · EXDATE → skipped dates; a RECURRENCE-ID override skips its date in the series and is
 *     imported as its own event, which is how the calendar models a moved occurrence.
 *   · VALARM → the reminder, exactly (a picker choice, else a custom lead time); only one
 *     after the start or over four weeks ahead is moved (`reminder-rounded`).
 *
 * Nothing here writes: `parseIcsCalendar` reads, `planIcsImport` sorts into new and
 * already-present (by UID), and `icsImportEvents` turns the new ones into events for
 * `importCalendarEvents`.
 */
import {
  ALL_DAY_REMINDER_HOUR,
  CATEGORY_COLORS,
  isCalendarDateKey,
  normalizeEventFields,
  nthOccurrenceDate,
  REMINDER_CUSTOM_MAX_MINUTES,
  reminderForMinutes,
  shiftDateKey,
  toDateKey,
  daysBetweenKeys,
  parseDateKey,
  type CalendarEvent,
  type EventCategory,
} from './calendar';
import { GUM_UID_SUFFIX } from './calendarIcs';

export type IcsWarningCode =
  | 'repeat-unsupported'
  /** The rule is fine where it was written, but moved to this time zone it is not one the calendar can repeat. */
  | 'repeat-zone'
  | 'timezone-unknown'
  /** A series from another zone: its local hour moves when only one of the zones changes clocks. */
  | 'timezone-shift'
  /** Monthly on the 29th–31st (or yearly on Feb 29) from another calendar: skips months without that day. */
  | 'month-end-skip'
  | 'reminder-rounded';

export interface ParsedIcsEvent {
  /** The UID this event is recognised by on a later import (a split part gets a suffix). */
  uid: string;
  /** The Gum event id the UID names (`<id>@gum-study-calendar`), when it is one. */
  gumId?: string;
  createdAt?: number;
  event: Omit<CalendarEvent, 'id' | 'createdAt'>;
  warnings: IcsWarningCode[];
}

export interface IcsParseResult {
  events: ParsedIcsEvent[];
  /** VEVENTs left out on purpose: cancelled, or without a usable start. */
  cancelled: number;
  invalid: number;
  calendarName?: string;
}

interface Prop {
  name: string;
  params: Record<string, string>;
  value: string;
}

interface Component {
  type: string;
  props: Prop[];
  children: Component[];
}

/** The largest file the importer reads (a decade of a busy calendar is well under this). */
export const ICS_IMPORT_MAX_BYTES = 5 * 1024 * 1024;
const MAX_EVENTS = 5000;

/* ------------------------------------------------------------------ *
 * Lexing
 * ------------------------------------------------------------------ */

/** RFC 5545 §3.1: a CRLF followed by a space or tab continues the previous line. */
function unfold(text: string): string[] {
  return text.replace(/^\uFEFF/, '').replace(/\r\n[ \t]|\n[ \t]|\r[ \t]/g, '').split(/\r\n|\n|\r/);
}

/** `NAME;P1=a;P2="b:c":value` — a quoted parameter may hold `:` and `;`. */
function parseLine(line: string): Prop | null {
  let i = 0;
  let name = '';
  while (i < line.length && line[i] !== ';' && line[i] !== ':') name += line[i++];
  if (!name || i >= line.length) return null;
  const params: Record<string, string> = {};
  while (line[i] === ';') {
    i++;
    let key = '';
    while (i < line.length && line[i] !== '=' && line[i] !== ';' && line[i] !== ':') key += line[i++];
    let value = '';
    if (line[i] === '=') {
      i++;
      // A parameter may list several values; the importer only ever needs the first.
      while (i < line.length && line[i] !== ';' && line[i] !== ':') {
        if (line[i] === '"') {
          i++;
          while (i < line.length && line[i] !== '"') value += line[i++];
          i++;
        } else {
          value += line[i++];
        }
      }
    }
    if (key) params[key.toUpperCase()] = value;
  }
  if (line[i] !== ':') return null;
  return { name: name.toUpperCase(), params, value: line.slice(i + 1) };
}

function parseComponents(text: string): Component {
  const root: Component = { type: 'ROOT', props: [], children: [] };
  const stack: Component[] = [root];
  for (const raw of unfold(text)) {
    if (!raw.trim()) continue;
    const prop = parseLine(raw);
    if (!prop) continue;
    const top = stack[stack.length - 1];
    if (prop.name === 'BEGIN') {
      const child: Component = { type: prop.value.trim().toUpperCase(), props: [], children: [] };
      top.children.push(child);
      stack.push(child);
    } else if (prop.name === 'END') {
      if (stack.length > 1 && top.type === prop.value.trim().toUpperCase()) stack.pop();
    } else {
      top.props.push(prop);
    }
  }
  return root;
}

/** RFC 5545 §3.3.11 TEXT unescaping. */
function unescapeText(value: string): string {
  return value.replace(/\\([\\;,nN])/g, (_m, ch: string) => (ch === 'n' || ch === 'N' ? '\n' : ch));
}

const first = (c: Component, name: string): Prop | undefined => c.props.find((p) => p.name === name);
const all = (c: Component, name: string): Prop[] => c.props.filter((p) => p.name === name);

/* ------------------------------------------------------------------ *
 * Date-times
 * ------------------------------------------------------------------ */

/** How a DATE-TIME was written, which decides which calendar its repeat rule counts in. */
type StampKind = 'date' | 'floating' | 'utc' | 'zoned';

interface LocalStamp {
  date: string;
  /** `HH:MM`, absent for a DATE value. */
  time?: string;
  /** Epoch ms of the instant (local midnight for a DATE). */
  ms: number;
  /** Set when a TZID could not be resolved and the time was read as floating. */
  unknownZone?: boolean;
  kind: StampKind;
  /**
   * The date as written, in the value's OWN zone (the TZID's, or UTC for `…Z`). A repeat
   * rule's weekdays and month days are counted on this date, not on the local one: a
   * Tuesday 09:00 class in Tokyo is a Monday evening in New York.
   */
  wallDate: string;
  /** Minutes east of UTC of the value's own zone at an instant; absent for floating and DATE. */
  zoneOffsetAt?: (ms: number) => number;
}

/** Fixed offsets (minutes east of UTC) the file's own VTIMEZONEs declare, by TZID. */
type ZoneTable = Map<string, number>;

function readZoneTable(root: Component): ZoneTable {
  const table: ZoneTable = new Map();
  const visit = (c: Component): void => {
    for (const child of c.children) {
      if (child.type === 'VTIMEZONE') {
        const tzid = first(child, 'TZID')?.value.trim();
        const standard = child.children.find((x) => x.type === 'STANDARD') ?? child.children[0];
        const offset = standard ? first(standard, 'TZOFFSETTO')?.value.trim() : undefined;
        const m = offset ? /^([+-])(\d{2})(\d{2})/.exec(offset) : null;
        if (tzid && m) table.set(tzid, (m[1] === '-' ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])));
      }
      visit(child);
    }
  };
  visit(root);
  return table;
}

const zoneFormats = new Map<string, Intl.DateTimeFormat | null>();

/** A formatter that reads an instant's wall clock in `timeZone`, or null for a zone Intl does not know. */
function zoneFormat(timeZone: string): Intl.DateTimeFormat | null {
  if (zoneFormats.has(timeZone)) return zoneFormats.get(timeZone) ?? null;
  let format: Intl.DateTimeFormat | null;
  try {
    format = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    format = null;
  }
  zoneFormats.set(timeZone, format);
  return format;
}

/** Minutes east of UTC that `format`'s zone is at `ms`. */
function offsetIn(format: Intl.DateTimeFormat, ms: number): number {
  const parts: Record<string, number> = {};
  for (const part of format.formatToParts(new Date(ms))) parts[part.type] = Number(part.value);
  const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
  return Math.round((asUtc - Math.floor(ms / 1000) * 1000) / 60_000);
}

/** The UTC instant of a wall-clock time in an IANA zone, or null when the zone is unknown. */
function zonedToUtc(fields: [number, number, number, number, number, number], format: Intl.DateTimeFormat): number {
  const [y, mo, d, h, mi, s] = fields;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = wall;
  // Two refinements settle every DST edge: the offset at the guess, then at the answer.
  for (let pass = 0; pass < 3; pass++) {
    const next = wall - offsetIn(format, guess) * 60_000;
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function fromInstant(ms: number): Pick<LocalStamp, 'date' | 'time' | 'ms'> {
  const d = new Date(ms);
  return { date: toDateKey(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, ms };
}

/** One DATE or DATE-TIME value (no list), converted to local wall-clock time. */
function parseStamp(value: string, params: Record<string, string>, zones: ZoneTable): LocalStamp | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || params.VALUE === 'DATE') {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    const key = `${m[1]}-${m[2]}-${m[3]}`;
    if (!isCalendarDateKey(key)) return null;
    return { date: key, ms: parseDateKey(key).getTime(), kind: 'date', wallDate: key };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const fields: [number, number, number, number, number, number] = [
    Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  ];
  const wallDate = `${m[1]}-${m[2]}-${m[3]}`;
  if (!isCalendarDateKey(wallDate) || fields[3] > 23 || fields[4] > 59) return null;
  if (m[7]) {
    return {
      ...fromInstant(Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5])),
      kind: 'utc',
      wallDate,
      zoneOffsetAt: () => 0,
    };
  }
  const tzid = params.TZID?.trim();
  if (tzid) {
    const format = zoneFormat(tzid.replace(/^\//, ''));
    if (format) {
      return { ...fromInstant(zonedToUtc(fields, format)), kind: 'zoned', wallDate, zoneOffsetAt: (ms) => offsetIn(format, ms) };
    }
    const offset = zones.get(tzid);
    if (offset !== undefined) {
      return {
        ...fromInstant(Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]) - offset * 60_000),
        kind: 'zoned',
        wallDate,
        zoneOffsetAt: () => offset,
      };
    }
  }
  // Floating (or a zone nobody could resolve): the wall-clock time as written.
  const local = new Date(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]);
  return { ...fromInstant(local.getTime()), kind: 'floating', wallDate, ...(tzid ? { unknownZone: true } : {}) };
}

/** `[-]P[nW][nD][T[nH][nM][nS]]` in minutes, or null. */
function durationMinutes(value: string): number | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(value.trim());
  if (!m) return null;
  const minutes = Number(m[2] ?? 0) * 10080 + Number(m[3] ?? 0) * 1440 + Number(m[4] ?? 0) * 60 + Number(m[5] ?? 0)
    + Math.round(Number(m[6] ?? 0) / 60);
  return m[1] === '-' ? -minutes : minutes;
}

/* ------------------------------------------------------------------ *
 * Repeats
 * ------------------------------------------------------------------ */

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

type RepeatFields = Pick<
  CalendarEvent,
  'date' | 'recurrence' | 'recurrenceInterval' | 'recurrenceEndDate' | 'recurrenceWeekdays' | 'recurrenceWeekStart' | 'recurrenceNth' | 'recurrenceMonthEnd'
>;

type RuleResult =
  | { ok: true; repeat: RepeatFields }
  /** `zone`: the rule is fine, but in this time zone it falls on days the calendar cannot repeat. */
  | { ok: false; reason: 'unsupported' | 'zone' };

const mod7 = (n: number): number => ((n % 7) + 7) % 7;

/**
 * The calendar's repeat for one RRULE, or why it has none (the caller then imports the
 * first date alone and says so).
 *
 * The rule is read in the event's OWN calendar — its TZID, or UTC for a `…Z` start — and
 * only then moved to this computer's days. Done the other way round, a Tue/Thu 09:00 class
 * in Tokyo imported in New York came out on Tue/Thu at 20:00, a day late each time: the
 * weekdays were counted from a start that was already Monday evening.
 */
function readRule(rule: string, start: LocalStamp, allDay: boolean, dtstartParams: Record<string, string>, zones: ZoneTable): RuleResult {
  const unsupported: RuleResult = { ok: false, reason: 'unsupported' };
  const parts: Record<string, string> = {};
  for (const piece of rule.split(';')) {
    const [k, v] = piece.split('=');
    if (k && v !== undefined) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const freq = parts.FREQ;
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return unsupported;
  const known = new Set(['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'WKST']);
  if (Object.keys(parts).some((key) => !known.has(key))) return unsupported;
  const count = parts.COUNT ? Number(parts.COUNT) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) return unsupported;
  if (parts.WKST && !WEEKDAYS.includes(parts.WKST)) return unsupported;

  // 1. The repeat in the event's own calendar, from the date as written there.
  const wall = parseDateKey(start.wallDate);
  const wallDay = wall.getDate();
  const list = (value: string | undefined): string[] => (value ?? '').split(',').map((d) => d.trim()).filter(Boolean);
  const byDay = list(parts.BYDAY);
  const byMonthDay = list(parts.BYMONTHDAY).map(Number);
  const byMonth = list(parts.BYMONTH).map(Number);
  const setPos = parts.BYSETPOS;
  let own: RepeatFields;

  if (freq === 'DAILY' && !byDay.length) {
    if (byMonthDay.length || setPos || byMonth.length) return unsupported;
    own = { date: start.wallDate, recurrence: interval === 1 ? 'daily' : 'custom', ...(interval > 1 ? { recurrenceInterval: interval } : {}) };
  } else if (freq === 'WEEKLY' || freq === 'DAILY') {
    // DAILY;BYDAY=MO,TU,… is every listed weekday — a weekly series on those days.
    if (byMonthDay.length || setPos || byMonth.length || (freq === 'DAILY' && interval !== 1)) return unsupported;
    // `1MO`-style ordinals belong to monthly rules; a weekly one with them is not ours.
    if (byDay.some((d) => !WEEKDAYS.includes(d))) return unsupported;
    const days = byDay.length ? [...new Set(byDay.map((d) => WEEKDAYS.indexOf(d)))].sort() : [wall.getDay()];
    const counted = freq === 'WEEKLY' && interval > 1
      ? { recurrenceInterval: interval, recurrenceWeekStart: WEEKDAYS.indexOf(parts.WKST || 'MO') }
      : {};
    const rule: RepeatFields = { date: start.wallDate, recurrence: 'weekly', recurrenceWeekdays: days, ...counted };
    // The first date is the rule's first day on or after the written start, in the start's
    // own counted week — so every N weeks stays in step.
    const firstDate = nthOccurrenceDate(asEvent(rule), 1);
    if (!firstDate) return unsupported;
    own = { ...rule, date: firstDate };
  } else if (freq === 'MONTHLY' || freq === 'YEARLY') {
    const recurrence = freq === 'MONTHLY' ? 'monthly' : 'yearly';
    const every = interval > 1 ? { recurrenceInterval: interval } : {};
    // A yearly rule may name its month; only the start's own month is ours.
    if (freq === 'YEARLY' && byMonth.length && (byMonth.length !== 1 || byMonth[0] !== wall.getMonth() + 1)) return unsupported;
    if (freq === 'MONTHLY' && byMonth.length) return unsupported;
    if (byDay.length) {
      // "The 2nd Tuesday": BYDAY=2TU, or Outlook's BYDAY=TU;BYSETPOS=2.
      const ordinal = byDay.length === 1 ? /^([+-]?\d)?(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay[0]) : null;
      if (!ordinal || byMonthDay.length || (ordinal[1] && setPos)) return unsupported;
      if (freq === 'YEARLY' && !byMonth.length) return unsupported;
      const nth = Number(ordinal[1] ?? setPos ?? NaN);
      if (!(nth === -1 || (nth >= 1 && nth <= 5))) return unsupported;
      const weekday = WEEKDAYS.indexOf(ordinal[2]);
      // The first date is the first such weekday on or after the written start.
      let date: string | null = null;
      for (let k = 0; k < 60 && !date; k++) {
        const months = (freq === 'MONTHLY' ? 1 : 12) * interval * k;
        const month = new Date(wall.getFullYear(), wall.getMonth() + months, 1);
        const candidate = nthWeekdayKey(month.getFullYear(), month.getMonth(), weekday, nth);
        if (candidate && candidate >= start.wallDate) date = candidate;
      }
      if (!date) return unsupported;
      own = { date, recurrence, recurrenceNth: nth, ...every };
    } else if (byMonthDay.length) {
      if (freq === 'YEARLY' && !byMonth.length) return unsupported;
      const monthLength = freq === 'MONTHLY' ? 31 : new Date(2000, wall.getMonth() + 1, 0).getDate();
      // The exporter's clamp: "the 31st, or the month's last day" is 28..31 with BYSETPOS=-1.
      const clamp = setPos === '-1' && wallDay > 28 && wallDay <= monthLength
        && byMonthDay.length === wallDay - 27 && byMonthDay.every((n, i) => n === 28 + i);
      const plain = !setPos && byMonthDay.length === 1 && byMonthDay[0] === wallDay;
      // "The last day of the month" from a start on the 31st is the clamp too.
      const lastDay = !setPos && byMonthDay.length === 1 && byMonthDay[0] === -1 && freq === 'MONTHLY' && wallDay === 31;
      if (!clamp && !plain && !lastDay) return unsupported;
      own = { date: start.wallDate, recurrence, ...every, ...(plain ? { recurrenceMonthEnd: 'skip' as const } : {}) };
    } else {
      if (setPos) return unsupported;
      // A plain rule on the 29th–31st (or yearly on February 29) SKIPS the months without that
      // day — RFC 5545 §3.3.10. Gum's own events take the month's last day instead; the
      // store says which (`recurrenceMonthEnd`), and the preview and the editor say it too.
      own = { date: start.wallDate, recurrence, ...every, recurrenceMonthEnd: 'skip' };
    }
  } else {
    return unsupported;
  }

  // 2. Moved to this computer's days. Daily and weekly rules move whole (the weekdays turn
  //    with the date); a month day moves only while it stays inside the month on both sides.
  const shift = daysBetweenKeys(start.wallDate, start.date);
  const local: RepeatFields = { ...own, date: shiftDateKey(own.date, shift) };
  if (shift !== 0) {
    if (own.recurrenceWeekdays) local.recurrenceWeekdays = own.recurrenceWeekdays.map((d) => mod7(d + shift)).sort();
    if (own.recurrenceWeekStart !== undefined) local.recurrenceWeekStart = mod7(own.recurrenceWeekStart + shift);
    if (own.recurrence === 'monthly' || own.recurrence === 'yearly') {
      const day = parseDateKey(own.date).getDate();
      if (own.recurrenceNth || day > 28 || day + shift < 1 || day + shift > 28) return { ok: false, reason: 'zone' };
      delete local.recurrenceMonthEnd;
    }
  }

  // 3. Where it ends, in local days.
  let end: string | undefined;
  if (count !== undefined) {
    end = nthOccurrenceDate(asEvent(local), count) ?? undefined;
  } else if (parts.UNTIL) {
    const untilParams: Record<string, string> = start.kind === 'zoned' && dtstartParams.TZID ? { TZID: dtstartParams.TZID } : {};
    // UNTIL with a UTC start must be UTC too; a writer that forgot the Z still meant it.
    const raw = start.kind === 'utc' && parts.UNTIL.length > 8 && !/Z$/i.test(parts.UNTIL) ? `${parts.UNTIL}Z` : parts.UNTIL;
    const until = parseStamp(raw, untilParams, zones);
    if (!until) return unsupported;
    if (allDay || until.kind === 'date') {
      // A day, as written (an all-day series has no time of day to compare).
      end = allDay ? until.wallDate : shiftDateKey(until.wallDate, shift);
    } else {
      // The last local day whose occurrence starts at or before the UNTIL instant.
      end = until.date;
      const [h, m] = (start.time ?? '00:00').split(':').map(Number);
      const lastStart = parseDateKey(end);
      lastStart.setHours(h || 0, m || 0, 0, 0);
      if (lastStart.getTime() > until.ms) end = shiftDateKey(end, -1);
    }
  }
  return { ok: true, repeat: { ...local, ...(end ? { recurrenceEndDate: end } : {}) } };
}

/** Repeat fields as a whole event, for the calendar's own expansion. */
function asEvent(fields: RepeatFields): CalendarEvent {
  return { id: '', title: '', color: '', category: 'personal', reminder: 'none', createdAt: 0, ...fields };
}

function nthWeekdayKey(year: number, month: number, weekday: number, nth: number): string | null {
  const length = new Date(year, month + 1, 0).getDate();
  if (nth === -1) {
    const last = new Date(year, month, length);
    return toDateKey(new Date(year, month, length - mod7(last.getDay() - weekday)));
  }
  const day = 1 + mod7(weekday - new Date(year, month, 1).getDay()) + (nth - 1) * 7;
  return day <= length ? toDateKey(new Date(year, month, day)) : null;
}

/**
 * Whether a repeating event from another zone lands at a different local hour (or day) as
 * the year goes on: the two zones change their clocks for daylight saving on different
 * dates, or only one of them does. The calendar keeps the local time of the first date, so
 * this is said rather than silently drifting. Checked weekly for a year (or to the end).
 */
function driftsAcrossDst(start: LocalStamp, endDate: string | undefined): boolean {
  if (!start.zoneOffsetAt) return false;
  const localOffset = (ms: number): number => -new Date(ms).getTimezoneOffset();
  const gap = (ms: number): number => (start.zoneOffsetAt as (ms: number) => number)(ms) - localOffset(ms);
  const first = gap(start.ms);
  const limit = Math.min(start.ms + 366 * 86_400_000, endDate ? parseDateKey(endDate).getTime() + 86_400_000 : Infinity);
  for (let at = start.ms + 7 * 86_400_000; at <= limit; at += 7 * 86_400_000) {
    if (gap(at) !== first) return true;
  }
  return false;
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

const CATEGORIES: readonly EventCategory[] = ['study', 'exam', 'assignment', 'reminder', 'personal'];

/**
 * A VALARM as the reminder fields. Any lead time up to four weeks is kept exactly (a
 * picker choice when one matches, else `custom`), so nothing is rounded any more. Only a
 * reminder AFTER the start, or further ahead than four weeks, cannot be held: it becomes
 * "at event time" / four weeks before, and is said (`reminder-rounded`).
 */
function alarmReminder(before: number): { fields: Pick<CalendarEvent, 'reminder' | 'reminderMinutes'>; exact: boolean } {
  if (before < 0) return { fields: { reminder: 'at' }, exact: false };
  return { fields: reminderForMinutes(before), exact: before <= REMINDER_CUSTOM_MAX_MINUTES };
}

function readAlarm(
  vevent: Component,
  start: LocalStamp,
  allDay: boolean,
  durationMin: number,
  zones: ZoneTable,
): { fields: Pick<CalendarEvent, 'reminder' | 'reminderMinutes'>; exact: boolean } | null {
  for (const alarm of vevent.children.filter((c) => c.type === 'VALARM')) {
    const trigger = first(alarm, 'TRIGGER');
    if (!trigger) continue;
    // Minutes from the event's start (negative = before it).
    let fromStart: number | null = null;
    if (trigger.params.VALUE === 'DATE-TIME') {
      const at = parseStamp(trigger.value, trigger.params, zones);
      if (at) fromStart = Math.round((at.ms - start.ms) / 60_000);
    } else {
      const minutes = durationMinutes(trigger.value);
      if (minutes !== null) fromStart = minutes + (trigger.params.RELATED === 'END' ? durationMin : 0);
    }
    if (fromStart === null) continue;
    // An all-day event's reminder is measured from 09:00 on its day, as the exporter wrote it.
    const before = allDay ? ALL_DAY_REMINDER_HOUR * 60 - fromStart : -fromStart;
    return alarmReminder(before);
  }
  return null;
}

/** Read every VEVENT of a `.ics` document. Never throws; unusable events are counted. */
export function parseIcsCalendar(text: string, options: { untitled?: string } = {}): IcsParseResult {
  const root = parseComponents(text);
  const zones = readZoneTable(root);
  const calendar = root.children.find((c) => c.type === 'VCALENDAR') ?? root;
  const vevents = calendar.children.filter((c) => c.type === 'VEVENT').slice(0, MAX_EVENTS);
  const name = first(calendar, 'X-WR-CALNAME')?.value;
  const result: IcsParseResult = { events: [], cancelled: 0, invalid: 0, ...(name ? { calendarName: unescapeText(name) } : {}) };
  /** Masters by UID, so an override can take its date out of the series. */
  const masters = new Map<string, ParsedIcsEvent>();
  const overrides: Array<{ uid: string; date: string; parsed: ParsedIcsEvent }> = [];

  for (const vevent of vevents) {
    if (first(vevent, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
      result.cancelled++;
      continue;
    }
    const dtstart = first(vevent, 'DTSTART');
    const start = dtstart ? parseStamp(dtstart.value, dtstart.params, zones) : null;
    if (!dtstart || !start) {
      result.invalid++;
      continue;
    }
    const warnings = new Set<IcsWarningCode>();
    if (start.unknownZone) warnings.add('timezone-unknown');
    const allDay = start.time === undefined;
    const rawUid = first(vevent, 'UID')?.value.trim();
    const uid = rawUid ? unescapeText(rawUid) : `gum-import-${start.date}-${result.events.length}`;

    // End: DTEND, else DURATION. An end on a later day makes a multi-day event.
    let endTime: string | undefined;
    let endDate: string | undefined;
    let durationMin = 0;
    const dtend = first(vevent, 'DTEND');
    const end = dtend ? parseStamp(dtend.value, dtend.params, zones) : null;
    const duration = first(vevent, 'DURATION');
    if (allDay) {
      // DTEND of an all-day event is the day AFTER its last day.
      const after = end?.date ?? (duration ? shiftDateKey(start.date, Math.round((durationMinutes(duration.value) ?? 1440) / 1440)) : null);
      const days = after ? daysBetweenKeys(start.date, after) : 1;
      if (days > 1) endDate = shiftDateKey(start.date, days - 1);
      durationMin = Math.max(1, days) * 1440;
    } else {
      const endMs = end ? end.ms : duration ? start.ms + (durationMinutes(duration.value) ?? 0) * 60_000 : null;
      if (endMs !== null && endMs > start.ms) {
        durationMin = Math.round((endMs - start.ms) / 60_000);
        const endStamp = fromInstant(endMs);
        endTime = endStamp.time;
        if (endStamp.date !== start.date) endDate = endStamp.date;
      }
    }

    const categoryName = (first(vevent, 'CATEGORIES')?.value ?? '').split(',')[0]?.trim().toLowerCase();
    const category = CATEGORIES.includes(categoryName as EventCategory) ? categoryName as EventCategory : 'personal';
    const colorValue = (first(vevent, 'X-APPLE-CALENDAR-COLOR') ?? first(vevent, 'COLOR'))?.value.trim();
    const color = colorValue && /^#[0-9a-f]{6}$/i.test(colorValue) ? colorValue.toLowerCase() : CATEGORY_COLORS[category];
    const alarm = readAlarm(vevent, start, allDay, durationMin, zones);
    if (alarm && !alarm.exact) warnings.add('reminder-rounded');
    const summary = unescapeText(first(vevent, 'SUMMARY')?.value ?? '').trim();
    const description = unescapeText(first(vevent, 'DESCRIPTION')?.value ?? '').trim();
    const created = first(vevent, 'CREATED');
    const createdStamp = created ? parseStamp(created.value, created.params, zones) : null;

    const base: Omit<CalendarEvent, 'id' | 'createdAt'> = {
      title: (summary || options.untitled || '—').slice(0, 500),
      ...(description ? { description: description.slice(0, 5000) } : {}),
      date: start.date,
      ...(endDate ? { endDate } : {}),
      allDay,
      ...(allDay ? {} : { startTime: start.time, ...(endTime ? { endTime } : {}) }),
      color,
      category,
      ...(alarm?.fields ?? { reminder: 'none' as const }),
      recurrence: 'none',
    };

    // Skipped dates: every EXDATE line, each possibly a comma list, on this computer's days.
    const excluded = new Set<string>();
    for (const ex of all(vevent, 'EXDATE')) {
      for (const value of ex.value.split(',')) {
        const stamp = parseStamp(value, ex.params, zones);
        if (stamp) excluded.add(stamp.date);
      }
    }

    const recurrenceId = first(vevent, 'RECURRENCE-ID');
    const rrule = first(vevent, 'RRULE');
    let event: Omit<CalendarEvent, 'id' | 'createdAt'> = base;
    if (rrule && !recurrenceId) {
      const rule = readRule(rrule.value, start, allDay, dtstart.params, zones);
      if (!rule.ok) {
        warnings.add(rule.reason === 'zone' ? 'repeat-zone' : 'repeat-unsupported');
      } else if (rule.repeat.recurrenceEndDate && rule.repeat.recurrenceEndDate < rule.repeat.date) {
        // A rule that ends before it starts has no occurrences at all.
        result.invalid++;
        continue;
      } else {
        const span = endDate ? daysBetweenKeys(start.date, endDate) : 0;
        event = normalizeEventFields({
          ...base,
          ...rule.repeat,
          // The first date may move to the first day the rule names; a long event keeps its length.
          ...(span ? { endDate: shiftDateKey(rule.repeat.date, span) } : {}),
        });
        if (event.recurrenceMonthEnd === 'skip') warnings.add('month-end-skip');
        if (!allDay && driftsAcrossDst(start, event.recurrenceEndDate)) warnings.add('timezone-shift');
        const skipped = [...excluded].filter((key) => key >= event.date).sort();
        if (skipped.length) event.excludedDates = skipped;
      }
    }
    event = normalizeEventFields(event);

    const gumId = uid.endsWith(GUM_UID_SUFFIX) ? uid.slice(0, -GUM_UID_SUFFIX.length) : undefined;
    const parsed: ParsedIcsEvent = {
      uid,
      ...(gumId ? { gumId } : {}),
      ...(createdStamp ? { createdAt: createdStamp.ms } : {}),
      event,
      warnings: [...warnings],
    };

    if (recurrenceId) {
      const at = parseStamp(recurrenceId.value, recurrenceId.params, zones);
      if (at) {
        overrides.push({ uid, date: at.date, parsed: { ...parsed, uid: `${uid}#${at.date}`, gumId: undefined } });
        continue;
      }
    }
    if (!masters.has(uid)) masters.set(uid, parsed);
    result.events.push(parsed);
  }

  // A moved or edited occurrence: its date leaves the series, the override is its own event.
  for (const override of overrides) {
    const master = masters.get(override.uid);
    if (master && master.event.recurrence !== 'none') {
      master.event.excludedDates = [...new Set([...(master.event.excludedDates ?? []), override.date])].sort();
    }
    result.events.push(override.parsed);
  }
  return result;
}

/* ------------------------------------------------------------------ *
 * Import plan
 * ------------------------------------------------------------------ */

export interface IcsImportPlan {
  fresh: ParsedIcsEvent[];
  /** Already in the calendar (same UID), or the same UID twice in the file. */
  duplicates: ParsedIcsEvent[];
}

/** The UID an existing event answers to, the way the exporter writes it. */
export function calendarEventUid(event: Pick<CalendarEvent, 'id' | 'icsUid'>): string {
  return event.icsUid ?? `${event.id}${GUM_UID_SUFFIX}`;
}

/**
 * Sort parsed events into new and already-present, by UID — never by guessing from titles.
 * Earlier versions split a weekly rule on several days into one event per weekday, named
 * `<uid>#TU`, `<uid>#TH`; such a series is the same file's event, so it counts as present.
 */
export function planIcsImport(parsed: IcsParseResult, existing: readonly CalendarEvent[]): IcsImportPlan {
  const known = new Set<string>();
  for (const event of existing) {
    const uid = calendarEventUid(event);
    known.add(uid);
    const split = /^(.*)#(?:SU|MO|TU|WE|TH|FR|SA)$/.exec(uid);
    if (split) known.add(split[1]);
  }
  const plan: IcsImportPlan = { fresh: [], duplicates: [] };
  for (const entry of parsed.events) {
    if (known.has(entry.uid)) plan.duplicates.push(entry);
    else {
      known.add(entry.uid);
      plan.fresh.push(entry);
    }
  }
  return plan;
}

/**
 * The new events, ready for `importCalendarEvents`. An event that was exported from this
 * app keeps its id (so its UID round-trips unchanged); anything else remembers its UID.
 */
export function icsImportEvents(fresh: readonly ParsedIcsEvent[], now = Date.now()): CalendarEvent[] {
  return fresh.map((entry) => ({
    ...entry.event,
    id: entry.gumId ?? '',
    ...(entry.gumId ? {} : { icsUid: entry.uid }),
    createdAt: entry.createdAt && Number.isFinite(entry.createdAt) ? entry.createdAt : now,
  }));
}
