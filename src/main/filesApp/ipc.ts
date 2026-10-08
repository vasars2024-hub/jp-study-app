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
import { BrowserWindow, app, clipboard, ipcMain, shell } from 'electron';
import { dictionaryDb } from '../dictionary/db';
import { revealTargetFor, type FilesIndexSnapshot, type FilesLocation } from '../../shared/filesApp/catalog';
import { normalizeIngestSettings } from '../../shared/filesApp/ingest';
import { folderCandidatesFrom, resolveFolders } from '../../shared/filesApp/clipboardPaths';
import type { FilesMineSourceResult } from '../../shared/filesApp/mining';
import type { FilesScanReportWithArchives } from '../../shared/filesApp/archive';
import {
  buildFilesIndex,
  buildFilesIndexAsync,
  type FilesEnumeratorContext,
  type FilesSqliteLike,
} from './enumerators';
import {
  createFilesDeletionMainDependencies,
  registerFilesDeletionIpc,
  registerFilesTrashOwnedFileIpc,
} from './deletionIpc';
import { createCleanupSoftDelete, registerFilesCleanupIpc } from './cleanupIpc';
import type { FilesCleanupLogEntry } from '../../shared/filesApp/cleanup';
import { readFilesMineSource } from './mineSource';
import { scanRoots } from './scan';
import { watchRoots, type FilesWatchArrival, type FilesWatchSession } from './watch';
import { readJsonSync, writeJsonAtomicSync } from '../atomicJson';
import {
  FILES_WATCH_IMPORT_CHANNEL,
  FILES_WATCH_STORE_FILE,
  normalizeFilesWatchPersisted,
  type FilesWatchImportArrival,
} from '../../shared/filesApp/watchImport';
import { FILES_DUPLICATES_CHANNEL, FILES_PREVIEW_CHANNEL } from '../../shared/filesApp/preview';
import { findIndexDuplicates, previewFilesItem } from './preview';
import { ingestPathKey, isIngestCandidatePath, isPathKeyWithin } from '../../shared/mediaIngest';

/** How long a built index is served before the next request rebuilds it. */
const INDEX_TTL_MS = 15_000;

let cached: FilesIndexSnapshot | null = null;
/** Bumped by every invalidation, so a build that started earlier is not cached. */
let indexGeneration = 0;
/** The async build in progress; concurrent opens/refreshes share it. */
let building: { generation: number; promise: Promise<FilesIndexSnapshot> } | null = null;

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
  requestWatchImport(arrivals);
}

/**
 * What this module needs from the rest of main, injected by `main.ts` (see
 * `ipcDeps.ts`) so the handlers stay testable without loading the library,
 * media-ingest and PDF modules.
 */
let deps: FilesAppIpcOptions = {};

/**
 * Whether the media-ingest watcher already imports this arrival — a media
 * file, inside one of ITS active folders, that its own name/dir rules accept.
 * That watcher runs from app start and files what it imports; importing here
 * as well would put every episode in the library twice.
 */
export function coveredByMediaIngest(
  entry: { path: string; target: string },
  mediaFolders: readonly string[],
): boolean {
  if (entry.target !== 'media' || !isIngestCandidatePath(entry.path)) return false;
  const key = ingestPathKey(entry.path);
  return mediaFolders.some((folder) => isPathKeyWithin(key, ingestPathKey(folder)));
}

function requestWatchImport(arrivals: FilesWatchArrival[]): void {
  // The window that runs watched-folder imports. Exactly one, so a Files window
  // popped out beside the desktop cannot import the same arrival a second time;
  // the importers are renderer-side (`renderer/fileImportExecute.ts`), so the
  // main window's renderer is where they run.
  const win = deps.mainWindow?.();
  if (!win || win.isDestroyed()) return;
  let mediaFolders: string[] = [];
  try {
    mediaFolders = deps.mediaIngestFolders?.() ?? [];
  } catch {
    mediaFolders = [];
  }
  const payload: FilesWatchImportArrival[] = arrivals.map((arrival) => ({
    entry: arrival.entry,
    root: arrival.root,
    ...(coveredByMediaIngest(arrival.entry, mediaFolders) ? { coveredByMediaIngest: true } : {}),
  }));
  win.webContents.send(FILES_WATCH_IMPORT_CHANNEL, payload);
}

