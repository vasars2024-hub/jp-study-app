/**
 * P4's view model, §6. The assertions that matter here are the ones about the
 * DENOMINATOR and about stability — a progress bar that counts the wrong things
 * is wrong quietly, and a row order that is not total reshuffles under the user.
 */

import { describe, expect, it } from 'vitest';
import type { LevelTier } from '../levelScale';
import type {
  ReadingEntryState,
  ReadingList,
  ReadingListsDocument,
  ReadingWorkRef,
} from '../readingLists';
import {
  hasLiveSuggestion,
  nextUpReadingRow,
  readingChallengePace,
  readingListRows,
  readingListsForItem,
  readingWorksByAuthor,
  reorderEntryIds,
  recentReadingFinishes,
  savedSmartLists,
  sortReadingListEntries,
  sortReadingListSummaries,
  summarizeReadingList,
  summarizeReadingLists,
  totalReadingTriage,
} from '../readingListViews';

const NOW = 1_770_000_000_000;

function work(patch: Partial<ReadingWorkRef> & { id: string; titleRaw: string }): ReadingWorkRef {
  return { boundItemIds: [], bindConfidence: 0, ...patch };
}

function list(
  states: readonly ReadingEntryState[],
  patch: Partial<ReadingList> = {},
): ReadingList {
  return {
    id: 'l1',
    name: 'From Aya',
    kind: 'pool',
    createdAt: NOW,
    updatedAt: NOW,
    entries: states.map((state, index) => ({
      id: `e${index}`,
      workId: `w${index}`,
      order: index,
      addedAt: NOW + index,
      state,
    })),
    imports: [],
    ...patch,
  };
}

const worksFor = (states: readonly unknown[], patch: (i: number) => Partial<ReadingWorkRef> = () => ({})) =>
  states.map((_, index) => work({ id: `w${index}`, titleRaw: `Book ${index}`, ...patch(index) }));

describe('summarizeReadingList counts what a progress bar may count', () => {
  it('reads N/M over the states that can still move, not over every row', () => {
    const states: ReadingEntryState[] = [
      'finished',
      'finished',
      'reading',
      'wanted',
      'abandoned',
      'skipped',
    ];
    const summary = summarizeReadingList(list(states), worksFor(states));

    expect(summary.total).toBe(6);
    // The whole point: abandoned and skipped are OUT of the denominator (§5.9).
    expect(summary.counted).toBe(4);
    expect(summary.finished).toBe(2);
    expect(summary.progress).toBe(0.5);
    expect(summary.byState).toEqual({
      wanted: 1,
      owned: 0,
      reading: 1,
      finished: 2,
      abandoned: 1,
      skipped: 1,
    });
  });

  it('a list of nothing but abandoned reads 0, not NaN', () => {
    const states: ReadingEntryState[] = ['abandoned', 'skipped'];
    const summary = summarizeReadingList(list(states), worksFor(states));
    expect(summary.counted).toBe(0);
    expect(summary.progress).toBe(0);
    expect(Number.isNaN(summary.progress)).toBe(false);
  });

  it('an empty list reads 0 of 0 and draws no covers', () => {
    const summary = summarizeReadingList(list([]), []);
    expect(summary).toMatchObject({ total: 0, counted: 0, finished: 0, progress: 0, triage: 0 });
    expect(summary.coverItemIds).toEqual([]);
  });
});

