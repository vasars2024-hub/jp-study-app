// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../storage/storage', () => ({
  LS_KEYS: { clipboardHistory: 'jp-clipboard-history' },
  IDB_KEYS: { clipboardHistory: 'clipboard-history' },
  mirrorToIdb: vi.fn(),
}));
vi.mock('../flashcardDeck', () => ({ addDeckCardsTracked: vi.fn() }));
vi.mock('../flashcardAutoEnrich', () => ({ enrichNewCards: vi.fn() }));

import {
  loadClipboardHistory,
  onClipboardHistoryChanged,
  recordClipboardEntry,
  saveClipboardSettings,
  startClipboardMonitor,
  stopClipboardMonitor,
  togglePin,
} from '../clipboardHistory';

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-29T12:00:00Z'));
});
afterEach(() => {
  stopClipboardMonitor();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('clipboard monitoring consent', () => {
  it('discards a pending read when monitoring is disabled, and can capture it after re-enabling', async () => {
    let resolveRead!: (text: string) => void;
    const clipboardReadText = vi.fn()
      .mockImplementationOnce(() => new Promise<string>((resolve) => { resolveRead = resolve; }))
      .mockResolvedValue('pending clipboard text');
    vi.stubGlobal('api', { clipboardReadText });
    saveClipboardSettings({ monitoringEnabled: true });
    startClipboardMonitor();
    expect(clipboardReadText).toHaveBeenCalledTimes(1);

    saveClipboardSettings({ monitoringEnabled: false });
    resolveRead('pending clipboard text');
    await Promise.resolve();
    expect(loadClipboardHistory()).toEqual([]);
    await vi.advanceTimersByTimeAsync(4500);
    expect(clipboardReadText).toHaveBeenCalledTimes(1);

    saveClipboardSettings({ monitoringEnabled: true });
    await vi.advanceTimersByTimeAsync(4500);
    expect(loadClipboardHistory().map((entry) => entry.text)).toEqual(['pending clipboard text']);
  });
});

describe('consecutive clipboard copies with pinned entries', () => {
  it('deduplicates the newest copy even with an older pin and equal timestamps', () => {
    const pinned = recordClipboardEntry('猫')!;
    togglePin(pinned.id);
    const latest = recordClipboardEntry('犬')!;

    expect(recordClipboardEntry('犬')?.id).toBe(latest.id);
    expect(loadClipboardHistory()).toHaveLength(2);
    // Copying the pin after a different word is not a consecutive duplicate.
    expect(recordClipboardEntry('猫')?.id).not.toBe(pinned.id);
    expect(loadClipboardHistory()).toHaveLength(3);
  });

  it('deduplicates existing histories saved in pinned-first order', () => {
    localStorage.setItem('jp-clipboard-history', JSON.stringify([
      { id: 'pin', text: '猫', type: 'manual', createdAt: 1, pinned: true },
      { id: 'latest', text: '犬', type: 'manual', createdAt: 2 },
    ]));

    expect(recordClipboardEntry('犬')?.id).toBe('latest');
    expect(loadClipboardHistory()).toHaveLength(2);
  });

  it('keeps pins and the newest copies when the history reaches its limit', () => {
    saveClipboardSettings({ maxSize: 10 });
    const pinned = recordClipboardEntry('猫')!;
    togglePin(pinned.id);
    for (let index = 0; index < 12; index += 1) {
      recordClipboardEntry(`word ${index}`);
    }

    const history = loadClipboardHistory();
    expect(history).toHaveLength(10);
    expect(history[0].text).toBe('word 11');
    expect(history.at(-1)).toMatchObject({ id: pinned.id, pinned: true });
    expect(history.some((entry) => entry.text === 'word 2')).toBe(false);
    expect(recordClipboardEntry('word 11')?.id).toBe(history[0].id);
  });

  it('honors disabled deduplication and distinct copy types', () => {
    const pinned = recordClipboardEntry('猫')!;
    togglePin(pinned.id);
    recordClipboardEntry('犬', { type: 'word' });
    recordClipboardEntry('犬', { type: 'sentence' });
    expect(loadClipboardHistory()).toHaveLength(3);

    saveClipboardSettings({ dedupeConsecutive: false });
    recordClipboardEntry('犬', { type: 'sentence' });
    expect(loadClipboardHistory()).toHaveLength(4);
  });
});

describe('reducing the clipboard history limit', () => {
  it('never deletes the entry being unpinned, even with more pins than the limit', () => {
    const ids = Array.from({ length: 12 }, (_, index) => {
      const entry = recordClipboardEntry(`saved word ${index}`)!;
      togglePin(entry.id);
      return entry.id;
    });
    saveClipboardSettings({ maxSize: 10 });

    // 11 pins still exceed the limit, but the copy just unpinned stays visible.
    const afterFirst = togglePin(ids[0]);
    expect(afterFirst).toHaveLength(12);
    expect(afterFirst.find((entry) => entry.id === ids[0])?.pinned).toBe(false);
    expect(afterFirst.filter((entry) => entry.pinned)).toHaveLength(11);
    expect(loadClipboardHistory()).toEqual(afterFirst);

    // The next unpin keeps its own entry; the older unpinned copy makes way.
    const afterSecond = togglePin(ids[1]);
    expect(afterSecond).toHaveLength(11);
    expect(afterSecond.some((entry) => entry.id === ids[1])).toBe(true);
    expect(afterSecond.some((entry) => entry.id === ids[0])).toBe(false);
    // With room available, unpinning retains the copy in history.
    const withinLimit = togglePin(ids[2]);
    expect(withinLimit).toHaveLength(10);
    expect(withinLimit.find((entry) => entry.id === ids[2])?.pinned).toBe(false);
    expect(loadClipboardHistory()).toEqual(withinLimit);
  });

  it('immediately keeps the newest copies and older pins and notifies the panel', () => {
    const pinned = recordClipboardEntry('saved vocabulary')!;
    togglePin(pinned.id);
    for (let index = 0; index < 15; index += 1) {
      recordClipboardEntry(`word ${index}`);
    }
    const changed = vi.fn();
    const unsubscribe = onClipboardHistoryChanged(changed);
    try {
      saveClipboardSettings({ maxSize: 10 });

      const history = loadClipboardHistory();
      expect(history.map((entry) => entry.text)).toEqual([
        ...Array.from({ length: 9 }, (_, index) => `word ${14 - index}`),
        'saved vocabulary',
      ]);
      expect(history.at(-1)).toMatchObject({ id: pinned.id, pinned: true });
      expect(changed).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('preserves every pin even when pins exceed the new limit', () => {
    for (let index = 0; index < 12; index += 1) {
      togglePin(recordClipboardEntry(`saved word ${index}`)!.id);
    }
    recordClipboardEntry('temporary copy');

    saveClipboardSettings({ maxSize: 10 });

    const history = loadClipboardHistory();
    expect(history).toHaveLength(12);
    expect(history.every((entry) => entry.pinned)).toBe(true);
  });
});
