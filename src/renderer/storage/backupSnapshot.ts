/**
 * The renderer half of a backup: localStorage + every IndexedDB database, as
 * plain JSON with no origin in it (audit robust #1).
 *
 * Why origin-free matters: dev builds run the renderer on
 * http://localhost:5173 and packaged builds on app://bundle, and Chromium keys
 * localStorage/IndexedDB by origin — the two builds have separate renderer data
 * in the same userData folder. A snapshot from either restores into either.
 *
 * Applying a snapshot is all-or-nothing: the current data is captured first,
 * IndexedDB is replaced one transaction per database (a failed put aborts the
 * transaction and leaves it untouched), and any failure restores what was
 * there. The old `importAllData` cleared everything, ignored failed writes and
 * reported success.
 */
import { decodeIdbValue, encodeIdbValue } from './idbJson';
import { DB_NAME, DB_VERSION, KV_STORE } from './db';

export const SNAPSHOT_KIND = 'renderer-snapshot';
export const SNAPSHOT_FORMAT = 1;

export interface SnapshotStore {
  keyPath: string | string[] | null;
  autoIncrement: boolean;
  /** [key, encoded value]; the key is omitted from `put` for in-line-key stores. */
  entries: Array<[IDBValidKey, unknown]>;
}

export interface SnapshotDatabase {
  version: number;
  stores: Record<string, SnapshotStore>;
}

export interface RendererSnapshot {
  app: 'jp-study-app';
  kind: typeof SNAPSHOT_KIND;
  format: typeof SNAPSHOT_FORMAT;
  createdAt: string;
  localStorage: Record<string, string>;
  indexedDb: Record<string, SnapshotDatabase>;
}

export function isRendererSnapshot(value: unknown): value is RendererSnapshot {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<RendererSnapshot>;
  if (!v.localStorage || typeof v.localStorage !== 'object') return false;
  if (!v.indexedDb || typeof v.indexedDb !== 'object') return false;
  return Object.values(v.indexedDb).every(
    (db) => db && typeof db === 'object' && typeof db.stores === 'object' && db.stores !== null,
  );
}

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('IndexedDB request failed'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

function openExisting(name: string, version?: number, upgrade?: (db: IDBDatabase) => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = version == null ? indexedDB.open(name) : indexedDB.open(name, version);
    r.onupgradeneeded = () => upgrade?.(r.result);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error(`Could not open ${name}`));
  });
}

/**
 * Open the app's own database the way `db.ts` does — at DB_VERSION, creating
 * the kv store on first open. A bare `indexedDB.open(name)` on a fresh profile
 * would create it at version 1 WITHOUT the store, and `db.ts` (which opens at
 * version 1 too) would then never get an upgrade to add it.
 */
function openAppDb(): Promise<IDBDatabase> {
  return openExisting(DB_NAME, DB_VERSION, (up) => {
    if (!up.objectStoreNames.contains(KV_STORE)) up.createObjectStore(KV_STORE);
  });
}

async function existingDatabaseNames(): Promise<Set<string>> {
  const factory = indexedDB as IDBFactory & { databases?: () => Promise<Array<{ name?: string }>> };
  const names = new Set<string>();
  try {
    for (const d of (await factory.databases?.()) ?? []) if (d.name) names.add(d.name);
  } catch {
    /* databases() is Chromium-only; the app's own database is always included */
  }
  return names;
}

async function databaseNames(): Promise<string[]> {
  const names = await existingDatabaseNames();
  names.add(DB_NAME);
  return Array.from(names).sort();
}

function readLocalStorage(): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k == null) continue;
    const v = localStorage.getItem(k);
    if (v != null) out[k] = v;
  }
  return out;
}

async function dumpDatabase(name: string): Promise<SnapshotDatabase | null> {
  let db: IDBDatabase;
  try {
    db = name === DB_NAME ? await openAppDb() : await openExisting(name);
  } catch {
    return null;
  }
  try {
    const storeNames = Array.from(db.objectStoreNames as unknown as Iterable<string>);
    const out: SnapshotDatabase = { version: db.version, stores: {} };
    if (!storeNames.length) return out;
    const tx = db.transaction(storeNames, 'readonly');
    for (const storeName of storeNames) {
      const store = tx.objectStore(storeName);
      const [keys, values] = await Promise.all([req(store.getAllKeys()), req(store.getAll())]);
      const entries: Array<[IDBValidKey, unknown]> = [];
      for (let i = 0; i < keys.length; i++) entries.push([keys[i], await encodeIdbValue(values[i])]);
      out.stores[storeName] = {
        keyPath: (store as { keyPath?: string | string[] | null }).keyPath ?? null,
        autoIncrement: Boolean((store as { autoIncrement?: boolean }).autoIncrement),
        entries,
      };
    }
    return out;
  } finally {
    db.close();
  }
}

