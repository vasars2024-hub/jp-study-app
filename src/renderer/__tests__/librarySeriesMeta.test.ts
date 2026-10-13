import { describe, expect, it } from 'vitest';
import type { LibraryItem } from '../../shared/types';
import {
  groupLibraryBySeries,
  librarySeriesName,
  librarySeriesPosition,
  matchesLibraryQuery,
} from '../utils/libraryShelf';

const item = (title: string, extra: Partial<LibraryItem> = {}) =>
  ({ id: title, title, kind: 'book', createdAt: 1, ...extra }) as LibraryItem;

describe('series from metadata', () => {
  it('a stored series wins over the title heuristic', () => {
    expect(librarySeriesName(item('Harry Potter and the Chamber of Secrets', { series: 'Harry Potter' }))).toBe('Harry Potter');
  });

  it('books are ordered by stored position, then by the volume in the title, then as they came', () => {
    const groups = groupLibraryBySeries([
      item('Saga: the end', { series: 'Saga', seriesIndex: 3 }),
      item('Saga: an extra', { series: 'Saga' }),
      item('Saga: the start', { series: 'Saga', seriesIndex: 1 }),
      item('Saga 2', { series: 'saga' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.title)).toEqual(['Saga: the start', 'Saga 2', 'Saga: the end', 'Saga: an extra']);
  });

  it('heuristic series are ordered by their volume numbers too (10 after 9)', () => {
    const groups = groupLibraryBySeries([item('よつばと! 10'), item('よつばと! 9'), item('よつばと! 1')]);
    expect(groups[0].items.map((i) => i.title)).toEqual(['よつばと! 1', 'よつばと! 9', 'よつばと! 10']);
  });

  it('a single book the metadata puts in a series still gets its heading', () => {
    const groups = groupLibraryBySeries([item('Lonely volume', { series: 'Long saga', seriesIndex: 4 }), item('Standalone')]);
    expect(groups.map((g) => g.name)).toEqual(['Long saga', '']);
  });

  it('positions: stored, 第N巻, Vol. N, trailing number, none', () => {
    expect(librarySeriesPosition(item('x', { seriesIndex: 2.5 }))).toBe(2.5);
    expect(librarySeriesPosition(item('進撃の巨人 第３巻'))).toBe(3);
    expect(librarySeriesPosition(item('Berserk Vol. 12'))).toBe(12);
    expect(librarySeriesPosition(item('Title (4)'))).toBe(4);
    expect(librarySeriesPosition(item('No number here'))).toBeNull();
  });
});

describe('shelf search', () => {
  const book = item('吾輩は猫である', { author: '夏目 漱石', series: '名作', tags: ['Classic', '小説'] });
  it('every word must match somewhere in title, authors, series or tags', () => {
    expect(matchesLibraryQuery(book, '')).toBe(true);
    expect(matchesLibraryQuery(book, '漱石 classic')).toBe(true);
    expect(matchesLibraryQuery(book, '漱石 manga')).toBe(false);
    expect(matchesLibraryQuery(book, '名作')).toBe(true);
  });

  it('folds case, width and katakana/hiragana', () => {
    expect(matchesLibraryQuery(item('よつばと!'), 'ヨツバ')).toBe(true);
    expect(matchesLibraryQuery(item('ＫＡＦＫＡ'), 'kafka')).toBe(true);
  });
});
