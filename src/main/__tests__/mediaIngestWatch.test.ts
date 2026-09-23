// @vitest-environment node
/**
 * Watch folders for the media ingest, driven on a fake clock and a fake
 * filesystem so the interesting moments — a file going quiet, a file being
 * rewritten in place, a baseline that must stay silent — are produced exactly.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import {
  BASELINE_RECENT_MS,
  MEDIA_SETTLE_MS,
  MEDIA_WATCH_DEBOUNCE_MS,
  MEDIA_WATCH_POLL_MS,
  MEDIA_WATCH_RECHECK_MS,
  createMediaFolderWatcher,
  type MediaWatchDeps,
  type MediaWatchFileStat,
} from '../mediaIngestWatch';

const MB = 1024 * 1024;
let clock = 1_000_000_000;
let queue: { fn: () => void; at: number; cancelled: boolean }[] = [];
let files: Map<string, { size: number; mtimeMs: number }>;
let dirs: Set<string>;
let handled: Set<string>;
let arrivals: string[][];
let events: Map<string, (relative: string | null) => void>;
let observeRefuses: boolean;
let busy: Set<string>;

function schedule(fn: () => void, ms: number) {
  const job = { fn, at: clock + ms, cancelled: false };
  queue.push(job);
  return { cancel: () => { job.cancelled = true; } };
}

/** Advance the clock, running whatever falls due, in order. */
function advance(ms: number): void {
  const until = clock + ms;
  for (;;) {
    const due = queue.filter((job) => !job.cancelled && job.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!due) break;
    clock = Math.max(clock, due.at);
    due.cancelled = true;
    due.fn();
  }
  clock = until;
}

function write(filePath: string, size: number, mtimeMs = clock): void {
  files.set(filePath, { size, mtimeMs });
}

function deps(patch: Partial<MediaWatchDeps> = {}): MediaWatchDeps {
  return {
    now: () => clock,
    schedule,
    observe: (root, onEvent) => {
      if (observeRefuses) return null;
      events.set(root, onEvent);
      return { close: () => events.delete(root) };
    },
    stat: (filePath): MediaWatchFileStat | null => {
      const file = files.get(filePath);
      if (file) return { size: file.size, mtimeMs: file.mtimeMs, isFile: true, isDirectory: false };
      return dirs.has(filePath) ? { size: 0, mtimeMs: 0, isFile: false, isDirectory: true } : null;
    },
    walk: (dir) => [...files.keys()].filter((filePath) => filePath.startsWith(`${dir}/`) && /\.(mkv|mp4)$/.test(filePath)),
    join: (root, relative) => `${root}/${relative.replace(/\\/g, '/')}`,
    isHandled: (filePath) => handled.has(filePath),
    markHandled: (paths) => { for (const filePath of paths) handled.add(filePath); },
    onArrivals: (paths) => {
      arrivals.push(paths);
      for (const filePath of paths) handled.add(filePath);
    },
    isBusy: (filePath) => busy.has(filePath),
    ...patch,
  };
}

function fire(root: string, relative: string | null): void {
  const handler = events.get(root);
  if (!handler) throw new Error(`no watcher on ${root}`);
  handler(relative);
}

beforeEach(() => {
  clock = 1_000_000_000;
  queue = [];
  files = new Map();
  dirs = new Set(['/w', '/w/Show']);
  handled = new Set();
  arrivals = [];
  events = new Map();
  observeRefuses = false;
  busy = new Set();
});

