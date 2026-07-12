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
  createdAt: number;
}

const KEY = LS_KEYS.calendarEvents;
const EVENT = 'calendar-events-changed';

export const CATEGORY_LABELS: Record<EventCategory, string> = {
  study: 'Study Session',
  exam: 'Exam',
  assignment: 'Assignment',
  reminder: 'Reminder',
  personal: 'Personal',
};

export const CATEGORY_COLORS: Record<EventCategory, string> = {
  study: '#6c7bff',
  exam: '#ff2e4d',
  assignment: '#ff9f43',
  reminder: '#2ecf9f',
  personal: '#b98cff',
};

export const REMINDER_LABELS: Record<ReminderOffset, string> = {
  none: 'No reminder',
  at: 'At event time',
  '5m': '5 minutes before',
  '15m': '15 minutes before',
  '30m': '30 minutes before',
  '1h': '1 hour before',
  '1d': '1 day before',
};

const REMINDER_MINUTES: Record<ReminderOffset, number> = {
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

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

/** One concrete occurrence of an event on a specific calendar date. */
export interface EventOccurrence extends CalendarEvent {
  occurrenceDate: string;
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
    const stopKey = ev.recurrenceEndDate && ev.recurrenceEndDate < endKey ? ev.recurrenceEndDate : endKey;
    const cursor = new Date(base);
    // Fast-forward the cursor to the first occurrence on/after `start` so long
    // ranges (e.g. a daily event created a year ago) don't require iterating
    // from the beginning of time.
    const stepDays =
      ev.recurrence === 'daily' ? 1 : ev.recurrence === 'weekly' ? 7 : ev.recurrence === 'custom' ? Math.max(1, ev.recurrenceInterval ?? 1) : 0;
    if (ev.recurrence === 'monthly') {
      const cur = new Date(base);
      let guard = 0;
      while (toDateKey(cur) <= stopKey && guard < 1200) {
        const key = toDateKey(cur);
        if (key >= startKey && key <= stopKey) out.push({ ...ev, occurrenceDate: key });
        cur.setMonth(cur.getMonth() + 1);
        guard++;
      }
      continue;
    }
    if (stepDays > 0) {
      let guard = 0;
      while (toDateKey(cursor) <= stopKey && guard < 3660) {
        const key = toDateKey(cursor);
        if (key >= startKey && key <= stopKey) out.push({ ...ev, occurrenceDate: key });
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

/** Upcoming occurrences from now, soonest first — powers the Agenda view and the Home Workspace widget. */
export function getUpcomingOccurrences(limit = 20, withinDays = 60): EventOccurrence[] {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  const occs = expandOccurrences(readList(), now, end);
  return occs.filter((o) => eventDateTime(o).getTime() >= now.getTime() - 60_000).slice(0, limit);
}

/** Today's occurrences only. */
export function getTodayOccurrences(): EventOccurrence[] {
  const today = new Date();
  return expandOccurrences(readList(), today, today);
}

/** Reminders whose trigger time has passed for an event that hasn't happened yet. */
export function getOverdueReminders(withinDays = 14): EventOccurrence[] {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + withinDays);
  const start = new Date(now);
  start.setDate(start.getDate() - withinDays);
  const occs = expandOccurrences(readList(), start, end);
  return occs.filter((o) => {
    if (o.reminder === 'none') return false;
    const at = eventDateTime(o);
    if (at.getTime() < now.getTime()) return false; // event already happened
    const triggerAt = new Date(at.getTime() - REMINDER_MINUTES[o.reminder] * 60_000);
    return triggerAt.getTime() <= now.getTime();
  });
}
