/**
 * The on-screen half of a calendar reminder.
 *
 * Mounted inside `ToastHost` beside Reading Lists' reminder card, for the reason
 * that file gives: it is the one place every shell mounts exactly once. It
 * renders nothing until the scheduler (`calendarReminders.ts`) delivers.
 *
 * A reminder stays until it is answered — it is not a toast that expires while
 * the user is looking at another window. Open calendar and × both dismiss it;
 * the Notification Center keeps the history either way. Snooze puts it off (5 or
 * 15 minutes, an hour, or until the event starts): the scheduler delivers it again
 * then, through the same path, and the snooze survives a restart.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import {
  CALENDAR_REMINDER_EVENT,
  calendarSnoozeUntil,
  snoozeCalendarReminder,
  type CalendarReminder,
  type CalendarSnooze,
} from '../../calendarReminders';
import { describeCalendarReminder } from '../../calendarReminderDelivery';
import { openSectionSurface } from '../../sectionSurface';
import './calendarReminder.css';

/** More than this and the stack covers the desk; the rest are in the Notification Center. */
const MAX_CARDS = 3;

const SNOOZES: readonly CalendarSnooze[] = ['5m', '15m', '1h', 'start'];
const SNOOZE_LABEL_KEYS: Record<CalendarSnooze, string> = {
  '5m': 'planner.snooze.5m',
  '15m': 'planner.snooze.15m',
  '1h': 'planner.snooze.1h',
  start: 'planner.snooze.untilStart',
};

export default function CalendarReminderHost() {
  const { t, lang } = useT();
  const [cards, setCards] = useState<CalendarReminder[]>([]);

  useEffect(() => {
    const onDue = (event: Event) => {
      const due = (event as CustomEvent<CalendarReminder[]>).detail;
      if (!Array.isArray(due) || !due.length) return;
      setCards((prev) => {
        const keys = new Set(due.map((r) => r.key));
        return [...prev.filter((r) => !keys.has(r.key)), ...due].slice(-MAX_CARDS);
      });
    };
    window.addEventListener(CALENDAR_REMINDER_EVENT, onDue);
    return () => window.removeEventListener(CALENDAR_REMINDER_EVENT, onDue);
  }, []);

  if (!cards.length) return null;
  const dismiss = (key: string) => setCards((prev) => prev.filter((r) => r.key !== key));
  const snooze = (reminder: CalendarReminder, choice: CalendarSnooze) => {
    const until = calendarSnoozeUntil(reminder, choice, Date.now());
    if (until === null) return;
    snoozeCalendarReminder(reminder.key, until);
    dismiss(reminder.key);
  };

  return (
    <div className="cal-reminder-host" data-lang={lang}>
      {cards.map((reminder) => {
        const { title, body } = describeCalendarReminder(reminder);
        return (
          <div
            key={reminder.key}
            className={`cal-reminder${reminder.missed ? ' is-missed' : ''}`}
            role="alert"
          >
            <div className="cal-reminder-text">
              <strong className="cal-reminder-title">{title}</strong>
              <span className="cal-reminder-body">{body}</span>
            </div>
            <div className="cal-reminder-actions">
              <button
                type="button"
                className="cal-reminder-btn"
                onClick={() => {
                  dismiss(reminder.key);
                  openSectionSurface('calendar');
                }}
              >
                {t('calendar.reminder.open')}
              </button>
              <select
                className="cal-reminder-snooze"
                value=""
                aria-label={t('planner.snooze.named', { title })}
                onChange={(e) => {
                  const choice = e.target.value as CalendarSnooze;
                  if (choice) snooze(reminder, choice);
                }}
              >
                <option value="" disabled>{t('planner.snooze.label')}</option>
                {SNOOZES.filter((choice) => calendarSnoozeUntil(reminder, choice, Date.now()) !== null).map((choice) => (
                  <option key={choice} value={choice}>{t(SNOOZE_LABEL_KEYS[choice])}</option>
                ))}
              </select>
            </div>
            <button
              type="button"
              className="cal-reminder-close"
              title={t('notifications.dismiss')}
              aria-label={t('notifications.dismissNamed', { title })}
              onClick={() => dismiss(reminder.key)}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}
