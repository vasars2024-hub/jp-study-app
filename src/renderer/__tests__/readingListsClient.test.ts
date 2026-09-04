// @vitest-environment jsdom
/**
 * The renderer's view of the main-owned Reading Lists store.
 *
 * The property that matters here and nowhere else in this repo is the
 * compare-and-swap RETRY. Everything else — bridge-unavailable, a rejected
 * invoke landing as a code — follows `agentSpendClient.test.ts`. So the fake
 * bridge below is a real single-revision store: it refuses a write whose base
 * revision has moved, exactly as `main/readingListsStore.ts` does, and every
 * conflict test drives that refusal rather than stubbing `applied: false`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  emptyReadingListsDocument,
  type ReadingListsDocument,
} from '../../shared/readingLists';
import {
  addReadingListEntry,
  createReadingList,
  createReadingListsMutationContext,
  removeReadingListEntry,
  setReadingEntryState,
  type ReadingListsMutation,
} from '../../shared/readingListMutations';
import {
  applyReadingListsMutation,
  latestReadingListsSnapshot,
  loadReadingLists,
  onReadingListsChanged,
  readReadingListEvents,
  resetReadingListsClientForTesting,
  writeReadingLists,
} from '../readingListsClient';

/** A store with the same revision contract as main's, so a refusal is real. */
function fakeStore(initial: ReadingListsDocument = emptyReadingListsDocument()) {
  let document = initial;
  const writes: { baseRevision: number; applied: boolean }[] = [];
  const listeners: ((snapshot: unknown) => void)[] = [];
  return {
    writes,
    get document() {
      return document;
    },
    push(next: ReadingListsDocument) {
      document = next;
      for (const listener of listeners) {
        listener({ document, health: { state: 'ok', lostRevisions: 0 } });
      }
    },
    api: {
      readingListsLoad: () =>
        Promise.resolve({
          ok: true,
          snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
        }),
      readingListsWrite: (baseRevision: number, next: ReadingListsDocument) => {
        const applied = baseRevision === document.revision;
        writes.push({ baseRevision, applied });
        if (applied) document = { ...next, revision: document.revision + 1 };
        return Promise.resolve({
          ok: true,
          applied,
          snapshot: { document, health: { state: 'ok', lostRevisions: 0 } },
        });
      },
      readingListsEvents: () => Promise.resolve({ ok: true, events: [{ at: 1, kind: 'list-created', revision: 1 }] }),
      onReadingListsChanged: (callback: (snapshot: unknown) => void) => {
        listeners.push(callback);
        return () => {
          listeners.splice(listeners.indexOf(callback), 1);
        };
      },
    },
  };
}

function install(api: unknown): void {
  (window as { api?: unknown }).api = api;
}

beforeEach(() => {
  resetReadingListsClientForTesting();
});

afterEach(() => {
  delete (window as { api?: unknown }).api;
  vi.restoreAllMocks();
});

describe('the bridge lookup', () => {
  it('reports bridge-unavailable rather than an empty document', async () => {
    install({});
    const result = await loadReadingLists();
    expect(result).toEqual({ ok: false, code: 'bridge-unavailable' });
    // The dangerous confusion: an absent bridge must never look like "no lists".
    expect(result.ok).toBe(false);
  });

  it('lands a rejected invoke as a code, not a thrown exception', async () => {
    install({ readingListsLoad: () => Promise.reject(new Error('no handler')) });
    await expect(loadReadingLists()).resolves.toEqual({ ok: false, code: 'read-failed' });
    install({ readingListsWrite: () => Promise.reject(new Error('no handler')) });
    await expect(writeReadingLists(0, emptyReadingListsDocument())).resolves.toEqual({
      ok: false,
      code: 'write-failed',
    });
  });

  it('returns a callable unsubscribe with no bridge at all', () => {
    install({});
    const stop = onReadingListsChanged(() => undefined);
    expect(() => stop()).not.toThrow();
  });

  it('re-derives events that crossed, dropping an unknown kind', async () => {
    install({
      readingListsEvents: () =>
        Promise.resolve({ ok: true, events: [{ kind: 'nonsense' }, { kind: 'entry-added', at: 3 }] }),
    });
    const result = await readReadingListEvents(10);
    expect(result).toEqual({ ok: true, events: [{ at: 3, kind: 'entry-added', revision: 0 }] });
  });
});

