/**
 * Reading Lists P2(c) — late binding, the thing that makes a list feel alive.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §3.1: a friend texts you ten books today,
 * you download the fourth one three weeks from now, and the list ticks itself
 * without you ever opening it. So every library import runs the new items
 * against every work nothing is bound to yet.
 *
 * Three constraints shaped this, all from the plan or from CLAUDE.md:
 *
 *   · **One hook, not one per importer.** §3.1 says to hang this where items are
 *     created, in one place. `library.ts` has six import paths and nineteen
 *     `writeDb` calls, so the seam is `onLibraryItemsAdded` on the write itself
 *     — a future importer is covered by construction rather than by remembering.
 *   · **Off the main event loop's critical section.** The subscriber defers with
 *     `setImmediate`, so an EPUB import returns before any matching starts. The
 *     work is small (a JSON read and a scan over unbound works) but it is on the
 *     path a user is waiting on, and CLAUDE.md is explicit about that path.
 *   · **A refused write is re-applied, never retried blindly.** The store is
 *     compare-and-swap; between our read and our write a renderer may have
 *     committed. So the intent is recomputed against the document main handed
 *     back, exactly as `readingListsClient.ts` does, rather than resubmitting a
 *     document built on a stale revision.
 *
 * It binds and it suggests. It never un-binds and never marks anything finished:
 * a file disappearing is not evidence the user does not own the book, and
 * finishing is §4's job.
 */

import type { LibraryItem } from '../shared/types';
import {
  BIND_ACCEPT,
  matchReadingWork,
  type ReadingMatchCandidate,
} from '../shared/readingListMatching';
import {
  bindReadingWork,
  createReadingListsMutationContext,
  suggestReadingWorkBinding,
  type PendingReadingListEvent,
  type ReadingListsMutationContext,
} from '../shared/readingListMutations';
import type { ReadingListsDocument } from '../shared/readingLists';
import type { ReadingReminderBinding } from '../shared/readingListReminders';
import { getReadingListsStore, type ReadingListsStore } from './readingListsStore';
import { broadcastReadingLists } from './readingListsIpc';

/** How many times a CAS refusal is re-applied before the pass gives up. */
const MAX_WRITE_ATTEMPTS = 3;

const VOLUME_PATTERNS: readonly RegExp[] = [
  /第?\s*(\d{1,3})\s*巻/,
  /\bvol(?:ume)?\.?\s*(\d{1,3})\b/i,
  // Bare trailing number, and only one or two digits of it. `Fahrenheit 451`
  // parsed as volume 451 on the first run of this suite; a three-digit tail is
  // far more often part of a title than a volume, and volumes 1-99 cover the
  // shelves this feature is about.
  /\s(\d{1,2})\s*$/,
];

/**
 * The volume a filename or title claims, when it claims one.
 *
 * Deliberately conservative: a number that is not in a volume-shaped position
 * is left alone, because a wrong volume is a *penalty* in the matcher and would
 * suppress a correct bind. `1984` does not parse as volume 1984 — the bare-number
 * branch requires whitespace before it and the end of the string after it, so a
 * title that is only a number never matches.
 */
