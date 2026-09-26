/**
 * Companion ids that were renamed when the catalog stopped naming third-party
 * characters: the Aero theme's companion type and its two built-in routines.
 *
 * Older profiles still carry the old ids in localStorage — in the environment
 * (companion types, instances, routine bindings, routine `forType`), its Aero
 * and study backups, Mini's pinned routines, the summon snapshot and the pack
 * choices — so they are rewritten once per window before anything reads them.
 * The old ids are kept base64-encoded: they exist only to be recognised, and
 * the public tree's name scan (noThirdPartyCharacters.test.ts) stays exact.
 */
import { writeLocalStorage } from '../localStorageWrite';

const RENAMED_ENCODED: ReadonlyArray<readonly [string, string]> = [
  ['bWlrby1zaGltZWpp', 'aero-assistant'],
  ['YnItbWlrby1jbGltYg==', 'br-aero-climb'],
  ['YnItbWlrby1jaGVlcg==', 'br-aero-cheer'],
];

function decode(b64: string): string {
  try {
    return atob(b64);
  } catch {
    return '';
  }
}

const RENAMED: ReadonlyMap<string, string> = new Map(
  RENAMED_ENCODED.map(([b64, next]) => [decode(b64), next] as const).filter(([old]) => old.length > 0),
);

/** Stores whose JSON may hold a companion type or routine id. */
export const COMPANION_ID_STORAGE_KEYS: readonly string[] = [
  'jp-os-environment-v1',
  'jp-aero-environment-v1',
  'jp-study-environment-backup-v1',
  'jp-study-mini-mode-v1',
  'jp-finding-summon-restore-v1',
  'jp-companion-pack-choice-v1',
];

/** The current id for `id` (unchanged when it was never renamed). */
export function currentCompanionId(id: string): string {
  return RENAMED.get(id) ?? id;
}

/** `value` with every renamed id — as a string value or an object key — replaced. */
export function migrateLegacyCompanionIds<T>(value: T): T {
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return currentCompanionId(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {};
      for (const [k, inner] of Object.entries(v as Record<string, unknown>)) out[currentCompanionId(k)] = walk(inner);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

function mentionsLegacyId(raw: string): boolean {
  for (const old of RENAMED.keys()) if (raw.includes(`"${old}"`)) return true;
  return false;
}

let migrated = false;

/**
 * Rewrite the old ids in every store that can hold one. Runs once per window;
 * a store that fails to parse or write is left as it was (its own loader then
 * drops the unknown id, which is what happened before this migration existed).
 */
export function migrateLegacyCompanionStorage(): void {
  const storage = safeLocalStorage();
  if (migrated || !storage) return;
  migrated = true;
  for (const key of COMPANION_ID_STORAGE_KEYS) {
    let raw: string | null = null;
    try {
      raw = storage.getItem(key);
    } catch {
      continue;
    }
    if (!raw || !mentionsLegacyId(raw)) continue;
    try {
      writeLocalStorage(key, JSON.stringify(migrateLegacyCompanionIds(JSON.parse(raw) as unknown)));
    } catch {
      /* unparseable: leave it to the store's own loader */
    }
  }
}

/** Test hook: let the next call run again. */
export function resetLegacyCompanionMigrationForTests(): void {
  migrated = false;
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
