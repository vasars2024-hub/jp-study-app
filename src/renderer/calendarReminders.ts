/**
 * Calendar reminders — the scheduler that makes the Reminder picker do
 * something.
 *
 * Until this module existed the picker in the event form stored `reminder` on
 * every event and the only reader was `getOverdueReminders`, which fills the
 * Agenda's "Overdue reminders" list. Nothing ever fired: no toast, no entry in
 * the Notification Center, no system banner. A reminder the user has to go and
 * look for is not a reminder.
 *
 * The shape follows Reading Lists §11.3 (`main/readingListsReminders.ts`):
 *
 *   · **One evaluation per tick, decided by a pure function.** `evaluate…`
 *     below owns every rule and is proven against a fake clock; the scheduler
 *     owns the clock, the storage and the wire, and nothing else.
 *   · **The fired-state is persisted, not a `Set` in memory.** A reminder that
 *     fired must not fire again after a restart, and one that came due while
 *     the app was closed must be caught up exactly once.
 *
 * It lives in the renderer rather than in main for the reason §11.3 lived in
 * main: the data is here. Calendar events are renderer `localStorage`
 * (`calendar.ts`), which main cannot read. To keep several windows sharing that
 * storage from firing the same reminder once each, only the primary desktop
 * window — the one loaded with a bare query string, the same test
 * `main/debugBridge.ts` uses — runs the scheduler.
 */

import {
  expandOccurrences,
  loadEvents,
  onCalendarChanged,
  occurrenceEndsAt,
  occurrenceStartsAt,
  reminderTriggerAt,
  type CalendarEvent,
  type EventOccurrence,
  type ReminderOffset,
} from './calendar';
import { writeLocalStorage } from './localStorageWrite';

export const CALENDAR_REMINDER_STATE_KEY = 'jp-calendar-reminders-v1';
/** Window event carrying the reminders a tick delivered, for the on-screen card. */
export const CALENDAR_REMINDER_EVENT = 'calendar:reminders';

/** Half a minute: the smallest offset is 5 minutes, so this is never noticeably late. */
export const CALENDAR_REMINDER_TICK_MS = 30_000;
/** How far back a reminder that came due while the app was closed is still worth saying. */
export const CALENDAR_REMINDER_CATCH_UP_MS = 7 * 24 * 60 * 60_000;
/** A reminder delivered more than this after it was due is reported as missed. */
export const CALENDAR_REMINDER_LATE_MS = 2 * 60_000;
/** Fired keys older than this can never be due again (max lead + catch-up) and are pruned. */
const FIRED_RETENTION_MS = 30 * 24 * 60 * 60_000;
const DAY_MS = 24 * 60 * 60_000;

export interface CalendarReminderState {
  /** Reminder key → when it was delivered. */
  fired: Record<string, number>;
  /** The last evaluation, or `null` before the first one ever. */
  lastRunAt: number | null;
}

export interface CalendarReminder {
  key: string;
  eventId: string;
  title: string;
  occurrenceDate: string;
  startTime?: string;
  allDay: boolean;
  reminder: ReminderOffset;
  startsAt: number;
  triggerAt: number;
  /** Came due while the app was not running (or the machine slept), and is late. */
  missed: boolean;
}

/**
 * One key per occurrence, per time, per offset. The time and the offset are in
 * it on purpose: moving an event or choosing a different reminder re-arms it,
 * because the reminder the user now asked for has not been given yet.
 */
export function calendarReminderKey(o: EventOccurrence): string {
  return `${o.id}|${o.occurrenceDate}|${o.allDay ? 'all-day' : (o.startTime ?? '')}|${o.reminder}`;
}

export function emptyCalendarReminderState(): CalendarReminderState {
  return { fired: {}, lastRunAt: null };
}