describe('the mosaic and the triage strip', () => {
  it('takes at most four covers, in list order, one per item', () => {
    const states: ReadingEntryState[] = ['owned', 'owned', 'owned', 'owned', 'owned'];
    const works = worksFor(states, (i) => ({ boundItemIds: [`li_${i}`] }));
    const summary = summarizeReadingList(list(states), works);
    expect(summary.coverItemIds).toEqual(['li_0', 'li_1', 'li_2', 'li_3']);
  });

  it('never repeats one item id across the mosaic', () => {
    const states: ReadingEntryState[] = ['owned', 'owned'];
    const works = [
      work({ id: 'w0', titleRaw: 'A', boundItemIds: ['li_same'] }),
      work({ id: 'w1', titleRaw: 'B', boundItemIds: ['li_same'] }),
    ];
    expect(summarizeReadingList(list(states), works).coverItemIds).toEqual(['li_same']);
  });

  it('counts a suggestion once per WORK even when the book is listed twice', () => {
    const base = list(['wanted', 'wanted']);
    // Two entries, one work — the case a double paste produces.
    const twice: ReadingList = {
      ...base,
      entries: base.entries.map((entry) => ({ ...entry, workId: 'w0' })),
    };
    const works = [
      work({ id: 'w0', titleRaw: 'A', suggestion: { itemId: 'li_a', confidence: 0.7 } }),
    ];
    expect(summarizeReadingList(twice, works).triage).toBe(1);
  });

  it('a dismissed or already-bound suggestion is not a decision the user owes', () => {
    expect(hasLiveSuggestion(work({ id: 'w', titleRaw: 'A' }))).toBe(false);
    expect(
      hasLiveSuggestion(work({ id: 'w', titleRaw: 'A', suggestion: { itemId: 'i', confidence: 0.7 } })),
    ).toBe(true);
    expect(
      hasLiveSuggestion(
        work({
          id: 'w',
          titleRaw: 'A',
          suggestion: { itemId: 'i', confidence: 0.7, dismissedAt: NOW },
        }),
      ),
    ).toBe(false);
    // Already bound: the question the suggestion asked has been answered.
    expect(
      hasLiveSuggestion(
        work({
          id: 'w',
          titleRaw: 'A',
          boundItemIds: ['li_a'],
          suggestion: { itemId: 'i', confidence: 0.7 },
        }),
      ),
    ).toBe(false);
  });
});

describe('row order is total, so the list cannot reshuffle itself', () => {
  it('breaks an order tie on addedAt, then on id', () => {
    const base = list(['wanted', 'wanted', 'wanted']);
    const tied: ReadingList = {
      ...base,
      entries: [
        { ...base.entries[0], id: 'eB', order: 0, addedAt: NOW + 5 },
        { ...base.entries[1], id: 'eA', order: 0, addedAt: NOW + 5 },
        { ...base.entries[2], id: 'eC', order: 0, addedAt: NOW + 1 },
      ],
    };
    expect(sortReadingListEntries(tied).map((entry) => entry.id)).toEqual(['eC', 'eA', 'eB']);
    // Stable across a re-sort of the already-sorted array, which is what a
    // re-render actually does.
    const once = sortReadingListEntries(tied);
    expect(sortReadingListEntries({ ...tied, entries: once }).map((e) => e.id)).toEqual([
      'eC',
      'eA',
      'eB',
    ]);
  });

  it('does not mutate the list it was handed', () => {
    const source = list(['wanted', 'finished']);
    const before = source.entries.map((entry) => entry.id);
    source.entries[0].order = 9;
    sortReadingListEntries(source);
    expect(source.entries.map((entry) => entry.id)).toEqual(before);
  });
});

describe('readingListRows — §11.1, every row goes somewhere real', () => {
  it('names a row by its work, and falls back to the pasted line rather than blank', () => {
    const base = list(['owned', 'wanted']);
    const withSource: ReadingList = {
      ...base,
      entries: [
        base.entries[0],
        {
          ...base.entries[1],
          sourceRef: { importId: 'ri1', lineIndex: 3, rawLine: '  コンビニ人間  ' },
        },
      ],
    };
    const works = [
      work({ id: 'w0', titleRaw: 'Kafka on the Shore', boundItemIds: ['li_kafka'] }),
      work({ id: 'w1', titleRaw: '   ' }),
    ];
    const rows = readingListRows(withSource, works);

    expect(rows[0].title).toBe('Kafka on the Shore');
    expect(rows[0].itemId).toBe('li_kafka');
    // Unbound is a DESTINATION (the acquisition path), not a dead row.
    expect(rows[1].title).toBe('コンビニ人間');
    expect(rows[1].itemId).toBeNull();
  });

  it('keeps a row whose work is missing entirely rather than dropping it', () => {
    const rows = readingListRows(list(['wanted']), []);
    expect(rows).toHaveLength(1);
    expect(rows[0].work).toBeUndefined();
    expect(rows[0].itemId).toBeNull();
  });
});

