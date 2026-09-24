// @vitest-environment jsdom
/**
 * The storage migration runner must never write a key whose value changed
 * after it read it.
 *
 * The runner starts ~8 s after boot and awaits IndexedDB between reading its
 * snapshot and writing the plan back. It used to write every retained key back
 * from that snapshot, so a card mined in the window was overwritten by the deck
 * read before it. These tests mine a card through `flashcardDeck`'s own API in
 * exactly that window (after the runner has read the deck) and prove the card
 * is still in both homes once the runner finishes.
 *
 * IndexedDB is the in-memory fake behind the real `storage/db.ts`, so the
 * compare-and-set transaction is exercised for real; only `kvGet` is wrapped,
 * to run the "user mines a card" step right after the runner's read of the deck.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installFakeIndexedDb, type FakeIndexedDb } from './helpers/fakeIndexedDb';

const hooks: { afterDeckRead: (() => Promise<void>) | null } = { afterDeckRead: null };

vi.mock('../storage/db', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../storage/db')>();
  return {
    ...actual,
    kvGet: async <T,>(key: string): Promise<T | undefined> => {
      const value = await actual.kvGet<T>(key);
      if (key === 'flashcard-deck' && hooks.afterDeckRead) {
        const hook = hooks.afterDeckRead;
        hooks.afterDeckRead = null;
        await hook();
      }
      return value;
    },
  };
});
vi.mock('../annotations', () => ({ restoreAnnotationsFromIdb: async () => undefined }));
vi.mock('../bookmarks', () => ({ restoreBookmarksFromIdb: async () => undefined }));
vi.mock('../levelLists', () => ({ restoreLevelListsFromIdb: async () => undefined }));

import { DB_NAME, KV_STORE, __resetDbForTests, kvGet, kvSet } from '../storage/db';
import { runStorageMigrations } from '../storage/migrationRunner';
import { IDB_KEYS, LS_KEYS } from '../storage/storage';
import { addDeckCards, loadDeck, resetDeckMemoryForTests } from '../flashcardDeck';
import { STORAGE_MIGRATION_VERSION } from '../../shared/storageMigrationBoundary';

let fake: FakeIndexedDb;

const OLD_DECK = { folders: [], cards: [{ id: 'old-1', word: '犬', reading: 'いぬ', meaning: 'dog', source: 'epub', addedAt: 1 }], savedAt: 1 };

/** Mine a card the way the app does, then let the deck's IndexedDB mirror land. */
async function mineCard(word: string): Promise<void> {
  addDeckCards([{ word, reading: 'ねこ', meaning: 'cat', source: 'epub' } as never]);
  // The real mirror is debounced; flush its effect directly so the IndexedDB
  // copy is also newer than what the runner read.
  await kvSet(IDB_KEYS.flashcardDeck, JSON.parse(localStorage.getItem(LS_KEYS.flashcardDeck) as string));
}

function idbDeckWords(): string[] {
  const deck = fake.rows(DB_NAME, KV_STORE)[IDB_KEYS.flashcardDeck] as { cards?: Array<{ word: string }> } | undefined;
  return (deck?.cards ?? []).map((c) => c.word);
}

beforeEach(() => {
  fake = installFakeIndexedDb();
  __resetDbForTests();
  localStorage.clear();
  resetDeckMemoryForTests();
  hooks.afterDeckRead = null;
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('storage migration runner vs. concurrent mining', () => {
  it('keeps a card mined between the runner reading the deck and writing back', async () => {
    localStorage.setItem(LS_KEYS.flashcardDeck, JSON.stringify(OLD_DECK));
    await kvSet(IDB_KEYS.flashcardDeck, OLD_DECK);
    hooks.afterDeckRead = () => mineCard('猫');

    await runStorageMigrations();

    expect(hooks.afterDeckRead).toBeNull(); // the mine really ran inside the window
    expect(await kvGet('storage-version')).toBe(STORAGE_MIGRATION_VERSION);
    expect(loadDeck().map((c) => c.word).sort()).toEqual(['犬', '猫'].sort());
    expect(idbDeckWords().sort()).toEqual(['犬', '猫'].sort());
  });

  it('does not drop a "corrupt" deck the user replaced by mining while the runner ran', async () => {
    localStorage.setItem(LS_KEYS.flashcardDeck, 'corrupt');
    await kvSet(IDB_KEYS.flashcardDeck, 'corrupt: missing file');
    hooks.afterDeckRead = () => mineCard('猫');

    await runStorageMigrations();

    expect(await kvGet('storage-version')).toBe(STORAGE_MIGRATION_VERSION);
    expect(loadDeck().map((c) => c.word)).toEqual(['猫']);
    expect(idbDeckWords()).toEqual(['猫']);
  });

  it('still drops a corrupt entry nobody touched', async () => {
    localStorage.setItem(LS_KEYS.flashcardDeck, 'corrupt');
    await kvSet(IDB_KEYS.flashcardDeck, 'corrupt: missing file');

    await runStorageMigrations();

    expect(await kvGet('storage-version')).toBe(STORAGE_MIGRATION_VERSION);
    expect(localStorage.getItem(LS_KEYS.flashcardDeck)).toBeNull();
    expect(IDB_KEYS.flashcardDeck in fake.rows(DB_NAME, KV_STORE)).toBe(false);
  });
});
