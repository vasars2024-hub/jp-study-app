/**
 * §3.1 late binding, run from main on every library import.
 *
 * "A friend texts you ten books today; you download the fourth one three weeks
 * from now; the list ticks itself and tells you, without you ever opening the
 * list." That sentence is the whole feature, and the reason it is here rather
 * than in an importer: there are seven `items.unshift(item)` sites in
 * `library.ts` today and every future acquisition route adds another. Hooking
 * one of them means the feature silently does not work for the other six.
 *
 * Pure decisions live in `shared/readingListMatch.ts`; this module is the
 * impure half — read the store, apply accepted bindings under CAS, broadcast.
 * It never throws into its caller: a failed bind must not be able to fail an
 * import, because the item on disk is real either way and the binding can be
 * recomputed on the next one.
 */

import {
  bestReadingBind,
  readingWorkFingerprint,
  type ReadingBindCandidate,
  type ReadingBindScore,
} from '../shared/readingListMatch';
import {
  bindReadingWorkToItem,
  createReadingListsMutationContext,
  sealReadingListsDocument,
} from '../shared/readingListMutations';
import type { ReadingListsDocument } from '../shared/readingLists';
import type { PendingReadingListEvent } from '../shared/readingListMutations';
import type { ReadingListsSnapshot } from '../shared/readingListsBridge';
import type { ReadingListsStore } from './readingListsStore';

/**
 * How many times a refused compare-and-swap is retried before the pass gives up.
 *
 * A renderer editing a list at the same moment as an import lands is ordinary,
 * not exceptional. Three attempts covers it; beyond that the next import runs
 * the same pass anyway, so giving up loses nothing permanently.
 */
const BIND_ATTEMPT_LIMIT = 3;

export interface ReadingListsBindResult {
  /** Bindings applied at `accept`. */
  bound: ReadingBindScore[];
  /** Scores in the `suggest` band. Recorded, never applied — §3's "is this it?". */
  suggested: ReadingBindScore[];
  /** Entries moved `wanted` → `owned` across all lists. */
  owned: number;
  /** False when every attempt lost its compare-and-swap. */
  applied: boolean;
}

const EMPTY: ReadingListsBindResult = { bound: [], suggested: [], owned: 0, applied: true };

export interface BindReadingListsDeps {
  store: ReadingListsStore;
  /** Injected so a test can assert the push happened without an Electron window. */
  broadcast?: (snapshot: ReadingListsSnapshot) => void;
  now?: number;
}

/**
 * Runs every unbound work's fingerprint against the newly-added items.
 *
 * Only works with no binding yet are considered. A work already bound to a file
 * is not re-examined on every subsequent import: the user's own copy is the
 * answer, and letting a later, higher-scoring item displace it would mean a
 * folder scan could quietly repoint a list entry at a different file.
 */
export function bindReadingListsToItems(
  candidates: readonly ReadingBindCandidate[],
  deps: BindReadingListsDeps,
): ReadingListsBindResult {
  if (!candidates.length) return EMPTY;

  for (let attempt = 0; attempt < BIND_ATTEMPT_LIMIT; attempt += 1) {
    const snapshot = deps.store.read();
    const context = createReadingListsMutationContext(deps.now ?? Date.now());

    const bound: ReadingBindScore[] = [];
    const suggested: ReadingBindScore[] = [];
    let document: ReadingListsDocument = snapshot.document;
    const events: PendingReadingListEvent[] = [];
    let owned = 0;

    for (const work of snapshot.document.works) {
      if (work.boundItemIds.length) continue;
      const match = bestReadingBind(readingWorkFingerprint(work), candidates);
      if (!match) continue;
      if (match.disposition !== 'accept') {
        suggested.push(match);
        continue;
      }
      const mutation = bindReadingWorkToItem(
        document,
        match.workId,
        match.itemId,
        match.confidence,
        context,
      );
      if (!mutation.bound) continue;
      document = mutation.document;
      events.push(...mutation.events);
      owned += mutation.owned;
      bound.push(match);
    }

    // Nothing to write. The suggestions still travel back so a caller can surface
    // them, but they are not persisted state — §3 says a suggestion is a chip on a
    // `wanted` entry, and recomputing it is cheaper than keeping it in sync.
    if (!bound.length) return { bound: [], suggested, owned: 0, applied: true };

    const result = deps.store.write(
      snapshot.document.revision,
      sealReadingListsDocument(document),
      events,
    );
    if (!result.applied) continue;

    if (deps.broadcast) deps.broadcast(result.snapshot);
    return { bound, suggested, owned, applied: true };
  }

  return { bound: [], suggested: [], owned: 0, applied: false };
}
