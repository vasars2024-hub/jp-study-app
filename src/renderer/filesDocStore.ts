/**
 * One persistence shape for the Files app's renderer-owned documents.
 *
 * Gate 16 (collections) and gate 18 (favorites) both need exactly the same
 * thing: a small JSON document in renderer `localStorage`, parsed defensively,
 * written with a way to tell that the write did not land, and announced so a
 * second Files window is not stale. Written twice they would drift — and the
 * clause most likely to drift is the one that matters most, `persisted`.
 *
 * **Why renderer localStorage.** Gate 7 measured the fact that forced it: main
 * cannot see renderer localStorage, which is why a main-side enumerator read a
 * permanent 0 against a populated Notebook store. These documents are pure
 * renderer state; putting them in main would buy an IPC round trip and a second
 * source of truth for nothing.
 *
 * **A save that failed says so.** `localStorage.setItem` throws on quota, and in
 * a stripped-down context it can throw on every write. Both gates are RESTART
 * gates, and a document created in memory and never written passes every
 * in-session check and is silently gone at the next launch. So every write
 * reports whether it landed, and the caller surfaces a named refusal.
 *
 * **The in-memory fallback is deliberate and is not a lie.** When persistence is
 * unavailable the document still updates — a button that does nothing at all is
 * worse than one that works for the session and says it could not save. The two
 * states are distinguishable by the caller, which is the point.
 */

export interface FilesDocSaveOutcome<T> {
  doc: T;
  /**
   * `false` means the document is live for this session but will not survive a
   * restart. Never conflated with success.
   */
  persisted: boolean;
}

/** What a pure model operation hands back: a new document, or a named refusal. */
export interface FilesDocOpResult<T> {
  doc: T;
  errorKey?: string;
}

export interface FilesDocCommit<T> {
  doc: T;
  /** The model's own refusal key, when it refused. Nothing was written. */
  errorKey?: string;
  /**
   * The change was accepted but the write did not land. A separate key from the
   * model's, because the user's next action differs: a refusal is fixable by
   * retyping, a failed save is not.
   */
  storageErrorKey?: string;
}

export interface FilesDocStore<T> {
  load: () => T;
  save: (doc: T) => FilesDocSaveOutcome<T>;
  commit: (operation: (doc: T) => FilesDocOpResult<T>) => FilesDocCommit<T>;
  announce: () => void;
  onChanged: (listener: () => void) => () => void;
  /** Test seam: forget the in-memory fallback so a suite starts from real storage. */
  resetMemoryForTests: () => void;
}

export interface FilesDocStoreOptions<T> {
  storageKey: string;
  changedEvent: string;
  /** Must never throw and must never reinterpret an unknown future version. */
  parse: (raw: unknown) => T;
  empty: T;
  /** i18n key used when the model accepted the change but the write did not land. */
  saveFailedKey: string;
}

function storage(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    // Accessing `localStorage` itself throws when storage is disabled.
    return null;
  }
}

export function createFilesDocStore<T>(options: FilesDocStoreOptions<T>): FilesDocStore<T> {
  /**
   * The last document we know to be correct. Written on every read AND every
   * write, so a `setItem` that throws still leaves the session coherent instead
   * of reverting to whatever was last on disk.
   */
  let memoryDoc: T | null = null;

  const load = (): T => {
    const store = storage();
    if (!store) return memoryDoc ?? options.empty;
    try {
      const raw = store.getItem(options.storageKey);
      if (raw === null) return memoryDoc ?? options.empty;
      // `parse` never throws; `JSON.parse` does, which is why it is inside the try.
      const doc = options.parse(JSON.parse(raw));
      memoryDoc = doc;
      return doc;
    } catch {
      return memoryDoc ?? options.empty;
    }
  };

  const save = (doc: T): FilesDocSaveOutcome<T> => {
    memoryDoc = doc;
    const store = storage();
    if (!store) return { doc, persisted: false };
    try {
      store.setItem(options.storageKey, JSON.stringify(doc));
      return { doc, persisted: true };
    } catch {
      return { doc, persisted: false };
    }
  };

  const announce = (): void => {
    if (typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent(options.changedEvent));
  };

  /**
   * The load happens HERE rather than being passed in, so two windows that both
   * have the app open cannot write over each other with a document each read
   * minutes ago. A refusal writes nothing at all — an unchanged document that
   * still costs a `setItem` would churn storage and would fire the change event
   * on a change that did not happen.
   */
  const commit = (operation: (doc: T) => FilesDocOpResult<T>): FilesDocCommit<T> => {
    const result = operation(load());
    if (result.errorKey) return { doc: result.doc, errorKey: result.errorKey };
    const saved = save(result.doc);
    if (!saved.persisted) return { doc: saved.doc, storageErrorKey: options.saveFailedKey };
    announce();
    return { doc: saved.doc };
  };

  const onChanged = (listener: () => void): (() => void) => {
    if (typeof window === 'undefined') return () => undefined;
    const handler = () => listener();
    window.addEventListener(options.changedEvent, handler);
    return () => window.removeEventListener(options.changedEvent, handler);
  };

  return {
    load,
    save,
    commit,
    announce,
    onChanged,
    resetMemoryForTests: () => {
      memoryDoc = null;
    },
  };
}

/**
 * A fresh id for a renderer-owned document row.
 *
 * `crypto.randomUUID` is unavailable on insecure origins and in some test
 * environments, and the models refuse a duplicate id — so a timestamp alone
 * would refuse on two rows created in the same millisecond. The fallback carries
 * a random suffix for that reason, not for cryptographic strength.
 */
export function newFilesDocId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through to the timestamp form */
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
