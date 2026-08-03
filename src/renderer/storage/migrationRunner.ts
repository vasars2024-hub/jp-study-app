/**
 * Storage migration runner — runs once per boot, before React renders.
 *
 * The runner delegates all decision-making to a pure migration boundary. The
 * boundary computes an inert retention plan, removes corrupted values, and
 * keeps the remaining localStorage/IndexedDB data in deterministic order.
 */

import { kvGet, kvSet } from './db';
import { IDB_KEYS, LS_KEYS } from './storage';
import { restoreAnnotationsFromIdb } from '../annotations';
import { restoreBookmarksFromIdb } from '../bookmarks';
import { restoreLevelListsFromIdb } from '../levelLists';
import {
  applyStorageMigration,
  type StorageMigrationAdapter,
  type StorageMigrationSnapshot,
} from '../../shared/storageMigrationBoundary';

const VERSION_KEY = 'storage-version';

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

function createAdapter(): StorageMigrationAdapter {
  return {
    async readSnapshot() {
      const snapshot = collectSnapshot();
      const entries = await Promise.all(Object.values(IDB_KEYS).map(async (key) => [key, await kvGet<unknown>(key)] as const));
      for (const [key, value] of entries) {
        if (value !== undefined) snapshot.indexedDb[key] = value;
      }
      return snapshot;
    },
    async replaceAtomic(next) {
      const idbKeys = new Set(Object.values(IDB_KEYS));
      for (const key of idbKeys) {
        try {
          await kvSet(key, next.indexedDb[key]);
        } catch {
          /* ignore */
        }
      }
      for (const key of Object.values(LS_KEYS)) {
        if (next.localStorage[key] === undefined) {
          try {
            localStorage.removeItem(key);
          } catch {
            /* ignore */
          }
          continue;
        }
        writeLocal(key, next.localStorage[key]);
      }
    },
  };
}

export async function runStorageMigrations(): Promise<void> {
  try {
    const current = (await kvGet<number>(VERSION_KEY)) ?? 0;
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
