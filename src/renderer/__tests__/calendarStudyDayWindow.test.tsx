// @vitest-environment jsdom
/**
 * The real Calendar between midnight and the day-start hour (4 am by default).
 *
 * At 00:30 on Oct 14 it opened on Oct 14 and highlighted it as today, but its day panel
 * called Oct 14 'future' and showed the schedule of the study day that starts at 4 am (no
 * "due today", no Review button), while tonight's study sat on the Oct 13 cell. Now the
 * calendar date stays today and its cell shows the study day still running; the cell before
 * it shows events only (`calendarCell` in shared/calendarDayDetail.ts). The same render at
 * 12:00, and with a midnight day start, maps every cell to its own date.
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
vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));

import { CalendarBody, CalendarNav, useCalendar } from '../components/calendar/CalendarContent';
import { recordReading } from '../stats';
import { addDeckCardsTracked, loadDeck, resetDeckMemoryForTests } from '../flashcardDeck';
import { enrolGrammarPoints, saveGrammarSrs } from '../grammarSrs';
import { saveSchedulingConfig } from '../flashcardScheduling';
import { DEFAULT_DAY_START_HOUR, setStudyDayStartHour } from '../../shared/studyDay';

let host: HTMLDivElement;
let root: Root;

function Harness() {
  const state = useCalendar();
  return createElement('div', { className: 'calendar-view' },
    createElement(CalendarNav, { state }),
    createElement(CalendarBody, { state }),
  );
}

const cell = (key: string) => host.querySelector(`#cal-month-cell-${key}`) as HTMLElement;
const panelText = () => host.querySelector('.cal-day-panel')?.textContent ?? '';
const hasButton = (needle: string) => [...host.querySelectorAll('.cal-day-panel button')].some((b) => (b.textContent ?? '').includes(needle));

/** Set the clock, then seed: a read tonight, two cards and three grammar points around 4 am. */
async function renderAt(now: Date, dayStartHour: number): Promise<void> {
  vi.setSystemTime(now);
  // Through the setting, as Settings ▸ Scheduling stores it (stores re-read it).
  saveSchedulingConfig({ dayStartHour });
  recordReading('book-1', '雪国', 600, 1200);
  const cards = addDeckCardsTracked([
    { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' },
    { word: '犬', reading: 'いぬ', meaning: 'dog', source: 'import' },
  ]);
  const dueAt = [new Date(2026, 9, 13, 22).getTime(), new Date(2026, 9, 14, 9).getTime()];
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({
    folders: [],
    cards: loadDeck().map((c) => {
      const i = cards.findIndex((card) => card.id === c.id);
      return i < 0 ? c : {
        ...c,
        srs: { version: 1, dueAt: dueAt[i], intervalDays: 3, ease: 2.5, repetitions: 2, lapses: 0, lastReviewedAt: new Date(2026, 9, 10).getTime(), lastRating: 'good' },
      };
    }),
    savedAt: Date.now(),
  }));
  resetDeckMemoryForTests();
  saveGrammarSrs({
    ...enrolGrammarPoints({}, ['ready'], new Date(2026, 9, 14, 0, 0).getTime()),
    ...enrolGrammarPoints({}, ['before-4am'], new Date(2026, 9, 14, 2, 0).getTime()),
    ...enrolGrammarPoints({}, ['morning'], new Date(2026, 9, 14, 9, 0).getTime()),
  });
  await act(async () => {
    root.render(createElement(Harness));
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
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
  setStudyDayStartHour(DEFAULT_DAY_START_HOUR);
  vi.useRealTimers();
});

describe('the Calendar at 00:30 with a 4 am day start', () => {
  it("opens on the calendar date as today, with tonight's study and what is owed by 4 am", async () => {
    await renderAt(new Date(2026, 9, 14, 0, 30), 4);
    expect(cell('2026-10-14').classList.contains('today')).toBe(true);
    expect(cell('2026-10-13').classList.contains('today')).toBe(false);
    expect(cell('2026-10-14').getAttribute('aria-selected')).toBe('true');

    // Tonight's reading, filed under study day Oct 13, is on today's panel...
    expect(panelText()).toContain('雪国');
    // ...with the card overdue since 22:00 (not the one due at 9:00) and the Review button,
    expect(panelText()).toContain('cal2.day.due|{"count":1}');
    expect(hasButton('cal2.day.reviewNow')).toBe(true);
    // ...and grammar owed by 4 am: two points, one of them ready now.
    expect(panelText()).toContain('gram2.due.today|{"count":2}');
    expect(panelText()).toContain('gram2.due.readyNow|{"count":1}');
    expect(hasButton('gram2.due.review')).toBe(true);
    // The grid says the same on the same cell.
    expect(cell('2026-10-14').querySelector('.cal-study-line')).not.toBeNull();
    expect(cell('2026-10-13').querySelector('.cal-study-line')).toBeNull();
  });

  it('shows the day before with events only, not the same study a second time', async () => {
    await renderAt(new Date(2026, 9, 14, 0, 30), 4);
    await act(async () => cell('2026-10-13').click());
    const text = panelText();
    expect(text).not.toContain('雪国');
    expect(text).not.toContain('cal2.day.nothing');
    expect(text).not.toContain('cal2.day.section.due');
    expect(text).not.toContain('gram2.due');
  });

  it('the Today button returns to the calendar date', async () => {
    await renderAt(new Date(2026, 9, 14, 0, 30), 4);
    await act(async () => cell('2026-10-20').click());
    const today = [...host.querySelectorAll('.cal-nav button')].find((b) => b.textContent === 'calendar.today') as HTMLElement;
    await act(async () => today.click());
    expect(cell('2026-10-14').classList.contains('today')).toBe(true);
  });
});

describe('the Calendar at 12:00 with a 4 am day start', () => {
  it("reads today's cell under its own date", async () => {
    await renderAt(new Date(2026, 9, 14, 12, 0), 4);
    expect(cell('2026-10-14').classList.contains('today')).toBe(true);
    expect(panelText()).toContain('雪国');
    expect(panelText()).toContain('cal2.day.due|{"count":2}');
    expect(panelText()).toContain('gram2.due.today|{"count":3}');
    expect(hasButton('cal2.day.reviewNow')).toBe(true);
    await act(async () => cell('2026-10-13').click());
    expect(panelText()).toContain('cal2.day.nothing');
  });
});

describe('the Calendar with a midnight day start', () => {
  it.each([
    ['00:30', new Date(2026, 9, 14, 0, 30)],
    ['12:00', new Date(2026, 9, 14, 12, 0)],
  ])('reads today under its own date at %s', async (_label, now) => {
    await renderAt(now, 0);
    expect(cell('2026-10-14').classList.contains('today')).toBe(true);
    // The study day is the calendar date: everything due by midnight is owed today.
    expect(panelText()).toContain('雪国');
    expect(panelText()).toContain('cal2.day.due|{"count":2}');
    expect(panelText()).toContain('gram2.due.today|{"count":3}');
    expect(cell('2026-10-14').querySelector('.cal-study-line')).not.toBeNull();
    expect(cell('2026-10-13').querySelector('.cal-study-line')).toBeNull();
  });
});