/** Everything the renderer holds, as JSON-safe data. */
export async function collectRendererSnapshot(options: { mirrorReading?: boolean } = {}): Promise<RendererSnapshot> {
  // Highlights and bookmarks live per book in localStorage and are mirrored
  // into IndexedDB lazily; make the mirror current first (the old export did too).
  if (options.mirrorReading !== false) {
    try {
      const { collectAllAnnotationsMap } = await import('../annotations');
      const { collectAllBookmarksMap } = await import('../bookmarks');
      const { kvSet } = await import('./db');
      const { IDB_KEYS } = await import('./storage');
      await kvSet(IDB_KEYS.annotations, collectAllAnnotationsMap());
      await kvSet(IDB_KEYS.bookmarks, collectAllBookmarksMap());
    } catch {
      /* the localStorage copies are in the snapshot regardless */
    }
  }
  const indexedDb: Record<string, SnapshotDatabase> = {};
  for (const name of await databaseNames()) {
    const dump = await dumpDatabase(name);
    if (dump) indexedDb[name] = dump;
  }
  return {
    app: 'jp-study-app',
    kind: SNAPSHOT_KIND,
    format: SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    localStorage: readLocalStorage(),
    indexedDb,
  };
}

// ── serialized in slices, for a backup ───────────────────────────────────────

/** Serialize for at most this long before letting the page (input, paint) run. */
const SLICE_MS = 8;

function makeYielder(): () => Promise<void> {
  let sliceStart = performance.now();
  return async () => {
    if (performance.now() - sliceStart < SLICE_MS) return;
    await new Promise((resolve) => setTimeout(resolve, 0));
    sliceStart = performance.now();
  };
}

/** One database as the JSON text `JSON.stringify(dumpDatabase(name))` would give. */
async function dumpDatabaseText(name: string, pause: () => Promise<void>): Promise<string | null> {
  let db: IDBDatabase;
  try {
    db = name === DB_NAME ? await openAppDb() : await openExisting(name);
  } catch {
    return null;
  }
  try {
    const storeNames = Array.from(db.objectStoreNames as unknown as Iterable<string>);
    const stores: string[] = [];
    if (storeNames.length) {
      // Every read is issued in the one transaction before anything is awaited,
      // so the snapshot is consistent across stores.
      const tx = db.transaction(storeNames, 'readonly');
      const reads = storeNames.map((storeName) => {
        const store = tx.objectStore(storeName);
        return Promise.all([req(store.getAllKeys()), req(store.getAll())]).then(([keys, values]) => ({
          storeName,
          keyPath: (store as { keyPath?: string | string[] | null }).keyPath ?? null,
          autoIncrement: Boolean((store as { autoIncrement?: boolean }).autoIncrement),
          keys,
          values,
        }));
      });
      for (const { storeName, keyPath, autoIncrement, keys, values } of await Promise.all(reads)) {
        const entries: string[] = [];
        for (let i = 0; i < keys.length; i++) {
          entries.push(JSON.stringify([keys[i], await encodeIdbValue(values[i])]));
          await pause();
        }
        stores.push(`${JSON.stringify(storeName)}:{"keyPath":${JSON.stringify(keyPath)},"autoIncrement":${JSON.stringify(autoIncrement)},"entries":[${entries.join(',')}]}`);
      }
    }
    return `{"version":${JSON.stringify(db.version)},"stores":{${stores.join(',')}}}`;
  } finally {
    db.close();
  }
}

/**
 * Everything the renderer holds, as the JSON text of a `RendererSnapshot`
 * (plus a small `summary` header the main process reads for the manifest).
 *
 * Built a record at a time with the page yielding every few milliseconds:
 * collecting the snapshot as one object, then having IPC clone it and main
 * stringify it, held the UI thread and then the main process for seconds on
 * every automatic backup (3.4-5.6 s measured). The text is what renderer.json
 * contains, byte for byte what `JSON.stringify(collectRendererSnapshot())`
 * would give apart from the header.
 */
