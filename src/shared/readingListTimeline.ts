/**
 * Reading Lists P5, §5.12 — *"Timeline view. Finishes on a calendar, per list.
 * Answers 'what did I read this year' in one screen."*
 *
 * Pure, like `readingListViews`, `readingListProjection` and
 * `readingListSmartLists`. No store, no DOM, no clock: the year and the zone are
 * both arguments, because a calendar that reads the machine's clock and the
 * machine's zone inside itself cannot be tested against a fixture and will
 * disagree with a screenshot taken in another country.
 *
 * ── Why the ENTRIES and not the event log ───────────────────────────────────
 *
 * §5.12's own wording says "straight from the event log", and that is the one
 * line of the plan this deliberately does not follow. The log is CAPPED and
 * COMPACTED (`readingLists.ts`'s `EVENT_LOG_LIMIT`), so a year-in-review built
 * on it silently loses the START of the year — which is precisely the half a
 * year view exists to show, and it would lose it without saying so. Every
 * finish carries `finishedAt` on the entry itself, `normalizeReadingEntry`
 * repairs a `finished` entry with no timestamp back to `owned`, and entries are
 * never compacted. `recentReadingFinishes` made the same call for the same
 * reason and this stays consistent with it.
 *
 * ── The de-duplication rule, and why it is per WORK ─────────────────────────
 *
 * §4's fan-out ticks the same book on EVERY list it is on. Unscoped, a book on
 * three lists would paint three squares and the year total would read three
 * books for one read. So a work counts ONCE, at its EARLIEST finish: the later
 * timestamps are the fan-out, not a second reading. Scoped to one list the
 * question cannot arise, and the rule is a no-op there.
 *
 * ── Zone ────────────────────────────────────────────────────────────────────
 *
 * `offsetMinutes` is minutes to ADD to UTC to reach the user's calendar (so
 * UTC+9 is `540`), which is `-new Date().getTimezoneOffset()` at the call site.
 * A finish at 23:30 local on the 3rd belongs to the 3rd, and computing that with
 * UTC getters over a shifted timestamp is the only way to get one answer on
 * every machine that runs the tests.
 */

import type { ReadingListsDocument } from './readingLists';
import type { ReadingFinishRecord } from './readingListViews';

export interface ReadingTimelineDay {
  /** `YYYY-MM-DD` in the caller's zone. Stable, sortable, and not localized. */
  key: string;
  /** 1–31. */
  day: number;
  finishes: ReadingFinishRecord[];
}

export interface ReadingTimelineMonth {
  /** 1–12. */
  month: number;
  /**
   * EVERY day of the month, in order, empty ones included — a calendar with the
   * blank days removed is a list, and the shape of a reading year is carried by
   * the gaps as much as by the marks.
   */
  days: ReadingTimelineDay[];
  total: number;
}

export interface ReadingTimeline {
  year: number;
  /** Always twelve, in order. */
  months: ReadingTimelineMonth[];
  /** Finishes inside `year`, after de-duplication. */
  total: number;
  /**
   * Every year that has at least one finish, ascending — exactly what a year
   * picker offers, so a surface never renders a chooser with a year that is
   * empty in it or omits one that is not.
   */
  years: number[];
  /** The busiest single day's count. `0` on an empty year. Scales a heat ramp. */
  peak: number;
  /** Finishes outside `year`, so a surface can say the year is not everything. */
  elsewhere: number;
}

export interface ReadingTimelineOptions {
  /** One list, or every list when absent. */
  listId?: string | null;
  /** Minutes to ADD to UTC to reach the user's calendar. UTC+9 is `540`. */
  offsetMinutes?: number;
  /**
   * Archived lists are OUT by default. An archive is the user saying "not part
   * of my shelf any more"; a year view is a shelf. A caller that wants the true
   * lifetime count opts in, rather than every caller having to opt out.
   */
  includeArchived?: boolean;
}

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

function daysInMonth(year: number, month: number): number {
  if (month !== 2) return DAYS_IN_MONTH[month - 1];
  // The full Gregorian rule, not `year % 4`: 1900 was not a leap year and 2000
  // was, and a calendar that grows a 29th of February in the wrong year puts
  // every later day of that month on the wrong weekday.
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
}

