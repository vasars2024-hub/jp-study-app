// @vitest-environment jsdom
/**
 * The optimiser's states in the scheduling panel, with the worker job stubbed:
 * progress while it runs, Cancel that stops it and says so, an error shown
 * rather than swallowed, and new parameters offered only when the held-out
 * check says they beat the ones in use.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { DEFAULT_FSRS_WEIGHTS } from '../../shared/fsrs';
import type { FsrsHoldoutResult } from '../../shared/fsrsOptimizer';

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars ? `${key}(${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')})` : key
    ),
    lang: 'en',
  }),
}));
vi.mock('../reviewLog', () => ({
  loadReviewLog: () => Promise.resolve([
    { id: 'a', at: 1, mode: 'review', cardId: 'c', rating: 'good', correct: true, isNew: true },
    { id: 'b', at: 2, mode: 'game', cardId: 'c', correct: true },
  ]),
  onReviewLogChanged: () => () => undefined,
  appendReviewLog: (entry: object) => ({ ...entry, id: 'x', at: 0 }),
  removeReviewLogEntry: () => undefined,
}));

interface StubJob {
  entries: unknown[];
  options: Record<string, unknown>;
  progress: (fraction: number) => void;
  resolve: (result: FsrsHoldoutResult) => void;
  reject: (error: Error) => void;
  cancelled: boolean;
}
const jobs: StubJob[] = [];

vi.mock('../fsrsOptimizerAsync', () => {
  class FsrsOptimizerCancelled extends Error {}
  return {
    FsrsOptimizerCancelled,
    runFsrsOptimizer: (entries: unknown[], options: Record<string, unknown>, progress: (f: number) => void) => {
      const stub = { entries, options, progress, cancelled: false } as StubJob;
      const result = new Promise<FsrsHoldoutResult>((resolve, reject) => {
        stub.resolve = resolve;
        stub.reject = reject;
      });
      jobs.push(stub);
      return {
        result,
        cancel: () => {
          stub.cancelled = true;
          stub.reject(new FsrsOptimizerCancelled('cancelled'));
        },
      };
    },
  };
});

import SchedulingPreferencesPanel from '../components/flashcards/SchedulingPreferences';
import { loadSchedulingConfig, saveSchedulingConfig } from '../flashcardScheduling';

let host: HTMLDivElement;
let root: Root;

function mount(): void {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => { root.render(createElement(SchedulingPreferencesPanel)); });
}

function button(label: string): HTMLButtonElement {
  const found = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === label);
  if (!found) throw new Error(`no button ${label}`);
  return found;
}

async function flush(): Promise<void> {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function start(): Promise<StubJob> {
  await act(async () => { button('srs2.optimizer.run').click(); });
  await flush();
  const job = jobs[jobs.length - 1];
  if (!job) throw new Error('no job started');
  return job;
}

const quality = (logLoss: number, rmse: number, reviews: number) => ({ logLoss, rmse, reviews });
const thresholds = { train: 100, heldOut: 30, recommended: 1000 };

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  localStorage.clear();
  jobs.length = 0;
  saveSchedulingConfig({ algorithm: 'fsrs' });
});

afterEach(() => {
  act(() => { root.unmount(); });
  host.remove();
});

describe('FSRS optimiser in the panel', () => {
  it('hands the whole log to the job and compares against the weights in use', async () => {
    mount();
    const job = await start();
    expect(job.entries).toHaveLength(2);
    expect(job.options.current).toBeDefined();
  });

  it('shows progress while it runs, and Cancel stops it and says so', async () => {
    mount();
    const job = await start();
    expect(button('srs2.optimizer.running').disabled).toBe(true);
    act(() => { job.progress(0.42); });
    expect(host.textContent).toContain('srs3.optimizer.progress(percent=42)');
    expect(host.querySelector('progress')?.getAttribute('value')).toBe('42');
    await act(async () => { button('srs3.optimizer.cancel').click(); });
    await flush();
    expect(job.cancelled).toBe(true);
    expect(host.textContent).toContain('srs3.optimizer.cancelled');
    expect(host.querySelector('progress')).toBeNull();
    expect(button('srs2.optimizer.run').disabled).toBe(false);
  });

  it('shows an error instead of swallowing it, and changes nothing', async () => {
    mount();
    const job = await start();
    await act(async () => { job.reject(new Error('worker crashed')); });
    await flush();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe('srs3.optimizer.error(message=worker crashed)');
    expect(loadSchedulingConfig().fsrsWeights).toBeUndefined();
  });

  it('offers new parameters that beat the current ones on held-out reviews, with locale-formatted numbers', async () => {
    mount();
    const job = await start();
    const weights = [...DEFAULT_FSRS_WEIGHTS];
    weights[8] = 1.9;
    await act(async () => {
      job.resolve({
        status: 'ok', weights, trainReviews: 1200, excluded: 3, improved: true,
        current: quality(0.35428, 0.31626, 300), fitted: quality(0.35065, 0.3156, 300), thresholds,
      });
    });
    await flush();
    expect(host.textContent).toContain(
      'srs3.optimizer.heldOutResult(count=300,train=1200,before=0.354,after=0.351,rmseBefore=0.316,rmseAfter=0.316)',
    );
    expect(host.textContent).toContain('srs3.optimizer.excluded(count=3)');
    await act(async () => { button('srs2.optimizer.apply').click(); });
    expect(loadSchedulingConfig().fsrsWeights).toEqual(weights);
  });

  it('offers nothing when the fit does not beat the current parameters on held-out reviews', async () => {
    mount();
    const job = await start();
    await act(async () => {
      job.resolve({
        status: 'ok', weights: [], trainReviews: 1200, excluded: 0, improved: false,
        current: quality(0.3565, 0.3178, 300), fitted: quality(0.3595, 0.3184, 300), thresholds,
      });
    });
    await flush();
    expect(host.textContent).toContain('srs3.optimizer.heldOutNoGain(count=300,before=0.357,after=0.36)');
    expect(Array.from(host.querySelectorAll('button')).some((b) => b.textContent === 'srs2.optimizer.apply')).toBe(false);
  });

  it('says when there is too little recent history to check a fit', async () => {
    mount();
    const job = await start();
    await act(async () => {
      job.resolve({
        status: 'insufficient-data', weights: [], trainReviews: 400, excluded: 0, improved: false, shortOf: 'held-out',
        current: quality(0, 0, 12), fitted: quality(0, 0, 12), thresholds,
      });
    });
    await flush();
    expect(host.textContent).toContain('srs3.optimizer.tooFewHeldOut(count=12,min=30)');
  });
});
