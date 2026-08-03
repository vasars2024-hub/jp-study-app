/**
 * Phase 5 · M12 — companion trinkets.
 *
 * The property this milestone cares about is additivity: a trinket is earned,
 * never taken away, and earning one never touches anything else. These tests
 * exercise the persistence/unlock logic in isolation from React and from the
 * achievements watcher that drives it in the app.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  STREAK_MILESTONES,
  TRINKETS,
  isTrinketUnlocked,
  loadTrinketState,
  resetTrinkets,
  unlockedTrinketCount,
  unlockTrinketsForStreak,
} from './companionTrinkets';

function memoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage());
});

describe('registry', () => {
  it('has exactly one trinket per streak milestone achievements.ts celebrates', () => {
    expect(TRINKETS.map((t) => t.streakDays)).toEqual(STREAK_MILESTONES);
  });

  it('gives every trinket a stable id independent of array order', () => {
    const ids = TRINKETS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('unlockTrinketsForStreak', () => {
  it('unlocks nothing below the first milestone', () => {
    expect(unlockTrinketsForStreak(2)).toEqual([]);
    expect(unlockedTrinketCount()).toBe(0);
  });

  it('unlocks every milestone at or below the given streak in one call', () => {
    const newly = unlockTrinketsForStreak(30);
    expect(newly.map((t) => t.streakDays)).toEqual([3, 7, 14, 30]);
    expect(unlockedTrinketCount()).toBe(4);
  });

  it('is idempotent — calling again at the same streak grants nothing new', () => {
    unlockTrinketsForStreak(30);
    const again = unlockTrinketsForStreak(30);
    expect(again).toEqual([]);
    expect(unlockedTrinketCount()).toBe(4);
  });

  it('only reports the newly crossed milestones on a later, higher call', () => {
    unlockTrinketsForStreak(7); // grants 3, 7
    const newly = unlockTrinketsForStreak(60);
    expect(newly.map((t) => t.streakDays)).toEqual([14, 30, 60]);
    expect(unlockedTrinketCount()).toBe(5); // 3, 7, 14, 30, 60
  });

  it('never re-locks a trinket if the streak later drops (additive only)', () => {
    unlockTrinketsForStreak(100);
    expect(unlockedTrinketCount()).toBe(TRINKETS.length);
    // A broken streak resets to 0 upstream in stats.ts, not here — this module
    // must not react to that by taking anything back.
    unlockTrinketsForStreak(0);
    expect(unlockedTrinketCount()).toBe(TRINKETS.length);
  });

  it('persists across a fresh load', () => {
    unlockTrinketsForStreak(14);
    const reloaded = loadTrinketState();
    expect(isTrinketUnlocked('streak-3', reloaded)).toBe(true);
    expect(isTrinketUnlocked('streak-14', reloaded)).toBe(true);
    expect(isTrinketUnlocked('streak-30', reloaded)).toBe(false);
  });
});

describe('resetTrinkets', () => {
  it('clears every unlock', () => {
    unlockTrinketsForStreak(100);
    resetTrinkets();
    expect(unlockedTrinketCount()).toBe(0);
    for (const t of TRINKETS) expect(isTrinketUnlocked(t.id)).toBe(false);
  });
});

describe('malformed storage', () => {
  it('falls back to empty state rather than throwing', () => {
    localStorage.setItem('jp-os-trinkets-v1', '{not json');
    expect(loadTrinketState()).toEqual({ unlockedIds: [], unlockedAt: {} });
  });

  it('drops non-string entries from a corrupted unlockedIds array', () => {
    localStorage.setItem('jp-os-trinkets-v1', JSON.stringify({ unlockedIds: ['streak-3', 42, null] }));
    expect(loadTrinketState().unlockedIds).toEqual(['streak-3']);
  });
});
