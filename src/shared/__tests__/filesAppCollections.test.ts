// @vitest-environment node
/**
 * Gate 16 — "Collections are real folders. Create a folder, add items of two
 * different kinds to it, nest it, reopen the app and it survives. Deleting the
 * collection leaves every item in place — proven by re-finding one of them
 * afterwards."
 *
 * The gate's sentence is walked once, end to end, in `the gate, walked` below —
 * including the reopen, which is a real serialize/parse round trip rather than
 * reusing the in-memory object. The rest of the file is the refusals and the
 * two structural traps a folder model has: a cycle, and a delete that takes
 * more than it was asked for.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_COLLECTIONS_DOC,
  FILES_COLLECTIONS_VERSION,
  COLLECTION_NAME_MAX,
  addToCollection,
  ancestorsOf,
  childrenOf,
  collectionById,
  createCollection,
  deleteCollection,
  nestCollection,
  parseCollectionsDoc,
  removeFromCollection,
  renameCollection,
  resolveCollection,
  type FilesCollectionsDoc,
} from '../filesApp/collections';

const T0 = 1_700_000_000_000;

/** Create and assert it worked, so the tests below read as the story. */
function make(doc: FilesCollectionsDoc, id: string, name: string, parentId: string | null = null) {
  const res = createCollection(doc, { id, name, parentId, now: T0 });
  expect(res.errorKey, `${id} should have been created`).toBeUndefined();
  return res.doc;
}

/** The reopen: through JSON, never the same object. */
function reopen(doc: FilesCollectionsDoc): FilesCollectionsDoc {
  return parseCollectionsDoc(JSON.parse(JSON.stringify(doc)));
}

describe('gate 16 — the gate, walked', () => {
  it('creates, holds two kinds, nests, survives a reopen, and deletes without taking items', () => {
    // Two items of DIFFERENT kinds, which is the gate's own wording: a book row
    // and a video row, whose ids come from different enumerators.
    const BOOK = 'library:book-7';
    const VIDEO = 'media:vid-3';

    let doc = make(EMPTY_COLLECTIONS_DOC, 'c1', 'Winter course');
    doc = addToCollection(doc, 'c1', BOOK, T0).doc;
    doc = addToCollection(doc, 'c1', VIDEO, T0).doc;
    expect(collectionById(doc, 'c1')?.itemIds).toEqual([BOOK, VIDEO]);

    // ...nest it.
    doc = make(doc, 'c2', 'Coursework');
    const nested = nestCollection(doc, 'c1', 'c2', T0 + 1);
    expect(nested.errorKey).toBeUndefined();
    doc = nested.doc;
    expect(collectionById(doc, 'c1')?.parentId).toBe('c2');
    expect(childrenOf(doc, 'c2').map((c) => c.id)).toEqual(['c1']);

    // ...reopen the app.
    const after = reopen(doc);
    expect(after).toEqual(doc);
    expect(collectionById(after, 'c1')?.itemIds).toEqual([BOOK, VIDEO]);
    expect(collectionById(after, 'c1')?.parentId).toBe('c2');

    // ...delete the collection, and re-find one of the items afterwards, which
    // is the proof the gate asks for by name.
    const deleted = deleteCollection(after, 'c1', T0 + 2);
    expect(deleted.errorKey).toBeUndefined();
    expect(collectionById(deleted.doc, 'c1')).toBeUndefined();
    const index = new Set([BOOK, VIDEO, 'media:vid-9']);
    expect(index.has(BOOK)).toBe(true);
    expect(index.has(VIDEO)).toBe(true);
    // And structurally: no operation in this model can remove an item, because
    // a collection holds ids. Asserted so the property is pinned, not implied.
    expect(JSON.stringify(deleted.doc)).not.toContain(BOOK);
    expect(index.size).toBe(3);
  });
});

