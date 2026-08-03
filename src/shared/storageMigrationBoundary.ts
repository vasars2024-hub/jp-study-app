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
  issues: string[];
}

export interface StorageMigrationAdapter {
  readSnapshot(): Promise<StorageMigrationSnapshot>;
  replaceAtomic(next: StorageMigrationSnapshot): Promise<void>;
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

function isCorruptValue(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'string') return false;
  const text = value.toLowerCase();
  return text.includes('corrupt') || text.includes('missing file') || text.includes('data lost') || text.includes('unknownerror');
}

export function planStorageMigration(
  snapshot: StorageMigrationSnapshot,
  currentVersion: number,
): StorageMigrationPlan {
  const issues: string[] = [];
  const localStorage = { ...snapshot.localStorage };
  const indexedDb = { ...snapshot.indexedDb };

  const corruptedLocalKeys = Object.entries(localStorage)
    .filter(([, value]) => isCorruptValue(value))
    .map(([key]) => key);
  const corruptedIdbKeys = Object.entries(indexedDb)
    .filter(([, value]) => isCorruptValue(value))
    .map(([key]) => key);

  const sanitizedLocal = Object.fromEntries(
    Object.entries(localStorage).filter(([key]) => !corruptedLocalKeys.includes(key)),
  );
  const sanitizedIdb = Object.fromEntries(
    Object.entries(indexedDb).filter(([key]) => !corruptedIdbKeys.includes(key)),
  );

  if (corruptedLocalKeys.length) issues.push(`Recovered ${corruptedLocalKeys.length} corrupted localStorage entr${corruptedLocalKeys.length === 1 ? 'y' : 'ies'}.`);
  if (corruptedIdbKeys.length) issues.push(`Recovered ${corruptedIdbKeys.length} corrupted IndexedDB entr${corruptedIdbKeys.length === 1 ? 'y' : 'ies'}.`);

  return {
    version: currentVersion,
    toVersion: STORAGE_MIGRATION_VERSION,
    retention: {
      keepLocalStorageKeys: [...HEAVY_LOCAL_STORAGE_KEYS],
      keepIndexedDbKeys: [...HEAVY_INDEXED_DB_KEYS],
    },
    replace: {
      localStorage: normalizeEntries(sanitizedLocal, HEAVY_LOCAL_STORAGE_KEYS),
      indexedDb: normalizeEntries(sanitizedIdb, HEAVY_INDEXED_DB_KEYS),
    },
    recover: {
      localStorage: normalizeEntries(sanitizedLocal, HEAVY_LOCAL_STORAGE_KEYS),
      indexedDb: normalizeEntries(sanitizedIdb, HEAVY_INDEXED_DB_KEYS),
    },
    issues,
  };
}

export async function applyStorageMigration(
  adapter: StorageMigrationAdapter,
  currentVersion = 0,
): Promise<StorageMigrationPlan> {
  const snapshot = await adapter.readSnapshot();
  const plan = planStorageMigration(snapshot, currentVersion);
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
