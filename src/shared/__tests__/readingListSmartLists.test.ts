// @vitest-environment node
/**
 * P5 §7 — smart list queries.
 *
 * Built on the mutation layer's own documents rather than hand-written literals
 * wherever the mutation layer can express the state, so a change to what an entry
 * IS fails here instead of silently diverging. The two places it cannot — one
 * work on two lists, and a work bound to an item the library no longer holds —
 * are hand-built and say so.
 *
 * TRAP that cost a previous turn, kept here because this file walks straight into
 * it: `addReadingListEntry` mints a NEW work every call and never reuses one by
 * title (`readingListMutations.ts:761`). Adding "the same book" to two lists that
 * way produces TWO works, and a per-work assertion then reads as the feature
 * being broken when it is the fixture that is wrong.
 */

import { describe, expect, it } from 'vitest';
import {
  ABANDONED_PROGRESS_CEILING,
  ABANDONED_STALE_MS,
  buildSmartListPresetQuery,
  evaluateSmartList,
  evaluateSmartListPreset,
  lastFinishedAuthor,
  smartListFactsFromItem,
  type SmartListContext,
  type SmartListItemFacts,
} from '../readingListSmartLists';
import {
  addReadingListEntry,
  bindReadingWork,
  createReadingList,
  createReadingListsMutationContext,
  saveSmartReadingList,
  sealReadingListsDocument,
  setReadingEntryState,
  updateReadingList,
} from '../readingListMutations';
import {
  emptyReadingListsDocument,
  normalizeReadingListsDocument,
  normalizeSmartListQuery,
  type ReadingEntryState,
  type ReadingListsDocument,
} from '../readingLists';
import type { LevelTier } from '../levelScale';
import type { LibraryItem } from '../types';

const NOW = 1_770_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

/** A document builder with a clock the test owns, so "30 days ago" is exact. */
function builder(start = NOW - 400 * DAY) {
  let clock = start;
  let document = emptyReadingListsDocument();
  const next = () => createReadingListsMutationContext((clock += 1));
  return {
    at(when: number) {
      clock = when;
      return this;
    },
    list(name: string): string {
      const created = createReadingList(document, { name }, next());
      document = created.document;
      const id = created.document.lists[created.document.lists.length - 1]?.id;
      if (!id) throw new Error('createReadingList produced no list');
      return id;
    },
    add(
      listId: string,
      title: string,
      opts: { author?: string; state?: ReadingEntryState } = {},
    ): { entryId: string; workId: string } {
      const added = addReadingListEntry(document, listId, { title, ...opts }, next());
      document = added.document;
      const entryId = added.entryId;
      if (!entryId) throw new Error(`addReadingListEntry refused "${title}"`);
      const workId = document.lists
        .flatMap((list) => list.entries)
        .find((entry) => entry.id === entryId)?.workId;
      if (!workId) throw new Error('entry has no work');
      return { entryId, workId };
    },
    state(listId: string, entryId: string, state: ReadingEntryState, when?: number) {
      if (when != null) clock = when;
      document = setReadingEntryState(document, listId, entryId, state, next()).document;
      return this;
    },
    bind(workId: string, itemId: string, confidence = 0.99) {
      document = bindReadingWork(document, workId, itemId, confidence, next()).document;
      return this;
    },
    done(): ReadingListsDocument {
      return sealReadingListsDocument(document);
    },
  };
}

function facts(
  id: string,
  over: Partial<Omit<SmartListItemFacts, 'id'>> = {},
): SmartListItemFacts {
  return {
    id,
    format: 'book',
    level: null,
    lastReadAt: null,
    percent: 0,
    ...over,
  };
}

function ctx(items: readonly SmartListItemFacts[], now = NOW): SmartListContext {
  return { items, now };
}

const titles = (rows: { title: string }[] | null) => (rows ?? []).map((row) => row.title);

// ── the projection ───────────────────────────────────────────────────────────

