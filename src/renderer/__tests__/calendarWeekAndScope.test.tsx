// @vitest-environment jsdom
/**
 * The week hour grid (placement, overlap columns, all-day row, current-time line, keyboard),
 * Alt+Arrow moves on a focused event (the keyboard route to a drag), and editing one
 * occurrence of a repeating event: this event / this and following / all events.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
const confirmDialog = vi.fn<() => Promise<boolean>>();
vi.mock('../components/ui/dialogService', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialog(...(args as [])),
}));

import { CalendarBody, EventModal, useCalendar, type CalendarState } from '../components/calendar/CalendarContent';
import { weekEventLayout } from '../components/calendar/CalendarWeekGrid';
import { deleteRepeatingScope, loadEvents, saveRepeatingEdit, type CalendarEvent } from '../calendar';

const STORE_KEY = 'jp-calendar-events';
const NOW = new Date(2026, 9, 14, 10, 30, 0); // Wednesday
let root: Root | null = null;
let host: HTMLDivElement | null = null;
let state: CalendarState | null = null;

const seed = (rows: Partial<CalendarEvent>[]) => localStorage.setItem(STORE_KEY, JSON.stringify(rows));
const stored = () => loadEvents();
const base = { color: '#6c7bff', category: 'study', reminder: 'none', recurrence: 'none', createdAt: 1 } as const;

function mountWeek(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  function Harness() {
    state = useCalendar();
    return createElement(CalendarBody, { state: { ...state, setSelectedDay: undefined } as unknown as CalendarState });
  }
  root = createRoot(host);
  act(() => root!.render(createElement(Harness)));
  act(() => state!.setMode('week'));
  return host;
}

function key(el: Element, k: string, init: KeyboardEventInit = {}): void {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  confirmDialog.mockReset();
  localStorage.clear();
});

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
  state = null;
  vi.useRealTimers();
  localStorage.clear();
});

describe('week hour grid', () => {
  it('lays overlapping events side by side and lone ones full width', () => {
    const layout = weekEventLayout([
      { key: 'a', start: 540, end: 600 },
      { key: 'b', start: 570, end: 630 },
      { key: 'c', start: 600, end: 660 },
      { key: 'd', start: 700, end: 760 },
    ]);
    expect(layout.get('a')).toEqual({ col: 0, cols: 2 });
    expect(layout.get('b')).toEqual({ col: 1, cols: 2 });
    // c starts when a ends: it takes a's freed column, inside the same cluster.
    expect(layout.get('c')).toEqual({ col: 0, cols: 2 });
    expect(layout.get('d')).toEqual({ col: 0, cols: 1 });
  });

  it('places timed events by start and end, all-day ones on top, and marks now', () => {
    seed([
      { ...base, id: 'a', title: 'Kanji', date: '2026-10-14', startTime: '09:00', endTime: '10:30' },
      { ...base, id: 'b', title: 'Grammar', date: '2026-10-14', startTime: '09:30', endTime: '10:00' },
      { ...base, id: 'c', title: 'Exam day', date: '2026-10-15', allDay: true },
    ]);
    const el = mountWeek();
    const grid = el.querySelector('[role="grid"].cal-wk')!;
    expect(grid).not.toBeNull();
    const kanji = el.querySelector<HTMLElement>('[data-occurrence="a|2026-10-14"]')!;
    const grammar = el.querySelector<HTMLElement>('[data-occurrence="b|2026-10-14"]')!;
    // In the slot of its start hour, 9:00 → 9 * 44 px below the header (48) and all-day row (58).
    expect(kanji.closest('[role="gridcell"]')!.id).toBe('cal-wk-2026-10-14-9');
    expect(kanji.style.top).toBe(`${48 + 58 + 9 * 44}px`);
    expect(kanji.style.height).toBe(`${1.5 * 44 - 2}px`);
    expect(grammar.closest('[role="gridcell"]')!.id).toBe('cal-wk-2026-10-14-9');
    // Side by side: each half a day lane (1/14 of the lanes), at different offsets.
    expect(kanji.style.width).toContain('0.0714');
    expect(grammar.style.width).toBe(kanji.style.width);
    expect(grammar.style.left).not.toBe(kanji.style.left);
    expect(el.querySelector('#cal-wk-2026-10-15-allday [data-occurrence="c|2026-10-15"]')).not.toBeNull();
    // The current-time line sits in today's 10:00 slot.
    expect(el.querySelector('#cal-wk-2026-10-14-10 .cal-wk-now')).not.toBeNull();
  });

  it('is one tab stop whose arrows pick a slot, and Enter starts an event there', () => {
    const el = mountWeek();
    const grid = el.querySelector<HTMLElement>('.cal-wk')!;
    expect(grid.getAttribute('tabindex')).toBe('0');
    expect(grid.getAttribute('aria-activedescendant')).toBe('cal-wk-2026-10-14-10');
    key(grid, 'ArrowDown');
    key(grid, 'ArrowRight');
    expect(grid.getAttribute('aria-activedescendant')).toBe('cal-wk-2026-10-15-11');
    key(grid, 'Enter');
    expect(state!.modal).toMatchObject({ date: '2026-10-15', startTime: '11:00', endTime: '12:00' });
    act(() => state!.setModal(null));
    // Above 00:00 is the all-day row.
    for (let i = 0; i < 12; i++) key(grid, 'ArrowUp');
    expect(grid.getAttribute('aria-activedescendant')).toBe('cal-wk-2026-10-15-allday');
    key(grid, ' ');
    expect(state!.modal).toMatchObject({ date: '2026-10-15', allDay: true });
  });

  it('Alt+Arrow on an event moves it a day, or 15 minutes, keeping its length', async () => {
    seed([{ ...base, id: 'a', title: 'Kanji', date: '2026-10-14', startTime: '09:00', endTime: '10:30' }]);
    const el = mountWeek();
    const event = () => el.querySelector<HTMLElement>('[data-occurrence^="a|"]')!;
    await act(async () => {
      event().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    });
    expect(stored()[0]).toMatchObject({ date: '2026-10-15', startTime: '09:00' });
    await act(async () => {
      event().dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', altKey: true, bubbles: true, cancelable: true }));
    });
    expect(stored()[0]).toMatchObject({ date: '2026-10-15', startTime: '09:15', endTime: '10:45' });
    expect(state!.moveNotice).toContain('planner.keyboardMove.moved');
  });
});

describe('month grid keyboard move', () => {
  it('Alt+ArrowRight on a chip moves the event a day; plain Enter on it does not start a new one', async () => {
    seed([{ ...base, id: 'a', title: 'Kanji', date: '2026-10-14', startTime: '09:00' }]);
    host = document.createElement('div');
    document.body.appendChild(host);
    function Harness() {
      state = useCalendar();
      return createElement(CalendarBody, { state: { ...state, setSelectedDay: undefined } as unknown as CalendarState });
    }
    root = createRoot(host);
    act(() => root!.render(createElement(Harness)));
    const chip = host.querySelector<HTMLElement>('#cal-month-cell-2026-10-14 .cal-chip')!;
    expect(chip.getAttribute('aria-keyshortcuts')).toContain('Alt+ArrowRight');
    key(chip, 'Enter');
    expect(state!.modal).toBeNull();
    await act(async () => {
      chip.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true, cancelable: true }));
    });
    expect(stored()[0].date).toBe('2026-10-15');
    expect(host.querySelector('#cal-month-cell-2026-10-15 .cal-chip')).not.toBeNull();
  });
});

describe('editing one occurrence of a repeating event', () => {
  const series: CalendarEvent = {
    ...base, id: 's', title: 'Reading', date: '2026-10-05', startTime: '07:00', recurrence: 'daily',
    recurrenceEndDate: '2026-10-20', excludedDates: ['2026-10-06', '2026-10-15'],
  };
  const payload = (patch: Partial<CalendarEvent> = {}) => {
    const { id: _id, createdAt: _c, excludedDates: _x, ...rest } = { ...series, ...patch };
    return rest;
  };

  it('"this event" skips the date in the series and saves the edit as its own event', () => {
    seed([series]);
    saveRepeatingEdit(series, '2026-10-10', 'this', payload({ title: 'Reading (park)', date: '2026-10-10', startTime: '08:00' }));
    const rows = stored();
    expect(rows.find((e) => e.id === 's')!.excludedDates).toEqual(['2026-10-06', '2026-10-10', '2026-10-15']);
    expect(rows.find((e) => e.id !== 's')).toMatchObject({ title: 'Reading (park)', date: '2026-10-10', startTime: '08:00', recurrence: 'none' });
    expect(rows.find((e) => e.id !== 's')!.recurrenceEndDate).toBeUndefined();
  });

  it('"this and following" ends the series the day before and starts a new one with the edit', () => {
    seed([series]);
    saveRepeatingEdit(series, '2026-10-10', 'following', payload({ startTime: '06:30', date: '2026-10-10' }));
    const rows = stored();
    expect(rows.find((e) => e.id === 's')).toMatchObject({ recurrenceEndDate: '2026-10-09', excludedDates: ['2026-10-06'] });
    expect(rows.find((e) => e.id !== 's')).toMatchObject({
      date: '2026-10-10', startTime: '06:30', recurrence: 'daily', recurrenceEndDate: '2026-10-20', excludedDates: ['2026-10-15'],
    });
  });

  it('"all events" changes the series, and from its first date "following" is the same', () => {
    seed([series]);
    saveRepeatingEdit(series, '2026-10-05', 'following', payload({ title: 'Morning reading' }));
    expect(stored()).toHaveLength(1);
    expect(stored()[0]).toMatchObject({ title: 'Morning reading', excludedDates: ['2026-10-06', '2026-10-15'] });
  });

  it('deletes this and following by ending the series', () => {
    seed([series]);
    deleteRepeatingScope(series, '2026-10-12', 'following');
    expect(stored()[0]).toMatchObject({ recurrenceEndDate: '2026-10-11', excludedDates: ['2026-10-06'] });
  });

  it('the editor defaults to "this event", shows that date, and saves through it', () => {
    seed([series]);
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const onClose = vi.fn();
    act(() => root!.render(createElement(EventModal, {
      initial: { ...payload(), id: 's', recurrenceEndDate: '2026-10-20', occurrenceDate: '2026-10-12' } as never,
      onClose,
    })));
    const radios = Array.from(host.querySelectorAll<HTMLInputElement>('input[name="cal-edit-scope"]'));
    expect(radios.map((r) => r.value)).toEqual(['this', 'following', 'all']);
    expect(radios.find((r) => r.checked)!.value).toBe('this');
    const date = host.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(date.value).toBe('2026-10-12');
    // The repeat controls belong to the series, not to a single date.
    expect(host.textContent).not.toContain('calendar.modal.repeatUntil');
    act(() => radios[2].click());
    expect(host.querySelector<HTMLInputElement>('input[type="date"]')!.value).toBe('2026-10-05');
    act(() => radios[0].click());
    const save = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'common.save')!;
    act(() => save.click());
    expect(onClose).toHaveBeenCalled();
    expect(stored()).toHaveLength(2);
    expect(stored().find((e) => e.id === 's')!.excludedDates).toContain('2026-10-12');
  });
});
