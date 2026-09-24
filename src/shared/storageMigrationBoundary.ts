import { unwrapOverEncoded } from './overEncodedJson';

export type StorageMigrationTier = 'localStorage' | 'indexeddb';

export interface StorageMigrationEntry {
  key: string;
  value: unknown;
}

export interface StorageMigrationSnapshot {
  localStorage: Record<string, unknown>;
  indexedDb: Record<string, unknown>;
}

export interface StorageMigrationPlan {
  version: number;
  toVersion: number;
  retention: {
    keepLocalStorageKeys: string[];
    keepIndexedDbKeys: string[];
  };
  replace: {
    localStorage: StorageMigrationEntry[];
    indexedDb: StorageMigrationEntry[];
  };
  recover: {
    localStorage: StorageMigrationEntry[];
    indexedDb: StorageMigrationEntry[];
  };
  /**
   * Values that failed to parse into their key's shape. They are KEPT in
   * `replace` (every retained key is heavy user data) — this list is only what
   * the runner copies aside before a reader's fallback can overwrite them.
   */
  quarantine: {
    localStorage: StorageMigrationEntry[];
    indexedDb: StorageMigrationEntry[];
  };
  issues: string[];
}

export interface StorageMigrationAdapter {
  readSnapshot(): Promise<StorageMigrationSnapshot>;
  replaceAtomic(next: StorageMigrationSnapshot): Promise<void>;
  /** Copy damaged values aside. Optional: an adapter without it just keeps them. */
  quarantine?(entries: StorageMigrationPlan['quarantine']): Promise<void>;
}

export const STORAGE_MIGRATION_VERSION = 5;

// These must cover every key in LS_KEYS / IDB_KEYS. A key that is enumerated by
// the runner but missing here is not merely skipped: the runner removes an
// unretained localStorage key and writes `undefined` over its IndexedDB twin,
// so omitting one deletes that store on every boot.
const HEAVY_LOCAL_STORAGE_KEYS = ['jp-flashcard-deck', 'jp-study-csv-editor-v1', 'jp-clipboard-history', 'jp-calendar-events', 'jp-media-tracking-v1', 'jp-media-study-database-v1'];
const HEAVY_INDEXED_DB_KEYS = ['flashcard-deck', 'csv-editor', 'clipboard-history', 'calendar-events', 'reading-annotations', 'reading-bookmarks', 'grammar-curation', 'grammar-familiarity', 'grammar-session-options', 'grammar-session-history', 'level-lists', 'media-study-database'];

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function normalizeEntries(input: Record<string, unknown>, retained: string[]): StorageMigrationEntry[] {
  return Object.entries(input)
    .filter(([key]) => retained.includes(key))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => ({ key, value: clone(value) }));
}

function snapshotFromEntries(entries: StorageMigrationEntry[]): Record<string, unknown> {
  return Object.fromEntries(entries.map((entry) => [entry.key, clone(entry.value)]));
}

/**
 * Every retained key holds a JSON object or array. A value is damaged only when
 * it does not parse into one — never because of what its text says. The old
 * check matched substrings like "corrupt" or "data lost" anywhere in the raw
 * value, so a flashcard meaning "corruption" (汚職) made the runner delete the
 * whole deck.
 *
 * localStorage values are the raw `getItem` text; IndexedDB values are
 * structured clones (objects), though an old build may have stored JSON text.
 * Over-encoded text is not damage: its readers peel the extra layers.
 */
export function isDamagedValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'object') return false;
  if (typeof value !== 'string') return true;
  const { value: parsed, layers } = unwrapOverEncoded<unknown>(value);
  return layers === 0 || parsed === null || typeof parsed !== 'object';
}

export function planStorageMigration(
  snapshot: StorageMigrationSnapshot,
  currentVersion: number,
): StorageMigrationPlan {
  const issues: string[] = [];
  const localStorage = { ...snapshot.localStorage };
  const indexedDb = { ...snapshot.indexedDb };

  // Heavy stores are never dropped here: a value that does not parse is copied
  // aside (quarantine) and left in place for its reader, which already treats
  // it as empty — the copy is what survives if that reader later overwrites it.
  const damagedLocal = normalizeEntries(localStorage, HEAVY_LOCAL_STORAGE_KEYS)
    .filter((entry) => isDamagedValue(entry.value));
  const damagedIdb = normalizeEntries(indexedDb, HEAVY_INDEXED_DB_KEYS)
    .filter((entry) => isDamagedValue(entry.value));

  if (damagedLocal.length) issues.push(`Quarantined a copy of ${damagedLocal.length} unreadable localStorage entr${damagedLocal.length === 1 ? 'y' : 'ies'} (${damagedLocal.map((e) => e.key).join(', ')}).`);
  if (damagedIdb.length) issues.push(`Quarantined a copy of ${damagedIdb.length} unreadable IndexedDB entr${damagedIdb.length === 1 ? 'y' : 'ies'} (${damagedIdb.map((e) => e.key).join(', ')}).`);

  return {
    version: currentVersion,
    toVersion: STORAGE_MIGRATION_VERSION,
    retention: {
      keepLocalStorageKeys: [...HEAVY_LOCAL_STORAGE_KEYS],
      keepIndexedDbKeys: [...HEAVY_INDEXED_DB_KEYS],
    },
    replace: {
      localStorage: normalizeEntries(localStorage, HEAVY_LOCAL_STORAGE_KEYS),
      indexedDb: normalizeEntries(indexedDb, HEAVY_INDEXED_DB_KEYS),
    },
    recover: {
      localStorage: normalizeEntries(localStorage, HEAVY_LOCAL_STORAGE_KEYS),
      indexedDb: normalizeEntries(indexedDb, HEAVY_INDEXED_DB_KEYS),
    },
    quarantine: { localStorage: damagedLocal, indexedDb: damagedIdb },
    issues,
  };
}

export async function applyStorageMigration(
  adapter: StorageMigrationAdapter,
  currentVersion = 0,
): Promise<StorageMigrationPlan> {
  const snapshot = await adapter.readSnapshot();
  const plan = planStorageMigration(snapshot, currentVersion);
  if (adapter.quarantine && (plan.quarantine.localStorage.length || plan.quarantine.indexedDb.length)) {
    await adapter.quarantine(plan.quarantine);
  }
  await adapter.replaceAtomic({
    localStorage: snapshotFromEntries(plan.replace.localStorage),
    indexedDb: snapshotFromEntries(plan.replace.indexedDb),
  });
  return plan;
}

export function createMemoryStorageMigrationAdapter(seed: Partial<StorageMigrationSnapshot> = {}): StorageMigrationAdapter & { snapshot(): StorageMigrationSnapshot } {
  let state: StorageMigrationSnapshot = {
    localStorage: clone(seed.localStorage ?? {}),
    indexedDb: clone(seed.indexedDb ?? {}),
  };
  return {
    async readSnapshot() {
      return clone(state);
    },
    async replaceAtomic(next) {
      state = clone(next);
    },
    snapshot() {
      return clone(state);
    },
  };
}
