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
 * Deliberately dependency-free instead of pulling in `idb` — one object store
 * with out-of-line string keys is all the app needs.
 *
 * ## Failure handling (audit: "a harmless error wipes the whole store")
 *
 * The previous version treated `InvalidStateError` — the error every call gets
 * while a connection is CLOSING, e.g. after a `versionchange` from another
 * window — as corruption and deleted the whole database, with nothing exported
 * first. Now every failure is classified (`classifyIdbError`):
 *
 * - **stale** — `InvalidStateError`, `TransactionInactiveError`, `AbortError`
 *   or a "connection is closing/closed" message. Retried on a fresh
 *   connection; never destructive.
 * - **corrupt** — the storage engine itself says the bytes on disk are damaged:
 *   an `UnknownError` whose message names corruption (`corrupt`, `checksum`,
 *   `data loss`, `missing file`, `irrecoverable`). "Internal error opening
 *   backing store" is NOT on the list: Chromium reports I/O errors and a
 *   LevelDB lock still held by an exiting instance that way, both transient,
 *   and Chromium already repairs real corruption itself on open (reporting it
 *   through `dataLoss` on the upgrade event).
 * - **other** — everything else (quota, clone, constraint, not-found). Thrown.
 *
 * A wipe needs corruption reported on TWO consecutive fresh connections, at most
 * once per session, and only after every readable record has been exported to
 * `userData/recovery/<db>-<timestamp>.json` through the main process. When some
 * records could not be read, the raw on-disk files must also have been copied
 * aside, otherwise nothing is deleted and the error propagates (the app keeps
 * running on its localStorage caches). After the wipe the readable records are
 * written back, so "wipe" in practice means "rebuild without the damaged rows".
 */

import { encodeIdbValue } from './idbJson';

export const DB_NAME = 'jp-study-db';
export const DB_VERSION = 1;
export const KV_STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function errMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) return String((err as { message: unknown }).message);
  return String(err ?? '');
}

function errName(err: unknown): string {
  return err && typeof err === 'object' && 'name' in err ? String((err as { name: unknown }).name) : '';
}

export type IdbErrorKind = 'stale' | 'corrupt' | 'other';

const STALE_NAMES = new Set(['InvalidStateError', 'TransactionInactiveError', 'AbortError']);
const CORRUPTION_RE = /corrupt|checksum|data ?lo(?:ss|st)|missing files?|irrecoverable/i;

/** See the module header for the exact definitions. */
export function classifyIdbError(err: unknown): IdbErrorKind {
  const name = errName(err);
  const msg = errMessage(err);
  if (STALE_NAMES.has(name) || /connection (?:is )?(?:closing|closed)/i.test(msg)) return 'stale';
  if (name === 'UnknownError' && CORRUPTION_RE.test(msg)) return 'corrupt';
  return 'other';
}

/**
 * Where a recovery export goes before any destructive step. In the app this is
 * the main process (`window.api.storageSaveIdbRecovery`); tests inject a fake.
 */
export interface IdbRecoverySink {
  /** Persist the JSON export; resolves with where it was written. Throwing blocks the wipe. */
  saveExport(dbName: string, json: string): Promise<string>;
  /** Copy the raw on-disk database aside; resolves with the path, or null when it could not. */
  preserveFiles?(dbName: string): Promise<string | null>;
}

let recoverySink: IdbRecoverySink | null | undefined;

export function setIdbRecoverySink(sink: IdbRecoverySink | null | undefined): void {
  recoverySink = sink;
}

function activeRecoverySink(): IdbRecoverySink | null {
  if (recoverySink !== undefined) return recoverySink;
  const api = typeof window !== 'undefined'
    ? (window as { api?: Partial<Window['api']> }).api
    : undefined;
  const save = api?.storageSaveIdbRecovery;
  if (!save) return null;
  const preserve = api?.storagePreserveIdbFiles;
  return {
    saveExport: (dbName, json) => save(dbName, json),
    preserveFiles: preserve ? (dbName) => preserve(dbName) : undefined,
  };
}

