/**
 * Gate 25 — "Watch picks up a live download. A file appearing in a watched
 * folder is recognised **without a manual refresh**, and the elapsed time is
 * reported."
 *
 * The plan's second ingest route, and the one that connects the MAL pipeline
 * for free: a qBittorrent save path is just another watched folder.
 *
 * Three decisions carry this module, all of them learned from the way watching
 * usually breaks.
 *
 * **An event is a hint to look, never an answer.** `fs.watch` fires on the
 * writes, so the LAST event for a file arrives while it is still unstable and
 * nothing further will ever fire. A watcher that only re-checked on events
 * would therefore miss precisely the moment it exists to catch — the file
 * going quiet. So an event schedules a sweep, and while any file is still
 * unsettled a re-check keeps running on its own until it settles or is
 * dropped.
 *
 * **The baseline is silent.** The first sweep after a root is added records
 * what is already there and announces nothing. Announcing it would mean adding
 * Downloads reported nine hundred "arrivals", none of which arrived.
 *
 * **Elapsed is measured from the first sighting**, not from the last size
 * change: a download that stalled for an hour and then finished took an hour,
 * and reporting the final quiet second as its duration would be a number that
 * looks precise and means nothing.
 *
 * Recognition is `scanRoots` — the same walk, the same classifier, the same
 * skip rules as gate 23. A watcher with its own opinion about what a file is
 * would be the second classifier the plan spent gate 23 avoiding.
 */
import fs from 'node:fs';
import { scanRoots } from './scan';
import type { FilesScanEntry } from '../../shared/filesApp/scan';
import {
  DEFAULT_STABILITY_MS,
  StabilityLedger,
  type StabilityObservation,
} from '../../shared/filesApp/stability';

/** How long after a filesystem event the sweep runs. Coalesces a burst. */
export const WATCH_DEBOUNCE_MS = 400;

/**
 * How often a sweep re-runs while something is still unsettled.
 *
 * Only while unsettled: an idle watcher does no disk work at all, which is what
 * makes a permanently-watched Downloads folder affordable.
 */
export const WATCH_RECHECK_MS = 1_000;

/** A file that finished arriving. Every field is a measurement. */
export interface FilesWatchArrival {
  entry: FilesScanEntry;
  /** Which watched root it landed under. */
  root: string;
  /** First sighting → accepted, in ms. Gate 25's "elapsed time is reported". */
  elapsedMs: number;
  /** When it was accepted, so a late-arriving renderer can order a batch. */
  at: number;
}

export interface FilesWatchOptions {
  stabilityMs?: number;
  now?: () => number;
  /** Test seam: real timers by default. */
  schedule?: (fn: () => void, ms: number) => { cancel: () => void };
  /** Test seam so a suite can drive sweeps without `fs.watch`'s timing. */
  observe?: (root: string, onEvent: () => void) => { close: () => void };
}

export interface FilesWatchSession {
  /** Run one sweep now and return whatever arrived. Also the baseline call. */
  sweep: () => FilesWatchArrival[];
  /** Paths the watcher has seen but not yet accepted. A number, never a mood. */
  pendingCount: () => number;
  stop: () => void;
}

function defaultSchedule(fn: () => void, ms: number): { cancel: () => void } {
  const handle = setTimeout(fn, ms);
  // A watcher must never hold the process open by itself.
  if (typeof handle.unref === 'function') handle.unref();
  return { cancel: () => clearTimeout(handle) };
}

function defaultObserve(root: string, onEvent: () => void): { close: () => void } {
  try {
    const watcher = fs.watch(root, { recursive: true }, () => onEvent());
    // A watched folder that disappears is not a crash: the sweep will report
    // the root as unreadable and the session stays alive for the others.
    watcher.on('error', () => undefined);
    return { close: () => watcher.close() };
  } catch {
    // Recursive watching is unsupported on some platforms and some mounts. The
    // re-check timer still runs, so the folder degrades to polling rather than
    // to silence — and `pendingCount` still reports honestly.
    return { close: () => undefined };
  }
}

