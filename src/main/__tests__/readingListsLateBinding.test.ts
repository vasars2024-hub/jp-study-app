/**
 * P2's own "done when": *an item imported after the list exists binds itself,
 * proven by an integration test that adds the item second.*
 *
 * So the ordering here is the assertion, not scaffolding: the list is created
 * and persisted first, through the real store, and the library item does not
 * exist at that moment. Every test in the first block adds it afterwards.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReadingListsStore, type ReadingListsStore } from '../readingListsStore';
import {
  applyLateBinding,
  bindLibraryItemsIntoReadingLists,
  libraryItemCandidate,
  volumeFromTitle,
} from '../readingListsBinding';
import { createReadingListsMutationContext } from '../../shared/readingListMutations';
import { normalizeReadingListsDocument } from '../../shared/readingLists';
import type { LibraryItem } from '../../shared/types';

vi.mock('../readingListsIpc', () => ({ broadcastReadingLists: vi.fn() }));

const NOW = 1_770_000_000_000;

function item(patch: Partial<LibraryItem> & { id: string; title: string }): LibraryItem {
  return { kind: 'book', createdAt: NOW, ...patch };
}

let root: string;
let store: ReadingListsStore;

/** Persists a list holding one `wanted` entry, and returns the work id. */
function seedList(titleRaw: string, extra: Record<string, unknown> = {}): string {
  const document = normalizeReadingListsDocument({
    schemaVersion: 1,
    revision: 0,
    works: [{ id: 'w1', titleRaw, boundItemIds: [], bindConfidence: 0, ...extra }],
    lists: [
      {
        id: 'l1',
        name: 'From Aya',
        kind: 'pool',
        createdAt: NOW,
        updatedAt: NOW,
        entries: [{ id: 'e1', workId: 'w1', order: 0, addedAt: NOW, state: 'wanted' }],
        imports: [],
      },
    ],
  });
  const written = store.write(0, document, []);
  expect(written.applied).toBe(true);
  return 'w1';
}

const readWork = () => store.read().document.works[0];
const readEntry = () => store.read().document.lists[0].entries[0];

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'jp-reading-late-'));
  store = createReadingListsStore(root);
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('late binding — the item arrives after the list', () => {
  it('ticks a wanted entry to owned when the matching file lands weeks later', () => {
    seedList('コンビニ人間');
    // The list is on disk and the library is empty. Now the download finishes.
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-1', title: 'コンビニ人間' })],
      store,
      () => NOW,
    );

    expect(result).toEqual({ bound: 1, suggested: 0, applied: true });
    expect(readWork().boundItemIds).toEqual(['lib-1']);
    expect(readEntry().state).toBe('owned');

    const events = store.events(10);
    expect(events[0].kind).toBe('work-bound');
    expect(events[0].detail?.itemId).toBe('lib-1');
    // The store minted the revision, so the event carries the document it produced.
    expect(events[0].revision).toBe(store.read().document.revision);
  });

  it('binds across kana and romaji, which is why the transliterator exists', () => {
    seedList('よるのばけもの');
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-2', title: 'Yoru no Bakemono' })],
      store,
      () => NOW,
    );
    expect(result.bound).toBe(1);
    expect(readEntry().state).toBe('owned');
  });

  it('NEGATIVE CONTROL — an unrelated import changes nothing at all', () => {
    seedList('コンビニ人間');
    const before = store.read().document;
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-3', title: 'ノルウェイの森' }), item({ id: 'lib-4', title: '推し、燃ゆ' })],
      store,
      () => NOW,
    );

    expect(result).toEqual({ bound: 0, suggested: 0, applied: false });
    expect(readEntry().state).toBe('wanted');
    expect(readWork().suggestion).toBeUndefined();
    // No revision burned and no broadcast: a no-op must not look like a change.
    expect(store.read().document.revision).toBe(before.revision);
  });

  it('offers rather than claims when the match is only plausible', () => {
    seedList('Kino no Tabi');
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-5', title: 'Kino no Tabi - Beautiful World' })],
      store,
      () => NOW,
    );

    expect(result).toEqual({ bound: 0, suggested: 1, applied: true });
    // The honest half: nothing is marked owned on a maybe.
    expect(readEntry().state).toBe('wanted');
    expect(readWork().suggestion?.itemId).toBe('lib-5');
    expect(readWork().suggestion?.signals?.titleVia).toBe('fuzzy');
  });

  it('NEGATIVE CONTROL — skips a work that is already bound to something', () => {
    seedList('コンビニ人間', { boundItemIds: ['old'], bindConfidence: 0.9 });
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-6', title: 'コンビニ人間' })],
      store,
      () => NOW,
    );
    expect(result.applied).toBe(false);
    expect(readWork().boundItemIds).toEqual(['old']);
  });

  it('binds several works out of one folder scan', () => {
    const document = normalizeReadingListsDocument({
      revision: 0,
      works: [
        { id: 'w1', titleRaw: 'コンビニ人間', boundItemIds: [], bindConfidence: 0 },
        { id: 'w2', titleRaw: 'ノルウェイの森', boundItemIds: [], bindConfidence: 0 },
        { id: 'w3', titleRaw: '推し、燃ゆ', boundItemIds: [], bindConfidence: 0 },
      ],
      lists: [
        {
          id: 'l1',
          name: 'From Aya',
          kind: 'ordered',
          createdAt: NOW,
          updatedAt: NOW,
          entries: [
            { id: 'e1', workId: 'w1', order: 0, addedAt: NOW, state: 'wanted' },
            { id: 'e2', workId: 'w2', order: 1, addedAt: NOW, state: 'wanted' },
            { id: 'e3', workId: 'w3', order: 2, addedAt: NOW, state: 'wanted' },
          ],
          imports: [],
        },
      ],
    });
    expect(store.write(0, document, []).applied).toBe(true);

    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'a', title: 'コンビニ人間' }), item({ id: 'b', title: 'ノルウェイの森' })],
      store,
      () => NOW,
    );
    expect(result.bound).toBe(2);
    const states = store.read().document.lists[0].entries.map((entry) => entry.state);
    expect(states).toEqual(['owned', 'owned', 'wanted']);
    // One write, not one per work: three revisions for one scan would make the
    // event log unreadable and broadcast three times.
    expect(store.read().document.revision).toBe(2);
  });
});