describe('card order', () => {
  const summaryOf = (id: string, patch: Partial<ReadingList>, states: ReadingEntryState[]) =>
    summarizeReadingList(list(states, { id, ...patch }), worksFor(states));

  it('sinks archived lists under every sort', () => {
    const live = summaryOf('l_live', { name: 'Zeta', updatedAt: NOW }, ['wanted']);
    const gone = summaryOf('l_gone', { name: 'Alpha', updatedAt: NOW + 99, archivedAt: NOW }, [
      'finished',
    ]);
    for (const sort of ['recent', 'name', 'progress'] as const) {
      expect(sortReadingListSummaries([gone, live], sort).map((s) => s.listId)).toEqual([
        'l_live',
        'l_gone',
      ]);
    }
  });

  it('orders by recency, name and progress as asked', () => {
    const a = summaryOf('a', { name: 'Bravo', updatedAt: NOW + 1 }, ['finished', 'wanted']);
    const b = summaryOf('b', { name: 'Alpha', updatedAt: NOW + 2 }, ['wanted', 'wanted']);
    expect(sortReadingListSummaries([a, b], 'recent').map((s) => s.listId)).toEqual(['b', 'a']);
    expect(sortReadingListSummaries([a, b], 'name').map((s) => s.listId)).toEqual(['b', 'a']);
    expect(sortReadingListSummaries([a, b], 'progress').map((s) => s.listId)).toEqual(['a', 'b']);
  });

  it('does not mutate the array it was handed', () => {
    const a = summaryOf('a', { name: 'B', updatedAt: NOW + 1 }, ['wanted']);
    const b = summaryOf('b', { name: 'A', updatedAt: NOW + 2 }, ['wanted']);
    const input = [a, b];
    sortReadingListSummaries(input, 'name');
    expect(input.map((s) => s.listId)).toEqual(['a', 'b']);
  });
});

describe('totalReadingTriage', () => {
  it('counts one work once across lists, and ignores archived lists', () => {
    const works = [work({ id: 'w0', titleRaw: 'A', suggestion: { itemId: 'i', confidence: 0.7 } })];
    const entry = { id: 'e', workId: 'w0', order: 0, addedAt: NOW, state: 'wanted' as const };
    const document = {
      schemaVersion: 1,
      revision: 3,
      works,
      lists: [
        { ...list([]), id: 'l1', entries: [entry] },
        { ...list([]), id: 'l2', entries: [{ ...entry, id: 'e2' }] },
        { ...list([]), id: 'l3', archivedAt: NOW, entries: [{ ...entry, id: 'e3' }] },
      ],
    };
    expect(totalReadingTriage(document)).toBe(1);
    expect(summarizeReadingLists(document).map((s) => s.listId)).toEqual(['l1', 'l2', 'l3']);
  });
});

describe('nextUpReadingRow', () => {
  it('prefers a book already open over one merely on the shelf, then the list order', () => {
    const states: ReadingEntryState[] = ['wanted', 'owned', 'reading', 'owned'];
    const l = list(states);
    const works = worksFor(states);
    expect(nextUpReadingRow(l, works)?.entry.id).toBe('e2');

    // With nothing being read, the shelf wins over the shopping list, and among
    // the shelf entries the user's own order decides.
    const noReading = list(['wanted', 'owned', 'finished', 'owned']);
    expect(nextUpReadingRow(noReading, works)?.entry.id).toBe('e1');
  });

  it('is null when every entry is finished, abandoned or skipped', () => {
    const states: ReadingEntryState[] = ['finished', 'abandoned', 'skipped'];
    expect(nextUpReadingRow(list(states), worksFor(states))).toBeNull();
  });
});

