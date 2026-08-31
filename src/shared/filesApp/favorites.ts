/**
 * Gate 18 — Favorites, as a pure model.
 *
 * The gate: "Pin an item and a location; both appear under Favorites and
 * survive a restart. Unpinning removes them and deletes nothing."
 *
 * **Two kinds of target, one list.** "An item AND a location" is the gate's own
 * wording, so a favorite is either a row from the Files index or a *place* in
 * the tree — a derived category, or one of the user's own collections. Two
 * separate lists would let the two drift into different orders and different
 * unpin paths; one list with a discriminated target keeps a single pin, a
 * single unpin and a single order.
 *
 * **Favorites are a SHORTCUT, never a container.** Nothing is stored in a
 * favorite: it holds a reference and no content whatsoever, which is what makes
 * "unpinning deletes nothing" true by construction rather than by care — there
 * is nothing in a favorite to delete. This is the same reasoning that makes
 * `collections.ts` hold item ids rather than items.
 *
 * **A dangling favorite is reported, not dropped.** An item that left the index,
 * or a collection the user deleted, is a *stale* favorite. `resolveFavorites`
 * counts it rather than filtering it away, for the reason the plan gives: a list
 * that quietly shrank is a finding, and the user is the only one who can say
 * whether a missing thing should be forgotten. Derived categories are the one
 * target that cannot dangle — they are compiled into `FILES_TREE`.
 *
 * Every operation is `(doc, …) => FilesFavoritesResult`, pure, returning a NEW
 * document or the old one plus a named `errorKey`. Nothing here throws and
 * nothing here touches a store.
 */
import { isFilesCategoryId, type FilesCategoryId } from './catalog';

/** Bumped when the on-disk shape changes; readers migrate forward, never guess. */
export const FILES_FAVORITES_VERSION = 1;

export type FilesFavoriteTarget =
  | { type: 'item'; itemId: string }
  | { type: 'category'; categoryId: FilesCategoryId }
  | { type: 'collection'; collectionId: string };

export interface FilesFavorite {
  target: FilesFavoriteTarget;
  pinnedAt: number;
}

export interface FilesFavoritesDoc {
  version: number;
  favorites: FilesFavorite[];
}

export interface FilesFavoritesResult {
  doc: FilesFavoritesDoc;
  /** i18n key naming the refusal. Absent on success — never an empty string. */
  errorKey?: string;
}

export const EMPTY_FAVORITES_DOC: FilesFavoritesDoc = {
  version: FILES_FAVORITES_VERSION,
  favorites: [],
};

/**
 * A favorite's identity, as one string.
 *
 * The type prefix is not decoration: an item id and a collection id come from
 * different generators and could collide, and a collision would let unpinning a
 * folder remove a file's pin. Deriving the key in ONE place is what stops the
 * pin check and the unpin from disagreeing about what "the same favorite" is.
 */
export function favoriteKey(target: FilesFavoriteTarget): string {
  switch (target.type) {
    case 'item':
      return `item:${target.itemId}`;
    case 'category':
      return `category:${target.categoryId}`;
    case 'collection':
      return `collection:${target.collectionId}`;
  }
}

export function isPinned(doc: FilesFavoritesDoc, target: FilesFavoriteTarget): boolean {
  const key = favoriteKey(target);
  return doc.favorites.some((f) => favoriteKey(f.target) === key);
}

function targetIsAddressable(target: FilesFavoriteTarget): boolean {
  switch (target.type) {
    case 'item':
      return Boolean(target.itemId);
    case 'category':
      return isFilesCategoryId(target.categoryId);
    case 'collection':
      return Boolean(target.collectionId);
  }
}

/**
 * Pin. **Idempotent**: pinning something already pinned is not an error and does
 * not duplicate the row — the user's intent ("keep this handy") is already
 * satisfied, and a refusal would be noise on a second click of a toggle.
 *
 * New favorites go on the END, so the list keeps the order they were pinned in.
 * Newest-first would reorder the whole strip under the user's cursor every time
 * they pin something, which is how a shortcut stops being one.
 */
export function pinFavorite(
  doc: FilesFavoritesDoc,
  target: FilesFavoriteTarget,
  now: number,
): FilesFavoritesResult {
  if (!targetIsAddressable(target)) {
    return { doc, errorKey: 'filesApp.favorite.error.noSuchTarget' };
  }
  if (isPinned(doc, target)) return { doc };
  return { doc: { ...doc, favorites: [...doc.favorites, { target, pinnedAt: now }] } };
}

