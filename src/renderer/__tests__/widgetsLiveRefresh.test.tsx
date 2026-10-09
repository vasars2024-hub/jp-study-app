// @vitest-environment jsdom
/**
 * wid2 — widgets that sat open across midnight showed yesterday: the habit
 * tracker kept yesterday as "today" (so a tick landed on the wrong day) and
 * Word of the Day kept yesterday's word, because nothing re-rendered them when
 * the date changed. Both now tick once a minute.
 *
 * Also pinned here: the habit day buttons say whether they are ticked.
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let root: Root | null = null;
let host: HTMLDivElement;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'Date'] });
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

const key = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

describe('habit tracker', () => {
  it('moves to the new day at midnight, and its day buttons are toggles', async () => {
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59, 30));
    const { HabitTracker } = await import('../widgets/more');
    const yesterday = new Date(2026, 9, 8);
    let settings: Record<string, unknown> = { habits: [{ id: 'h1', text: 'Kanji', days: { [key(yesterday)]: true } }] };
    root = createRoot(host);
    const render = async () => {
      await act(async () => {
        root?.render(<HabitTracker settings={settings} setSettings={(p) => { settings = { ...settings, ...p }; }} size={{ w: 300, h: 260 }} />);
      });
    };
    await render();
    const before = [...host.querySelectorAll<HTMLButtonElement>('.wgt-habit-day')];
    expect(before).toHaveLength(7);
    expect(before[6].getAttribute('aria-pressed')).toBe('true');
    expect(before[6].getAttribute('aria-label')).toContain('Kanji');

    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    const after = [...host.querySelectorAll<HTMLButtonElement>('.wgt-habit-day')];
    // Yesterday slid one place left; the newest box is the new day, unticked.
    expect(after[5].getAttribute('aria-pressed')).toBe('true');
    expect(after[6].getAttribute('aria-pressed')).toBe('false');
    expect(after[6].textContent).toBe('9');
  });
});

describe('word of the day', () => {
  it('changes word at midnight without a remount', async () => {
    vi.setSystemTime(new Date(2026, 9, 8, 23, 59, 30));
    const { savedWordsKey } = await import('../savedWords');
    localStorage.setItem(savedWordsKey('ja'), JSON.stringify([
      { word: '一', reading: 'いち', meaning: 'one', addedAt: 1 },
      { word: '二', reading: 'に', meaning: 'two', addedAt: 2 },
    ]));
    const { WordOfTheDay } = await import('../widgets/study');
    root = createRoot(host);
    await act(async () => {
      root?.render(<WordOfTheDay />);
    });
    const first = host.querySelector('.wgt-wotd-word')?.textContent;
    expect(first === '一' || first === '二').toBe(true);
    expect(host.querySelector('.wgt-wotd-word')?.getAttribute('lang')).toBe('ja');
    await act(async () => {
      vi.advanceTimersByTime(61_000);
    });
    expect(host.querySelector('.wgt-wotd-word')?.textContent).not.toBe(first);
  });
});
