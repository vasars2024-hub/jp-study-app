/**
 * The on-screen half of a calendar reminder.
 *
 * Mounted inside `ToastHost` beside Reading Lists' reminder card, for the reason
 * that file gives: it is the one place every shell mounts exactly once. It
 * renders nothing until the scheduler (`calendarReminders.ts`) delivers.
 *
 * A reminder stays until it is answered — it is not a toast that expires while
 * the user is looking at another window. Open calendar and × both dismiss it;
 * the Notification Center keeps the history either way.
 */
import { useEffect, useState } from 'react';
import { useT } from '../../i18n';
import { CALENDAR_REMINDER_EVENT, type CalendarReminder } from '../../calendarReminders';
import { describeCalendarReminder } from '../../calendarReminderDelivery';
import { openSectionSurface } from '../../sectionSurface';
import './calendarReminder.css';

/** More than this and the stack covers the desk; the rest are in the Notification Center. */
const MAX_CARDS = 3;

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
