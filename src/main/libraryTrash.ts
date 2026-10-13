/**
 * The Library's own trash: Remove is recoverable.
 *
 * `library:remove` used to `rmSync` the item's folder — the extracted pages,
 * the stored EPUB, its OCR cache — the moment the confirm closed, with no
 * Undo and no Recycle Bin. Calibre and Kavita both make removal recoverable;
 * for a library that holds the user's only converted copy of a scan, it has
 * to be.
 *
 * A removed item's folder is RENAMED into `<userData>/library-trash/` (same
 * volume, so it is instant and copies nothing) and its record is kept in
 * `library-trash.json`. Restore renames it back and re-inserts the record
 * under the SAME id, so progress, highlights, mined-card links and reading
 * lists that key on the id all come back with it. After the retention period
 * a trashed folder goes to the Windows Recycle Bin (`shell.trashItem`), never
 * to `unlink`: even then it is the OS's to delete, not ours.
 *
 * Crash safety: every step is ordered so an interruption leaves either the
 * old state or the new one, and `reconcileLibraryTrash` finishes or undoes a
 * half-done step at the next start:
 *
 *   remove   1. record the entry   2. rename folder → trash   3. drop db row
 *   restore  1. rename folder back 2. insert db row          3. drop the entry
 *
 * Electron-free: paths and the Recycle Bin call are injected.
 */
import fs from 'node:fs';
import path from 'node:path';
import type { LibraryItem } from '../shared/types';
import type { LibraryTrashSummary } from '../shared/libraryManage';
import { readJsonSync, writeJsonAtomicSync } from './atomicJson';

/** How long a removed item stays restorable before it goes to the Recycle Bin. */
export const LIBRARY_TRASH_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface LibraryTrashPaths {
  /** `<userData>/library` — where live item folders are. */
  libraryRoot: string;
  /** `<userData>/library-trash` — where removed item folders wait. */
  trashRoot: string;
  /** `<userData>/library-trash.json` — the removed items' records. */
  indexFile: string;
}

export interface LibraryTrashEntry {
  item: LibraryItem;
  removedAt: number;
  /** The folder's name under `trashRoot`, or null when the item had no folder. */
  dirName: string | null;
}

export type LibraryTrashErrorCode = 'not-found' | 'busy' | 'conflict' | 'service-error';

function isEntry(value: unknown): value is LibraryTrashEntry {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<LibraryTrashEntry>;
  return (
    Boolean(v.item) &&
    typeof v.item?.id === 'string' &&
    typeof v.removedAt === 'number' &&
    (v.dirName === null || typeof v.dirName === 'string')
  );
}

export function readLibraryTrash(paths: LibraryTrashPaths): LibraryTrashEntry[] {
  const raw = readJsonSync<unknown[]>(paths.indexFile, [], { validate: Array.isArray });
  return raw.filter(isEntry);
}

function writeLibraryTrash(paths: LibraryTrashPaths, entries: readonly LibraryTrashEntry[]): void {
  writeJsonAtomicSync(paths.indexFile, entries);
}

