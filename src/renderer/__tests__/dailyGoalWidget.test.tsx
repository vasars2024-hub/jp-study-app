// @vitest-environment jsdom
/**
 * J7, rendered: the "Daily goals" widget shows today's study goal (reviews, new cards,
 * minutes) from the real review log, its targets move with − / +, and goals a user had
 * typed into the old free-text widget are kept as a daily checklist.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { ReviewLogEntry } from '../../shared/reviewLog';

const now = Date.now();
const log: ReviewLogEntry[] = [
  { id: 'a', at: now, mode: 'review', correct: true, isNew: true },
  { id: 'b', at: now, mode: 'review', correct: true },
];
vi.mock('../reviewLog', () => ({
  loadReviewLog: async () => log,
  onReviewLogChanged: () => () => undefined,
}));

import { DailyGoals } from '../widgets/more';

let root: Root | null = null;

beforeAll(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.replaceChildren();
  localStorage.clear();
});

async function mount(settings: Record<string, unknown>, setSettings = vi.fn()): Promise<HTMLElement> {
  const host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(<DailyGoals settings={settings} setSettings={setSettings} size={{ w: 280, h: 320 }} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

describe('the daily goal widget', () => {
  it('counts today\'s reviews and new cards from the review log', async () => {
    const host = await mount({});
    const row = (metric: string) => host.querySelector(`[data-metric="${metric}"]`);
    expect(row('reviews')?.querySelector('.daily-goal-count')?.textContent).toMatch(/^2\b/);
    expect(row('newCards')?.querySelector('.daily-goal-count')?.textContent).toMatch(/^1\b/);
    expect(row('minutes')).toBeTruthy();
    expect(host.querySelector('input[placeholder]'), 'no free-text goal entry any more').toBeNull();
  });

  it('+ raises a target, and the change is remembered', async () => {
    const host = await mount({});
    const count = () => host.querySelector('[data-metric="minutes"] .daily-goal-count')?.textContent ?? '';
    const before = count();
    const raise = host.querySelectorAll<HTMLButtonElement>('[data-metric="minutes"] .daily-goal-ctrls button')[1];
    await act(async () => {
      raise?.click();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(count()).not.toBe(before);
    expect(JSON.parse(localStorage.getItem('jp-daily-goal-v1') ?? '{}')).toEqual({ minutes: 35 });
  });

  it('keeps goals typed into the old widget as a checklist that ticks for today', async () => {
    const setSettings = vi.fn();
    const host = await mount({ goals: [{ id: 'g1', text: 'Read one NHK article', target: 3, done: 1 }] }, setSettings);
    const own = host.querySelector('.wgt-goals-own');
    expect(own?.textContent).toContain('Read one NHK article');
    const box = own?.querySelector<HTMLInputElement>('input[type="checkbox"]');
    expect(box?.checked).toBe(false);
    await act(async () => {
      box?.click();
    });
    const written = setSettings.mock.calls.at(-1)?.[0] as { goals: { doneDay?: string }[] };
    expect(written.goals[0]?.doneDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
