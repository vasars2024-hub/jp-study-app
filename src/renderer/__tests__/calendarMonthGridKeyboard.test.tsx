// @vitest-environment jsdom
/**
 * The month grid's keyboard route, driven rather than grepped.
 *
 * The defect this pins, measured live on 2026-09-03 by the category-1 harness:
 * every month cell carried `onDoubleClick={() => openNew(key)}` on a bare `<div>`
 * with no role, no `tabIndex`, no key handler and `cursor: auto`. Week and Day
 * modes each ship a real button for the same action; Month had no keyboard route
 * to a SPECIFIC day at all. The harness scored the surface 13/13 reachable and
 * saw nothing, because it enumerates `button,a,input,select,[tabindex]` — so the
 * regression this file exists to catch is invisible to that instrument.
 *
 * Deliberately NOT a source-text test. `calendarLiquidRegions.test.ts` next door
 * asserts on substrings of this same file, and the 2026-09-02 boss audit's
 * Finding 4 is exactly that shape going green on a comment. This one mounts the
 * component and dispatches real `keydown` events, so it fails if the handler is
 * removed, rewired, or has its arithmetic broken — none of which a substring sees.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));

import { CalendarBody, EventModal, toKey, useCalendar, type CalendarState } from '../components/calendar/CalendarContent';
import { LS_KEYS } from '../storage/storage';

/** 2026-09 laid out from Sunday 2026-08-30, i.e. what `useCalendar` produces. */
const FIRST_CELL = new Date(2026, 7, 30);
const monthCells = Array.from({ length: 42 }, (_, i) => {
  const d = new Date(FIRST_CELL);
  d.setDate(d.getDate() + i);
  return d;
});

let root: Root | null = null;
let host: HTMLDivElement | null = null;

function mountMonth(openNew: (key: string) => void) {
  host = document.createElement('div');
  document.body.appendChild(host);
  const state = {
    mode: 'month',
    cursor: new Date(2026, 8, 3),
    today: new Date(2026, 8, 3),
    monthCells,
    occsByDay: new Map(),
    agendaToday: [],
    agendaUpcoming: [],
    agendaOverdue: [],
    openNew,
    openEdit: () => undefined,
  } as unknown as CalendarState;
  root = createRoot(host);
  act(() => {
    root!.render(createElement(CalendarBody, { state }));
  });
  const grid = host.querySelector('.cal-month-grid') as HTMLElement;
  return grid;
}

const press = (grid: HTMLElement, key: string) => {
  act(() => {
    grid.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

const activeKey = (grid: HTMLElement) =>
  (grid.getAttribute('aria-activedescendant') || '').replace('cal-month-cell-', '');

afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  root = null;
  host = null;
});

describe('Calendar month navigation', () => {
  it('keeps future agenda events visible when today fills the upcoming limit', () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const events = Array.from({ length: 70 }, (_, i) => ({
      id: `agenda-${i}`,
      title: `Study session ${i}`,
      date: toKey(i < 30 ? today : tomorrow),
      allDay: true,
      color: '#fff',
      category: 'study',
      reminder: 'none',
      recurrence: 'none',
      createdAt: 0,
    }));
    const previous = localStorage.getItem(LS_KEYS.calendarEvents);
    localStorage.setItem(LS_KEYS.calendarEvents, JSON.stringify(events));
    try {
      let state: CalendarState;
      function Harness() {
        state = useCalendar();
        return null;
      }
      host = document.createElement('div');
      document.body.appendChild(host);
      root = createRoot(host);
      act(() => root!.render(createElement(Harness)));
      expect(state!.agendaToday).toHaveLength(30);
      expect(state!.agendaUpcoming.map((event) => event.id)).toEqual(
        events.slice(30, 60).map((event) => event.id),
      );
    } finally {
      if (previous === null) localStorage.removeItem(LS_KEYS.calendarEvents);
      else localStorage.setItem(LS_KEYS.calendarEvents, previous);
    }
  });

  it.each([
    ['2026-01-31', 1, '2026-02-28'],
    ['2028-01-31', 1, '2028-02-29'],
    ['2026-03-31', -1, '2026-02-28'],
    ['2026-05-31', -1, '2026-04-30'],
    ['2026-12-15', 1, '2027-01-15'],
    ['2026-01-15', -1, '2025-12-15'],
  ] as const)('moves from %s by %i month without skipping a month', (date, direction, expected) => {
    let state: CalendarState;
    function Harness() {
      state = useCalendar();
      return null;
    }
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => root!.render(createElement(Harness)));
    act(() => state.jump(date));
    act(() => state.shift(direction));
    expect(toKey(state!.cursor)).toBe(expected);
  });
});

