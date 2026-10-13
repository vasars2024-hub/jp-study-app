// Calendar events store — Month/Week/Day/Agenda views in CalendarView.tsx and
// the lightweight Home Workspace widget both read through this module. Same
// localStorage-cache + IndexedDB-mirror persistence pattern as flashcardDeck.ts.

import { IDB_KEYS, LS_KEYS, mirrorToIdb } from './storage/storage';

export type EventCategory = 'study' | 'exam' | 'assignment' | 'reminder' | 'personal';
export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom';
/** `custom` is an exact lead time (`reminderMinutes`) — what an imported VALARM keeps. */
export type ReminderOffset = 'none' | 'at' | '5m' | '15m' | '30m' | '1h' | '1d' | 'custom';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** ISO date, 'YYYY-MM-DD'. */
  date: string;
  /**
   * The last day of an event that runs over several days (inclusive, after `date`). A
   * timed one starts on `date` at `startTime` and ends on this day at `endTime`. Absent
   * for an event that is over the same day — which is every event made before this field.
   */
  endDate?: string;
  /** 'HH:MM' 24h, undefined when allDay. */
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  color: string;
  category: EventCategory;
  reminder: ReminderOffset;
  /** Minutes before the start, only when `reminder === 'custom'`. */
  reminderMinutes?: number;
  recurrence: RecurrenceFreq;
  /**
   * `custom`: days between occurrences. `weekly` / `monthly` / `yearly`: every N weeks,
   * months or years (absent or 1 = every one). Unused for `daily`.
   */
  recurrenceInterval?: number;
  /**
   * `weekly`: the weekdays it falls on (0 = Sunday … 6 = Saturday) — "every Tue and Thu"
   * is ONE series. Absent = the weekday of `date`.
   */
  recurrenceWeekdays?: number[];
  /**
   * `weekly` every N > 1 weeks on several days: the day the counted weeks start on
   * (iCalendar's WKST). Absent = Monday, iCalendar's default.
   */
  recurrenceWeekStart?: number;
  /**
   * `monthly` / `yearly`: the Nth weekday of the month (1–5, or -1 for the last) instead of
   * the same day number — "the 2nd Tuesday". The weekday is `date`'s.
   */
  recurrenceNth?: number;
  /**
   * `monthly` on the 29th–31st (or `yearly` on February 29): what a month without that day
   * does. Absent = Gum's own rule, the month's last day. `skip` = iCalendar's (RFC 5545)
   * rule, which is what another calendar's file means — that month has no occurrence.
   */
  recurrenceMonthEnd?: 'skip';
  /** Last date recurrence may land on (inclusive). Unbounded when absent. */
  recurrenceEndDate?: string;
  /**
   * Occurrences of a repeating event that were removed or moved on their own
   * (`YYYY-MM-DD`). A moved occurrence lives on as a separate one-off event.
   */
  excludedDates?: string[];
  /**
   * The iCalendar UID an imported event came with (Google, Outlook…). Exported back as its
   * UID and used to recognise the same event on a second import. Absent for events made
   * here, whose UID is derived from `id`.
   */
  icsUid?: string;
  createdAt: number;
}

const KEY = LS_KEYS.calendarEvents;
const EVENT = 'calendar-events-changed';

/**
 * i18n keys, resolved with `t()` at render time. Module-level data cannot call
 * `useT()` at declaration time (CLAUDE.md i18n rule 7) — these used to be the
 * English labels themselves, so the category and reminder pickers were English
 * in every language.
 */
export const CATEGORY_LABEL_KEYS: Record<EventCategory, string> = {
  study: 'calendar.category.study',
  exam: 'calendar.category.exam',
  assignment: 'calendar.category.assignment',
  reminder: 'calendar.category.reminder',
  personal: 'calendar.category.personal',
};

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  study: '#6c7bff',
  exam: '#ff2e4d',
  assignment: '#ff9f43',
  reminder: '#2ecf9f',
  personal: '#b98cff',
};

/** Picker order, and the i18n key for each choice. */
export const REMINDER_OFFSETS: readonly ReminderOffset[] = ['none', 'at', '5m', '15m', '30m', '1h', '1d'];

export const REMINDER_LABEL_KEYS: Record<ReminderOffset, string> = {
  none: 'calendar.reminder.none',
  at: 'calendar.reminder.at',
  '5m': 'calendar.reminder.5m',
  '15m': 'calendar.reminder.15m',
  '30m': 'calendar.reminder.30m',
  '1h': 'calendar.reminder.1h',
  '1d': 'calendar.reminder.1d',
  // Never offered in the picker; an event that has one is labelled by `reminderMinutes`.
  custom: 'planner.reminder.custom',
};

