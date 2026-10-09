import { describe, expect, it } from 'vitest';
import { bookLocation, bookLocationRef, cardBookPosition, isBookLocation } from '../bookLocation';

describe('book locations', () => {
  it('formats and validates the reader locator', () => {
    expect(bookLocation(3, 0.45678)).toBe('p:3:0.4568');
    expect(bookLocation(-2, 7)).toBe('p:0:1.0000');
    expect(isBookLocation('p:12:0.5')).toBe(true);
    expect(isBookLocation('p:12:1')).toBe(true);
    for (const bad of ['p:1:1.5', 'p:-1:0.2', 'p:1', 'javascript:alert(1)', 'p:1:0.2;x', 42, null]) {
      expect(isBookLocation(bad)).toBe(false);
    }
  });

  it('builds the sourceRef a mine carries, and refuses an invalid one', () => {
    expect(bookLocationRef('book-1', 'p:2:0.2500', 0.31, ' 吾輩は猫である。 ')).toEqual({
      mediaId: 'book-1',
      bookLocation: 'p:2:0.2500',
      bookPercent: 0.31,
      sentence: '吾輩は猫である。',
    });
    expect(bookLocationRef('book-1', 'nonsense')).toBeUndefined();
    expect(bookLocationRef('', 'p:2:0.2500')).toBeUndefined();
  });

  it('reads a position back off a reader-mined card only', () => {
    const ref = bookLocationRef('book-1', 'p:2:0.2500', 0.31);
    expect(cardBookPosition({ source: 'epub', sourceRef: ref })).toEqual({ bookId: 'book-1', loc: 'p:2:0.2500', percent: 0.31 });
    // A video card's ref has no book location; a non-reader card is never a book position.
    expect(cardBookPosition({ source: 'media', sourceRef: ref })).toBeNull();
    expect(cardBookPosition({ source: 'epub', sourceRef: { mediaId: 'm', cueStartSec: 3 } })).toBeNull();
    expect(cardBookPosition({ source: 'epub' })).toBeNull();
  });
});
