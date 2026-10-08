/* IndexedDB helper shared by the service worker, the offscreen recorder and the
 * toolbar popup (all three are the extension's own origin, so they see one
 * database).
 *
 * Why IndexedDB and not chrome.storage.local: storage.local is 10 MB and this
 * manifest does not ask for unlimitedStorage. Recordings, queued audio and the
 * offline lookup cache are all bigger than that in ordinary use, and a write
 * that hits the quota loses data the user was told was safe.
 *
 * Stores:
 *   blobs     { key, data, at }                  queued request bodies (audio)
 *   lookups   { key, value, at }                 offline dictionary cache (LRU by `at`)
 *   recs      { id, ...meta }                    recordings and their upload state
 *   chunks    { key: `${recId}:${seq}`, recId, seq, data, size }
 *   meta      { key, value, at }                 known-word snapshot (key 'known-snapshot')
 *
 * Where IndexedDB does not exist (the vm sandbox the tests use) an in-memory
 * store with the same API stands in, so every caller has one code path.
 */
(function () {
  if (globalThis.jpStudyIdb) return;

  const DB_NAME = 'gum-extension';
  // v2 adds `meta` (the known-word snapshot); the upgrade only creates missing stores.
  const DB_VERSION = 2;
  const STORES = {
    blobs: { keyPath: 'key', indexes: ['at'] },
    lookups: { keyPath: 'key', indexes: ['at'] },
    recs: { keyPath: 'id', indexes: [] },
    chunks: { keyPath: 'key', indexes: ['recId'] },
    meta: { keyPath: 'key', indexes: [] },
  };

  function memoryBackend() {
    const tables = {};
    for (const name of Object.keys(STORES)) tables[name] = new Map();
    const keyOf = (store, value) => value[STORES[store].keyPath];
    return {
      kind: 'memory',
      async get(store, key) {
        const v = tables[store].get(key);
        return v === undefined ? undefined : v;
      },
      async put(store, value) {
        tables[store].set(keyOf(store, value), value);
      },
      async delete(store, key) {
        tables[store].delete(key);
      },
      async getAll(store) {
        return [...tables[store].values()];
      },
      async getAllByIndex(store, index, value) {
        return [...tables[store].values()].filter((v) => v[index] === value);
      },
      async deleteByIndex(store, index, value) {
        for (const [k, v] of [...tables[store].entries()]) if (v[index] === value) tables[store].delete(k);
      },
      async count(store) {
        return tables[store].size;
      },
      async oldestKeys(store, n) {
        return [...tables[store].values()]
          .sort((a, b) => (a.at || 0) - (b.at || 0))
          .slice(0, n)
          .map((v) => keyOf(store, v));
      },
      async clear(store) {
        tables[store].clear();
      },
    };
  }

  function idbBackend() {
    let dbPromise = null;
    function open() {
      if (dbPromise) return dbPromise;
      dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          for (const [name, spec] of Object.entries(STORES)) {
            if (db.objectStoreNames.contains(name)) continue;
            const os = db.createObjectStore(name, { keyPath: spec.keyPath });
            for (const index of spec.indexes) os.createIndex(index, index, { unique: false });
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          // Another context upgrading the schema closes this handle; reopen lazily.
          db.onversionchange = () => {
            db.close();
            dbPromise = null;
          };
          resolve(db);
        };
        req.onerror = () => {
          dbPromise = null;
          reject(req.error || new Error('IndexedDB open failed'));
        };
      });
      return dbPromise;
    }
    async function tx(store, mode, fn) {
      const db = await open();
      return new Promise((resolve, reject) => {
        const t = db.transaction(store, mode);
        const os = t.objectStore(store);
        let result;
        Promise.resolve(fn(os, (r) => (result = r))).catch(reject);
        t.oncomplete = () => resolve(result);
        t.onerror = () => reject(t.error || new Error('IndexedDB transaction failed'));
        t.onabort = () => reject(t.error || new Error('IndexedDB transaction aborted'));
      });
    }
    const reqResult = (req, set) => {
      req.onsuccess = () => set(req.result);
    };
    return {
      kind: 'indexeddb',
      get: (store, key) => tx(store, 'readonly', (os, set) => reqResult(os.get(key), set)),
      put: (store, value) => tx(store, 'readwrite', (os) => void os.put(value)),
      delete: (store, key) => tx(store, 'readwrite', (os) => void os.delete(key)),
      getAll: (store) => tx(store, 'readonly', (os, set) => reqResult(os.getAll(), set)),
      getAllByIndex: (store, index, value) =>
        tx(store, 'readonly', (os, set) => reqResult(os.index(index).getAll(value), set)),
      deleteByIndex: (store, index, value) =>
        tx(store, 'readwrite', (os) => {
          const req = os.index(index).openKeyCursor(value);
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor) return;
            os.delete(cursor.primaryKey);
            cursor.continue();
          };
        }),
      count: (store) => tx(store, 'readonly', (os, set) => reqResult(os.count(), set)),
      oldestKeys: (store, n) =>
        tx(store, 'readonly', (os, set) => {
          const keys = [];
          const req = os.index('at').openKeyCursor();
          req.onsuccess = () => {
            const cursor = req.result;
            if (!cursor || keys.length >= n) {
              set(keys);
              return;
            }
            keys.push(cursor.primaryKey);
            cursor.continue();
          };
        }),
      clear: (store) => tx(store, 'readwrite', (os) => void os.clear()),
    };
  }

  const backend = typeof indexedDB !== 'undefined' && indexedDB ? idbBackend() : memoryBackend();

  /** Never throws: a broken database must degrade a feature, not the caller. */
  function safe(fn, fallback) {
    return async (...args) => {
      try {
        return await fn(...args);
      } catch (err) {
        if (typeof console !== 'undefined') console.warn('[Gum idb]', err && err.message ? err.message : err);
        return typeof fallback === 'function' ? fallback() : fallback;
      }
    };
  }

  /** Keep a store at or under `max` rows by dropping the oldest `at` first. */
  async function trim(store, max) {
    const n = await backend.count(store);
    if (n <= max) return 0;
    const drop = await backend.oldestKeys(store, n - max);
    for (const key of drop) await backend.delete(store, key);
    return drop.length;
  }

  globalThis.jpStudyIdb = {
    kind: backend.kind,
    get: safe(backend.get, undefined),
    put: safe(async (store, value) => {
      await backend.put(store, value);
      return true;
    }, false),
    /** Like put, but lets the caller see the failure (quota) instead of swallowing it. */
    putStrict: (store, value) => backend.put(store, value),
    delete: safe(backend.delete, undefined),
    getAll: safe(backend.getAll, () => []),
    getAllByIndex: safe(backend.getAllByIndex, () => []),
    deleteByIndex: safe(backend.deleteByIndex, undefined),
    count: safe(backend.count, 0),
    clear: safe(backend.clear, undefined),
    trim: safe(trim, 0),
  };
})();