describe('applying a mutation', () => {
  it('writes once and returns the snapshot main minted', async () => {
    const store = fakeStore();
    install(store.api);
    const context = createReadingListsMutationContext(1000);
    const result = await applyReadingListsMutation(store.document, (document) =>
      createReadingList(document, { name: 'From Kenji' }, context),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(1);
    expect(result.changed).toBe(true);
    expect(result.snapshot.document.revision).toBe(1);
    expect(result.snapshot.document.lists[0].name).toBe('From Kenji');
    expect(store.writes).toEqual([{ baseRevision: 0, applied: true }]);
  });

  it('never reaches IPC when the mutation changes nothing', async () => {
    const store = fakeStore();
    install(store.api);
    const result = await applyReadingListsMutation(store.document, (document) =>
      // No such list: the mutation layer returns the same reference.
      setReadingEntryState(document, 'absent', 'absent', 'finished', createReadingListsMutationContext(1)),
    );
    expect(result).toMatchObject({ ok: true, attempts: 0, changed: false });
    expect(store.writes).toEqual([]);
  });

  it('RE-APPLIES its intent against the document that won the race', async () => {
    const store = fakeStore();
    install(store.api);
    const context = createReadingListsMutationContext(1000);

    // Land a list with two entries.
    await applyReadingListsMutation(store.document, (document) => {
      const created = createReadingList(document, { name: 'Shared' }, context);
      const first = addReadingListEntry(created.document, created.listId, { title: 'A' }, context);
      const second = addReadingListEntry(first.document, created.listId, { title: 'B' }, context);
      return {
        document: second.document,
        events: [...created.events, ...first.events, ...second.events],
      } satisfies ReadingListsMutation;
    });

    store.writes.length = 0; // The setup write above is not part of the race.
    const staleBase = store.document;
    const listId = staleBase.lists[0].id;
    const [entryA, entryB] = staleBase.lists[0].entries;

    // Another window removes entry B and wins, out of band.
    const removed = removeReadingListEntry(staleBase, listId, entryB.id, context);
    store.push({ ...removed.document, revision: staleBase.revision + 1 });
    resetReadingListsClientForTesting();

    // This window still holds the pre-removal document and finishes entry A.
    const result = await applyReadingListsMutation(staleBase, (document) =>
      setReadingEntryState(document, listId, entryA.id, 'finished', context),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attempts).toBe(2);
    expect(store.writes.map((write) => write.applied)).toEqual([false, true]);
    const entries = store.document.lists[0].entries;
    // Both changes survive: B stays removed AND A is finished.
    expect(entries).toHaveLength(1);
    expect(entries[0].id).toBe(entryA.id);
    expect(entries[0].state).toBe('finished');
  });

  it('reports `conflict` rather than a generic write failure when it runs out of attempts', async () => {
    const store = fakeStore();
    install({
      ...store.api,
      // A store that has always already moved: every base revision is stale.
      readingListsWrite: (baseRevision: number) => {
        store.writes.push({ baseRevision, applied: false });
        return Promise.resolve({
          ok: true,
          applied: false,
          snapshot: {
            document: { ...emptyReadingListsDocument(), revision: store.writes.length + 10 },
            health: { state: 'ok', lostRevisions: 0 },
          },
        });
      },
    });
    const context = createReadingListsMutationContext(1000);
    const result = await applyReadingListsMutation(
      emptyReadingListsDocument(),
      (document) => createReadingList(document, { name: 'A' }, context),
      3,
    );
    expect(result).toEqual({ ok: false, code: 'conflict', attempts: 3 });
    expect(store.writes).toHaveLength(3);
  });

  it('serializes concurrent mutations so each gets its own revision', async () => {
    const store = fakeStore();
    install(store.api);
    const context = createReadingListsMutationContext(1000);
    const base = store.document;

    const results = await Promise.all([
      applyReadingListsMutation(base, (document) =>
        createReadingList(document, { name: 'One' }, context),
      ),
      applyReadingListsMutation(base, (document) =>
        createReadingList(document, { name: 'Two' }, context),
      ),
      applyReadingListsMutation(base, (document) =>
        createReadingList(document, { name: 'Three' }, context),
      ),
    ]);

    expect(results.every((result) => result.ok)).toBe(true);
    // Three lists, three revisions, and — the point — not one refused write:
    // the second and third started from the document the first produced.
    expect(store.document.lists.map((list) => list.name)).toEqual(['One', 'Two', 'Three']);
    expect(store.document.revision).toBe(3);
    expect(store.writes.map((write) => write.applied)).toEqual([true, true, true]);
  });

  it('a thrown mutator does not wedge the queue behind it', async () => {
    const store = fakeStore();
    install(store.api);
    const context = createReadingListsMutationContext(1000);
    const boom = applyReadingListsMutation(store.document, () => {
      throw new Error('mutator exploded');
    });
    await expect(boom).rejects.toThrow('mutator exploded');
    const after = await applyReadingListsMutation(store.document, (document) =>
      createReadingList(document, { name: 'After' }, context),
    );
    expect(after.ok).toBe(true);
    expect(store.document.lists.map((list) => list.name)).toEqual(['After']);
  });
});

describe('the freshest document', () => {
  it('a push from main becomes the base a later mutation starts from', async () => {
    const store = fakeStore();
    install(store.api);
    const context = createReadingListsMutationContext(1000);
    const stop = onReadingListsChanged(() => undefined);

    const stale = store.document;
    // Main writes by itself — the completion detector, no renderer involved.
    const created = createReadingList(stale, { name: 'From main' }, context);
    store.push({ ...created.document, revision: 1 });
    expect(latestReadingListsSnapshot()?.document.revision).toBe(1);

    // The surface is still rendering revision 0 and adds a list of its own.
    const result = await applyReadingListsMutation(stale, (document) =>
      createReadingList(document, { name: 'From me' }, context),
    );
    expect(result.ok).toBe(true);
    // One write, applied first time: the client used revision 1, not the caller's 0.
    expect(store.writes).toEqual([{ baseRevision: 1, applied: true }]);
    expect(store.document.lists.map((list) => list.name)).toEqual(['From main', 'From me']);
    stop();
  });

  it('an unsubscribed listener stops receiving pushes', () => {
    const store = fakeStore();
    install(store.api);
    const seen: number[] = [];
    const stop = onReadingListsChanged((snapshot) => seen.push(snapshot.document.revision));
    store.push({ ...emptyReadingListsDocument(), revision: 1 });
    stop();
    store.push({ ...emptyReadingListsDocument(), revision: 2 });
    expect(seen).toEqual([1]);
  });
});
