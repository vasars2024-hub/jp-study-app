/**
 * Gate 22 — where per-folder view state lives.
 *
 * The same renderer-localStorage shape as gates 16, 18 and 19, through the
 * shared `filesDocStore`; see that module's header for why renderer and not
 * main, and why a failed write reports itself rather than passing silently.
 *
 * Gate 22 is a RESTART gate, so the failed-write clause is the load-bearing one:
 * a view state that only ever lived in the in-memory fallback would pass every
 * in-session check and be gone at the next launch, which is precisely the
 * failure the gate exists to catch.
 */
import {
  EMPTY_VIEW_STATE_DOC,
  parseViewStateDoc,
  type FilesViewStateDoc,
  type FilesViewStateResult,
} from '../shared/filesApp/viewState';
import { createFilesDocStore, type FilesDocCommit } from './filesDocStore';

export const FILES_VIEW_STATE_STORAGE_KEY = 'jp-files-view-state-v1';
export const FILES_VIEW_STATE_CHANGED_EVENT = 'filesapp:view-state-changed';

const store = createFilesDocStore<FilesViewStateDoc>({
  storageKey: FILES_VIEW_STATE_STORAGE_KEY,
  changedEvent: FILES_VIEW_STATE_CHANGED_EVENT,
  parse: parseViewStateDoc,
  empty: EMPTY_VIEW_STATE_DOC,
  saveFailedKey: 'filesApp.view.error.saveFailed',
});

export type ViewStateCommit = FilesDocCommit<FilesViewStateDoc>;

export function loadViewStateDoc(): FilesViewStateDoc {
  return store.load();
}

export function commitViewState(
  operation: (doc: FilesViewStateDoc) => FilesViewStateResult,
): ViewStateCommit {
  return store.commit(operation);
}

export function onViewStateChanged(listener: () => void): () => void {
  return store.onChanged(listener);
}

export function resetViewStateMemoryForTests(): void {
  store.resetMemoryForTests();
}
