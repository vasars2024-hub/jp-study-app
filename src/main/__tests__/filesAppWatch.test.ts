// @vitest-environment node
/**
 * Gate 25 — "Watch picks up a live download. A file appearing in a watched
 * folder is recognised **without a manual refresh**, and the elapsed time is
 * reported."
 *
 * Two halves, and they are measured differently on purpose.
 *
 * **"Recognised, and the elapsed time is reported"** is measured on real bytes
 * arriving in real chunks in a real directory, with only the clock injected —
 * the same discipline gate 26 used, because the interesting moment is a file
 * going quiet, and a fake filesystem cannot produce it.
 *
 * **"Without a manual refresh"** is the claim a sweep-driven test cannot make
 * for itself: calling `sweep()` by hand IS the manual refresh. So the last
 * describe drives the session through its own scheduler with no sweep call at
 * all, and asserts that the callback fired anyway. A watcher that only ever
 * answered when asked would pass everything above and fail exactly there.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'files-watch-test-'));

vi.mock('electron', () => ({
  app: { getPath: () => tmpRoot, getName: () => 'test' },
  ipcMain: { handle: () => undefined, removeHandler: () => undefined },
  dialog: {},
  shell: {},
  BrowserWindow: { getAllWindows: () => [] },
}));

const { watchRoots, WATCH_RECHECK_MS } = await import('../filesApp/watch');
const { DEFAULT_STABILITY_MS } = await import('../../shared/filesApp/stability');
import type { FilesWatchArrival } from '../filesApp/watch';

let dir: string;
/*
 * Anchored to the real clock, because the watcher's baseline consults `mtime`
 * and a synthetic 5,000,000 would put every real file's timestamp in the
 * future, where the model correctly refuses to trust it. Advanced by hand from
 * there, so the test still never sleeps.
 */
let clock = Date.now();
const now = () => clock;

/** Scheduled callbacks, run when the test says so rather than when time passes. */
let queue: { fn: () => void; ms: number; cancelled: boolean }[] = [];
const schedule = (fn: () => void, ms: number) => {
  const job = { fn, ms, cancelled: false };
  queue.push(job);
  return {
    cancel: () => {
      job.cancelled = true;
    },
  };
};

/** Fire every scheduled job once, advancing the clock by its own delay. */
function runScheduled(): void {
  const due = queue;
  queue = [];
  for (const job of due) {
    if (job.cancelled) continue;
    clock += job.ms;
    job.fn();
  }
}

/** A fake `fs.watch`, so the event half is deterministic. */
let fire: (() => void) | null = null;
const observe = (_root: string, onEvent: () => void) => {
  fire = onEvent;
  return { close: () => undefined };
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(tmpRoot, 'watched-'));
  clock = Date.now();
  queue = [];
  fire = null;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/**
 * Append real bytes, and pin the file's mtime to the INJECTED clock.
 *
 * Without the pin the two clocks disagree: the test advances `clock` by a
 * minute while the filesystem's own timestamp stays at the real `Date.now()`,
 * so the baseline's mtime rule reads a file written this instant as having been
 * settled for a minute and accepts it a sweep early. Pinning is what makes
 * "written at this moment" mean the same thing to both.
 */
function append(name: string, bytes: number): void {
  const full = path.join(dir, name);
  fs.appendFileSync(full, Buffer.alloc(bytes, 7));
  const at = new Date(clock);
  fs.utimesSync(full, at, at);
}

/** A file that was already there, settled, before anyone started watching. */
function preExisting(name: string, contents: string, ageMs = 60_000): void {
  const full = path.join(dir, name);
  fs.writeFileSync(full, contents);
  const at = new Date(clock - ageMs);
  fs.utimesSync(full, at, at);
}

function session(onArrival: (a: FilesWatchArrival[]) => void, stabilityMs?: number) {
  return watchRoots([dir], onArrival, { now, schedule, observe, stabilityMs });
}

