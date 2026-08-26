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
import { availableFilterChips } from '../libraryLevel';
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
