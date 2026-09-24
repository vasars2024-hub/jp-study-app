// @vitest-environment node
/**
 * `storage/db.ts` failure policy (audit: "a harmless IndexedDB error wipes the
 * whole store").
 *
 * Before the fix, `InvalidStateError` — what every call gets while a connection
 * is closing — was classified as corruption, and `withStore` deleted the whole
 * database with nothing exported. These tests pin the new contract:
 *
 * - a closing connection is retried on a fresh one and never deletes anything;
 * - one corruption report is not enough — it must repeat on a fresh connection;
 * - before any wipe the readable records are exported through the recovery sink,
 *   and put back afterwards;
 * - when records can't be read and the raw files can't be preserved, nothing is
 *   deleted and the error surfaces;
 * - `kvReplaceAll` is all-or-nothing.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';
import {
  DB_NAME,
  KV_STORE,
  __resetDbForTests,
  classifyIdbError,
  kvEntries,
  kvGet,
  kvReplaceAll,
  kvSet,
  setIdbRecoverySink,
} from '../storage/db';

let fake: FakeIndexedDb;
let exports: Array<{ db: string; json: string }>;
let preserveResult: string | null;

beforeEach(() => {
  fake = installFakeIndexedDb();
  __resetDbForTests();
  exports = [];
  preserveResult = 'C:/recovery/raw';
  setIdbRecoverySink({
    saveExport: async (db, json) => {
      exports.push({ db, json });
      return `C:/recovery/${db}.json`;
    },
    preserveFiles: async () => preserveResult,
  });
  fake.seed(DB_NAME, KV_STORE, { 'flashcard-deck': { cards: [1, 2, 3] }, 'csv-editor': 'draft' });
});

afterEach(() => {
  __resetDbForTests();
});

describe('classifyIdbError', () => {
  it('separates a closing connection from real corruption', () => {
    const dom = (name: string, msg: string) => new DOMException(msg, name);
    expect(classifyIdbError(dom('InvalidStateError', 'The database connection is closing.'))).toBe('stale');
    expect(classifyIdbError(dom('TransactionInactiveError', 'finished'))).toBe('stale');
    expect(classifyIdbError(dom('AbortError', 'aborted'))).toBe('stale');
    expect(classifyIdbError(dom('UnknownError', 'Corruption detected: bad block'))).toBe('corrupt');
    expect(classifyIdbError(dom('UnknownError', 'Checksum mismatch'))).toBe('corrupt');
    // Transient I/O / lock failure — must never lead to a wipe.
    expect(classifyIdbError(dom('UnknownError', 'Internal error opening backing store for indexedDB.open.'))).toBe('other');
    expect(classifyIdbError(dom('QuotaExceededError', 'quota'))).toBe('other');
    expect(classifyIdbError(dom('DataCloneError', 'could not be cloned'))).toBe('other');
  });
});

describe('stale connections are retried, never wiped', () => {
  it('retries an InvalidStateError on a fresh connection', async () => {
    expect(await kvGet('csv-editor')).toBe('draft');
    fake.failNext('get', 'InvalidStateError', 'The database connection is closing.');
    expect(await kvGet('flashcard-deck')).toEqual({ cards: [1, 2, 3] });
    expect(fake.deleteCalls).toEqual([]);
    expect(exports).toEqual([]);
  });

  it('survives every connection being closed underneath it', async () => {
    await kvGet('csv-editor');
    fake.closeAllConnections();
    await kvSet('csv-editor', 'new draft');
    expect(fake.rows(DB_NAME, KV_STORE)['csv-editor']).toBe('new draft');
    expect(fake.rows(DB_NAME, KV_STORE)['flashcard-deck']).toEqual({ cards: [1, 2, 3] });
    expect(fake.deleteCalls).toEqual([]);
  });

  it('a transient open failure is retried with backoff and does not wipe', async () => {
    fake.failNext('open', 'UnknownError', 'Internal error opening backing store for indexedDB.open.', 2);
    expect(await kvGet('csv-editor')).toBe('draft');
    expect(fake.deleteCalls).toEqual([]);
  });

  it('a persistent open failure throws and still does not wipe', async () => {
    fake.failNext('open', 'UnknownError', 'Internal error opening backing store for indexedDB.open.', 10);
    await expect(kvGet('csv-editor')).rejects.toThrow(/backing store/);
    expect(fake.deleteCalls).toEqual([]);
    fake.clearFaults();
  });

  it('with no IndexedDB at all, fails at once instead of waiting out the back-off', async () => {
    const g = globalThis as { indexedDB?: unknown };
    const saved = g.indexedDB;
    delete g.indexedDB;
    try {
      const started = Date.now();
      await expect(kvGet('csv-editor')).rejects.toThrow(/not available/);
      expect(Date.now() - started).toBeLessThan(100);
    } finally {
      g.indexedDB = saved;
    }
  });
});

describe('real corruption', () => {
  it('one corruption report is re-checked on a fresh connection before anything happens', async () => {
    fake.failNext('get', 'UnknownError', 'Corruption detected', 1);
    expect(await kvGet('csv-editor')).toBe('draft');
    expect(fake.deleteCalls).toEqual([]);
    expect(exports).toEqual([]);
  });

  it('exports readable records, rebuilds, and puts them back', async () => {
    fake.failNext('get', 'UnknownError', 'Corruption detected: block checksum mismatch', 2);
    expect(await kvGet('csv-editor')).toBe('draft');
    expect(fake.deleteCalls).toEqual([DB_NAME]);
    expect(exports).toHaveLength(1);
    const dump = JSON.parse(exports[0].json) as { entries: Record<string, unknown>; unreadableKeys: string[] };
    expect(dump.entries['flashcard-deck']).toEqual({ cards: [1, 2, 3] });
    expect(dump.unreadableKeys).toEqual([]);
    // Rebuilt store still holds everything that was readable.
    expect(fake.rows(DB_NAME, KV_STORE)).toEqual({ 'flashcard-deck': { cards: [1, 2, 3] }, 'csv-editor': 'draft' });
  });

  it('refuses to wipe when a record is unreadable and the raw files could not be preserved', async () => {
    preserveResult = null;
    // Two failing reads of the caller's key, then the per-key dump read fails too.
    fake.failNext('get', 'UnknownError', 'Corruption detected', 3, 'flashcard-deck');
    await expect(kvGet('flashcard-deck')).rejects.toThrow(/Corruption/);
    expect(fake.deleteCalls).toEqual([]);
    expect(fake.rows(DB_NAME, KV_STORE)['flashcard-deck']).toEqual({ cards: [1, 2, 3] });
    // The readable part was still exported.
    expect(JSON.parse(exports[0].json).unreadableKeys).toEqual(['flashcard-deck']);
  });

  it('refuses to wipe when the export cannot be written', async () => {
    setIdbRecoverySink({
      saveExport: async () => {
        throw new Error('disk full');
      },
    });
    fake.failNext('get', 'UnknownError', 'Corruption detected', 2);
    await expect(kvGet('csv-editor')).rejects.toThrow(/disk full|Corruption/);
    expect(fake.deleteCalls).toEqual([]);
  });

  it('with no recovery sink at all, never wipes', async () => {
    setIdbRecoverySink(null);
    fake.failNext('get', 'UnknownError', 'Corruption detected', 2);
    await expect(kvGet('csv-editor')).rejects.toThrow(/Corruption/);
    expect(fake.deleteCalls).toEqual([]);
  });
});

describe('kvReplaceAll', () => {
  it('replaces the whole store in one transaction', async () => {
    await kvReplaceAll([['a', 1], ['b', { x: 2 }]]);
    expect(await kvEntries()).toEqual([['a', 1], ['b', { x: 2 }]]);
  });

  it('leaves the store untouched when any write fails', async () => {
    fake.failNext('put', 'QuotaExceededError', 'quota', 1, 'b');
    await expect(kvReplaceAll([['a', 1], ['b', 2], ['c', 3]])).rejects.toThrow(/quota/);
    expect(fake.rows(DB_NAME, KV_STORE)).toEqual({ 'flashcard-deck': { cards: [1, 2, 3] }, 'csv-editor': 'draft' });
  });
});