describe('smartListFactsFromItem', () => {
  it('reads the L1-L7 level the library already persists, not a new field', () => {
    const item = {
      id: 'it-1',
      title: 'x',
      kind: 'book',
      createdAt: 1,
      lastReadAt: 1234,
      inboxMeta: { levelEstimate: 3 },
      progress: { percent: 0.42 },
    } as unknown as LibraryItem;
    expect(smartListFactsFromItem(item)).toEqual({
      id: 'it-1',
      format: 'book',
      level: 3,
      lastReadAt: 1234,
      percent: 0.42,
    });
  });

  it('falls back to levelMeta, and reports null rather than a sentinel', () => {
    const withFile = { id: 'a', kind: 'manga', levelMeta: { levelEstimate: 6 } } as unknown as LibraryItem;
    const bare = { id: 'b', kind: 'book' } as unknown as LibraryItem;
    expect(smartListFactsFromItem(withFile).level).toBe(6);
    expect(smartListFactsFromItem(withFile).format).toBe('manga');
    // NOT 99. levelSortKey's sink sentinel would read as "harder than L7" here.
    expect(smartListFactsFromItem(bare).level).toBeNull();
    expect(smartListFactsFromItem(bare).percent).toBe(0);
    expect(smartListFactsFromItem(bare).lastReadAt).toBeNull();
  });

  it('clamps a corrupt percent instead of propagating it', () => {
    const wild = { id: 'c', kind: 'book', progress: { percent: 4 } } as unknown as LibraryItem;
    const nan = { id: 'd', kind: 'book', progress: { percent: Number.NaN } } as unknown as LibraryItem;
    expect(smartListFactsFromItem(wild).percent).toBe(1);
    expect(smartListFactsFromItem(nan).percent).toBe(0);
  });
});

// ── difficultyMax, and what an unmeasured book does ──────────────────────────

describe('difficultyMax', () => {
  function levelled() {
    const b = builder();
    const list = b.list('Shelf');
    const easy = b.add(list, 'Easy one', { state: 'owned' });
    const hard = b.add(list, 'Hard one', { state: 'owned' });
    const unknown = b.add(list, 'Unrated one', { state: 'owned' });
    b.bind(easy.workId, 'it-easy');
    b.bind(hard.workId, 'it-hard');
    b.bind(unknown.workId, 'it-unknown');
    return {
      document: b.done(),
      items: [
        facts('it-easy', { level: 2 as LevelTier }),
        facts('it-hard', { level: 6 as LevelTier }),
        facts('it-unknown'),
      ],
    };
  }

  it('caps on the L1-L7 tier and keeps the unmeasured book', () => {
    const { document, items } = levelled();
    const rows = evaluateSmartList(document, { difficultyMax: 4 }, ctx(items));
    expect(titles(rows).sort()).toEqual(['Easy one', 'Unrated one']);
  });

  it('requireKnownDifficulty is the strict reading, and it changes the answer', () => {
    const { document, items } = levelled();
    const rows = evaluateSmartList(
      document,
      { difficultyMax: 4, requireKnownDifficulty: true },
      ctx(items),
    );
    expect(titles(rows)).toEqual(['Easy one']);
  });

  it('a level exactly at the cap is inside the band', () => {
    const { document, items } = levelled();
    expect(titles(evaluateSmartList(document, { difficultyMax: 2 }, ctx(items)))).toContain(
      'Easy one',
    );
    expect(titles(evaluateSmartList(document, { difficultyMax: 1 }, ctx(items)))).not.toContain(
      'Easy one',
    );
  });

  it('sorts easiest first and sinks the unmeasured book to the end', () => {
    const { document, items } = levelled();
    expect(titles(evaluateSmartList(document, {}, ctx(items)))).toEqual([
      'Easy one',
      'Hard one',
      'Unrated one',
    ]);
  });
});

// ── format ───────────────────────────────────────────────────────────────────

