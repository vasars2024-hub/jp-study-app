/**
 * P1b — the mutation layer.
 *
 * Every test here drives a real document through a real mutation and asserts the
 * exact resulting shape, per the plan's §10.5 ("a test that asserts a title
 * appears in the output is not a test"). The context is deterministic, so ids and
 * timestamps are asserted rather than pattern-matched.
 */

import { describe, expect, it } from 'vitest';
import {
  emptyReadingListsDocument,
  normalizeReadingListsDocument,
  readingListProgress,
  type ReadingListsDocument,
} from '../readingLists';
import { parseReadingList } from '../readingListParser';
import {
  addReadingListEntry,
  applyReadingListImport,
  createReadingList,
  createReadingListsMutationContext,
  deleteReadingList,
  finishReadingWorkEverywhere,
  readingWorkKey,
  removeReadingListEntry,
  reorderReadingListEntries,
  restoreReadingList,
  restoreReadingListEntry,
  sealReadingListsDocument,
  setReadingEntryState,
  updateReadingList,
  type ReadingListsMutationContext,
} from '../readingListMutations';

const NOW = 1_760_000_000_000;

/**
 * Deterministic ids: `rl_1`, `rw_2`, … in mint order.
 *
 * `tag` exists because a second context in the same test starts its counter at 1
 * again and mints an id the first one already used — which made a `deleteList`
 * test delete two lists and read as a product defect for one run.
 */
function ctx(now = NOW, tag = ''): ReadingListsMutationContext {
  let n = 0;
  return {
    now,
    mintId: (prefix) => {
      n += 1;
      return `${prefix}_${tag}${n}`;
    },
  };
}

const MESSAGE = [
  'yo these are the ones i said',
  '',
  '1. Kino no Tabi',
  '2. 君の膵臓をたべたい',
  '3. Convenience Store Woman (コンビニ人間) — Murakami? no, Sayaka Murata',
  '- ハリー・ポッター 1〜3巻',
  'also 「夜は短し歩けよ乙女」 if u can find it lol',
  'https://example.com/list/1234',
].join('\n');

function listWithMessage(): { document: ReadingListsDocument; listId: string } {
  const context = ctx();
  const created = createReadingList(
    emptyReadingListsDocument(),
    { name: 'From Kenji', kind: 'ordered' },
    context,
  );
  const applied = applyReadingListImport(
    created.document,
    created.listId,
    parseReadingList(MESSAGE),
    { rawText: MESSAGE, from: 'Kenji, LINE' },
    context,
  );
  return { document: applied.document, listId: created.listId };
}