function watchStorePath(): string {
  return path.join(app.getPath('userData'), FILES_WATCH_STORE_FILE);
}

/** Start (or replace) the one watch session. Shared by the IPC and app start. */
function startWatchSession(list: string[], stabilityOption: unknown): FilesWatchStatus {
  watchSession?.stop();
  watchSession = null;
  watchRootsInUse = [];
  if (!list.length) return { roots: [], pending: 0 };
  const stabilityMs = normalizeIngestSettings(stabilityOption).stabilityMs;
  const session = watchRoots(list, broadcastArrivals, { stabilityMs });
  // The baseline sweep, whose whole job is to announce nothing.
  session.sweep();
  watchSession = session;
  watchRootsInUse = list;
  return { roots: list, pending: session.pendingCount() };
}

/**
 * Resume watching at app start, from main's own copy of the list — watching
 * used to stop at every restart until the Files window was opened again,
 * because only the renderer knew the roots. Runs after first paint.
 */
export function startFilesWatchFromDisk(): FilesWatchStatus {
  const saved = normalizeFilesWatchPersisted(readJsonSync<unknown>(watchStorePath(), null));
  if (!saved.roots.length || watchSession) return { roots: [...watchRootsInUse], pending: 0 };
  return startWatchSession(saved.roots, { stabilityMs: saved.stabilityMs });
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
  indexGeneration += 1;
}

