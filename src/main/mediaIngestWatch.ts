/**
 * Watch folders for the media ingest — the settle-detection half.
 *
 * Built on the Files app watcher's rules (`filesApp/watch.ts`), reusing its
 * stability ledger rather than restating it:
 *
 * - **An event is a hint to look, never an answer.** The last `fs.watch` event
 *   for a file arrives while it is still being written, so a file that is not
 *   settled yet keeps a re-check running until it is — no further event may
 *   ever come for the moment it finishes.
 * - **Settled means unchanged for a while**, measured by `StabilityLedger`. The
 *   window is longer than the Files app's three seconds because a video that
 *   pauses mid-copy is more common, and importing one early is worse. A change
 *   of `mtime` without a change of size (a client writing into a preallocated
 *   file) restarts the clock too.
 * - **An idle watcher does no disk work.** Only files that are pending are
 *   re-read; nothing is re-walked on a timer unless the OS refused to watch
 *   the folder at all.
 *
 * Unlike the Files watcher it watches only the paths an event names, rather
 * than re-walking every root on every event, because an auto-registered
 * download folder can hold thousands of files and a torrent writing into it
 * fires events continuously.
 *
 * Everything with a side effect is injected, so the suite drives it with a fake
 * clock and a fake filesystem.
 */

import { StabilityLedger, stabilityVerdict } from '../shared/filesApp/stability';
import { isIngestCandidateName, isIngestSizePlausible, isSkippedIngestDir } from '../shared/mediaIngest';

/** How long a file's size and mtime must hold before it counts as finished. */
export const MEDIA_SETTLE_MS = 8_000;
/** Coalesces a burst of events into one look. */
export const MEDIA_WATCH_DEBOUNCE_MS = 600;
/** How often pending files are re-read while something is still arriving. */
export const MEDIA_WATCH_RECHECK_MS = 2_000;
/** A folder the OS will not watch is re-walked this often instead. */
export const MEDIA_WATCH_POLL_MS = 5 * 60_000;
/**
 * At a baseline, a file written this recently may still be arriving, so it is
 * watched to completion rather than recorded as already there.
 */
export const BASELINE_RECENT_MS = 60_000;

export interface MediaWatchFileStat {
  size: number;
  mtimeMs: number;
  isFile: boolean;
  isDirectory: boolean;
}

export interface MediaWatchDeps {
  now: () => number;
  schedule: (fn: () => void, ms: number) => { cancel: () => void };
  /** `null` when the OS will not watch this folder; it is then polled. */
  observe: (root: string, onEvent: (relative: string | null) => void) => { close: () => void } | null;
  stat: (filePath: string) => MediaWatchFileStat | null;
  /** Candidate media files under a directory, recursively, with the skip rules applied. */
  walk: (dir: string) => string[];
  join: (root: string, relative: string) => string;
  /** Already in the library, or already dealt with by an earlier pass. */
  isHandled: (filePath: string) => boolean;
  /** Records files as dealt with without importing them (a baseline). */
  markHandled: (paths: string[]) => void;
  /** Settled files that nothing has handled yet. */
  onArrivals: (paths: string[], root: string) => void;
  /** Someone still has the file open for writing (Windows sharing violation). */
  isBusy?: (filePath: string) => boolean;
}

export interface MediaWatchRoot {
  path: string;
  /**
   * `import` brings in whatever is there and not yet handled; `baseline`
   * records what is there as handled and only imports what arrives later —
   * right for a folder the app added on its own, like qBittorrent's save path.
   */
  mode: 'import' | 'baseline';
}

export interface MediaFolderWatcher {
  /** Replace the watched set. New roots are scanned in their mode; removed ones stop. */
  setRoots: (roots: readonly MediaWatchRoot[]) => void;
  /** Scan every root for files that arrived while nothing was watching. */
  scanAll: () => void;
  pendingCount: () => number;
  roots: () => string[];
  stop: () => void;
}

export interface MediaWatchOptions {
  settleMs?: number;
  debounceMs?: number;
  recheckMs?: number;
  pollMs?: number;
}

/** True when no folder between the root and the file is one the walk skips. */
function relativeDirsAllowed(relative: string): boolean {
  const parts = relative.replace(/\\/g, '/').split('/').filter(Boolean);
  return !parts.slice(0, -1).some((dir) => isSkippedIngestDir(dir));
}

