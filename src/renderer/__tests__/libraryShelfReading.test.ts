import { describe, expect, it } from 'vitest';
import {
  compareRecentlyRead,
  continueReadingItems,
  groupLibraryBySeries,
  librarySeriesName,
  nextRowIndex,
  progressFraction,
} from '../utils/libraryShelf';
import type { LibraryItem } from '../../shared/types';

function item(id: string, patch: Partial<LibraryItem> = {}): LibraryItem {
  return { id, title: id, kind: 'book', createdAt: 1, ...patch } as LibraryItem;
}

describe('recently read order', () => {
  it('puts books ever opened first, latest on top, then unread books newest-imported first', () => {
    const list = [
      item('unread-old', { createdAt: 1 }),
      item('read-long-ago', { lastReadAt: 100 }),
      item('unread-new', { createdAt: 50 }),
      item('read-today', { lastReadAt: 900 }),
    ];
    expect([...list].sort(compareRecentlyRead).map((i) => i.id)).toEqual([
      'read-today',
      'read-long-ago',
      'unread-new',
      'unread-old',
    ]);
  });
});

describe('continue reading', () => {
  it('lists started, unfinished books by last read, and leaves out unread and finished ones', () => {
    const list = [
      item('finished', { lastReadAt: 999, progress: { percent: 1 } as LibraryItem['progress'] }),
      item('half', { lastReadAt: 500, progress: { percent: 0.5 } as LibraryItem['progress'] }),
      item('never'),
      item('opened', { lastReadAt: 700 }),
    ];
    expect(continueReadingItems(list).map((i) => i.id)).toEqual(['opened', 'half']);
    expect(continueReadingItems(list, 1).map((i) => i.id)).toEqual(['opened']);
  });

  it('clamps a nonsense progress value', () => {
    expect(progressFraction(item('x', { progress: { percent: 4 } as LibraryItem['progress'] }))).toBe(1);
    expect(progressFraction(item('x', { progress: { percent: Number.NaN } as LibraryItem['progress'] }))).toBe(0);
  });
});

describe('series', () => {
  it.each([
    ['よつばと！ 1', 'よつばと!'],
    ['よつばと！１', 'よつばと!'],
    ['ダンジョン飯 第3巻', 'ダンジョン飯'],
    ['ダンジョン飯（2）', 'ダンジョン飯'],
    ['Spice and Wolf, Vol. 4', 'Spice and Wolf'],
    ['ハルヒ - 03', 'ハルヒ'],
    ['コンビニ人間', 'コンビニ人間'],
  ])('%s belongs to %s', (title, series) => {
    expect(librarySeriesName({ title })).toBe(series);
  });

  it('prefers the provider work title when the item has one', () => {
    expect(librarySeriesName({
      title: 'Chapter 12',
      readingSource: { workTitle: '葬送のフリーレン' } as LibraryItem['readingSource'],
    })).toBe('葬送のフリーレン');
  });

  it('groups volumes of a series together and gathers single books in a trailing bucket', () => {
    const groups = groupLibraryBySeries([
      item('a', { title: 'ダンジョン飯 1' }),
      item('b', { title: 'コンビニ人間' }),
      item('c', { title: 'ダンジョン飯 2' }),
    ]);
    expect(groups.map((g) => [g.name, g.items.map((i) => i.id)])).toEqual([
      ['ダンジョン飯', ['a', 'c']],
      ['', ['b']],
    ]);
  });
});

describe('list row arrow keys', () => {
  it('moves down, up, home and end, clamped at the ends, and ignores other keys', () => {
    expect(nextRowIndex('ArrowDown', 0, 3)).toBe(1);
    expect(nextRowIndex('ArrowDown', 2, 3)).toBe(2);
    expect(nextRowIndex('ArrowUp', 0, 3)).toBe(0);
    expect(nextRowIndex('End', 0, 3)).toBe(2);
    expect(nextRowIndex('Home', 2, 3)).toBe(0);
    expect(nextRowIndex('Enter', 1, 3)).toBeNull();
    expect(nextRowIndex('ArrowDown', 0, 0)).toBeNull();
  });
});
