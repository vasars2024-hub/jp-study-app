import { describe, expect, it } from 'vitest';
import type { BookLevelEstimate } from '../bookLevelEstimate';
import {
  compareLibraryLength,
  effectiveLang,
  effectiveLevelEstimate,
  levelSortKey,
  librarySortLength,
  tierFromBookEstimate,
} from '../libraryLevel';
import type { LibraryItem } from '../types';

function book(partial: Partial<LibraryItem> & Pick<LibraryItem, 'id' | 'title'>): LibraryItem {
  return {
    kind: 'book',
    createdAt: 1,
    ...partial,
  };
}

describe('libraryLevel helpers', () => {
  it('prefers inbox levelEstimate over file levelMeta', () => {
    const item = book({
      id: '1',
      title: 't',
      inboxMeta: {
        sourceUrl: 'https://x',
        contentHash: 'h',
        lang: 'ja',
        charCount: 10,
        estMinutes: 1,
        knownRatio: 0.9,
        levelEstimate: 2,
        receivedAt: 1,
      },
      levelMeta: { lang: 'zh', knownRatio: 0.5, levelEstimate: 5 },
    });
    expect(effectiveLevelEstimate(item)).toBe(2);
    expect(effectiveLang(item)).toBe('ja');
  });

  it('falls back to file levelMeta for imports', () => {
    const item = book({
      id: '2',
      title: 'epub',
      levelMeta: { lang: 'ja', knownRatio: 0.7, levelEstimate: 4 },
    });
    expect(effectiveLevelEstimate(item)).toBe(4);
    expect(effectiveLang(item)).toBe('ja');
    expect(levelSortKey(item)).toBe(4);
  });

  it('maps exam cover estimates onto L tiers for sort', () => {
    const est: BookLevelEstimate = {
      scheme: 'jlpt',
      level: 3,
      label: 'N3',
      slotId: 'jlpt-n3',
      confidence: 0.9,
      metThreshold: true,
    };
    expect(tierFromBookEstimate(est)).toBe(4);
    expect(levelSortKey(book({ id: '3', title: 'x' }), est)).toBe(4);
  });

  it('maps HSK cover estimates onto L tiers', () => {
    const est: BookLevelEstimate = {
      scheme: 'hsk',
      level: 4,
      label: 'HSK4',
      slotId: 'hsk-4',
      confidence: 0.88,
      metThreshold: true,
    };
    expect(tierFromBookEstimate(est)).toBe(4);
  });

  it('uses 99 when no level is known', () => {
    expect(levelSortKey(book({ id: '4', title: 'plain' }))).toBe(99);
  });
});

describe('librarySortLength / compareLibraryLength', () => {
  const article = (id: string, charCount: number): LibraryItem => book({
    id,
    title: id,
    inboxMeta: {
      sourceUrl: 'https://x',
      contentHash: id,
      lang: 'ja',
      charCount,
      estMinutes: 1,
      knownRatio: 0.5,
      levelEstimate: null,
      receivedAt: 1,
    },
  });
  const manga = (id: string, pageCount: number): LibraryItem =>
    book({ id, title: id, kind: 'manga', pageCount });
  const plain = (id: string): LibraryItem => book({ id, title: id });

  it('ranks characters, then pages, then everything with no known length', () => {
    expect(librarySortLength(article('a', 900))).toEqual({ bucket: 0, value: 900 });
    expect(librarySortLength(manga('m', 18))).toEqual({ bucket: 1, value: 18 });
    expect(librarySortLength(plain('p'))).toEqual({ bucket: 2, value: 0 });
  });

  it('treats a zero or missing count as no length rather than as the shortest item', () => {
    expect(librarySortLength(article('z', 0)).bucket).toBe(2);
    expect(librarySortLength(manga('z2', 0)).bucket).toBe(2);
  });

  it('orders longest first inside a unit and never interleaves the two units', () => {
    const list = [plain('p1'), manga('m18', 18), article('a10', 10), manga('m1', 1), article('a900', 900)];
    const sorted = [...list].sort(compareLibraryLength).map((i) => i.id);
    expect(sorted).toEqual(['a900', 'a10', 'm18', 'm1', 'p1']);
  });

  it('is the defect this replaced: a shelf where nothing carries a charCount still sorts', () => {
    // The user's own library, measured live 2026-09-08: 24 items, 0 with
    // inboxMeta, 4 with a pageCount. The old comparator read charCount alone,
    // so every pair compared equal and the option changed nothing.
    const shelf = [plain('b1'), manga('m17', 17), plain('b2'), manga('m1', 1)];
    const old = [...shelf].sort((a, b) => (b.inboxMeta?.charCount ?? 0) - (a.inboxMeta?.charCount ?? 0));
    expect(old.map((i) => i.id)).toEqual(['b1', 'm17', 'b2', 'm1']);
    expect([...shelf].sort(compareLibraryLength).map((i) => i.id)).toEqual(['m17', 'm1', 'b1', 'b2']);
  });
});
