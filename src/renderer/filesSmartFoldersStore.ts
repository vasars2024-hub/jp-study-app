/**
 * Gate 19 — where the user's saved searches live.
 *
 * The same renderer-localStorage shape as gates 16 and 18, through the shared
 * `filesDocStore`; see that module's header for why renderer and not main, and
 * why a failed write reports itself.
 *
 * What is stored here is a QUESTION and never an answer — no membership list
 * and no cached count, which is what makes gate 19's "stays live" structural.
 * `smartFolders.ts`'s header has the full reasoning.
 */
import {
  EMPTY_SMART_FOLDERS_DOC,
  parseSmartFoldersDoc,
  type FilesSmartFoldersDoc,
  type FilesSmartFoldersResult,
} from '../shared/filesApp/smartFolders';
import { createFilesDocStore, newFilesDocId, type FilesDocCommit } from './filesDocStore';

export const FILES_SMART_FOLDERS_STORAGE_KEY = 'jp-files-smart-folders-v1';
export const FILES_SMART_FOLDERS_CHANGED_EVENT = 'filesapp:smart-folders-changed';

const store = createFilesDocStore<FilesSmartFoldersDoc>({
  storageKey: FILES_SMART_FOLDERS_STORAGE_KEY,
  changedEvent: FILES_SMART_FOLDERS_CHANGED_EVENT,
  parse: parseSmartFoldersDoc,
  empty: EMPTY_SMART_FOLDERS_DOC,
  saveFailedKey: 'filesApp.smart.error.saveFailed',
});

export type SmartFoldersCommit = FilesDocCommit<FilesSmartFoldersDoc>;

export function loadSmartFoldersDoc(): FilesSmartFoldersDoc {
  return store.load();
}

export function commitSmartFolders(
  operation: (doc: FilesSmartFoldersDoc) => FilesSmartFoldersResult,
): SmartFoldersCommit {
  return store.commit(operation);
}

export function onSmartFoldersChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

export function newSmartFolderId(): string {
  return newFilesDocId('smart');
}

export function resetSmartFoldersMemoryForTests(): void {
  store.resetMemoryForTests();
}
