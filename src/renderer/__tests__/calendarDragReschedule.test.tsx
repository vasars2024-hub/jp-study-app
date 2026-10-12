// @vitest-environment jsdom
/**
 * Drag-to-reschedule and the .ics export, driven through the real hook and grid: a chip
 * picked up on one day and dropped on another moves the stored event; a repeating event
 * asks before moving its series; the toolbar's export saves an iCalendar file.
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

import { CalendarBody, CalendarNav, useCalendar, type CalendarState } from '../components/calendar/CalendarContent';

const STORE_KEY = 'jp-calendar-events';
const NOW = new Date(2026, 9, 9, 9, 0, 0);
const DRAG_TYPE = 'application/x-gum-calendar-occurrence';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function seed(rows: Record<string, unknown>[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(rows));
}

function stored(): Array<{ id: string; date: string; recurrenceEndDate?: string }> {
  return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
}

/** The real hook, with the grid on its own (the day panel reads stores this test does not set up). */
function mount(): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  function Harness() {
    const state = useCalendar();
    return createElement(
      'div',
      null,
      createElement(CalendarNav, { state }),
      createElement(CalendarBody, { state: { ...state, setSelectedDay: undefined } as unknown as CalendarState }),
    );
  }
  root = createRoot(host);
  act(() => {
    root!.render(createElement(Harness));
  });
  return host;
}

function dragEvent(type: string, payload: { id: string; from: string } | null, setData = vi.fn()): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', {
    value: {
      types: payload ? [DRAG_TYPE] : ['Files'],
      getData: (format: string) => (format === DRAG_TYPE && payload ? JSON.stringify(payload) : ''),
      setData,
      dropEffect: 'none',
      effectAllowed: 'all',
    },
  });
  return event;
}

const cell = (el: HTMLElement, key: string) => el.querySelector(`#cal-month-cell-${key}`) as HTMLElement;

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
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.clear();
});

const oneOff = {
  id: 'a', title: 'Kanji', date: '2026-10-12', allDay: false, startTime: '19:00', endTime: '19:30',
  color: '#6c7bff', category: 'study', reminder: 'none', recurrence: 'none', createdAt: 1,
};