export function volumeFromTitle(title: string): number | undefined {
  for (const pattern of VOLUME_PATTERNS) {
    const found = pattern.exec(title);
    if (!found) continue;
    const value = Number.parseInt(found[1], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return undefined;
}

/** A library item as the matcher reads it. Nothing here touches the disk. */
export function libraryItemCandidate(item: LibraryItem): ReadingMatchCandidate {
  const altTitles = [
    item.readingSource?.workTitle,
    item.readingSource?.workTitleNative,
    // The filename often carries the original title when the display title has
    // been renamed, and it is the only place a romaji spelling usually survives.
    item.sourcePath?.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, ''),
  ].filter((title): title is string => !!title && title !== item.title);

  const candidate: ReadingMatchCandidate = { id: item.id, title: item.title };
  if (altTitles.length) candidate.altTitles = altTitles;
  const volume = volumeFromTitle(item.title);
  if (volume !== undefined) candidate.volume = volume;
  return candidate;
}

export interface LateBindingOutcome {
  bound: number;
  suggested: number;
  /**
   * The works that actually bound, named rather than counted.
   *
   * §11.3's "new binding" reminder is the one that earns an interrupt, and it
   * cannot be built from a count: it has to say WHICH book turned up and lead to
   * the entry. Collected here because this is the only place that knows both the
   * work and the item it matched.
   */
  boundWorks: ReadingReminderBinding[];
}

/**
 * The pure core: every unbound work in `document` against `candidates`.
 *
 * Works that already hold a binding are skipped outright — re-scoring them would
 * cost nothing but could only produce a second, weaker binding for the same
 * book, and §3.1's promise is about the `wanted` half of a list.
 */
export function applyLateBinding(
  document: ReadingListsDocument,
  candidates: readonly ReadingMatchCandidate[],
  context: ReadingListsMutationContext,
): { document: ReadingListsDocument; events: PendingReadingListEvent[] } & LateBindingOutcome {
  const events: PendingReadingListEvent[] = [];
  const boundWorks: ReadingReminderBinding[] = [];
  let next = document;
  let bound = 0;
  let suggested = 0;
  if (!candidates.length) return { document: next, events, bound, suggested, boundWorks };

  // Snapshot the ids first: `next` is rebuilt each iteration and a work bound in
  // an earlier pass must not be re-read from the newer document as unbound.
  const unboundIds = document.works
    .filter((work) => !work.boundItemIds.length)
    .map((work) => work.id);

  for (const workId of unboundIds) {
    const work = next.works.find((entry) => entry.id === workId);
    if (!work) continue;
    const outcome = matchReadingWork(work, candidates);
    if (!outcome.best) continue;

    if (outcome.disposition === 'accept') {
      const result = bindReadingWork(next, workId, outcome.best.candidateId, outcome.best.score, context);
      if (!result.bound) continue;
      next = result.document;
      events.push(...result.events);
      bound += 1;
      const placed = firstEntryForWork(next, workId);
      if (placed) {
        boundWorks.push({
          workId,
          listId: placed.listId,
          entryId: placed.entryId,
          itemId: outcome.best.candidateId,
          title: work.titleRaw,
        });
      }
      continue;
    }
    if (outcome.disposition !== 'suggest') continue;

    const result = suggestReadingWorkBinding(
      next,
      workId,
      {
        itemId: outcome.best.candidateId,
        confidence: outcome.best.score,
        signals: {
          title: Number(outcome.best.signals.title.toFixed(3)),
          titleVia: outcome.best.signals.titleVia,
          author: outcome.best.signals.author,
          volume: outcome.best.signals.volume,
          // A tie above accept is why this is a suggestion rather than a bind;
          // the surface needs to be able to say so.
          ambiguous: outcome.best.score >= BIND_ACCEPT,
        },
      },
      context,
    );
    if (!result.suggested) continue;
    next = result.document;
    events.push(...result.events);
    suggested += 1;
  }

  return { document: next, events, bound, suggested, boundWorks };
}

/**
 * Where a work sits, for a reminder that has to lead somewhere.
 *
 * The first list that holds it, in document order. A work on several lists gets
 * ONE reminder — §11.3 caps reminders at one a day, so fanning a single arrival
 * out into three would spend three days saying the same thing.
 */
function firstEntryForWork(
  document: ReadingListsDocument,
  workId: string,
): { listId: string; entryId: string } | null {
  for (const list of document.lists) {
    for (const entry of list.entries) {
      if (entry.workId === workId) return { listId: list.id, entryId: entry.id };
    }
  }
  return null;
}

/**
 * One pass over the store, with the CAS re-apply.
 *
 * Returns what it did rather than logging it: the caller is a fire-and-forget
 * subscriber, but the test — and P4's "N books arrived" toast — need the numbers.
 */
export function bindLibraryItemsIntoReadingLists(
  items: readonly LibraryItem[],
  store: ReadingListsStore = getReadingListsStore(),
  now: () => number = Date.now,
): LateBindingOutcome & { applied: boolean } {
  const candidates = items.map(libraryItemCandidate).filter((candidate) => !!candidate.title.trim());
  if (!candidates.length) return { bound: 0, suggested: 0, boundWorks: [], applied: false };

  for (let attempt = 0; attempt < MAX_WRITE_ATTEMPTS; attempt++) {
    const snapshot = store.read();
    const context = createReadingListsMutationContext(now());
    const result = applyLateBinding(snapshot.document, candidates, context);
    // Identity means the matcher found nothing to say. Writing anyway would burn
    // a revision and broadcast a no-change to every window.
    if (result.document === snapshot.document) {
      return { bound: 0, suggested: 0, boundWorks: [], applied: false };
    }
    const write = store.write(snapshot.document.revision, result.document, result.events);
    if (write.applied) {
      // Main wrote this with no renderer to return it to, so every window is a
      // recipient (`readingListsIpc.ts`'s own note on `broadcastReadingLists`).
      broadcastReadingLists(write.snapshot);
      return {
        bound: result.bound,
        suggested: result.suggested,
        boundWorks: result.boundWorks,
        applied: true,
      };
    }
  }
  // Three refusals in a row means a renderer is writing continuously. Dropping
  // the pass is safe: the next import re-runs it, and nothing was half-applied.
  return { bound: 0, suggested: 0, boundWorks: [], applied: false };
}

/**
 * The `library.ts` subscriber. Deferred, and it swallows its own failures —
 * reading lists must never be the reason an EPUB import reports an error.
 */
export function registerReadingListsLateBinding(
  subscribe: (listener: (items: LibraryItem[]) => void) => void,
  onBound?: (bindings: readonly ReadingReminderBinding[]) => void,
): void {
  subscribe((items) => {
    setImmediate(() => {
      try {
        const outcome = bindLibraryItemsIntoReadingLists(items);
        if (outcome.boundWorks.length) onBound?.(outcome.boundWorks);
      } catch {
        // A missing or unreadable reading-lists document is not an import fault.
      }
    });
  });
}
