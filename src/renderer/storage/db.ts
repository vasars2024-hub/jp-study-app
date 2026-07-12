/**
 * Minimal promise wrapper around IndexedDB — the app's durable store for
 * heavy data (flashcard decks, CSV drafts, presets).
 *
 * Why IndexedDB and not localStorage for these: localStorage is a single
 * synchronous ~5–10 MB string bucket; a 15k-row deck serialization can hit
 * the quota and silently vanish, and every write blocks the UI thread for
 * the full serialize. IndexedDB writes are async, effectively unbounded for
 * this use case, and survive quota pressure. Small UI state (theme id, pane
 * sizes, last-opened ids) stays in localStorage where synchronous access is
 * a feature.
 *
 * Deliberately dependency-free (~70 lines) instead of pulling in `idb` — one
 * object store with out-of-line string keys is all the app needs.
 */

export const DB_NAME = 'jp-study-db';
export const DB_VERSION = 1;
export const KV_STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err ?? '');
}

function isCorruptDbError(err: unknown): boolean {
  const msg = errMessage(err).toLowerCase();
  const name =
    err && typeof err === 'object' && 'name' in err
      ? String((err as { name: unknown }).name).toLowerCase()
      : '';
  return (
    msg.includes('data lost') ||
    msg.includes('missing file') ||
    msg.includes('irrecoverable') ||
    msg.includes('corrupt') ||
    msg.includes('internal error') ||
    msg.includes('unknown error') ||
    // Chromium often reports a bare DOMException / UnknownError on a broken profile DB.
    name === 'unknownerror' ||
    name === 'invalidstateerror'
  );
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
      req.onblocked = () => {
        // Another connection — resolve anyway so open can retry later.
        resolve();
      };
    } catch (e) {
      reject(e);
    }
  });
}

function openDbOnce(): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(KV_STORE)) {
        db.createObjectStore(KV_STORE);
      }
    };
    req.onsuccess = () => {
      const db = req.result;
      // If another tab/window upgrades the schema, close so it can proceed.
      db.onversionchange = () => {
        db.close();
        dbPromise = null;
      };
      // Connection closed unexpectedly (e.g. after versionchange elsewhere).
      db.onclose = () => {
        dbPromise = null;
      };
      resolve(db);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB open failed'));
    };
    req.onblocked = () => {
      /* another connection holds an older version — wait; onsuccess/onerror will fire */
    };
  });
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = (async () => {
    try {
      return await openDbOnce();
    } catch (err) {
      // Chromium can leave a broken IDB file after crash / abrupt kill.
      // Wipe and recreate once; localStorage remains the hot-path source for decks.
      if (isCorruptDbError(err)) {
        console.warn('[storage] IndexedDB corrupt — recreating:', errMessage(err));
        try {
          await deleteDatabase();
        } catch {
          /* continue to retry open */
        }
        return openDbOnce();
      }
      throw err;
    }
  })().catch((err) => {
    dbPromise = null;
    throw err;
  });
  return dbPromise;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const run = async (): Promise<T> => {
    const db = await openDb();
    return requestToPromise(fn(db.transaction(KV_STORE, mode).objectStore(KV_STORE)));
  };
  try {
    return await run();
  } catch (err) {
    // Stale connection after versionchange/close — reopen once.
    const name = err && typeof err === 'object' && 'name' in err ? String((err as { name: string }).name) : '';
    if (
      name === 'InvalidStateError' ||
      name === 'InvalidAccessError' ||
      name === 'NotFoundError' ||
      isCorruptDbError(err)
    ) {
      dbPromise = null;
      if (isCorruptDbError(err)) {
        try {
          await deleteDatabase();
        } catch {
          /* ignore */
        }
      }
      return run();
    }
    throw err;
  }
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  return (await withStore('readonly', (s) => s.get(key))) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  await withStore('readwrite', (s) => s.put(value, key));
}

export async function kvDelete(key: string): Promise<void> {
  await withStore('readwrite', (s) => s.delete(key));
}

export async function kvClear(): Promise<void> {
  await withStore('readwrite', (s) => s.clear());
}

export async function kvKeys(): Promise<string[]> {
  const keys = await withStore('readonly', (s) => s.getAllKeys());
  return keys.map(String);
}

export async function kvEntries(): Promise<Array<[string, unknown]>> {
  const db = await openDb();
  const store = db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE);
  const [keys, values] = await Promise.all([
    requestToPromise(store.getAllKeys()),
    requestToPromise(store.getAll()),
  ]);
  return keys.map((k, i) => [String(k), values[i]] as [string, unknown]);
}
