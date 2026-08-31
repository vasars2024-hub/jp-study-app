/**
 * Gate 18 — where Favorites live.
 *
 * The same renderer-localStorage shape as gate 16's collections, through the
 * shared `filesDocStore` — see that module's header for why renderer and not
 * main, and why a failed write reports itself rather than passing as success.
 * Gate 18 is a restart gate too ("both appear under Favorites and survive a
 * restart"), so the `persisted` flag is load-bearing here for the same reason.
 */
import {
  EMPTY_FAVORITES_DOC,
  parseFavoritesDoc,
  type FilesFavoritesDoc,
  type FilesFavoritesResult,
} from '../shared/filesApp/favorites';
import { createFilesDocStore, type FilesDocCommit } from './filesDocStore';

export const FILES_FAVORITES_STORAGE_KEY = 'jp-files-favorites-v1';
export const FILES_FAVORITES_CHANGED_EVENT = 'filesapp:favorites-changed';

const store = createFilesDocStore<FilesFavoritesDoc>({
  storageKey: FILES_FAVORITES_STORAGE_KEY,
  changedEvent: FILES_FAVORITES_CHANGED_EVENT,
  parse: parseFavoritesDoc,
  empty: EMPTY_FAVORITES_DOC,
  saveFailedKey: 'filesApp.favorite.error.saveFailed',
});

export type FavoritesCommit = FilesDocCommit<FilesFavoritesDoc>;

export function loadFavoritesDoc(): FilesFavoritesDoc {
  return store.load();
}

export function commitFavorites(
  operation: (doc: FilesFavoritesDoc) => FilesFavoritesResult,
): FavoritesCommit {
  return store.commit(operation);
}

export function onFavoritesChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

export function resetFavoritesMemoryForTests(): void {
  store.resetMemoryForTests();
}
