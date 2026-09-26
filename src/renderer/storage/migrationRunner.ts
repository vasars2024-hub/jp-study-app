/**
 * Storage migration runner — runs once per boot, before React renders.
 *
 * The runner delegates all decision-making to a pure migration boundary. The
 * boundary computes an inert retention plan and keeps every retained
 * localStorage/IndexedDB value in deterministic order. A value that does not
 * parse into its key's shape is never removed — a copy is quarantined into
 * IndexedDB (`<key>.quarantined-<timestamp>`) and the original stays put.
 */

import { kvCompareAndSet, kvGet, kvSet } from './db';
import { IDB_KEYS, LS_KEYS } from './storage';
import { restoreAnnotationsFromIdb } from '../annotations';
import { restoreBookmarksFromIdb } from '../bookmarks';
import { restoreLevelListsFromIdb } from '../levelLists';
import {
  applyStorageMigration,
  storageMigrationNeeded,
  type StorageMigrationAdapter,
  type StorageMigrationPlan,
  type StorageMigrationSnapshot,
} from '../../shared/storageMigrationBoundary';

const VERSION_KEY = 'storage-version';
/** source key -> fingerprint of the value last quarantined for it. */
const QUARANTINE_INDEX_KEY = 'storage-quarantine-index';

/** Cheap FNV-1a fingerprint, so a damaged value is copied aside once, not every boot. */
export function quarantineFingerprint(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${text.length}:${hash.toString(16)}`;
}

async function quarantineEntries(entries: StorageMigrationPlan['quarantine']): Promise<void> {
  const index = ((await kvGet<Record<string, string>>(QUARANTINE_INDEX_KEY)) ?? {}) as Record<string, string>;
  const stamp = Date.now();
  let changed = false;
  const all = [
    ...entries.localStorage.map((entry) => ({ ...entry, source: `localStorage:${entry.key}` })),
    ...entries.indexedDb.map((entry) => ({ ...entry, source: `indexedDb:${entry.key}` })),
  ];
  for (const entry of all) {
    const fingerprint = quarantineFingerprint(entry.value);
    if (index[entry.source] === fingerprint) continue;
    const target = `${entry.source.startsWith('localStorage:') ? 'ls:' : ''}${entry.key}.quarantined-${stamp}`;
    try {
      await kvSet(target, entry.value);
      index[entry.source] = fingerprint;
      changed = true;
      console.warn(`[storage] ${entry.source} does not parse; kept it in place and copied it to IndexedDB "${target}".`);
    } catch (err) {
      console.warn(`[storage] could not quarantine ${entry.source}:`, err instanceof Error ? err.message : String(err));
    }
  }
  if (changed) await kvSet(QUARANTINE_INDEX_KEY, index);
}

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: unknown): void {
  try {
    // `collectSnapshot` stores what `getItem` returned, which is already
    // serialized text. Stringifying it again would add one escaping layer per
    // boot, and readers that parse once would then see a string instead of the
    // object they expect. Non-string values can only reach here from a caller
    // that built the snapshot itself, so they still need serializing.
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
  } catch {
    /* quota — IndexedDB copy is authoritative anyway */
  }
}

function collectSnapshot(): StorageMigrationSnapshot {
  const localStorageSnapshot: Record<string, unknown> = {};
  const indexedDbSnapshot: Record<string, unknown> = {};

  for (const key of Object.values(LS_KEYS)) {
    const value = readLocal(key);
    if (value != null) localStorageSnapshot[key] = value;
  }

  return { localStorage: localStorageSnapshot, indexedDb: indexedDbSnapshot };
}

/**
 * Value equality for the compare-and-set below. localStorage values are the
 * raw strings `getItem` returned; IndexedDB values are structured clones, so
 * they compare by their JSON form (the plan itself clones through JSON).
 */
function sameValue(current: unknown, expected: unknown): boolean {
  if (current === expected) return true;
  if (current === undefined || expected === undefined) return false;
  try {
    return JSON.stringify(current) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

/**
 * The adapter never writes a key whose value changed since `readSnapshot`.
 *
 * The runner starts ~8 s after boot and awaits IndexedDB between the read and
 * the write. It used to write every retained key back from its snapshot, so a
 * card mined in that window was overwritten by the deck read before it (the
 * deck's `savedAt` stamps only recovered it on the next boot). Now:
 * - a key whose planned value equals what was read is not written at all —
 *   writing it back could only lose a newer value;
 * - a key the plan does change (none today: damaged values are quarantined,
 *   never dropped) is re-read
 *   immediately before the write and skipped if it no longer matches.
 *   localStorage is re-read synchronously right before `setItem`; IndexedDB
 *   goes through `kvCompareAndSet`, one transaction for check and write.
 */
function createAdapter(): StorageMigrationAdapter {
  const read: StorageMigrationSnapshot = { localStorage: {}, indexedDb: {} };
  return {
    async readSnapshot() {
      const snapshot = collectSnapshot();
      const entries = await Promise.all(Object.values(IDB_KEYS).map(async (key) => [key, await kvGet<unknown>(key)] as const));
      for (const [key, value] of entries) {
        if (value !== undefined) snapshot.indexedDb[key] = value;
      }
      read.localStorage = { ...snapshot.localStorage };
      read.indexedDb = { ...snapshot.indexedDb };
      return snapshot;
    },
    quarantine: quarantineEntries,
    async replaceAtomic(next) {
      const idbKeys = new Set(Object.values(IDB_KEYS));
      for (const key of idbKeys) {
        const planned = next.indexedDb[key];
        const original = read.indexedDb[key];
        if (sameValue(planned, original)) continue;
        try {
          await kvCompareAndSet(key, original, planned, sameValue);
        } catch {
          /* ignore */
        }
      }
      for (const key of Object.values(LS_KEYS)) {
        const planned = next.localStorage[key];
        const original = read.localStorage[key];
        if (sameValue(planned, original)) continue;
        // Synchronous re-read: nothing can run between this and the write.
        const current = readLocal(key) ?? undefined;
        if (!sameValue(current, original)) continue;
        if (planned === undefined) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          continue;
        }
        writeLocal(key, planned);
      }
    },
  };
}

export async function runStorageMigrations(): Promise<void> {
  try {
    const current = (await kvGet<number>(VERSION_KEY)) ?? 0;
    // Most boots have nothing to migrate: the stored version is current and no
    // cache text is damaged. Reading and planning anyway copied every heavy
    // store — the deck included — four or five times per boot, for a plan that
    // changes nothing. Such a boot only rehydrates.
    const localTexts = Object.values(LS_KEYS)
      .map((key) => readLocal(key))
      .filter((text): text is string => text != null);
    if (!storageMigrationNeeded(current, localTexts)) {
      await restoreAnnotationsFromIdb();
      await restoreBookmarksFromIdb();
      await restoreLevelListsFromIdb();
      return;
    }
    const plan = await applyStorageMigration(createAdapter(), current);

    if (plan.issues.length) {
      console.warn('[storage] migration recovery:', plan.issues.join(' '));
    }

    if (current < plan.toVersion) {
      await kvSet(VERSION_KEY, plan.toVersion);
    }

    // Rehydrate durable book-level caches after the atomic replacement has
    // finished so the hot path sees the repaired IndexedDB state.
    await restoreAnnotationsFromIdb();
    await restoreBookmarksFromIdb();
    await restoreLevelListsFromIdb();
  } catch (err) {
    // IndexedDB can throw DOMException (private mode, blocked upgrade, closed DB).
    // localStorage caches still work; do not fail boot.
    const detail =
      err instanceof Error
        ? err.message
        : err && typeof err === 'object' && 'message' in err
          ? String((err as { message: unknown }).message)
          : String(err);
    console.warn('[storage] migration skipped (IndexedDB unavailable):', detail || 'unknown error');
  }
}