/**
 * Unpin. **Deletes nothing but the pin** — a favorite holds no content, so
 * there is nothing of the user's here to remove.
 *
 * Unpinning something that is not pinned refuses by name rather than passing
 * silently: unlike pin, this is not a repeated gesture with a satisfied intent,
 * it is a gesture aimed at something that is not there.
 */
export function unpinFavorite(
  doc: FilesFavoritesDoc,
  target: FilesFavoriteTarget,
): FilesFavoritesResult {
  if (!isPinned(doc, target)) {
    return { doc, errorKey: 'filesApp.favorite.error.notPinned' };
  }
  const key = favoriteKey(target);
  return { doc: { ...doc, favorites: doc.favorites.filter((f) => favoriteKey(f.target) !== key) } };
}

/** The toggle the UI actually binds to, so pin and unpin cannot diverge. */
export function toggleFilesFavorite(
  doc: FilesFavoritesDoc,
  target: FilesFavoriteTarget,
  now: number,
): FilesFavoritesResult {
  return isPinned(doc, target) ? unpinFavorite(doc, target) : pinFavorite(doc, target, now);
}

export interface ResolvedFavorites {
  /** Favorites whose target still resolves, in the order they were pinned. */
  present: FilesFavorite[];
  /**
   * Favorites pointing at something that is gone. Counted rather than dropped:
   * a list that quietly shrank is the shape the plan calls a finding.
   */
  stale: FilesFavorite[];
}

export interface FavoriteWorld {
  knownItemIds: ReadonlySet<string>;
  knownCollectionIds: ReadonlySet<string>;
}

export function resolveFavorites(
  doc: FilesFavoritesDoc,
  world: FavoriteWorld,
): ResolvedFavorites {
  const present: FilesFavorite[] = [];
  const stale: FilesFavorite[] = [];
  for (const favorite of doc.favorites) {
    const target = favorite.target;
    // A derived category is compiled into FILES_TREE and cannot dangle; the
    // other two point at stores that change under the pin.
    const alive =
      target.type === 'category'
        ? isFilesCategoryId(target.categoryId)
        : target.type === 'item'
          ? world.knownItemIds.has(target.itemId)
          : world.knownCollectionIds.has(target.collectionId);
    (alive ? present : stale).push(favorite);
  }
  return { present, stale };
}

/**
 * Read a persisted document defensively.
 *
 * Anything unreadable becomes the EMPTY document rather than a throw — this is
 * called during the first render of the Files app, and a malformed store must
 * not take the window down. Unknown future versions are also read as empty:
 * silently reinterpreting a newer shape is how a downgrade eats data.
 */
export function parseFavoritesDoc(raw: unknown): FilesFavoritesDoc {
  if (!raw || typeof raw !== 'object') return EMPTY_FAVORITES_DOC;
  const candidate = raw as Partial<FilesFavoritesDoc>;
  if (candidate.version !== FILES_FAVORITES_VERSION) return EMPTY_FAVORITES_DOC;
  if (!Array.isArray(candidate.favorites)) return EMPTY_FAVORITES_DOC;
  const seen = new Set<string>();
  const favorites: FilesFavorite[] = [];
  for (const entry of candidate.favorites) {
    if (!entry || typeof entry !== 'object') continue;
    const target = parseTarget((entry as Partial<FilesFavorite>).target);
    if (!target) continue;
    const key = favoriteKey(target);
    // A duplicate on disk would give the same thing two pins and one unpin,
    // leaving a favorite that will not go away.
    if (seen.has(key)) continue;
    seen.add(key);
    const pinnedAt = (entry as Partial<FilesFavorite>).pinnedAt;
    favorites.push({ target, pinnedAt: typeof pinnedAt === 'number' ? pinnedAt : 0 });
  }
  return { version: FILES_FAVORITES_VERSION, favorites };
}

function parseTarget(raw: unknown): FilesFavoriteTarget | null {
  if (!raw || typeof raw !== 'object') return null;
  const t = raw as Record<string, unknown>;
  if (t.type === 'item' && typeof t.itemId === 'string' && t.itemId) {
    return { type: 'item', itemId: t.itemId };
  }
  if (t.type === 'category' && isFilesCategoryId(t.categoryId)) {
    return { type: 'category', categoryId: t.categoryId };
  }
  if (t.type === 'collection' && typeof t.collectionId === 'string' && t.collectionId) {
    return { type: 'collection', collectionId: t.collectionId };
  }
  return null;
}
