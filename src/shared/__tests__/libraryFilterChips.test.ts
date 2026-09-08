/**
 * `availableFilterChips` — Library's language / level chips must offer only what can return
 * something, without ever stranding the user inside a filter they can no longer see.
 *
 * The defect this covers, measured live: Library rendered all thirteen chips unconditionally,
 * so a 24-item shelf holding only Japanese and unknown-language books at L7 still offered
 * Chinese, English, and every level from L1 to L6 — eleven controls that could only ever
 * produce an empty result, and thirteen of the twenty-five a user has to scan before doing
 * anything (rubric category 5 Q4).
 */
import { describe, expect, it } from 'vitest';

import type { BookLevelEstimate } from '../bookLevelEstimate';
import { availableFilterChips, matchesLibraryFilters } from '../libraryLevel';
import type { LibraryItem } from '../types';

const item = (id: string, patch: Partial<LibraryItem> = {}): LibraryItem =>
  ({
    id,
    title: id,
    kind: 'book',
    path: `/tmp/${id}`,
    createdAt: 0,
    ...patch,
  }) as unknown as LibraryItem;

const ja = (id: string, level?: number) =>
  item(id, { inboxMeta: { lang: 'ja', ...(level == null ? {} : { levelEstimate: level }) } } as Partial<LibraryItem>);

describe('availableFilterChips', () => {
  it('keeps only the languages present, plus all', () => {
    const { langs } = availableFilterChips(
      [ja('a'), ja('b'), item('c')],
      {},
      { lang: 'all', level: 'all' },
    );
    // `c` carries no lang, which resolves to `unknown` — a real bucket, not a missing one.
    expect(langs).toEqual(['all', 'ja', 'unknown']);
    expect(langs).not.toContain('zh');
    expect(langs).not.toContain('en');
  });

  it('keeps only the levels present, plus all', () => {
    const { levels } = availableFilterChips([ja('a', 7), ja('b', 7)], {}, { lang: 'all', level: 'all' });
    expect(levels).toEqual(['all', '7']);
  });

  it('drops the unleveled sentinel rather than offering it as a level', () => {
    // `levelSortKey` returns 99 for an item with no estimate. 99 is not a chip.
    const { levels } = availableFilterChips([item('a')], {}, { lang: 'all', level: 'all' });
    expect(levels).toEqual(['all']);
  });

  it('reads a level off the book estimate when the item carries none', () => {
    // `jlpt-n5` is tier 2 on the shared scale, so the chip that appears must be L2 — not just
    // "some extra chip", which a length assertion alone would have accepted.
    const estimate = { scheme: 'jlpt', slotId: 'jlpt-n5' } as unknown as BookLevelEstimate;
    const { levels } = availableFilterChips([item('a')], { a: estimate }, { lang: 'all', level: 'all' });
    expect(levels).toEqual(['all', '2']);
  });

  it('KEEPS THE SELECTED CHIP even when nothing matches it — the undo path', () => {
    // The user filters to Chinese, then moves to a folder with no Chinese in it. Dropping the
    // chip would leave an invisible filter applied and an empty shelf with no way back.
    const { langs, levels } = availableFilterChips(
      [ja('a', 7)],
      {},
      { lang: 'zh', level: '3' },
    );
    expect(langs).toContain('zh');
    expect(levels).toContain('3');
    expect(levels).toContain('7');
  });

  it('never drops all — an empty list still offers the way back', () => {
    const { langs, levels } = availableFilterChips([], {}, { lang: 'all', level: 'all' });
    expect(langs).toEqual(['all']);
    expect(levels).toEqual(['all']);
  });
});

/**
 * D313, measured live on the user's own 24-item library. The folder chips counted the raw
 * store while the grid applied the language and level filter, so with Japanese selected the
 * `Manga` chip promised 3, opened onto zero books, and said "This folder is empty" — false
 * (it holds 3) and pointing at the wrong remedy (file a book in, rather than clear the filter).
 *
 * These assert the shape that stops it recurring: the ONE predicate both sides now call.
 */
describe('matchesLibraryFilters — the predicate folder counts and the grid share', () => {
  const bookLevels = {};
  const all = { lang: 'all', level: 'all' };

  it('the real case: an unknown-language book is not counted under a Japanese filter', () => {
    // The three Manga items carried no lang at all, which resolves to `unknown`.
    expect(matchesLibraryFilters(item('manga'), bookLevels, { lang: 'ja', level: 'all' })).toBe(false);
    expect(matchesLibraryFilters(ja('novel'), bookLevels, { lang: 'ja', level: 'all' })).toBe(true);
  });

  it('an unset filter matches everything, including items with nothing to match on', () => {
    expect(matchesLibraryFilters(item('bare'), bookLevels, all)).toBe(true);
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, all)).toBe(true);
  });

  it('the level filter compares numerically, so "7" and 7 are the same level', () => {
    // A string/number mismatch here would silently reject every item and empty the shelf.
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, { lang: 'all', level: '7' })).toBe(true);
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, { lang: 'all', level: '3' })).toBe(false);
  });

  it('the unleveled sentinel is never a level — 99 matches no chip', () => {
    for (const level of ['1', '2', '3', '4', '5', '6', '7']) {
      expect(matchesLibraryFilters(item('bare'), bookLevels, { lang: 'all', level })).toBe(false);
    }
  });

  it('reads the level off the book estimate, like the chips and the sort do', () => {
    const estimate = { scheme: 'jlpt', slotId: 'jlpt-n5' } as unknown as BookLevelEstimate;
    expect(matchesLibraryFilters(item('a'), { a: estimate }, { lang: 'all', level: '2' })).toBe(true);
    expect(matchesLibraryFilters(item('a'), { a: estimate }, { lang: 'all', level: '7' })).toBe(false);
  });

  it('both filters must pass, not either — an AND, not an OR', () => {
    // The mutation that motivates this: `||` here would let the Manga folder back into a
    // Japanese count on the strength of its level alone.
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, { lang: 'ja', level: '7' })).toBe(true);
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, { lang: 'zh', level: '7' })).toBe(false);
    expect(matchesLibraryFilters(ja('a', 7), bookLevels, { lang: 'ja', level: '3' })).toBe(false);
  });

  it('counting a folder through this predicate agrees with filtering it — the live divergence', () => {
    // The exact live shape: a Manga folder of unknown-language books beside Japanese ones.
    const library = [
      item('m1', { folder: 'Manga' } as Partial<LibraryItem>),
      item('m2', { folder: 'Manga' } as Partial<LibraryItem>),
      item('m3', { folder: 'Manga' } as Partial<LibraryItem>),
      ja('n1'),
      ja('n2'),
    ];
    const selected = { lang: 'ja', level: 'all' };
    const countForManga = library.filter(
      (it) => it.folder === 'Manga' && matchesLibraryFilters(it, bookLevels, selected),
    ).length;
    const shownInManga = library
      .filter((it) => it.folder === 'Manga')
      .filter((it) => matchesLibraryFilters(it, bookLevels, selected)).length;
    expect(countForManga).toBe(shownInManga);
    expect(countForManga).toBe(0); // and the chip must say 0, not the 3 it used to promise
  });
});
