// @vitest-environment jsdom
/**
 * Where a due calendar reminder goes: the Notification Center, the on-screen
 * card's event, and a system notification only when the window is unfocused.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { deliverCalendarReminders } from '../calendarReminderDelivery';
import { CALENDAR_REMINDER_EVENT, type CalendarReminder } from '../calendarReminders';
import { clearAll, getNotifications, isDnd, setDnd, setDndFor, setQuietHours } from '../notificationStore';

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

  it('holds back the banner and the card during quiet hours, but still records the reminder', () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    // A window that certainly contains "now": from an hour ago to an hour ahead (wrapping).
    const start = `${pad((now.getHours() + 23) % 24)}:00`;
    const end = `${pad((now.getHours() + 1) % 24)}:59`;
    setQuietHours({ on: true, start, end });
    expect(isDnd()).toBe(true);
    const ctor = vi.fn();
    vi.stubGlobal('Notification', ctor);
    vi.spyOn(document, 'hasFocus').mockReturnValue(false);
    const onCard = vi.fn();
    window.addEventListener(CALENDAR_REMINDER_EVENT, onCard);
    deliverCalendarReminders([reminder]);
    window.removeEventListener(CALENDAR_REMINDER_EVENT, onCard);
    expect(ctor).not.toHaveBeenCalled();
    expect(onCard).not.toHaveBeenCalled();
    expect(getNotifications().filter((n) => n.source === 'calendar')).toHaveLength(1);
    setQuietHours({ on: false });
    expect(isDnd()).toBe(false);
  });

  it('shows a held reminder card once a timed quiet period ends, unless its event is long over', () => {
    vi.useFakeTimers();
    try {
      const now = Date.now();
      setDndFor(10 * 60_000, now);
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const onCard = vi.fn();
      window.addEventListener(CALENDAR_REMINDER_EVENT, onCard);
      const soon = { ...reminder, key: 'soon', startsAt: now + 30 * 60_000, triggerAt: now };
      const stale = { ...reminder, key: 'stale', startsAt: now - 3 * 60 * 60_000, triggerAt: now - 4 * 60 * 60_000 };
      deliverCalendarReminders([soon, stale]);
      expect(onCard).not.toHaveBeenCalled();
      vi.advanceTimersByTime(10 * 60_000 + 2_000);
      window.removeEventListener(CALENDAR_REMINDER_EVENT, onCard);
      expect(onCard).toHaveBeenCalledTimes(1);
      const shown = (onCard.mock.calls[0][0] as CustomEvent<CalendarReminder[]>).detail;
      expect(shown.map((r) => r.key)).toEqual(['soon']);
      expect(shown[0].missed).toBe(false);
    } finally {
      vi.useRealTimers();
      setDnd(false);
    }
  });

  it('shows a card held by the manual (indefinite) switch the moment the switch is turned off', () => {
    try {
      setDnd(true);
      vi.spyOn(document, 'hasFocus').mockReturnValue(true);
      const onCard = vi.fn();
      window.addEventListener(CALENDAR_REMINDER_EVENT, onCard);
      const now = Date.now();
      const soon = { ...reminder, key: 'manual-dnd', startsAt: now + 20 * 60_000, triggerAt: now - 60_000 };
      deliverCalendarReminders([soon]);
      expect(onCard).not.toHaveBeenCalled();
      // Another notice while still quiet changes nothing.
      setDnd(true);
      expect(onCard).not.toHaveBeenCalled();
      setDnd(false);
      expect(onCard).toHaveBeenCalledTimes(1);
      expect((onCard.mock.calls[0][0] as CustomEvent<CalendarReminder[]>).detail.map((r) => r.key)).toEqual(['manual-dnd']);
      // Released once: a later change does not show it again.
      setDnd(false);
      window.removeEventListener(CALENDAR_REMINDER_EVENT, onCard);
      expect(onCard).toHaveBeenCalledTimes(1);
    } finally {
      setDnd(false);
    }
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