/**
 * Watch `roots` and call `onArrival` with each file that finishes arriving.
 *
 * The session is inert until `sweep()` is called once: that first call is the
 * baseline, and it deliberately returns nothing.
 */
export function watchRoots(
  roots: readonly string[],
  onArrival: (arrivals: FilesWatchArrival[]) => void,
  options: FilesWatchOptions = {},
): FilesWatchSession {
  const now = options.now ?? Date.now;
  const schedule = options.schedule ?? defaultSchedule;
  const observe = options.observe ?? defaultObserve;
  const stabilityMs = options.stabilityMs ?? DEFAULT_STABILITY_MS;

  const ledger = new StabilityLedger();
  /** Paths already announced. Announcing one twice is gate 29's failure early. */
  const announced = new Set<string>();
  /** Paths seen but not yet accepted, so `pendingCount` is a real count. */
  const pending = new Set<string>();
  let baselineDone = false;
  let stopped = false;
  let debounce: { cancel: () => void } | null = null;
  let recheck: { cancel: () => void } | null = null;

  const sweep = (): FilesWatchArrival[] => {
    if (stopped) return [];
    const at = now();
    /*
     * The ledger carried across sweeps is what gives a watched file the second
     * reading a one-shot scan cannot have. `stabilityFromMtime` only ever
     * applies to a FIRST sighting, and it is what makes the baseline silent in
     * practice rather than in intention: without it every pre-existing file is
     * a first sighting at baseline, gets skipped, and is then announced as an
     * "arrival" three seconds later — a folder of nine hundred settled files
     * would arrive one sweep after being added. A file genuinely mid-write at
     * baseline still has a fresh mtime, so it stays pending and is announced
     * for real when it finishes, which is the case worth keeping.
     */
    const report = scanRoots(roots, {
      stability: ledger,
      stabilityMs,
      stabilityFromMtime: true,
      now,
    });

    pending.clear();
    for (const skip of report.skips) {
      // Skips include the still-arriving ones, which is exactly what pending is.
      if (!announced.has(skip.path)) pending.add(skip.path);
    }

    const arrivals: FilesWatchArrival[] = [];
    for (const entry of report.entries) {
      if (announced.has(entry.path)) continue;
      announced.add(entry.path);
      if (!baselineDone) continue; // The baseline is silent. See the header.
      const observation: StabilityObservation | undefined = ledger.peek(entry.path);
      arrivals.push({
        entry,
        root: report.roots.find((r) => entry.path.startsWith(r)) ?? roots[0] ?? '',
        // `firstSeenAt` never moves, so this is the whole arrival, not the
        // final quiet second of it.
        elapsedMs: Math.max(0, at - (observation?.firstSeenAt ?? at)),
        at,
      });
    }
    baselineDone = true;

    // Something is still arriving, and no further event may ever fire for it.
    if (pending.size > 0) armRecheck();
    return arrivals;
  };

  function armRecheck(): void {
    if (stopped || recheck) return;
    recheck = schedule(() => {
      recheck = null;
      const arrivals = sweep();
      if (arrivals.length) onArrival(arrivals);
    }, WATCH_RECHECK_MS);
  }

  function onEvent(): void {
    if (stopped || debounce) return;
    debounce = schedule(() => {
      debounce = null;
      const arrivals = sweep();
      if (arrivals.length) onArrival(arrivals);
    }, WATCH_DEBOUNCE_MS);
  }

  const watchers = roots.map((root) => observe(root, onEvent));

  return {
    sweep,
    pendingCount: () => pending.size,
    stop: () => {
      stopped = true;
      debounce?.cancel();
      recheck?.cancel();
      debounce = null;
      recheck = null;
      for (const w of watchers) w.close();
    },
  };
}
