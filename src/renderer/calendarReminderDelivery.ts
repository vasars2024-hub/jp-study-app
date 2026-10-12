/**
 * Where a due calendar reminder goes: the Notification Center (history, badge,
 * sound), the on-screen reminder card (`CalendarReminderHost`, mounted in
 * `ToastHost`), and — only while the app window is not focused — a system
 * notification, because a card drawn in a window nobody is looking at reminds
 * nobody.
 */
import { CALENDAR_REMINDER_EVENT, type CalendarReminder } from './calendarReminders';
import { dndUntil, isDnd, notify, onNotificationsChanged, quietHoursEndAt } from './notificationStore';
import { getUiLang, t } from './i18n';
import { LANG_TAGS } from '../shared/i18n/core';
import { clockHour12, loadDesktopPrefs } from './desktopPrefs';
import { openSectionSurface } from './sectionSurface';
import { runWhenUnlocked } from './appLockState';

function dayIndex(ms: number): number {
  const d = new Date(ms);
  return Math.round(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

function capitalizeFirst(text: string, tag: string): string {
  return text ? text.charAt(0).toLocaleUpperCase(tag) + text.slice(1) : text;
}

/** "Today, 14:00" / "Tomorrow, 9:00 AM" / "Mon, Sep 29, 14:00" — in the UI language. */
export function describeCalendarReminder(
  reminder: CalendarReminder,
  now: number = Date.now(),
): { title: string; body: string } {
  const tag = LANG_TAGS[getUiLang()];
  const diff = dayIndex(reminder.startsAt) - dayIndex(now);
  let date: string;
  if (Math.abs(diff) <= 1) {
    date = capitalizeFirst(new Intl.RelativeTimeFormat(tag, { numeric: 'auto' }).format(diff, 'day'), tag);
  } else {
    date = new Date(reminder.startsAt).toLocaleDateString(tag, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  let hour12: boolean | undefined;
  try {
    hour12 = clockHour12(loadDesktopPrefs().clock24h);
  } catch {
    hour12 = undefined;
  }
  const body = reminder.allDay
    ? t('calendar.reminder.body.allDay', { date })
    : t('calendar.reminder.body.timed', {
        date,
        time: new Date(reminder.startsAt).toLocaleTimeString(tag, { hour: 'numeric', minute: '2-digit', hour12 }),
      });
  const title = reminder.missed ? t('calendar.reminder.missedTitle', { title: reminder.title }) : reminder.title;
  return { title, body };
}

function windowIsFocused(): boolean {
  try {
    return typeof document !== 'undefined' && document.hasFocus();
  } catch {
    return true;
  }
}

function showSystemNotification(title: string, body: string): void {
  try {
    const Ctor = (window as unknown as { Notification?: typeof Notification }).Notification;
    if (typeof Ctor !== 'function') return;
    const banner = new Ctor(title, { body });
    banner.onclick = () => {
      try {
        window.focus();
      } catch {
        /* ignore */
      }
      openSectionSurface('calendar');
    };
  } catch {
    // No notification service, or permission refused: the Notification Center
    // entry and the card are already there.
  }
}

/** A held reminder is still worth a card this long after its event started. */
const HELD_RELEVANCE_MS = 2 * 60 * 60_000;
let held: CalendarReminder[] = [];
let heldTimer: ReturnType<typeof setTimeout> | null = null;

/** Listening for Do not disturb being switched off while something is held. */
let stopWatchingDnd: (() => void) | null = null;

/** Cards for reminders held back by quiet time, once it is over; stale ones are dropped. */
function releaseHeldReminders(now = Date.now()): CalendarReminder[] {
  if (heldTimer) clearTimeout(heldTimer);
  heldTimer = null;
  stopWatchingDnd?.();
  stopWatchingDnd = null;
  const still = held
    .filter((reminder) => reminder.startsAt > now - HELD_RELEVANCE_MS)
    // It came due while the user was not to be disturbed: say so.
    .map((reminder) => ({ ...reminder, missed: reminder.missed || reminder.startsAt < now }));
  held = [];
  return still;
}

/** Show what was held, now that nothing is quiet any more. */
function flushHeldReminders(at: number): void {
  const due = releaseHeldReminders(at);
  if (due.length) window.dispatchEvent(new CustomEvent<CalendarReminder[]>(CALENDAR_REMINDER_EVENT, { detail: due }));
}

/**
 * Wake when the quiet period ends. A timed period or the nightly window has a known end,
 * so a timer covers it; the manual switch has none, so the held cards also wait for the
 * switch itself — every Do not disturb change goes through the notification store's
 * change event — and appear the moment it is turned off, not at the next reminder.
 */
function scheduleHeldRelease(now: number): void {
  if (!stopWatchingDnd) {
    stopWatchingDnd = onNotificationsChanged(() => {
      const at = Date.now();
      if (held.length && !isDnd(at)) flushHeldReminders(at);
    });
  }
  const until = Math.max(dndUntil(now) ?? 0, quietHoursEndAt(now) ?? 0);
  if (!until) return;
  if (heldTimer) clearTimeout(heldTimer);
  heldTimer = setTimeout(() => {
    heldTimer = null;
    const at = Date.now();
    if (isDnd(at)) {
      scheduleHeldRelease(at);
      return;
    }
    flushHeldReminders(at);
  }, Math.max(0, until - now) + 1_000);
}

/**
 * Every due reminder is recorded in the Notification Center. What interrupts is gated:
 *
 *   · **Do not disturb / quiet hours** (`isDnd`, which includes the nightly schedule): no
 *     system banner and no on-screen card while it lasts — the entry waits in the center,
 *     unsounded and without a badge, as every other informational notice does under DND.
 *     The card is HELD, not dropped: when the quiet period ends it appears (marked missed)
 *     unless its event is long over.
 *   · **Locked** (risk4): an OS banner would read the event past the PIN pad, so it waits
 *     for the unlock; the in-app entry and card sit behind the lock screen anyway.
 */
export function deliverCalendarReminders(due: readonly CalendarReminder[]): void {
  if (!due.length) return;
  const now = Date.now();
  const focused = windowIsFocused();
  const quiet = isDnd(now);
  for (const reminder of due) {
    const { title, body } = describeCalendarReminder(reminder, now);
    notify({
      id: `calendar-reminder:${reminder.key}`,
      title,
      message: body,
      kind: reminder.missed ? 'warning' : 'info',
      source: 'calendar',
      clientAction: 'open-calendar',
    });
    if (!focused && !quiet) runWhenUnlocked(`calendar-banner:${reminder.key}`, () => showSystemNotification(title, body));
  }
  if (quiet) {
    const keys = new Set(due.map((reminder) => reminder.key));
    held = [...held.filter((reminder) => !keys.has(reminder.key)), ...due];
    scheduleHeldRelease(now);
    return;
  }
  const earlier = releaseHeldReminders(now).filter((reminder) => !due.some((next) => next.key === reminder.key));
  window.dispatchEvent(new CustomEvent<CalendarReminder[]>(CALENDAR_REMINDER_EVENT, { detail: [...earlier, ...due] }));
}
