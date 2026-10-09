// @vitest-environment jsdom
/**
 * Statistics review insights, rendered: every chart carries a spoken summary
 * and a data table, the per-deck table joins the log to the deck, and an empty
 * history says what will appear instead of drawing empty axes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ReviewLogEntry } from '../../shared/reviewLog';

const log: { rows: ReviewLogEntry[] } = { rows: [] };

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));
vi.mock('../reviewLog', () => ({
  loadReviewLog: () => Promise.resolve(log.rows),
  onReviewLogChanged: () => () => undefined,
}));

import StatsReviewInsights from '../components/stats/StatsReviewInsights';
import { addDeckCardsTracked } from '../flashcardDeck';

let host: HTMLDivElement;
let root: Root;

async function mount(): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(StatsReviewInsights)); });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  log.rows = [];
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('StatsReviewInsights', () => {
  it('explains itself instead of drawing empty charts when nothing was reviewed', async () => {
    await mount();
    expect(host.textContent).toContain('stats2.empty');
    expect(host.querySelector('.stats2-chart')).toBeNull();
  });

  it('draws accessible charts and a per-deck table from the log', async () => {
    const [card] = addDeckCardsTracked([
      { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub', bookId: 'b1', bookTitle: '吾輩は猫である' },
    ]);
    const now = Date.now();
    log.rows = [
      { id: 'a', at: now - 1000, mode: 'review', cardId: card.id, rating: 'good', correct: true, prevIntervalDays: 3, durationMs: 5000 },
      { id: 'b', at: now - 2 * 86_400_000, mode: 'review', cardId: card.id, rating: 'again', correct: false, prevIntervalDays: 30 },
    ];
    await mount();
    const charts = Array.from(host.querySelectorAll('.stats2-chart'));
    expect(charts.length).toBeGreaterThanOrEqual(5);
    // Every plot is one image with a sentence, never an unnamed stack of boxes.
    for (const chart of charts) {
      expect(chart.getAttribute('role')).toBe('img');
      expect(chart.getAttribute('aria-label')?.length).toBeGreaterThan(5);
    }
    // ... and the same numbers as a table.
    expect(host.querySelectorAll('.stats2-data table').length).toBe(charts.length);
    const labels = charts.map((chart) => chart.getAttribute('aria-label') ?? '');
    expect(labels.some((label) => label.startsWith('stats2.reviews.summary(total=2'))).toBe(true);
    expect(labels.some((label) => label.startsWith('stats2.time.summary('))).toBe(true);
    const deckRow = host.querySelector('.stats2-decks tbody tr');
    expect(deckRow?.textContent).toContain('吾輩は猫である');
    // Must not reuse the 14-day chart's classes, which other suites count.
    expect(host.querySelector('.stats-bar-fill, .stats-bar-col')).toBeNull();
  });
});
