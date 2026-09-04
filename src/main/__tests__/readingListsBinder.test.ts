/**
 * P2's done-when, from `docs/ACTIVE/READING_LISTS_PLAN.md` §9:
 *
 *   "Done when an item imported *after* the list exists binds itself, proven by
 *    a test that adds the item second."
 *
 * So the ordering is the assertion, not incidental setup: every case here writes
 * the list first, with nothing in the library, and only then hands the binder an
 * item. A test that seeded both at once would pass against an implementation
 * that only ever binds at paste time — which is the feature not existing.
 *
 * Driven against a real temporary store rather than a fake, because the CAS
 * retry loop and the persisted `boundItemIds` are half of what P2 has to prove.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReadingListsStore, type ReadingListsStore } from '../readingListsStore';
import { bindReadingListsToItems } from '../readingListsBinder';
import {
  applyReadingListImport,
  createReadingList,
  createReadingListsMutationContext,
} from '../../shared/readingListMutations';
import { parseReadingList } from '../../shared/readingListParser';
import type { ReadingListsSnapshot } from '../../shared/readingListsBridge';

let root = '';
let store: ReadingListsStore;

const NOW = 1_700_000_000_000;

/*
  Every fixture is at least three lines, and that is a property of the PARSER, not
  padding: §2.2's `line-per-title` strategy is gated on `indexed.length >= 3`
  (`readingListParser.ts:377`), because a one- or two-line message is a sentence,
  not a book list. A two-line fixture parses to zero entries and every assertion
  below then passes vacuously against an empty list — which is exactly how this
  suite first read as a broken binder.
*/
const THREE_TITLES = ['Convenience Store Woman', 'Kafka on the Shore', 'コンビニ人間'].join('\n');
const THREE_TITLES_WITH_MANGA = ['Convenience Store Woman', 'Kafka on the Shore', 'よつばと'].join(
  '\n',
);

/** Writes a list from a pasted message, with an empty library. Returns the list id. */
function seedList(message: string): string {
  const context = createReadingListsMutationContext(NOW);
  const created = createReadingList(store.read().document, { name: 'from Kenji' }, context);
  const listId = created.listId;
  const imported = applyReadingListImport(
    created.document,
    listId,
    parseReadingList(message),
    { rawText: message },
    context,
  );
  const write = store.write(store.read().document.revision, imported.document, [
    ...created.events,
    ...imported.events,
  ]);
  expect(write.applied).toBe(true);
  return listId;
}

