/**
 * A small in-memory IndexedDB for tests — `fake-indexeddb` is not in
 * node_modules and adding a dependency is off the table, so this implements
 * exactly the surface `storage/db.ts` and `storage/backupSnapshot.ts` use:
 *
 *   indexedDB.open / deleteDatabase / databases
 *   IDBDatabase.transaction / createObjectStore / objectStoreNames / close
 *   IDBTransaction.objectStore / oncomplete / onerror / onabort
 *   IDBObjectStore.get / put / delete / clear / getAllKeys / getAll / count
 *
 * Transactions are real in the one way that matters for the tests: writes are
 * staged and only land when every request in the transaction succeeded, so a
 * failure mid-transaction leaves the store exactly as it was.
 *
 * Fault injection (`failNext`) makes a chosen operation reject with a
 * DOMException of a chosen name, which is how the tests reproduce a closing
 * connection (InvalidStateError) versus real corruption (UnknownError).
 */

type Key = string;

interface StoreData {
  rows: Map<Key, unknown>;
}

interface DbData {
  version: number;
  stores: Map<string, StoreData>;
}

type Op = 'open' | 'transaction' | 'get' | 'put' | 'delete' | 'clear' | 'getAllKeys' | 'getAll' | 'count';

interface Fault {
  op: Op;
  name: string;
  message: string;
  remaining: number;
  /** Only fail for this key (get/put/delete). */
  key?: string;
}

function domError(name: string, message: string): Error {
  if (typeof DOMException === 'function') return new DOMException(message, name) as unknown as Error;
  const err = new Error(message);
  err.name = name;
  return err;
}

function later(fn: () => void): void {
  setTimeout(fn, 0);
}

class FakeRequest<T = unknown> {
  result: T | undefined = undefined;
  error: Error | null = null;
  onsuccess: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onupgradeneeded: ((ev: unknown) => void) | null = null;
  onblocked: ((ev: unknown) => void) | null = null;
  readyState: 'pending' | 'done' = 'pending';
  succeed(value: T): void {
    this.result = value;
    this.readyState = 'done';
    this.onsuccess?.({ target: this });
  }
  fail(err: Error): void {
    this.error = err;
    this.readyState = 'done';
    this.onerror?.({ target: this, preventDefault() { /* no-op */ } });
  }
}

class FakeStringList {
  constructor(private readonly names: () => string[]) {}
  contains(name: string): boolean {
    return this.names().includes(name);
  }
  get length(): number {
    return this.names().length;
  }
  item(i: number): string | null {
    return this.names()[i] ?? null;
  }
  [Symbol.iterator](): Iterator<string> {
    return this.names()[Symbol.iterator]();
  }
}

interface PendingOp {
  request: FakeRequest;
  run: (staged: Map<string, Map<Key, unknown>>) => unknown;
  op: Op;
  key?: string;
}

class FakeTransaction {
  oncomplete: ((ev: unknown) => void) | null = null;
  onerror: ((ev: unknown) => void) | null = null;
  onabort: ((ev: unknown) => void) | null = null;
  error: Error | null = null;
  private readonly pending: PendingOp[] = [];
  private scheduled = false;
  private finished = false;

  constructor(
    private readonly factory: FakeIndexedDb,
    private readonly db: FakeDatabase,
    private readonly scope: string[],
    readonly mode: IDBTransactionMode,
  ) {}

  objectStore(name: string): FakeObjectStore {
    if (!this.scope.includes(name)) throw domError('NotFoundError', `No objectStore named ${name} in this transaction`);
    return new FakeObjectStore(this, name);
  }

  abort(): void {
    if (this.finished) return;
    this.finished = true;
    this.error = domError('AbortError', 'The transaction was aborted');
    later(() => this.onabort?.({ target: this }));
  }

  enqueue(op: Op, run: PendingOp['run'], key?: string): FakeRequest {
    if (this.finished) throw domError('TransactionInactiveError', 'The transaction has finished.');
    if (this.db.closed) throw domError('InvalidStateError', 'The database connection is closing.');
    const request = new FakeRequest();
    this.pending.push({ request, run, op, key });
    if (!this.scheduled) {
      this.scheduled = true;
      later(() => this.execute());
    }
    return request;
  }