describe('drag to reschedule', () => {
  it('a chip carries its occurrence, and dropping it on another day moves the event', async () => {
    seed([oneOff]);
    const el = mount();
    const chip = cell(el, '2026-10-12').querySelector('.cal-chip') as HTMLElement;
    expect(chip.getAttribute('draggable')).toBe('true');
    const setData = vi.fn();
    act(() => {
      chip.dispatchEvent(dragEvent('dragstart', null, setData));
    });
    expect(setData).toHaveBeenCalledWith(DRAG_TYPE, JSON.stringify({ id: 'a', from: '2026-10-12' }));

    const target = cell(el, '2026-10-15');
    const over = dragEvent('dragover', { id: 'a', from: '2026-10-12' });
    act(() => {
      target.dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(true);
    expect(target.classList.contains('cal-drop-over')).toBe(true);
    await act(async () => {
      target.dispatchEvent(dragEvent('drop', { id: 'a', from: '2026-10-12' }));
    });
    expect(stored()[0].date).toBe('2026-10-15');
    expect(confirmDialog).not.toHaveBeenCalled();
    expect(cell(el, '2026-10-15').querySelector('.cal-chip')).not.toBeNull();
  });

  it('ignores drags that are not calendar events, so file drops still reach the app', () => {
    seed([oneOff]);
    const el = mount();
    const over = dragEvent('dragover', null);
    act(() => {
      cell(el, '2026-10-15').dispatchEvent(over);
    });
    expect(over.defaultPrevented).toBe(false);
  });

  it('moves only the dragged date of a repeating event, after asking, and nothing when declined', async () => {
    seed([{ ...oneOff, recurrence: 'weekly', date: '2026-10-05', recurrenceEndDate: '2026-11-30' }]);
    const el = mount();
    confirmDialog.mockResolvedValueOnce(false);
    await act(async () => {
      cell(el, '2026-10-14').dispatchEvent(dragEvent('drop', { id: 'a', from: '2026-10-12' }));
    });
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    expect(stored()).toHaveLength(1);

    confirmDialog.mockResolvedValueOnce(true);
    await act(async () => {
      cell(el, '2026-10-14').dispatchEvent(dragEvent('drop', { id: 'a', from: '2026-10-12' }));
    });
    const rows = stored() as Array<{ id: string; date: string; recurrence: string; excludedDates?: string[] }>;
    const series = rows.find((row) => row.id === 'a')!;
    const single = rows.find((row) => row.id !== 'a')!;
    // The series keeps its dates except the one that moved; the moved date is its own event.
    expect(series).toMatchObject({ date: '2026-10-05', excludedDates: ['2026-10-12'] });
    expect(single).toMatchObject({ date: '2026-10-14', recurrence: 'none' });
    expect(cell(el, '2026-10-12').querySelector('.cal-chip')).toBeNull();
    expect(cell(el, '2026-10-19').querySelector('.cal-chip')).not.toBeNull();
    expect(cell(el, '2026-10-14').querySelectorAll('.cal-chip')).toHaveLength(1);
  });
});

describe('skip one date', () => {
  it('the editor opened from a repeating chip can skip just that date', async () => {
    seed([{ ...oneOff, recurrence: 'daily', date: '2026-10-10', recurrenceEndDate: '2026-10-14' }]);
    const el = mount();
    expect(cell(el, '2026-10-12').querySelector('.cal-chip')).not.toBeNull();
    // The modal is rendered by the shell, not by CalendarBody; open it as `openEdit` would.
    const { EventModal } = await import('../components/calendar/CalendarContent');
    const modalHost = document.createElement('div');
    document.body.appendChild(modalHost);
    const modalRoot = createRoot(modalHost);
    act(() => {
      modalRoot.render(createElement(EventModal, {
        initial: { id: 'a', title: 'Kanji', date: '2026-10-10', recurrence: 'daily', occurrenceDate: '2026-10-12' },
        onClose: () => undefined,
      }));
    });
    const skip = Array.from(modalHost.querySelectorAll('button')).find((b) => b.textContent === 'planner.skip.button');
    expect(skip).toBeTruthy();
    confirmDialog.mockResolvedValueOnce(true);
    await act(async () => {
      skip!.click();
    });
    expect(stored()[0]).toMatchObject({ excludedDates: ['2026-10-12'] });
    expect(cell(el, '2026-10-12').querySelector('.cal-chip')).toBeNull();
    expect(cell(el, '2026-10-13').querySelector('.cal-chip')).not.toBeNull();
    act(() => modalRoot.unmount());
    modalHost.remove();
  });

  it('the editor moves just this date by keyboard, the same split a drag makes', async () => {
    seed([{ ...oneOff, recurrence: 'daily', date: '2026-10-10', recurrenceEndDate: '2026-10-14' }]);
    const { EventModal } = await import('../components/calendar/CalendarContent');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    const onClose = vi.fn();
    act(() => {
      root!.render(createElement(EventModal, {
        initial: { id: 'a', title: 'Kanji', date: '2026-10-10', recurrence: 'daily', occurrenceDate: '2026-10-12' },
        onClose,
      }));
    });
    const input = host.querySelector('.cal-move-one input[type="date"]') as HTMLInputElement;
    const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'planner.moveOne.button')!;
    expect(button.disabled).toBe(true);
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, '2026-10-20');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(button.disabled).toBe(false);
    act(() => button.click());
    const rows = stored() as Array<{ id: string; date: string; excludedDates?: string[] }>;
    expect(rows.find((row) => row.id === 'a')).toMatchObject({ excludedDates: ['2026-10-12'] });
    expect(rows.find((row) => row.id !== 'a')).toMatchObject({ date: '2026-10-20' });
    expect(onClose).toHaveBeenCalled();
  });

  it('a one-off event has no skip button', async () => {
    const { EventModal } = await import('../components/calendar/CalendarContent');
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(createElement(EventModal, { initial: { id: 'a', title: 'x', date: '2026-10-12', occurrenceDate: '2026-10-12' }, onClose: () => undefined }));
    });
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'planner.skip.button')).toBe(false);
  });
});

describe('.ics export', () => {
  it('is disabled with nothing to export, and saves an iCalendar file otherwise', async () => {
    const created: Blob[] = [];
    Object.assign(URL, {
      createObjectURL: vi.fn((blob: Blob) => {
        created.push(blob);
        return 'blob:calendar';
      }),
      revokeObjectURL: vi.fn(),
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    let el = mount();
    let button = el.querySelector('.cal-export-ics') as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    act(() => root?.unmount());
    host?.remove();

    seed([oneOff]);
    el = mount();
    button = el.querySelector('.cal-export-ics') as HTMLButtonElement;
    expect(button.disabled).toBe(false);
    act(() => button.click());
    expect(click).toHaveBeenCalledTimes(1);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe('text/calendar;charset=utf-8');
    const text = await created[0].text();
    expect(text).toContain('SUMMARY:Kanji');
    expect(text).toContain('DTSTART:20261012T190000');
  });
});
