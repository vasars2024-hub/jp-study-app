// @vitest-environment jsdom
/**
 * Two boot costs that did the same work every launch:
 *
 * - the storage migration read every heavy store (the deck included) and
 *   deep-copied it four or five times per boot, for a plan that changed
 *   nothing once the stored version was current;
 * - the kuromoji dictionary (~18 MB of gzip) was inflated with
 *   `fflate.gunzipSync` on the UI thread (1.28 s measured).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { Blob as NodeBlob } from 'node:buffer';
import { installFakeIndexedDb } from './helpers/fakeIndexedDb';

const reads = vi.hoisted(() => ({ keys: [] as string[] }));
const gunzip = vi.hoisted(() => ({ calls: 0 }));

vi.mock('../storage/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/db')>();
  return {
    ...actual,
    kvGet: async <T,>(key: string): Promise<T | undefined> => {
      reads.keys.push(key);
      return actual.kvGet<T>(key);
    },
  };
});
vi.mock('../annotations', () => ({ restoreAnnotationsFromIdb: async () => undefined }));
vi.mock('../bookmarks', () => ({ restoreBookmarksFromIdb: async () => undefined }));
vi.mock('../levelLists', () => ({ restoreLevelListsFromIdb: async () => undefined }));
vi.mock('fflate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('fflate')>();
  return {
    ...actual,
    gunzipSync: (data: Uint8Array) => {
      gunzip.calls += 1;
      return actual.gunzipSync(data);
    },
  };
});

import { __resetDbForTests, kvSet } from '../storage/db';
import { runStorageMigrations } from '../storage/migrationRunner';
import { LS_KEYS } from '../storage/storage';
import {
  STORAGE_MIGRATION_VERSION,
  looksLikeJsonContainer,
  storageMigrationNeeded,
} from '../../shared/storageMigrationBoundary';
import { gunzipOffThread } from '../tokenizer';

const DECK = JSON.stringify({ folders: [], cards: Array.from({ length: 2_000 }, (_, i) => ({ id: `c${i}`, word: `語${i}` })) });

beforeEach(() => {
  installFakeIndexedDb();
  __resetDbForTests();
  localStorage.clear();
  reads.keys = [];
  gunzip.calls = 0;
});

describe('the boot storage migration', () => {
  it('does nothing heavy when the stored version is current and no cache is damaged', async () => {
    await kvSet('storage-version', STORAGE_MIGRATION_VERSION);
    localStorage.setItem(LS_KEYS.flashcardDeck, DECK);
    const parse = vi.spyOn(JSON, 'parse');
    const stringify = vi.spyOn(JSON, 'stringify');
    reads.keys = [];

    await runStorageMigrations();

    // Only the version is read: no store is fetched from IndexedDB, and the
    // deck is neither parsed nor re-serialized.
    expect(reads.keys).toEqual(['storage-version']);
    expect(parse.mock.calls.filter(([text]) => typeof text === 'string' && text.length > 10_000)).toHaveLength(0);
    expect(stringify.mock.calls.filter(([value]) => value && typeof value === 'object' && 'cards' in (value as object))).toHaveLength(0);
    expect(localStorage.getItem(LS_KEYS.flashcardDeck)).toBe(DECK);
  });

  it('still runs on an old version, and on a damaged cache text', async () => {
    expect(storageMigrationNeeded(STORAGE_MIGRATION_VERSION - 1, [DECK])).toBe(true);
    expect(storageMigrationNeeded(STORAGE_MIGRATION_VERSION, [DECK, '{"cards":[1,2]}'])).toBe(false);
    expect(storageMigrationNeeded(STORAGE_MIGRATION_VERSION, ['{"cards":[{"id":"c1"'])).toBe(true);
    expect(storageMigrationNeeded(STORAGE_MIGRATION_VERSION, ['corrupt'])).toBe(true);
    expect(looksLikeJsonContainer('  [1] \n')).toBe(true);
    expect(looksLikeJsonContainer('"{\\"a\\":1}"')).toBe(false);

    await kvSet('storage-version', STORAGE_MIGRATION_VERSION);
    localStorage.setItem(LS_KEYS.clipboardHistory, '[{"id":"x"');
    reads.keys = [];
    await runStorageMigrations();
    // The full pass read the stores to quarantine the damaged one.
    expect(reads.keys.length).toBeGreaterThan(1);
  });
});

describe('the tokenizer dictionary', () => {
  it('is inflated by the platform stream, not by fflate on the UI thread', async () => {
    // jsdom's Blob has no stream(); Chromium's (and Node's) does.
    vi.stubGlobal('Blob', NodeBlob);
    const original = new Uint8Array(Array.from({ length: 50_000 }, (_, i) => (i * 7) % 251));
    const out = await gunzipOffThread(new Uint8Array(gzipSync(original)));
    expect(out).toEqual(original);
    expect(out.byteLength).toBe(out.buffer.byteLength);
    expect(gunzip.calls).toBe(0);
    vi.unstubAllGlobals();
  });
});
