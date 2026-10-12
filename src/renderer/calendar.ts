// Calendar events store — Month/Week/Day/Agenda views in CalendarView.tsx and
// the lightweight Home Workspace widget both read through this module. Same
// localStorage-cache + IndexedDB-mirror persistence pattern as flashcardDeck.ts.

import { IDB_KEYS, LS_KEYS, mirrorToIdb } from './storage/storage';

export type EventCategory = 'study' | 'exam' | 'assignment' | 'reminder' | 'personal';
export type RecurrenceFreq = 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
export type ReminderOffset = 'none' | 'at' | '5m' | '15m' | '30m' | '1h' | '1d';

export interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  /** ISO date, 'YYYY-MM-DD'. */
  date: string;
  /** 'HH:MM' 24h, undefined when allDay. */
  startTime?: string;
  endTime?: string;
  allDay?: boolean;
  color: string;
  category: EventCategory;
  reminder: ReminderOffset;
  recurrence: RecurrenceFreq;
  /** Days between occurrences, only used when recurrence === 'custom'. */
  recurrenceInterval?: number;
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
};

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
  const { recurrenceInterval: _i, recurrenceEndDate: _e, excludedDates: _x, icsUid: _u, ...rest } = payload;
  return { ...rest, recurrence: 'none' };
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
  event: Pick<CalendarEvent, 'date' | 'recurrence' | 'recurrenceEndDate'>,
  fromDate: string,
  toDate: string,
): Pick<CalendarEvent, 'date'> & Partial<Pick<CalendarEvent, 'recurrenceEndDate'>> | null {
  if (!isCalendarDateKey(fromDate) || !isCalendarDateKey(toDate)) return null;
  const delta = daysBetweenKeys(fromDate, toDate);
  if (delta === 0) return null;
  if (event.recurrence === 'none') return { date: toDate };
  return {
    date: shiftDateKey(event.date, delta),
    ...(event.recurrenceEndDate ? { recurrenceEndDate: shiftDateKey(event.recurrenceEndDate, delta) } : {}),
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
    recurrenceInterval: _interval,
    recurrenceEndDate: _end,
    excludedDates: _excluded,
    ...rest
  } = event;
  return {
    seriesPatch: { excludedDates },
    single: { ...rest, date: toDate, recurrence: 'none' },
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
  occurrenceDate: string;
}

/** Custom repeats use whole calendar days, including when loading older events. */
export function normalizeRecurrenceInterval(value = 1): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value)) : 1;
}

/** Expand recurring events into concrete occurrences within [start, end] (inclusive, date-only). */
export function expandOccurrences(events: CalendarEvent[], start: Date, end: Date): EventOccurrence[] {
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const out: EventOccurrence[] = [];
  for (const ev of events) {
    const base = parseDateKey(ev.date);
    if (ev.recurrence === 'none') {
      if (ev.date >= startKey && ev.date <= endKey) out.push({ ...ev, occurrenceDate: ev.date });
      continue;
    }
    const excluded = Array.isArray(ev.excludedDates) && ev.excludedDates.length ? new Set(ev.excludedDates) : null;
    const push = (key: string): void => {
      if (!excluded?.has(key)) out.push({ ...ev, occurrenceDate: key });
    };
    const stopKey = ev.recurrenceEndDate && ev.recurrenceEndDate < endKey ? ev.recurrenceEndDate : endKey;
    const cursor = new Date(base);
    const stepDays =
      ev.recurrence === 'daily' ? 1 : ev.recurrence === 'weekly' ? 7 : ev.recurrence === 'custom' ? normalizeRecurrenceInterval(ev.recurrenceInterval) : 0;
    if (ev.recurrence === 'monthly') {
      const cur = new Date(base);
      let guard = 0;
      while (toDateKey(cur) <= stopKey && guard < 1200) {
        const key = toDateKey(cur);
        if (key >= startKey && key <= stopKey) push(key);
        // Clamp to the next month's last day without losing the original day.
        // Advancing Jan 31 directly with setMonth would skip February entirely.
        cur.setMonth(cur.getMonth() + 1, 1);
        const lastDay = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
        cur.setDate(Math.min(base.getDate(), lastDay));
        guard++;
      }
      continue;
    }
    if (stepDays > 0) {
      // Skip past occurrences before applying the iteration limit. Count local
      // calendar dates via UTC components so DST and `start`'s time of day
      // cannot shift the recurrence or skip an occurrence on the first day.
      const daysToStart = (Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())
        - Date.UTC(base.getFullYear(), base.getMonth(), base.getDate())) / 86_400_000;
      const skipped = Math.max(0, Math.ceil(daysToStart / stepDays));
      cursor.setDate(cursor.getDate() + skipped * stepDays);
      let guard = 0;
      while (toDateKey(cursor) <= stopKey && guard < 3660) {
        const key = toDateKey(cursor);
        if (key >= startKey && key <= stopKey) push(key);
        cursor.setDate(cursor.getDate() + stepDays);
        guard++;
      }
    }
  }
  return out.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) return a.occurrenceDate < b.occurrenceDate ? -1 : 1;
    return (a.startTime ?? '').localeCompare(b.startTime ?? '');
  });
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
 */
export function occurrenceEndsAt(o: EventOccurrence): number {
  if (o.allDay || !o.startTime) return eventDateTime(o).getTime();
  const end = o.endTime && o.endTime >= o.startTime ? o.endTime : o.startTime;
  return atClock(o.occurrenceDate, end, 0).getTime();
}

/** The instant an occurrence's reminder is due, or `null` when it has none. */
export function reminderTriggerAt(o: EventOccurrence): number | null {
  if (!o.reminder || o.reminder === 'none' || !(o.reminder in REMINDER_MINUTES)) return null;
  return occurrenceStartsAt(o) - REMINDER_MINUTES[o.reminder] * 60_000;
}

/** Ongoing and upcoming occurrences, soonest first — powers the Agenda view and the Home Workspace widget. */
export function getUpcomingOccurrences(limit = 20, withinDays = 60): EventOccurrence[] {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  const occs = expandOccurrences(readList(), now, end);
  return occs.filter((o) => occurrenceEndsAt(o) >= now.getTime() - 60_000).slice(0, limit);
}

/** Today's occurrences only. */
export function getTodayOccurrences(): EventOccurrence[] {
  const today = new Date();
  return expandOccurrences(readList(), today, today);
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
  const start = new Date(now);
  start.setDate(start.getDate() - withinDays);
  const occs = expandOccurrences(readList(), start, end);
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
