// @vitest-environment node
/**
 * P5 §5.4 — the projected finish date.
 *
 * The assertions that matter are the ones about what the function REFUSES to
 * say: a rate of zero is not a date, a two-finish sample is flagged rather than
 * printed plain, and a book abandoned on purpose is not work remaining.
 */

import { describe, expect, it } from 'vitest';
import {
  PROJECTION_MIN_FINISHES,
  PROJECTION_WINDOW_DAYS,
  projectReadingListFinish,
} from '../readingListProjection';
import {
  addReadingListEntry,
  createReadingList,
  createReadingListsMutationContext,
  sealReadingListsDocument,
  setReadingEntryState,
} from '../readingListMutations';
import {
  emptyReadingListsDocument,
  type ReadingEntryState,
  type ReadingListsDocument,
} from '../readingLists';

const NOW = 1_770_000_000_000;
const DAY = 86_400_000;

/** A list of `size` books; `finishes` names how many days ago each was finished. */
function shelf(
  size: number,
  finishes: number[],
  extra: { state?: ReadingEntryState; count?: number } = {},
): { document: ReadingListsDocument; listId: string } {
  let clock = NOW - 500 * DAY;
  const next = () => createReadingListsMutationContext((clock += 1));
  let document = emptyReadingListsDocument();
  const created = createReadingList(document, { name: 'Shelf' }, next());
  document = created.document;
  const listId = created.listId;

  const entryIds: string[] = [];
  for (let i = 0; i < size; i += 1) {
    const added = addReadingListEntry(document, listId, { title: `Book ${i}` }, next());
    document = added.document;
    if (!added.entryId) throw new Error('add refused');
    entryIds.push(added.entryId);
  }
  finishes.forEach((daysAgo, i) => {
    clock = NOW - daysAgo * DAY;
    document = setReadingEntryState(document, listId, entryIds[i], 'finished', next()).document;
  });
  // Optionally put the LAST few into some other state (abandoned / skipped).
  if (extra.state && extra.count) {
    for (let i = 0; i < extra.count; i += 1) {
      const id = entryIds[entryIds.length - 1 - i];
      clock = NOW - DAY;
      document = setReadingEntryState(document, listId, id, extra.state, next()).document;
    }
  }
  return { document: sealReadingListsDocument(document), listId };
}

const daysOut = (at: number | null) => (at === null ? null : Math.round((at - NOW) / DAY));