describe('lists', () => {
  it('creates a list with a minted id and one event', () => {
    const result = createReadingList(
      emptyReadingListsDocument(),
      { name: '  Winter reading  ', kind: 'challenge', target: { count: 5 } },
      ctx(),
    );
    expect(result.listId).toBe('rl_1');
    expect(result.document.lists).toHaveLength(1);
    expect(result.document.lists[0]).toEqual({
      id: 'rl_1',
      name: 'Winter reading',
      kind: 'challenge',
      createdAt: NOW,
      updatedAt: NOW,
      target: { count: 5 },
      entries: [],
      imports: [],
    });
    expect(result.events).toEqual([
      { at: NOW, kind: 'list-created', listId: 'rl_1', detail: { kind: 'challenge' } },
    ]);
  });

  it('returns the SAME document and no events when an update changes nothing', () => {
    const created = createReadingList(emptyReadingListsDocument(), { name: 'A' }, ctx());
    const result = updateReadingList(created.document, created.listId, { name: '  A  ' }, ctx());
    expect(result.document).toBe(created.document);
    expect(result.events).toEqual([]);
  });

  it('names the fields it changed, and clears a description with null', () => {
    const created = createReadingList(
      emptyReadingListsDocument(),
      { name: 'A', description: 'from a friend' },
      ctx(),
    );
    const renamed = updateReadingList(
      created.document,
      created.listId,
      { name: 'B', description: null },
      ctx(NOW + 5),
    );
    expect(renamed.document.lists[0].name).toBe('B');
    expect(renamed.document.lists[0].description).toBeUndefined();
    expect(renamed.document.lists[0].updatedAt).toBe(NOW + 5);
    expect(renamed.events[0].detail).toEqual({ fields: 'name,description' });
  });

  it('archives and un-archives through the same patch', () => {
    const created = createReadingList(emptyReadingListsDocument(), { name: 'A' }, ctx());
    const archived = updateReadingList(created.document, created.listId, { archived: true }, ctx());
    expect(archived.document.lists[0].archivedAt).toBe(NOW);
    const back = updateReadingList(archived.document, created.listId, { archived: false }, ctx());
    expect(back.document.lists[0].archivedAt).toBeUndefined();
    // Already un-archived: nothing to do, and no revision burned on it.
    expect(updateReadingList(back.document, created.listId, { archived: false }, ctx()).events)
      .toEqual([]);
  });

  it('deletes a list, collects its orphan works, and restores both in place', () => {
    const { document, listId } = listWithMessage();
    const second = createReadingList(document, { name: 'Second' }, ctx(NOW + 1, 'b'));
    expect(second.document.lists.map((list) => list.id)).toEqual([listId, 'rl_b1']);
    expect(second.document.works).toHaveLength(5);

    const deleted = deleteReadingList(second.document, listId, ctx(NOW + 2));
    expect(deleted.document.lists.map((list) => list.id)).toEqual(['rl_b1']);
    // The five works existed only for that list, so they go with it.
    expect(deleted.document.works).toHaveLength(0);
    expect(deleted.removed?.works).toHaveLength(5);
    expect(deleted.events[0]).toEqual({
      at: NOW + 2,
      kind: 'list-deleted',
      listId,
      detail: { entries: 5, name: 'From Kenji' },
    });

    const restored = restoreReadingList(deleted.document, deleted.removed!, 0, ctx(NOW + 3));
    expect(restored.document.lists.map((list) => list.id)).toEqual([listId, 'rl_b1']);
    expect(restored.document.works).toHaveLength(5);
    expect(restored.document.lists[0]).toEqual(second.document.lists[0]);
  });

  it('does not collect a work another list still points at', () => {
    const { document, listId } = listWithMessage();
    const workId = document.lists[0].entries[0].workId;
    const second = createReadingList(document, { name: 'Shared' }, ctx(NOW + 1, 'b'));
    const shared: ReadingListsDocument = {
      ...second.document,
      lists: second.document.lists.map((list) =>
        list.id === second.listId
          ? {
              ...list,
              entries: [
                { id: 're_shared', workId, order: 0, addedAt: NOW, state: 'wanted' as const },
              ],
            }
          : list,
      ),
    };
    const deleted = deleteReadingList(shared, listId, ctx(NOW + 2));
    expect(deleted.document.works.map((work) => work.id)).toEqual([workId]);
    expect(deleted.removed?.works).toHaveLength(4);
  });
});

