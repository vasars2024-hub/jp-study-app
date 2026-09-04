/**
 * §4.3 / §4.4 — the completion detector's impure half.
 *
 * `library:setProgress` calls this with the save it is about to persist and the
 * one already on the item. When the pure detector in
 * `shared/readingFinishDetector.ts` returns `finished`, the work bound to that
 * item is ticked on EVERY list it belongs to, in one transaction, and the
 * evidence travels into the event log beside it.
 *
 * Deliberately silent on a `suggest`: §4.2's soft signal is a question the user
 * is asked ON the list, and persisting it here would make the answer a stored
 * fact that goes stale the moment they open the book again. The verdict is
 * returned so a caller can surface it; nothing is written for it.
 */

import {
  detectReadingFinish,
  type ReadingFinishInput,
  type ReadingFinishVerdict,
} from '../shared/readingFinishDetector';
import {
  createReadingListsMutationContext,
  finishReadingWorkEverywhere,
  sealReadingListsDocument,
} from '../shared/readingListMutations';
import { workForItem } from '../shared/readingLists';
import type { ReadingListsSnapshot } from '../shared/readingListsBridge';
import type { ReadingListsStore } from './readingListsStore';

/** Matches `readingListsBinder.ts`; a renderer editing a list mid-save is ordinary. */
const FINISH_ATTEMPT_LIMIT = 3;

export interface ReadingFinishOutcome {
  verdict: ReadingFinishVerdict;
  /** Entries moved to `finished` across every list. 0 when nothing was bound. */
  ticked: number;
  /** False only when every compare-and-swap attempt was refused. */
  applied: boolean;
}

export interface ReadingFinishDeps {
  store: ReadingListsStore;
  broadcast?: (snapshot: ReadingListsSnapshot) => void;
}

/**
 * Runs the detector for one progress save and applies a hard finish.
 *
 * `itemId` is the LIBRARY item. It reaches a list entry only through the work it
 * is bound to, which is why §3.1's late binding is P2's job and this is P3's: an
 * unbound item finishes nothing, correctly and silently.
 */
export function observeReadingProgress(
  itemId: string,
  input: ReadingFinishInput,
  deps: ReadingFinishDeps,
): ReadingFinishOutcome {
  const verdict = detectReadingFinish(input);
  if (verdict.verdict !== 'finished') return { verdict, ticked: 0, applied: true };

  for (let attempt = 0; attempt < FINISH_ATTEMPT_LIMIT; attempt += 1) {
    const snapshot = deps.store.read();
    const work = workForItem(snapshot.document, itemId);
    if (!work) return { verdict, ticked: 0, applied: true };

    const context = createReadingListsMutationContext(input.at);
    const mutation = finishReadingWorkEverywhere(
      snapshot.document,
      work.id,
      context,
      'reader-auto',
    );
    if (!mutation.ticked) return { verdict, ticked: 0, applied: true };

    // The evidence rides on every event this finish produced, not on a separate
    // record: §4.3's whole reason for `evidence` is answering "which rule
    // misfired" for a specific tick, and a parallel log would have to be joined
    // back up by timestamp to do that.
    const events = mutation.events.map((event) => ({
      ...event,
      detail: {
        ...event.detail,
        itemId,
        percent: verdict.evidence.percent,
        location: verdict.evidence.location,
        dwellMs: verdict.evidence.dwellMs,
        saves: verdict.evidence.saves,
      },
    }));

    const result = deps.store.write(
      snapshot.document.revision,
      sealReadingListsDocument(mutation.document),
      events,
    );
    if (!result.applied) continue;

    if (deps.broadcast) deps.broadcast(result.snapshot);
    return { verdict, ticked: mutation.ticked, applied: true };
  }

  return { verdict, ticked: 0, applied: false };
}
