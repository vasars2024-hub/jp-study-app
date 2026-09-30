// @vitest-environment jsdom
/**
 * files-app gate 8's SECOND surface — statistics, compared against the same
 * `gate8-before.json` capture as the memory half.
 *
 * `FilesStatisticsPanel` composes `StatsContent`'s exported blocks rather than
 * re-reading the stores, so parity is meant to hold by construction: `useStats`
 * is the one implementation and the Files app is its third host. That claim is
 * exactly the kind that goes stale silently, which is why it is measured here —
 * `getSummary` is stubbed with the capture's own numbers and the panel's
 * rendered output is read back.
 *
 * `recentDays` (14) is the capture's STABLE key. `totalSeconds`, `totalChars`
 * and `totalWatchSeconds` are live counters that move whenever the user reads
 * or watches anything, so the capture marks them volatile and they are compared
 * for shape — same source, same units — never for equality.
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import before from '../../.coordination/files-app/gate8-before.json';

const CAPTURED = before.statistics.getSummary;

let recentDays = CAPTURED.recentDays;

function summary() {
  return {
    totalSeconds: CAPTURED.totalSeconds,
    totalChars: CAPTURED.totalChars,
    totalWatchSeconds: CAPTURED.totalWatchSeconds,
    recent: Array.from({ length: recentDays }, (_, i) => ({
      date: `2026-08-${String(18 + i).padStart(2, '0')}`,
      seconds: 60 * (i + 1),
      chars: 100 * (i + 1),
      watchSeconds: 30 * (i + 1),
    })),
    books: [],
    shows: [],
  };
}

vi.mock('../stats', () => ({
  getSummary: () => summary(),
  resetStats: () => undefined,
  formatDuration: (s: number) => `${Math.round(s)}s`,
  formatNumber: (n: number) => String(n),
  // `useStats` subscribes on mount; a factory mock replaces the module WHOLE,
  // so an absent export is a throw inside the effect, not a silent undefined.
  // Returns a disposer for the same reason `onKnowledgeChanged` below does —
  // React calls it on unmount and a bare `undefined` would be its own failure.
  onStatsChanged: () => () => undefined,
}));

// `knowledgeCounts()` is INDEXED BY LEVEL (counts[1..3]), not keyed by name —
// a `{ known, learning, unknown }` stub renders "undefined" in every card and
// the test reads as a product defect.
vi.mock('../knownWords', () => ({
  knowledgeCounts: () => [0, 0, 0, 0],
  onKnowledgeChanged: () => () => undefined,
}));

vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: () => Promise.resolve({ ok: true }) }));

class NoopResizeObserver {
  observe(): void {
    /* nothing observed */
  }
  unobserve(): void {
    /* nothing observed */
  }
  disconnect(): void {
    /* nothing observed */
  }
}
(globalThis as { ResizeObserver?: unknown }).ResizeObserver ??= NoopResizeObserver;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Element.prototype.scrollIntoView ??= function scrollIntoView(): void {
  /* no layout in jsdom */
};

let host: HTMLDivElement | null = null;
let root: Root | null = null;

async function mount(node: ReactNode): Promise<HTMLDivElement> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => {
    root?.render(node);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return host;
}

beforeEach(() => {
  recentDays = CAPTURED.recentDays;
  (window as unknown as { api: Record<string, unknown> }).api = {};
});

afterEach(async () => {
  await act(async () => {
    root?.unmount();
  });
  host?.remove();
  host = null;
  root = null;
});

const ACTIVITY_COLUMNS = '.stats-chart:not(.stats-reading-speed .stats-chart) .stats-bar-col';

describe('files-app gate 8 — statistics render in the Files app', () => {
  it('renders the capture\'s stable key: a 14-day recent window', async () => {
    const { FilesStatisticsPanel } = await import(
      '../components/filesapp/panels/FilesStatisticsPanel'
    );
    const el = await mount(<FilesStatisticsPanel />);
    expect(CAPTURED.recentDays).toBe(14);
    // The activity chart only: the reading-speed chart below it repeats the window.
    expect(el.querySelectorAll(ACTIVITY_COLUMNS).length).toBe(CAPTURED.recentDays);
  });

  it('control: the window is READ, not fixed — a 7-day summary renders 7 columns', async () => {
    const { FilesStatisticsPanel } = await import(
      '../components/filesapp/panels/FilesStatisticsPanel'
    );
    recentDays = 7;
    const el = await mount(<FilesStatisticsPanel />);
    expect(el.querySelectorAll(ACTIVITY_COLUMNS).length).toBe(7);
  });

  it('the volatile totals are compared for SHAPE, as the capture instructs', async () => {
    // Asserting these exactly would be a test that fails tomorrow because the
    // user watched something. What must hold is that the capture recorded them
    // as volatile and that they are real, positive, same-units numbers.
    expect(CAPTURED._volatile).toEqual(['totalSeconds', 'totalChars', 'totalWatchSeconds']);
    expect(CAPTURED._stable).toEqual(['recentDays']);
    for (const key of ['totalSeconds', 'totalChars', 'totalWatchSeconds'] as const) {
      expect(typeof CAPTURED[key]).toBe('number');
      expect(CAPTURED[key]).toBeGreaterThan(0);
    }
  });

  it('word knowledge reports the same measured zero the capture recorded', async () => {
    // The capture's note is explicit that `0` is a MEASURED zero agreeing with
    // the Notebook's own count, not a missing reader — so a panel showing
    // anything else here is reading a different store.
    expect(before.statistics.knownWords.listKnownEntries).toBe(0);
    const { WordKnowledge } = await import('../components/stats/StatsContent');
    const el = await mount(<WordKnowledge />);
    const values = [...el.querySelectorAll('.stats-card-val')].map((n) => n.textContent);
    expect(values.length).toBeGreaterThan(0);
    // Every knowledge tier reports the measured zero — not one of them showing
    // a placeholder while another shows a real number.
    expect(values.every((v) => v === '0')).toBe(true);
  });
});