describe('import', () => {
  it('reuses ONE work record when the same book lands on a second list', () => {
    /*
      §1's stated reason for works living beside the lists: "one work belongs to
      many lists and carries one binding — the cross-list finish in §5.1 is only
      free if there is exactly one record to tick". Minting a second record for
      the same book on a second list breaks P2's binding and P3's fan-out at
      once, and both fail silently on the list that got the copy.
    */
    const context = createReadingListsMutationContext(NOW);
    const message = ['Kino no Tabi', 'コンビニ人間', '夜は短し歩けよ乙女'].join('\n');
    const parsed = parseReadingList(message);

    const first = createReadingList(emptyReadingListsDocument(), { name: 'A' }, context);
    const withFirst = applyReadingListImport(
      first.document,
      first.listId,
      parsed,
      { rawText: message },
      context,
    );
    const second = createReadingList(withFirst.document, { name: 'B' }, context);
    const withSecond = applyReadingListImport(
      second.document,
      second.listId,
      parsed,
      { rawText: message },
      context,
    );

    expect(withSecond.added).toBe(3);
    expect(withSecond.document.works).toHaveLength(3);
    const listA = withSecond.document.lists.find((list) => list.id === first.listId)!;
    const listB = withSecond.document.lists.find((list) => list.id === second.listId)!;
    // Different entries, same works, in the same order.
    expect(listB.entries.map((entry) => entry.id)).not.toEqual(
      listA.entries.map((entry) => entry.id),
    );
    expect(listB.entries.map((entry) => entry.workId)).toEqual(
      listA.entries.map((entry) => entry.workId),
    );
  });

  it('starts an entry owned when its work is already bound to a file', () => {
    // Otherwise the shopping list (§5.2) tells the user to acquire a book that
    // is sitting in their own library, because a later paste re-lists it.
    const context = createReadingListsMutationContext(NOW);
    const message = ['Kino no Tabi', 'コンビニ人間', '夜は短し歩けよ乙女'].join('\n');
    const parsed = parseReadingList(message);
    const first = createReadingList(emptyReadingListsDocument(), { name: 'A' }, context);
    const withFirst = applyReadingListImport(
      first.document,
      first.listId,
      parsed,
      { rawText: message },
      context,
    );
    const bound = {
      ...withFirst.document,
      works: withFirst.document.works.map((work, index) =>
        index === 0 ? { ...work, boundItemIds: ['li_1'], bindConfidence: 1 } : work,
      ),
    };
    const second = createReadingList(bound, { name: 'B' }, context);
    const withSecond = applyReadingListImport(
      second.document,
      second.listId,
      parsed,
      { rawText: message },
      context,
    );
    const listB = withSecond.document.lists.find((list) => list.id === second.listId)!;
    expect(listB.entries.map((entry) => entry.state)).toEqual(['owned', 'wanted', 'wanted']);
  });

  it('turns §2.1 into five wanted entries with provenance and the list URL', () => {
    const { document, listId } = listWithMessage();
    const list = document.lists.find((entry) => entry.id === listId)!;

    expect(list.entries).toHaveLength(5);
    expect(list.entries.every((entry) => entry.state === 'wanted')).toBe(true);
    expect(list.sourceUrl).toBe('https://example.com/list/1234');
    expect(document.works.map((work) => work.titleRaw)).toEqual([
      'Kino no Tabi',
      '君の膵臓をたべたい',
      'コンビニ人間',
      'ハリー・ポッター',
      '夜は短し歩けよ乙女',
    ]);

    expect(list.imports).toHaveLength(1);
    expect(list.imports[0].rawText).toBe(MESSAGE);
    expect(list.imports[0].from).toBe('Kenji, LINE');
    expect(list.imports[0].parserVersion).toBe('1');
    expect(list.imports[0].entryIds).toEqual(list.entries.map((entry) => entry.id));

    // Every entry points back at the line that produced it.
    expect(list.entries.map((entry) => entry.sourceRef?.importId)).toEqual(
      Array(5).fill(list.imports[0].id),
    );
    expect(list.entries.map((entry) => entry.sourceRef?.lineIndex)).toEqual([2, 3, 4, 5, 6]);
    expect(list.entries[0].sourceRef?.rawLine).toBe('1. Kino no Tabi');
    expect(list.entries.map((entry) => entry.order)).toEqual([0, 1, 2, 3, 4]);
  });

  it('skips a work the list already holds rather than duplicating it', () => {
    const { document, listId } = listWithMessage();
    const again = applyReadingListImport(
      document,
      listId,
      parseReadingList(MESSAGE),
      { rawText: MESSAGE },
      ctx(NOW + 10),
    );
    expect(again.added).toBe(0);
    expect(again.skipped).toBe(5);
    expect(again.document.lists[0].entries).toHaveLength(5);
    expect(again.document.works).toHaveLength(5);
    expect(again.events[0].detail).toMatchObject({ added: 0, skipped: 5 });
  });

  it('dedupes on the Japanese title across two differently-worded messages', () => {
    const { document, listId } = listWithMessage();
    const other = '1. コンビニ人間\n2. 新しい本\n3. もう一冊';
    const applied = applyReadingListImport(
      document,
      listId,
      parseReadingList(other),
      { rawText: other },
      ctx(NOW + 10, 'b'),
    );
    // `Convenience Store Woman (コンビニ人間)` already collapsed to コンビニ人間.
    expect(applied.added).toBe(2);
    expect(applied.skipped).toBe(1);
    expect(applied.document.lists[0].entries).toHaveLength(7);
  });

  it('honours the preview dropping a line', () => {
    const context = ctx();
    const created = createReadingList(emptyReadingListsDocument(), { name: 'A' }, context);
    const parsed = parseReadingList(MESSAGE);
    const applied = applyReadingListImport(
      created.document,
      created.listId,
      parsed,
      { rawText: MESSAGE, excludeLineIndexes: [2, 6] },
      context,
    );
    expect(applied.added).toBe(3);
    expect(applied.document.lists[0].entries.map((entry) => entry.sourceRef?.lineIndex))
      .toEqual([3, 4, 5]);
    expect(applied.document.lists[0].imports[0].entryIds).toHaveLength(3);
    // The raw paste is stored whole even though two lines were dropped, which is
    // what makes §2.4's re-parse able to recover them later.
    expect(applied.document.lists[0].imports[0].rawText).toBe(MESSAGE);
  });

  it('does not create an import record for a list that does not exist', () => {
    const document = emptyReadingListsDocument();
    const applied = applyReadingListImport(
      document,
      'nope',
      parseReadingList(MESSAGE),
      { rawText: MESSAGE },
      ctx(),
    );
    expect(applied.document).toBe(document);
    expect(applied.importId).toBeNull();
    expect(applied.events).toEqual([]);
  });

  it('does not overwrite a source URL a first paste already set', () => {
    const { document, listId } = listWithMessage();
    const second = 'https://example.com/other\n1. 本';
    const applied = applyReadingListImport(
      document,
      listId,
      parseReadingList(second),
      { rawText: second },
      ctx(NOW + 1),
    );
    expect(applied.document.lists[0].sourceUrl).toBe('https://example.com/list/1234');
  });
});

