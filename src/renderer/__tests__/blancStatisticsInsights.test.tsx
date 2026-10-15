// @vitest-environment jsdom
/**
 * Blanc's Statistics panel mounts the review insights (retention, per-deck Due,
 * intervals) that Study OS shows — lazily, in their own chunk, so the Blanc
 * shell's boot graph never carries them (`blancBootGraph` checks the graph).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const loaded = vi.hoisted(() => ({ insights: 0 }));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string) => key, lang: 'en' }),
}));
vi.mock('../components/stats/StatsContent', () => ({
  StatsBooks: () => null,
  StatsCards: () => null,
  StatsChart: () => null,
  StatsShows: () => null,
  WordKnowledge: () => null,
  useStats: () => ({
    summary: { totalSeconds: 0, totalChars: 0, daysActive: 0, books: [], shows: [] },
    hasData: false,
    refresh: () => undefined,
    resetAllStats: async () => undefined,
  }),
}));
vi.mock('../stats', () => ({ formatDuration: () => '0m' }));
vi.mock('../components/stats/StatsGames', () => ({ StatsGames: () => null }));
vi.mock('../components/stats/StatsReviewInsights', () => {
  loaded.insights += 1;
  return {
    default: () => createElement('section', { className: 'stats2-insights', 'aria-label': 'stats2.title' }),
  };
});

import { BlancStatisticsPanel } from '../components/blanc/BlancStatisticsPanel';

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('Blanc Statistics panel', () => {
  it('loads the review insights only when the panel renders, then shows them', async () => {
    expect(loaded.insights).toBe(0);
    await act(async () => { root.render(createElement(BlancStatisticsPanel)); });
    await vi.waitFor(() => expect(host.querySelector('.blanc-statistics-panel .stats2-insights')).not.toBeNull());
    expect(loaded.insights).toBe(1);
  });
});
