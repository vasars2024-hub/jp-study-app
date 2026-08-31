/**
 * Gate 16/2 — where the user's own folders actually live.
 *
 * **Renderer localStorage, not main.** Gate 7 already recorded the fact that
 * forced this: main cannot see renderer localStorage, which is why the Notebook
 * read a permanent 0 from a main-side enumerator against a populated store.
 * Collections are pure renderer state — no file is written, no row is inserted —
 * so putting them in main would buy an IPC round trip and a second source of
 * truth for nothing. `withRendererItems` in `useFilesIndex.ts` is the existing
 * seam for renderer-side rows and this sits alongside it.
 *
 * **A save that failed says so.** `localStorage.setItem` throws on quota, and in
 * a private-mode or stripped-down context it can throw on every write. Gate 16
 * is "reopen the app and it survives" — a folder that was created in memory and
 * never persisted passes every in-session check and fails the gate silently on
 * the next launch. So every write returns `persisted`, and the caller surfaces
 * a named refusal rather than letting the tree lie.
 *
 * **The in-memory fallback is deliberate and it is not a lie.** When persistence
 * is unavailable the document still updates, because a Files app whose New
 * Folder button does nothing at all is worse than one that works for the
 * session and says it could not save. The two states are distinguishable by the
 * caller, which is the whole point.
 */
import {
  EMPTY_COLLECTIONS_DOC,
  parseCollectionsDoc,
  type FilesCollectionsDoc,
  type FilesCollectionsResult,
} from '../shared/filesApp/collections';

export const FILES_COLLECTIONS_STORAGE_KEY = 'jp-files-collections-v1';

/** Fired after a successful mutation so a second Files window is not stale. */
export const FILES_COLLECTIONS_CHANGED_EVENT = 'filesapp:collections-changed';

/**
 * The last document we know to be correct. Written on every read AND every
 * write, so a `setItem` that throws still leaves the session coherent instead
 * of reverting to whatever was last on disk.
 */
let memoryDoc: FilesCollectionsDoc | null = null;

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Accessing `localStorage` itself throws when storage is disabled.
    return null;
  }
}

export function loadCollectionsDoc(): FilesCollectionsDoc {
  const store = storage();
  if (!store) return memoryDoc ?? EMPTY_COLLECTIONS_DOC;
  try {
    const raw = store.getItem(FILES_COLLECTIONS_STORAGE_KEY);
    if (raw === null) return memoryDoc ?? EMPTY_COLLECTIONS_DOC;
    // `parseCollectionsDoc` never throws and never guesses at a future version;
    // JSON.parse does throw, which is why it is inside the try.
    const doc = parseCollectionsDoc(JSON.parse(raw));
    memoryDoc = doc;
    return doc;
  } catch {
    return memoryDoc ?? EMPTY_COLLECTIONS_DOC;
  }
}

export interface CollectionsSaveOutcome {
  doc: FilesCollectionsDoc;
  /**
   * `false` means the document is live for this session but will not survive a
   * restart. Never conflated with success — gate 16 is a restart gate.
   */
  persisted: boolean;
}

export function saveCollectionsDoc(doc: FilesCollectionsDoc): CollectionsSaveOutcome {
  memoryDoc = doc;
  const store = storage();
  if (!store) return { doc, persisted: false };
  try {
    store.setItem(FILES_COLLECTIONS_STORAGE_KEY, JSON.stringify(doc));
    return { doc, persisted: true };
  } catch {
    return { doc, persisted: false };
  }
}

export interface CollectionsCommit {
  doc: FilesCollectionsDoc;
  /** The model's own refusal key, when it refused. Nothing was written. */
  errorKey?: string;
  /**
   * `'saveFailed'` when the model accepted the change but the write did not
   * land. A separate key from the model's, because the user's next action
   * differs: a refusal is fixable by retyping, a failed save is not.
   */
  storageErrorKey?: string;
}

/**
 * Run one model operation against the persisted document and write the result.
 *
 * The load happens HERE rather than being passed in, so two windows that both
 * have the app open cannot write over each other with a document each read
 * minutes ago. A refusal writes nothing at all — an unchanged document that
 * still costs a `setItem` would churn storage for no reason and would fire the
 * change event on a change that did not happen.
 */
export function commitCollections(
  operation: (doc: FilesCollectionsDoc) => FilesCollectionsResult,
): CollectionsCommit {
  const result = operation(loadCollectionsDoc());
  if (result.errorKey) return { doc: result.doc, errorKey: result.errorKey };
  const saved = saveCollectionsDoc(result.doc);
  if (!saved.persisted) {
    return { doc: saved.doc, storageErrorKey: 'filesApp.collection.error.saveFailed' };
  }
  announceCollectionsChanged();
  return { doc: saved.doc };
}

export function announceCollectionsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(FILES_COLLECTIONS_CHANGED_EVENT));
}

export function onCollectionsChanged(listener: () => void): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handler = () => listener();
  window.addEventListener(FILES_COLLECTIONS_CHANGED_EVENT, handler);
  return () => window.removeEventListener(FILES_COLLECTIONS_CHANGED_EVENT, handler);
}

/**
 * A fresh collection id.
 *
 * `crypto.randomUUID` is unavailable on insecure origins and in some test
 * environments, and the model refuses a duplicate id — so a timestamp alone
 * would refuse on two folders created in the same millisecond. The fallback
 * carries a random suffix for that reason, not for cryptographic strength.
 */
export function newCollectionId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `col_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through to the timestamp form */
  }
  return `col_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Test seam: forget the in-memory fallback so a suite starts from real storage. */
export function resetCollectionsMemoryForTests(): void {
  memoryDoc = null;
}
