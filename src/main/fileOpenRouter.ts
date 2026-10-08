/**
 * Files handed to Gum by Windows — "Open with Gum", a double-click on an
 * associated type (see `squirrelEvents.ts`), or a file dropped on the exe or a
 * shortcut — arrive as command-line arguments: on a cold start in
 * `process.argv`, and while Gum is running in the `second-instance` argv.
 *
 * Main only extracts and queues the paths. Where each one goes is decided by the
 * same planner and importers a window drop uses (`filedrop:classify` →
 * `renderer/components/DropRouter.tsx` → `renderer/fileImportExecute.ts`), so an
 * opened file behaves exactly like a dropped one:
 *
 *   .epub            -> Library (reader)          .cbz -> Library (manga reader)
 *   .apkg            -> Anki import               .srt/.ass -> subtitle attach
 *                                                  (asks for the video when it has no owner)
 *   .mkv/.mp4        -> Media library, and a single video starts playing
 *
 * Delivery is pull-then-push. The renderer drains the queue once it is mounted
 * (`fileOpen:drain`); after that, new paths are pushed to it (`fileOpen:paths`).
 * A cold start, a Blanc-only launch with no Study OS window yet, and a window
 * recreated by a chrome-mode switch all go through the same drain, so no path is
 * dropped for arriving before a renderer was listening.
 */
import path from 'node:path';
import fs from 'node:fs';
import { ipcMain, type BrowserWindow } from 'electron';
import { FILE_ASSOCIATIONS, squirrelEventOf } from './squirrelEvents';

/** Extensions accepted from the command line — exactly the registered ones. */
export const FILE_OPEN_EXTENSIONS: ReadonlySet<string> = new Set(FILE_ASSOCIATIONS.map((a) => a.ext));

/** A shell "open" of hundreds of files is a mis-click, not a request. */
export const FILE_OPEN_LIMIT = 50;

export type FileOpenKind = 'book' | 'manga' | 'anki' | 'subtitle' | 'video';

/** What a path will become. Documentation for logs and tests; the renderer's planner decides. */
export function fileOpenKind(filePath: string): FileOpenKind | null {
  switch (path.extname(filePath).toLowerCase()) {
    case '.epub':
      return 'book';
    case '.cbz':
      return 'manga';
    case '.apkg':
      return 'anki';
    case '.srt':
    case '.ass':
      return 'subtitle';
    case '.mkv':
    case '.mp4':
      return 'video';
    default:
      return null;
  }
}

export interface ArgvPathOptions {
  /** Relative paths resolve here; `second-instance` passes the caller's cwd. */
  cwd?: string;
  /** Existence check, injectable for tests. */
  isFile?: (p: string) => boolean;
}

function defaultIsFile(p: string): boolean {
  try {
    return fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * The openable files named in an argv. Skips argv[0] (the exe), every switch
 * (`--open=…`, Chromium's own flags, `--squirrel-*`), a dev launch's app path
 * (`.`), anything with an unregistered extension, and anything that is not an
 * existing file. Returns absolute, de-duplicated paths in argv order.
 */
export function filePathsFromArgv(argv: readonly string[], options: ArgvPathOptions = {}): string[] {
  // An install/update/uninstall launch names no files; its version argument is not one.
  const squirrel = squirrelEventOf(argv);
  if (squirrel && squirrel !== 'firstrun') return [];
  const isFile = options.isFile ?? defaultIsFile;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of argv.slice(1)) {
    const arg = raw.trim().replace(/^"(.*)"$/, '$1');
    if (!arg || arg.startsWith('-')) continue;
    if (!FILE_OPEN_EXTENSIONS.has(path.extname(arg).toLowerCase())) continue;
    const abs = path.resolve(options.cwd ?? process.cwd(), arg);
    const key = process.platform === 'win32' ? abs.toLowerCase() : abs;
    if (seen.has(key) || !isFile(abs)) continue;
    seen.add(key);
    out.push(abs);
    if (out.length >= FILE_OPEN_LIMIT) break;
  }
  return out;
}

export interface FileOpenDeps {
  /** The Study OS window, if one exists. */
  getMainWindow: () => BrowserWindow | null;
  /** Create (if needed), show and focus the Study OS window. */
  showMainWindow: () => void;
  /**
   * The lock screen is up: paths stay queued (not drained or pushed) until
   * elease() after the unlock, so nothing is imported behind the lock.
   */
  isLocked?: () => boolean;
}

export interface FileOpenRouter {
  /** Queue paths and get them to the Study OS renderer as soon as it is listening. */
  open: (paths: readonly string[]) => void;
  /** Deliver what queued while locked — call after an unlock. */
  release: () => void;
  /** For tests and diagnostics. */
  pending: () => readonly string[];
}

/**
 * The queue and its two IPC ends. `ipc` is injectable so the queue can be tested
 * without Electron.
 */
export function createFileOpenRouter(
  deps: FileOpenDeps,
  ipc: Pick<typeof ipcMain, 'handle'> = ipcMain,
): FileOpenRouter {
  let queue: string[] = [];
  /** webContents id of the renderer that drained — the one that is listening. */
  let listeningId: number | null = null;

  const flush = () => {
    if (!queue.length || deps.isLocked?.()) return;
    const win = deps.getMainWindow();
    if (!win || win.isDestroyed() || win.webContents.id !== listeningId) return;
    const paths = queue;
    queue = [];
    win.webContents.send('fileOpen:paths', paths);
  };

  ipc.handle('fileOpen:drain', (event) => {
    // Only the Study OS window may take the queue — not Blanc, a popup, or any
    // other renderer that can reach ipcRenderer.
    const win = deps.getMainWindow();
    if (!win || win.isDestroyed() || event.sender.id !== win.webContents.id) return [];
    listeningId = event.sender.id;
    if (deps.isLocked?.()) return [];
    const paths = queue;
    queue = [];
    return paths;
  });

  return {
    open(paths) {
      if (!paths.length) return;
      queue.push(...paths.filter((p) => !queue.includes(p)));
      deps.showMainWindow();
      flush();
    },
    release: flush,
    pending: () => queue,
  };
}