export function normalizeCalendarReminderState(value: unknown): CalendarReminderState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return emptyCalendarReminderState();
  const raw = value as Record<string, unknown>;
  const fired: Record<string, number> = {};
  if (typeof raw.fired === 'object' && raw.fired !== null && !Array.isArray(raw.fired)) {
    for (const [key, at] of Object.entries(raw.fired as Record<string, unknown>)) {
      if (typeof at === 'number' && Number.isFinite(at)) fired[key] = at;
    }
  }
  const lastRunAt = typeof raw.lastRunAt === 'number' && Number.isFinite(raw.lastRunAt) ? raw.lastRunAt : null;
  return { fired, lastRunAt };
}

function toReminder(o: EventOccurrence, triggerAt: number, missed: boolean): CalendarReminder {
  return {
    key: calendarReminderKey(o),
    eventId: o.id,
    title: o.title,
    occurrenceDate: o.occurrenceDate,
    startTime: o.allDay ? undefined : o.startTime,
    allDay: Boolean(o.allDay),
    reminder: o.reminder,
    startsAt: occurrenceStartsAt(o),
    triggerAt,
    missed,
  };
}

/**
 * Every rule, and no I/O.
 *
 * For each occurrence (recurring ones expanded) whose reminder is due and was
 * never delivered:
 *
 *   · **The event is not over yet** — deliver it. It is `missed` only when it
 *     came due after the previous evaluation (so the app was closed or the
 *     machine asleep when it should have fired) and we are noticeably late. A
 *     reminder that was due BEFORE the last evaluation and still unfired is an
 *     event created or edited after its trigger time: late by the user's own
 *     hand, not missed.
 *   · **The event is over** — deliver it, as missed, only if it came due since
 *     the previous evaluation and within the catch-up window. That is the
 *     "caught up once on launch" rule, and the fired record is what makes it
 *     once. Before any evaluation has ever run there is no gap to catch up: a
 *     first launch never dumps a history of old reminders on the user.
 *
 * Missed reminders of one recurring event collapse to the latest occurrence —
 * a daily reminder over a week away is one thing to say, not seven — but every
 * collapsed key is still recorded, so none of them comes back later.
 */
export function evaluateCalendarReminders(input: {
  events: readonly CalendarEvent[];
  now: number;
  state: CalendarReminderState;
}): { due: CalendarReminder[]; state: CalendarReminderState } {
  const { events, now } = input;
  const state = input.state;
  const gapStart = state.lastRunAt ?? now;
  const from = new Date(now - CALENDAR_REMINDER_CATCH_UP_MS - DAY_MS);
  // The largest offset is one day, so an occurrence two days out can already be due.
  const to = new Date(now + 2 * DAY_MS);
  const occurrences = expandOccurrences(events.filter((e) => e.reminder && e.reminder !== 'none'), from, to);

  const fired = { ...state.fired };
  const current: CalendarReminder[] = [];
  const missedByEvent = new Map<string, CalendarReminder>();

  for (const o of occurrences) {
    const triggerAt = reminderTriggerAt(o);
    if (triggerAt === null || triggerAt > now) continue;
    const key = calendarReminderKey(o);
    if (fired[key] !== undefined) continue;
    const cameDueInGap = triggerAt > gapStart;
    const over = occurrenceEndsAt(o) < now;
    if (over) {
      if (!cameDueInGap || triggerAt < now - CALENDAR_REMINDER_CATCH_UP_MS) continue;
      fired[key] = now;
      const reminder = toReminder(o, triggerAt, true);
      const kept = missedByEvent.get(o.id);
      if (!kept || kept.startsAt < reminder.startsAt) missedByEvent.set(o.id, reminder);
      continue;
    }
    fired[key] = now;
    const late = now - triggerAt > CALENDAR_REMINDER_LATE_MS;
    current.push(toReminder(o, triggerAt, cameDueInGap && late));
  }

  for (const [key, at] of Object.entries(fired)) {
    if (now - at > FIRED_RETENTION_MS) delete fired[key];
  }

  const due = [...missedByEvent.values(), ...current].sort((a, b) => a.startsAt - b.startsAt);
  return { due, state: { fired, lastRunAt: now } };
}

