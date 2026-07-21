import { describe, expect, it } from 'vitest';
import type { BookLevelEstimate } from '../bookLevelEstimate';
import {
  effectiveLang,
  effectiveLevelEstimate,
  levelSortKey,
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
