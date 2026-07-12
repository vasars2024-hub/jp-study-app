/**
 * Storage migration runner — runs once per boot, before React renders.
 *
 * Guarantees for users upgrading from older builds:
 *   1. Decks / CSV drafts that only exist in localStorage are copied into
 *      IndexedDB (the new durable home). The localStorage copy is kept as
 *      the hot-path cache, NOT deleted — an interrupted migration can never
 *      lose data because nothing is removed.
 *   2. If localStorage was cleared (the old main-process wipe bug, a crash,
 *      or quota eviction) but IndexedDB survived, the cache is restored from
 *      IndexedDB so the app boots with the user's data intact.
 *
 * Versioning: STORAGE_VERSION is stored in IndexedDB itself. Future shape
 * changes add a numbered step below; steps must stay idempotent (safe to
 * re-run) because a crash between "migrate" and "record version" replays
 * them.
 */

import { kvGet, kvSet } from './db';
import { IDB_KEYS, LS_KEYS } from './storage';
import { restoreAnnotationsFromIdb } from '../annotations';
import { restoreBookmarksFromIdb } from '../bookmarks';

const VERSION_KEY = 'storage-version';
export const STORAGE_VERSION = 2;

function readLocal(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeLocal(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* quota — IndexedDB copy is authoritative anyway */
  }
}

/** Two-way reconcile for one localStorage-cache / IndexedDB pair. */
async function reconcilePair(lsKey: string, idbKey: string): Promise<void> {
  const local = readLocal(lsKey);
  const stored = await kvGet<unknown>(idbKey);

  if (local != null) {
    // localStorage present → make sure IndexedDB has (at least) this data.
    // localStorage is the copy the user most recently wrote through, so it
    // wins when both exist.
    try {
      await kvSet(idbKey, JSON.parse(local));
    } catch {
      /* corrupt JSON in the cache — leave the IndexedDB copy alone */
    }
    return;
  }

  if (stored != null) {
    // Cache lost but durable copy exists → restore the cache so synchronous
    // readers (flashcardDeck.ts, csvEditorStorage.ts) see the data this boot.
    writeLocal(lsKey, JSON.stringify(stored));
  }
}

export async function runStorageMigrations(): Promise<void> {
  try {
    const current = (await kvGet<number>(VERSION_KEY)) ?? 0;

    if (current < 1) {
      // v1: adopt IndexedDB as the durable store for heavy data.
      await reconcilePair(LS_KEYS.flashcardDeck, IDB_KEYS.flashcardDeck);
      await reconcilePair(LS_KEYS.csvEditor, IDB_KEYS.csvEditor);
      await kvSet(VERSION_KEY, 1);
    } else {
      // Already migrated — still reconcile so a wiped cache is restored.
      await reconcilePair(LS_KEYS.flashcardDeck, IDB_KEYS.flashcardDeck);
      await reconcilePair(LS_KEYS.csvEditor, IDB_KEYS.csvEditor);
    }

    // v2: personal reading highlights + bookmarks (LS ↔ IDB).
    if (current < 2) {
      await restoreAnnotationsFromIdb();
      await restoreBookmarksFromIdb();
      // Push any LS-only data into IDB by triggering a re-mirror via import of collectors
      try {
        const { collectAllAnnotationsMap } = await import('../annotations');
        const { collectAllBookmarksMap } = await import('../bookmarks');
        await kvSet(IDB_KEYS.annotations, collectAllAnnotationsMap());
        await kvSet(IDB_KEYS.bookmarks, collectAllBookmarksMap());
      } catch {
        /* ignore */
      }
      await kvSet(VERSION_KEY, 2);
    } else {
      await restoreAnnotationsFromIdb();
      await restoreBookmarksFromIdb();
    }
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
