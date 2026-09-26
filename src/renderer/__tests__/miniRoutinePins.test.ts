/**
 * v1.0 audit 3.5 — "up to 3 clickable routines" is a cap, and a cap that only
 * exists in the button that adds one is a cap the stored blob can outlive.
 * These cover the store, not the widget: the widget is verified live.
 */
import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  MINI_MAX_ROUTINES,
  addMiniRoutine,
  removeMiniRoutine,
  moveMiniRoutine,
  loadMiniMode,
  saveMiniMode,
} from '../miniMode';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => void values.set(key, value),
    removeItem: (key) => void values.delete(key),
    clear: () => values.clear(),
    key: (index) => Array.from(values.keys())[index] ?? null,
    get length() {
      return values.size;
    },
  } as Storage;
}

describe('Mini pinned routines', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
    vi.stubGlobal('dispatchEvent', () => true);
  });

  it('defaults to none pinned, so the widget shows no routine row', () => {
    expect(loadMiniMode().routines).toEqual([]);
  });

  it('pins in order and refuses a fourth', () => {
    let list: string[] = [];
    for (const id of ['a', 'b', 'c']) {
      const next = addMiniRoutine(list, id);
      expect(next).not.toBeNull();
      list = next!;
    }
    expect(list).toEqual(['a', 'b', 'c']);
    expect(list).toHaveLength(MINI_MAX_ROUTINES);
    expect(addMiniRoutine(list, 'd')).toBeNull();
  });

  it('refuses a duplicate and an empty id', () => {
    expect(addMiniRoutine(['a'], 'a')).toBeNull();
    expect(addMiniRoutine(['a'], '  ')).toBeNull();
  });

  it('unpins down to zero — unlike apps there is no minimum', () => {
    expect(removeMiniRoutine(['a'], 'a')).toEqual([]);
  });

  it('reorders within bounds and is a no-op at the ends', () => {
    expect(moveMiniRoutine(['a', 'b', 'c'], 'c', -1)).toEqual(['a', 'c', 'b']);
    expect(moveMiniRoutine(['a', 'b', 'c'], 'a', -1)).toEqual(['a', 'b', 'c']);
    expect(moveMiniRoutine(['a', 'b', 'c'], 'c', 1)).toEqual(['a', 'b', 'c']);
    expect(moveMiniRoutine(['a', 'b', 'c'], 'zz', 1)).toEqual(['a', 'b', 'c']);
  });

  it('caps and de-duplicates on the way back out of storage', () => {
    // Reaching the blob past the helpers — a hand-edited file, or an older build.
    localStorage.setItem(
      'jp-study-mini-mode-v1',
      JSON.stringify({ routines: ['a', 'a', 'b', 'c', 'd', 7, '', ' e '] }),
    );
    expect(loadMiniMode().routines).toEqual(['a', 'b', 'c']);
  });

  it('round-trips a pinned list through save and load', () => {
    saveMiniMode({ routines: ['br-aero-climb', 'br-aero-cheer'] });
    expect(loadMiniMode().routines).toEqual(['br-aero-climb', 'br-aero-cheer']);
  });

  it('leaves the pinned list alone when an unrelated field is patched', () => {
    saveMiniMode({ routines: ['br-aero-climb'] });
    saveMiniMode({ tint: 'ocean' });
    expect(loadMiniMode().routines).toEqual(['br-aero-climb']);
  });
});
