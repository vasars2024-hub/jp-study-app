/**
 * Gate 16/2 — where the user's own folders actually live.
 *
 * Everything about *how* this persists is in `filesDocStore.ts`, which gate 18's
 * favorites share: renderer localStorage, a defensive read, a write that reports
 * whether it landed, and a change event a second window listens for. The
 * reasoning for each of those decisions is in that module's header.
 *
 * What is specific to collections and stays here: the storage key, the event
 * name, and the fact that `saveFailed` is a DIFFERENT i18n key from the model's
 * refusals — a refusal is fixable by retyping, a failed save is not.
 */
import {
  EMPTY_COLLECTIONS_DOC,
  parseCollectionsDoc,
  type FilesCollectionsDoc,
  type FilesCollectionsResult,
} from '../shared/filesApp/collections';
import {
  createFilesDocStore,
  newFilesDocId,
  type FilesDocCommit,
  type FilesDocSaveOutcome,
} from './filesDocStore';

export const FILES_COLLECTIONS_STORAGE_KEY = 'jp-files-collections-v1';

/** Fired after a successful mutation so a second Files window is not stale. */
export const FILES_COLLECTIONS_CHANGED_EVENT = 'filesapp:collections-changed';

const store = createFilesDocStore<FilesCollectionsDoc>({
  storageKey: FILES_COLLECTIONS_STORAGE_KEY,
  changedEvent: FILES_COLLECTIONS_CHANGED_EVENT,
  parse: parseCollectionsDoc,
  empty: EMPTY_COLLECTIONS_DOC,
  saveFailedKey: 'filesApp.collection.error.saveFailed',
});

export type CollectionsSaveOutcome = FilesDocSaveOutcome<FilesCollectionsDoc>;
export type CollectionsCommit = FilesDocCommit<FilesCollectionsDoc>;

export function loadCollectionsDoc(): FilesCollectionsDoc {
  return store.load();
}

export function saveCollectionsDoc(doc: FilesCollectionsDoc): CollectionsSaveOutcome {
  return store.save(doc);
}

export function commitCollections(
  operation: (doc: FilesCollectionsDoc) => FilesCollectionsResult,
): CollectionsCommit {
  return store.commit(operation);
}

export function announceCollectionsChanged(): void {
  store.announce();
}

export function onCollectionsChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

export function newCollectionId(): string {
  return newFilesDocId('col');
}

export function resetCollectionsMemoryForTests(): void {
  store.resetMemoryForTests();
}
