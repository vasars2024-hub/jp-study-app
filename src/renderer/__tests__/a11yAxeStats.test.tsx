// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over Statistics: the whole
 * view with some recorded study, and the review-insights charts with a log
 * (charts as named images, each with its data table and table headers).
 */
import { createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReviewLogEntry } from '../../shared/reviewLog';
import { a11yViolations } from './helpers/axeAudit';
import { cleanup, installJsdomShims, mount, stubBridge } from './helpers/axeHarness';

const log: { rows: ReviewLogEntry[] } = { rows: [] };

vi.mock('../reviewLog', async (importOriginal) => ({
  ...await importOriginal<typeof import('../reviewLog')>(),
  loadReviewLog: () => Promise.resolve(log.rows),
  onReviewLogChanged: () => () => undefined,
}));
vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [], jitenGetStore: { plan: [] } });
});

beforeEach(async () => {
  localStorage.clear();
  const { addDeckCardsTracked, resetDeckMemoryForTests } = await import('../flashcardDeck');
  resetDeckMemoryForTests();
  const [card] = addDeckCardsTracked([
    { word: '猫', reading: 'ねこ', meaning: 'cat', source: 'epub', bookId: 'b1', bookTitle: '吾輩は猫である' },
  ]);
  const now = Date.now();
  log.rows = [
    { id: 'a', at: now - 1000, mode: 'review', cardId: card.id, rating: 'good', correct: true, prevIntervalDays: 3, durationMs: 5000 },
    { id: 'b', at: now - 2 * 86_400_000, mode: 'review', cardId: card.id, rating: 'again', correct: false, prevIntervalDays: 30 },
  ];
  const { recordReading } = await import('../stats');
  recordReading('b1', '吾輩は猫である', 600, 1200);
});

afterEach(async () => {
  await cleanup();
});

describe('Statistics — axe-core', () => {
  it('the Statistics view', async () => {
    const { default: StatisticsView } = await import('../views/StatisticsView');
    const { host } = await mount(createElement(StatisticsView), 60);
    expect(host.textContent?.length).toBeGreaterThan(40);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('review insights with charts and tables', async () => {
    const { default: StatsReviewInsights } = await import('../components/stats/StatsReviewInsights');
    const { host } = await mount(createElement(StatsReviewInsights), 30);
    expect(host.querySelectorAll('.stats2-chart').length, 'charts drawn').toBeGreaterThan(2);
    // The data tables sit in <details>; open them so axe walks their headers.
    for (const d of host.querySelectorAll('details')) (d as HTMLDetailsElement).open = true;
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('review insights, empty', async () => {
    log.rows = [];
    const { default: StatsReviewInsights } = await import('../components/stats/StatsReviewInsights');
    const { host } = await mount(createElement(StatsReviewInsights), 30);
    expect(await a11yViolations(host)).toEqual([]);
  });
});