describe('entries', () => {
  it('adds a manual entry with its own work', () => {
    const created = createReadingList(emptyReadingListsDocument(), { name: 'A' }, ctx());
    const added = addReadingListEntry(
      created.document,
      created.listId,
      { title: '  夜市  ', author: '恒川光太郎', state: 'owned', note: 'lent by M' },
      ctx(NOW + 1),
    );
    expect(added.entryId).toBe('re_2');
    expect(added.document.works[0]).toEqual({
      id: 'rw_1',
      titleRaw: '夜市',
      authorRaw: '恒川光太郎',
      boundItemIds: [],
      bindConfidence: 0,
    });
    expect(added.document.lists[0].entries[0]).toEqual({
      id: 're_2',
      workId: 'rw_1',
      order: 0,
      addedAt: NOW + 1,
      state: 'owned',
      note: 'lent by M',
    });
    expect(added.events[0]).toMatchObject({ kind: 'entry-added', detail: { manual: true } });
  });

  it('refuses an empty title without touching the document', () => {
    const created = createReadingList(emptyReadingListsDocument(), { name: 'A' }, ctx());
    const added = addReadingListEntry(created.document, created.listId, { title: '   ' }, ctx());
    expect(added.document).toBe(created.document);
    expect(added.entryId).toBeNull();
  });

  it('removes an entry and restores it at the same index with its work', () => {
    const { document, listId } = listWithMessage();
    const target = document.lists[0].entries[2];
    const removed = removeReadingListEntry(document, listId, target.id, ctx(NOW + 1));
    expect(removed.document.lists[0].entries).toHaveLength(4);
    expect(removed.document.works).toHaveLength(4);
    expect(removed.removed).toMatchObject({ listId, index: 2 });
    expect(removed.removed?.works.map((work) => work.id)).toEqual([target.workId]);

    const back = restoreReadingListEntry(removed.document, removed.removed!, ctx(NOW + 2));
    expect(back.document.lists[0].entries.map((entry) => entry.id)).toEqual(
      document.lists[0].entries.map((entry) => entry.id),
    );
    expect(back.document.works).toHaveLength(5);
    expect(back.events[0].detail).toEqual({ restored: true });
  });

  it('restoring twice is a no-op rather than a duplicate', () => {
    const { document, listId } = listWithMessage();
    const target = document.lists[0].entries[0];
    const removed = removeReadingListEntry(document, listId, target.id, ctx(NOW + 1));
    const once = restoreReadingListEntry(removed.document, removed.removed!, ctx(NOW + 2));
    const twice = restoreReadingListEntry(once.document, removed.removed!, ctx(NOW + 3));
    expect(twice.document).toBe(once.document);
    expect(twice.events).toEqual([]);
  });
});

