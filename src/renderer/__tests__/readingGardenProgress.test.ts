import { describe, expect, it } from 'vitest';

import {
  emptyReadingGardenProgress,
  loadReadingGardenProgress,
  readingGardenPendingPhases,
  recordEpubPageRead,
  READING_GARDEN_PAGES_PER_PHASE,
  READING_GARDEN_STORAGE_KEY,
} from '../readingGardenProgress';

class MemoryStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function readPages(store: MemoryStorage, count: number, now: number) {
  let progress = loadReadingGardenProgress(store, now);
  for (let page = 0; page < count; page += 1) {
    progress = recordEpubPageRead(
      { bookId: 'book-a', partIndex: 0, pageIndex: page },
      store,
      now,
    );
  }
  return progress;
}

describe('reading garden progress', () => {
  it('starts with a dormant first stage and a fifty-page phase target', () => {
    expect(emptyReadingGardenProgress()).toMatchObject({
      version: 2,
      pagesRead: 0,
      bankedPages: 0,
      stage: 1,
    });
    expect(READING_GARDEN_PAGES_PER_PHASE).toBe(50);
  });

  it('persists twenty pages on day one and evolves after thirty more on day two', () => {
    const store = new MemoryStorage();
    const dayOne = new Date(2026, 6, 29, 12, 0, 0).getTime();
    const dayTwo = new Date(2026, 6, 30, 12, 0, 0).getTime();

    const firstDay = readPages(store, 20, dayOne);
    expect(firstDay).toMatchObject({ pagesRead: 20, bankedPages: 20, stage: 1 });

    const secondDay = readPages(store, 30, dayTwo);
    expect(secondDay).toMatchObject({ pagesRead: 50, bankedPages: 0, stage: 2 });
    expect(secondDay.lastEvolutionDay).not.toBeNull();
    expect(loadReadingGardenProgress(store, dayTwo)).toEqual(secondDay);
  });

  it('banks extra reading but releases no more than one phase per day', () => {
    const store = new MemoryStorage();
    const dayOne = new Date(2026, 6, 29, 10, 0, 0).getTime();
    const dayTwo = new Date(2026, 6, 30, 10, 0, 0).getTime();

    const hundredPages = readPages(store, 100, dayOne);
    expect(hundredPages).toMatchObject({ pagesRead: 100, bankedPages: 50, stage: 2 });
    expect(readingGardenPendingPhases(hundredPages)).toBe(1);
    expect(loadReadingGardenProgress(store, dayOne)).toEqual(hundredPages);

    const nextDay = loadReadingGardenProgress(store, dayTwo);
    expect(nextDay).toMatchObject({ pagesRead: 100, bankedPages: 0, stage: 3 });
    expect(loadReadingGardenProgress(store, dayTwo)).toEqual(nextDay);
  });

  it('does not unlock a second evolution after a one-hour clock/day rollover', () => {
    const store = new MemoryStorage();
    const beforeMidnight = new Date(2026, 6, 29, 23, 30, 0).getTime();
    const afterMidnight = new Date(2026, 6, 30, 0, 30, 0).getTime();
    const hundredPages = readPages(store, 100, beforeMidnight);

    expect(hundredPages.stage).toBe(2);
    expect(loadReadingGardenProgress(store, afterMidnight)).toMatchObject({
      stage: 2,
      bankedPages: 50,
    });
  });

  it('migrates the original page counter without losing partial progress', () => {
    const store = new MemoryStorage();
    store.setItem(
      READING_GARDEN_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        pagesRead: 20,
        stage: 21,
        lastReadAt: 1234,
        lastBookId: 'legacy-book',
      }),
    );
    expect(loadReadingGardenProgress(store, 2000)).toMatchObject({
      version: 2,
      pagesRead: 20,
      bankedPages: 20,
      stage: 1,
      lastReadAt: 1234,
      lastBookId: 'legacy-book',
    });
  });

  it('recovers safely from malformed local data', () => {
    const store = new MemoryStorage();
    store.setItem(READING_GARDEN_STORAGE_KEY, '{broken');
    expect(loadReadingGardenProgress(store)).toEqual(emptyReadingGardenProgress());
  });

  it('reaches phase fifty without overflowing or banking post-maturity pages', () => {
    const store = new MemoryStorage();
    const firstDay = new Date(2026, 0, 1, 12, 0, 0).getTime();
    let progress = emptyReadingGardenProgress();

    for (let evolution = 0; evolution < 49; evolution += 1) {
      const day = firstDay + evolution * 24 * 60 * 60 * 1000;
      progress = readPages(store, 50, day);
      expect(progress.stage).toBe(evolution + 2);
    }

    const afterMaturity = readPages(
      store,
      100,
      firstDay + 50 * 24 * 60 * 60 * 1000,
    );
    expect(afterMaturity).toMatchObject({
      stage: 50,
      pagesRead: 2550,
      bankedPages: 0,
    });
    expect(readingGardenPendingPhases(afterMaturity)).toBe(0);
  });
});