export function summarizeLibraryTrash(entries: readonly LibraryTrashEntry[]): LibraryTrashSummary[] {
  return [...entries]
    .sort((a, b) => b.removedAt - a.removedAt)
    .map((entry) => ({
      id: entry.item.id,
      title: entry.item.title,
      kind: entry.item.kind,
      removedAt: entry.removedAt,
      expiresAt: entry.removedAt + LIBRARY_TRASH_RETENTION_MS,
    }));
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Rename, retrying the transient Windows refusals (a scanner, the indexer or
 * a just-closed reader briefly holding a file inside the folder).
 */
function renameWithRetry(from: string, to: string): void {
  for (let attempt = 0; ; attempt++) {
    try {
      fs.renameSync(from, to);
      return;
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (attempt >= 4 || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      sleepSync(40 * (attempt + 1));
    }
  }
}

function errorCodeOf(err: unknown): LibraryTrashErrorCode {
  const code = (err as { code?: string }).code;
  return code === 'EPERM' || code === 'EBUSY' || code === 'EACCES' ? 'busy' : 'service-error';
}

function freeTrashDirName(paths: LibraryTrashPaths, id: string, now: number): string {
  if (!fs.existsSync(path.join(paths.trashRoot, id))) return id;
  let n = 0;
  for (;;) {
    const candidate = `${id}~${now}${n ? `-${n}` : ''}`;
    if (!fs.existsSync(path.join(paths.trashRoot, candidate))) return candidate;
    n += 1;
  }
}

/**
 * Steps 1 and 2 of a remove: record the entry, then move the folder. The
 * caller drops the db row (step 3) only on `ok: true`. On failure nothing has
 * moved and the entry is withdrawn.
 */
export function moveLibraryItemToTrash(
  paths: LibraryTrashPaths,
  item: LibraryItem,
  now: number,
): { ok: true; entry: LibraryTrashEntry } | { ok: false; errorCode: LibraryTrashErrorCode } {
  const liveDir = path.join(paths.libraryRoot, item.id);
  const hasFiles = fs.existsSync(liveDir);
  let dirName: string | null = null;
  try {
    if (hasFiles) {
      fs.mkdirSync(paths.trashRoot, { recursive: true });
      dirName = freeTrashDirName(paths, item.id, now);
    }
  } catch (err) {
    return { ok: false, errorCode: errorCodeOf(err) };
  }
  const entry: LibraryTrashEntry = { item, removedAt: now, dirName };
  const before = readLibraryTrash(paths).filter((e) => e.item.id !== item.id);
  try {
    writeLibraryTrash(paths, [...before, entry]);
  } catch (err) {
    return { ok: false, errorCode: errorCodeOf(err) };
  }
  if (dirName) {
    try {
      renameWithRetry(liveDir, path.join(paths.trashRoot, dirName));
    } catch (err) {
      try {
        writeLibraryTrash(paths, before);
      } catch {
        /* reconcile drops an entry whose item is still in the library */
      }
      return { ok: false, errorCode: errorCodeOf(err) };
    }
  }
  return { ok: true, entry };
}

/**
 * Step 1 of a restore: put the folder back. The caller inserts the returned
 * item into the db (step 2) and then calls `forgetLibraryTrashEntry` (step 3).
 */
export function moveLibraryItemOutOfTrash(
  paths: LibraryTrashPaths,
  id: string,
): { ok: true; item: LibraryItem } | { ok: false; errorCode: LibraryTrashErrorCode } {
  const entry = readLibraryTrash(paths).find((e) => e.item.id === id);
  if (!entry) return { ok: false, errorCode: 'not-found' };
  if (entry.dirName) {
    const from = path.join(paths.trashRoot, entry.dirName);
    const to = path.join(paths.libraryRoot, id);
    // A trashed folder removed by hand: the record still restores, and the
    // shelf then shows the missing file with Relink — better than losing it.
    if (fs.existsSync(from)) {
      // Never merge into, or replace, a folder that is already live.
      if (fs.existsSync(to)) return { ok: false, errorCode: 'conflict' };
      try {
        fs.mkdirSync(paths.libraryRoot, { recursive: true });
        renameWithRetry(from, to);
      } catch (err) {
        return { ok: false, errorCode: errorCodeOf(err) };
      }
    }
  }
  return { ok: true, item: entry.item };
}

export function forgetLibraryTrashEntry(paths: LibraryTrashPaths, id: string): void {
  const entries = readLibraryTrash(paths);
  const next = entries.filter((e) => e.item.id !== id);
  if (next.length !== entries.length) writeLibraryTrash(paths, next);
}

/**
 * Finish or undo whatever an interrupted remove/restore left half-done.
 * Returns items to put back into the db (a restore interrupted after its
 * folder had already moved back).
 */
export function reconcileLibraryTrash(
  paths: LibraryTrashPaths,
  liveIds: ReadonlySet<string>,
): { reinsert: LibraryItem[] } {
  const entries = readLibraryTrash(paths);
  if (!entries.length) return { reinsert: [] };
  const keep: LibraryTrashEntry[] = [];
  const reinsert: LibraryItem[] = [];
  for (const entry of entries) {
    const id = entry.item.id;
    const trashed = entry.dirName ? path.join(paths.trashRoot, entry.dirName) : null;
    const live = path.join(paths.libraryRoot, id);
    if (liveIds.has(id)) {
      // The row is still (or again) in the library: a remove that never got
      // to step 3, or a restore that never got to step 3. Either way the
      // library wins — put the folder back if it moved, and drop the entry.
      if (trashed && fs.existsSync(trashed) && !fs.existsSync(live)) {
        try {
          renameWithRetry(trashed, live);
        } catch {
          keep.push(entry);
          continue;
        }
      }
      continue;
    }
    if (trashed && !fs.existsSync(trashed) && fs.existsSync(live)) {
      // A restore that moved the folder back and stopped before the row.
      reinsert.push(entry.item);
      continue;
    }
    keep.push(entry);
  }
  if (keep.length !== entries.length) {
    try {
      writeLibraryTrash(paths, keep);
    } catch {
      /* tried again at the next start */
    }
  }
  return { reinsert };
}

/**
 * Send trashed folders to the Recycle Bin: those past retention, or all of
 * them (`everything`). An entry whose folder the OS refused is kept and tried
 * again next time. Returns how many entries left the trash.
 */
export async function releaseLibraryTrash(
  paths: LibraryTrashPaths,
  options: { now: number; everything?: boolean; trashItem: (target: string) => Promise<void> },
): Promise<number> {
  const entries = readLibraryTrash(paths);
  const due = entries.filter(
    (e) => options.everything || options.now - e.removedAt >= LIBRARY_TRASH_RETENTION_MS,
  );
  if (!due.length) return 0;
  const released = new Set<LibraryTrashEntry>();
  for (const entry of due) {
    const dir = entry.dirName ? path.join(paths.trashRoot, entry.dirName) : null;
    if (dir && fs.existsSync(dir)) {
      try {
        await options.trashItem(dir);
      } catch {
        continue;
      }
    }
    released.add(entry);
  }
  if (released.size) {
    // Re-read: a remove may have landed while the Recycle Bin calls ran.
    const latest = readLibraryTrash(paths).filter(
      (e) => ![...released].some((r) => r.item.id === e.item.id && r.removedAt === e.removedAt),
    );
    writeLibraryTrash(paths, latest);
  }
  return released.size;
}