function delay(ms: number): Promise<void> {
  return ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve();
}

function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.deleteDatabase(DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error ?? new Error('IndexedDB delete failed'));
      req.onblocked = () => {
        // Another connection — resolve anyway; the next open queues behind the delete.
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
        dropConnection(db);
      };
      // Connection closed unexpectedly (e.g. after versionchange elsewhere).
      db.onclose = () => {
        dropConnection(db);
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

let currentDb: IDBDatabase | null = null;

/** Forget a connection so the next call opens a fresh one. */
function dropConnection(db: IDBDatabase | null): void {
  if (db && currentDb !== db) return;
  try {
    currentDb?.close();
  } catch {
    /* already closed */
  }
  currentDb = null;
  dbPromise = null;
}

/** Back-off between open attempts: a LevelDB lock from an exiting instance clears in well under a second. */
const OPEN_BACKOFF_MS = [0, 150, 600];

async function openWithRetry(): Promise<IDBDatabase> {
  let lastErr: unknown;
  let corruptStreak = 0;
  for (let attempt = 0; attempt < OPEN_BACKOFF_MS.length; attempt++) {
    await delay(OPEN_BACKOFF_MS[attempt]);
    try {
      return await openDbOnce();
    } catch (err) {
      lastErr = err;
      corruptStreak = classifyIdbError(err) === 'corrupt' ? corruptStreak + 1 : 0;
      if (corruptStreak >= 2) return rebuildAfterCorruption(err);
    }
  }
  throw lastErr;
}

export function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  const attempt: Promise<IDBDatabase> = openWithRetry().then(
    (db) => {
      currentDb = db;
      return db;
    },
    (err: unknown) => {
      if (dbPromise === attempt) dbPromise = null;
      throw err;
    },
  );
  dbPromise = attempt;
  return attempt;
}

function requestToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

function transactionDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new DOMException('IndexedDB transaction aborted', 'AbortError'));
  });
}

/** Stale-connection retries per call. Two covers "closed, then the reopen raced another close". */
const MAX_STALE_RETRIES = 2;

/**
 * Run `body` in one transaction on the kv store, with the failure policy from
 * the module header. `readwrite` bodies resolve only after the transaction
 * commits, so a caller that awaited `kvSet` knows the value is durable.
 */
async function withTransaction<T>(
  mode: IDBTransactionMode,
  body: (store: IDBObjectStore) => Promise<T>,
): Promise<T> {
  let staleRetries = 0;
  let corruptStreak = 0;
  let rebuilt = false;
  for (;;) {
    let db: IDBDatabase | null = null;
    try {
      db = await openDb();
      const tx = db.transaction(KV_STORE, mode);
      const done = transactionDone(tx);
      // A failed request also rejects `done`; keep it from surfacing as unhandled.
      done.catch(() => undefined);
      const result = await body(tx.objectStore(KV_STORE));
      if (mode === 'readwrite') await done;
      return result;
    } catch (err) {
      const kind = classifyIdbError(err);
      if (kind === 'stale' && staleRetries < MAX_STALE_RETRIES) {
        staleRetries += 1;
        dropConnection(db);
        continue;
      }
      if (kind === 'corrupt' && !rebuilt) {
        corruptStreak += 1;
        dropConnection(db);
        if (corruptStreak < 2) continue; // confirm on a fresh connection first
        await rebuildAfterCorruption(err);
        rebuilt = true;
        continue;
      }
      throw err;
    }
  }
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return withTransaction(mode, (store) => requestToPromise(fn(store)));
}

// ── Corruption recovery ────────────────────────────────────────────────────

interface ReadableDump {
  entries: Array<[string, unknown]>;
  unreadableKeys: string[];
  openError: string | null;
}