describe('format', () => {
  it('reads the bound library kind, and a vndb id outranks it', () => {
    const b = builder();
    const list = b.list('Mixed');
    const novel = b.add(list, 'A novel');
    const comic = b.add(list, 'A comic');
    const vn = b.add(list, 'A visual novel');
    b.bind(novel.workId, 'it-novel');
    b.bind(comic.workId, 'it-comic');
    // A vn's text dump imports as a "book"; the vndb id is what says otherwise.
    b.bind(vn.workId, 'it-vn');
    const document = b.done();
    const withVndb: ReadingListsDocument = {
      ...document,
      works: document.works.map((work) =>
        work.id === vn.workId ? { ...work, externalIds: { vndb: 'v123' } } : work,
      ),
    };
    const items = [
      facts('it-novel', { format: 'book' }),
      facts('it-comic', { format: 'manga' }),
      facts('it-vn', { format: 'book' }),
    ];
    expect(titles(evaluateSmartList(withVndb, { format: ['manga'] }, ctx(items)))).toEqual([
      'A comic',
    ]);
    expect(titles(evaluateSmartList(withVndb, { format: ['vn'] }, ctx(items)))).toEqual([
      'A visual novel',
    ]);
    expect(titles(evaluateSmartList(withVndb, { format: ['book'] }, ctx(items)))).toEqual([
      'A novel',
    ]);
  });

  it('an unbound work has no format and cannot satisfy a format filter', () => {
    const b = builder();
    const list = b.list('Wanted');
    b.add(list, 'Never acquired');
    const document = b.done();
    expect(evaluateSmartList(document, { format: ['book'] }, ctx([]))).toEqual([]);
    expect(evaluateSmartList(document, {}, ctx([]))[0]?.format).toBeNull();
  });
});

// ── ownedOnly ────────────────────────────────────────────────────────────────

describe('ownedOnly', () => {
  it('asks whether the library still HOLDS the file, not whether an id was recorded', () => {
    const b = builder();
    const list = b.list('Shelf');
    const held = b.add(list, 'Still here', { state: 'owned' });
    const gone = b.add(list, 'Deleted since', { state: 'owned' });
    b.bind(held.workId, 'it-held');
    b.bind(gone.workId, 'it-gone');
    const document = b.done();
    // `boundItemIds` survives the file being deleted, so both works look bound.
    expect(document.works.every((work) => work.boundItemIds.length === 1)).toBe(true);
    const rows = evaluateSmartList(document, { ownedOnly: true }, ctx([facts('it-held')]));
    expect(titles(rows)).toEqual(['Still here']);
  });
});

// ── state, across several lists ──────────────────────────────────────────────

describe('effective state', () => {
  /**
   * Hand-built: `addReadingListEntry` cannot put ONE work on two lists (it mints
   * a new work per call), and this is the exact shape §4's fan-out produces.
   */
  function onTwoLists(states: [ReadingEntryState, ReadingEntryState]): ReadingListsDocument {
    return {
      schemaVersion: 1,
      revision: 4,
      works: [
        {
          id: 'w-1',
          titleRaw: 'Shared book',
          authorRaw: 'Author A',
          boundItemIds: ['it-1'],
          bindConfidence: 0.99,
        },
      ],
      lists: [
        {
          id: 'l-a',
          name: 'A',
          kind: 'pool',
          createdAt: 1,
          updatedAt: 1,
          entries: [
            { id: 'e-a', workId: 'w-1', order: 0, addedAt: 1, state: states[0] },
          ],
          imports: [],
        },
        {
          id: 'l-b',
          name: 'B',
          kind: 'pool',
          createdAt: 1,
          updatedAt: 1,
          entries: [
            { id: 'e-b', workId: 'w-1', order: 0, addedAt: 1, state: states[1] },
          ],
          imports: [],
        },
      ],
    };
  }

  it('reports one row per work, not one per entry', () => {
    const rows = evaluateSmartList(onTwoLists(['wanted', 'wanted']), {}, ctx([facts('it-1')]));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.onListIds.sort()).toEqual(['l-a', 'l-b']);
  });

  it('takes the most advanced state and points at that entry', () => {
    const rows = evaluateSmartList(onTwoLists(['wanted', 'finished']), {}, ctx([facts('it-1')]));
    expect(rows[0]?.state).toBe('finished');
    expect(rows[0]?.entryId).toBe('e-b');
    expect(rows[0]?.listId).toBe('l-b');
    // ... and the disagreeing list cannot make it answer a `wanted` query.
    expect(evaluateSmartList(onTwoLists(['wanted', 'finished']), { state: ['wanted'] }, ctx([]))).toEqual(
      [],
    );
  });

  it('takes the EARLIEST start, so re-adding a book does not reset its age', () => {
    const document = onTwoLists(['reading', 'reading']);
    const withStarts: ReadingListsDocument = {
      ...document,
      lists: document.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry) => ({
          ...entry,
          // Filed on list A a year ago, re-added to list B yesterday.
          startedAt: list.id === 'l-a' ? NOW - 300 * DAY : NOW - DAY,
        })),
      })),
    };
    const items = [facts('it-1')];
    // A cutoff between the two: only the earliest reading can satisfy it.
    const rows = evaluateSmartList(withStarts, { startedBefore: NOW - 100 * DAY }, ctx(items));
    expect(titles(rows)).toEqual(['Shared book']);
  });

  it('notOnList drops a work filed anywhere in the excluded set', () => {
    const document = onTwoLists(['owned', 'owned']);
    expect(evaluateSmartList(document, { notOnList: ['l-b'] }, ctx([facts('it-1')]))).toEqual([]);
    expect(evaluateSmartList(document, { notOnList: ['l-z'] }, ctx([facts('it-1')]))).toHaveLength(1);
  });

  it('authorIs compares through the shared title normaliser', () => {
    const document = onTwoLists(['owned', 'owned']);
    expect(titles(evaluateSmartList(document, { authorIs: '  AUTHOR   a ' }, ctx([])))).toEqual([
      'Shared book',
    ]);
    expect(evaluateSmartList(document, { authorIs: 'Author B' }, ctx([]))).toEqual([]);
  });
});

