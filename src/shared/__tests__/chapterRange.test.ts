import { describe, expect, it } from 'vitest';
import {
  chapterRangeCount,
  chapterRangeSlice,
  chapterRangeSlug,
  formatChapterRange,
  miningDeckIdentity,
  normalizeChapterRange,
  safeTitleSegment,
} from '../chapterRange';
import { deckBookId, legacyDeckBookId } from '../deckImport';

const SECTIONS = ['a', 'b', 'c', 'd', 'e'];

describe('normalizeChapterRange', () => {
  it('treats no range and a full span as the same thing', () => {
    expect(normalizeChapterRange(null, 5)).toBeNull();
    expect(normalizeChapterRange({}, 5)).toBeNull();
    // A full-span selection must NOT produce a second identity for the cards an
    // unscoped run would produce, or the same mining run lands in two decks.
    expect(normalizeChapterRange({ from: 1, to: 5 }, 5)).toBeNull();
  });

  it('reads a single bound as a single chapter, not an open span', () => {
    expect(normalizeChapterRange({ from: 5 }, 10)).toEqual({ from: 5, to: 5 });
    expect(normalizeChapterRange({ to: 3 }, 10)).toEqual({ from: 3, to: 3 });
  });

  it('orders a reversed pair rather than refusing it', () => {
    expect(normalizeChapterRange({ from: 7, to: 2 }, 10)).toEqual({ from: 2, to: 7 });
  });

  it('clamps to the sections that exist', () => {
    expect(normalizeChapterRange({ from: 0, to: 99 }, 5)).toBeNull();
    expect(normalizeChapterRange({ from: 4, to: 99 }, 5)).toEqual({ from: 4, to: 5 });
  });

  it('returns null when the book has no sections', () => {
    expect(normalizeChapterRange({ from: 1, to: 2 }, 0)).toBeNull();
  });
});

describe('chapterRangeSlice', () => {
  it('slices inclusively on both ends, 1-based', () => {
    expect(chapterRangeSlice(SECTIONS, { from: 2, to: 4 })).toEqual(['b', 'c', 'd']);
    expect(chapterRangeSlice(SECTIONS, { from: 5, to: 5 })).toEqual(['e']);
  });

  it('returns every section for a null range', () => {
    expect(chapterRangeSlice(SECTIONS, null)).toEqual(SECTIONS);
  });

  it('counts what it sliced', () => {
    expect(chapterRangeCount({ from: 2, to: 4 }, 5)).toBe(3);
    expect(chapterRangeCount(null, 5)).toBe(5);
    expect(chapterRangeSlice(SECTIONS, { from: 2, to: 4 })).toHaveLength(
      chapterRangeCount({ from: 2, to: 4 }, 5),
    );
  });
});

describe('range labels', () => {
  it('names a single chapter and a span differently', () => {
    expect(formatChapterRange({ from: 5, to: 5 })).toBe('Ch. 5');
    expect(formatChapterRange({ from: 1, to: 3 })).toBe('Ch. 1–3');
    expect(formatChapterRange(null)).toBe('Full book');
  });

  it('slugs to something an id can survive', () => {
    expect(chapterRangeSlug({ from: 5, to: 5 })).toBe('ch5');
    expect(chapterRangeSlug({ from: 1, to: 3 })).toBe('ch1-3');
    expect(chapterRangeSlug(null)).toBe('full');
  });
});

describe('safeTitleSegment', () => {
  it('keeps Japanese, which is the whole point', () => {
    expect(safeTitleSegment('吾輩は猫である')).toBe('吾輩は猫である');
  });

  it('strips path separators and the Windows-reserved set', () => {
    expect(safeTitleSegment('a/b\\c:d*e?f"g<h>i|j')).toBe('a b c d e f g h i j');
  });
});

describe('miningDeckIdentity', () => {
  const book = { itemId: 'item-42', bookTitle: '吾輩は猫である' };

  it('is deterministic — the same scope always names itself the same way', () => {
    const first = miningDeckIdentity({ ...book, range: { from: 1, to: 3 } });
    const second = miningDeckIdentity({ ...book, range: { from: 1, to: 3 } });
    expect(first).toEqual(second);
  });

  it('gives every surface one name', () => {
    const identity = miningDeckIdentity({ ...book, range: { from: 5, to: 5 } });
    expect(identity.deckTitle).toBe('吾輩は猫である — Ch. 5');
    // The deck the user sees, the deck Anki receives, and the file on disk must
    // not drift apart; that is the point of a single identity function.
    expect(identity.ankiDeckName).toBe(identity.deckTitle);
    expect(identity.fileBaseName).toBe('吾輩は猫である ch5');
  });

  it('separates ranges, so re-mining one never replaces another', () => {
    // `replaceImportedDeck` deletes every card in the matched (bookId, bookTitle)
    // group before inserting. Distinct ids per range is what makes that a
    // targeted update rather than data loss.
    const chapter5 = miningDeckIdentity({ ...book, range: { from: 5, to: 5 } });
    const chapters13 = miningDeckIdentity({ ...book, range: { from: 1, to: 3 } });
    const whole = miningDeckIdentity({ ...book, range: null });
    const ids = [chapter5.bookId, chapters13.bookId, whole.bookId];
    expect(new Set(ids).size).toBe(3);
  });

  it('separates generators targeting the same range', () => {
    const mined = miningDeckIdentity({ ...book, range: { from: 2, to: 2 } });
    const generated = miningDeckIdentity({ ...book, range: { from: 2, to: 2 }, generator: 'ai-studio' });
    expect(mined.bookId).not.toBe(generated.bookId);
  });

  it('distinguishes two Japanese-titled books, which the old deckBookId could not', () => {
    // The old `deckBookId` slugged with `[^\w]+`, and `\w` is ASCII-only, so
    // every Japanese title collapsed to the same id (`legacyDeckBookId` keeps
    // that scheme for matching old decks). Deriving from the item id is why
    // this identity never inherited that collision.
    expect(legacyDeckBookId('吾輩は猫である')).toBe(legacyDeckBookId('雪国'));
    expect(deckBookId('吾輩は猫である')).not.toBe(deckBookId('雪国'));

    const a = miningDeckIdentity({ itemId: 'item-1', bookTitle: '吾輩は猫である', range: null });
    const b = miningDeckIdentity({ itemId: 'item-2', bookTitle: '雪国', range: null });
    expect(a.bookId).not.toBe(b.bookId);
  });

  it('falls back rather than producing an empty name', () => {
    const identity = miningDeckIdentity({ itemId: '', bookTitle: '   ', range: null });
    expect(identity.bookId).toBe('epub-item-full');
    expect(identity.deckTitle).toBe('Untitled');
  });
});
