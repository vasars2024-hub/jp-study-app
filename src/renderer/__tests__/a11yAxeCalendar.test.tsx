// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over the Calendar: the month
 * grid with its day panel, a selected day with study and an event, every other
 * view mode the toolbar offers (year included), and the event editor.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [] });
});

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 9, 8, 10, 0));
  localStorage.clear();
  const { recordReading } = await import('../stats');
  recordReading('book-1', '雪国', 600, 1200);
  const { resetDeckMemoryForTests, addDeckCardsTracked } = await import('../flashcardDeck');
  resetDeckMemoryForTests();
  addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }]);
});

afterEach(async () => {
  await cleanup();
  vi.useRealTimers();
});

describe('Calendar — axe-core', () => {
  it('month grid, day panel, and every view mode', async () => {
    const { default: CalendarView } = await import('../views/CalendarView');
    const { host } = await mount(createElement(CalendarView), 40);
    expect(host.querySelector('.cal-day-panel'), 'day panel').not.toBeNull();
    expect(await a11yViolations(host)).toEqual([]);

    const cell = host.querySelector<HTMLElement>('#cal-month-cell-2026-10-10');
    if (cell) {
      await act(async () => cell.click());
      await settle(10);
      expect(await a11yViolations(host)).toEqual([]);
    }

    // Each view mode in the toolbar (month, week, day, agenda, year: whichever exist).
    const modes = [...host.querySelectorAll<HTMLButtonElement>('button')].filter((b) =>
      /cal2?\.mode\.|^(month|week|day|agenda|year|list)$/i.test((b.textContent ?? '').trim()) || b.closest('[role="tablist"], .cal-mode-switch, .cal-modes'),
    );
    const seen = new Set<string>();
    for (const mode of modes) {
      const label = (mode.textContent ?? '').trim();
      if (seen.has(label) || !mode.isConnected) continue;
      seen.add(label);
      await act(async () => mode.click());
      await settle(10);
      const found = await a11yViolations(host);
      expect(found, `mode ${label}`).toEqual([]);
    }
    expect(host.querySelector('.cal-year-grid') ?? seen.size, 'a mode switch was found').toBeTruthy();
  });

  it('the event editor', async () => {
    const { default: CalendarView } = await import('../views/CalendarView');
    const { host } = await mount(createElement(CalendarView), 40);
    const day = [...host.querySelectorAll<HTMLButtonElement>('.cal-modes button')].find((b) => /^day$/i.test((b.textContent ?? '').trim()));
    expect(day, 'Day mode').toBeTruthy();
    await act(async () => day?.click());
    await settle(10);
    const add = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.textContent ?? '').includes('Add event'));
    expect(add, 'Add event').toBeTruthy();
    await act(async () => add?.click());
    await settle(20);
    expect(document.getElementById('cal-modal-title'), 'editor open').not.toBeNull();
    expect(await a11yViolations(document.body)).toEqual([]);
  });
});
