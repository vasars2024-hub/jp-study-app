// @vitest-environment jsdom
/**
 * The event editor's new repeat and span controls, driven through the real component and
 * read back from the real store: several weekdays make ONE weekly series, a monthly event
 * can be "the 2nd Tuesday" (and back), yearly exists, an end date makes a multi-day event,
 * and an imported event's exact reminder and month-end rule survive an unrelated edit.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, params?: Record<string, unknown>) => (params ? `${key} ${JSON.stringify(params)}` : key), lang: 'en' }),
}));
vi.mock('../components/ui/dialogService', () => ({ confirmDialog: () => Promise.resolve(true) }));

import { EventModal, eventFormOf } from '../components/calendar/CalendarContent';
import { loadEvents, type CalendarEvent } from '../calendar';

const STORE_KEY = 'jp-calendar-events';
let root: Root | null = null;
let host: HTMLDivElement | null = null;

function open(initial: Parameters<typeof EventModal>[0]['initial']): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(createElement(EventModal, { initial, onClose: () => undefined }));
  });
  return host;
}

function setValue(el: HTMLInputElement | HTMLSelectElement, value: string): void {
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

function click(el: Element | null | undefined): void {
  if (!el) throw new Error('no element');
  act(() => {
    (el as HTMLElement).click();
  });
}

const repeatSelect = (m: HTMLElement) =>
  [...m.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === 'weekly')) as HTMLSelectElement;
const saveButton = (m: HTMLElement) => m.querySelector('.cal-modal-actions .btn.primary');

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 5, 9, 0));
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  localStorage.clear();
});

describe('event editor — repeats and spans', () => {
  it('Tue + Thu toggles save ONE weekly series on both days', () => {
    const m = open({ title: 'Class', date: '2026-10-06' });
    setValue(repeatSelect(m), 'weekly');
    const buttons = [...m.querySelectorAll<HTMLButtonElement>('.cal-weekday-btn')];
    expect(buttons).toHaveLength(7);
    // The date's own weekday (Tuesday) is on and fixed.
    const tue = buttons.find((b) => b.getAttribute('aria-label')?.startsWith('Tuesday'))!;
    expect(tue.disabled).toBe(true);
    expect(tue.getAttribute('aria-pressed')).toBe('true');
    click(buttons.find((b) => b.getAttribute('aria-label')?.startsWith('Thursday')));
    click(saveButton(m));
    const stored = loadEvents();
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ recurrence: 'weekly', date: '2026-10-06', recurrenceWeekdays: [2, 4] });
  });

  it('monthly on the 2nd Tuesday, then back to the day number, which clears the rule', () => {
    const m = open({ title: 'Club', date: '2026-10-13' });
    setValue(repeatSelect(m), 'monthly');
    const pattern = m.querySelector<HTMLSelectElement>('.cal-repeat-pattern')!;
    expect([...pattern.options].map((o) => o.value)).toEqual(['day', 'nth']);
    setValue(pattern, 'nth');
    click(saveButton(m));
    const [saved] = loadEvents();
    expect(saved).toMatchObject({ recurrence: 'monthly', recurrenceNth: 2 });

    act(() => root?.unmount());
    host?.remove();
    const again = open(eventFormOf(saved));
    setValue(again.querySelector<HTMLSelectElement>('.cal-repeat-pattern')!, 'day');
    click(saveButton(again));
    expect(loadEvents()[0].recurrenceNth).toBeUndefined();
  });

  it('on the 31st the editor offers both month-end rules, labelled, and yearly exists', () => {
    const m = open({ title: 'Rent', date: '2026-01-31' });
    setValue(repeatSelect(m), 'monthly');
    const labels = [...m.querySelector<HTMLSelectElement>('.cal-repeat-pattern')!.options].map((o) => o.textContent ?? '');
    expect(labels[0]).toContain('planner.repeat.monthDayClamp');
    expect(labels[1]).toContain('planner.repeat.monthDaySkip');
    // Gum's own rule is the default for an event made here.
    click(saveButton(m));
    expect(loadEvents()[0].recurrenceMonthEnd).toBeUndefined();
    expect([...repeatSelect(m).options].map((o) => o.value)).toContain('yearly');
  });

  it('an end date makes a multi-day event; an end before the start is refused', () => {
    const m = open({ title: 'Trip', date: '2026-10-30', allDay: true });
    const dates = m.querySelectorAll<HTMLInputElement>('input[type=date]');
    // The first date field is still the event's own date.
    expect(dates[0].value).toBe('2026-10-30');
    setValue(dates[1], '2026-10-28');
    expect(m.querySelector('#cal-end-date-error')).not.toBeNull();
    expect((saveButton(m) as HTMLButtonElement).disabled).toBe(true);
    setValue(dates[1], '2026-11-02');
    click(saveButton(m));
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-30', endDate: '2026-11-02', allDay: true });
  });

  it('an imported event keeps its exact reminder and skip rule through an unrelated edit', () => {
    const imported: CalendarEvent = {
      id: 'imp', title: 'Imported', date: '2026-01-31', startTime: '08:00', endTime: '09:00', color: '#6c7bff',
      category: 'study', reminder: 'custom', reminderMinutes: 10, recurrence: 'monthly', recurrenceMonthEnd: 'skip', createdAt: 0,
    };
    localStorage.setItem(STORE_KEY, JSON.stringify([imported]));
    const m = open(eventFormOf(imported));
    const reminder = [...m.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === '15m')) as HTMLSelectElement;
    expect(reminder.value).toBe('custom');
    expect(reminder.selectedOptions[0].textContent).toContain('planner.reminder.minutesBefore');
    setValue(m.querySelector<HTMLInputElement>('.cal-field input:not([type])')!, 'Imported (renamed)');
    click(saveButton(m));
    expect(loadEvents()[0]).toMatchObject({ title: 'Imported (renamed)', reminder: 'custom', reminderMinutes: 10, recurrenceMonthEnd: 'skip' });
  });
});