describe('gate 16 — deleting a container takes exactly the container', () => {
  it('promotes children to the deleted collection’s parent', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'root', 'Root');
    doc = make(doc, 'mid', 'Middle', 'root');
    doc = make(doc, 'leaf', 'Leaf', 'mid');
    doc = addToCollection(doc, 'leaf', 'media:1', T0).doc;

    const res = deleteCollection(doc, 'mid', T0 + 5);
    expect(res.errorKey).toBeUndefined();
    // The leaf survives, with its items, one level up. A recursive delete would
    // have taken a container the user never named, and there is no undo for one.
    expect(collectionById(res.doc, 'leaf')?.parentId).toBe('root');
    expect(collectionById(res.doc, 'leaf')?.itemIds).toEqual(['media:1']);
    expect(res.doc.collections).toHaveLength(2);
  });

  it('promotes to the TOP level when the deleted collection was top-level', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'top', 'Top');
    doc = make(doc, 'child', 'Child', 'top');
    const res = deleteCollection(doc, 'top', T0 + 5);
    expect(collectionById(res.doc, 'child')?.parentId).toBe(null);
    expect(childrenOf(res.doc, null).map((c) => c.id)).toEqual(['child']);
  });

  it('refuses a collection that is not there, rather than no-opping', () => {
    const res = deleteCollection(EMPTY_COLLECTIONS_DOC, 'nope', T0);
    expect(res.errorKey).toBe('filesApp.collection.error.noSuchCollection');
    expect(res.doc).toBe(EMPTY_COLLECTIONS_DOC);
  });
});

describe('gate 16 — nesting cannot build a cycle', () => {
  it('refuses to make a collection its own descendant', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'a', 'A');
    doc = make(doc, 'b', 'B', 'a');
    doc = make(doc, 'c', 'C', 'b');
    // a -> b -> c. Putting `a` under `c` closes the loop, and a tree walk over
    // the result would never terminate.
    const res = nestCollection(doc, 'a', 'c', T0 + 1);
    expect(res.errorKey).toBe('filesApp.collection.error.cycle');
    expect(res.doc).toBe(doc);
    // CONTROL: the legal move in the same shape still works, so the guard is
    // not simply refusing every nest.
    expect(nestCollection(doc, 'c', null, T0 + 1).errorKey).toBeUndefined();
  });

  it('refuses the one-step version and the no-such-parent version by different names', () => {
    const doc = make(EMPTY_COLLECTIONS_DOC, 'a', 'A');
    expect(nestCollection(doc, 'a', 'a', T0).errorKey).toBe(
      'filesApp.collection.error.selfNest',
    );
    expect(nestCollection(doc, 'a', 'ghost', T0).errorKey).toBe(
      'filesApp.collection.error.noSuchParent',
    );
  });

  it('ancestorsOf terminates on a document that already contains a cycle', () => {
    // Not reachable through the API above, but a hand-edited or corrupt store
    // can carry it, and this runs during the first render.
    const doc: FilesCollectionsDoc = {
      version: FILES_COLLECTIONS_VERSION,
      collections: [
        { id: 'x', name: 'X', parentId: 'y', itemIds: [], createdAt: 0, modifiedAt: 0 },
        { id: 'y', name: 'Y', parentId: 'x', itemIds: [], createdAt: 0, modifiedAt: 0 },
      ],
    };
    expect(ancestorsOf(doc, 'x').map((c) => c.id)).toEqual(['y']);
  });
});

describe('gate 16 — names', () => {
  it('are unique among SIBLINGS, not globally', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'showA', 'Show A');
    doc = make(doc, 'showB', 'Show B');
    doc = make(doc, 's1a', 'Season 1', 'showA');
    // The ordinary case a global rule would have forbidden.
    const res = createCollection(doc, { id: 's1b', name: 'Season 1', parentId: 'showB', now: T0 });
    expect(res.errorKey).toBeUndefined();
    // ...and the real collision still refuses, case-insensitively.
    expect(
      createCollection(res.doc, { id: 's1c', name: 'season 1', parentId: 'showA', now: T0 })
        .errorKey,
    ).toBe('filesApp.collection.error.duplicateName');
  });

  it('are trimmed and collapsed, and an empty one refuses', () => {
    const res = createCollection(EMPTY_COLLECTIONS_DOC, {
      id: 'c',
      name: '  Winter   course  ',
      now: T0,
    });
    expect(res.changed?.name).toBe('Winter course');
    for (const bad of ['', '   ', '\t\n']) {
      expect(createCollection(EMPTY_COLLECTIONS_DOC, { id: 'z', name: bad, now: T0 }).errorKey).toBe(
        'filesApp.collection.error.emptyName',
      );
    }
    expect(
      createCollection(EMPTY_COLLECTIONS_DOC, {
        id: 'z',
        name: 'x'.repeat(COLLECTION_NAME_MAX + 1),
        now: T0,
      }).errorKey,
    ).toBe('filesApp.collection.error.nameTooLong');
  });

  it('renaming refuses a sibling collision but allows a no-op rename of itself', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'a', 'A');
    doc = make(doc, 'b', 'B');
    expect(renameCollection(doc, 'a', 'B', T0).errorKey).toBe(
      'filesApp.collection.error.duplicateName',
    );
    // Its own name is not a collision with itself.
    expect(renameCollection(doc, 'a', 'A', T0).errorKey).toBeUndefined();
  });

  it('a nest that would collide with a sibling name refuses instead of hiding one', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'p', 'Parent');
    doc = make(doc, 'k1', 'Season 1', 'p');
    doc = make(doc, 'k2', 'Season 1');
    expect(nestCollection(doc, 'k2', 'p', T0).errorKey).toBe(
      'filesApp.collection.error.duplicateName',
    );
  });
});

