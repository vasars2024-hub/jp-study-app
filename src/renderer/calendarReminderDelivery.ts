/**
 * Where a due calendar reminder goes: the Notification Center (history, badge,
 * sound), the on-screen reminder card (`CalendarReminderHost`, mounted in
 * `ToastHost`), and — only while the app window is not focused — a system
 * notification, because a card drawn in a window nobody is looking at reminds
 * nobody.
 */
import { CALENDAR_REMINDER_EVENT, type CalendarReminder } from './calendarReminders';
import { notify } from './notificationStore';
import { getUiLang, t } from './i18n';
import { LANG_TAGS } from '../shared/i18n/core';
import { clockHour12, loadDesktopPrefs } from './desktopPrefs';
import { openSectionSurface } from './sectionSurface';

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

export function deliverCalendarReminders(due: readonly CalendarReminder[]): void {
  if (!due.length) return;
  const now = Date.now();
  const focused = windowIsFocused();
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
    if (!focused) showSystemNotification(title, body);
  }
  window.dispatchEvent(new CustomEvent<CalendarReminder[]>(CALENDAR_REMINDER_EVENT, { detail: [...due] }));
}