describe('state transitions', () => {
  it('finishing stamps the date, the source and a start it never had', () => {
    const { document, listId } = listWithMessage();
    const entryId = document.lists[0].entries[0].id;
    const finished = setReadingEntryState(document, listId, entryId, 'finished', ctx(NOW + 9));
    const entry = finished.document.lists[0].entries[0];
    expect(entry.state).toBe('finished');
    expect(entry.finishedAt).toBe(NOW + 9);
    expect(entry.finishedBy).toBe('manual');
    expect(entry.startedAt).toBe(NOW + 9);
    expect(finished.events[0]).toMatchObject({
      kind: 'entry-finished',
      detail: { by: 'manual', from: 'wanted' },
    });
  });

  it('un-finishing clears the fields but carries them into the log', () => {
    const { document, listId } = listWithMessage();
    const entryId = document.lists[0].entries[0].id;
    const finished = setReadingEntryState(
      document,
      listId,
      entryId,
      'finished',
      ctx(NOW + 9),
      'reader-auto',
    );
    const undone = setReadingEntryState(finished.document, listId, entryId, 'reading', ctx(NOW + 20));
    const entry = undone.document.lists[0].entries[0];
    expect(entry.state).toBe('reading');
    expect(entry.finishedAt).toBeUndefined();
    expect(entry.finishedBy).toBeUndefined();
    // §4.5 — the finish is not deleted from the log.
    expect(undone.events[0]).toEqual({
      at: NOW + 20,
      kind: 'entry-unfinished',
      listId,
      entryId,
      workId: document.lists[0].entries[0].workId,
      detail: { to: 'reading', finishedAt: NOW + 9, finishedBy: 'reader-auto' },
    });
  });

  it('is a no-op when the state is already what was asked for', () => {
    const { document, listId } = listWithMessage();
    const entryId = document.lists[0].entries[0].id;
    const same = setReadingEntryState(document, listId, entryId, 'wanted', ctx());
    expect(same.document).toBe(document);
    expect(same.events).toEqual([]);
  });

  it('abandoning leaves the entry out of both halves of the progress fraction', () => {
    const { document, listId } = listWithMessage();
    const entries = document.lists[0].entries;
    const one = setReadingEntryState(document, listId, entries[0].id, 'finished', ctx());
    const two = setReadingEntryState(one.document, listId, entries[1].id, 'abandoned', ctx());
    expect(readingListProgress(two.document.lists[0])).toEqual({ finished: 1, total: 4 });
  });
});

describe('cross-list finish (§4.4)', () => {
  function twoLists(): { document: ReadingListsDocument; workId: string } {
    const { document, listId } = listWithMessage();
    const workId = document.lists[0].entries[0].workId;
    const second = createReadingList(document, { name: 'Second' }, ctx(NOW + 1, 'b'));
    const third = createReadingList(second.document, { name: 'Third' }, ctx(NOW + 1, 'c'));
    const withShared: ReadingListsDocument = {
      ...third.document,
      lists: third.document.lists.map((list) => {
        if (list.id === listId) return list;
        return {
          ...list,
          entries: [
            {
              id: `re_${list.id}`,
              workId,
              order: 0,
              addedAt: NOW,
              state: list.name === 'Third' ? ('abandoned' as const) : ('reading' as const),
            },
          ],
        };
      }),
    };
    return { document: withShared, workId };
  }

  it('ticks the work on every list that holds it, in one mutation', () => {
    const { document, workId } = twoLists();
    const result = finishReadingWorkEverywhere(document, workId, ctx(NOW + 30), 'reader-auto');
    expect(result.ticked).toBe(2);
    expect(result.events).toHaveLength(2);
    expect(result.document.lists[0].entries[0].state).toBe('finished');
    expect(result.document.lists[1].entries[0].state).toBe('finished');
    expect(result.document.lists[1].entries[0].finishedBy).toBe('reader-auto');
  });

  it('does NOT resurrect a book abandoned on another list', () => {
    const { document, workId } = twoLists();
    const result = finishReadingWorkEverywhere(document, workId, ctx(NOW + 30));
    const third = result.document.lists.find((list) => list.name === 'Third')!;
    expect(third.entries[0].state).toBe('abandoned');
    expect(third.entries[0].finishedAt).toBeUndefined();
  });

  it('is a no-op for a work nothing points at', () => {
    const { document } = twoLists();
    const result = finishReadingWorkEverywhere(document, 'rw_absent', ctx());
    expect(result.document).toBe(document);
    expect(result.ticked).toBe(0);
  });
});