describe('the compare-and-swap re-apply', () => {
  it('re-applies against the document main hands back after a refusal', () => {
    seedList('コンビニ人間');
    let refusals = 0;
    const flaky: ReadingListsStore = {
      ...store,
      write: (baseRevision, document, events) => {
        if (refusals === 0) {
          refusals += 1;
          // Exactly what a concurrent renderer write produces: refused, current
          // snapshot returned, and the base revision the caller used is now stale.
          return { applied: false, snapshot: store.read() };
        }
        return store.write(baseRevision, document, events);
      },
    };

    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-7', title: 'コンビニ人間' })],
      flaky,
      () => NOW,
    );
    expect(refusals).toBe(1);
    expect(result).toEqual({ bound: 1, suggested: 0, applied: true });
    expect(readEntry().state).toBe('owned');
  });

  it('gives up after three refusals without half-applying anything', () => {
    seedList('コンビニ人間');
    const before = store.read().document;
    const always: ReadingListsStore = {
      ...store,
      write: () => ({ applied: false, snapshot: store.read() }),
    };
    const result = bindLibraryItemsIntoReadingLists(
      [item({ id: 'lib-8', title: 'コンビニ人間' })],
      always,
      () => NOW,
    );
    expect(result.applied).toBe(false);
    expect(store.read().document).toEqual(before);
  });
});

describe('libraryItemCandidate', () => {
  it('reads the provider work titles and the filename as alternatives', () => {
    const candidate = libraryItemCandidate(
      item({
        id: 'x',
        title: 'konbini-ningen',
        sourcePath: 'D:\\books\\コンビニ人間 (2016).epub',
        readingSource: {
          kind: 'seanime-manga-chapter',
          mediaId: 1,
          workId: 'w',
          workTitle: 'Convenience Store Woman',
          workTitleNative: 'コンビニ人間',
          editionId: 'e',
          providerId: 'p',
          providerLabel: 'P',
          chapterId: 'c',
          chapterNumber: '1',
          chapterTitle: 't',
          language: 'ja',
        },
      }),
    );
    expect(candidate.altTitles).toEqual([
      'Convenience Store Woman',
      'コンビニ人間',
      'コンビニ人間 (2016)',
    ]);
  });

  it('parses a volume only where a volume actually is', () => {
    expect(volumeFromTitle('ハリー・ポッター 第3巻')).toBe(3);
    expect(volumeFromTitle('鋼の錬金術師 2')).toBe(2);
    expect(volumeFromTitle('Berserk vol. 12')).toBe(12);
    // NEGATIVE CONTROL — a wrong volume is a penalty in the matcher, so a number
    // that is part of the title must not be read as one.
    expect(volumeFromTitle('1984')).toBeUndefined();
    expect(volumeFromTitle('Fahrenheit 451')).toBeUndefined();
    expect(volumeFromTitle('コンビニ人間')).toBeUndefined();
  });
});

describe('applyLateBinding, directly', () => {
  it('returns the same document reference when it has nothing to say', () => {
    const document = normalizeReadingListsDocument({
      works: [{ id: 'w1', titleRaw: 'コンビニ人間', boundItemIds: [], bindConfidence: 0 }],
      lists: [],
    });
    const result = applyLateBinding(
      document,
      [{ id: 'z', title: 'ノルウェイの森' }],
      createReadingListsMutationContext(NOW),
    );
    expect(result.document).toBe(document);
    expect(result.events).toEqual([]);
  });

  it('is a no-op on an empty candidate set', () => {
    const document = normalizeReadingListsDocument({ works: [], lists: [] });
    expect(applyLateBinding(document, [], createReadingListsMutationContext(NOW)).document).toBe(
      document,
    );
  });
});