describe('gate 25 — a file arriving in a watched folder', () => {
  it('is recognised once it settles, and reports how long it took', () => {
    // Something already in the folder before watching starts, settled a minute
    // ago. It must NOT be announced — adding Downloads and being told about
    // nine hundred "arrivals" that arrived last year is what this guards.
    preExisting('already-here.srt', '1\n');

    const seen: FilesWatchArrival[][] = [];
    const watch = session((a) => seen.push(a));
    expect(watch.sweep()).toEqual([]); // the baseline is silent
    expect(seen).toEqual([]);

    // t+0: the download starts. One chunk on disk.
    clock += 1_000;
    append('ep01.mkv', 1024);
    expect(watch.sweep()).toEqual([]);
    expect(watch.pendingCount()).toBe(1);

    // t+2s: still arriving.
    clock += 1_000;
    append('ep01.mkv', 3072);
    expect(watch.sweep()).toEqual([]);
    expect(watch.pendingCount()).toBe(1);

    // The write stops. The window has to pass before it counts.
    clock += DEFAULT_STABILITY_MS;
    const arrivals = watch.sweep();
    expect(arrivals).toHaveLength(1);
    expect(arrivals[0].entry.name).toBe('ep01.mkv');
    expect(arrivals[0].entry.target).toBe('media');
    expect(arrivals[0].entry.sizeBytes).toBe(4096);
    // First sighting → accepted: 1 s of writing plus the 3 s window.
    expect(arrivals[0].elapsedMs).toBe(1_000 + DEFAULT_STABILITY_MS);
    expect(watch.pendingCount()).toBe(0);
    watch.stop();
  });

  it('elapsed covers the whole arrival, not its last quiet second', () => {
    const watch = session(() => undefined);
    watch.sweep();
    append('ep02.mkv', 1024);
    watch.sweep();
    // A long stall in the middle, the way a real torrent behaves.
    clock += 60_000;
    append('ep02.mkv', 1024);
    watch.sweep();
    clock += DEFAULT_STABILITY_MS;
    const [arrival] = watch.sweep();
    // 60 s of stall + the window. Measuring from the last size change would
    // have reported 3,000 for a download that took over a minute.
    expect(arrival.elapsedMs).toBe(60_000 + DEFAULT_STABILITY_MS);
    watch.stop();
  });

  it('announces a file exactly once, however many sweeps run', () => {
    const seen: FilesWatchArrival[][] = [];
    const watch = session((a) => seen.push(a));
    watch.sweep();
    append('ep03.srt', 64);
    watch.sweep();
    clock += DEFAULT_STABILITY_MS;
    expect(watch.sweep()).toHaveLength(1);
    for (let i = 0; i < 5; i += 1) {
      clock += 10_000;
      expect(watch.sweep()).toEqual([]);
    }
    watch.stop();
  });

  it('a still-growing file is never announced, whatever fires', () => {
    const seen: FilesWatchArrival[][] = [];
    const watch = session((a) => seen.push(a));
    watch.sweep();
    // Ten sweeps, a chunk before each: it never goes quiet, so it never lands.
    for (let i = 0; i < 10; i += 1) {
      append('ep04.mkv', 512);
      clock += 500;
      expect(watch.sweep()).toEqual([]);
    }
    expect(seen).toEqual([]);
    expect(watch.pendingCount()).toBe(1);
    watch.stop();
  });

  it('a partial download is not an arrival even after it settles', () => {
    const watch = session(() => undefined);
    watch.sweep();
    append('ep05.mkv.crdownload', 4096);
    clock += 60_000;
    expect(watch.sweep()).toEqual([]);
    // And its finished twin, in the same folder, IS one — so the refusal above
    // cannot pass as "the watcher announces nothing".
    append('ep05.srt', 64);
    watch.sweep();
    clock += DEFAULT_STABILITY_MS;
    expect(watch.sweep().map((a) => a.entry.name)).toEqual(['ep05.srt']);
    watch.stop();
  });
});

describe('gate 25 — "without a manual refresh"', () => {
  it('a filesystem event alone produces the arrival, with no sweep call', () => {
    const seen: FilesWatchArrival[][] = [];
    const watch = session((a) => seen.push(a));
    watch.sweep(); // baseline only

    append('ep06.srt', 64);
    // The event a real `fs.watch` would deliver. From here on nothing in this
    // test calls `sweep()` — that call would BE the manual refresh.
    fire?.();
    runScheduled(); // the debounced sweep: the file is a first sighting
    expect(seen).toEqual([]);

    // No further event will ever fire for a file that stopped being written.
    // The re-check the watcher armed for itself is what finds it.
    runScheduled();
    runScheduled();
    runScheduled();

    expect(seen.flat().map((a) => a.entry.name)).toEqual(['ep06.srt']);
    expect(seen.flat()[0].elapsedMs).toBeGreaterThanOrEqual(DEFAULT_STABILITY_MS);
    watch.stop();
  });

  it('an idle watcher schedules nothing — watching Downloads costs nothing at rest', () => {
    const watch = session(() => undefined);
    watch.sweep();
    // Nothing pending, so no re-check was armed. A watcher that polled forever
    // would sit on a media drive doing a tree walk every second.
    expect(queue.filter((j) => !j.cancelled)).toHaveLength(0);
    append('ep07.mkv', 1024);
    watch.sweep();
    expect(queue.filter((j) => !j.cancelled && j.ms === WATCH_RECHECK_MS)).toHaveLength(1);
    watch.stop();
  });

  it('stop() ends it: a later event announces nothing', () => {
    const seen: FilesWatchArrival[][] = [];
    const watch = session((a) => seen.push(a));
    watch.sweep();
    watch.stop();
    append('ep08.srt', 64);
    fire?.();
    runScheduled();
    clock += 60_000;
    runScheduled();
    expect(seen).toEqual([]);
  });
});