// ── the three presets ────────────────────────────────────────────────────────

describe('Abandoned preset', () => {
  /** Started 200 days ago, so `startedBefore` is satisfied for every variant. */
  function stale(itemFacts: Partial<Omit<SmartListItemFacts, 'id'>>) {
    const b = builder();
    const list = b.list('Reading');
    const entry = b.add(list, 'Put down', { state: 'wanted' });
    b.bind(entry.workId, 'it-1');
    b.state(list, entry.entryId, 'reading', NOW - 200 * DAY);
    return {
      document: b.done(),
      items: [facts('it-1', itemFacts)],
    };
  }

  it('finds a book started long ago, barely read, untouched for a month', () => {
    const { document, items } = stale({ percent: 0.3, lastReadAt: NOW - 90 * DAY });
    expect(titles(evaluateSmartListPreset('abandoned', document, ctx(items)))).toEqual([
      'Put down',
    ]);
  });

  it('NEGATIVE CONTROL — read this week is not abandoned', () => {
    const { document, items } = stale({ percent: 0.3, lastReadAt: NOW - 2 * DAY });
    expect(evaluateSmartListPreset('abandoned', document, ctx(items))).toEqual([]);
  });

  it('NEGATIVE CONTROL — 95% through is nearly finished, not abandoned', () => {
    const { document, items } = stale({ percent: 0.95, lastReadAt: NOW - 90 * DAY });
    expect(evaluateSmartListPreset('abandoned', document, ctx(items))).toEqual([]);
    // and the boundary is the documented one
    const at = stale({ percent: ABANDONED_PROGRESS_CEILING, lastReadAt: NOW - 90 * DAY });
    expect(evaluateSmartListPreset('abandoned', at.document, ctx(at.items))).toEqual([]);
  });

  it('NEGATIVE CONTROL — started yesterday is not stale, however little was read', () => {
    const b = builder();
    const list = b.list('Reading');
    const entry = b.add(list, 'Just begun', { state: 'wanted' });
    b.bind(entry.workId, 'it-1');
    b.state(list, entry.entryId, 'reading', NOW - DAY);
    const items = [facts('it-1', { percent: 0.02, lastReadAt: NOW - DAY })];
    expect(evaluateSmartListPreset('abandoned', b.done(), ctx(items))).toEqual([]);
  });

  it('NEGATIVE CONTROL — a finished book is never abandoned', () => {
    const { document, items } = stale({ percent: 0.3, lastReadAt: NOW - 90 * DAY });
    const finished: ReadingListsDocument = {
      ...document,
      lists: document.lists.map((list) => ({
        ...list,
        entries: list.entries.map((entry) => ({
          ...entry,
          state: 'finished' as const,
          finishedAt: NOW - 90 * DAY,
        })),
      })),
    };
    expect(evaluateSmartListPreset('abandoned', finished, ctx(items))).toEqual([]);
  });

  it('a book never opened here counts as untouched rather than as recent', () => {
    const { document, items } = stale({ percent: 0, lastReadAt: null });
    expect(titles(evaluateSmartListPreset('abandoned', document, ctx(items)))).toEqual(['Put down']);
  });

  it('uses the documented 30-day window, both sides of it', () => {
    const inside = stale({ percent: 0.1, lastReadAt: NOW - ABANDONED_STALE_MS - 1 });
    const outside = stale({ percent: 0.1, lastReadAt: NOW - ABANDONED_STALE_MS + DAY });
    expect(evaluateSmartListPreset('abandoned', inside.document, ctx(inside.items))).toHaveLength(1);
    expect(evaluateSmartListPreset('abandoned', outside.document, ctx(outside.items))).toEqual([]);
  });
});

