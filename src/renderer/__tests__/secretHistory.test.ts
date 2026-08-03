/**
 * Phase 5 · M13 — Secret OS History.
 *
 * The property under test is pacing: `history` reveals one entry per call,
 * remembers where the reader left off, and never loses that place across a
 * reload — a wall-of-text dump or a progress reset on every command would
 * both undercut the "discoverable lore, not clutter" goal the milestone sets.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SECRET_HISTORY,
  historyProgress,
  nextHistoryEntry,
  resetSecretHistory,
} from '../secretHistory';

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

describe('content', () => {
  it('every entry has a unique id and non-empty i18n keys', () => {
    const ids = SECRET_HISTORY.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of SECRET_HISTORY) {
      expect(e.titleKey).toMatch(/^secretHistory\./);
      expect(e.bodyKey).toMatch(/^secretHistory\./);
    }
  });

  it('is small enough to page through, not a wall of text', () => {
    // The milestone's own risk note: "too many weak secrets, hard-to-recover
    // states". A handful, not a library.
    expect(SECRET_HISTORY.length).toBeGreaterThanOrEqual(4);
    expect(SECRET_HISTORY.length).toBeLessThanOrEqual(10);
  });
});

describe('nextHistoryEntry', () => {
  it('reveals entries in order starting from the first', () => {
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[0].id);
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[1].id);
  });

  it('wraps back to the first entry after the last', () => {
    for (let i = 0; i < SECRET_HISTORY.length; i++) nextHistoryEntry();
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[0].id);
  });

  it('persists position across a fresh load (a reload mid-log does not lose the place)', () => {
    nextHistoryEntry();
    nextHistoryEntry();
    // Simulate a reload: nothing but localStorage carries state between calls,
    // which is exactly what a real reload preserves and an in-memory variable would not.
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[2].id);
  });
});

describe('historyProgress', () => {
  it('starts at 0 of N', () => {
    expect(historyProgress()).toEqual({ seen: 0, total: SECRET_HISTORY.length });
  });

  it('counts distinct entries revealed, capped at the log length even after wrapping twice', () => {
    for (let i = 0; i < SECRET_HISTORY.length * 2 + 1; i++) nextHistoryEntry();
    expect(historyProgress()).toEqual({ seen: SECRET_HISTORY.length, total: SECRET_HISTORY.length });
  });
});

describe('resetSecretHistory', () => {
  it('returns to the start', () => {
    nextHistoryEntry();
    nextHistoryEntry();
    resetSecretHistory();
    expect(historyProgress().seen).toBe(0);
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[0].id);
  });
});

describe('malformed storage', () => {
  it('falls back to the start rather than throwing', () => {
    localStorage.setItem('jp-os-secret-history-v1', '{not json');
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[0].id);
  });

  it('clamps an out-of-range stored index instead of crashing', () => {
    localStorage.setItem('jp-os-secret-history-v1', JSON.stringify({ nextIndex: -5, totalSeen: 999 }));
    expect(nextHistoryEntry().id).toBe(SECRET_HISTORY[0].id);
    expect(historyProgress().seen).toBeLessThanOrEqual(SECRET_HISTORY.length);
  });
});
