// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StatsCards, useStats } from '../components/stats/StatsContent';
import { getRestDayEnabled, onStatsChanged, recordReading, recordWatching, resetStats, statsKey } from '../stats';
import { setStudyLang, STUDY_LANG_KEY } from '../studyEnvironment';

vi.mock('../ankiSync', () => ({ syncKnowledgeFromAnki: vi.fn() }));
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let host: HTMLDivElement;
let root: Root;

function Snapshot() {
  const { summary } = useStats();
  return <output>{JSON.stringify(summary)}</output>;
}

function Cards() {
  const state = useStats();
  return <StatsCards state={state} showRestDayToggle />;
}

const summaries = () => [...host.querySelectorAll('output')].map(node => JSON.parse(node.textContent!));

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 8, 7, 12));
  localStorage.clear();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});

afterEach(() => {
  act(() => root.unmount());
  host.remove();
  localStorage.clear();
  vi.useRealTimers();
});

async function mount() {
  await act(async () => { root.render(<><Snapshot /><Snapshot /></>); });
}

describe('mounted statistics follow the study store', () => {
  it('changes the rest-day setting and recounts the streak in both open card panels', async () => {
    localStorage.setItem(statsKey(), JSON.stringify({
      days: {
        '2026-09-07': { seconds: 60, chars: 10 },
        '2026-09-05': { seconds: 60, chars: 10 },
      },
      books: {}, shows: {},
    }));
    await act(async () => { root.render(<><Cards /><Cards /></>); });
    const buttons = () => [...host.querySelectorAll<HTMLButtonElement>('.stats-rest-day')];
    const streaks = () => [...host.querySelectorAll('.stats-cards > .stats-card:first-child .stats-card-val')]
      .map(node => node.textContent);
    expect(buttons().map(button => button.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    expect(streaks()).toEqual(['1', '1']);
    await act(async () => { buttons()[0].click(); });
    expect(getRestDayEnabled()).toBe(true);
    expect(buttons().map(button => button.getAttribute('aria-pressed'))).toEqual(['true', 'true']);
    expect(streaks()).toEqual(['2', '2']);
    await act(async () => { buttons()[1].click(); });
    expect(getRestDayEnabled()).toBe(false);
    expect(streaks()).toEqual(['1', '1']);
  });

  it('updates all hosts after reading, watching and resetting, without mixing channels', async () => {
    await mount();
    await act(async () => {
      recordReading('book', '日本語', 90, 42);
      recordWatching('file:/episode.mp4', 'Episode', 60);
    });
    for (const s of summaries()) {
      expect(s.totalSeconds).toBe(90);
      expect(s.totalChars).toBe(42);
      expect(s.totalWatchSeconds).toBe(60);
      expect(s.books).toHaveLength(1);
      expect(s.shows).toHaveLength(1);
    }
    await act(async () => { resetStats(); });
    for (const s of summaries()) {
      expect(s.totalSeconds).toBe(0);
      expect(s.totalWatchSeconds).toBe(0);
      expect(s.books).toEqual([]);
      expect(s.shows).toEqual([]);
    }
  });

  it('refreshes when another window writes or clears the active statistics key', async () => {
    await mount();
    await act(async () => {
      localStorage.setItem(statsKey(), JSON.stringify({
        days: { '2026-09-07': { seconds: 180, chars: 120 } }, books: {}, shows: {},
      }));
      window.dispatchEvent(new StorageEvent('storage', { key: statsKey(), storageArea: localStorage }));
    });
    expect(summaries().map(s => s.totalSeconds)).toEqual([180, 180]);
    await act(async () => {
      localStorage.clear();
      window.dispatchEvent(new StorageEvent('storage', { key: null, storageArea: localStorage }));
    });
    expect(summaries().map(s => s.totalSeconds)).toEqual([0, 0]);
  });

  it('switches language ledgers and returns to the original data', async () => {
    recordReading('book', '日本語', 90, 42);
    await mount();
    await act(async () => { setStudyLang('zh'); });
    expect(summaries().map(s => s.totalSeconds)).toEqual([0, 0]);
    await act(async () => {
      localStorage.setItem(STUDY_LANG_KEY, 'ja');
      window.dispatchEvent(new StorageEvent('storage', { key: STUDY_LANG_KEY, storageArea: localStorage }));
    });
    expect(summaries().map(s => s.totalSeconds)).toEqual([90, 90]);
  });

  it('rolls today over at midnight without requiring new activity', async () => {
    vi.setSystemTime(new Date(2026, 8, 7, 23, 59, 30));
    recordReading('book', '日本語', 90, 42);
    await mount();
    expect(summaries().map(s => s.todaySeconds)).toEqual([90, 90]);
    await act(async () => { vi.advanceTimersByTime(60_000); });
    expect(summaries().map(s => s.todaySeconds)).toEqual([0, 0]);
    expect(summaries().map(s => s.totalSeconds)).toEqual([90, 90]);
  });

  it('ignores unrelated storage and removes listeners and its clock on disposal', () => {
    const refresh = vi.fn();
    const dispose = onStatsChanged(refresh);
    window.dispatchEvent(new StorageEvent('storage', { key: 'unrelated', storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: statsKey('zh'), storageArea: localStorage }));
    window.dispatchEvent(new StorageEvent('storage', { key: statsKey(), storageArea: sessionStorage }));
    expect(refresh).not.toHaveBeenCalled();
    dispose();
    recordReading('book', '日本語', 90, 42);
    window.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(86_400_000);
    expect(refresh).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