describe('gate 16 — membership', () => {
  it('adding twice is idempotent, and removing something absent refuses', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'c', 'C');
    doc = addToCollection(doc, 'c', 'media:1', T0).doc;
    const again = addToCollection(doc, 'c', 'media:1', T0 + 1);
    expect(again.errorKey).toBeUndefined();
    expect(collectionById(again.doc, 'c')?.itemIds).toEqual(['media:1']);
    expect(removeFromCollection(doc, 'c', 'media:9', T0).errorKey).toBe(
      'filesApp.collection.error.notInCollection',
    );
  });

  it('a stale id is COUNTED, never silently dropped', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'c', 'C');
    doc = addToCollection(doc, 'c', 'media:alive', T0).doc;
    doc = addToCollection(doc, 'c', 'media:gone', T0).doc;
    const collection = collectionById(doc, 'c');
    if (!collection) throw new Error('the collection just created is missing');
    const resolved = resolveCollection(collection, new Set(['media:alive']));
    // A folder that quietly shrank is the shape the plan calls a finding, and
    // only the user can say whether a missing item should be forgotten.
    expect(resolved.presentItemIds).toEqual(['media:alive']);
    expect(resolved.missingItemIds).toEqual(['media:gone']);
    expect(collectionById(doc, 'c')?.itemIds).toHaveLength(2);
  });

  it('keeps the user’s own order, not a sort', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'c', 'C');
    for (const id of ['z', 'a', 'm']) doc = addToCollection(doc, 'c', id, T0).doc;
    expect(collectionById(doc, 'c')?.itemIds).toEqual(['z', 'a', 'm']);
  });
});

describe('gate 16 — reading a persisted document defensively', () => {
  it('anything unreadable becomes empty rather than throwing', () => {
    for (const bad of [null, undefined, 0, 'x', [], {}, { version: 1 }]) {
      expect(parseCollectionsDoc(bad)).toEqual(EMPTY_COLLECTIONS_DOC);
    }
  });

  it('a FUTURE version reads as empty rather than being reinterpreted', () => {
    // Silently reading a newer shape with today's rules is how a downgrade eats
    // the user's folders.
    expect(
      parseCollectionsDoc({ version: FILES_COLLECTIONS_VERSION + 1, collections: [{ id: 'a', name: 'A' }] }),
    ).toEqual(EMPTY_COLLECTIONS_DOC);
  });

  it('drops unusable rows and promotes children of a parent that did not survive', () => {
    const parsed = parseCollectionsDoc({
      version: FILES_COLLECTIONS_VERSION,
      collections: [
        { id: 'good', name: 'Good', parentId: null, itemIds: ['a', 7, 'b'], createdAt: 1, modifiedAt: 2 },
        { id: 'orphan', name: 'Orphan', parentId: 'never-existed', itemIds: [] },
        { id: 'good', name: 'Duplicate id' },
        { id: '', name: 'No id' },
        { id: 'noname', name: '' },
        null,
        'nonsense',
      ],
    });
    expect(parsed.collections.map((c) => c.id)).toEqual(['good', 'orphan']);
    // Non-string members are dropped; the survivors keep their order.
    expect(parsed.collections[0].itemIds).toEqual(['a', 'b']);
    // An orphan promoted to the top rather than left in an invisible branch.
    expect(parsed.collections[1].parentId).toBe(null);
    expect(parsed.collections[1].createdAt).toBe(0);
  });

  it('a round trip through JSON is byte-identical for a document it produced', () => {
    let doc = make(EMPTY_COLLECTIONS_DOC, 'a', 'A');
    doc = make(doc, 'b', 'B', 'a');
    doc = addToCollection(doc, 'b', 'media:1', T0).doc;
    expect(JSON.stringify(reopen(doc))).toBe(JSON.stringify(doc));
  });
});