  private execute(): void {
    const data = this.factory.data.get(this.db.name);
    const staged = new Map<string, Map<Key, unknown>>();
    for (const name of this.scope) {
      staged.set(name, new Map(data?.stores.get(name)?.rows ?? []));
    }
    for (const item of this.pending) {
      const fault = this.factory.takeFault(item.op, item.key);
      if (fault || this.db.closed) {
        const err = fault ?? domError('InvalidStateError', 'The database connection is closing.');
        this.finished = true;
        this.error = err;
        item.request.fail(err);
        this.onerror?.({ target: this });
        this.onabort?.({ target: this });
        return;
      }
      try {
        item.request.succeed(item.run(staged) as never);
      } catch (err) {
        this.finished = true;
        this.error = err as Error;
        item.request.fail(err as Error);
        this.onerror?.({ target: this });
        this.onabort?.({ target: this });
        return;
      }
    }
    if (this.mode === 'readwrite' && data) {
      for (const [name, rows] of staged) {
        const store = data.stores.get(name);
        if (store) store.rows = rows;
      }
    }
    this.finished = true;
    later(() => this.oncomplete?.({ target: this }));
  }
}

class FakeObjectStore {
  constructor(private readonly tx: FakeTransaction, readonly name: string) {}

  private rows(staged: Map<string, Map<Key, unknown>>): Map<Key, unknown> {
    return staged.get(this.name)!;
  }

  get(key: Key): FakeRequest {
    return this.tx.enqueue('get', (s) => structuredClone(this.rows(s).get(String(key))), String(key));
  }
  put(value: unknown, key: Key): FakeRequest {
    if (this.tx.mode !== 'readwrite') throw domError('ReadOnlyError', 'The transaction is read-only.');
    const clone = structuredClone(value);
    return this.tx.enqueue('put', (s) => {
      this.rows(s).set(String(key), clone);
      return String(key);
    }, String(key));
  }
  delete(key: Key): FakeRequest {
    return this.tx.enqueue('delete', (s) => {
      this.rows(s).delete(String(key));
      return undefined;
    }, String(key));
  }
  clear(): FakeRequest {
    return this.tx.enqueue('clear', (s) => {
      this.rows(s).clear();
      return undefined;
    });
  }
  getAllKeys(): FakeRequest {
    return this.tx.enqueue('getAllKeys', (s) => Array.from(this.rows(s).keys()).sort());
  }
  getAll(): FakeRequest {
    return this.tx.enqueue('getAll', (s) => {
      const rows = this.rows(s);
      return Array.from(rows.keys()).sort().map((k) => structuredClone(rows.get(k)));
    });
  }
  count(): FakeRequest {
    return this.tx.enqueue('count', (s) => this.rows(s).size);
  }
}

class FakeDatabase {
  closed = false;
  onclose: (() => void) | null = null;
  onversionchange: (() => void) | null = null;
  readonly objectStoreNames: FakeStringList;

  constructor(private readonly factory: FakeIndexedDb, readonly name: string) {
    this.objectStoreNames = new FakeStringList(() =>
      Array.from(this.factory.data.get(this.name)?.stores.keys() ?? []).sort(),
    );
  }

  get version(): number {
    return this.factory.data.get(this.name)?.version ?? 0;
  }

  createObjectStore(name: string): void {
    const data = this.factory.data.get(this.name);
    if (!data) throw domError('InvalidStateError', 'Database is gone');
    if (!data.stores.has(name)) data.stores.set(name, { rows: new Map() });
  }

  transaction(stores: string | string[], mode: IDBTransactionMode = 'readonly'): FakeTransaction {
    if (this.closed) throw domError('InvalidStateError', 'The database connection is closing.');
    const fault = this.factory.takeFault('transaction');
    if (fault) throw fault;
    const scope = Array.isArray(stores) ? stores : [stores];
    for (const s of scope) {
      if (!this.objectStoreNames.contains(s)) throw domError('NotFoundError', `No objectStore named ${s}`);
    }
    return new FakeTransaction(this.factory, this, scope, mode);
  }

