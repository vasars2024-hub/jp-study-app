// @vitest-environment jsdom
/**
 * The three calendar defects found by driving the surface on 2026-09-07
 * (pre-sweep D161, D162, D163), pinned by behaviour rather than by source text.
 *
 * All three were invisible to every instrument already pointed at this surface:
 * the a11y walk counts named controls and all 14 were named; the keyboard walk
 * found a correct ARIA grid; `calendarLiquidRegions.test.ts` asserts on
 * substrings of this same component. What none of them asks is whether the
 * numbers on screen agree with the store, or whether a destructive control
 * stops to ask. That is what this file does.
 *
 * Deliberately NOT source-text assertions, for the reason the file next door
 * gives: the 2026-09-02 boss audit's Finding 4 was a substring test going green
 * on a comment. These mount the real component and the real hook, drive real
 * events, and read the real store.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

const confirmDialog = vi.fn<() => Promise<boolean>>();
vi.mock('../components/ui/dialogService', () => ({
  confirmDialog: (...args: unknown[]) => confirmDialog(...(args as [])),
}));

import { EventModal, useCalendar, type CalendarState } from '../components/calendar/CalendarContent';

const STORE_KEY = 'jp-calendar-events';

/** A fixed clock, so "later today" is not a function of when CI runs. */
const NOW = new Date(2026, 8, 15, 9, 0, 0);
const TODAY = '2026-09-15';
const TOMORROW = '2026-09-16';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mount(el: ReactElement): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(el);
  });
  return host;
}

function readStore(): { id: string; title: string }[] {
  return JSON.parse(localStorage.getItem(STORE_KEY) || '[]');
}

function seed(rows: Record<string, unknown>[]): void {
  localStorage.setItem(STORE_KEY, JSON.stringify(rows));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  confirmDialog.mockReset();
  localStorage.clear();
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  host?.remove();
  root = null;
  host = null;
  vi.useRealTimers();
  localStorage.clear();
});

/* ------------------------------------------------------------------ D161 */

describe('D161 — the Agenda listed every event later today twice', () => {
  /** A probe that renders nothing and just exposes the hook's agenda lists. */
  function agenda(): CalendarState {
    let captured: CalendarState | null = null;
    function Probe() {
      captured = useCalendar();
      return null;
    }
    mount(createElement(Probe));
    return captured as unknown as CalendarState;
  }

  it('puts an event later today under Today and NOT also under Upcoming', () => {
    seed([
      { id: 'a', title: 'later today', date: TODAY, allDay: false, startTime: '14:00', endTime: '15:00', category: 'study', reminder: 'none', recurrence: 'none', createdAt: 1 },
    ]);
    const state = agenda();
    expect(state.agendaToday.map((o) => o.id)).toEqual(['a']);
    // The regression: `getUpcomingOccurrences` counts from NOW, so before the
    // fix this was also `['a']` and the user saw the same event twice, one
    // section below the other.
    expect(state.agendaUpcoming.map((o) => o.id)).toEqual([]);
  });

  it('still shows a genuinely future event under Upcoming — the filter is not a mute button', () => {
    seed([
      { id: 'a', title: 'later today', date: TODAY, allDay: false, startTime: '14:00', endTime: '15:00', category: 'study', reminder: 'none', recurrence: 'none', createdAt: 1 },
      { id: 'b', title: 'tomorrow', date: TOMORROW, allDay: false, startTime: '09:00', endTime: '10:00', category: 'study', reminder: 'none', recurrence: 'none', createdAt: 2 },
    ]);
    const state = agenda();
    expect(state.agendaToday.map((o) => o.id)).toEqual(['a']);
    expect(state.agendaUpcoming.map((o) => o.id)).toEqual(['b']);
    // The property the user actually sees: two events, two chips, not three.
    const shown = [...state.agendaToday, ...state.agendaUpcoming].map((o) => o.id);
    expect(shown).toHaveLength(new Set(shown).size);
  });
});

/* ------------------------------------------------------------------ D162 */

