/**
 * The Files app — main-process IPC.
 *
 * Two handlers and one cache. The index is built by walking real directories
 * and a SQLite table, so rebuilding it on every keystroke in the search box
 * would put a disk walk on the render path; it is cached and invalidated by
 * time or by an explicit refresh, and the snapshot says when it was built so
 * the UI can show that rather than implying it is live.
 *
 * `filesapp:reveal` is separate from the index on purpose. The plan's gate 12
 * requires a non-file-backed item to refuse *honestly* rather than open the
 * wrong folder, and the only way to guarantee that is for the reveal path to
 * consult `revealTargetFor` — the same function the renderer uses to decide
 * whether to offer the action — instead of trusting whatever path a caller
 * hands it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, app, ipcMain, shell } from 'electron';
import { dictionaryDb } from '../dictionary/db';
import { revealTargetFor, type FilesIndexSnapshot, type FilesLocation } from '../../shared/filesApp/catalog';
import { normalizeIngestSettings } from '../../shared/filesApp/ingest';
import type { FilesMineSourceResult } from '../../shared/filesApp/mining';
import type { FilesScanReport } from '../../shared/filesApp/scan';
import { buildFilesIndex, type FilesEnumeratorContext, type FilesSqliteLike } from './enumerators';
import { createFilesDeletionMainDependencies, registerFilesDeletionIpc } from './deletionIpc';
import { createCleanupSoftDelete, registerFilesCleanupIpc } from './cleanupIpc';
import type { FilesCleanupLogEntry } from '../../shared/filesApp/cleanup';
import { readFilesMineSource } from './mineSource';
import { scanRoots } from './scan';
import { watchRoots, type FilesWatchArrival, type FilesWatchSession } from './watch';

/** How long a built index is served before the next request rebuilds it. */
const INDEX_TTL_MS = 15_000;

let cached: FilesIndexSnapshot | null = null;

/** Gate 25's session. One at a time; see the `watch-set` handler for why. */
let watchSession: FilesWatchSession | null = null;
let watchRootsInUse: string[] = [];

export interface FilesWatchStatus {
  roots: string[];
  /** Files seen but not yet accepted. A count, never "some". */
  pending: number;
}

export const FILES_WATCH_ARRIVAL_CHANNEL = 'filesapp:watch-arrival';

/**
 * Gate 25's "without a manual refresh": the renderer is told, it does not ask.
 *
 * Every window is told rather than the one that set the watch — a second Files
 * window showing the same tree would otherwise go stale the moment another one
 * started watching.
 */
function broadcastArrivals(arrivals: FilesWatchArrival[]): void {
  if (!arrivals.length) return;
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(FILES_WATCH_ARRIVAL_CHANNEL, arrivals);
  }
}

export function defaultFilesContext(): FilesEnumeratorContext {
  return {
    userDataPath: app.getPath('userData'),
    openDictionary: () => {
      try {
        return dictionaryDb() as unknown as FilesSqliteLike;
      } catch {
        // No dictionary database yet is an ordinary state on a fresh profile.
        // The enumerator reports zero dictionaries; it does not fail the index.
        return null;
      }
    },
  };
}

/** Drop the cache. Called by whatever changes a store the index reads. */
export function invalidateFilesIndex(): void {
  cached = null;
}

