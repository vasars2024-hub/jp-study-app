/**
 * Reading Lists P5, §5.4 — *"at your rate over the last 30 days, this list
 * finishes 2026-11-14."*
 *
 * Pure, like `readingListViews`, `readingListExport` and
 * `readingListSmartLists`. It takes the document and an explicit `now`; it reads
 * no store, no DOM and no clock, because a projection that reads `Date.now()`
 * inside itself cannot be tested against a fixture.
 *
 * ── Why the rate is counted in BOOKS FINISHED, and from where ────────────────
 *
 * §5.4 asks for a finish DATE for a LIST, and a list is measured in books. Four
 * candidate sources exist in this tree and only one can answer that:
 *
 *   · `ReadingListEntry.finishedAt` — main-persisted in
 *     `userData/reading-lists.json`, book-scoped, dated, and GUARANTEED present:
 *     `normalizeReadingEntry` repairs a `finished` entry with no timestamp back
 *     to `owned` (`readingLists.ts:435`), so a finish without a date cannot
 *     reach this function. **This is the source.** Zero new fields.
 *   · `renderer/stats.ts`'s `days` map — a richer chars/seconds series, and
 *     REJECTED on two counts. It is localStorage (`jp-study-stats-v1-<lang>`)
 *     with no restore point, which is the trap the plan opens with; and its
 *     only exported reader truncates to the last 14 days, so a 30-day window
 *     would need a new accessor for data that a profile reset eats anyway.
 *   · `userData/immersion/metrics.json` — durable and unbounded, but it counts
 *     web pages. A book read in `NovelReader` contributes nothing to it, so a
 *     book list projected from it would slow down as the user read more books.
 *   · `readingGardenProgress` — a lifetime page scalar with no day axis.
 *
 * ── Why this is a NEW function rather than more of `readingChallengePace` ────
 *
 * They answer different questions from different inputs and must not merge.
 * `readingChallengePace` measures the list against a target date the USER SET,
 * on a straight line from `createdAt`, and returns `null` without one — it reads
 * no history at all. This measures the list against the rate the user ACTUALLY
 * ACHIEVED, and needs no target. Widening one into both would make a challenge
 * list and a pool list disagree about what "pace" means, and the challenge
 * widget would start moving when a book on an unrelated list was finished.
 */

import type { ReadingListsDocument } from './readingLists';
import { summarizeReadingList } from './readingListViews';

const DAY_MS = 86_400_000;

/** §5.4's "the last 30 days". */
export const PROJECTION_WINDOW_DAYS = 30;

/**
 * Below this many observed finishes the projection is flagged, not hidden.
 *
 * Three is not a statistical claim; it is the point below which one unusual
 * week moves the answer by months. §5.4's own trap is that a confident date
 * printed off two data points reads exactly like one printed off forty, so the
 * flag travels with the number and the surface is required to say it.
 */
export const PROJECTION_MIN_FINISHES = 3;

export interface ReadingListProjection {
  /** Books still to finish on this list. */
  remaining: number;
  /** Finishes observed in the window, across every list. */
  observed: number;
  windowDays: number;
  /** Books per day. `null` when nothing was observed — never 0, see below. */
  perDay: number | null;
  /**
   * Epoch ms of the projected finish, or `null` when there is no honest answer:
   * nothing observed, or a rate of zero. A rate of zero projects to infinity,
   * and "never" is not a date — the surface says "not enough reading yet".
   */
  finishesAt: number | null;
  /** True while `observed` is under `PROJECTION_MIN_FINISHES`. */
  provisional: boolean;
}

/**
 * The rate is measured across EVERY list, not just the one being projected.
 *
 * A book finished on another list is still an evening spent reading, so scoping
 * the rate to one list would make a user with four lists look four times slower
 * on each — and a list created yesterday would project to never, because no
 * finish had happened on it yet.
 *
 * De-duplicated per WORK: §4's fan-out ticks the same book on every list it is
 * on, so counting entries would multiply a reader's apparent rate by how tidily
 * they file. `recentReadingFinishes` de-duplicates by title for display; this
 * keys on `workId`, which is the identity that survives two lists holding
 * differently-typed copies of one title.
 */
function finishesInWindow(document: ReadingListsDocument, from: number, to: number): number {
  const seen = new Set<string>();
  for (const list of document.lists) {
    for (const entry of list.entries) {
      if (entry.state !== 'finished' || entry.finishedAt === undefined) continue;
      if (entry.finishedAt < from || entry.finishedAt > to) continue;
      seen.add(entry.workId);
    }
  }
  return seen.size;
}

export function projectReadingListFinish(
  document: ReadingListsDocument,
  listId: string,
  now: number,
  windowDays: number = PROJECTION_WINDOW_DAYS,
): ReadingListProjection | null {
  const list = document.lists.find((entry) => entry.id === listId);
  if (!list) return null;

  const days = Math.max(1, Math.trunc(windowDays));
  const summary = summarizeReadingList(list, document.works);
  // `counted` already excludes `abandoned` and `skipped` (§5.9): a book put down
  // on purpose is not work remaining, and counting it would push every date out.
  const remaining = Math.max(0, summary.counted - summary.finished);
  const observed = finishesInWindow(document, now - days * DAY_MS, now);
  const perDay = observed > 0 ? observed / days : null;

  return {
    remaining,
    observed,
    windowDays: days,
    perDay,
    // A finished list projects to NOW rather than to null: "already done" is an
    // answer, and returning null there would make a complete list and a list
    // with no reading behind it look identical.
    finishesAt: remaining === 0 ? now : perDay ? now + Math.ceil(remaining / perDay) * DAY_MS : null,
    provisional: observed < PROJECTION_MIN_FINISHES,
  };
}