describe('reorder', () => {
  it('renumbers order to match the ids it was given', () => {
    const { document, listId } = listWithMessage();
    const ids = document.lists[0].entries.map((entry) => entry.id);
    const result = reorderReadingListEntries(
      document,
      listId,
      [ids[4], ids[0], ids[3], ids[1], ids[2]],
      ctx(NOW + 1),
    );
    expect(result.document.lists[0].entries.map((entry) => entry.id)).toEqual([
      ids[4], ids[0], ids[3], ids[1], ids[2],
    ]);
    expect(result.document.lists[0].entries.map((entry) => entry.order)).toEqual([0, 1, 2, 3, 4]);
    expect(result.events[0].detail).toEqual({ reordered: 5 });
  });

  it('keeps ids it was not told about, behind the ones it was', () => {
    const { document, listId } = listWithMessage();
    const ids = document.lists[0].entries.map((entry) => entry.id);
    const result = reorderReadingListEntries(document, listId, [ids[3], ids[1]], ctx(NOW + 1));
    expect(result.document.lists[0].entries.map((entry) => entry.id)).toEqual([
      ids[3], ids[1], ids[0], ids[2], ids[4],
    ]);
  });

  it('is a no-op when the order is already the one requested', () => {
    const { document, listId } = listWithMessage();
    const ids = document.lists[0].entries.map((entry) => entry.id);
    const result = reorderReadingListEntries(document, listId, ids, ctx());
    expect(result.document).toBe(document);
    expect(result.events).toEqual([]);
  });
});

describe('the compare-and-swap retry shape', () => {
  it('re-applying against a document that moved produces both changes, not a rollback', () => {
    const { document, listId } = listWithMessage();
    const entries = document.lists[0].entries;

    // Window A reads revision R and decides to finish entry 0.
    const intentA = (base: ReadingListsDocument) =>
      setReadingEntryState(base, listId, entries[0].id, 'finished', ctx(NOW + 5));

    // Window B, from the same read, removes entry 4 — and wins the race.
    const landedB = removeReadingListEntry(document, listId, entries[4].id, ctx(NOW + 6));

    // A's write is refused; main hands back B's document and A re-applies its
    // intent against THAT rather than re-sending its stale copy.
    const retried = intentA(landedB.document);
    expect(retried.document.lists[0].entries).toHaveLength(4);
    expect(retried.document.lists[0].entries[0].state).toBe('finished');
    expect(retried.document.lists[0].entries.some((entry) => entry.id === entries[4].id))
      .toBe(false);
  });
});

describe('sealing and identity', () => {
  it('survives a normalize round trip unchanged', () => {
    const { document } = listWithMessage();
    const sealed = sealReadingListsDocument(document);
    expect(sealed).toEqual(normalizeReadingListsDocument(JSON.parse(JSON.stringify(document))));
    expect(sealed.lists[0].entries).toHaveLength(5);
  });

  it('folds width, case and spacing but not two genuinely different volumes', () => {
    expect(readingWorkKey({ titleRaw: 'Kino  no Tabi' })).toBe(
      readingWorkKey({ titleRaw: 'KINO NO TABI' }),
    );
    expect(readingWorkKey({ titleRaw: 'ﾊﾘｰ' })).toBe(readingWorkKey({ titleRaw: 'ハリー' }));
    expect(readingWorkKey({ titleRaw: 'A', volume: { from: 1, to: 3 } })).not.toBe(
      readingWorkKey({ titleRaw: 'A', volume: { from: 4, to: 6 } }),
    );
    // The Japanese title wins, which is what makes the EN/JA pairing dedupe work.
    expect(readingWorkKey({ titleRaw: 'Convenience Store Woman', titleJa: 'コンビニ人間' })).toBe(
      readingWorkKey({ titleRaw: 'コンビニ人間' }),
    );
    // The ideographic space is folded by NFKC before the whitespace class runs.
    expect(readingWorkKey({ titleRaw: '夜は　短し' })).toBe(
      readingWorkKey({ titleRaw: '夜は短し' }),
    );
  });

  it('mints unique ids and carries the clock it was given', () => {
    const context = createReadingListsMutationContext(NOW);
    expect(context.now).toBe(NOW);
    const ids = Array.from({ length: 200 }, () => context.mintId('rw'));
    expect(new Set(ids).size).toBe(200);
    expect(ids.every((id) => id.startsWith('rw_'))).toBe(true);
  });
});