describe('a file arriving in a watched folder', () => {
  it('is imported once it has held its size for the settle window — and not before', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);

    write('/w/ep01.mkv', 100 * MB);
    fire('/w', 'ep01.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    expect(arrivals).toEqual([]);
    expect(watcher.pendingCount()).toBe(1);

    // Still growing: the clock restarts on every change.
    advance(MEDIA_WATCH_RECHECK_MS);
    write('/w/ep01.mkv', 300 * MB);
    advance(MEDIA_SETTLE_MS - 1_000);
    expect(arrivals).toEqual([]);

    // No further event ever fires; the re-check alone must notice it went quiet.
    advance(MEDIA_SETTLE_MS + MEDIA_WATCH_RECHECK_MS);
    expect(arrivals).toEqual([['/w/ep01.mkv']]);
    expect(watcher.pendingCount()).toBe(0);
  });

  it('restarts the clock when a preallocated file is written in place', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/ep02.mkv', 500 * MB);
    fire('/w', 'ep02.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    // Same size, new mtime, several times inside the window.
    for (let i = 0; i < 4; i += 1) {
      advance(MEDIA_WATCH_RECHECK_MS);
      write('/w/ep02.mkv', 500 * MB, clock);
    }
    expect(arrivals).toEqual([]);
    advance(MEDIA_SETTLE_MS + MEDIA_WATCH_RECHECK_MS * 2);
    expect(arrivals).toEqual([['/w/ep02.mkv']]);
  });

  it('waits while another process still holds the file for writing', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/copying.mkv', 700 * MB, clock - 60_000);
    busy.add('/w/copying.mkv');
    fire('/w', 'copying.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS + MEDIA_WATCH_RECHECK_MS * 3);
    expect(arrivals).toEqual([]);
    busy.clear();
    advance(MEDIA_WATCH_RECHECK_MS);
    expect(arrivals).toEqual([['/w/copying.mkv']]);
  });

  it('never imports a partial name, and picks the file up when it is renamed complete', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/ep03.mkv.!qB', 200 * MB);
    fire('/w', 'ep03.mkv.!qB');
    advance(MEDIA_WATCH_DEBOUNCE_MS + MEDIA_SETTLE_MS * 2);
    expect(arrivals).toEqual([]);
    expect(watcher.pendingCount()).toBe(0);

    files.delete('/w/ep03.mkv.!qB');
    write('/w/ep03.mkv', 200 * MB, clock - 30_000);
    fire('/w', 'ep03.mkv.!qB');
    fire('/w', 'ep03.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    // A rename keeps the old mtime, so a whole file that moved in is settled at once.
    expect(arrivals).toEqual([['/w/ep03.mkv']]);
  });

  it('walks a release folder that moved in as one event', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    dirs.add('/w/Batch');
    write('/w/Batch/01.mkv', 300 * MB, clock - 60_000);
    write('/w/Batch/02.mkv', 300 * MB, clock - 60_000);
    fire('/w', 'Batch');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    expect(arrivals).toEqual([['/w/Batch/01.mkv', '/w/Batch/02.mkv']]);
  });

  it('drops a file that settles too small to be an episode', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/tiny.mkv', 20 * 1024, clock - 60_000);
    fire('/w', 'tiny.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS + MEDIA_WATCH_RECHECK_MS);
    expect(arrivals).toEqual([]);
    expect(watcher.pendingCount()).toBe(0);
  });

  it('ignores anything inside a Sample folder', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/Show/Sample/show.mkv', 50 * MB, clock - 60_000);
    fire('/w', 'Show/Sample/show.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    expect(arrivals).toEqual([]);
  });

  it('does no disk work at all once nothing is pending', () => {
    let stats = 0;
    const base = deps();
    const watcher = createMediaFolderWatcher({ ...base, stat: (p) => { stats += 1; return base.stat(p); } });
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    const before = stats;
    advance(60 * 60_000);
    expect(stats).toBe(before);
  });
});

describe('scanning at start-up', () => {
  it('imports what arrived while the app was closed, and nothing already handled', () => {
    write('/w/old.mkv', 300 * MB, clock - 86_400_000);
    write('/w/new.mkv', 300 * MB, clock - 3_600_000);
    handled.add('/w/old.mkv');
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    expect(arrivals).toEqual([['/w/new.mkv']]);
  });

  it('records a new automatic folder silently, but still watches a file mid-download in it', () => {
    write('/w/a.mkv', 300 * MB, clock - 86_400_000);
    write('/w/b.mkv', 300 * MB, clock - 86_400_000);
    write('/w/arriving.mkv', 100 * MB, clock - 1_000);
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'baseline' }]);
    expect(arrivals).toEqual([]);
    expect([...handled].sort()).toEqual(['/w/a.mkv', '/w/b.mkv']);
    expect(BASELINE_RECENT_MS).toBeGreaterThan(1_000);
    advance(MEDIA_SETTLE_MS + MEDIA_WATCH_RECHECK_MS * 2);
    expect(arrivals).toEqual([['/w/arriving.mkv']]);
  });

  it('re-walks a folder the OS would not watch, instead of going silent', () => {
    observeRefuses = true;
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/late.mkv', 300 * MB, clock - 60_000);
    advance(MEDIA_WATCH_POLL_MS);
    expect(arrivals).toEqual([['/w/late.mkv']]);
  });

  it('stops watching a removed folder and forgets what was pending in it', () => {
    const watcher = createMediaFolderWatcher(deps());
    watcher.setRoots([{ path: '/w', mode: 'import' }]);
    write('/w/ep.mkv', 300 * MB);
    fire('/w', 'ep.mkv');
    advance(MEDIA_WATCH_DEBOUNCE_MS);
    expect(watcher.pendingCount()).toBe(1);
    watcher.setRoots([]);
    expect(watcher.pendingCount()).toBe(0);
    expect(events.size).toBe(0);
    advance(MEDIA_SETTLE_MS * 2);
    expect(arrivals).toEqual([]);
  });
});