/* ------------------------------------------------------------------ *
 * The scheduler — clock, storage and wire.
 * ------------------------------------------------------------------ */

export interface CalendarReminderStorage {
  read(): string | null;
  write(text: string): void;
}

export interface CalendarReminderSchedulerDeps {
  now?: () => number;
  loadEvents?: () => CalendarEvent[];
  storage?: CalendarReminderStorage;
  deliver: (due: CalendarReminder[]) => void;
  /** Re-evaluate as soon as the calendar changes, not only on the next tick. */
  subscribe?: (onChange: () => void) => () => void;
}

export interface CalendarReminderScheduler {
  tick(): CalendarReminder[];
  start(): void;
  stop(): void;
}

const localStorageBacked: CalendarReminderStorage = {
  read: () => {
    try {
      return localStorage.getItem(CALENDAR_REMINDER_STATE_KEY);
    } catch {
      return null;
    }
  },
  // Refused (storage full): reported, and the reminder may repeat; the guarded
  // writer never throws, so it will never crash the tick.
  write: (text) => {
    writeLocalStorage(CALENDAR_REMINDER_STATE_KEY, text);
  },
};

export function createCalendarReminderScheduler(deps: CalendarReminderSchedulerDeps): CalendarReminderScheduler {
  const now = deps.now ?? (() => Date.now());
  const readEvents = deps.loadEvents ?? loadEvents;
  const storage = deps.storage ?? localStorageBacked;
  let timer: ReturnType<typeof setInterval> | null = null;
  let unsubscribe: (() => void) | null = null;

  const self: CalendarReminderScheduler = {
    tick: () => {
      let state: CalendarReminderState;
      try {
        const raw = storage.read();
        state = normalizeCalendarReminderState(raw ? JSON.parse(raw) : null);
      } catch {
        state = emptyCalendarReminderState();
      }
      const result = evaluateCalendarReminders({ events: readEvents(), now: now(), state });
      // Recorded BEFORE delivery, as §11.3 does: a delivery that throws must not
      // leave the reminder unrecorded and due again on the very next tick.
      storage.write(JSON.stringify(result.state));
      if (result.due.length) {
        try {
          deps.deliver(result.due);
        } catch {
          /* A window mid-teardown; the reminder is recorded either way. */
        }
      }
      return result.due;
    },
    start: () => {
      if (timer) return;
      // An immediate tick, unlike §11.3's: this is where the launch catch-up
      // happens, and a reminder due now should not wait half a minute.
      self.tick();
      timer = setInterval(() => {
        try {
          self.tick();
        } catch {
          /* A tick that throws must not kill the interval. */
        }
      }, CALENDAR_REMINDER_TICK_MS);
      unsubscribe = deps.subscribe?.(() => {
        try {
          self.tick();
        } catch {
          /* ignore */
        }
      }) ?? null;
    },
    stop: () => {
      if (timer) clearInterval(timer);
      timer = null;
      unsubscribe?.();
      unsubscribe = null;
    },
  };
  return self;
}

/** The main desktop window loads with a bare query string; every other window is tagged. */
export function isPrimaryShellWindow(search: string = typeof window === 'undefined' ? '?x' : window.location.search): boolean {
  return new URLSearchParams(search).toString() === '';
}

let installed: CalendarReminderScheduler | null = null;

/**
 * Start the app's one scheduler. Called once at boot; a no-op in every window
 * but the primary desktop, so reminders are never fired once per window.
 */
export function installCalendarReminders(deliver: (due: CalendarReminder[]) => void): CalendarReminderScheduler | null {
  if (installed || !isPrimaryShellWindow()) return installed;
  installed = createCalendarReminderScheduler({ deliver, subscribe: onCalendarChanged });
  installed.start();
  return installed;
}