export function getFilesIndex(force = false): FilesIndexSnapshot {
  if (!force && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached;
  cached = buildFilesIndex(defaultFilesContext());
  return cached;
}

/**
 * What the Files app's open and refresh ask for (D315/D345). The build yields
 * to the event loop between stores instead of holding the main process for the
 * whole walk, and a second request while one is running joins it rather than
 * starting another walk. A build that an invalidation overtook is returned to
 * its callers but not cached, so the next request sees the change.
 */
export function getFilesIndexAsync(
  force = false,
  build: (ctx: FilesEnumeratorContext) => Promise<FilesIndexSnapshot> = (ctx) => buildFilesIndexAsync(ctx),
): Promise<FilesIndexSnapshot> {
  if (!force && cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return Promise.resolve(cached);
  if (building && building.generation === indexGeneration) return building.promise;
  const generation = indexGeneration;
  const promise = build(defaultFilesContext())
    .then((snapshot) => {
      if (generation === indexGeneration) cached = snapshot;
      return snapshot;
    })
    .finally(() => {
      if (building?.promise === promise) building = null;
    });
  building = { generation, promise };
  return promise;
}

export interface FilesRevealResult {
  ok: boolean;
  /** i18n key naming why a refusal happened. Never a bare `false`. */
  reasonKey?: string;
}

export interface FilesAppIpcOptions {
  /** The main desktop window — where watched-folder imports run. */
  mainWindow?: () => BrowserWindow | null;
  /** The media-ingest watcher's active folders; media there is its to import. */
  mediaIngestFolders?: () => string[];
  /** `localfile://` URL for an image on disk (the preview pane). */
  localFileUrl?: (absPath: string) => string;
  /** Page one of a PDF as an image file, for the preview pane. */
  renderPdfFirstPage?: (pdfPath: string, outDir: string) => Promise<string | null>;
}

export function registerFilesAppIpc(options: FilesAppIpcOptions = {}): void {
  deps = options;

  ipcMain.handle('filesapp:index', (_e, force: unknown): Promise<FilesIndexSnapshot> =>
    getFilesIndexAsync(force === true),
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
  ipcMain.handle('filesapp:scan', (_e, roots: unknown, options: unknown): FilesScanReportWithArchives => {
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
   * Gate 28's first three words — the folder currently on the clipboard.
   *
   * Read-only in both directions: the clipboard is read and never written, and
   * the candidates are `stat`ed and never opened. Parsing lives in
   * `shared/filesApp/clipboardPaths.ts` so it is testable without Electron;
   * this handler exists for the two things that genuinely need the main
   * process — the `FileNameW` format, which the renderer's own paste event
   * cannot see, and the existence check.
   *
   * A file is answered with its PARENT rather than refused. A user who copied
   * `ep01.mkv` and pasted it into a folder scanner means the folder it is in,
   * and refusing would be technically correct and useless.
   */
  ipcMain.handle('filesapp:clipboard-folders', (): string[] => {
    let fileNameW: Uint8Array | null = null;
    let text = '';
    try {
      // `readBuffer` throws on some platforms for an absent format rather than
      // returning empty, so the availability check comes first.
      if (clipboard.availableFormats().includes('FileNameW')) {
        fileNameW = clipboard.readBuffer('FileNameW');
      }
    } catch {
      fileNameW = null;
    }
    try {
      text = clipboard.readText() ?? '';
    } catch {
      text = '';
    }

    return resolveFolders(folderCandidatesFrom({ fileNameW, text }), {
      kindOf: (candidate) => {
        try {
          const stat = fs.statSync(candidate);
          if (stat.isDirectory()) return 'directory';
          if (stat.isFile()) return 'file';
          return null;
        } catch {
          // Not on this machine, or not readable. Dropped, not offered.
          return null;
        }
      },
      parentOf: (candidate) => path.dirname(candidate),
    });
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
   * gate 31's window) and re-sends it on load. Main keeps a COPY of what it
   * was last told (`files-watch.json`), so the watch resumes at the next app
   * start without the Files window having to be opened first.
   */
  ipcMain.handle('filesapp:watch-set', (_e, roots: unknown, options: unknown): FilesWatchStatus => {
    const list = Array.isArray(roots)
      ? roots.filter((r): r is string => typeof r === 'string' && r.length > 0).slice(0, 8)
      : [];
    const stabilityMs = normalizeIngestSettings(options).stabilityMs;
    try {
      writeJsonAtomicSync(watchStorePath(), normalizeFilesWatchPersisted({ roots: list, stabilityMs }));
    } catch {
      // Watching still starts; it just will not resume by itself after a restart.
    }
    return startWatchSession(list, { stabilityMs });
  });

  /**
   * The preview pane: one item, resolved by id from the index (never a path
   * from the renderer), read through a reader this app already has.
   */
  ipcMain.handle(FILES_PREVIEW_CHANNEL, (_e, itemId: unknown) => {
    const item =
      typeof itemId === 'string' ? (getFilesIndex().items.find((i) => i.id === itemId) ?? null) : null;
    const toUrl = deps.localFileUrl;
    if (!toUrl) return { kind: 'none', reasonKey: 'filesApp.preview.none.unsupported' };
    return previewFilesItem(item, {
      localFileUrl: toUrl,
      renderPdfFirstPage: deps.renderPdfFirstPage,
      tempDir: () => app.getPath('temp'),
    });
  });

  /** Rows that are the same file twice: one path under two sources, or equal bytes. */
  ipcMain.handle(FILES_DUPLICATES_CHANNEL, () => findIndexDuplicates(getFilesIndex().items));

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
  const deletionDeps = createFilesDeletionMainDependencies({
    getItems: () => getFilesIndex(true).items,
    invalidate: invalidateFilesIndex,
    trashItem: (target) => shell.trashItem(target),
  });
  registerFilesDeletionIpc(ipcMain, deletionDeps);
  // Linked media's "also move the file to the Recycle Bin" (audit r2 #2).
  registerFilesTrashOwnedFileIpc(ipcMain, deletionDeps);

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
  // No log yet, or an unreadable one (moved aside by the reader): starting a
  // fresh log is better than losing this run's receipt to an older file.
  const existing = readCleanupLog(userDataPath);
  const next = [...existing, ...entries].slice(-CLEANUP_LOG_MAX_ENTRIES);
  try {
    writeJsonAtomicSync(file, { entries: next });
  } catch {
    // A log that cannot be written must not turn a completed removal into a
    // reported failure; the in-result log is still returned to the caller.
  }
}

export function readCleanupLog(userDataPath: string): FilesCleanupLogEntry[] {
  const parsed = readJsonSync<{ entries: FilesCleanupLogEntry[] } | null>(
    path.join(userDataPath, CLEANUP_LOG_FILE),
    null,
    { validate: (v) => v !== null && typeof v === 'object' && Array.isArray((v as { entries?: unknown }).entries) },
  );
  return parsed ? parsed.entries : [];
}
