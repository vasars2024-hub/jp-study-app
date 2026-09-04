/**
 * §4.3 and §4.4 driven end to end against a real temporary store: a progress
 * save on a bound item ticks the work on EVERY list it belongs to, in one
 * transaction, with the evidence in the log.
 *
 * The list fixtures are three lines each because §2.2's `line-per-title` is
 * gated on `indexed.length >= 3` (`readingListParser.ts:377`). A shorter one
 * parses to zero entries and every assertion below would pass vacuously.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createReadingListsStore, type ReadingListsStore } from '../readingListsStore';
import { observeReadingProgress } from '../readingFinishWatcher';
import { bindReadingListsToItems } from '../readingListsBinder';
import {
  applyReadingListImport,
  createReadingList,
  createReadingListsMutationContext,
} from '../../shared/readingListMutations';
import { parseReadingList } from '../../shared/readingListParser';
import { FINISH_DWELL_MS } from '../../shared/readingFinishDetector';
import type { ReadingListsSnapshot } from '../../shared/readingListsBridge';

let root = '';
let store: ReadingListsStore;

const NOW = 1_700_000_000_000;
const END = 'p:41:0.997';
const TITLES = ['Convenience Store Woman', 'Kafka on the Shore', 'コンビニ人間'];

function seedList(name: string): string {
  const context = createReadingListsMutationContext(NOW);
  const message = TITLES.join('\n');
  const created = createReadingList(store.read().document, { name }, context);
  const imported = applyReadingListImport(
    created.document,
    created.listId,
    parseReadingList(message),
    { rawText: message },
    context,
  );
  const write = store.write(store.read().document.revision, imported.document, [
    ...created.events,
    ...imported.events,
  ]);
  expect(write.applied).toBe(true);
  return created.listId;
}

function statesFor(title: string): string[] {
  const snapshot = store.read();
  const work = snapshot.document.works.find((entry) => entry.titleRaw.includes(title));
  if (!work) return [];
  return snapshot.document.lists.flatMap((list) =>
    list.entries.filter((entry) => entry.workId === work.id).map((entry) => entry.state),
  );
}

/** A save at the end that has already been held for the full dwell. */
function heldAtEnd(at = NOW + FINISH_DWELL_MS) {
  return {
    kind: 'book',
    previous: { location: END, percent: 0.995 },
    previousAt: at - FINISH_DWELL_MS,
    next: { location: END, percent: 0.995 },
    at,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-rl-finish-'));
  store = createReadingListsStore(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('a finish in the reader ticks the lists', () => {
  it('ticks the same work on EVERY list it is on, in one write', () => {
    seedList('from Kenji');
    seedList('2026 backlog');
    // The same three titles on both lists collapse onto three works, because
    // works live beside the lists rather than inside them.
    expect(store.read().document.works).toHaveLength(3);
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    expect(statesFor('Kafka')).toEqual(['owned', 'owned']);

    const revisionBefore = store.read().document.revision;
    const pushed: ReadingListsSnapshot[] = [];
    const outcome = observeReadingProgress('li_kafka', heldAtEnd(), {
      store,
      broadcast: (snapshot) => pushed.push(snapshot),
    });

    expect(outcome.verdict.verdict).toBe('finished');
    expect(outcome.ticked).toBe(2);
    expect(statesFor('Kafka')).toEqual(['finished', 'finished']);
    // One transaction, not one per list.
    expect(store.read().document.revision).toBe(revisionBefore + 1);
    expect(pushed).toHaveLength(1);
    // The other two books are untouched — never bound, so still on the shopping list.
    expect(statesFor('Convenience Store Woman')).toEqual(['wanted', 'wanted']);
  });

  it('NEGATIVE CONTROL — a scrub to the end writes nothing at all', () => {
    seedList('from Kenji');
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    const revisionBefore = store.read().document.revision;

    const pushed: ReadingListsSnapshot[] = [];
    const outcome = observeReadingProgress(
      'li_kafka',
      { kind: 'book', next: { location: 'p:41:1', percent: 1 }, at: NOW + 2 },
      { store, broadcast: (snapshot) => pushed.push(snapshot) },
    );

    expect(outcome.verdict.verdict).toBe('none');
    expect(outcome.ticked).toBe(0);
    expect(store.read().document.revision).toBe(revisionBefore);
    expect(pushed).toEqual([]);
    expect(statesFor('Kafka')).toEqual(['owned']);
  });

  it('finishes nothing, silently, for an item bound to no work', () => {
    seedList('from Kenji');
    const revisionBefore = store.read().document.revision;
    const outcome = observeReadingProgress('li_unknown', heldAtEnd(), { store });
    expect(outcome.verdict.verdict).toBe('finished');
    expect(outcome.ticked).toBe(0);
    expect(store.read().document.revision).toBe(revisionBefore);
  });

  it('carries the evidence into the log, per §4.3', () => {
    seedList('from Kenji');
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    observeReadingProgress('li_kafka', heldAtEnd(), { store });

    const finished = store.events(50).find((event) => event.kind === 'entry-finished');
    expect(finished).toBeDefined();
    expect(finished?.detail?.by).toBe('reader-auto');
    expect(finished?.detail?.itemId).toBe('li_kafka');
    expect(finished?.detail?.location).toBe(END);
    expect(finished?.detail?.dwellMs).toBe(FINISH_DWELL_MS);
    expect(finished?.detail?.saves).toBe(2);
  });

  it('is idempotent — a second save at the same place does not re-finish', () => {
    seedList('from Kenji');
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    observeReadingProgress('li_kafka', heldAtEnd(), { store });
    const revisionAfterFirst = store.read().document.revision;

    const again = observeReadingProgress('li_kafka', heldAtEnd(NOW + 5 * FINISH_DWELL_MS), {
      store,
    });
    expect(again.ticked).toBe(0);
    expect(store.read().document.revision).toBe(revisionAfterFirst);
  });

  it('does not resurrect a book the user abandoned on another list', () => {
    const kenji = seedList('from Kenji');
    seedList('2026 backlog');
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });

    const snapshot = store.read();
    const work = snapshot.document.works.find((entry) => entry.titleRaw.includes('Kafka'))!;
    const abandoned = {
      ...snapshot.document,
      lists: snapshot.document.lists.map((list) =>
        list.id === kenji
          ? {
              ...list,
              entries: list.entries.map((entry) =>
                entry.workId === work.id ? { ...entry, state: 'abandoned' as const } : entry,
              ),
            }
          : list,
      ),
    };
    expect(store.write(snapshot.document.revision, abandoned).applied).toBe(true);

    const outcome = observeReadingProgress('li_kafka', heldAtEnd(), { store });
    expect(outcome.ticked).toBe(1);
    // The backlog list ticks; the one it was abandoned on stays abandoned.
    expect(statesFor('Kafka').sort()).toEqual(['abandoned', 'finished']);
  });

  it('gives up rather than looping when every attempt loses its compare-and-swap', () => {
    seedList('from Kenji');
    bindReadingListsToItems([{ id: 'li_kafka', title: 'Kafka on the Shore' }], {
      store,
      now: NOW + 1,
    });
    const contended: ReadingListsStore = {
      ...store,
      write: () => ({ applied: false, snapshot: store.read() }),
    };
    const outcome = observeReadingProgress('li_kafka', heldAtEnd(), { store: contended });
    expect(outcome.applied).toBe(false);
    expect(outcome.ticked).toBe(0);
  });
});