describe('nextUpReadingRow — §5.3 best-fit difficulty for pools', () => {
  const FOUR_OWNED: ReadingEntryState[] = ['owned', 'owned', 'owned', 'owned'];
  const works = worksFor(FOUR_OWNED);
  // w0 far too hard, w1 one below the reader, w2 one above, w3 exactly on it.
  const levels = new Map<string, LevelTier | null>([
    ['w0', 7],
    ['w1', 3],
    ['w2', 5],
    ['w3', 4],
  ]);

  it('picks the closest tier to the reader rather than the first row', () => {
    const row = nextUpReadingRow(list(FOUR_OWNED), works, { levels, targetLevel: 4 });
    expect(row?.entry.id).toBe('e3');
    // The control the whole option exists for: the SAME list with no levels is
    // the shipped behaviour, unchanged.
    expect(nextUpReadingRow(list(FOUR_OWNED), works)?.entry.id).toBe('e0');
    expect(nextUpReadingRow(list(FOUR_OWNED), works, { targetLevel: 4 })?.entry.id).toBe('e0');
    expect(nextUpReadingRow(list(FOUR_OWNED), works, { levels })?.entry.id).toBe('e0');
  });

  it('breaks an exact tie toward the EASIER book', () => {
    // w1 is 3 and w2 is 5 against a target of 4: both one tier away. A book below
    // the reader is always readable; one above may not be.
    const twoWay = new Map<string, LevelTier | null>([
      ['w0', null],
      ['w1', 3],
      ['w2', 5],
      ['w3', null],
    ]);
    const row = nextUpReadingRow(list(FOUR_OWNED), works, { levels: twoWay, targetLevel: 4 });
    expect(row?.entry.id).toBe('e1');
    // And the direction is what decided it, not the order: put the harder book
    // first and it still loses.
    const reversed = new Map<string, LevelTier | null>([
      ['w0', 5],
      ['w1', 3],
    ]);
    expect(
      nextUpReadingRow(list(['owned', 'owned']), worksFor(['owned', 'owned']), {
        levels: reversed,
        targetLevel: 4,
      })?.entry.id,
    ).toBe('e1');
  });

  it('never prefers an unmeasured work over a measured fit, and never drops it', () => {
    const unmeasured = new Map<string, LevelTier | null>([['w1', 7]]);
    // w0 is absent from the map entirely, w1 is measured but four tiers off.
    // Measured-and-far still beats unknown: this is §7's `difficultyMax` call.
    expect(
      nextUpReadingRow(list(['owned', 'owned']), worksFor(['owned', 'owned']), {
        levels: unmeasured,
        targetLevel: 3,
      })?.entry.id,
    ).toBe('e1');
    // But an all-unmeasured pool still answers, in list order, rather than null.
    expect(
      nextUpReadingRow(list(['owned', 'owned']), worksFor(['owned', 'owned']), {
        levels: new Map(),
        targetLevel: 3,
      })?.entry.id,
    ).toBe('e0');
  });

  it('does not re-order any kind but pool, and never crosses a state band', () => {
    for (const kind of ['ordered', 'tiered', 'challenge', 'smart'] as const) {
      const row = nextUpReadingRow(list(FOUR_OWNED, { kind }), works, {
        levels,
        targetLevel: 4,
      });
      expect([kind, row?.entry.id]).toEqual([kind, 'e0']);
    }
    // A perfectly-levelled book that is already FINISHED does not get promoted
    // over a worse-fitting one that is merely owned — the band wins first.
    const mixed: ReadingEntryState[] = ['owned', 'reading', 'owned', 'finished'];
    expect(
      nextUpReadingRow(list(mixed), worksFor(mixed), { levels, targetLevel: 4 })?.entry.id,
    ).toBe('e1');
  });
});

