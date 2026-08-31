// @vitest-environment jsdom
/**
 * Gate 16/2 — the persistence half.
 *
 * The gate's load-bearing clause is "reopen the app and it survives", so every
 * test here that claims survival re-reads through a fresh `loadCollectionsDoc`
 * after clearing the in-memory fallback. Reading back the value the same call
 * just cached would pass on a store that never wrote anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FILES_COLLECTIONS_STORAGE_KEY,
  commitCollections,
  loadCollectionsDoc,
  newCollectionId,
  onCollectionsChanged,
  resetCollectionsMemoryForTests,
  saveCollectionsDoc,
} from '../filesCollectionsStore';
import {
  EMPTY_COLLECTIONS_DOC,
  FILES_COLLECTIONS_VERSION,
  addToCollection,
  collectionById,
  createCollection,
  deleteCollection,
} from '../../shared/filesApp/collections';

/** A restart, as far as this module can see one: disk survives, memory does not. */
function restart(): void {
  resetCollectionsMemoryForTests();
}

beforeEach(() => {
  localStorage.clear();
  resetCollectionsMemoryForTests();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('filesCollectionsStore — reading', () => {
  it('an untouched profile reads as the empty document, not as an error', () => {
    expect(loadCollectionsDoc()).toEqual(EMPTY_COLLECTIONS_DOC);
  });

  it('malformed JSON reads as empty instead of taking the window down', () => {
    localStorage.setItem(FILES_COLLECTIONS_STORAGE_KEY, '{not json');
    expect(loadCollectionsDoc().collections).toHaveLength(0);
  });

  it('a FUTURE version reads as empty — a downgrade must not reinterpret it', () => {
    localStorage.setItem(
      FILES_COLLECTIONS_STORAGE_KEY,
      JSON.stringify({ version: FILES_COLLECTIONS_VERSION + 1, collections: [{ id: 'a', name: 'A' }] }),
    );
    expect(loadCollectionsDoc().collections).toHaveLength(0);
  });
});

describe('filesCollectionsStore — gate 16: it survives a restart', () => {
  it('a folder created in one session is there in the next', () => {
    const commit = commitCollections((doc) =>
      createCollection(doc, { name: 'Season 1', id: 'c1', now: 10 }),
    );
    expect(commit.errorKey).toBeUndefined();
    expect(commit.storageErrorKey).toBeUndefined();

    restart();
    const reloaded = loadCollectionsDoc();
    expect(reloaded.collections.map((c) => c.name)).toEqual(['Season 1']);
  });

  it('items of two different kinds survive, in the order they were added', () => {
    commitCollections((doc) => createCollection(doc, { name: 'Mixed', id: 'c1', now: 10 }));
    commitCollections((doc) => addToCollection(doc, 'c1', 'video:one', 20));
    commitCollections((doc) => addToCollection(doc, 'c1', 'subtitle:two', 30));

    restart();
    expect(collectionById(loadCollectionsDoc(), 'c1')?.itemIds).toEqual([
      'video:one',
      'subtitle:two',
    ]);
  });

  it('deleting the collection removes the container and nothing else', () => {
    commitCollections((doc) => createCollection(doc, { name: 'Mixed', id: 'c1', now: 10 }));
    commitCollections((doc) => addToCollection(doc, 'c1', 'video:one', 20));
    const before = JSON.parse(localStorage.getItem(FILES_COLLECTIONS_STORAGE_KEY) as string);
    expect(before.collections[0].itemIds).toEqual(['video:one']);

    commitCollections((doc) => deleteCollection(doc, 'c1', 40));
    restart();
    // The gate: the container is gone and the item id it held is not anyone's
    // to delete — the Files index never knew about this document at all.
    expect(loadCollectionsDoc().collections).toEqual([]);
  });
});

describe('filesCollectionsStore — refusals and failures are distinct', () => {
  it('a model refusal writes NOTHING to storage', () => {
    commitCollections((doc) => createCollection(doc, { name: 'One', id: 'c1', now: 10 }));
    // Spied AFTER the successful write, and asserted on the CALL rather than on
    // the stored string: a refusal returns the unchanged document, so a store
    // that wrote it anyway would leave a byte-identical value behind and a
    // content comparison would call that a pass.
    const setItem = vi.spyOn(Storage.prototype, 'setItem');

    const refused = commitCollections((doc) =>
      createCollection(doc, { name: 'one', id: 'c2', now: 20 }),
    );
    expect(refused.errorKey).toBe('filesApp.collection.error.duplicateName');
    expect(refused.storageErrorKey).toBeUndefined();
    expect(setItem).not.toHaveBeenCalled();
  });

  it('a write that throws reports saveFailed and keeps the change for the session', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });

    const commit = commitCollections((doc) =>
      createCollection(doc, { name: 'Doomed', id: 'c1', now: 10 }),
    );
    expect(commit.storageErrorKey).toBe('filesApp.collection.error.saveFailed');
    expect(commit.errorKey).toBeUndefined();
    // Live for this session — the button did something — but the next read from
    // real storage finds nothing, which is exactly what the flag warns about.
    expect(commit.doc.collections).toHaveLength(1);
    expect(localStorage.getItem(FILES_COLLECTIONS_STORAGE_KEY)).toBeNull();

    setItem.mockRestore();
    restart();
    expect(loadCollectionsDoc().collections).toEqual([]);
  });

  it('CONTROL: the same commit with storage working reports no storage error', () => {
    const commit = commitCollections((doc) =>
      createCollection(doc, { name: 'Doomed', id: 'c1', now: 10 }),
    );
    expect(commit.storageErrorKey).toBeUndefined();
    expect(localStorage.getItem(FILES_COLLECTIONS_STORAGE_KEY)).not.toBeNull();
  });

  it('saveCollectionsDoc keeps the document in memory even when the write fails', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('nope');
    });
    const doc = { version: FILES_COLLECTIONS_VERSION, collections: [] };
    expect(saveCollectionsDoc(doc).persisted).toBe(false);
    // No restart: the session's own reads must not revert to disk.
    expect(loadCollectionsDoc()).toEqual(doc);
  });
});

