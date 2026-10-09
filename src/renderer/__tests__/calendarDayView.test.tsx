// @vitest-environment jsdom
/**
 * The Calendar's day view, year mode, heat shading and study reminders — driven through
 * the real calendar state and the real stores, not a model of them.
 *
 * What it pins: a day lists what was studied and every row opens its source (the book
 * through the Library route, the deck narrowed to the day's cards, a coming day's reviews
 * brought forward); a reminder made from the day is an ordinary calendar event that the
 * existing scheduler fires; the year grid is one tab stop that moves by day, week and month
 * and opens a day with Enter; the month grid can be shaded by study.
 */
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}|${JSON.stringify(vars)}` : key),
    lang: 'en',
  }),
  t: (key: string) => key,
  getUiLang: () => 'en',
}));
vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

import { CalendarBody, CalendarNav, useCalendar, type CalendarState } from '../components/calendar/CalendarContent';
import { getActiveStudyDates, getStudyDayActivity, recordReading, recordWatching } from '../stats';
import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests } from '../flashcardDeck';
import { loadEvents } from '../calendar';
import { evaluateCalendarReminders } from '../calendarReminders';
import { currentDailyStudyReminder } from '../components/calendar/calendarDayData';
import { PENDING_HANDOFF_KEYS } from '../pendingHandoff';

const TODAY = '2026-10-08';

let host: HTMLDivElement;
let root: Root;
let state: CalendarState;

function Harness() {
  state = useCalendar();
  return createElement('div', { className: 'calendar-view' },
    createElement(CalendarNav, { state }),
    createElement(CalendarBody, { state }),
  );
}

const render = async () => {
  await act(async () => {
    root.render(createElement(Harness));
  });
};

const button = (needle: string): HTMLButtonElement | undefined =>
  [...host.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes(needle));

const press = async (el: Element, key: string) => {
  await act(async () => {
    el.dispatchEvent(new window.KeyboardEvent('keydown', { key, bubbles: true }));
  });
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0));
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  sessionStorage.clear();
  resetDeckMemoryForTests();
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.useRealTimers();
});

describe('per-day reading and watching tallies', () => {
  it('records what was read and watched each day, and which days count for the streak', () => {
    recordReading('book-1', '雪国', 600, 1200);
    recordReading('book-1', '雪国', 60, 100);
    recordWatching('file:c:/v/ep1.mkv', 'Frieren #1', 900);
    const day = getStudyDayActivity(TODAY);
    expect(day?.books).toEqual({ 'book-1': { title: '雪国', seconds: 660, chars: 1300 } });
    expect(day?.shows).toEqual({ 'file:c:/v/ep1.mkv': { title: 'Frieren #1', seconds: 900 } });
    expect(getActiveStudyDates().has(TODAY)).toBe(true);
    expect(getStudyDayActivity('2026-10-01')).toBeNull();
  });
});

describe('the day panel', () => {
  it('lists the day and opens each source: the book in the Library, the deck narrowed to the day', async () => {
    recordReading('book-1', '雪国', 600, 1200);
    addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }]);
    await render();
    const panel = host.querySelector('.cal-day-panel');
    expect(panel, 'no day panel beside the month grid').not.toBeNull();
    expect(panel!.textContent).toContain('雪国');

    const opened: unknown[] = [];
    const onOpen = (event: Event) => opened.push((event as CustomEvent).detail);
    window.addEventListener('os:open', onOpen);
    await act(async () => button('cal2.day.openBook')!.click());
    window.removeEventListener('os:open', onOpen);
    expect(opened).toContainEqual(expect.objectContaining({ section: 'library', intent: 'open', itemId: 'book-1' }));

    await act(async () => button('cal2.day.showAdded')!.click());
    const focus = JSON.parse(localStorage.getItem(PENDING_HANDOFF_KEYS.flashcardsFocus) ?? '{}');
    expect(focus).toMatchObject({ search: `added:${TODAY}` });
  });

  it('follows the selected cell, and a coming day offers Study ahead and a reminder that fires', async () => {
    const [card] = addDeckCardsTracked([{ word: '犬', reading: 'いぬ', meaning: 'dog', source: 'import' }]);
    const deck = loadDeck();
    // Schedule it two days out, the way a review would.
    localStorage.setItem('jp-flashcard-deck', JSON.stringify({
      folders: [],
      cards: deck.map((c) => (c.id === card.id
        ? { ...c, srs: { version: 1, dueAt: new Date(2026, 9, 10, 9).getTime(), intervalDays: 3, ease: 2.5, repetitions: 2, lapses: 0, lastReviewedAt: new Date(2026, 9, 7).getTime(), lastRating: 'good' } }
        : c)),
      savedAt: Date.now(),
    }));
    resetDeckMemoryForTests();
    await render();
    const cell = host.querySelector('#cal-month-cell-2026-10-10') as HTMLElement;
    await act(async () => cell.click());
    expect(host.querySelector('.cal-day-panel')!.getAttribute('aria-label')).toContain('2026');

    await act(async () => button('cal2.day.studyAhead')!.click());
    expect(JSON.parse(localStorage.getItem(PENDING_HANDOFF_KEYS.flashcardsFocus) ?? '{}'))
      .toMatchObject({ review: 'ahead', aheadUntil: '2026-10-10' });

    await act(async () => button('cal2.reminder.onDay')!.click());
    const reminder = loadEvents().find((event) => event.date === '2026-10-10');
    expect(reminder).toMatchObject({ category: 'reminder', reminder: 'at', startTime: '19:00', recurrence: 'none' });
    // The existing scheduler delivers it: nothing new runs in the background.
    const fireAt = new Date(2026, 9, 10, 19, 0, 30).getTime();
    const { due } = evaluateCalendarReminders({
      events: loadEvents(),
      now: fireAt,
      state: { fired: {}, lastRunAt: fireAt - 30_000 },
    });
    expect(due.map((r) => r.eventId)).toEqual([reminder!.id]);

    await act(async () => button('cal2.reminder.daily')!.click());
    expect(currentDailyStudyReminder()).toMatchObject({ recurrence: 'daily', reminder: 'at' });
    await act(async () => button('cal2.reminder.dailyActive')!.click());
    expect(currentDailyStudyReminder()).toBeNull();
  });

  it('copies the day as Markdown', async () => {
    recordReading('book-1', '雪国', 600, 1200);
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render();
    await act(async () => button('cal2.export.copyDay')!.click());
    expect(writeText).toHaveBeenCalledTimes(1);
    const calls = writeText.mock.calls as unknown as string[][];
    expect(calls[0][0]).toMatch(/^## /);
    expect(calls[0][0]).toContain('雪国');
    expect(host.querySelector('.cal-day-status')!.textContent).toBe('cal2.export.copied');
  });
});

describe('heat shading and the year view', () => {
  it('shades the month by study when the heatmap is on', async () => {
    recordReading('book-1', '雪国', 1800, 3000);
    await render();
    expect(host.querySelector(`#cal-month-cell-${TODAY}`)!.className).not.toContain('heat');
    await act(async () => button('cal2.heatmap.toggle')!.click());
    const cell = host.querySelector(`#cal-month-cell-${TODAY}`)!;
    expect(cell.className).toContain('heat');
    expect(cell.getAttribute('data-heat')).toBe('4');
    // The current streak is marked on the day itself, not only on the panel.
    expect(cell.className).toContain('in-streak');
  });

  it('is one tab stop that moves by day, week and month and opens a day with Enter', async () => {
    await render();
    await act(async () => button('cal2.mode.year')!.click());
    const grid = host.querySelector('.cal-year-grid') as HTMLElement;
    expect(grid.getAttribute('role')).toBe('grid');
    expect(grid.getAttribute('tabindex')).toBe('0');
    expect(host.querySelectorAll('.cal-year-cell[tabindex]')).toHaveLength(0);
    const active = () => grid.getAttribute('aria-activedescendant');
    expect(active()).toBe(`cal-year-cell-${TODAY}`);
    await press(grid, 'ArrowRight');
    expect(active()).toBe('cal-year-cell-2026-10-09');
    await press(grid, 'ArrowDown');
    expect(active()).toBe('cal-year-cell-2026-10-16');
    await press(grid, 'PageDown');
    expect(active()).toBe('cal-year-cell-2026-11-16');
    await press(grid, 'End');
    expect(active()).toBe('cal-year-cell-2026-11-30');
    await press(grid, 'PageDown');
    expect(active()).toBe('cal-year-cell-2026-12-28');
    // Past the year's end it stops on the last day rather than leaving the year on screen.
    for (let i = 0; i < 3; i += 1) await press(grid, 'PageDown');
    expect(active()).toBe('cal-year-cell-2026-12-31');
    await press(grid, 'Enter');
    expect(state.mode).toBe('month');
    expect(host.querySelector('.cal-month-grid')!.getAttribute('aria-activedescendant')).toBe('cal-month-cell-2026-12-31');
  });
});