export function getFilesIndex(force = false): FilesIndexSnapshot {
  if (!force && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  cached = buildFilesIndex(defaultFilesContext());
  return cached;
}

export interface FilesRevealResult {
  ok: boolean;
  /** i18n key naming why a refusal happened. Never a bare `false`. */
  reasonKey?: string;
}

export function registerFilesAppIpc(): void {
  ipcMain.handle('filesapp:index', (_e, force: unknown): FilesIndexSnapshot =>
    getFilesIndex(force === true),
  );

  ipcMain.handle('filesapp:reveal', (_e, location: unknown): FilesRevealResult => {
    if (!location || typeof location !== 'object') {
      return { ok: false, reasonKey: 'filesApp.reveal.noLocation' };
    }
    const target = revealTargetFor(location as FilesLocation);
    if (!target) {
      // Gate 12's honest half: a dictionary row has no folder, and opening
      // userData "so something happens" would be the wrong folder presented
      // as a success.
      return { ok: false, reasonKey: 'filesApp.reveal.notFileBacked' };
    }
    /*
     * Gate 12's other wrong folder, and the one that was still open.
     *
     * `brokenLink` is a flag the index already sets — a record whose backing
     * file is gone — and those rows ARE file-backed, so `revealTargetFor`
     * returns a path for them and this handler used to reveal it and answer
     * `ok: true`. What Explorer does with a path that no longer exists is
     * open the nearest ancestor that does, silently, which is a different
     * folder than the one the user asked for, reported as a success. That is
     * the exact shape the gate forbids.
     *
     * Checked here rather than trusting the flag: the index is cached for 15
     * seconds and the file may have gone in between, so the flag is a hint and
     * the filesystem is the answer.
     */
    if (!fs.existsSync(target)) {
      return { ok: false, reasonKey: 'filesApp.reveal.missing' };
    }
    shell.showItemInFolder(target);
    return { ok: true };
  });

  /**
   * Gate 3's read half. Main hands back *passages*, never cards: the deck is
   * renderer-owned localStorage, so a main-side "mine" handler would have
   * nowhere to write. Splitting it here keeps one writer for the deck and
   * leaves this handler pure enough to test against a fixture directory.
   *
   * The location is validated the same way `filesapp:reveal` validates it —
   * through `revealTargetFor` — so a caller cannot hand this handler an
   * arbitrary path and have it read a file the catalogue never indexed.
   */
  ipcMain.handle(
    'filesapp:mine-source',
    (_e, location: unknown, kind: unknown): FilesMineSourceResult => {
      if (!location || typeof location !== 'object') {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
      }
      const target = revealTargetFor(location as FilesLocation);
      if (!target) {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.notFileBacked' };
      }
      if (kind !== 'transcript' && kind !== 'subtitle' && kind !== 'book') {
        return { ok: false, reasonKey: 'filesApp.mine.refuse.kindHasNoText' };
      }
      try {
        return readFilesMineSource(target, kind);
      } catch (err) {
        // A reader that throws must still answer. An unhandled rejection here
        // would leave the button spinning with no message at all.
        return {
          ok: false,
          reasonKey: 'filesApp.mine.refuse.unreadable',
          detail: err instanceof Error ? err.message : String(err),
        };
      }
    },
  );

  /**
   * Gate 23 — bulk scan. Read-only by construction (`filesApp/scan.ts`'s
   * header), so this handler imports nothing and confirms nothing: it answers
   * with a report, and importing any part of it is a separate, later call.
   *
   * The root count is capped because each root is a full tree walk, and a
   * caller that passed a hundred would hold the main process for minutes with
   * no way to interrupt it.
   */
  ipcMain.handle('filesapp:scan', (_e, roots: unknown, options: unknown): FilesScanReport => {
    const list = Array.isArray(roots)
      ? roots.filter((r): r is string => typeof r === 'string' && r.length > 0).slice(0, 8)
      : [];
    /*
     * Gate 31. The window arrives from the renderer's settings document, so it
     * is re-clamped HERE through the same shared normaliser rather than
     * trusted: a renderer with a corrupted document could otherwise ask for a
     * negative window, and "the completeness check is off" is not a state this
     * handler will enter on a caller's say-so.
     */
    const stabilityMs = normalizeIngestSettings(options).stabilityMs;
    // `stabilityFromMtime` is what makes the window mean anything on a one-shot
    // scan: see `FilesScanOptions`. Without it this handler passed no stability
    // judgement at all and the setting would have been decorative.
    return scanRoots(list, { stabilityMs, stabilityFromMtime: true });
  });

  /**
   * Gate 25 — watched folders.
   *
   * One session at a time, replaced wholesale: the roots are a small list the
   * user edits, and reconciling an old set against a new one would buy nothing
   * except a way for a removed root to keep firing. Replacing re-baselines, so
   * a re-add announces nothing that was already there.
   *
   * The renderer owns the list (it is part of the same settings document as
   * gate 31's window) and re-sends it on load; main holds no preference of its
   * own, which keeps one writer for it.
   */
  ipcMain.handle('filesapp:watch-set', (_e, roots: unknown, options: unknown): FilesWatchStatus => {
    const list = Array.isArray(roots)
      ? roots.filter((r): r is string => typeof r === 'string' && r.length > 0).slice(0, 8)
      : [];
    watchSession?.stop();
    watchSession = null;
    watchRootsInUse = [];
    if (!list.length) return { roots: [], pending: 0 };

    const stabilityMs = normalizeIngestSettings(options).stabilityMs;
    const session = watchRoots(list, broadcastArrivals, { stabilityMs });
    // The baseline sweep, whose whole job is to announce nothing.
    session.sweep();
    watchSession = session;
    watchRootsInUse = list;
    return { roots: list, pending: session.pendingCount() };
  });

  /** What is being watched, and how many files are still arriving. */
  ipcMain.handle('filesapp:watch-status', (): FilesWatchStatus => {
    return { roots: [...watchRootsInUse], pending: watchSession?.pendingCount() ?? 0 };
  });

  /*
   * Gates 9 and 21 — the privileged half of Delete.
   *
   * The renderer sends an id and nothing else; the path, kind and `referenced`
   * flag that decide whether this is a Recycle Bin operation are re-read HERE
   * from the same index every other handler serves. `force: true` is deliberate
   * and is the whole point of registering it this way: the 15-second cache
   * could otherwise hand `shell.trashItem` a row whose file has already moved,
   * and a stale path is exactly the input that turns a delete into the wrong
   * file. Paying one rebuild per delete is the correct trade — a delete is a
   * rare, destructive, user-initiated act, not a render-path call.
   */
  registerFilesDeletionIpc(
    ipcMain,
    createFilesDeletionMainDependencies({
      getItems: () => getFilesIndex(true).items,
      invalidate: invalidateFilesIndex,
      trashItem: (target) => shell.trashItem(target),
    }),
  );

  /*
   * Gates 32-35 — cleanup.
   *
   * `force: true` for the same reason Delete uses it: a plan built from a
   * 15-second-old snapshot could hand `shell.trashItem` a path that has since
   * moved, and cleanup removes in bulk. The renderer sends its settings with
   * each call and they are re-normalized inside the handler, matching how gate
   * 31's stability window crosses this boundary — main keeps no cleanup
   * preference of its own, so there is exactly one writer for it.
   */
  registerFilesCleanupIpc(ipcMain, {
    getItems: () => getFilesIndex(true).items,
    userDataPath: () => app.getPath('userData'),
    trashItem: (target) => shell.trashItem(target),
    softDeleteRow: createCleanupSoftDelete(() => app.getPath('userData')),
    // Settings travel with the request; there is no persisted main-side copy.
    readSettings: () => undefined,
    invalidate: invalidateFilesIndex,
    appendLog: (entries) => appendCleanupLog(app.getPath('userData'), entries),
    now: () => Date.now(),
  });
}

/**
 * Gate 35 — the log is a file, not a toast.
 *
 * A run's receipt has to outlive the window that started it: the gate asks that
 * a Recycle-Bin-destined item be *restorable*, and a user who closed the app
 * still needs to know which file to restore. Capped so a scheduled run cannot
 * grow it without bound.
 */
const CLEANUP_LOG_FILE = 'files-cleanup-log.json';
const CLEANUP_LOG_MAX_ENTRIES = 2_000;

export function appendCleanupLog(
  userDataPath: string,
  entries: readonly FilesCleanupLogEntry[],
): void {
  if (!entries.length) return;
  const file = path.join(userDataPath, CLEANUP_LOG_FILE);
  let existing: FilesCleanupLogEntry[] = [];
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf-8')) as { entries?: unknown };
    if (Array.isArray(parsed?.entries)) existing = parsed.entries as FilesCleanupLogEntry[];
  } catch {
    // No log yet, or an unreadable one. Starting a fresh log is better than
    // losing this run's receipt to a parse error in an older file.
  }
  const next = [...existing, ...entries].slice(-CLEANUP_LOG_MAX_ENTRIES);
  try {
    fs.writeFileSync(file, JSON.stringify({ entries: next }, null, 2), 'utf-8');
  } catch {
    // A log that cannot be written must not turn a completed removal into a
    // reported failure; the in-result log is still returned to the caller.
  }
}

export function readCleanupLog(userDataPath: string): FilesCleanupLogEntry[] {
  try {
    const parsed = JSON.parse(
      fs.readFileSync(path.join(userDataPath, CLEANUP_LOG_FILE), 'utf-8'),
    ) as { entries?: unknown };
    return Array.isArray(parsed?.entries) ? (parsed.entries as FilesCleanupLogEntry[]) : [];
  } catch {
    return [];
  }
}