export async function collectRendererSnapshotText(options: { mirrorReading?: boolean } = {}): Promise<string> {
  if (options.mirrorReading !== false) {
    try {
      const { collectAllAnnotationsMap } = await import('../annotations');
      const { collectAllBookmarksMap } = await import('../bookmarks');
      const { kvSet } = await import('./db');
      const { IDB_KEYS } = await import('./storage');
      await kvSet(IDB_KEYS.annotations, collectAllAnnotationsMap());
      await kvSet(IDB_KEYS.bookmarks, collectAllBookmarksMap());
    } catch {
      /* the localStorage copies are in the snapshot regardless */
    }
  }
  const pause = makeYielder();
  const databases: string[] = [];
  const dbTexts: string[] = [];
  for (const name of await databaseNames()) {
    const text = await dumpDatabaseText(name, pause);
    if (text == null) continue;
    databases.push(name);
    dbTexts.push(`${JSON.stringify(name)}:${text}`);
  }
  const local = readLocalStorage();
  const localEntries: string[] = [];
  for (const [key, value] of Object.entries(local)) {
    localEntries.push(`${JSON.stringify(key)}:${JSON.stringify(value)}`);
    await pause();
  }
  const header = JSON.stringify({
    app: 'jp-study-app',
    kind: SNAPSHOT_KIND,
    format: SNAPSHOT_FORMAT,
    createdAt: new Date().toISOString(),
    summary: { localStorageKeys: localEntries.length, indexedDbDatabases: databases },
  });
  return `${header.slice(0, -1)},"localStorage":{${localEntries.join(',')}},"indexedDb":{${dbTexts.join(',')}}}`;
}

// ── apply ────────────────────────────────────────────────────────────────────

export interface ApplyFailure {
  area: 'localStorage' | 'indexedDb';
  target: string;
  error: string;
}

export class SnapshotApplyError extends Error {
  constructor(
    readonly failures: ApplyFailure[],
    /** Anything the rollback itself could not put back. Empty means "exactly as before". */
    readonly rollbackFailures: ApplyFailure[],
  ) {
    super(failures.map((f) => `${f.area} ${f.target}: ${f.error}`).join('; '));
    this.name = 'SnapshotApplyError';
  }
}

const errText = (err: unknown): string => (err instanceof Error ? `${err.name}: ${err.message}` : String(err));

function writeLocalStorage(next: Record<string, string>): ApplyFailure | null {
  localStorage.clear();
  for (const [key, value] of Object.entries(next)) {
    try {
      localStorage.setItem(key, String(value));
    } catch (err) {
      return { area: 'localStorage', target: key, error: errText(err) };
    }
  }
  return null;
}

async function replaceDatabase(name: string, snap: SnapshotDatabase): Promise<void> {
  const wanted = Object.keys(snap.stores);
  const createStore = (up: IDBDatabase, s: string): void => {
    const def = snap.stores[s];
    up.createObjectStore(s, def.keyPath != null ? { keyPath: def.keyPath, autoIncrement: def.autoIncrement } : { autoIncrement: def.autoIncrement });
  };
  let conn: IDBDatabase | null = null;
  if (name === DB_NAME) {
    conn = await openAppDb();
  } else if ((await existingDatabaseNames()).has(name)) {
    conn = await openExisting(name);
  }
  if (conn && wanted.some((s) => !conn?.objectStoreNames.contains(s))) {
    const missing = wanted.filter((s) => !conn?.objectStoreNames.contains(s));
    const existingVersion = conn.version;
    conn.close();
    // Never bump the version of a database the app owns: its code opens it at a
    // fixed version and would then fail with VersionError on every call.
    if (name === DB_NAME) {
      throw new Error(`object store(s) missing: ${missing.join(', ')}`);
    }
    conn = await openExisting(name, existingVersion + 1, (up) => {
      for (const s of missing) createStore(up, s);
    });
  }
  if (!conn) {
    conn = await openExisting(name, Math.max(1, snap.version || 1), (up) => {
      for (const s of wanted) if (!up.objectStoreNames.contains(s)) createStore(up, s);
    });
  }
  const target = conn;
  try {
    if (!wanted.length) return;
    const tx = target.transaction(wanted, 'readwrite');
    const done = txDone(tx);
    done.catch(() => undefined);
    const writes: Array<Promise<unknown>> = [];
    for (const storeName of wanted) {
      const def = snap.stores[storeName];
      const store = tx.objectStore(storeName);
      writes.push(req(store.clear()));
      for (const [key, value] of def.entries) {
        const decoded = decodeIdbValue(value);
        writes.push(req(def.keyPath != null ? store.put(decoded) : store.put(decoded, key)));
      }
    }
    await Promise.all(writes);
    await done;
  } finally {
    target.close();
  }
}

