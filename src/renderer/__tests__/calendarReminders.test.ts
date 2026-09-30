// @vitest-environment jsdom
/**
 * Calendar reminders fire. Before `calendarReminders.ts` the Reminder picker was
 * stored and read only by the Agenda's "Overdue reminders" list — no timer, no
 * notification, no card. These drive the real scheduler with fake timers and a
 * real (jsdom) localStorage, so "fires once", "survives a restart" and "catches
 * up once" are asserted as behaviour, not as source text.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CalendarEvent } from '../calendar';
import { getOverdueReminders, getUpcomingOccurrences } from '../calendar';
import { LS_KEYS } from '../storage/storage';
import {
  CALENDAR_REMINDER_STATE_KEY,
  CALENDAR_REMINDER_TICK_MS,
  createCalendarReminderScheduler,
  evaluateCalendarReminders,
  emptyCalendarReminderState,
  isPrimaryShellWindow,
  type CalendarReminder,
} from '../calendarReminders';

const MIN = 60_000;

function event(patch: Partial<CalendarEvent> & { id: string }): CalendarEvent {
  return {
    title: patch.id,
    date: '2026-09-15',
    startTime: '10:00',
    endTime: '11:00',
    color: '#fff',
    category: 'study',
    reminder: '15m',
    recurrence: 'none',
    createdAt: 0,
    ...patch,
  };
}

/** One "launch": a fresh scheduler over the same persisted storage. */
function launch(events: CalendarEvent[], delivered: CalendarReminder[][]) {
  return createCalendarReminderScheduler({
    loadEvents: () => events,
    deliver: (due) => delivered.push(due),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('calendar reminders — the scheduler', () => {
  it('fires at the chosen offset, not before and not twice', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 9, 30));
    const delivered: CalendarReminder[][] = [];
    const scheduler = launch([event({ id: 'exam', reminder: '15m' })], delivered);
    scheduler.start();
    expect(delivered).toEqual([]);

    // 09:44:30 — still 30 s early.
    vi.advanceTimersByTime(14 * MIN + 30_000);
    expect(delivered).toEqual([]);

    // 09:45 is the trigger; the next tick delivers it.
    vi.advanceTimersByTime(CALENDAR_REMINDER_TICK_MS);
    expect(delivered.flat().map((r) => r.eventId)).toEqual(['exam']);
    expect(delivered.flat()[0].missed).toBe(false);

    vi.advanceTimersByTime(10 * MIN);
    expect(delivered.flat()).toHaveLength(1);
    scheduler.stop();
  });

  it('fires each occurrence of a recurring event', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 9, 0));
    const delivered: CalendarReminder[][] = [];
    const scheduler = launch(
      [event({ id: 'daily', date: '2026-09-01', recurrence: 'daily', reminder: '5m' })],
      delivered,
    );
    scheduler.start();
    vi.advanceTimersByTime(60 * MIN); // past today's 09:55
    vi.advanceTimersByTime(24 * 60 * MIN); // past tomorrow's 09:55
    expect(delivered.flat().map((r) => r.occurrenceDate)).toEqual(['2026-09-15', '2026-09-16']);
    scheduler.stop();
  });

  it('does not fire again after a restart', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 9, 50));
    const events = [event({ id: 'exam', reminder: '15m' })];
    const first: CalendarReminder[][] = [];
    const a = launch(events, first);
    a.start();
    expect(first.flat()).toHaveLength(1);
    a.stop();

    const second: CalendarReminder[][] = [];
    const b = launch(events, second);
    b.start();
    vi.advanceTimersByTime(5 * MIN);
    expect(second).toEqual([]);
    b.stop();
    expect(JSON.parse(localStorage.getItem(CALENDAR_REMINDER_STATE_KEY) ?? '{}').fired).toBeTruthy();
  });

  it('catches up a reminder missed while the app was closed, once, and says it was missed', () => {
    const events = [event({ id: 'exam', startTime: '10:00', endTime: '11:00', reminder: '1h' })];
    // Last seen the evening before.
    vi.setSystemTime(new Date(2026, 8, 14, 20, 0));
    const before = launch(events, []);
    before.start();
    before.stop();

    // Relaunched at noon, after the event is over.
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
    const delivered: CalendarReminder[][] = [];
    const after = launch(events, delivered);
    after.start();
    expect(delivered.flat().map((r) => [r.eventId, r.missed])).toEqual([['exam', true]]);
    after.stop();

    const again: CalendarReminder[][] = [];
    const third = launch(events, again);
    third.start();
    expect(again).toEqual([]);
    third.stop();
  });

  it('a first launch ever does not dump old reminders', () => {
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
    const delivered: CalendarReminder[][] = [];
    const s = launch([event({ id: 'past', reminder: '15m' })], delivered);
    s.start();
    expect(delivered).toEqual([]);
    s.stop();
  });

  it('collapses a recurring event missed over several days to one card', () => {
    const events = [event({ id: 'daily', date: '2026-09-01', recurrence: 'daily', reminder: '5m' })];
    vi.setSystemTime(new Date(2026, 8, 10, 20, 0));
    const before = launch(events, []);
    before.start();
    before.stop();
    vi.setSystemTime(new Date(2026, 8, 15, 12, 0));
    const delivered: CalendarReminder[][] = [];
    const after = launch(events, delivered);
    after.start();
    const all = delivered.flat();
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ eventId: 'daily', occurrenceDate: '2026-09-15', missed: true });
    after.stop();
  });

  it('an event created after its trigger time is reminded now, not reported as missed', () => {
    const now = new Date(2026, 8, 15, 9, 55).getTime();
    const result = evaluateCalendarReminders({
      events: [event({ id: 'late', reminder: '1d' })],
      now,
      state: { ...emptyCalendarReminderState(), lastRunAt: now - 30_000 },
    });
    expect(result.due.map((r) => [r.eventId, r.missed])).toEqual([['late', false]]);
  });

  it('an all-day event is reminded on the morning, not at midnight', () => {
    const at = (h: number, m = 0) => new Date(2026, 8, 15, h, m).getTime();
    const events = [event({ id: 'day', allDay: true, startTime: undefined, endTime: undefined, reminder: 'at' })];
    const early = evaluateCalendarReminders({ events, now: at(8, 59), state: { fired: {}, lastRunAt: at(8, 58) } });
    expect(early.due).toEqual([]);
    const morning = evaluateCalendarReminders({ events, now: at(9, 0), state: early.state });
    expect(morning.due.map((r) => r.eventId)).toEqual(['day']);
  });

  it('only the primary desktop window runs the scheduler', () => {
    expect(isPrimaryShellWindow('')).toBe(true);
    expect(isPrimaryShellWindow('?popout=calendar')).toBe(false);
    expect(isPrimaryShellWindow('?blanc=1')).toBe(false);
    expect(isPrimaryShellWindow('?desk=1&displayKey=x')).toBe(false);
  });
});