function entryStates(snapshot: ReadingListsSnapshot, listId: string): string[] {
  const list = snapshot.document.lists.find((entry) => entry.id === listId);
  return (list?.entries ?? []).map((entry) => entry.state);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-rl-bind-'));
  store = createReadingListsStore(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('late binding — the item arrives after the list', () => {
  it('ticks a wanted entry to owned when its book is imported weeks later', () => {
    const listId = seedList(THREE_TITLES_WITH_MANGA);

    // The library is empty at this point. Nothing is bound.
    const before = store.read();
    expect(before.document.works.every((work) => work.boundItemIds.length === 0)).toBe(true);
    expect(entryStates(before, listId)).toEqual(['wanted', 'wanted', 'wanted']);

    const pushed: ReadingListsSnapshot[] = [];
    const result = bindReadingListsToItems(
      [{ id: 'li_kafka', title: 'Kafka on the Shore' }],
      { store, broadcast: (snapshot) => pushed.push(snapshot), now: NOW + 1 },
    );

    expect(result.applied).toBe(true);
    expect(result.bound.map((score) => score.itemId)).toEqual(['li_kafka']);
    expect(result.owned).toBe(1);

    const after = store.read();
    const kafka = after.document.works.find((work) => work.titleRaw.includes('Kafka'));
    expect(kafka?.boundItemIds).toEqual(['li_kafka']);
    expect(kafka?.bindConfidence).toBeGreaterThanOrEqual(0.82);
    // Exactly one entry moved. The other two are still waiting for their files.
    expect(entryStates(after, listId).filter((state) => state === 'owned')).toHaveLength(1);
    expect(entryStates(after, listId).filter((state) => state === 'wanted')).toHaveLength(2);

    // §0: the reader window and the library window cannot be allowed to disagree.
    expect(pushed).toHaveLength(1);
    expect(pushed[0]!.document.revision).toBe(after.document.revision);
  });

  it('binds through the script barrier — kana list, romaji filename', () => {
    const listId = seedList(['ノルウェイのもり', 'コンビニ人間', '吾輩は猫である'].join('\n'));
    const result = bindReadingListsToItems([{ id: 'li_nw', title: 'Noruwei no Mori' }], {
      store,
      now: NOW + 1,
    });
    expect(result.bound).toHaveLength(1);
    expect(entryStates(store.read(), listId)).toEqual(['owned', 'wanted', 'wanted']);
  });

  it('NEGATIVE CONTROL — an unrelated import binds nothing and writes nothing', () => {
    const listId = seedList(THREE_TITLES);
    const revisionBefore = store.read().document.revision;

    const pushed: ReadingListsSnapshot[] = [];
    const result = bindReadingListsToItems(
      [
        { id: 'li_x', title: 'Advanced Rust Programming' },
        { id: 'li_y', title: 'ゼロからのOS自作入門' },
      ],
      { store, broadcast: (snapshot) => pushed.push(snapshot), now: NOW + 1 },
    );

    expect(result.bound).toEqual([]);
    expect(result.owned).toBe(0);
    // The revision must not move. A no-op that bumps it re-renders every window
    // on every import forever, and makes "did anything bind" unanswerable.
    expect(store.read().document.revision).toBe(revisionBefore);
    expect(pushed).toEqual([]);
    expect(entryStates(store.read(), listId)).toEqual(['wanted', 'wanted', 'wanted']);
  });

  it('does not touch an entry the user already moved off wanted', () => {
    const listId = seedList(THREE_TITLES);
    const snapshot = store.read();
    const list = snapshot.document.lists.find((entry) => entry.id === listId)!;
    const abandoned = {
      ...snapshot.document,
      lists: [
        {
          ...list,
          entries: list.entries.map((entry) => ({ ...entry, state: 'abandoned' as const })),
        },
      ],
    };
    expect(store.write(snapshot.document.revision, abandoned).applied).toBe(true);

    const result = bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });

    // The work still records the file — knowing which file this is stays useful.
    expect(result.bound).toHaveLength(1);
    expect(result.owned).toBe(0);
    // But a background matcher may not un-abandon a book the user put down.
    expect(entryStates(store.read(), listId)).toEqual(['abandoned', 'abandoned', 'abandoned']);
  });

  it('is idempotent — a second import of the same item changes nothing', () => {
    seedList(THREE_TITLES);
    const first = bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    expect(first.bound).toHaveLength(1);
    const revisionAfterFirst = store.read().document.revision;

    const second = bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 2,
    });
    expect(second.bound).toEqual([]);
    expect(store.read().document.revision).toBe(revisionAfterFirst);
    const work = store.read().document.works.find((entry) => entry.titleRaw.includes('Kafka'))!;
    expect(work.boundItemIds).toEqual(['li_kafka']);
  });

  it('reports a suggest-band match without applying it', () => {
    const listId = seedList(['The Big O', 'Kafka on the Shore', 'コンビニ人間'].join('\n'));
    const result = bindReadingListsToItems(
      [{ id: 'li_seq', title: 'The Big O II Return of the Machine' }],
      { store, now: NOW + 1 },
    );
    expect(result.bound).toEqual([]);
    expect(result.suggested.map((score) => score.itemId)).toEqual(['li_seq']);
    expect(entryStates(store.read(), listId)).toEqual(['wanted', 'wanted', 'wanted']);
  });

  it('records the binding in the event log with the confidence that produced it', () => {
    seedList(THREE_TITLES);
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    const kinds = store.events(50).map((event) => event.kind);
    expect(kinds).toContain('work-bound');
    const bound = store.events(50).find((event) => event.kind === 'work-bound')!;
    expect(bound.detail?.itemId).toBe('li_kafka');
    expect(Number(bound.detail?.confidence)).toBeGreaterThanOrEqual(0.82);
  });

  it('gives up rather than looping when every attempt loses its compare-and-swap', () => {
    seedList(THREE_TITLES);
    // A store whose write is always refused models a renderer editing the same
    // document in a tight loop. The pass must terminate and say it did not apply.
    const contended: ReadingListsStore = {
      ...store,
      write: () => ({ applied: false, snapshot: store.read() }),
    };
    const result = bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store: contended,
      now: NOW + 1,
    });
    expect(result.applied).toBe(false);
    expect(result.bound).toEqual([]);
  });
});
