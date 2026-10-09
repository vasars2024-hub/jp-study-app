// @vitest-environment jsdom
/**
 * Translate history: a re-run replaces its row instead of stacking copies, a pin
 * survives the cap and "Clear history", and the store writes through the guarded
 * writer (a refused write is reported, not swallowed).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const writes = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../localStorageWrite', () => ({
  writeLocalStorageJson: (key: string, value: unknown) => {
    writes.calls.push(key);
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  },
}));

import {
  TRANSLATION_HISTORY_STORAGE_KEY,
  appendTranslationHistory,
  clearTranslationHistory,
  loadTranslationHistory,
  togglePinTranslationHistory,
} from '../translationHistory';

const add = (sourceText: string, resultText = `${sourceText}!`, ts?: number) =>
  appendTranslationHistory({ sourceLang: 'ja', targetLang: 'en', sourceText, resultText, origin: 'app', ...(ts ? { ts } : {}) });

beforeEach(() => {
  localStorage.clear();
  writes.calls.length = 0;
});

describe('translation history', () => {
  it('re-translating the same text moves its row to the top, keeping its id and pin', () => {
    const first = add('猫', 'cat', 1);
    add('犬', 'dog', 2);
    togglePinTranslationHistory(first.id);
    const again = add('猫', 'a cat', 3);
    const rows = loadTranslationHistory();
    expect(rows.map((r) => r.sourceText)).toEqual(['猫', '犬']);
    expect(again.id).toBe(first.id);
    expect(rows[0]).toMatchObject({ resultText: 'a cat', pinned: true });
  });

  it('a different direction is a different row', () => {
    add('猫');
    appendTranslationHistory({ sourceLang: 'ja', targetLang: 'ru', sourceText: '猫', resultText: 'кот', origin: 'app' });
    expect(loadTranslationHistory()).toHaveLength(2);
  });

  it('pin toggles, and unpinning removes the flag', () => {
    const row = add('猫');
    expect(togglePinTranslationHistory(row.id)).toBe(true);
    expect(loadTranslationHistory()[0].pinned).toBe(true);
    expect(togglePinTranslationHistory(row.id)).toBe(false);
    expect('pinned' in loadTranslationHistory()[0]).toBe(false);
    expect(togglePinTranslationHistory('missing')).toBeNull();
  });

  it('Clear keeps pinned rows unless asked to remove them too', () => {
    const keep = add('猫');
    add('犬');
    togglePinTranslationHistory(keep.id);
    clearTranslationHistory();
    expect(loadTranslationHistory().map((r) => r.sourceText)).toEqual(['猫']);
    clearTranslationHistory(true);
    expect(loadTranslationHistory()).toEqual([]);
  });

  it('the 200-row cap never evicts a pinned row', () => {
    const pinned = add('最初', 'first', 1);
    togglePinTranslationHistory(pinned.id);
    for (let i = 0; i < 210; i += 1) add(`文${i}`, `s${i}`, 10 + i);
    const rows = loadTranslationHistory();
    expect(rows).toHaveLength(200);
    expect(rows.some((r) => r.id === pinned.id)).toBe(true);
  });

  it('writes through the guarded writer', () => {
    add('猫');
    expect(writes.calls).toContain(TRANSLATION_HISTORY_STORAGE_KEY);
  });
});