describe('calendar — overdue agenda reminders', () => {
  it.each(['none', 'daily'] as const)('keeps a %s study session visible until its end', (recurrence) => {
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify([
      event({ id: 'study', recurrence, date: recurrence === 'daily' ? '2026-09-01' : '2026-09-15' }),
    ]));
    const ids = () => getOverdueReminders().map((o) => [o.id, o.occurrenceDate]);
    vi.setSystemTime(new Date(2026, 8, 15, 9, 44));
    expect(ids()).toEqual([]);
    vi.setSystemTime(new Date(2026, 8, 15, 9, 45));
    expect(ids()).toEqual([['study', '2026-09-15']]);
    vi.setSystemTime(new Date(2026, 8, 15, 10, 30));
    expect(ids()).toEqual([['study', '2026-09-15']]);
    vi.setSystemTime(new Date(2026, 8, 15, 11, 1));
    expect(ids()).toEqual([]);
  });

  it('keeps all-day reminders but excludes ended and unreminded events', () => {
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify([
      event({ id: 'all-day', allDay: true, reminder: 'at' }),
      event({ id: 'no-end', endTime: undefined }),
      event({ id: 'ended', endTime: '10:15' }),
      event({ id: 'no-reminder', reminder: 'none' }),
    ]));
    vi.setSystemTime(new Date(2026, 8, 15, 10, 30));
    expect(getOverdueReminders().map((o) => o.id)).toEqual(['all-day']);
  });
});

describe('calendar — upcoming occurrences', () => {
  it.each(['none', 'daily'] as const)('keeps ongoing %s sessions in the widget until they finish', (recurrence) => {
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify([
      event({ id: 'study', recurrence, date: recurrence === 'daily' ? '2026-09-01' : '2026-09-15', reminder: 'none' }),
    ]));
    vi.setSystemTime(new Date(2026, 8, 15, 10, 30));
    expect(getUpcomingOccurrences(4, 0).map((o) => [o.id, o.occurrenceDate]))
      .toEqual([['study', '2026-09-15']]);
    vi.setSystemTime(new Date(2026, 8, 15, 11, 2));
    expect(getUpcomingOccurrences(4, 0)).toEqual([]);
  });

  it('filters finished events before limiting, retaining all-day and future events', () => {
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify([
      event({ id: 'finished', startTime: '08:00', endTime: '09:00' }),
      event({ id: 'no-end', endTime: undefined }),
      event({ id: 'all-day', allDay: true, startTime: undefined }),
      event({ id: 'future', startTime: '12:00', endTime: '13:00' }),
    ]));
    vi.setSystemTime(new Date(2026, 8, 15, 10, 30));
    expect(getUpcomingOccurrences(2, 0).map((o) => o.id)).toEqual(['all-day', 'future']);
  });
});

describe('calendar — first day of the week', () => {
  it('follows the locale unless the user chose', async () => {
    const { localeWeekStart, resolveWeekStart, startOfWeekOn } = await import('../calendar');
    expect(localeWeekStart('ru')).toBe(1);
    expect(localeWeekStart('en')).toBe(0);
    expect(localeWeekStart('ja')).toBe(0);
    expect(resolveWeekStart(0, 'ru')).toBe(0);
    expect(resolveWeekStart('auto', 'ru')).toBe(1);
    // Wednesday 2026-09-16.
    const wed = new Date(2026, 8, 16, 15, 0);
    expect(startOfWeekOn(wed, 0).getDate()).toBe(13);
    expect(startOfWeekOn(wed, 1).getDate()).toBe(14);
    // A Sunday in a Monday-first week belongs to the week that began six days earlier.
    expect(startOfWeekOn(new Date(2026, 8, 20), 1).getDate()).toBe(14);
  });
});