describe('Ready to read preset', () => {
  function shelf() {
    const b = builder();
    const list = b.list('Shelf');
    const ready = b.add(list, 'Ready', { state: 'owned' });
    const tooHard = b.add(list, 'Too hard', { state: 'owned' });
    const opened = b.add(list, 'Already open', { state: 'owned' });
    const unowned = b.add(list, 'Not acquired', { state: 'wanted' });
    b.bind(ready.workId, 'it-ready');
    b.bind(tooHard.workId, 'it-hard');
    b.bind(opened.workId, 'it-open');
    void unowned;
    return {
      document: b.done(),
      items: [
        facts('it-ready', { level: 3 as LevelTier }),
        facts('it-hard', { level: 7 as LevelTier }),
        facts('it-open', { level: 2 as LevelTier, percent: 0.5 }),
      ],
    };
  }

  it('is owned, unstarted and inside the band — all three', () => {
    const { document, items } = shelf();
    expect(titles(evaluateSmartListPreset('ready-to-read', document, ctx(items)))).toEqual([
      'Ready',
    ]);
  });

  it('honours a caller-chosen band', () => {
    const { document, items } = shelf();
    const wide = evaluateSmartListPreset('ready-to-read', document, ctx(items), {
      difficultyMax: 7,
    });
    expect(titles(wide).sort()).toEqual(['Ready', 'Too hard']);
  });
});

describe('Author sweep preset', () => {
  it('is null — not empty — when nothing has been finished', () => {
    const b = builder();
    const list = b.list('Shelf');
    b.add(list, 'Unread', { state: 'owned' });
    const document = b.done();
    expect(lastFinishedAuthor(document)).toBe('');
    expect(buildSmartListPresetQuery('author-sweep', document, ctx([]))).toBeNull();
    expect(evaluateSmartListPreset('author-sweep', document, ctx([]))).toBeNull();
  });

  it('sweeps the author of the LAST finish, and leaves that finish out', () => {
    const b = builder();
    const list = b.list('Shelf');
    const early = b.add(list, 'Old finish', { author: 'Author A', state: 'owned' });
    const late = b.add(list, 'Recent finish', { author: 'Author B', state: 'owned' });
    const same = b.add(list, 'Also by B', { author: 'author  b', state: 'owned' });
    const other = b.add(list, 'By someone else', { author: 'Author C', state: 'owned' });
    b.bind(early.workId, 'it-1');
    b.bind(late.workId, 'it-2');
    b.bind(same.workId, 'it-3');
    b.bind(other.workId, 'it-4');
    b.state(list, early.entryId, 'finished', NOW - 100 * DAY);
    b.state(list, late.entryId, 'finished', NOW - 10 * DAY);
    const document = b.done();
    const items = ['it-1', 'it-2', 'it-3', 'it-4'].map((id) => facts(id));
    expect(lastFinishedAuthor(document)).toBe('Author B');
    // Only the unfinished one by B survives: the sweep is what is LEFT.
    expect(titles(evaluateSmartListPreset('author-sweep', document, ctx(items)))).toEqual([
      'Also by B',
    ]);
  });

  it('skips an unattributed finish rather than reporting a blank author', () => {
    const b = builder();
    const list = b.list('Shelf');
    const named = b.add(list, 'Named', { author: 'Author A', state: 'owned' });
    const anon = b.add(list, 'No author', { state: 'owned' });
    const more = b.add(list, 'More by A', { author: 'Author A', state: 'owned' });
    b.bind(named.workId, 'it-1');
    b.bind(anon.workId, 'it-2');
    b.bind(more.workId, 'it-3');
    b.state(list, named.entryId, 'finished', NOW - 50 * DAY);
    // The most RECENT finish carries no author — it must not win the tie-break.
    b.state(list, anon.entryId, 'finished', NOW - DAY);
    const document = b.done();
    const items = ['it-1', 'it-2', 'it-3'].map((id) => facts(id));
    expect(lastFinishedAuthor(document)).toBe('Author A');
    expect(titles(evaluateSmartListPreset('author-sweep', document, ctx(items)))).toEqual([
      'More by A',
    ]);
  });
});

