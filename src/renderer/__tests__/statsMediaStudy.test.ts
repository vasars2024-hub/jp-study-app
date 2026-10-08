// @vitest-environment jsdom
/**
 * Video study mode in the study ledger: cards mined from the player and subtitle
 * lines studied there. Both are their own per-day counters, both make a day active
 * (a mining-only day keeps the streak), and days written before they existed —
 * or with junk in the fields — read back as zero rather than NaN.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getMediaActivityByDay,
  getSummary,
  MEDIA_STUDY_RECORDED_EVENT,
  recordLinesStudied,
  recordMediaMined,
  statsKey,
  todayDayKey,
  type MediaStudyDelta,
} from '../stats';

const store = new Map<string, string>();

function dayKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function atDaysAgo(daysAgo: number): number {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function seed(days: Record<string, Record<string, unknown>>): void {
  store.set(statsKey(), JSON.stringify({ days, books: {}, shows: {} }));
}

beforeEach(() => {
  store.clear();
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('recordMediaMined / recordLinesStudied', () => {
  it('accumulates per day, separately from every time channel', () => {
    recordMediaMined();
    recordMediaMined(2);
    recordLinesStudied(5);
    recordLinesStudied();
    const day = JSON.parse(store.get(statsKey()) ?? '{}').days[todayDayKey()];
    expect(day).toMatchObject({ mediaMined: 3, linesStudied: 6, seconds: 0, chars: 0 });
    const s = getSummary();
    expect(s.todayMediaMined).toBe(3);
    expect(s.todayLinesStudied).toBe(6);
    expect(s.totalSeconds).toBe(0);
    expect(s.todayStudySeconds).toBe(0);
  });

  it('files a past timestamp under its own day and sums today / week / all time', () => {
    recordMediaMined(1);
    recordMediaMined(2, atDaysAgo(3));
    recordMediaMined(4, atDaysAgo(20));
    recordLinesStudied(7, atDaysAgo(6));
    recordLinesStudied(9, atDaysAgo(7));
    const s = getSummary();
    expect(s.todayMediaMined).toBe(1);
    expect(s.weekMediaMined).toBe(3);
    expect(s.totalMediaMined).toBe(7);
    expect(s.weekLinesStudied).toBe(7);
    expect(s.totalLinesStudied).toBe(16);
    expect(s.recent.find((d) => d.date === dayKeyOffset(3))?.mediaMined).toBe(2);
  });

  it('ignores zero, negative and non-finite counts', () => {
    recordMediaMined(0);
    recordMediaMined(-3);
    recordLinesStudied(Number.NaN);
    expect(store.has(statsKey())).toBe(false);
  });

  it('announces the delta so open views and streak watchers refresh', () => {
    const seen: MediaStudyDelta[] = [];
    const on = (e: Event): void => void seen.push((e as CustomEvent<MediaStudyDelta>).detail);
    window.addEventListener(MEDIA_STUDY_RECORDED_EVENT, on);
    recordMediaMined();
    recordLinesStudied(3);
    window.removeEventListener(MEDIA_STUDY_RECORDED_EVENT, on);
    expect(seen).toEqual([{ kind: 'mined', count: 1 }, { kind: 'lines', count: 3 }]);
  });
});

describe('streak and active days', () => {
  it('counts a day with only mining as an active day', () => {
    seed({ [dayKeyOffset(1)]: { seconds: 600, chars: 0 } });
    recordMediaMined(1);
    const s = getSummary();
    expect(s.streak).toBe(2);
    expect(s.daysActive).toBe(2);
  });

  it('counts a day with only studied lines as an active day', () => {
    seed({ [dayKeyOffset(2)]: { seconds: 60, chars: 0 } });
    recordLinesStudied(2, atDaysAgo(1));
    expect(getSummary().streak).toBe(2);
  });
});

describe('normalization of stored days', () => {
  it('reads days written before the fields existed as zero', () => {
    seed({ [todayDayKey()]: { seconds: 30, chars: 10 } });
    const s = getSummary();
    expect(s.todayMediaMined).toBe(0);
    expect(s.totalLinesStudied).toBe(0);
    expect(s.recent[s.recent.length - 1]).toMatchObject({ mediaMined: 0, linesStudied: 0 });
  });

  it('treats junk values as zero and keeps accumulating from there', () => {
    seed({ [todayDayKey()]: { seconds: 0, chars: 0, mediaMined: 'x', linesStudied: -4 } });
    expect(getSummary().streak).toBe(0);
    recordMediaMined();
    recordLinesStudied();
    const s = getSummary();
    expect(s.todayMediaMined).toBe(1);
    expect(s.todayLinesStudied).toBe(1);
  });

  it('lists per-day player activity for the calendar, only on days with any', () => {
    seed({
      [dayKeyOffset(2)]: { seconds: 300, chars: 50 },
      [dayKeyOffset(1)]: { seconds: 0, chars: 0, watchSeconds: 900 },
    });
    recordMediaMined(2);
    const byDay = getMediaActivityByDay();
    expect(Object.keys(byDay).sort()).toEqual([dayKeyOffset(1), todayDayKey()].sort());
    expect(byDay[dayKeyOffset(1)]).toMatchObject({ watchSeconds: 900, mediaMined: 0 });
    expect(byDay[todayDayKey()]).toMatchObject({ mediaMined: 2, linesStudied: 0 });
  });
});
