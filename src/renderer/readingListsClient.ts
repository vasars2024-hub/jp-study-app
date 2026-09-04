/**
 * Renderer side of the main-owned Reading Lists store.
 *
 * Shaped like `agentSpendClient.ts` — same bridge lookup, same "an absent method
 * degrades to a code rather than throwing" rule — with one thing that store does
 * not have and this one cannot do without: **the write is compare-and-swap**, so
 * a refused write has to be re-applied rather than reported.
 *
 * `applyReadingListsMutation` is where that lives. It takes an intent as a pure
 * function of a document (`shared/readingListMutations.ts`), not a patch, so a
 * refusal is answered by calling the same function again against the document
 * main just handed back. Concretely: the reader window ticks a book finished at
 * the moment the library window removes a different entry. One of the two is
 * refused, re-runs its intent against the winner's document, and both changes
 * survive. A patch computed against the stale document would silently restore
 * the removed entry instead.
 *
 * Three smaller rules, each of which is a defect if dropped:
 *
 *   · Writes are single-flight. Two clicks in the same tick would otherwise both
 *     start from the same revision, and the second would always burn a retry.
 *   · The freshest document wins the base. Every successful write and every push
 *     from main updates `latest`, and a queued mutation starts from that rather
 *     than from the snapshot its caller was rendering when it clicked.
 *   · A mutation that changes nothing never reaches IPC. `readingListMutations`
 *     returns the same document reference for a no-op, so an already-finished
 *     entry clicked twice costs no revision and no round trip.
 */

import {
  normalizeReadingListsDocument,
  type ReadingListEvent,
  type ReadingListsDocument,
} from '../shared/readingLists';
import {
  sealReadingListsDocument,
  type ReadingListsMutation,
} from '../shared/readingListMutations';
import {
  normalizeReadingListsEventsResult,
  normalizeReadingListsResult,
  normalizeReadingListsSnapshot,
  readingListsFailure,
  type ReadingListsEventsResult,
  type ReadingListsFailureCode,
  type ReadingListsResult,
  type ReadingListsSnapshot,
} from '../shared/readingListsBridge';

interface ReadingListsBridge {
  readingListsLoad(): Promise<unknown>;
  readingListsWrite(
    baseRevision: number,
    document: ReadingListsDocument,
    events?: Omit<ReadingListEvent, 'revision'>[],
  ): Promise<unknown>;
  readingListsEvents(limit?: number): Promise<unknown>;
  onReadingListsChanged(callback: (snapshot: unknown) => void): () => void;
}

type BridgeMethod = keyof ReadingListsBridge;

/** How many refusals a single intent absorbs before it is reported as a conflict. */
export const READING_LISTS_WRITE_ATTEMPTS = 4;

function bridgeMethod<K extends BridgeMethod>(name: K): ReadingListsBridge[K] | null {
  if (typeof window === 'undefined') return null;
  const api = (window as { api?: Partial<ReadingListsBridge> }).api;
  const method = api?.[name];
  return typeof method === 'function' ? (method.bind(api) as ReadingListsBridge[K]) : null;
}

/**
 * The freshest document this renderer has seen, from any source. Not a cache the
 * surfaces read — they render what they were handed — but the base a queued
 * mutation should start from, which is a different question and the reason a
 * plain React state value is the wrong answer to it.
 */
let latest: ReadingListsSnapshot | null = null;

/** Serializes writes. See the header: two clicks in one tick, one revision each. */
let queue: Promise<unknown> = Promise.resolve();

function remember(snapshot: ReadingListsSnapshot): ReadingListsSnapshot {
  if (!latest || snapshot.document.revision >= latest.document.revision) latest = snapshot;
  return snapshot;
}

export function latestReadingListsSnapshot(): ReadingListsSnapshot | null {
  return latest;
}

/** Test seam, and the reset a pop-out needs when it is torn down. */
export function resetReadingListsClientForTesting(): void {
  latest = null;
  queue = Promise.resolve();
}

async function call(
  invoke: (() => Promise<unknown>) | null,
  onThrow: 'read-failed' | 'write-failed',
): Promise<ReadingListsResult> {
  if (!invoke) return readingListsFailure('bridge-unavailable');
  try {
    const result = normalizeReadingListsResult(await invoke());
    if (result.ok) remember(result.snapshot);
    return result;
  } catch {
    return readingListsFailure(onThrow);
  }
}