describe('filesCollectionsStore — the change bus', () => {
  it('fires on a successful commit and not on a refusal', () => {
    const seen = vi.fn();
    const off = onCollectionsChanged(seen);

    commitCollections((doc) => createCollection(doc, { name: 'One', id: 'c1', now: 10 }));
    expect(seen).toHaveBeenCalledTimes(1);

    commitCollections((doc) => createCollection(doc, { name: 'one', id: 'c2', now: 20 }));
    expect(seen).toHaveBeenCalledTimes(1);

    off();
    commitCollections((doc) => createCollection(doc, { name: 'Two', id: 'c3', now: 30 }));
    expect(seen).toHaveBeenCalledTimes(1);
  });

  it('does not fire when the write failed — a stale window is better than a wrong one', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('nope');
    });
    const seen = vi.fn();
    const off = onCollectionsChanged(seen);
    commitCollections((doc) => createCollection(doc, { name: 'One', id: 'c1', now: 10 }));
    expect(seen).not.toHaveBeenCalled();
    off();
  });
});

describe('newCollectionId', () => {
  it('two ids made in the same millisecond differ', () => {
    const ids = new Set(Array.from({ length: 200 }, () => newCollectionId()));
    expect(ids.size).toBe(200);
  });

  it('falls back when crypto.randomUUID is unavailable', () => {
    const original = globalThis.crypto?.randomUUID;
    if (original) {
      vi.spyOn(globalThis.crypto, 'randomUUID').mockImplementation(() => {
        throw new Error('insecure origin');
      });
    }
    expect(newCollectionId()).toMatch(/^col_/);
  });
});