export function createMediaFolderWatcher(
  deps: MediaWatchDeps,
  options: MediaWatchOptions = {},
): MediaFolderWatcher {
  const settleMs = options.settleMs ?? MEDIA_SETTLE_MS;
  const debounceMs = options.debounceMs ?? MEDIA_WATCH_DEBOUNCE_MS;
  const recheckMs = options.recheckMs ?? MEDIA_WATCH_RECHECK_MS;
  const pollMs = options.pollMs ?? MEDIA_WATCH_POLL_MS;

  const ledger = new StabilityLedger();
  const mtimes = new Map<string, number>();
  /** Path → the root it arrived under. */
  const pending = new Map<string, string>();
  /** Event paths waiting for the debounce, with the root and relative path they came from. */
  const dirty = new Map<string, { root: string; relative: string | null }>();
  const watched = new Map<string, { close: () => void; poll: { cancel: () => void } | null }>();
  let debounce: { cancel: () => void } | null = null;
  let recheck: { cancel: () => void } | null = null;
  let stopped = false;

  const forget = (filePath: string): void => {
    pending.delete(filePath);
    ledger.forget(filePath);
    mtimes.delete(filePath);
  };

  function observeFile(filePath: string, stat: MediaWatchFileStat) {
    const previous = mtimes.get(filePath);
    // Written in place without growing (a preallocated torrent file, a remux
    // over the same size): the write itself is the change, so the clock restarts.
    if (previous !== undefined && previous !== stat.mtimeMs) ledger.forget(filePath);
    mtimes.set(filePath, stat.mtimeMs);
    // mtime seeds a first sighting only (see `observeSize`): a file moved in
    // whole is settled at once, one still being written is not.
    return ledger.observe(filePath, stat.size, deps.now(), stat.mtimeMs);
  }

  function scanRoot(root: string, mode: MediaWatchRoot['mode']): void {
    const now = deps.now();
    const baseline: string[] = [];
    for (const filePath of deps.walk(root)) {
      if (pending.has(filePath) || deps.isHandled(filePath)) continue;
      const stat = deps.stat(filePath);
      if (!stat || !stat.isFile) continue;
      if (mode === 'baseline' && now - stat.mtimeMs > BASELINE_RECENT_MS) {
        baseline.push(filePath);
        continue;
      }
      pending.set(filePath, root);
    }
    if (baseline.length) deps.markHandled(baseline);
  }

  function armRecheck(): void {
    if (stopped || recheck || pending.size === 0) return;
    recheck = deps.schedule(() => {
      recheck = null;
      checkPending();
    }, recheckMs);
  }

  function checkPending(): void {
    if (stopped) return;
    const now = deps.now();
    const settled = new Map<string, string[]>();
    for (const [filePath, root] of [...pending]) {
      const stat = deps.stat(filePath);
      if (!stat || !stat.isFile || deps.isHandled(filePath)) {
        forget(filePath);
        continue;
      }
      const verdict = stabilityVerdict(observeFile(filePath, stat), now, settleMs);
      if (!verdict.stable) continue;
      if (deps.isBusy?.(filePath)) continue;
      forget(filePath);
      // A file that settled too small to be an episode is dropped, not handled:
      // if it grows later, the event for that brings it back.
      if (!isIngestSizePlausible(filePath, stat.size)) continue;
      const list = settled.get(root) ?? [];
      list.push(filePath);
      settled.set(root, list);
    }
    for (const [root, paths] of settled) deps.onArrivals(paths, root);
    armRecheck();
  }

  function processDirty(): void {
    if (stopped) return;
    const batch = [...dirty];
    dirty.clear();
    for (const [target, { root, relative }] of batch) {
      if (!watched.has(root)) continue;
      if (relative === null) {
        // The OS could not say what changed: look at the whole folder again.
        scanRoot(root, 'import');
        continue;
      }
      if (!relativeDirsAllowed(relative)) continue;
      const stat = deps.stat(target);
      if (!stat) {
        // Deleted, or renamed away (`ep01.mkv.!qB` → `ep01.mkv` fires for both names).
        if (pending.has(target)) forget(target);
        continue;
      }
      if (stat.isDirectory) {
        // A whole release folder moved in fires one event, for the folder.
        for (const filePath of deps.walk(target)) {
          if (!pending.has(filePath) && !deps.isHandled(filePath)) pending.set(filePath, root);
        }
        continue;
      }
      if (stat.isFile && isIngestCandidateName(target) && !deps.isHandled(target)) {
        pending.set(target, root);
      }
    }
    checkPending();
  }

  function onEvent(root: string, relative: string | null): void {
    if (stopped) return;
    const target = relative ? deps.join(root, relative) : root;
    dirty.set(target, { root, relative });
    if (debounce) return;
    debounce = deps.schedule(() => {
      debounce = null;
      processDirty();
    }, debounceMs);
  }

  function startRoot(root: string): void {
    const observer = deps.observe(root, (relative) => onEvent(root, relative));
    const entry: { close: () => void; poll: { cancel: () => void } | null } = {
      close: observer ? observer.close : () => undefined,
      poll: null,
    };
    watched.set(root, entry);
    if (observer) return;
    // The OS would not watch it (some network shares and mounts): degrade to a
    // slow re-walk rather than to silence.
    const tick = (): void => {
      entry.poll = deps.schedule(() => {
        if (stopped || watched.get(root) !== entry) return;
        scanRoot(root, 'import');
        checkPending();
        tick();
      }, pollMs);
    };
    tick();
  }

  function stopRoot(root: string): void {
    const entry = watched.get(root);
    if (!entry) return;
    entry.close();
    entry.poll?.cancel();
    watched.delete(root);
    for (const [filePath, owner] of [...pending]) if (owner === root) forget(filePath);
  }

  return {
    setRoots(roots) {
      if (stopped) return;
      const wanted = new Map(roots.map((root) => [root.path, root.mode]));
      for (const root of [...watched.keys()]) if (!wanted.has(root)) stopRoot(root);
      let scanned = false;
      for (const [root, mode] of wanted) {
        if (watched.has(root)) continue;
        startRoot(root);
        scanRoot(root, mode);
        scanned = true;
      }
      if (scanned) checkPending();
    },
    scanAll() {
      if (stopped) return;
      for (const root of watched.keys()) scanRoot(root, 'import');
      checkPending();
    },
    pendingCount: () => pending.size,
    roots: () => [...watched.keys()],
    stop() {
      stopped = true;
      debounce?.cancel();
      recheck?.cancel();
      debounce = null;
      recheck = null;
      for (const root of [...watched.keys()]) stopRoot(root);
      dirty.clear();
    },
  };
}
