// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { BOOK_OPEN_AT_EVENT, openBookAt, takeBookOpenAt } from '../bookRoundTrip';
import { SECTION_OPEN_EVENT } from '../sectionSurface';
import { readerCollectionStudyInput } from '../studyMiningRoutes';

const listeners: Array<[string, EventListener]> = [];
function on(type: string, fn: EventListener): void {
  window.addEventListener(type, fn);
  listeners.push([type, fn]);
}

afterEach(() => {
  for (const [type, fn] of listeners.splice(0)) window.removeEventListener(type, fn);
  localStorage.clear();
});

describe('openBookAt', () => {
  it('lets an open reader of that book claim the jump, and then opens nothing else', () => {
    const sections: unknown[] = [];
    on(BOOK_OPEN_AT_EVENT, (event) => event.preventDefault());
    on(SECTION_OPEN_EVENT, (event) => sections.push((event as CustomEvent).detail));
    openBookAt({ bookId: 'b1', loc: 'p:4:0.5000' });
    expect(sections).toEqual([]);
    expect(takeBookOpenAt('b1')).toBeNull();
  });

  it('otherwise parks the position and asks the Library to open the book, which takes it once', () => {
    const sections: Array<{ section: string; intent: string; itemId: string }> = [];
    on(SECTION_OPEN_EVENT, (event) => {
      sections.push((event as CustomEvent).detail);
      event.preventDefault();
    });
    openBookAt({ bookId: 'b1', loc: 'p:4:0.5000', percent: 0.4 });
    expect(sections).toMatchObject([{ section: 'library', intent: 'open', itemId: 'b1' }]);
    expect(takeBookOpenAt('b1')).toBe('p:4:0.5000');
    expect(takeBookOpenAt('b1')).toBeNull();
  });

  it('a parked position for another book is dropped, not applied', () => {
    on(SECTION_OPEN_EVENT, (event) => event.preventDefault());
    openBookAt({ bookId: 'b1', loc: 'p:4:0.5000' });
    expect(takeBookOpenAt('b2')).toBeNull();
    expect(takeBookOpenAt('b1')).toBeNull();
  });

  it('ignores an invalid locator entirely', () => {
    const seen: string[] = [];
    on(BOOK_OPEN_AT_EVENT, () => seen.push('reader'));
    on(SECTION_OPEN_EVENT, () => seen.push('library'));
    openBookAt({ bookId: 'b1', loc: 'p:4:9' });
    expect(seen).toEqual([]);
  });
});

describe('reader collection mines carry their book position', () => {
  const base = { front: '猫', back: 'cat', reading: 'ねこ', sentence: '猫がいる。', bookId: 'b1', bookTitle: '本', studyLang: 'ja' as const, sendToAnki: false };

  it('on the card sourceRef, never in the dedupe-bearing sourceUrl', () => {
    const input = readerCollectionStudyInput({ ...base, position: 'p:2:0.1000', percent: 0.2 });
    expect(input.sourceRef).toEqual({ mediaId: 'b1', bookLocation: 'p:2:0.1000', bookPercent: 0.2, sentence: '猫がいる。' });
    expect(input.sourceUrl).toBeUndefined();
  });

  it('adds nothing for a mine with no position', () => {
    expect(readerCollectionStudyInput(base)).not.toHaveProperty('sourceRef');
  });
});
