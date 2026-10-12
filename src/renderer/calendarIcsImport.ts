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
 *   · All-day: `VALUE=DATE`. The calendar has no multi-day events, so a longer one keeps
 *     its first day (`multi-day`).
 *   · Repeats (the subset the calendar can hold): DAILY / every N days, WEEKLY (several
 *     BYDAYs become one weekly series per day), every N weeks, MONTHLY on the start's day —
 *     including the exporter's `BYMONTHDAY=28..31;BYSETPOS=-1` clamp — with UNTIL or COUNT.
 *     Anything else is imported as its first date only (`repeat-unsupported`).
 *   · EXDATE → skipped dates; a RECURRENCE-ID override skips its date in the series and is
 *     imported as its own event, which is how the calendar models a moved occurrence.
 *   · VALARM → the nearest reminder choice (`reminder-rounded` when not exact).
 *
 * Nothing here writes: `parseIcsCalendar` reads, `planIcsImport` sorts into new and
 * already-present (by UID), and `icsImportEvents` turns the new ones into events for
 * `importCalendarEvents`.
 */
import {
  ALL_DAY_REMINDER_HOUR,
  CATEGORY_COLORS,
  isCalendarDateKey,
  REMINDER_MINUTES,
  REMINDER_OFFSETS,
  shiftDateKey,
  toDateKey,
  daysBetweenKeys,
  parseDateKey,
  type CalendarEvent,
  type EventCategory,
  type RecurrenceFreq,
  type ReminderOffset,
} from './calendar';
import { GUM_UID_SUFFIX } from './calendarIcs';

export type IcsWarningCode =
  | 'repeat-unsupported'
  | 'multi-day'
  | 'timezone-unknown'
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

interface LocalStamp {
  date: string;
  /** `HH:MM`, absent for a DATE value. */
  time?: string;
  /** Epoch ms of the instant (local midnight for a DATE). */
  ms: number;
  /** Set when a TZID could not be resolved and the time was read as floating. */
  unknownZone?: boolean;
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

/** The UTC instant of a wall-clock time in an IANA zone, or null when the zone is unknown. */
function zonedToUtc(fields: [number, number, number, number, number, number], timeZone: string): number | null {
  let format: Intl.DateTimeFormat;
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
    return null;
  }
  const [y, mo, d, h, mi, s] = fields;
  const wall = Date.UTC(y, mo - 1, d, h, mi, s);
  let guess = wall;
  // Two refinements settle every DST edge: the offset at the guess, then at the answer.
  for (let pass = 0; pass < 3; pass++) {
    const parts: Record<string, number> = {};
    for (const part of format.formatToParts(new Date(guess))) parts[part.type] = Number(part.value);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour % 24, parts.minute, parts.second);
    const next = wall - (asUtc - guess);
    if (next === guess) break;
    guess = next;
  }
  return guess;
}

const pad = (n: number): string => String(n).padStart(2, '0');