describe('D162 — the editor accepted an end time before the start', () => {
  const openNew = () => mount(createElement(EventModal, { initial: { date: TODAY, title: 'x' }, onClose: () => undefined }));

  const setTime = (scope: HTMLElement, which: 0 | 1, value: string) => {
    const input = scope.querySelectorAll('input[type="time"]')[which] as HTMLInputElement;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      setter.call(input, value);
      input.dispatchEvent(new window.Event('input', { bubbles: true }));
    });
  };

  const createBtn = (scope: HTMLElement) =>
    [...scope.querySelectorAll('.cal-modal-actions button')].find(
      (b) => b.className.includes('primary'),
    ) as HTMLButtonElement;

  it('refuses an inverted range: Create goes disabled and says why', () => {
    const scope = openNew();
    setTime(scope, 0, '10:00');
    setTime(scope, 1, '09:00');
    expect(createBtn(scope).disabled).toBe(true);
    const err = scope.querySelector('.cal-field-error');
    expect(err?.textContent).toBe('calendar.modal.endBeforeStart');
    // A disabled button with no announced reason is the same dead end for a
    // screen-reader user, so the message has to be wired to the field.
    expect(err?.getAttribute('role')).toBe('alert');
    const end = scope.querySelectorAll('input[type="time"]')[1] as HTMLInputElement;
    expect(end.getAttribute('aria-invalid')).toBe('true');
    expect(end.getAttribute('aria-describedby')).toBe(err?.id);
  });

  it('CONTROL — a normal range is still accepted, and an equal one is not an error', () => {
    const scope = openNew();
    setTime(scope, 0, '09:00');
    setTime(scope, 1, '10:00');
    expect(createBtn(scope).disabled).toBe(false);
    expect(scope.querySelector('.cal-field-error')).toBeNull();

    setTime(scope, 1, '09:00');
    expect(createBtn(scope).disabled).toBe(false);
    expect(scope.querySelector('.cal-field-error')).toBeNull();
  });

  it('an all-day event carries no times, so it can never be inverted', () => {
    const scope = openNew();
    setTime(scope, 0, '10:00');
    setTime(scope, 1, '09:00');
    expect(createBtn(scope).disabled).toBe(true);
    const allDay = scope.querySelector('input[type="checkbox"]') as HTMLInputElement;
    act(() => {
      allDay.click();
    });
    expect(createBtn(scope).disabled).toBe(false);
    expect(scope.querySelector('.cal-field-error')).toBeNull();
  });
});

/* ------------------------------------------------------------------ D163 */

describe('D163 — deleting an event asked nothing and could not be undone', () => {
  const EXISTING = {
    id: 'ev-1', title: 'Kanji review', date: TODAY, allDay: false,
    startTime: '09:00', endTime: '10:00', color: '#6c7bff',
    category: 'study', reminder: 'none', recurrence: 'none', createdAt: 1,
  };

  const openEdit = (over: Record<string, unknown> = {}) => {
    seed([{ ...EXISTING, ...over }]);
    return mount(createElement(EventModal, { initial: { ...EXISTING, ...over }, onClose: () => undefined }));
  };

  const del = (scope: HTMLElement) =>
    [...scope.querySelectorAll('.cal-modal-actions button')].find(
      (b) => b.className.includes('danger'),
    ) as HTMLButtonElement;

  it('asks first, naming the event, and keeps it when the answer is no', async () => {
    confirmDialog.mockResolvedValue(false);
    const scope = openEdit();
    await act(async () => {
      del(scope).click();
    });
    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const opts = confirmDialog.mock.calls[0][0] as unknown as { message: string; danger: boolean };
    expect(opts.danger).toBe(true);
    // The row is `jp-calendar-events` in localStorage, which userData backups
    // do not cover — a "no" that still deletes has no restore point.
    expect(readStore().map((e) => e.id)).toEqual(['ev-1']);
  });

  it('deletes only once the answer is yes', async () => {
    confirmDialog.mockResolvedValue(true);
    const scope = openEdit();
    await act(async () => {
      del(scope).click();
    });
    expect(readStore()).toEqual([]);
  });

  it('warns that a repeating event takes every occurrence with it', async () => {
    confirmDialog.mockResolvedValue(false);
    const scope = openEdit({ recurrence: 'weekly' });
    await act(async () => {
      del(scope).click();
    });
    const opts = confirmDialog.mock.calls[0][0] as unknown as { message: string };
    expect(opts.message).toBe('calendar.modal.deleteConfirm.recurring');
  });
});