// ── §7's saved half: a smart list that survives a reload ─────────────────────

describe('the saved query', () => {
  const QUERY = {
    state: ['owned'] as const,
    ownedOnly: true,
    difficultyMax: 3,
    format: ['book'] as const,
  };

  it('saveSmartReadingList makes a smart list that carries its query and no entries', () => {
    const saved = saveSmartReadingList(
      emptyReadingListsDocument(),
      { name: 'Easy shelf', query: QUERY },
      createReadingListsMutationContext(NOW),
    );
    const list = saved.document.lists[0];
    expect(saved.listId).toBe(list?.id);
    expect(list?.kind).toBe('smart');
    expect(list?.query).toEqual(QUERY);
    // A stored snapshot would be a second answer to "what is on it".
    expect(list?.entries).toEqual([]);
    // The event says the shape, never the user's own words.
    expect(saved.events[0]?.detail).toEqual({ kind: 'smart', terms: 4 });
  });

  it('refuses a blank name and a query that means nothing', () => {
    const blank = saveSmartReadingList(
      emptyReadingListsDocument(),
      { name: '   ', query: QUERY },
      createReadingListsMutationContext(NOW),
    );
    expect(blank.listId).toBeNull();
    expect(blank.document.lists).toEqual([]);

    // `{}` matches the whole library, which is not a question anyone asked.
    const empty = saveSmartReadingList(
      emptyReadingListsDocument(),
      { name: 'Everything', query: {} },
      createReadingListsMutationContext(NOW),
    );
    expect(empty.listId).toBeNull();
    expect(empty.document.lists).toEqual([]);
  });

  it('round-trips through the normaliser byte for byte', () => {
    const saved = saveSmartReadingList(
      emptyReadingListsDocument(),
      { name: 'Easy shelf', query: QUERY },
      createReadingListsMutationContext(NOW),
    );
    const reloaded = normalizeReadingListsDocument(JSON.parse(JSON.stringify(saved.document)));
    expect(reloaded.lists[0]?.query).toEqual(QUERY);
    // And the evaluator reads the SAVED query, not a rebuilt one.
    const b = builder();
    const listId = b.list('Shelf');
    const easy = b.add(listId, 'Easy', { state: 'owned' });
    const hard = b.add(listId, 'Hard', { state: 'owned' });
    b.bind(easy.workId, 'it-easy');
    b.bind(hard.workId, 'it-hard');
    const items = [
      facts('it-easy', { level: 2 as LevelTier }),
      facts('it-hard', { level: 6 as LevelTier }),
    ];
    const query = reloaded.lists[0]?.query;
    expect(query).toBeDefined();
    expect(titles(evaluateSmartList(b.done(), query!, ctx(items)))).toEqual(['Easy']);
  });

  it('drops a term it cannot evaluate rather than carrying it through', () => {
    // A future release adds a format; this one must widen, not return nothing.
    const repaired = normalizeSmartListQuery({
      format: ['book', 'audiobook', 'manga', 'book'],
      state: ['owned', 'borrowed'],
      difficultyMax: 40,
      progressBelow: 9,
      notOnList: ['l-1', '', 'l-1'],
      authorIs: '  ',
      ownedOnly: 'yes',
    });
    expect(repaired).toEqual({
      format: ['book', 'manga'],
      state: ['owned'],
      difficultyMax: 7,
      progressBelow: 1,
      notOnList: ['l-1'],
    });
  });

  it('an array that empties out is removed, not left as []', () => {
    // `state: []` and no `state` mean the same thing to the evaluator, and only
    // one of them survives a round trip.
    expect(normalizeSmartListQuery({ state: ['nonsense'], ownedOnly: true })).toEqual({
      ownedOnly: true,
    });
    expect(normalizeSmartListQuery({ state: ['nonsense'] })).toBeUndefined();
    expect(normalizeSmartListQuery(null)).toBeUndefined();
    expect(normalizeSmartListQuery('pool')).toBeUndefined();
  });

  it('a query on a non-smart list is dropped on load, not stored and ignored', () => {
    const reloaded = normalizeReadingListsDocument({
      schemaVersion: 1,
      revision: 1,
      works: [],
      lists: [
        { id: 'l-1', name: 'Pool', kind: 'pool', createdAt: 1, updatedAt: 1, query: QUERY },
        { id: 'l-2', name: 'Smart', kind: 'smart', createdAt: 1, updatedAt: 1, query: QUERY },
      ],
    });
    expect(reloaded.lists[0]?.query).toBeUndefined();
    expect(reloaded.lists[1]?.query).toEqual(QUERY);
  });

  it('updateReadingList saving a query makes the list smart, and clearing it is possible', () => {
    const created = createReadingList(
      emptyReadingListsDocument(),
      { name: 'Shelf' },
      createReadingListsMutationContext(NOW),
    );
    const listId = created.listId;
    const smart = updateReadingList(
      created.document,
      listId,
      { query: QUERY },
      createReadingListsMutationContext(NOW + 1),
    );
    expect(smart.document.lists[0]?.kind).toBe('smart');
    expect(smart.document.lists[0]?.query).toEqual(QUERY);

    const cleared = updateReadingList(
      smart.document,
      listId,
      { query: null },
      createReadingListsMutationContext(NOW + 2),
    );
    expect(cleared.document.lists[0]?.query).toBeUndefined();
  });

  it('a list that stops being smart loses its query in the same mutation', () => {
    // Otherwise the in-memory document keeps a filter nothing evaluates while
    // the reloaded one has already stripped it — the same list, two shapes.
    const saved = saveSmartReadingList(
      emptyReadingListsDocument(),
      { name: 'Easy shelf', query: QUERY },
      createReadingListsMutationContext(NOW),
    );
    const listId = saved.listId;
    expect(listId).not.toBeNull();
    const demoted = updateReadingList(
      saved.document,
      listId!,
      { kind: 'pool' },
      createReadingListsMutationContext(NOW + 1),
    );
    expect(demoted.document.lists[0]?.kind).toBe('pool');
    expect(demoted.document.lists[0]?.query).toBeUndefined();
    expect(normalizeReadingListsDocument(demoted.document).lists[0]?.query).toBeUndefined();
  });
});

// ── an empty document is a real answer, not a throw ──────────────────────────

describe('degenerate documents', () => {
  it('answers empty for an empty document and for an orphaned entry', () => {
    expect(evaluateSmartList(emptyReadingListsDocument(), {}, ctx([]))).toEqual([]);
    const orphan: ReadingListsDocument = {
      schemaVersion: 1,
      revision: 1,
      works: [],
      lists: [
        {
          id: 'l-1',
          name: 'Broken',
          kind: 'pool',
          createdAt: 1,
          updatedAt: 1,
          entries: [{ id: 'e-1', workId: 'missing', order: 0, addedAt: 1, state: 'wanted' }],
          imports: [],
        },
      ],
    };
    expect(evaluateSmartList(orphan, {}, ctx([]))).toEqual([]);
  });
});
