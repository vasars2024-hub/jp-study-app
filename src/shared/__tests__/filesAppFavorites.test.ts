// @vitest-environment node
/**
 * Gate 18's model — "Pin an item and a location; both appear under Favorites
 * and survive a restart. Unpinning removes them and deletes nothing."
 *
 * The survival half needs a store and is proven in `filesAppFavorites.test.tsx`;
 * this file proves the shape that makes it possible — and the "deletes nothing"
 * clause, which is structural here rather than a promise kept by the UI.
 */
import { describe, expect, it } from 'vitest';
import {
  EMPTY_FAVORITES_DOC,
  FILES_FAVORITES_VERSION,
  favoriteKey,
  isPinned,
  parseFavoritesDoc,
  pinFavorite,
  resolveFavorites,
  toggleFavorite,
  unpinFavorite,
  type FilesFavoritesDoc,
  type FilesFavoriteTarget,
} from '../filesApp/favorites';

const ITEM: FilesFavoriteTarget = { type: 'item', itemId: 'media:1' };
const CATEGORY: FilesFavoriteTarget = { type: 'category', categoryId: 'sources/video' };
const COLLECTION: FilesFavoriteTarget = { type: 'collection', collectionId: 'col_a' };

function world(items: string[] = ['media:1'], collections: string[] = ['col_a']) {
  return { knownItemIds: new Set(items), knownCollectionIds: new Set(collections) };
}

describe('favoriteKey', () => {
  it('separates the three target kinds even when the ids collide', () => {
    // Item ids and collection ids come from different generators; without the
    // prefix, unpinning a folder could remove a file's pin.
    expect(favoriteKey({ type: 'item', itemId: 'x' })).not.toBe(
      favoriteKey({ type: 'collection', collectionId: 'x' }),
    );
  });

  it('is stable across two structurally equal targets', () => {
    expect(favoriteKey({ type: 'item', itemId: 'media:1' })).toBe(favoriteKey(ITEM));
  });
});

describe('pin and unpin', () => {
  it('pins an item AND a location, and both are in one list', () => {
    let doc: FilesFavoritesDoc = EMPTY_FAVORITES_DOC;
    doc = pinFavorite(doc, ITEM, 10).doc;
    doc = pinFavorite(doc, CATEGORY, 20).doc;
    expect(doc.favorites.map((f) => f.target.type)).toEqual(['item', 'category']);
    expect(isPinned(doc, ITEM)).toBe(true);
    expect(isPinned(doc, CATEGORY)).toBe(true);
  });

  it('keeps the order things were pinned in, not newest-first', () => {
    let doc: FilesFavoritesDoc = EMPTY_FAVORITES_DOC;
    doc = pinFavorite(doc, CATEGORY, 10).doc;
    doc = pinFavorite(doc, ITEM, 20).doc;
    expect(doc.favorites.map((f) => favoriteKey(f.target))).toEqual([
      'category:sources/video',
      'item:media:1',
    ]);
  });

  it('pinning twice is idempotent, not an error and not a duplicate', () => {
    const once = pinFavorite(EMPTY_FAVORITES_DOC, ITEM, 10);
    const twice = pinFavorite(once.doc, ITEM, 20);
    expect(twice.errorKey).toBeUndefined();
    expect(twice.doc.favorites).toHaveLength(1);
    // And the original pin time is kept: a second click is not a re-pin.
    expect(twice.doc.favorites[0].pinnedAt).toBe(10);
  });

  it('UNPINNING DELETES NOTHING — the favorite holds no content to delete', () => {
    const pinned = pinFavorite(EMPTY_FAVORITES_DOC, ITEM, 10).doc;
    const after = unpinFavorite(pinned, ITEM);
    expect(after.errorKey).toBeUndefined();
    expect(after.doc.favorites).toEqual([]);
    // Structural, not careful: the whole favorite was `{target, pinnedAt}`, so
    // there was never anywhere for the item itself to be.
    expect(Object.keys(pinned.favorites[0]).sort()).toEqual(['pinnedAt', 'target']);
  });

  it('unpinning something that is not pinned refuses BY NAME', () => {
    const result = unpinFavorite(EMPTY_FAVORITES_DOC, ITEM);
    expect(result.errorKey).toBe('filesApp.favorite.error.notPinned');
    expect(result.doc).toBe(EMPTY_FAVORITES_DOC);
  });

  it('refuses a target with nothing to address', () => {
    expect(pinFavorite(EMPTY_FAVORITES_DOC, { type: 'item', itemId: '' }, 10).errorKey).toBe(
      'filesApp.favorite.error.noSuchTarget',
    );
    expect(
      pinFavorite(
        EMPTY_FAVORITES_DOC,
        { type: 'category', categoryId: 'not/a/category' as never },
        10,
      ).errorKey,
    ).toBe('filesApp.favorite.error.noSuchTarget');
  });

  it('toggle is exactly pin-then-unpin, so the two cannot diverge', () => {
    const on = toggleFavorite(EMPTY_FAVORITES_DOC, ITEM, 10);
    expect(isPinned(on.doc, ITEM)).toBe(true);
    const off = toggleFavorite(on.doc, ITEM, 20);
    expect(isPinned(off.doc, ITEM)).toBe(false);
    expect(off.errorKey).toBeUndefined();
  });

  it('unpinning one leaves the others exactly where they were', () => {
    let doc: FilesFavoritesDoc = EMPTY_FAVORITES_DOC;
    doc = pinFavorite(doc, ITEM, 10).doc;
    doc = pinFavorite(doc, CATEGORY, 20).doc;
    doc = pinFavorite(doc, COLLECTION, 30).doc;
    const after = unpinFavorite(doc, CATEGORY).doc;
    expect(after.favorites.map((f) => favoriteKey(f.target))).toEqual([
      'item:media:1',
      'collection:col_a',
    ]);
  });
});