describe('recentReadingFinishes', () => {
  it('is newest first, and counts one book once however many lists it is on', () => {
    const works = [
      work({ id: 'w0', titleRaw: 'A' }),
      work({ id: 'w1', titleRaw: 'B' }),
    ];
    const entry = (id: string, workId: string, finishedAt: number) => ({
      id,
      workId,
      order: 0,
      addedAt: NOW,
      state: 'finished' as const,
      finishedAt,
    });
    const document = {
      schemaVersion: 1,
      revision: 1,
      works,
      lists: [
        { ...list([]), id: 'l1', entries: [entry('e1', 'w0', NOW + 10), entry('e2', 'w1', NOW + 40)] },
        // The same book, ticked by §4's fan-out on a second list. A widget that
        // showed it twice would read as two books.
        { ...list([]), id: 'l2', entries: [entry('e3', 'w0', NOW + 10)] },
      ],
    };
    expect(recentReadingFinishes(document, 5).map((r) => r.title)).toEqual(['B', 'A']);
    expect(recentReadingFinishes(document, 1).map((r) => r.title)).toEqual(['B']);
  });

  it('ignores an entry that is finished with no date rather than dating it now', () => {
    const document = {
      schemaVersion: 1,
      revision: 1,
      works: [work({ id: 'w0', titleRaw: 'A' })],
      lists: [
        {
          ...list([]),
          entries: [{ id: 'e0', workId: 'w0', order: 0, addedAt: NOW, state: 'finished' as const }],
        },
      ],
    };
    expect(recentReadingFinishes(document)).toEqual([]);
  });
});

describe('readingChallengePace', () => {
  const DAY = 86_400_000;

  it('says nothing at all when the list has no target date', () => {
    const summary = summarizeReadingList(list(['finished', 'wanted']), worksFor(['a', 'b']));
    expect(readingChallengePace(summary, undefined, NOW, NOW)).toBeNull();
    expect(readingChallengePace(summary, { count: 10 }, NOW, NOW)).toBeNull();
  });

  it('reports ahead and behind as the same number with a sign', () => {
    const states: ReadingEntryState[] = ['finished', 'finished', 'wanted', 'wanted'];
    const summary = summarizeReadingList(list(states), worksFor(states));
    const target = { count: 4, by: NOW + 10 * DAY };

    // Halfway through the window with half the books done: exactly on pace.
    const even = readingChallengePace(summary, target, NOW + 5 * DAY, NOW);
    expect(even?.aheadBy).toBe(0);
    expect(even?.remaining).toBe(2);
    expect(even?.daysLeft).toBe(5);

    // Same finishes, later in the window: behind, and it says so plainly.
    expect(readingChallengePace(summary, target, NOW + 9 * DAY, NOW)?.aheadBy).toBeLessThan(0);
    // And earlier: ahead.
    expect(readingChallengePace(summary, target, NOW + DAY, NOW)?.aheadBy).toBeGreaterThan(0);
  });

  it('clamps elapsed into the window, so a challenge that has not started is not "ahead"', () => {
    const states: ReadingEntryState[] = ['wanted', 'wanted'];
    const summary = summarizeReadingList(list(states), worksFor(states));
    const target = { count: 2, by: NOW + 10 * DAY };
    // Before the start: zero expected, zero finished, zero ahead — never a
    // negative elapsed producing a phantom lead.
    expect(readingChallengePace(summary, target, NOW - 5 * DAY, NOW)?.aheadBy).toBe(0);
    // Past the date: no required rate at all rather than a division by zero.
    expect(readingChallengePace(summary, target, NOW + 20 * DAY, NOW)?.requiredPerDay).toBeNull();
  });
});

