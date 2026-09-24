// @vitest-environment jsdom
/**
 * Where a due calendar reminder goes: the Notification Center, the on-screen
 * card's event, and a system notification only when the window is unfocused.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverCalendarReminders } from '../calendarReminderDelivery';
import { CALENDAR_REMINDER_EVENT, type CalendarReminder } from '../calendarReminders';
import { clearAll, getNotifications } from '../notificationStore';

const reminder: CalendarReminder = {
  key: 'exam|2026-09-15|10:00|15m',
  eventId: 'exam',
  title: 'Kanji test',
  occurrenceDate: '2026-09-15',
  startTime: '10:00',
  allDay: false,
  reminder: '15m',
  startsAt: new Date(2026, 8, 15, 10, 0).getTime(),
  triggerAt: new Date(2026, 8, 15, 9, 45).getTime(),
  missed: false,
};

afterEach(() => {
  clearAll();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('calendar reminder delivery', () => {
  it('records one Notification Center entry that opens the calendar, and tells the card', () => {
    const onCard = vi.fn();
    window.addEventListener(CALENDAR_REMINDER_EVENT, onCard);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    deliverCalendarReminders([reminder]);
    deliverCalendarReminders([reminder]);
    window.removeEventListener(CALENDAR_REMINDER_EVENT, onCard);
    const entries = getNotifications().filter((n) => n.source === 'calendar');
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ title: 'Kanji test', clientAction: 'open-calendar' });
    expect(onCard).toHaveBeenCalledTimes(2);
  });

  it('raises a system notification only while the window is not focused', () => {
    const ctor = vi.fn();
    vi.stubGlobal('Notification', ctor);
    vi.spyOn(document, 'hasFocus').mockReturnValue(true);
    deliverCalendarReminders([reminder]);
    expect(ctor).not.toHaveBeenCalled();
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    deliverCalendarReminders([{ ...reminder, missed: true }]);
    expect(ctor).toHaveBeenCalledTimes(1);
    expect(String(ctor.mock.calls[0][0])).toContain('Kanji test');
  });
});
