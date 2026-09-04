/**
 * P5 §5.12's timeline. The assertions that matter are the ones about the
 * CALENDAR and about the COUNT: a heat map with the wrong number of days in
 * February puts every later mark on the wrong weekday, and a fan-out counted
 * three times reads as three books read.
 */

import { describe, expect, it } from 'vitest';
import type {
  ReadingEntryState,
  ReadingList,
  ReadingListsDocument,
  ReadingWorkRef,
} from '../readingLists';
import { allReadingFinishes, readingTimeline } from '../readingListTimeline';

/** 2026-03-04T12:00:00Z — mid-day UTC, so a ±9h zone stays on the same date. */
const MAR_4 = Date.UTC(2026, 2, 4, 12, 0, 0);
const DAY = 86_400_000;

function work(id: string, titleRaw: string): ReadingWorkRef {
  return { id, titleRaw, boundItemIds: [], bindConfidence: 0 };
}

function entry(
  id: string,
  workId: string,
  state: ReadingEntryState,
  finishedAt?: number,
): ReadingList['entries'][number] {
  return { id, workId, order: 0, addedAt: 1, state, ...(finishedAt ? { finishedAt } : {}) };
}

function list(id: string, entries: ReadingList['entries'], patch: Partial<ReadingList> = {}): ReadingList {
  return {
    id,
    name: `List ${id}`,
    kind: 'pool',
    createdAt: 1,
    updatedAt: 1,
    entries,
    imports: [],
    ...patch,
  };
}

function doc(lists: ReadingList[], works: ReadingWorkRef[]): ReadingListsDocument {
  return { schemaVersion: 1, revision: 1, works, lists };
}

function cell(timeline: ReturnType<typeof readingTimeline>, month: number, day: number) {
  return timeline.months[month - 1].days[day - 1];
}