/**
 * Where an all-day event's reminder is anchored: 09:00 on its day, so "1 day
 * before" means the morning before and "at event time" means that morning —
 * not 23:59, which is when an all-day event stops being upcoming.
 */
export const ALL_DAY_REMINDER_HOUR = 9;

export const REMINDER_MINUTES: Record<ReminderOffset, number> = {
  none: 0,
  at: 0,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
  '1d': 1440,
  // Read through `reminderLeadMinutes`, which takes the event's own `reminderMinutes`.
  custom: 0,
};

/** The longest exact reminder kept: four weeks before. */
export const REMINDER_CUSTOM_MAX_MINUTES = 28 * 1440;

/** Minutes between a reminder and its event's start, or `null` when it has none. */
export function reminderLeadMinutes(ev: Pick<CalendarEvent, 'reminder' | 'reminderMinutes'>): number | null {
  const r = ev.reminder;
  if (!r || r === 'none') return null;
  if (r === 'custom') {
    const m = ev.reminderMinutes;
    if (typeof m !== 'number' || !Number.isFinite(m)) return null;
    return Math.min(REMINDER_CUSTOM_MAX_MINUTES, Math.max(0, Math.round(m)));
  }
  return r in REMINDER_MINUTES ? REMINDER_MINUTES[r] : null;
}

/** A lead time as the reminder fields: a picker choice when one matches exactly, else `custom`. */
export function reminderForMinutes(minutes: number): Pick<CalendarEvent, 'reminder' | 'reminderMinutes'> {
  const exact = Math.min(REMINDER_CUSTOM_MAX_MINUTES, Math.max(0, Math.round(minutes)));
  const preset = REMINDER_OFFSETS.find((r) => r !== 'none' && REMINDER_MINUTES[r] === exact);
  return preset ? { reminder: preset } : { reminder: 'custom', reminderMinutes: exact };
}

