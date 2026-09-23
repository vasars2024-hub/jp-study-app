/**
 * The storage migration must hand back the values it keeps, unchanged.
 *
 * `collectSnapshot()` reads localStorage through `getItem`, which returns
 * already-serialized JSON *text*. Writing that text back through
 * `JSON.stringify` adds one escaping layer per boot, so a reader that parses
 * once (e.g. `flashcardDeck.ts`) gets a string where it expects an object and
 * reads the store as empty.
 *
 * `storageMigrationBoundary.test.ts` cannot see this: every case there seeds
 * localStorage with objects, and stringifying an object is correct. Objects are
 * a shape the real adapter never produces. These tests use the real shape.
 *
 * Each case asserts the migration actually ran (`storage-version` reaches
 * STORAGE_MIGRATION_VERSION) before asserting anything about its effect —
 * `runStorageMigrations` swallows every error by design, so a run that threw
 * early would leave the seed untouched and pass vacuously.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const idb = new Map<string, unknown>();

vi.mock('../storage/db', () => ({
  kvGet: async (key: string) => idb.get(key),
  kvSet: async (key: string, value: unknown) => {
    idb.set(key, value);
  },
}));
vi.mock('../annotations', () => ({ restoreAnnotationsFromIdb: async () => undefined }));
vi.mock('../bookmarks', () => ({ restoreBookmarksFromIdb: async () => undefined }));
vi.mock('../levelLists', () => ({ restoreLevelListsFromIdb: async () => undefined }));

import { STORAGE_MIGRATION_VERSION, planStorageMigration } from '../../shared/storageMigrationBoundary';
import { runStorageMigrations } from '../storage/migrationRunner';
import { IDB_KEYS, LS_KEYS } from '../storage/storage';

function makeLocalStorage(): Storage {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => (map.has(key) ? (map.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      map.set(key, String(value));
    },
    removeItem: (key: string) => {
      map.delete(key);
    },
    clear: () => map.clear(),
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    get length() {
      return map.size;
    },
  } as Storage;
}

const DECK = JSON.stringify({ folders: ['slice48'], cards: [{ id: 'card-1', front: 'a' }] });

describe('storage migration round-trip', () => {
  beforeEach(() => {
    idb.clear();
    vi.stubGlobal('localStorage', makeLocalStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('leaves a retained localStorage value byte-identical across repeated boots', async () => {
    localStorage.setItem(LS_KEYS.flashcardDeck, DECK);

    await runStorageMigrations();
    expect(idb.get('storage-version')).toBe(STORAGE_MIGRATION_VERSION);
    expect(localStorage.getItem(LS_KEYS.flashcardDeck)).toBe(DECK);

    await runStorageMigrations();
    await runStorageMigrations();
    expect(localStorage.getItem(LS_KEYS.flashcardDeck)).toBe(DECK);
  });

  it('keeps the value readable by a consumer that parses once', async () => {
    localStorage.setItem(LS_KEYS.flashcardDeck, DECK);

    await runStorageMigrations();
    expect(idb.get('storage-version')).toBe(STORAGE_MIGRATION_VERSION);

    const parsed = JSON.parse(localStorage.getItem(LS_KEYS.flashcardDeck) as string) as {
      cards: unknown[];
    };
    expect(typeof parsed).toBe('object');
    expect(parsed.cards).toHaveLength(1);
  });

  it('retains the media-study stores instead of deleting them', async () => {
    const mediaStudy = JSON.stringify({ version: 1, profiles: [{ id: 'p1' }] });
    localStorage.setItem(LS_KEYS.mediaStudy, mediaStudy);
    idb.set(IDB_KEYS.mediaStudy, { version: 1, profiles: [{ id: 'p1' }] });

    await runStorageMigrations();
    expect(idb.get('storage-version')).toBe(STORAGE_MIGRATION_VERSION);

    expect(localStorage.getItem(LS_KEYS.mediaStudy)).toBe(mediaStudy);
    expect(idb.get(IDB_KEYS.mediaStudy)).toEqual({ version: 1, profiles: [{ id: 'p1' }] });
  });
});

describe('storage migration retention covers every enumerated key', () => {
  // The runner iterates LS_KEYS/IDB_KEYS and treats "not retained" as "delete".
  // These two assertions are what stops a newly added store from being wiped on
  // every boot by a retention list nobody remembered to update.
  const plan = planStorageMigration({ localStorage: {}, indexedDb: {} }, 0);

  it('retains every localStorage key the runner enumerates', () => {
    expect([...plan.retention.keepLocalStorageKeys].sort()).toEqual(
      [...Object.values(LS_KEYS)].sort(),
    );
  });

  it('retains every IndexedDB key the runner enumerates', () => {
    expect([...plan.retention.keepIndexedDbKeys].sort()).toEqual(
      [...Object.values(IDB_KEYS)].sort(),
    );
  });
});
