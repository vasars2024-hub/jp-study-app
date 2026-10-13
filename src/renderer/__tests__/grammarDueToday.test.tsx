// @vitest-environment jsdom
/**
 * The Calendar's grammar line for today and the Review tab count different
 * things: the Calendar owes everything due by the end of today (its convention
 * for cards too), Review offers `dueAt <= now`. The line used to print the larger
 * number as plain "N due" beside a Review button that opened fewer. It is now
 * labelled "due today" and says how many are ready now when the two differ.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../extensionBridgeUi', () => ({ openAppSection: vi.fn() }));
vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}:${Object.values(vars).join(',')}` : key),
    lang: 'en',
  }),
}));

import { GrammarDueDayLine } from '../components/grammar/GrammarDueChip';
import { grammarDueOnDay, grammarDueSummary } from '../grammarDue';
import { enrolGrammarPoints, saveGrammarSrs } from '../grammarSrs';

const NOON = new Date(2026, 9, 12, 12, 0).getTime();
const TODAY = '2026-10-12';

let root: Root | null = null;
let host: HTMLDivElement;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOON);
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
});
afterEach(async () => {
  if (root) await act(async () => root?.unmount());
  root = null;
  document.body.replaceChildren();
  vi.useRealTimers();
});

async function render(isToday = true): Promise<void> {
  root = createRoot(host);
  await act(async () => root?.render(<GrammarDueDayLine dateKey={TODAY} isToday={isToday} />));
}

describe('Calendar today vs Review due', () => {
  it('confirms the two counts differ for a point due later today', () => {
    const s = {
      ...enrolGrammarPoints({}, ['now'], NOON - 60_000),
      ...enrolGrammarPoints({}, ['tonight'], NOON + 6 * 3_600_000),
    };
    const start = new Date(2026, 9, 12).getTime();
    expect(grammarDueOnDay(s, start, start + 86_400_000, true)).toBe(2);
    expect(grammarDueSummary(s, NOON).due).toBe(1);
  });

  it('labels today "due today" and adds the ready-now count when they differ', async () => {
    saveGrammarSrs({
      ...enrolGrammarPoints({}, ['now'], NOON - 60_000),
      ...enrolGrammarPoints({}, ['tonight'], NOON + 6 * 3_600_000),
    });
    await render();
    const line = host.querySelector('.gram-due-day')!;
    expect(line.textContent).toContain('gram2.due.today:2');
    expect(line.textContent).toContain('gram2.due.readyNow:1');
    expect(line.querySelector('button')).not.toBeNull();
  });

  it('omits the ready-now count when everything due today is ready', async () => {
    saveGrammarSrs(enrolGrammarPoints({}, ['now'], NOON - 60_000));
    await render();
    const line = host.querySelector('.gram-due-day')!;
    expect(line.textContent).toContain('gram2.due.today:1');
    expect(line.textContent).not.toContain('gram2.due.readyNow');
  });

  it('offers no Review button when nothing is ready yet', async () => {
    saveGrammarSrs(enrolGrammarPoints({}, ['tonight'], NOON + 6 * 3_600_000));
    await render();
    const line = host.querySelector('.gram-due-day')!;
    expect(line.textContent).toContain('gram2.due.today:1');
    expect(line.textContent).toContain('gram2.due.readyNow:0');
    expect(line.querySelector('button')).toBeNull();
  });
});