describe('resolveFavorites — stale is counted, never dropped', () => {
  it('a live item, category and collection all resolve', () => {
    let doc: FilesFavoritesDoc = EMPTY_FAVORITES_DOC;
    doc = pinFavorite(doc, ITEM, 10).doc;
    doc = pinFavorite(doc, CATEGORY, 20).doc;
    doc = pinFavorite(doc, COLLECTION, 30).doc;
    const resolved = resolveFavorites(doc, world());
    expect(resolved.present).toHaveLength(3);
    expect(resolved.stale).toHaveLength(0);
  });

  it('an item that left the index is stale, and still in the document', () => {
    const doc = pinFavorite(EMPTY_FAVORITES_DOC, ITEM, 10).doc;
    const resolved = resolveFavorites(doc, world([], []));
    expect(resolved.stale).toHaveLength(1);
    expect(resolved.present).toHaveLength(0);
    expect(doc.favorites).toHaveLength(1);
  });

  it('a deleted collection is stale', () => {
    const doc = pinFavorite(EMPTY_FAVORITES_DOC, COLLECTION, 10).doc;
    expect(resolveFavorites(doc, world(['media:1'], [])).stale).toHaveLength(1);
  });

  it('a derived category CANNOT go stale — it is compiled into the tree', () => {
    const doc = pinFavorite(EMPTY_FAVORITES_DOC, CATEGORY, 10).doc;
    // Empty world on both sides; the category still resolves.
    expect(resolveFavorites(doc, world([], [])).present).toHaveLength(1);
  });
});

describe('parseFavoritesDoc', () => {
  it('anything unreadable is the empty document, never a throw', () => {
    expect(parseFavoritesDoc(null)).toEqual(EMPTY_FAVORITES_DOC);
    expect(parseFavoritesDoc('nope')).toEqual(EMPTY_FAVORITES_DOC);
    expect(parseFavoritesDoc({ version: 1 })).toEqual(EMPTY_FAVORITES_DOC);
  });

  it('a FUTURE version reads as empty rather than being reinterpreted', () => {
    const doc = parseFavoritesDoc({
      version: FILES_FAVORITES_VERSION + 1,
      favorites: [{ target: ITEM, pinnedAt: 1 }],
    });
    expect(doc.favorites).toEqual([]);
  });

  it('drops rows whose target is not one of the three shapes', () => {
    const doc = parseFavoritesDoc({
      version: FILES_FAVORITES_VERSION,
      favorites: [
        { target: ITEM, pinnedAt: 1 },
        { target: { type: 'nonsense' }, pinnedAt: 2 },
        { target: { type: 'category', categoryId: 'not/real' }, pinnedAt: 3 },
        null,
      ],
    });
    expect(doc.favorites.map((f) => favoriteKey(f.target))).toEqual(['item:media:1']);
  });

  it('collapses a duplicate on disk — two pins and one unpin leaves a stuck favorite', () => {
    const doc = parseFavoritesDoc({
      version: FILES_FAVORITES_VERSION,
      favorites: [
        { target: ITEM, pinnedAt: 1 },
        { target: { type: 'item', itemId: 'media:1' }, pinnedAt: 2 },
      ],
    });
    expect(doc.favorites).toHaveLength(1);
    expect(doc.favorites[0].pinnedAt).toBe(1);
  });

  it('round-trips through JSON, which is how it is actually stored', () => {
    let doc: FilesFavoritesDoc = EMPTY_FAVORITES_DOC;
    doc = pinFavorite(doc, ITEM, 10).doc;
    doc = pinFavorite(doc, CATEGORY, 20).doc;
    doc = pinFavorite(doc, COLLECTION, 30).doc;
    expect(parseFavoritesDoc(JSON.parse(JSON.stringify(doc)))).toEqual(doc);
  });
});