function pad2(value: number): string {
  return value < 10 ? `0${value}` : String(value);
}

interface LocalDate {
  year: number;
  month: number;
  day: number;
}

function localDate(at: number, offsetMinutes: number): LocalDate {
  const shifted = new Date(at + offsetMinutes * 60_000);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
  };
}

/**
 * Every finish in the document, de-duplicated per work, newest first.
 *
 * Exported because the year picker and the timeline itself both need the whole
 * set and computing it twice would let them disagree about which years exist.
 */
export function allReadingFinishes(
  document: ReadingListsDocument,
  options: Pick<ReadingTimelineOptions, 'listId' | 'includeArchived'> = {},
): ReadingFinishRecord[] {
  const { listId = null, includeArchived = false } = options;
  const byId = new Map(document.works.map((work) => [work.id, work]));
  /** Work id → the record with the earliest `finishedAt` seen so far. */
  const earliest = new Map<string, ReadingFinishRecord>();
  for (const list of document.lists) {
    if (listId != null && list.id !== listId) continue;
    if (!includeArchived && list.archivedAt) continue;
    for (const entry of list.entries) {
      if (entry.state !== 'finished' || entry.finishedAt === undefined) continue;
      const work = byId.get(entry.workId);
      const record: ReadingFinishRecord = {
        entryId: entry.id,
        listId: list.id,
        listName: list.name,
        title: work?.titleRaw.trim() || entry.sourceRef?.rawLine.trim() || '',
        itemId: work?.boundItemIds[0] ?? null,
        finishedAt: entry.finishedAt,
      };
      const held = earliest.get(entry.workId);
      // Ties broken on entry id so two lists ticked in the same millisecond do
      // not swap the surviving record between runs.
      if (
        !held ||
        record.finishedAt < held.finishedAt ||
        (record.finishedAt === held.finishedAt && record.entryId < held.entryId)
      ) {
        earliest.set(entry.workId, record);
      }
    }
  }
  return [...earliest.values()].sort(
    (a, b) => b.finishedAt - a.finishedAt || a.entryId.localeCompare(b.entryId),
  );
}

export function readingTimeline(
  document: ReadingListsDocument,
  year: number,
  options: ReadingTimelineOptions = {},
): ReadingTimeline {
  const { offsetMinutes = 0 } = options;
  const finishes = allReadingFinishes(document, options);

  const months: ReadingTimelineMonth[] = [];
  for (let month = 1; month <= 12; month += 1) {
    const days: ReadingTimelineDay[] = [];
    for (let day = 1; day <= daysInMonth(year, month); day += 1) {
      days.push({ key: `${year}-${pad2(month)}-${pad2(day)}`, day, finishes: [] });
    }
    months.push({ month, days, total: 0 });
  }

  const years = new Set<number>();
  let total = 0;
  let elsewhere = 0;
  for (const record of finishes) {
    const at = localDate(record.finishedAt, offsetMinutes);
    years.add(at.year);
    if (at.year !== year) {
      elsewhere += 1;
      continue;
    }
    const bucket = months[at.month - 1];
    // A day out of range is unreachable from a real Date, but this is a public
    // function over a document a caller may have hand-built, and a crash here
    // would take the whole view down for one bad row.
    const cell = bucket?.days[at.day - 1];
    if (!cell) continue;
    cell.finishes.push(record);
    bucket.total += 1;
    total += 1;
  }

  let peak = 0;
  for (const month of months) {
    for (const cell of month.days) {
      // Oldest first WITHIN a day: a day's own column reads as the order the
      // books were finished in, while `allReadingFinishes` stays newest-first
      // for the "what did I just finish" callers.
      cell.finishes.sort((a, b) => a.finishedAt - b.finishedAt || a.entryId.localeCompare(b.entryId));
      if (cell.finishes.length > peak) peak = cell.finishes.length;
    }
  }

  return {
    year,
    months,
    total,
    years: [...years].sort((a, b) => a - b),
    peak,
    elsewhere,
  };
}