export function loadReadingLists(): Promise<ReadingListsResult> {
  const method = bridgeMethod('readingListsLoad');
  return call(method && (() => method()), 'read-failed');
}

/**
 * The raw write. Callers that already hold both halves — main's own detector
 * replaying an intent, a test — use this; everything on a surface uses
 * `applyReadingListsMutation`, which is the one that answers a refusal.
 */
export function writeReadingLists(
  baseRevision: number,
  document: ReadingListsDocument,
  events: Omit<ReadingListEvent, 'revision'>[] = [],
): Promise<ReadingListsResult> {
  const method = bridgeMethod('readingListsWrite');
  return call(
    method && (() => method(baseRevision, sealReadingListsDocument(document), events)),
    'write-failed',
  );
}

export async function readReadingListEvents(limit = 200): Promise<ReadingListsEventsResult> {
  const method = bridgeMethod('readingListsEvents');
  if (!method) return readingListsFailure('bridge-unavailable');
  try {
    return normalizeReadingListsEventsResult(await method(limit));
  } catch {
    return readingListsFailure('read-failed');
  }
}

/**
 * Main pushes the whole snapshot after any change it did not answer directly —
 * another window's write, or the completion detector ticking a book with no
 * renderer involved. Returns a callable unsubscribe even when the bridge is
 * absent, so a caller's cleanup path never needs a null check.
 */
export function onReadingListsChanged(
  callback: (snapshot: ReadingListsSnapshot) => void,
): () => void {
  const method = bridgeMethod('onReadingListsChanged');
  if (!method) {
    return () => {
      // Nothing subscribed, so nothing is torn down.
    };
  }
  return method((raw) => callback(remember(normalizeReadingListsSnapshot(raw))));
}

export type ReadingListsMutator = (document: ReadingListsDocument) => ReadingListsMutation;

export type ReadingListsApplyResult =
  | {
      ok: true;
      snapshot: ReadingListsSnapshot;
      /** How many writes it took. 0 means the intent was already satisfied. */
      attempts: number;
      /** `false` when the mutation decided nothing needed to change. */
      changed: boolean;
    }
  | { ok: false; code: ReadingListsFailureCode; attempts: number };

/**
 * Applies an intent, answering a refused compare-and-swap by re-running it.
 *
 * `base` is what the caller was rendering. It is used only when nothing fresher
 * is known: a mutation that queued behind another one starts from the document
 * that one produced, which is both correct and one round trip cheaper.
 */
export async function applyReadingListsMutation(
  base: ReadingListsDocument,
  mutate: ReadingListsMutator,
  attemptLimit: number = READING_LISTS_WRITE_ATTEMPTS,
): Promise<ReadingListsApplyResult> {
  const run = async (): Promise<ReadingListsApplyResult> => {
    let current =
      latest && latest.document.revision > base.revision
        ? latest.document
        : normalizeReadingListsDocument(base);

    for (let attempt = 1; attempt <= Math.max(1, attemptLimit); attempt++) {
      const intent = mutate(current);
      if (intent.document === current) {
        // Identity, not deep equality: the mutation layer returns the same
        // reference precisely so this branch is cheap and unambiguous.
        return {
          ok: true,
          attempts: attempt - 1,
          changed: false,
          snapshot: latest ?? { document: current, health: { state: 'ok', lostRevisions: 0 } },
        };
      }

      const result = await writeReadingLists(
        current.revision,
        intent.document,
        intent.events,
      );
      if (!result.ok) return { ok: false, code: result.code, attempts: attempt };
      if (result.applied) return { ok: true, snapshot: result.snapshot, attempts: attempt, changed: true };
      // Refused: main handed back the document that won. Re-apply against it.
      current = result.snapshot.document;
    }
    return { ok: false, code: 'conflict', attempts: Math.max(1, attemptLimit) };
  };

  const next = queue.then(run, run);
  // The queue must survive a rejection, or one thrown mutator wedges every later
  // write behind a permanently rejected promise.
  queue = next.then(
    () => undefined,
    () => undefined,
  );
  return next;
}