describe('reorderEntryIds — the §11.4 move, as a pure function', () => {
  const ORDER = ['a', 'b', 'c', 'd'];

  it('inserts BEFORE the target when travelling up', () => {
    expect(reorderEntryIds(ORDER, 'd', 'b')).toEqual(['a', 'd', 'b', 'c']);
  });

  it('inserts AFTER the target when travelling down', () => {
    // The whole reason the two directions differ: dropping `a` onto `c` while
    // moving down and landing it BEFORE `c` would leave it exactly where the
    // user could already see it was not, an off-by-one nobody can explain.
    expect(reorderEntryIds(ORDER, 'a', 'c')).toEqual(['b', 'c', 'a', 'd']);
  });

  it('is a no-op when a row is dropped onto itself', () => {
    expect(reorderEntryIds(ORDER, 'b', 'b')).toEqual(ORDER);
  });

  it('is a no-op for an id that is not in the order', () => {
    expect(reorderEntryIds(ORDER, 'zz', 'b')).toEqual(ORDER);
    expect(reorderEntryIds(ORDER, 'b', 'zz')).toEqual(ORDER);
  });

  it('never drops or duplicates an id, whatever the move', () => {
    // The invariant that makes this safe to hand to `reorderReadingListEntries`,
    // which appends anything the caller omitted: a lossy reorder would silently
    // move every omitted entry to the end of the list.
    for (const moved of ORDER) {
      for (const target of ORDER) {
        const next = reorderEntryIds(ORDER, moved, target);
        expect([...next].sort()).toEqual([...ORDER].sort());
      }
    }
  });

  it('returns a copy, so a caller cannot mutate the order it was given', () => {
    const next = reorderEntryIds(ORDER, 'b', 'b');
    next.push('e');
    expect(ORDER).toHaveLength(4);
  });
});

describe('readingWorksByAuthor — §11.1, the other works by one author', () => {
  /** Two lists; the same author on three works, spelled three ways. */
  function document(): ReadingListsDocument {
    const works: ReadingWorkRef[] = [
      work({ id: 'w0', titleRaw: 'Convenience Store Woman', authorRaw: 'Sayaka Murata' }),
      work({ id: 'w1', titleRaw: 'Earthlings', authorRaw: '  sayaka   MURATA ' }),
      work({ id: 'w2', titleRaw: 'Kafka on the Shore', authorRaw: 'Haruki Murakami' }),
      work({ id: 'w3', titleRaw: 'Life Ceremony', authorRaw: 'Sayaka Murata', boundItemIds: ['li9'] }),
      // No author at all — the case a blank key would sweep up.
      work({ id: 'w4', titleRaw: 'A book from nowhere' }),
    ];
    const listOf = (id: string, name: string, pairs: [string, ReadingEntryState][], patch: Partial<ReadingList> = {}): ReadingList => ({
      id,
      name,
      kind: 'pool',
      createdAt: NOW,
      updatedAt: NOW,
      entries: pairs.map(([workId, state], index) => ({
        id: id + '_e' + index,
        workId,
        order: index,
        addedAt: NOW + index,
        state,
      })),
      imports: [],
      ...patch,
    });
    return {
      schemaVersion: 1,
      revision: 1,
      works,
      lists: [
        listOf('lA', 'Reading now', [['w0', 'reading'], ['w2', 'wanted'], ['w4', 'wanted']]),
        listOf('lB', 'Someday', [['w1', 'wanted'], ['w3', 'owned']], { archivedAt: NOW }),
      ],
    } as unknown as ReadingListsDocument;
  }

  it('finds the author across every list, however the name was spelled', () => {
    const rows = readingWorksByAuthor(document(), 'SAYAKA murata');
    expect(rows.map((row) => row.title)).toEqual([
      'Convenience Store Woman',
      'Earthlings',
      'Life Ceremony',
    ]);
    // Across lists, and an archived list is still a place the book IS.
    expect(rows.map((row) => row.listId)).toEqual(['lA', 'lB', 'lB']);
    expect(rows.map((row) => row.listArchived)).toEqual([false, true, true]);
    // "owned and wanted" — the state travels, and so does the destination.
    expect(rows.map((row) => row.state)).toEqual(['reading', 'wanted', 'owned']);
    expect(rows.map((row) => row.itemId)).toEqual([null, null, 'li9']);
  });

  it('matches nothing for a blank author rather than everything without one', () => {
    // `authorRaw` is optional and most works never carry one, so a key-less
    // match would return every authorless work in the document.
    expect(readingWorksByAuthor(document(), '')).toEqual([]);
    expect(readingWorksByAuthor(document(), '   ')).toEqual([]);
    expect(readingWorksByAuthor(document(), 'nobody at all')).toEqual([]);
  });

  it('keeps one work on two lists as two rows, each naming its list', () => {
    const base = document();
    const twice: ReadingListsDocument = {
      ...base,
      lists: [
        base.lists[0],
        {
          ...base.lists[1],
          entries: [
            ...base.lists[1].entries,
            { id: 'lB_e9', workId: 'w0', order: 9, addedAt: NOW, state: 'wanted' as const },
          ],
        },
      ],
    };
    const rows = readingWorksByAuthor(twice, 'Sayaka Murata');
    const first = rows.filter((row) => row.workId === 'w0');
    expect(first).toHaveLength(2);
    expect(first.map((row) => row.listName)).toEqual(['Reading now', 'Someday']);
    // Distinct entry ids, so a caller can key on them without collisions.
    expect(new Set(first.map((row) => row.entryId)).size).toBe(2);
  });
});

