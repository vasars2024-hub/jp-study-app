// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import StatisticsView from '../views/StatisticsView';
import { statsKey, todayDayKey } from '../stats';

vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));
vi.mock('../components/stats/StatsContent', async (original) => ({
  ...await original<typeof import('../components/stats/StatsContent')>(),
  WordKnowledge: () => null,
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-materials');
  localStorage.clear();
});

async function render(material: string, watchSeconds: number) {
  if (material) document.documentElement.setAttribute('data-materials', material);
  localStorage.setItem(statsKey(), JSON.stringify({
    days: { [todayDayKey()]: { seconds: 0, chars: 0, watchSeconds } },
    books: {},
    shows: watchSeconds ? { 'file:/lesson.mp4': { title: '日本語の授業', seconds: watchSeconds, lastWatched: Date.now() } } : {},
  }));
  await act(async () => { root.render(<StatisticsView />); });
}

describe.each(['', 'aero', 'wired'])('Statistics material %s retains the watch channel', (material) => {
  it('shows watch-only activity in the totals, chart and per-show history', async () => {
    await render(material, 120);
    expect(host.textContent).toContain('total watched');
    expect(host.textContent).toContain('watched today');
    expect(host.textContent).toContain('shows watched');
    expect(host.textContent).toContain('日本語の授業');
    expect(host.querySelectorAll('.stats-by-show .stats-book-row-item')).toHaveLength(1);
    const watched = host.querySelector<HTMLElement>('.stats-bar-fill.watch');
    expect(watched?.style.height).toBe('100%');
    // Watching must never silently become reading time.
    expect(host.querySelectorAll('.stats-bar-fill:not(.watch)')).toHaveLength(0);
    expect(host.querySelectorAll('.stats-chart:not(.stats-reading-speed .stats-chart) .stats-bar-col')).toHaveLength(14);
  });

  it('does not invent watch rows or totals for an empty store', async () => {
    await render(material, 0);
    expect(host.textContent).not.toContain('total watched');
    expect(host.querySelector('.stats-by-show')).toBeNull();
    expect(host.querySelector('.stats-bar-fill.watch')).toBeNull();
  });
});