  close(): void {
    this.closed = true;
  }
}

export class FakeIndexedDb {
  readonly data = new Map<string, DbData>();
  readonly connections: FakeDatabase[] = [];
  private faults: Fault[] = [];
  deleteCalls: string[] = [];

  /** Make the next `times` calls of `op` fail with a DOMException `name`. */
  failNext(op: Op, name: string, message = `${name} (injected)`, times = 1, key?: string): void {
    this.faults.push({ op, name, message, remaining: times, key });
  }

  clearFaults(): void {
    this.faults = [];
  }

  takeFault(op: Op, key?: string): Error | null {
    const idx = this.faults.findIndex((f) => f.op === op && f.remaining > 0 && (f.key == null || f.key === key));
    if (idx < 0) return null;
    const fault = this.faults[idx];
    fault.remaining -= 1;
    if (fault.remaining <= 0) this.faults.splice(idx, 1);
    return domError(fault.name, fault.message);
  }

  /** Simulate Chromium closing every live connection (the "stale connection" case). */
  closeAllConnections(): void {
    for (const c of this.connections) c.closed = true;
  }

  /** Seed a database with rows directly (bypassing requests). */
  seed(dbName: string, store: string, rows: Record<string, unknown>, version = 1): void {
    const db = this.data.get(dbName) ?? { version, stores: new Map() };
    db.version = Math.max(db.version, version);
    const s = db.stores.get(store) ?? { rows: new Map() };
    for (const [k, v] of Object.entries(rows)) s.rows.set(k, structuredClone(v));
    db.stores.set(store, s);
    this.data.set(dbName, db);
  }

  rows(dbName: string, store: string): Record<string, unknown> {
    const s = this.data.get(dbName)?.stores.get(store);
    return Object.fromEntries(s?.rows ?? []);
  }

  open(name: string, version?: number): FakeRequest {
    const request = new FakeRequest<FakeDatabase>();
    later(() => {
      const fault = this.takeFault('open');
      if (fault) {
        request.fail(fault);
        return;
      }
      const existing = this.data.get(name);
      const target = version ?? existing?.version ?? 1;
      if (existing && target < existing.version) {
        request.fail(domError('VersionError', 'Requested version is lower than the existing version'));
        return;
      }
      const db = new FakeDatabase(this, name);
      this.connections.push(db);
      request.result = db;
      if (!existing || target > existing.version) {
        const data = existing ?? { version: 0, stores: new Map() };
        data.version = target;
        this.data.set(name, data);
        request.onupgradeneeded?.({ target: request, oldVersion: existing?.version ?? 0, newVersion: target });
      }
      request.succeed(db);
    });
    return request;
  }

  deleteDatabase(name: string): FakeRequest {
    const request = new FakeRequest<undefined>();
    this.deleteCalls.push(name);
    later(() => {
      for (const c of this.connections) {
        if (c.name === name && !c.closed) {
          c.onversionchange?.();
        }
      }
      this.data.delete(name);
      request.succeed(undefined);
    });
    return request;
  }

  databases(): Promise<Array<{ name: string; version: number }>> {
    return Promise.resolve(
      Array.from(this.data.entries()).map(([name, d]) => ({ name, version: d.version })),
    );
  }
}

/** Install a fresh fake as `globalThis.indexedDB` and return it. */
export function installFakeIndexedDb(): FakeIndexedDb {
  const fake = new FakeIndexedDb();
  (globalThis as { indexedDB?: unknown }).indexedDB = fake;
  return fake;
}

/** A Map-backed localStorage with an optional write fault. */
export class FakeLocalStorage {
  private map = new Map<string, string>();
  /** When set, `setItem` for this key throws QuotaExceededError. */
  failKey: string | null = null;
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return Array.from(this.map.keys())[i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    if (this.failKey != null && k === this.failKey) throw domError('QuotaExceededError', 'quota');
    this.map.set(k, String(v));
  }
  removeItem(k: string): void {
    this.map.delete(k);
  }
  clear(): void {
    this.map.clear();
  }
  snapshot(): Record<string, string> {
    return Object.fromEntries(this.map);
  }
}
