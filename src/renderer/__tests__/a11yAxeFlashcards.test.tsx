// @vitest-environment jsdom
/**
 * a11y3 — axe-core (plus the house ARIA audit) over Flashcards: the deck list
 * with its preference panels open, a review before and after the answer, and
 * the scheduling panel on FSRS with the optimiser idle, running and finished.
 */
import { act, createElement } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_FSRS_WEIGHTS } from '../../shared/fsrs';
import type { FsrsHoldoutResult } from '../../shared/fsrsOptimizer';
import { a11yViolations } from './helpers/axeAudit';
import { button, cleanup, click, installJsdomShims, mount, settle, stubBridge } from './helpers/axeHarness';

interface StubJob {
  progress: (fraction: number) => void;
  resolve: (result: FsrsHoldoutResult) => void;
}
const jobs: StubJob[] = [];

vi.mock('../fsrsOptimizerAsync', () => {
  class FsrsOptimizerCancelled extends Error {}
  return {
    FsrsOptimizerCancelled,
    runFsrsOptimizer: (_entries: unknown[], _options: unknown, progress: (f: number) => void) => {
      const stub = { progress } as StubJob;
      const result = new Promise<FsrsHoldoutResult>((resolve) => {
        stub.resolve = resolve;
      });
      jobs.push(stub);
      return { result, cancel: () => undefined };
    },
  };
});

vi.mock('../reviewLog', async (importOriginal) => ({
  ...await importOriginal<typeof import('../reviewLog')>(),
  loadReviewLog: () => Promise.resolve([
    { id: 'a', at: 1, mode: 'review', cardId: 'c', rating: 'good', correct: true, isNew: true },
  ]),
}));

const CARDS = [
  { id: 'a', word: '食べる', reading: 'たべる', meaning: 'to eat', addedAt: 1, bookTitle: 'Book' },
  { id: 'b', word: '飲む', reading: 'のむ', meaning: 'to drink', addedAt: 2, bookTitle: 'Book' },
  { id: 'c', word: '走る', reading: 'はしる', meaning: 'to run', addedAt: 3, bookTitle: 'Book' },
];

beforeAll(() => {
  installJsdomShims();
  stubBridge({ listLibrary: [], jitenGetStore: { plan: [] }, flashcardListVoices: { voices: [] } });
});

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('jp-flashcard-deck', JSON.stringify({ folders: [], cards: CARDS }));
  jobs.length = 0;
});

afterEach(async () => {
  await cleanup();
});

describe('Flashcards — axe-core', () => {
  it('the deck list, with the preference panels open', async () => {
    const { default: FlashcardsView } = await import('../views/FlashcardsView');
    const { host } = await mount(createElement(FlashcardsView), 60);
    expect(host.textContent).toContain('食べる');
    const prefs = host.querySelector('details.flash-deck-prefs') as HTMLDetailsElement | null;
    if (prefs) prefs.open = true;
    await settle(20);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('a review, before and after the answer is shown', async () => {
    const { useFlashcards, FlashcardReviewMode } = await import('../components/flashcards/FlashcardsContent');
    type State = ReturnType<typeof useFlashcards>;
    let state!: State;
    function Harness() {
      state = useFlashcards();
      return state.mode === 'review' ? <FlashcardReviewMode state={state} /> : null;
    }
    const { host } = await mount(<Harness />);
    await act(async () => state.startEpubReview());
    await settle(20);
    expect(host.childElementCount, 'review rendered').toBeGreaterThan(0);
    expect(await a11yViolations(host)).toEqual([]);
    const reveal = button(host, /show|reveal|answer/i);
    if (reveal) await click(reveal);
    expect(await a11yViolations(host)).toEqual([]);
  });

  it('scheduling on FSRS: optimiser idle, running, and with a result', async () => {
    const { saveSchedulingConfig } = await import('../flashcardScheduling');
    saveSchedulingConfig({ algorithm: 'fsrs' });
    const { default: SchedulingPreferencesPanel } = await import('../components/flashcards/SchedulingPreferences');
    const { host } = await mount(createElement(SchedulingPreferencesPanel), 30);
    expect(await a11yViolations(host)).toEqual([]);

    const run = [...host.querySelectorAll('button')].find((b) => !b.disabled && /optimi/i.test(`${b.textContent} ${b.getAttribute('aria-label') ?? ''}`));
    expect(run, 'optimiser run button').toBeTruthy();
    await click(run);
    const job = jobs[jobs.length - 1];
    expect(job, 'optimiser started').toBeTruthy();
    act(() => job.progress(0.4));
    expect(await a11yViolations(host)).toEqual([]);

    const q = (logLoss: number) => ({ logLoss, rmse: 0.1, reviews: 400 });
    await act(async () => {
      job.resolve({
        status: 'ok',
        weights: DEFAULT_FSRS_WEIGHTS.map((w) => w * 1.01),
        trainReviews: 1200,
        excluded: 0,
        current: q(0.35),
        fitted: q(0.3),
        improved: true,
        thresholds: { train: 100, heldOut: 30, recommended: 1000 },
      } as FsrsHoldoutResult);
    });
    await settle(20);
    expect(await a11yViolations(host)).toEqual([]);
  });
});