/**
 * Replace this origin's localStorage and IndexedDB with `snapshot`. Resolves
 * with a `rollback` that puts back what was there and `before`, the data it
 * replaced; throws `SnapshotApplyError` (after rolling back itself) when any
 * write fails. Callers flush pending IndexedDB mirrors first
 * (`flushPendingMirrors`) so `before` holds the latest edits.
 */
export async function applyRendererSnapshot(
  snapshot: RendererSnapshot,
): Promise<{ rollback: () => Promise<void>; before: RendererSnapshot }> {
  if (!isRendererSnapshot(snapshot)) {
    throw new SnapshotApplyError([{ area: 'localStorage', target: 'snapshot', error: 'unexpected shape' }], []);
  }
  const before = await collectRendererSnapshot({ mirrorReading: false });
  const restoreBefore = async (): Promise<ApplyFailure[]> => {
    const problems: ApplyFailure[] = [];
    const lsFail = writeLocalStorage(before.localStorage);
    if (lsFail) problems.push(lsFail);
    for (const [name, db] of Object.entries(before.indexedDb)) {
      try {
        await replaceDatabase(name, db);
      } catch (err) {
        problems.push({ area: 'indexedDb', target: name, error: errText(err) });
      }
    }
    return problems;
  };

  const failures: ApplyFailure[] = [];
  const lsFail = writeLocalStorage(snapshot.localStorage);
  if (lsFail) failures.push(lsFail);
  if (!failures.length) {
    for (const [name, db] of Object.entries(snapshot.indexedDb)) {
      try {
        await replaceDatabase(name, db);
      } catch (err) {
        failures.push({ area: 'indexedDb', target: name, error: errText(err) });
        break;
      }
    }
  }
  if (failures.length) {
    const rollbackFailures = await restoreBefore();
    throw new SnapshotApplyError(failures, rollbackFailures);
  }
  return {
    rollback: async () => {
      const problems = await restoreBefore();
      if (problems.length) throw new SnapshotApplyError(problems, problems);
    },
    // What was replaced — main keeps it in the pre-restore folder.
    before,
  };
}

// ── the old single-JSON export ("format 1/2") ────────────────────────────────

export interface LegacyBackup {
  app: 'jp-study-app';
  format?: number;
  exportedAt?: number;
  localStorage: Record<string, string>;
  indexedDb: Record<string, unknown>;
  host?: Record<string, unknown>;
}

export function isLegacyBackup(value: unknown): value is LegacyBackup {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LegacyBackup>;
  return v.app === 'jp-study-app' && !!v.localStorage && typeof v.localStorage === 'object' && !!v.indexedDb && typeof v.indexedDb === 'object';
}

/** The old export held the kv store's raw values; turn it into a snapshot. */
export function legacyToSnapshot(legacy: LegacyBackup): RendererSnapshot {
  const localStorageData: Record<string, string> = {};
  for (const [k, v] of Object.entries(legacy.localStorage)) localStorageData[k] = typeof v === 'string' ? v : JSON.stringify(v);
  return {
    app: 'jp-study-app',
    kind: SNAPSHOT_KIND,
    format: SNAPSHOT_FORMAT,
    createdAt: new Date(legacy.exportedAt ?? Date.now()).toISOString(),
    localStorage: localStorageData,
    indexedDb: {
      [DB_NAME]: {
        version: 1,
        stores: { [KV_STORE]: { keyPath: null, autoIncrement: false, entries: Object.entries(legacy.indexedDb) } },
      },
    },
  };
}