/** Read every record that still reads, one `get` per key so one bad row can't hide the rest. */
async function dumpReadable(): Promise<ReadableDump> {
  let db: IDBDatabase;
  try {
    db = await openDbOnce();
  } catch (err) {
    return { entries: [], unreadableKeys: [], openError: `${errName(err)}: ${errMessage(err)}` };
  }
  try {
    let keys: string[];
    try {
      keys = (await requestToPromise(db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE).getAllKeys())).map(String);
    } catch (err) {
      return { entries: [], unreadableKeys: [], openError: `${errName(err)}: ${errMessage(err)}` };
    }
    const entries: Array<[string, unknown]> = [];
    const unreadableKeys: string[] = [];
    for (const key of keys) {
      try {
        entries.push([key, await requestToPromise(db.transaction(KV_STORE, 'readonly').objectStore(KV_STORE).get(key))]);
      } catch {
        unreadableKeys.push(key);
      }
    }
    return { entries, unreadableKeys, openError: null };
  } finally {
    try {
      db.close();
    } catch {
      /* ignore */
    }
  }
}

let rebuildsThisSession = 0;

/** Test hook: forget the once-per-session guard and any cached connection. */
export function __resetDbForTests(): void {
  rebuildsThisSession = 0;
  dropConnection(currentDb);
  dbPromise = null;
  recoverySink = undefined;
}

async function rebuildAfterCorruption(cause: unknown): Promise<IDBDatabase> {
  if (rebuildsThisSession >= 1) throw cause;
  rebuildsThisSession += 1;
  dropConnection(currentDb);

  const sink = activeRecoverySink();
  if (!sink) throw cause;

  const dump = await dumpReadable();
  const encoded: Record<string, unknown> = {};
  for (const [key, value] of dump.entries) encoded[key] = await encodeIdbValue(value);
  const json = JSON.stringify({
    app: 'jp-study-app',
    kind: 'indexeddb-recovery',
    database: DB_NAME,
    store: KV_STORE,
    reason: `${errName(cause)}: ${errMessage(cause)}`,
    exportedAt: new Date().toISOString(),
    openError: dump.openError,
    unreadableKeys: dump.unreadableKeys,
    entries: encoded,
  });
  // Throws → no wipe. Nothing below runs unless the export is on disk.
  const savedTo = await sink.saveExport(DB_NAME, json);

  const complete = dump.openError == null && dump.unreadableKeys.length === 0;
  if (!complete) {
    const preserved = sink.preserveFiles ? await sink.preserveFiles(DB_NAME).catch(() => null) : null;
    if (!preserved) throw cause;
  }

  console.warn(`[storage] IndexedDB corrupt — exported to ${savedTo}, rebuilding:`, errMessage(cause));
  await deleteDatabase();
  const db = await openDbOnce();
  if (dump.entries.length) {
    const tx = db.transaction(KV_STORE, 'readwrite');
    const done = transactionDone(tx);
    const store = tx.objectStore(KV_STORE);
    for (const [key, value] of dump.entries) store.put(value, key);
    await done;
  }
  currentDb = db;
  dbPromise = Promise.resolve(db);
  try {
    void window.api?.logRendererError?.({
      subsystem: 'storage',
      operation: 'indexeddb-rebuilt',
      detail: `kept=${dump.entries.length} unreadable=${dump.unreadableKeys.length} export=${savedTo}`,
    });
  } catch {
    /* diagnostics are best effort */
  }
  return db;
}

// ── Public API ─────────────────────────────────────────────────────────────

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
  return withTransaction('readonly', async (store) => {
    const [keys, values] = await Promise.all([
      requestToPromise(store.getAllKeys()),
      requestToPromise(store.getAll()),
    ]);
    return keys.map((k, i) => [String(k), values[i]] as [string, unknown]);
  });
}

/**
 * Replace the whole kv store in ONE transaction: either every entry lands and
 * the old ones are gone, or the transaction aborts and the store is exactly as
 * it was. This is what a restore uses — the old restore cleared first and then
 * wrote key by key, ignoring failures.
 */
export async function kvReplaceAll(entries: Array<[string, unknown]>): Promise<void> {
  await withTransaction('readwrite', async (store) => {
    store.clear();
    const writes = entries.map(([key, value]) => requestToPromise(store.put(value, key)));
    await Promise.all(writes);
  });
}