describe('readingListsForItem — §11.1 row 8, the "on 2 lists" line in the reader', () => {
  /**
   * One item (`li7`) bound to `w0`, which sits on three lists — one of them
   * archived. `w2` is bound to a DIFFERENT item and must never leak in.
   */
  function document(patch: Partial<ReadingListsDocument> = {}): ReadingListsDocument {
    const works: ReadingWorkRef[] = [
      work({ id: 'w0', titleRaw: 'Convenience Store Woman', boundItemIds: ['li7'] }),
      work({ id: 'w1', titleRaw: 'Earthlings' }),
      work({ id: 'w2', titleRaw: 'Kafka on the Shore', boundItemIds: ['li8'] }),
    ];
    const listOf = (
      id: string,
      name: string,
      pairs: [string, ReadingEntryState][],
      extra: Partial<ReadingList> = {},
    ): ReadingList => ({
      id,
      name,
      kind: 'pool',
      createdAt: NOW,
      updatedAt: NOW,
      entries: pairs.map(([workId, state], index) => ({
        id: id + '_e' + index,
        workId,
        order: index,
        addedAt: NOW + index,
        state,
      })),
      imports: [],
      ...extra,
    });
    return {
      schemaVersion: 1,
      revision: 1,
      works,
      lists: [
        listOf('lA', 'Reading now', [['w1', 'wanted'], ['w0', 'reading']]),
        listOf('lB', 'Book club', [['w0', 'owned'], ['w2', 'wanted']]),
        listOf('lC', 'Retired', [['w0', 'finished']], { archivedAt: NOW }),
      ],
      ...patch,
    } as unknown as ReadingListsDocument;
  }

  it('names every list the item is on, with the entry the route scrolls to', () => {
    const rows = readingListsForItem(document(), 'li7');
    expect(rows.map((row) => row.listId)).toEqual(['lA', 'lB', 'lC']);
    expect(rows.map((row) => row.listName)).toEqual(['Reading now', 'Book club', 'Retired']);
    // The ENTRY, not the list top — that is what row 8 promises to scroll to.
    expect(rows.map((row) => row.entryId)).toEqual(['lA_e1', 'lB_e0', 'lC_e0']);
    // Per-list state, because the same book can be `reading` here and `owned` there.
    expect(rows.map((row) => row.state)).toEqual(['reading', 'owned', 'finished']);
    // Flagged, not dropped: the caller decides whether an archive counts.
    expect(rows.map((row) => row.listArchived)).toEqual([false, false, true]);
    expect(rows.every((row) => row.workId === 'w0')).toBe(true);
    expect(rows.every((row) => row.title === 'Convenience Store Woman')).toBe(true);
  });

  it('never leaks a list reached only through another item', () => {
    // `w2` is on `lB` too. Asking about `li7` must not pick `lB`'s OTHER entry.
    const rows = readingListsForItem(document(), 'li7');
    expect(rows.map((row) => row.entryId)).not.toContain('lB_e1');
    // And an item bound to nothing is silence, not the whole document.
    expect(readingListsForItem(document(), 'li-unknown')).toEqual([]);
  });

  it('refuses a blank id against a document the store never normalized', () => {
    // Written against an UNNORMALIZED document on purpose. `normalizeWork`
    // strips `''` out of `boundItemIds` (readingLists.ts:317), so asserting the
    // blank guard on a normalized document tests nothing — it would pass with
    // the guard deleted. Here `w1` claims `''`, and without the guard a reader
    // whose item id has not loaded yet lights up "on 1 list".
    const base = document();
    const unnormalized = {
      ...base,
      works: base.works.map((candidate) =>
        candidate.id === 'w1' ? { ...candidate, boundItemIds: [''] } : candidate,
      ),
    } as unknown as ReadingListsDocument;
    expect(readingListsForItem(unnormalized, '')).toEqual([]);
    // The control on the control: `w1` IS reachable, so the empty result above
    // is the guard firing and not a fixture with nothing in it.
    expect(readingListsForItem(unnormalized, 'li7').map((row) => row.listId)).toEqual([
      'lA',
      'lB',
      'lC',
    ]);
  });

  it('counts BOTH works when two of them claim the same item, in the list order', () => {
    // A repairable state, not an impossible one. `workForItem` takes the first
    // match and would report one list where the user is really on two.
    //
    // `lA_e9` is APPENDED to the array but carries `order: -1`, so the user
    // dragged it to the top. The rows must come out in the user's order, not the
    // array's — the list detail draws it sorted, and a strip that disagrees
    // scrolls to the wrong row of the two.
    const base = document();
    const twoClaims = {
      ...base,
      works: [...base.works, work({ id: 'w1b', titleRaw: 'Earthlings', boundItemIds: ['li7'] })],
      lists: [
        {
          ...base.lists[0],
          entries: [
            ...base.lists[0].entries,
            { id: 'lA_e9', workId: 'w1b', order: -1, addedAt: NOW, state: 'wanted' as const },
          ],
        },
        base.lists[1],
        base.lists[2],
      ],
    } as unknown as ReadingListsDocument;
    const rows = readingListsForItem(twoClaims, 'li7');
    expect(rows.map((row) => row.entryId)).toEqual(['lA_e9', 'lA_e1', 'lB_e0', 'lC_e0']);
    expect(new Set(rows.map((row) => row.workId))).toEqual(new Set(['w0', 'w1b']));
  });
});