function fromInstant(ms: number): LocalStamp {
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
    return { date: key, ms: parseDateKey(key).getTime() };
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/i.exec(v);
  if (!m) return null;
  const fields: [number, number, number, number, number, number] = [
    Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6] ?? 0),
  ];
  if (!isCalendarDateKey(`${m[1]}-${m[2]}-${m[3]}`) || fields[3] > 23 || fields[4] > 59) return null;
  if (m[7]) return fromInstant(Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]));
  const tzid = params.TZID?.trim();
  if (tzid) {
    const zoned = zonedToUtc(fields, tzid.replace(/^\//, ''));
    if (zoned !== null) return fromInstant(zoned);
    const offset = zones.get(tzid);
    if (offset !== undefined) {
      return fromInstant(Date.UTC(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]) - offset * 60_000);
    }
  }
  // Floating (or a zone nobody could resolve): the wall-clock time as written.
  const local = new Date(fields[0], fields[1] - 1, fields[2], fields[3], fields[4], fields[5]);
  return { ...fromInstant(local.getTime()), ...(tzid ? { unknownZone: true } : {}) };
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

interface RepeatPart {
  /** First date of this part (a BYDAY part starts on the first matching day). */
  date: string;
  recurrence: RecurrenceFreq;
  recurrenceInterval?: number;
  recurrenceEndDate?: string;
  /** The UID suffix for a part of a split rule. */
  suffix?: string;
}

function monthlyStep(base: Date, months: number): string {
  const d = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  d.setDate(Math.min(base.getDate(), last));
  return toDateKey(d);
}

/**
 * The calendar's repeat(s) for one RRULE, or null when the rule is outside what the
 * calendar can hold (the caller then imports the first date alone and says so).
 */
function readRule(rule: string, start: string, zones: ZoneTable): RepeatPart[] | null {
  const parts: Record<string, string> = {};
  for (const piece of rule.split(';')) {
    const [k, v] = piece.split('=');
    if (k && v !== undefined) parts[k.trim().toUpperCase()] = v.trim().toUpperCase();
  }
  const freq = parts.FREQ;
  const interval = parts.INTERVAL ? Number(parts.INTERVAL) : 1;
  if (!Number.isInteger(interval) || interval < 1 || interval > 365) return null;
  const known = new Set(['FREQ', 'INTERVAL', 'UNTIL', 'COUNT', 'BYDAY', 'BYMONTHDAY', 'BYSETPOS', 'WKST']);
  if (Object.keys(parts).some((key) => !known.has(key))) return null;
  let until: string | undefined;
  if (parts.UNTIL) {
    const stamp = parseStamp(parts.UNTIL, {}, zones);
    if (!stamp) return null;
    until = stamp.date;
  }
  const count = parts.COUNT ? Number(parts.COUNT) : undefined;
  if (count !== undefined && (!Number.isInteger(count) || count < 1)) return null;
  const startDay = parseDateKey(start);

  if ((freq === 'DAILY' || freq === 'WEEKLY') && !parts.BYDAY) {
    if (parts.BYMONTHDAY || parts.BYSETPOS) return null;
    const step = freq === 'DAILY' ? interval : interval * 7;
    const recurrence: RecurrenceFreq = step === 1 ? 'daily' : step === 7 ? 'weekly' : 'custom';
    const end = count !== undefined ? shiftDateKey(start, (count - 1) * step) : until;
    return [{ date: start, recurrence, ...(recurrence === 'custom' ? { recurrenceInterval: step } : {}), ...(end ? { recurrenceEndDate: end } : {}) }];
  }

  if (freq === 'WEEKLY' || (freq === 'DAILY' && parts.BYDAY)) {
    if (parts.BYMONTHDAY || parts.BYSETPOS) return null;
    const days = (parts.BYDAY ?? '').split(',').map((d) => d.trim()).filter(Boolean);
    // `1MO`-style ordinals belong to monthly rules; a weekly one with them is not ours.
    if (!days.length || days.some((d) => !WEEKDAYS.includes(d))) return null;
    const step = (freq === 'DAILY' ? 1 : interval) * 7;
    if (freq === 'DAILY' && interval !== 1) return null;
    const wanted = new Set(days.map((d) => WEEKDAYS.indexOf(d)));
    let end = until;
    if (count !== undefined) {
      // The COUNT-th matching day, counted from the start across every listed weekday.
      let seen = 0;
      let cursor = start;
      for (let guard = 0; guard < 5000 && seen < count; guard++) {
        const offset = daysBetweenKeys(start, cursor);
        const week = Math.floor(offset / 7);
        if (wanted.has(parseDateKey(cursor).getDay()) && week % (step / 7) === 0) {
          seen++;
          if (seen === count) break;
        }
        cursor = shiftDateKey(cursor, 1);
      }
      end = cursor;
    }
    return [...wanted].sort().map((weekday) => {
      const lead = (weekday - startDay.getDay() + 7) % 7;
      const date = shiftDateKey(start, lead);
      return {
        date,
        recurrence: step === 7 ? 'weekly' : 'custom',
        ...(step === 7 ? {} : { recurrenceInterval: step }),
        ...(end ? { recurrenceEndDate: end } : {}),
        ...(wanted.size > 1 ? { suffix: WEEKDAYS[weekday] } : {}),
      } as RepeatPart;
    }).filter((part) => !part.recurrenceEndDate || part.recurrenceEndDate >= part.date);
  }

  if (freq === 'MONTHLY') {
    if (interval !== 1 || parts.BYDAY) return null;
    const day = startDay.getDate();
    if (parts.BYMONTHDAY) {
      const list = parts.BYMONTHDAY.split(',').map(Number);
      // The exporter's clamp: "the 31st, or the month's last day" is 28..31 with BYSETPOS=-1.
      const clamp = parts.BYSETPOS === '-1' && day > 28
        && list.length === day - 27 && list.every((n, i) => n === 28 + i);
      const plain = !parts.BYSETPOS && list.length === 1 && list[0] === day;
      if (!clamp && !plain) return null;
    } else if (parts.BYSETPOS) {
      return null;
    }
    const end = count !== undefined ? monthlyStep(startDay, count - 1) : until;
    return [{ date: start, recurrence: 'monthly', ...(end ? { recurrenceEndDate: end } : {}) }];
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Events
 * ------------------------------------------------------------------ */

const CATEGORIES: readonly EventCategory[] = ['study', 'exam', 'assignment', 'reminder', 'personal'];

function nearestReminder(before: number): { reminder: ReminderOffset; exact: boolean } {
  if (before <= 0) return { reminder: 'at', exact: before === 0 };
  let best: ReminderOffset = 'at';
  for (const offset of REMINDER_OFFSETS) {
    if (offset === 'none') continue;
    if (Math.abs(REMINDER_MINUTES[offset] - before) < Math.abs(REMINDER_MINUTES[best] - before)) best = offset;
  }
  return { reminder: best, exact: REMINDER_MINUTES[best] === before };
}

function readAlarm(
  vevent: Component,
  start: LocalStamp,
  allDay: boolean,
  durationMin: number,
  zones: ZoneTable,
): { reminder: ReminderOffset; exact: boolean } | null {
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
    return nearestReminder(before);
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
  const masters = new Map<string, ParsedIcsEvent[]>();
  const overrides: Array<{ uid: string; date: string; parsed: ParsedIcsEvent }> = [];

  for (const vevent of vevents) {
    if (first(vevent, 'STATUS')?.value.trim().toUpperCase() === 'CANCELLED') {
      result.cancelled++;
      continue;
    }
    const dtstart = first(vevent, 'DTSTART');
    const start = dtstart ? parseStamp(dtstart.value, dtstart.params, zones) : null;
    if (!start) {
      result.invalid++;
      continue;
    }
    const warnings = new Set<IcsWarningCode>();
    if (start.unknownZone) warnings.add('timezone-unknown');
    const allDay = start.time === undefined;
    const rawUid = first(vevent, 'UID')?.value.trim();
    const uid = rawUid ? unescapeText(rawUid) : `gum-import-${start.date}-${result.events.length}`;

    // End: DTEND, else DURATION.
    let endTime: string | undefined;
    let durationMin = 0;
    const dtend = first(vevent, 'DTEND');
    const end = dtend ? parseStamp(dtend.value, dtend.params, zones) : null;
    const duration = first(vevent, 'DURATION');
    if (allDay) {
      const endDate = end?.date ?? (duration ? shiftDateKey(start.date, Math.round((durationMinutes(duration.value) ?? 1440) / 1440)) : null);
      if (endDate && daysBetweenKeys(start.date, endDate) > 1) warnings.add('multi-day');
      durationMin = 1440;
    } else {
      const endMs = end ? end.ms : duration ? start.ms + (durationMinutes(duration.value) ?? 0) * 60_000 : null;
      if (endMs !== null && endMs > start.ms) {
        durationMin = Math.round((endMs - start.ms) / 60_000);
        const endStamp = fromInstant(endMs);
        if (endStamp.date === start.date) endTime = endStamp.time;
        else {
          // Past midnight: the calendar's events live inside one day.
          endTime = '23:59';
          warnings.add('multi-day');
        }
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
      allDay,
      ...(allDay ? {} : { startTime: start.time, ...(endTime ? { endTime } : {}) }),
      color,
      category,
      reminder: alarm?.reminder ?? 'none',
      recurrence: 'none',
    };

    // Skipped dates: every EXDATE line, each possibly a comma list.
    const excluded = new Set<string>();
    for (const ex of all(vevent, 'EXDATE')) {
      for (const value of ex.value.split(',')) {
        const stamp = parseStamp(value, ex.params, zones);
        if (stamp) excluded.add(stamp.date);
      }
    }

    const recurrenceId = first(vevent, 'RECURRENCE-ID');
    const rrule = first(vevent, 'RRULE');
    let repeat: RepeatPart[] | null = [{ date: start.date, recurrence: 'none' }];
    if (rrule && !recurrenceId) {
      repeat = readRule(rrule.value, start.date, zones);
      if (!repeat) {
        warnings.add('repeat-unsupported');
        repeat = [{ date: start.date, recurrence: 'none' }];
      } else if (repeat.length === 0) {
        // A rule that ends before it starts has no occurrences at all.
        result.invalid++;
        continue;
      }
    }

    const gumId = uid.endsWith(GUM_UID_SUFFIX) ? uid.slice(0, -GUM_UID_SUFFIX.length) : undefined;
    const parsedParts = repeat.map((part): ParsedIcsEvent => {
      const event: Omit<CalendarEvent, 'id' | 'createdAt'> = {
        ...base,
        date: part.date,
        recurrence: part.recurrence,
        ...(part.recurrenceInterval ? { recurrenceInterval: part.recurrenceInterval } : {}),
        ...(part.recurrenceEndDate ? { recurrenceEndDate: part.recurrenceEndDate } : {}),
      };
      if (part.recurrence !== 'none' && excluded.size) {
        event.excludedDates = [...excluded].filter((key) => key >= part.date).sort();
        if (!event.excludedDates.length) delete event.excludedDates;
      }
      return {
        uid: part.suffix ? `${uid}#${part.suffix}` : uid,
        ...(gumId && !part.suffix ? { gumId } : {}),
        ...(createdStamp ? { createdAt: createdStamp.ms } : {}),
        event,
        warnings: [...warnings],
      };
    });

    if (recurrenceId) {
      const at = parseStamp(recurrenceId.value, recurrenceId.params, zones);
      if (at) {
        overrides.push({ uid, date: at.date, parsed: { ...parsedParts[0], uid: `${uid}#${at.date}`, gumId: undefined } });
        continue;
      }
    }
    masters.set(uid, [...(masters.get(uid) ?? []), ...parsedParts]);
    result.events.push(...parsedParts);
  }

  // A moved or edited occurrence: its date leaves the series, the override is its own event.
  for (const override of overrides) {
    for (const master of masters.get(override.uid) ?? []) {
      if (master.event.recurrence === 'none') continue;
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

/** Sort parsed events into new and already-present, by UID — never by guessing from titles. */
export function planIcsImport(parsed: IcsParseResult, existing: readonly CalendarEvent[]): IcsImportPlan {
  const known = new Set(existing.map(calendarEventUid));
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
