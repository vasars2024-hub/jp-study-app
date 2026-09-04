/**
 * P4's view model, §6. The assertions that matter here are the ones about the
 * DENOMINATOR and about stability — a progress bar that counts the wrong things
 * is wrong quietly, and a row order that is not total reshuffles under the user.
 */

import { describe, expect, it } from 'vitest';
import type { ReadingEntryState, ReadingList, ReadingWorkRef } from '../readingLists';
import {
  hasLiveSuggestion,
  readingListRows,
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