describe('readingTimeline — the calendar itself', () => {
  const empty = doc([], []);

  it('is twelve months of real days, every day present', () => {
    const t = readingTimeline(empty, 2026);
    expect(t.months.map((m) => m.month)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(t.months.map((m) => m.days.length)).toEqual([31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]);
    // Not filtered to the days that have something: the gaps ARE the shape of
    // the year, and a calendar with the blanks removed is a list.
    expect(cell(t, 6, 15).key).toBe('2026-06-15');
    expect(cell(t, 6, 15).finishes).toEqual([]);
  });

  it('uses the full Gregorian leap rule, not year % 4', () => {
    expect(readingTimeline(empty, 2024).months[1].days.length).toBe(29);
    expect(readingTimeline(empty, 2026).months[1].days.length).toBe(28);
    // The two the naive rule gets wrong, in both directions.
    expect(readingTimeline(empty, 1900).months[1].days.length).toBe(28);
    expect(readingTimeline(empty, 2000).months[1].days.length).toBe(29);
  });

  it('is empty rather than absent when nothing was finished', () => {
    const t = readingTimeline(empty, 2026);
    expect([t.total, t.peak, t.elsewhere, t.years.length]).toEqual([0, 0, 0, 0]);
  });
});

describe('readingTimeline — placing a finish', () => {
  const base = doc(
    [list('l1', [entry('e1', 'w1', 'finished', MAR_4), entry('e2', 'w2', 'reading')])],
    [work('w1', 'Kino'), work('w2', 'Convenience Store')],
  );

  it('lands on the day it was finished and counts once', () => {
    const t = readingTimeline(base, 2026);
    expect(cell(t, 3, 4).finishes.map((f) => f.title)).toEqual(['Kino']);
    expect([t.total, t.peak, t.months[2].total]).toEqual([1, 1, 1]);
    // The control: a `reading` entry is not a finish, whatever else is true of it.
    expect(t.months.reduce((n, m) => n + m.total, 0)).toBe(1);
  });

  it('follows the zone — 23:30 local on the 3rd is the 3rd, not the 4th', () => {
    // 2026-03-03T14:30Z is 23:30 on the 3rd in UTC+9 and 09:30 on the 3rd in
    // UTC-5, so the two zones agree here; the falsification is the hour that
    // does NOT: 2026-03-03T20:00Z is the 4th in Tokyo and still the 3rd in NY.
    const at = Date.UTC(2026, 2, 3, 20, 0, 0);
    const d = doc([list('l1', [entry('e1', 'w1', 'finished', at)])], [work('w1', 'Kino')]);
    expect(cell(readingTimeline(d, 2026, { offsetMinutes: 540 }), 3, 4).finishes.length).toBe(1);
    expect(cell(readingTimeline(d, 2026, { offsetMinutes: 540 }), 3, 3).finishes.length).toBe(0);
    expect(cell(readingTimeline(d, 2026, { offsetMinutes: -300 }), 3, 3).finishes.length).toBe(1);
    expect(cell(readingTimeline(d, 2026, { offsetMinutes: -300 }), 3, 4).finishes.length).toBe(0);
  });

  it('reports the years that exist and what fell outside the one asked for', () => {
    const d = doc(
      [
        list('l1', [
          entry('e1', 'w1', 'finished', MAR_4),
          entry('e2', 'w2', 'finished', MAR_4 - 400 * DAY),
          entry('e3', 'w3', 'finished', MAR_4 + 400 * DAY),
        ]),
      ],
      [work('w1', 'A'), work('w2', 'B'), work('w3', 'C')],
    );
    const t = readingTimeline(d, 2026);
    expect(t.total).toBe(1);
    // Not silently dropped: a year view that shows 1 of 3 and says so is honest,
    // one that shows 1 and stops is not.
    expect(t.elsewhere).toBe(2);
    expect(t.years).toEqual([2025, 2026, 2027]);
  });

  it('orders a busy day oldest first and reports the peak', () => {
    const d = doc(
      [
        list('l1', [
          entry('e1', 'w1', 'finished', MAR_4 + 3_600_000),
          entry('e2', 'w2', 'finished', MAR_4),
          entry('e3', 'w3', 'finished', MAR_4 + 7_200_000),
          entry('e4', 'w4', 'finished', MAR_4 + DAY),
        ]),
      ],
      [work('w1', 'B'), work('w2', 'A'), work('w3', 'C'), work('w4', 'D')],
    );
    const t = readingTimeline(d, 2026);
    expect(cell(t, 3, 4).finishes.map((f) => f.title)).toEqual(['A', 'B', 'C']);
    expect(t.peak).toBe(3);
    expect(t.total).toBe(4);
  });
});

describe('readingTimeline — one book, many lists', () => {
  const fannedOut = doc(
    [
      list('l1', [entry('e1', 'w1', 'finished', MAR_4 + 1000)]),
      list('l2', [entry('e2', 'w1', 'finished', MAR_4)]),
      list('l3', [entry('e3', 'w1', 'finished', MAR_4 + 2000)]),
    ],
    [work('w1', 'Kino')],
  );

  it('counts §4 fan-out once, at the earliest tick', () => {
    const t = readingTimeline(fannedOut, 2026);
    expect(t.total).toBe(1);
    // The earliest, so the day shown is when the book was actually finished
    // rather than when the last list caught up.
    expect(cell(t, 3, 4).finishes.map((f) => f.entryId)).toEqual(['e2']);
  });

  it('is unaffected by the rule when scoped to one list', () => {
    const t = readingTimeline(fannedOut, 2026, { listId: 'l3' });
    expect(t.total).toBe(1);
    expect(cell(t, 3, 4).finishes.map((f) => f.entryId)).toEqual(['e3']);
    // And a list with nothing in it answers with an empty year, not with
    // everyone else's finishes.
    expect(readingTimeline(fannedOut, 2026, { listId: 'nope' }).total).toBe(0);
  });
});

describe('allReadingFinishes — archived lists', () => {
  const withArchive = doc(
    [
      list('l1', [entry('e1', 'w1', 'finished', MAR_4)]),
      list('l2', [entry('e2', 'w2', 'finished', MAR_4)], { archivedAt: 2 }),
    ],
    [work('w1', 'Kept'), work('w2', 'Archived')],
  );

  it('leaves an archived list out by default and includes it on request', () => {
    expect(allReadingFinishes(withArchive).map((f) => f.title)).toEqual(['Kept']);
    expect(allReadingFinishes(withArchive, { includeArchived: true }).map((f) => f.title).sort()).toEqual(
      ['Archived', 'Kept'],
    );
    expect(readingTimeline(withArchive, 2026).total).toBe(1);
    expect(readingTimeline(withArchive, 2026, { includeArchived: true }).total).toBe(2);
  });

  it('is newest first, which is the opposite of a day column', () => {
    const d = doc(
      [list('l1', [entry('e1', 'w1', 'finished', MAR_4), entry('e2', 'w2', 'finished', MAR_4 + DAY)])],
      [work('w1', 'Older'), work('w2', 'Newer')],
    );
    expect(allReadingFinishes(d).map((f) => f.title)).toEqual(['Newer', 'Older']);
  });

  it('never invents a finish from a finished entry with no date', () => {
    // `normalizeReadingEntry` repairs this shape, but this is a public function
    // over a document a caller may have hand-built.
    const d = doc([list('l1', [entry('e1', 'w1', 'finished')])], [work('w1', 'Kino')]);
    expect(allReadingFinishes(d)).toEqual([]);
    expect(readingTimeline(d, 2026).total).toBe(0);
  });
});