describe('projectReadingListFinish', () => {
  it('projects off the observed rate: 6 books in 30 days, 10 left → 50 days', () => {
    const { document, listId } = shelf(16, [1, 5, 9, 14, 20, 28]);
    const p = projectReadingListFinish(document, listId, NOW);
    expect(p).not.toBeNull();
    expect(p!.observed).toBe(6);
    expect(p!.remaining).toBe(10);
    expect(p!.perDay).toBeCloseTo(0.2, 10);
    expect(daysOut(p!.finishesAt)).toBe(50);
    expect(p!.provisional).toBe(false);
  });

  it('will not turn no reading into a date', () => {
    // Nothing finished at all: a rate of zero projects to infinity, and "never"
    // is not a date the surface can print.
    const { document, listId } = shelf(4, []);
    const p = projectReadingListFinish(document, listId, NOW);
    expect(p!.observed).toBe(0);
    expect(p!.perDay).toBeNull();
    expect(p!.finishesAt).toBeNull();
    expect(p!.provisional).toBe(true);
  });

  it('ignores finishes outside the window, both sides of the boundary', () => {
    const { document, listId } = shelf(10, [
      PROJECTION_WINDOW_DAYS - 1,
      PROJECTION_WINDOW_DAYS + 1,
      PROJECTION_WINDOW_DAYS + 90,
    ]);
    // Only the first is inside; the reader who finished three books LAST year is
    // not reading three books a month now.
    expect(projectReadingListFinish(document, listId, NOW)!.observed).toBe(1);
  });

  it('flags a thin sample instead of printing a confident date off it', () => {
    const { document, listId } = shelf(10, [2, 4]);
    const p = projectReadingListFinish(document, listId, NOW);
    expect(p!.observed).toBe(2);
    expect(p!.observed).toBeLessThan(PROJECTION_MIN_FINISHES);
    // The date is still given — flagged is more useful than hidden — but the
    // flag travels with it so the surface cannot show one without the other.
    expect(p!.finishesAt).not.toBeNull();
    expect(p!.provisional).toBe(true);

    const solid = shelf(10, [2, 4, 6]);
    expect(projectReadingListFinish(solid.document, solid.listId, NOW)!.provisional).toBe(false);
  });

  it('a book put down on purpose is not work remaining', () => {
    // §5.9 makes `abandoned` first-class so it stays out of the pace maths; if
    // it counted, every deliberate abandonment would push the date further out.
    const plain = shelf(10, [2, 4, 6]);
    const withAbandoned = shelf(10, [2, 4, 6], { state: 'abandoned', count: 3 });
    expect(projectReadingListFinish(plain.document, plain.listId, NOW)!.remaining).toBe(7);
    expect(
      projectReadingListFinish(withAbandoned.document, withAbandoned.listId, NOW)!.remaining,
    ).toBe(4);
  });

  it('a finished list answers NOW, not null', () => {
    // Otherwise a complete list and a list with no reading behind it look the
    // same, and both read as "we cannot say".
    const { document, listId } = shelf(3, [1, 2, 3]);
    const p = projectReadingListFinish(document, listId, NOW);
    expect(p!.remaining).toBe(0);
    expect(p!.finishesAt).toBe(NOW);
  });

  it('counts the RATE across every list, and each work only once', () => {
    // Two lists, one book each, and the same work finished on both — the shape
    // §4's fan-out produces. It is one book read, not two.
    const base = shelf(4, [2, 4, 6]);
    const doubled: ReadingListsDocument = {
      ...base.document,
      lists: [
        ...base.document.lists,
        {
          id: 'l-two',
          name: 'Book club',
          kind: 'pool',
          createdAt: 1,
          updatedAt: 1,
          // Same workIds as the three finished entries on the first list.
          entries: base.document.lists[0].entries
            .filter((entry) => entry.state === 'finished')
            .map((entry, i) => ({
              id: `dup-${i}`,
              workId: entry.workId,
              order: i,
              addedAt: 1,
              state: 'finished' as const,
              finishedAt: entry.finishedAt,
            })),
          imports: [],
        },
      ],
    };
    expect(projectReadingListFinish(doubled, base.listId, NOW)!.observed).toBe(3);
    // ... and a list created after the reading happened still gets a rate,
    // because the rate is not scoped to the list being projected.
    const fresh = projectReadingListFinish(doubled, 'l-two', NOW);
    expect(fresh!.observed).toBe(3);
  });

  it('an un-finished entry that kept its date does not count as reading', () => {
    /*
     * `setReadingEntryState` deletes `finishedAt` when a finish is undone
     * (`readingListMutations.ts:1004`), so this shape cannot come from the
     * product — but a hand-edited file or a half-applied migration can hold it,
     * and reading `finishedAt` without checking `state` would silently count a
     * book the user explicitly un-finished. Caught by a mutant that stayed
     * GREEN: nothing else here distinguished the two fields.
     */
    const { document, listId } = shelf(6, [1, 3]);
    const stale: ReadingListsDocument = {
      ...document,
      lists: document.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry, i) =>
          i === 4 ? { ...entry, state: 'abandoned' as const, finishedAt: NOW - 2 * DAY } : entry,
        ),
      })),
    };
    expect(projectReadingListFinish(stale, listId, NOW)!.observed).toBe(2);
  });

  it('answers null for a list that is not there, rather than a zero projection', () => {
    const { document } = shelf(3, [1]);
    expect(projectReadingListFinish(document, 'nope', NOW)).toBeNull();
  });

  it('a caller-chosen window is honoured and cannot be zero', () => {
    const { document, listId } = shelf(10, [1, 2, 3, 40]);
    expect(projectReadingListFinish(document, listId, NOW, 7)!.observed).toBe(3);
    expect(projectReadingListFinish(document, listId, NOW, 60)!.observed).toBe(4);
    // A window of 0 would divide by zero and produce Infinity books per day.
    const clamped = projectReadingListFinish(document, listId, NOW, 0);
    expect(clamped!.windowDays).toBe(1);
    expect(Number.isFinite(clamped!.perDay!)).toBe(true);
  });
});
