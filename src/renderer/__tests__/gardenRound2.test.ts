/**
 * Reading garden round 2: reading without pages (PDF, visual novels, the
 * Immersion browser) grows the mooncap by characters, and the second desktop
 * is shown by the same "Desktop N" name its switcher button uses.
 */
import { describe, expect, it } from 'vitest';
import {
  emptyReadingGardenProgress,
  loadReadingGardenProgress,
  READING_GARDEN_CHARS_PER_PAGE,
  READING_GARDEN_STORAGE_KEY,
  recordReadingCharsForGarden,
} from '../readingGardenProgress';
import { isDefaultDesktopName } from '../desktopState';

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const data = new Map<string, string>();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
}

describe('garden growth from characters', () => {
  it('turns every full page of characters into a page and keeps the rest', () => {
    const storage = memoryStorage();
    const now = Date.UTC(2026, 8, 25, 12);
    const after = recordReadingCharsForGarden(
      { sourceId: 'vn:1', chars: READING_GARDEN_CHARS_PER_PAGE * 2 + 50 },
      storage,
      now,
    );
    expect(after.pagesRead).toBe(2);
    expect(after.bankedPages).toBe(2);
    expect(after.pendingChars).toBe(50);
    const more = recordReadingCharsForGarden(
      { sourceId: 'pdf', chars: READING_GARDEN_CHARS_PER_PAGE - 50 },
      storage,
      now,
    );
    expect(more.pagesRead).toBe(3);
    expect(more.pendingChars).toBeUndefined();
    expect(loadReadingGardenProgress(storage, now).pagesRead).toBe(3);
  });

  it('ignores nothing-read flushes and keeps old saves loading', () => {
    const storage = memoryStorage();
    storage.setItem(READING_GARDEN_STORAGE_KEY, JSON.stringify(emptyReadingGardenProgress()));
    expect(recordReadingCharsForGarden({ sourceId: 'x', chars: 0 }, storage)).toEqual(
      emptyReadingGardenProgress(),
    );
  });
});

describe('default desktop names', () => {
  it('treats the old "City" and main defaults as unnamed', () => {
    expect(isDefaultDesktopName(1, 'City')).toBe(true);
    expect(isDefaultDesktopName(0, 'Study')).toBe(true);
    expect(isDefaultDesktopName(2, 'Desktop 3')).toBe(true);
    expect(isDefaultDesktopName(1, 'Reading room')).toBe(false);
  });
});