describe('smart lists are not entry-list cards', () => {
  /** One ordinary list, one smart, one smart-but-unanswerable, one archived smart. */
  const doc = {
    schemaVersion: 1,
    revision: 1,
    works: [],
    lists: [
      { id: 'l-pool', name: 'Pool', kind: 'pool', createdAt: 1, updatedAt: 1, entries: [], imports: [] },
      {
        id: 'l-smart',
        name: 'Light reading',
        kind: 'smart',
        createdAt: 1,
        updatedAt: 1,
        query: { ownedOnly: true },
        entries: [],
        imports: [],
      },
      // A hand-edited file can hold this; saveSmartReadingList cannot make it.
      { id: 'l-bare', name: 'Bare', kind: 'smart', createdAt: 1, updatedAt: 1, entries: [], imports: [] },
      {
        id: 'l-gone',
        name: 'Retired',
        kind: 'smart',
        createdAt: 1,
        updatedAt: 1,
        archivedAt: 2,
        query: { ownedOnly: true },
        entries: [],
        imports: [],
      },
    ],
  } as unknown as ReadingListsDocument;

  it('summarizeReadingLists leaves every smart list out', () => {
    // Otherwise each would draw "0 of 0 finished" over an empty bar, which is
    // its NORMAL shape rather than a damaged one.
    expect(summarizeReadingLists(doc).map((s) => s.listId)).toEqual(['l-pool']);
  });

  it('savedSmartLists returns the answerable ones only', () => {
    expect(savedSmartLists(doc).map((entry) => entry.listId)).toEqual(['l-smart']);
    expect(savedSmartLists(doc)[0]?.query).toEqual({ ownedOnly: true });
  });
});