function newId(): string {
  return `ev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readList(): CalendarEvent[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as CalendarEvent[]) : [];
    return Array.isArray(list) ? list.filter((e) => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

function writeList(list: CalendarEvent[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* localStorage full — the IndexedDB mirror below still persists it */
  }
  mirrorToIdb(IDB_KEYS.calendarEvents, list);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function loadEvents(): CalendarEvent[] {
  return readList();
}

export function onCalendarChanged(cb: () => void): () => void {
  const h = () => cb();
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

export function addEvent(entry: Omit<CalendarEvent, 'id' | 'createdAt'>): CalendarEvent {
  const created: CalendarEvent = { ...entry, id: newId(), createdAt: Date.now() };
  writeList([created, ...readList()]);
  return created;
}

export function updateEvent(id: string, patch: Partial<Omit<CalendarEvent, 'id' | 'createdAt'>>): CalendarEvent[] {
  const list = readList().map((e) => (e.id === id ? { ...e, ...patch } : e));
  writeList(list);
  return list;
}

export function deleteEvent(id: string): CalendarEvent[] {
  const list = readList().filter((e) => e.id !== id);
  writeList(list);
  return list;
}

/**
 * Add several complete events in ONE write (an .ics import): one change event, one mirror
 * write, and no half-imported calendar if the window closes mid-way. An id already in the
 * store is given a fresh one rather than overwriting what is there.
 */
export function importCalendarEvents(entries: readonly CalendarEvent[]): CalendarEvent[] {
  if (!entries.length) return [];
  const list = readList();
  const taken = new Set(list.map((e) => e.id));
  const added = entries.map((entry) => {
    const id = entry.id && !taken.has(entry.id) ? entry.id : newId();
    taken.add(id);
    return { ...entry, id };
  });
  writeList([...added, ...list]);
  return added;
}

/** Which occurrences an edit made from one date of a repeating event applies to. */
export type RepeatEditScope = 'this' | 'following' | 'all';

/** The occurrence-specific fields a one-off copy of a series must not carry. */
function asOneOff(payload: Omit<CalendarEvent, 'id' | 'createdAt'>): Omit<CalendarEvent, 'id' | 'createdAt'> {
  const { excludedDates: _x, icsUid: _u, ...rest } = withoutRepeatRule(payload);
  return { ...rest, recurrence: 'none' };
}

/** An event without any of the fields that only a repeating event has. */
function withoutRepeatRule<T extends Partial<CalendarEvent>>(event: T): T {
  const {
    recurrenceInterval: _i,
    recurrenceEndDate: _e,
    recurrenceWeekdays: _w,
    recurrenceWeekStart: _s,
    recurrenceNth: _n,
    recurrenceMonthEnd: _m,
    ...rest
  } = event;
  return rest as T;
}

/**
 * Save an edit made in the editor opened from ONE occurrence of a repeating event.
 *
 *   · `this` — the series skips that date and the edited copy becomes its own event (on
 *     `payload.date`, which the editor starts at the occurrence's date).
 *   · `following` — the series ends the day before that date; a new series starts at
 *     `payload.date` with the edit, carrying the later skipped dates along (moved by the
 *     same number of days). From the first occurrence this is the whole series.
 *   · `all` — the series itself is changed.
 *
 * One write for each scope, so the calendar is never seen half-split. Returns the list.
 */
export function saveRepeatingEdit(
  event: CalendarEvent,
  occurrenceDate: string,
  scope: RepeatEditScope,
  payload: Omit<CalendarEvent, 'id' | 'createdAt'>,
): CalendarEvent[] {
  const list = readList();
  const now = Date.now();
  const occ = isCalendarDateKey(occurrenceDate) ? occurrenceDate : event.date;
  if (event.recurrence === 'none' || scope === 'all' || (scope === 'following' && occ <= event.date)) {
    const next = list.map((e) => (e.id === event.id ? { ...e, ...payload, excludedDates: e.excludedDates } : e));
    writeList(next);
    return next;
  }
  if (scope === 'this') {
    const excludedDates = [...new Set([...(event.excludedDates ?? []), occ])].sort();
    const single: CalendarEvent = { ...asOneOff(payload), id: newId(), createdAt: now };
    const next = [single, ...list.map((e) => (e.id === event.id ? { ...e, excludedDates } : e))];
    writeList(next);
    return next;
  }
  const delta = isCalendarDateKey(payload.date) ? daysBetweenKeys(occ, payload.date) : 0;
  const before = (event.excludedDates ?? []).filter((key) => key < occ);
  const after = (event.excludedDates ?? []).filter((key) => key >= occ).map((key) => shiftDateKey(key, delta));
  const following: CalendarEvent = {
    ...payload,
    ...(after.length ? { excludedDates: after } : { excludedDates: undefined }),
    id: newId(),
    createdAt: now,
  };
  const next = [
    following,
    ...list.map((e) => (e.id === event.id
      ? { ...e, recurrenceEndDate: shiftDateKey(occ, -1), excludedDates: before.length ? before : undefined }
      : e)),
  ];
  writeList(next);
  return next;
}

/** Delete from one occurrence: just it, it and every later one, or the whole series. */
export function deleteRepeatingScope(event: CalendarEvent, occurrenceDate: string, scope: RepeatEditScope): CalendarEvent[] {
  if (event.recurrence === 'none' || scope === 'all' || !isCalendarDateKey(occurrenceDate)) return deleteEvent(event.id);
  if (scope === 'this') return excludeOccurrence(event, occurrenceDate);
  if (occurrenceDate <= event.date) return deleteEvent(event.id);
  const before = (event.excludedDates ?? []).filter((key) => key < occurrenceDate);
  return updateEvent(event.id, {
    recurrenceEndDate: shiftDateKey(occurrenceDate, -1),
    excludedDates: before.length ? before : undefined,
  });
}

/** `HH:MM` moved by `minutes`, clamped to the same day (00:00–23:59). */
export function shiftClockTime(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, (h || 0) * 60 + (m || 0) + Math.round(minutes)));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/**
 * A local-time `YYYY-MM-DD` key. Exported because `occurrenceDate` is one of
 * these, so a caller that wants "not today" has to compare against the same
 * shape — `new Date().toISOString()` would be UTC and wrong past 19:00 here.
 */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** A local `YYYY-MM-DD` key back to local midnight of that day. */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** A real calendar date in `YYYY-MM-DD` form — `2026-02-31` is shaped right and is not one. */
export function isCalendarDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 1000) return false;
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/**
 * A 24-hour clock time as the calendar stores it: zero-padded `HH:MM`, so plain string
 * comparison orders times. `9:00` is accepted and padded; anything else is null.
 */
export function normalizeClockTime(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** `key` moved by whole calendar days (DST-safe: it moves the date, not 24-hour blocks). */
export function shiftDateKey(key: string, days: number): string {
  const d = parseDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Whole calendar days from `from` to `to` (negative when `to` is earlier). */
export function daysBetweenKeys(from: string, to: string): number {
  const a = parseDateKey(from);
  const b = parseDateKey(to);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86_400_000,
  );
}

/**
 * The patch that moves one occurrence of `event` (the one on `fromDate`) to `toDate`.
 *
 * A one-off event simply takes the new date. A repeating event has no per-occurrence
 * exceptions in this store, so the honest move is the whole series by the same number of
 * days — its first date and its end date both shift, which keeps the occurrence the user
 * dragged landing exactly where it was dropped. Null when nothing would change.
 */
export function rescheduleEventPatch(
  event: Pick<CalendarEvent, 'date' | 'recurrence' | 'recurrenceEndDate'> & Partial<Pick<CalendarEvent, 'endDate' | 'recurrenceWeekdays' | 'recurrenceNth'>>,
  fromDate: string,
  toDate: string,
): Pick<CalendarEvent, 'date'> & Partial<Pick<CalendarEvent, 'recurrenceEndDate' | 'endDate' | 'recurrenceWeekdays' | 'recurrenceNth'>> | null {
  if (!isCalendarDateKey(fromDate) || !isCalendarDateKey(toDate)) return null;
  const delta = daysBetweenKeys(fromDate, toDate);
  if (delta === 0) return null;
  // A multi-day event keeps its length.
  const span = eventSpanDays(event);
  if (event.recurrence === 'none') return { date: toDate, ...(span ? { endDate: shiftDateKey(toDate, span) } : {}) };
  const date = shiftDateKey(event.date, delta);
  return {
    date,
    ...(span ? { endDate: shiftDateKey(date, span) } : {}),
    ...(event.recurrenceEndDate ? { recurrenceEndDate: shiftDateKey(event.recurrenceEndDate, delta) } : {}),
    // "Every Tue and Thu" moved a day later is every Wed and Fri.
    ...(event.recurrenceWeekdays?.length
      ? { recurrenceWeekdays: [...new Set(event.recurrenceWeekdays.map((d) => (((d + delta) % 7) + 7) % 7))].sort() }
      : {}),
    // "The last Friday" stays the last one; otherwise the week of the month follows the date.
    ...(event.recurrenceNth ? { recurrenceNth: event.recurrenceNth === -1 && nthOfDateKey(date).last ? -1 : nthOfDateKey(date).nth } : {}),
  };
}

/**
 * Take one occurrence out of a repeating series: the series gains an excluded date and the
 * occurrence becomes its own one-off event on `toDate` (the same day when it is only being
 * split off). The rest of the series is untouched. Null for a one-off event or a bad date.
 */
export function detachOccurrence(
  event: CalendarEvent,
  occurrenceDate: string,
  toDate: string = occurrenceDate,
): { seriesPatch: Pick<CalendarEvent, 'excludedDates'>; single: Omit<CalendarEvent, 'id' | 'createdAt'> } | null {
  if (event.recurrence === 'none' || !isCalendarDateKey(occurrenceDate) || !isCalendarDateKey(toDate)) return null;
  const excludedDates = [...new Set([...(event.excludedDates ?? []), occurrenceDate])].sort();
  const {
    id: _id,
    createdAt: _createdAt,
    excludedDates: _excluded,
    // The series' UID names the series; a second event exported under it would collide.
    icsUid: _uid,
    ...rest
  } = withoutRepeatRule(event);
  const span = eventSpanDays(event);
  return {
    seriesPatch: { excludedDates },
    single: { ...rest, date: toDate, ...(span ? { endDate: shiftDateKey(toDate, span) } : {}), recurrence: 'none' },
  };
}

/** Remove a single occurrence of a repeating event; the rest of the series stays. */
export function excludeOccurrence(event: CalendarEvent, occurrenceDate: string): CalendarEvent[] {
  if (event.recurrence === 'none' || !isCalendarDateKey(occurrenceDate)) return readList();
  return updateEvent(event.id, {
    excludedDates: [...new Set([...(event.excludedDates ?? []), occurrenceDate])].sort(),
  });
}

/** One concrete occurrence of an event on a specific calendar date. */
export interface EventOccurrence extends CalendarEvent {
  /** The day this occurrence starts on — what identifies it in its series. */
  occurrenceDate: string;
  /**
   * Set only by `expandDayOccurrences`, for an event over several days: the day this entry
   * draws on (from `occurrenceDate` to its last day), its index from 0, and the day count.
   */
  spanDay?: string;
  spanIndex?: number;
  spanDays?: number;
}

/** Custom repeats use whole calendar days, including when loading older events. */
export function normalizeRecurrenceInterval(value = 1): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
}

/** Whole days after `date` an event runs on (0 for an event that is over the same day). */
export function eventSpanDays(ev: Partial<Pick<CalendarEvent, 'date' | 'endDate'>>): number {
  if (!ev.date || !ev.endDate || !isCalendarDateKey(ev.endDate) || ev.endDate <= ev.date) return 0;
  return daysBetweenKeys(ev.date, ev.endDate);
}

/** Which week of its month a date is in, for "the 2nd Tuesday", and whether it is the last such weekday. */
export function nthOfDateKey(key: string): { nth: number; last: boolean } {
  const d = parseDateKey(key);
  const length = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
  return { nth: Math.ceil(d.getDate() / 7), last: d.getDate() + 7 > length };
}

/** The `nth` (1–5, or -1 = last) `weekday` of a month, or null when that month has none. */
function nthWeekdayInMonth(year: number, month: number, weekday: number, nth: number): Date | null {
  const length = new Date(year, month + 1, 0).getDate();
  if (nth === -1) {
    const lastDay = new Date(year, month, length);
    return new Date(year, month, length - ((lastDay.getDay() - weekday + 7) % 7));
  }
  const day = 1 + ((weekday - new Date(year, month, 1).getDay() + 7) % 7) + (nth - 1) * 7;
  return day <= length ? new Date(year, month, day) : null;
}

/** Day `day` of a month; a month too short for it takes its last day, or none when `skip`. */
function dayInMonth(year: number, month: number, day: number, skip: boolean): Date | null {
  const length = new Date(year, month + 1, 0).getDate();
  if (day <= length) return new Date(year, month, day);
  return skip ? null : new Date(year, month, length);
}

/** The weekdays a weekly series falls on: its own list, else the weekday of its first date. */
export function weeklyWeekdays(ev: Pick<CalendarEvent, 'date' | 'recurrenceWeekdays'>): number[] {
  const own = (ev.recurrenceWeekdays ?? []).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6);
  return [...new Set(own.length ? own : [parseDateKey(ev.date).getDay()])].sort();
}

const validNth = (n: unknown): n is number => n === -1 || (Number.isInteger(n) && (n as number) >= 1 && (n as number) <= 5);

/**
 * Every date of `ev` in [fromKey, toKey] (inclusive), before skipped dates are taken out.
 * Each rule jumps straight to the range, so a series that began years ago costs no more
 * than one that begins today.
 */
function seriesDateKeys(ev: CalendarEvent, fromKey: string, toKey: string): string[] {
  const out: string[] = [];
  const first = ev.date;
  if (!isCalendarDateKey(first)) return out;
  const recurrence = ev.recurrence;
  if (!recurrence || recurrence === 'none' || !['daily', 'weekly', 'monthly', 'yearly', 'custom'].includes(recurrence)) {
    if (first >= fromKey && first <= toKey) out.push(first);
    return out;
  }
  const stop = ev.recurrenceEndDate && ev.recurrenceEndDate < toKey ? ev.recurrenceEndDate : toKey;
  const lo = fromKey > first ? fromKey : first;
  if (lo > stop) return out;
  const base = parseDateKey(first);
  const take = (d: Date | null): void => {
    if (!d) return;
    const key = toDateKey(d);
    if (key >= lo && key <= stop) out.push(key);
  };

  if (recurrence === 'daily' || recurrence === 'custom') {
    const step = recurrence === 'daily' ? 1 : normalizeRecurrenceInterval(ev.recurrenceInterval);
    // Calendar days, not 24-hour blocks: DST cannot shift the series.
    const cursor = new Date(base);
    cursor.setDate(cursor.getDate() + Math.max(0, Math.ceil(daysBetweenKeys(first, lo) / step)) * step);
    for (let guard = 0; guard < 100_000 && toDateKey(cursor) <= stop; guard++) {
      take(cursor);
      cursor.setDate(cursor.getDate() + step);
    }
    return out;
  }

  const every = normalizeRecurrenceInterval(ev.recurrenceInterval);
  if (recurrence === 'weekly') {
    const days = new Set(weeklyWeekdays(ev));
    const weekStart = Number.isInteger(ev.recurrenceWeekStart) && (ev.recurrenceWeekStart as number) >= 0 && (ev.recurrenceWeekStart as number) <= 6
      ? ev.recurrenceWeekStart as number
      : 1;
    // Weeks are counted from the week the series starts in, as iCalendar counts them.
    const period = new Date(base);
    period.setDate(period.getDate() - ((period.getDay() - weekStart + 7) % 7));
    const periodKey = toDateKey(period);
    const weeksToRange = Math.max(0, Math.floor(daysBetweenKeys(periodKey, lo) / 7));
    let week = Math.floor(weeksToRange / every) * every;
    for (let guard = 0; guard < 20_000; guard++, week += every) {
      const monday = new Date(period);
      monday.setDate(monday.getDate() + week * 7);
      if (toDateKey(monday) > stop) break;
      for (let i = 0; i < 7; i++) {
        const day = new Date(monday);
        day.setDate(day.getDate() + i);
        if (days.has(day.getDay())) take(day);
      }
    }
    return out;
  }

  const nth = validNth(ev.recurrenceNth) ? ev.recurrenceNth : null;
  const skip = ev.recurrenceMonthEnd === 'skip';
  const loDate = parseDateKey(lo);
  if (recurrence === 'monthly') {
    const monthsToRange = (loDate.getFullYear() - base.getFullYear()) * 12 + (loDate.getMonth() - base.getMonth());
    let k = Math.max(0, Math.floor(monthsToRange / every) * every);
    for (let guard = 0; guard < 20_000; guard++, k += every) {
      const month = new Date(base.getFullYear(), base.getMonth() + k, 1);
      if (toDateKey(month) > stop) break;
      take(nth !== null
        ? nthWeekdayInMonth(month.getFullYear(), month.getMonth(), base.getDay(), nth)
        : dayInMonth(month.getFullYear(), month.getMonth(), base.getDate(), skip));
    }
    return out;
  }

  // Yearly: the same month every N years.
  let k = Math.max(0, Math.floor((loDate.getFullYear() - base.getFullYear()) / every) * every);
  for (let guard = 0; guard < 5_000; guard++, k += every) {
    const year = base.getFullYear() + k;
    if (toDateKey(new Date(year, base.getMonth(), 1)) > stop) break;
    take(nth !== null
      ? nthWeekdayInMonth(year, base.getMonth(), base.getDay(), nth)
      : dayInMonth(year, base.getMonth(), base.getDate(), skip));
  }
  return out;
}

/**
 * The date of the `count`-th occurrence of a series (1 = its first date), skipped dates
 * included — iCalendar's COUNT counts the rule, not what EXDATE leaves of it. Null when the
 * series ends first.
 */
export function nthOccurrenceDate(ev: CalendarEvent, count: number): string | null {
  if (!Number.isInteger(count) || count < 1) return null;
  let seen = 0;
  let from = ev.date;
  for (let chunk = 0; chunk < 40; chunk++) {
    const to = shiftDateKey(from, 5 * 366);
    for (const key of seriesDateKeys(ev, from, to)) {
      seen++;
      if (seen === count) return key;
    }
    if (ev.recurrence === 'none' || (ev.recurrenceEndDate && ev.recurrenceEndDate <= to)) return null;
    from = shiftDateKey(to, 1);
  }
  return null;
}

/** Expand recurring events into concrete occurrences within [start, end] (inclusive, date-only). */
export function expandOccurrences(events: CalendarEvent[], start: Date, end: Date): EventOccurrence[] {
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const excluded = ev.recurrence !== 'none' && Array.isArray(ev.excludedDates) && ev.excludedDates.length
      ? new Set(ev.excludedDates)
      : null;
    for (const key of seriesDateKeys(ev, startKey, endKey)) {
      if (!excluded?.has(key)) out.push({ ...ev, occurrenceDate: key });
    }
  }
  return out.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) return a.occurrenceDate < b.occurrenceDate ? -1 : 1;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

/**
 * Occurrences as the grids draw them: an event over several days appears on EACH day it
 * covers in [start, end] — including one that began before `start` — with `spanDay` naming
 * the day. Every entry keeps `occurrenceDate` (its first day), so opening, moving or skipping
 * it still means that whole occurrence. One-day events come back exactly as
 * `expandOccurrences` gives them.
 */
export function expandDayOccurrences(events: CalendarEvent[], start: Date, end: Date): EventOccurrence[] {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate() - longestSpanDays(events));
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const out: EventOccurrence[] = [];
  for (const o of expandOccurrences(events, from, end)) {
    const span = eventSpanDays(o);
    if (!span) {
      if (o.occurrenceDate >= startKey) out.push(o);
      continue;
    }
    for (let i = 0; i <= span; i++) {
      const day = shiftDateKey(o.occurrenceDate, i);
      if (day >= startKey && day <= endKey) out.push({ ...o, spanDay: day, spanIndex: i, spanDays: span + 1 });
    }
  }
  const dayOf = (o: EventOccurrence): string => o.spanDay ?? o.occurrenceDate;
  return out.sort((a, b) => {
    if (dayOf(a) !== dayOf(b)) return dayOf(a) < dayOf(b) ? -1 : 1;
    // A day an event runs through sits above that day's own events, as the longest bars do.
    const aRuns = a.spanDays ? 0 : 1;
    const bRuns = b.spanDays ? 0 : 1;
    if (aRuns !== bRuns) return aRuns - bRuns;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
}

/**
 * The repeat, span and reminder fields as the store keeps them: only what the rule uses,
 * and nothing that says the same as its absence. The editor, the importer and the exporter all go through
 * it, which is what makes an export → import round trip give back the same event.
 */
export function normalizeEventFields<T extends Omit<CalendarEvent, 'id' | 'createdAt'>>(event: T): T {
  const out: T = { ...event };
  const r = out.recurrence;
  const weekly = r === 'weekly';
  const monthOrYear = r === 'monthly' || r === 'yearly';
  if (!weekly) delete out.recurrenceWeekdays;
  if (!weekly) delete out.recurrenceWeekStart;
  if (!monthOrYear) delete out.recurrenceNth;
  if (!monthOrYear) delete out.recurrenceMonthEnd;
  if (r === 'none' || r === 'daily') delete out.recurrenceInterval;
  else if (r === 'custom') out.recurrenceInterval = normalizeRecurrenceInterval(out.recurrenceInterval);
  else if (out.recurrenceInterval !== undefined) {
    const every = normalizeRecurrenceInterval(out.recurrenceInterval);
    if (every > 1) out.recurrenceInterval = every;
    else delete out.recurrenceInterval;
  }
  if (weekly && isCalendarDateKey(out.date)) {
    const own = parseDateKey(out.date).getDay();
    const days = weeklyWeekdays({ date: out.date, recurrenceWeekdays: [...(out.recurrenceWeekdays ?? []), own] });
    if (days.length > 1) out.recurrenceWeekdays = days;
    else delete out.recurrenceWeekdays;
    const ws = out.recurrenceWeekStart;
    if (!(days.length > 1 && out.recurrenceInterval && Number.isInteger(ws) && ws !== 1 && (ws as number) >= 0 && (ws as number) <= 6)) {
      delete out.recurrenceWeekStart;
    }
  }
  if (monthOrYear) {
    if (!validNth(out.recurrenceNth)) delete out.recurrenceNth;
    const d = isCalendarDateKey(out.date) ? parseDateKey(out.date) : null;
    // The month-end rule only matters on a day some months (or years) lack.
    const lacking = d !== null && (r === 'monthly' ? d.getDate() > 28 : d.getMonth() === 1 && d.getDate() === 29);
    if (out.recurrenceMonthEnd !== 'skip' || out.recurrenceNth || !lacking) delete out.recurrenceMonthEnd;
  }
  if (!eventSpanDays(out)) delete out.endDate;
  // A timed event over several days ends at a time on its last day; without one, that day's end.
  else if (!out.allDay && out.startTime && !out.endTime) out.endTime = '23:59';
  if (out.reminder === 'custom') {
    const exact = reminderLeadMinutes(out);
    if (exact === null) {
      out.reminder = 'none';
      delete out.reminderMinutes;
    } else {
      const fields = reminderForMinutes(exact);
      out.reminder = fields.reminder;
      if (fields.reminderMinutes === undefined) delete out.reminderMinutes;
      else out.reminderMinutes = fields.reminderMinutes;
    }
  } else {
    delete out.reminderMinutes;
  }
  return out;
}

function eventDateTime(ev: CalendarEvent | EventOccurrence): Date {
  const dateStr = 'occurrenceDate' in ev ? (ev as EventOccurrence).occurrenceDate : ev.date;
  const d = parseDateKey(dateStr);
  if (!ev.allDay && ev.startTime) {
    const [h, m] = ev.startTime.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else {
    d.setHours(23, 59, 0, 0);
  }
  return d;
}

function atClock(dateKey: string, hhmm: string | undefined, fallbackHour: number): Date {
  const d = parseDateKey(dateKey);
  if (hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    d.setHours(h || 0, m || 0, 0, 0);
  } else {
    d.setHours(fallbackHour, 0, 0, 0);
  }
  return d;
}

/** When an occurrence starts: its start time, or 09:00 for an all-day event. */
export function occurrenceStartsAt(o: EventOccurrence): number {
  return atClock(o.occurrenceDate, o.allDay ? undefined : o.startTime, ALL_DAY_REMINDER_HOUR).getTime();
}

/**
 * When an occurrence is over: its end time, else its start, else (all-day) the
 * end of its day. A reminder for an event that is over is history, not a nudge.
 * An event over several days is over on its last day.
 */
export function occurrenceEndsAt(o: EventOccurrence): number {
  const span = eventSpanDays(o);
  if (span) {
    const lastDay = shiftDateKey(o.occurrenceDate, span);
    if (o.allDay || !o.startTime || !o.endTime) return atClock(lastDay, '23:59', 0).getTime();
    return atClock(lastDay, o.endTime, 0).getTime();
  }
  if (o.allDay || !o.startTime) return eventDateTime(o).getTime();
  const end = o.endTime && o.endTime >= o.startTime ? o.endTime : o.startTime;
  return atClock(o.occurrenceDate, end, 0).getTime();
}

/** The instant an occurrence's reminder is due, or `null` when it has none. */
export function reminderTriggerAt(o: EventOccurrence): number | null {
  const lead = reminderLeadMinutes(o);
  if (lead === null) return null;
  return occurrenceStartsAt(o) - lead * 60_000;
}

/** The longest run of days any of `events` covers, so a range can reach back to its start. */
function longestSpanDays(events: readonly CalendarEvent[]): number {
  return events.reduce((max, ev) => Math.max(max, eventSpanDays(ev)), 0);
}

/** Ongoing and upcoming occurrences, soonest first — powers the Agenda view and the Home Workspace widget. */
export function getUpcomingOccurrences(limit = 20, withinDays = 60): EventOccurrence[] {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  const list = readList();
  // A trip that began last week is still on.
  const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - longestSpanDays(list));
  const occs = expandOccurrences(list, from, end);
  return occs.filter((o) => occurrenceEndsAt(o) >= now.getTime() - 60_000).slice(0, limit);
}

/** Today's occurrences only. */
export function getTodayOccurrences(): EventOccurrence[] {
  const today = new Date();
  // Including an event over several days that runs through today.
  return expandDayOccurrences(readList(), today, today);
}

/**
 * Reminders whose trigger time has passed for an event that hasn't ended
 * yet. Uses the same trigger and end rules as the reminder scheduler
 * (`calendarReminders.ts`), so the Agenda list and the notification can never
 * disagree about when a reminder was due.
 */
export function getOverdueReminders(withinDays = 14): EventOccurrence[] {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  const list = readList();
  const start = new Date(now);
  start.setDate(start.getDate() - withinDays - longestSpanDays(list));
  const occs = expandOccurrences(list, start, end);
  return occs.filter((o) => {
    const triggerAt = reminderTriggerAt(o);
    if (triggerAt === null) return false;
    if (occurrenceEndsAt(o) < now.getTime()) return false;
    return triggerAt <= now.getTime();
  });
}

/* ------------------------------------------------------------------ *
 * First day of the week.
 * ------------------------------------------------------------------ */

/** 0 = Sunday, 1 = Monday — the only two starts the calendar offers. */
export type WeekStartDay = 0 | 1;
export type WeekStartPref = WeekStartDay | 'auto';

interface LocaleWeekInfo {
  firstDay?: number;
}

/**
 * The locale's own first day, from CLDR via `Intl.Locale#getWeekInfo` (or the
 * older `weekInfo` getter) where the runtime has it, with a fallback for the
 * four UI languages when it does not, matching CLDR: Russian and (mainland)
 * Chinese weeks start on Monday; Japanese and US-English ones on Sunday. The tag is maximized first
 * because the week is a property of the REGION, and `ru` alone names none.
 */
export function localeWeekStart(langTag: string): WeekStartDay {
  try {
    const IntlLocale = (Intl as unknown as { Locale?: new (tag: string) => { maximize(): unknown } }).Locale;
    if (IntlLocale) {
      const full = new IntlLocale(langTag).maximize() as {
        getWeekInfo?: () => LocaleWeekInfo;
        weekInfo?: LocaleWeekInfo;
      };
      const info = typeof full.getWeekInfo === 'function' ? full.getWeekInfo() : full.weekInfo;
      if (info && typeof info.firstDay === 'number') return info.firstDay === 1 ? 1 : 0;
    }
  } catch {
    /* fall through to the table */
  }
  return /^(?:ru|zh)(?:-|$)/i.test(langTag) ? 1 : 0;
}

export function resolveWeekStart(pref: WeekStartPref | undefined, langTag: string): WeekStartDay {
  return pref === 0 || pref === 1 ? pref : localeWeekStart(langTag);
}

/** The first day of `d`'s week, for a week that starts on `weekStart`. */
export function startOfWeekOn(d: Date, weekStart: WeekStartDay): Date {
  const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  out.setDate(out.getDate() - ((out.getDay() - weekStart + 7) % 7));
  return out;
}
