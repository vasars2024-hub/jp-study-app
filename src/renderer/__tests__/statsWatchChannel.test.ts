// @vitest-environment jsdom
/**
 * Phase 6 slice 8 — the watch channel in the study ledger.
 *
 * Three of these pin decisions whose wrong version is *silent*: folding watch seconds
 * into `seconds` (five surfaces that say "read" would quietly start lying), a streak that
 * still only counts reading (the whole reason for recording watch time at all), and a
 * Reset button that clears nothing — which is what shipped, because `resetStats` named a
 * `KEY` that does not exist in the module and the `ReferenceError` went into a `catch`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getSummary,
  recordReading,
  recordWatching,
  resetStats,
  statsKey,
  todayDayKey,
  WATCH_RECORDED_EVENT,
  type WatchDelta,
} from '../stats';

const store = new Map<string, string>();

function dayKeyOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Write days straight into the store — the only way to author a past day. */
function seedDays(days: Record<string, { seconds?: number; chars?: number; watchSeconds?: number }>): void {
  const entries = Object.fromEntries(
    Object.entries(days).map(([k, v]) => [
      k,
      { seconds: v.seconds ?? 0, chars: v.chars ?? 0, ...(v.watchSeconds != null ? { watchSeconds: v.watchSeconds } : {}) },
    ]),
  );
  store.set(statsKey(), JSON.stringify({ days: entries, books: {}, shows: {} }));
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

describe('recordWatching', () => {
  it('keeps watch seconds out of the reading totals', () => {
    recordReading('book-1', 'Kubishime Romanticist', 600, 4200);
    recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 1500);
    const s = getSummary();
    // The distinction is the point: `todaySeconds`/`totalSeconds` are labelled "read"
    // by StatsCards, both study widgets and the status bar.
    expect(s.todaySeconds).toBe(600);
    expect(s.totalSeconds).toBe(600);
    expect(s.todayChars).toBe(4200);
    expect(s.todayWatchSeconds).toBe(1500);
    expect(s.totalWatchSeconds).toBe(1500);
  });

  it('rolls a show up across flushes and reports it most-recent-first', () => {
    // Real time, not `Date.now()` twice in the same millisecond: `lastWatched` is the
    // sort key, and three flushes inside one tick would tie and fall back to insertion
    // order, which would let this pass without ordering anything.
    vi.useFakeTimers();
    let s;
    try {
      vi.setSystemTime(new Date('2026-07-31T20:00:00'));
      recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 15);
      vi.setSystemTime(new Date('2026-07-31T20:00:15'));
      recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 22.5);
      vi.setSystemTime(new Date('2026-07-31T20:05:00'));
      recordWatching('file:c:/anime/ep2.mkv', 'Frieren — 2', 4);
      // Read inside the same fake clock: `getSummary` resolves "today" from `new Date()`,
      // so reading it under the real one would only agree by coincidence of the date.
      s = getSummary();
    } finally {
      vi.useRealTimers();
    }
    expect(s.shows.map((show) => show.id)).toEqual([
      'file:c:/anime/ep2.mkv',
      'file:c:/anime/ep1.mkv',
    ]);
    expect(s.shows.find((show) => show.id === 'file:c:/anime/ep1.mkv')?.seconds).toBe(37.5);
    expect(s.todayWatchSeconds).toBe(41.5);
  });

  it('refuses a flush with no identity or no time', () => {
    recordWatching('', 'Frieren — 1', 30);
    recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 0);
    recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', -30);
    const s = getSummary();
    expect(s.totalWatchSeconds).toBe(0);
    expect(s.shows).toEqual([]);
  });

  it('announces itself on its own event, not on the reading one', () => {
    const watchEvents: WatchDelta[] = [];
    const readEvents: unknown[] = [];
    const onWatch = (e: Event) => watchEvents.push((e as CustomEvent<WatchDelta>).detail);
    const onRead = (e: Event) => readEvents.push(e);
    window.addEventListener(WATCH_RECORDED_EVENT, onWatch);
    window.addEventListener('jp-reading-recorded', onRead);
    recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 30);
    window.removeEventListener(WATCH_RECORDED_EVENT, onWatch);
    window.removeEventListener('jp-reading-recorded', onRead);
    expect(watchEvents).toEqual([
      { showId: 'file:c:/anime/ep1.mkv', title: 'Frieren — 1', seconds: 30 },
    ]);
    // Companions, achievements and the city bridge read a reading delta as reading; a
    // zero-char one would be a lie each of them would have to learn to disbelieve.
    expect(readEvents).toEqual([]);
  });

  it('reads back days written before the channel existed', () => {
    // No `watchSeconds` field at all — every day in every existing profile.
    store.set(
      statsKey(),
      JSON.stringify({ days: { [todayDayKey()]: { seconds: 300, chars: 900 } }, books: {} }),
    );
    const s = getSummary();
    expect(s.todayWatchSeconds).toBe(0);
    expect(s.totalWatchSeconds).toBe(0);
    expect(s.shows).toEqual([]);
    expect(s.recent[s.recent.length - 1].watchSeconds).toBe(0);
  });
});

describe('an active day', () => {
  it('counts watching, so a night in the player continues the streak', () => {
    seedDays({
      [dayKeyOffset(0)]: { watchSeconds: 1800 },
      [dayKeyOffset(1)]: { seconds: 600 },
      [dayKeyOffset(2)]: { watchSeconds: 900 },
    });
    const s = getSummary();
    expect(s.streak).toBe(3);
    expect(s.daysActive).toBe(3);
  });

  it('still ends the streak on a day with neither', () => {
    seedDays({
      [dayKeyOffset(0)]: { watchSeconds: 1800 },
      [dayKeyOffset(1)]: { seconds: 0, chars: 500 },
      [dayKeyOffset(2)]: { watchSeconds: 900 },
    });
    // Characters without time is what an interrupted reader flush writes; it is not a
    // day of study, and the pre-slice-8 code broke the streak there too.
    expect(getSummary().streak).toBe(1);
  });

  it('lets the streak end yesterday when nothing has happened yet today', () => {
    seedDays({
      [dayKeyOffset(1)]: { watchSeconds: 1200 },
      [dayKeyOffset(2)]: { seconds: 300 },
    });
    expect(getSummary().streak).toBe(2);
  });
});

describe('resetStats', () => {
  it('actually clears the store it reads from', () => {
    recordReading('book-1', 'A book', 600, 4200);
    recordWatching('file:c:/anime/ep1.mkv', 'Frieren — 1', 1500);
    expect(getSummary().totalSeconds).toBe(600);

    resetStats();

    // Was a no-op: `localStorage.removeItem(KEY)` threw a ReferenceError into a `catch`.
    // A second failure hid behind it — the key is per study language, so even the
    // legacy name would have cleared the wrong one.
    expect(store.has(statsKey())).toBe(false);
    const s = getSummary();
    expect(s.totalSeconds).toBe(0);
    expect(s.totalWatchSeconds).toBe(0);
    expect(s.shows).toEqual([]);
    expect(s.books).toEqual([]);
  });
});