describe('Calendar month grid — keyboard', () => {
  it('is one tab stop, not 42', () => {
    // 42 focusable cells would trade a category-1 failure for a category-2 one:
    // every stop after the calendar moves 42 keystrokes further away.
    const grid = mountMonth(() => undefined);
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('tabindex')).toBe('0');
    expect(host!.querySelectorAll('.cal-month-cell[tabindex]')).toHaveLength(0);
    expect(host!.querySelectorAll('.cal-month-cell')).toHaveLength(42);
  });

  it('starts on the cursor day and names every cell with a real date', () => {
    const grid = mountMonth(() => undefined);
    expect(activeKey(grid)).toBe('2026-09-03');
    const first = host!.querySelector('.cal-month-cell') as HTMLElement;
    // "30" is not a label. The full date is.
    expect(first.getAttribute('aria-label')).toContain('2026');
    expect(first.getAttribute('aria-label')).toContain('30');
    expect(first.id).toBe(`cal-month-cell-${toKey(FIRST_CELL)}`);
  });

  it('moves by day on Left/Right and by week on Up/Down', () => {
    const grid = mountMonth(() => undefined);
    press(grid, 'ArrowRight');
    press(grid, 'ArrowRight');
    press(grid, 'ArrowRight');
    expect(activeKey(grid)).toBe('2026-09-06');
    press(grid, 'ArrowDown');
    expect(activeKey(grid)).toBe('2026-09-13');
    press(grid, 'ArrowUp');
    press(grid, 'ArrowLeft');
    expect(activeKey(grid)).toBe('2026-09-05');
  });

  it('clamps at both ends instead of wrapping or going out of range', () => {
    const grid = mountMonth(() => undefined);
    for (let i = 0; i < 60; i++) press(grid, 'ArrowUp');
    expect(activeKey(grid)).toBe(toKey(monthCells[0]));
    for (let i = 0; i < 60; i++) press(grid, 'ArrowDown');
    expect(activeKey(grid)).toBe(toKey(monthCells[41]));
  });

  it('Home and End move within the week, not the month', () => {
    const grid = mountMonth(() => undefined);
    // 2026-09-03 is a Thursday: column 4 of the week that starts 2026-08-30.
    press(grid, 'Home');
    expect(activeKey(grid)).toBe('2026-08-30');
    press(grid, 'End');
    expect(activeKey(grid)).toBe('2026-09-05');
  });

  it('Enter and Space open a new event ON THE SELECTED DAY', () => {
    const opened: string[] = [];
    const grid = mountMonth((key) => opened.push(key));
    press(grid, 'ArrowRight');
    press(grid, 'Enter');
    expect(opened).toEqual(['2026-09-04']);
    press(grid, 'ArrowDown');
    press(grid, ' ');
    expect(opened).toEqual(['2026-09-04', '2026-09-11']);
  });

  it('leaves shell chords alone', () => {
    // Ctrl/Alt/Meta belong to the desktop's shortcuts; swallowing them here would
    // make the calendar eat Ctrl+ArrowRight for whatever the shell binds it to.
    const opened: string[] = [];
    const grid = mountMonth((key) => opened.push(key));
    act(() => {
      grid.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'ArrowRight', ctrlKey: true, bubbles: true }),
      );
      grid.dispatchEvent(
        new window.KeyboardEvent('keydown', { key: 'Enter', metaKey: true, bubbles: true }),
      );
    });
    expect(activeKey(grid)).toBe('2026-09-03');
    expect(opened).toEqual([]);
  });

  it('keeps the double-click route it was given — this ADDED a route', () => {
    const opened: string[] = [];
    const grid = mountMonth((key) => opened.push(key));
    const cell = grid.querySelector('#cal-month-cell-2026-09-10') as HTMLElement;
    act(() => {
      cell.dispatchEvent(new window.MouseEvent('dblclick', { bubbles: true }));
    });
    expect(opened).toEqual(['2026-09-10']);
  });

  it('lays the rows out as `display: contents` grid rows, not nested boxes', () => {
    // The row wrappers are what `role="grid"` needs; `.cal-month-row { display:
    // contents }` is what keeps the 7 columns direct items of the one grid. A row
    // that renders as a box collapses the month into a single column.
    const grid = mountMonth(() => undefined);
    const rows = grid.querySelectorAll('[role="row"]');
    expect(rows).toHaveLength(7); // 1 header + 6 weeks
    rows.forEach((r) => expect(r.className).toContain('cal-month-row'));
    expect(grid.querySelectorAll('[role="columnheader"]')).toHaveLength(7);
    expect(grid.querySelectorAll('[role="gridcell"]')).toHaveLength(42);
  });
});

/**
 * The event modal's dialog semantics and its Escape route.
 *
 * Measured live 2026-09-03 on the running app: pressing Escape with the New-event
 * modal open left it open (`modal: true`), and the card carried no `role`, no
 * `aria-modal` and no label — a hand-rolled backdrop plus a div. A keyboard user
 * had to tab to Cancel to get out of it.
 */
describe('Calendar event modal — dialog semantics', () => {
  const mountModal = (onClose: () => void) => {
    host = document.createElement('div');
    document.body.appendChild(host);
    root = createRoot(host);
    act(() => {
      root!.render(createElement(EventModal, { initial: { date: '2026-09-13' }, onClose }));
    });
    return host.querySelector('.cal-modal') as HTMLElement;
  };

  it('is a labelled modal dialog, not an anonymous div', () => {
    const card = mountModal(() => undefined);
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
    const labelledBy = card.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    // The label has to RESOLVE — an aria-labelledby pointing at nothing announces nothing.
    expect(card.querySelector(`#${labelledBy}`)?.textContent).toBeTruthy();
  });

  it('closes on Escape, from anywhere in the window', () => {
    let closed = 0;
    mountModal(() => { closed += 1; });
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closed).toBe(1);
  });

  it('leaves an Escape that something else already handled alone', () => {
    // A native <select> popup closes itself on Escape. Closing the whole modal
    // out from under that would lose the user's half-filled form.
    let closed = 0;
    mountModal(() => { closed += 1; });
    act(() => {
      const e = new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      e.preventDefault();
      window.dispatchEvent(e);
    });
    expect(closed).toBe(0);
  });

  it('unbinds on unmount, so a closed modal cannot swallow the next Escape', () => {
    let closed = 0;
    mountModal(() => { closed += 1; });
    act(() => root?.unmount());
    act(() => {
      window.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(closed).toBe(0);
    root = null;
  });
});
