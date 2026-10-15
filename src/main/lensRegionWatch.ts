/**
 * Reading Lens "watch region": the change detector behind it.
 *
 * A visual novel or a game keeps its text in one box. Instead of the reader
 * pressing "repeat" after every line, the Lens watches the box and reads it
 * again when its pixels change — the owocr / GSM behaviour. OCR is far too
 * expensive to run on a timer, so the watch runs a cheap check instead: the
 * region is sampled at a reduced size, block-averaged into a small grid of
 * grey levels, and compared with the grid at the last read. Only a change that
 * has also *settled* (two samples in a row that agree) fires a read, so a
 * typewriter effect or a fade is read once, finished, rather than half-way
 * through.
 *
 * Pure apart from the injected sampler and timers, so the detection and the
 * debounce are tested without Electron (`__tests__/lensRegionWatch.test.ts`).
 */

/** How often the region is sampled while nothing is changing. */
export const WATCH_INTERVAL_MS = 500;
/** A change must hold still this long before it is read (the debounce). */
export const WATCH_SETTLE_MS = 350;
/** While a change is settling, samples come this often. */
export const WATCH_SETTLE_POLL_MS = 150;
/** A region that never stops moving (scrolling credits, a video) is read anyway after this. */
export const WATCH_MAX_PENDING_MS = 4_000;
/** The longer side of the grey-level grid a sample is reduced to. */
export const WATCH_GRID = 48;
/** How far (0–255) a cell's grey level must move to count as changed. */
export const WATCH_CELL_DELTA = 28;
/** The share of cells that must change before the region counts as changed. */
export const WATCH_CHANGED_SHARE = 0.012;

/** A sample reduced to a small grid of grey levels. */
export interface RegionSignature {
  width: number;
  height: number;
  cells: Uint8Array;
}

/**
 * Reduce a BGRA bitmap (what `NativeImage.toBitmap()` returns on Windows) to a
 * `grid`-sized grey-level signature by block averaging.
 *
 * The longer side gets `grid` cells, so a tall vertical-text box is sampled as
 * finely as a wide subtitle bar. Averaging (rather than picking one pixel per
 * cell) is what makes the check robust to a cursor blink or video noise in one
 * pixel while still seeing a new line of text, which moves whole cells.
 */
export function signatureFromBitmap(
  bgra: Uint8Array,
  width: number,
  height: number,
  grid: number = WATCH_GRID,
): RegionSignature | null {
  if (!(width > 0 && height > 0) || bgra.length < width * height * 4) return null;
  const longest = Math.max(width, height);
  const cellsAcross = Math.max(1, Math.min(width, Math.round((grid * width) / longest)));
  const cellsDown = Math.max(1, Math.min(height, Math.round((grid * height) / longest)));
  const sums = new Float64Array(cellsAcross * cellsDown);
  const counts = new Uint32Array(cellsAcross * cellsDown);
  for (let y = 0; y < height; y += 1) {
    const cy = Math.min(cellsDown - 1, Math.floor((y * cellsDown) / height));
    const row = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const cx = Math.min(cellsAcross - 1, Math.floor((x * cellsAcross) / width));
      const at = row + x * 4;
      // BGRA: Rec. 601 luma weights.
      const grey = 0.114 * bgra[at] + 0.587 * bgra[at + 1] + 0.299 * bgra[at + 2];
      const cell = cy * cellsAcross + cx;
      sums[cell] += grey;
      counts[cell] += 1;
    }
  }
  const cells = new Uint8Array(sums.length);
  for (let i = 0; i < cells.length; i += 1) cells[i] = counts[i] ? Math.round(sums[i] / counts[i]) : 0;
  return { width: cellsAcross, height: cellsDown, cells };
}

/** The share of cells (0–1) whose grey level moved by more than `cellDelta`. A different grid shape is a full change. */
export function signatureDiff(
  a: RegionSignature,
  b: RegionSignature,
  cellDelta: number = WATCH_CELL_DELTA,
): number {
  if (a.width !== b.width || a.height !== b.height || a.cells.length !== b.cells.length) return 1;
  if (!a.cells.length) return 0;
  let changed = 0;
  for (let i = 0; i < a.cells.length; i += 1) {
    if (Math.abs(a.cells[i] - b.cells[i]) > cellDelta) changed += 1;
  }
  return changed / a.cells.length;
}

export interface RegionWatchTuning {
  intervalMs?: number;
  settleMs?: number;
  settlePollMs?: number;
  maxPendingMs?: number;
  cellDelta?: number;
  changedShare?: number;
}

export interface RegionWatcherDeps extends RegionWatchTuning {
  /** One cheap look at the region; null when it could not be captured this time. */
  sample: () => Promise<RegionSignature | null>;
  /** The region changed and settled: read it. Sampling waits for this to return. */
  onChange: (signature: RegionSignature) => void | Promise<void>;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface RegionWatcher {
  /** Start sampling. `baseline` is the picture already read; without one the first sample becomes it. */
  start(baseline?: RegionSignature | null): void;
  stop(): void;
  /** Stop sampling without forgetting the baseline (the Lens has a popup over the region). */
  pause(): void;
  /** Sample again; a change made while paused is read as soon as it is seen. */
  resume(): void;
  running(): boolean;
  paused(): boolean;
  /** Run one sample now (tests, and a resume that should not wait a whole interval). */
  tick(): Promise<void>;
}

export function createRegionWatcher(deps: RegionWatcherDeps): RegionWatcher {
  const now = deps.now ?? Date.now;
  const later = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel = deps.clearTimeout ?? ((handle: unknown) => clearTimeout(handle as NodeJS.Timeout));
  const intervalMs = deps.intervalMs ?? WATCH_INTERVAL_MS;
  const settleMs = deps.settleMs ?? WATCH_SETTLE_MS;
  const settlePollMs = deps.settlePollMs ?? WATCH_SETTLE_POLL_MS;
  const maxPendingMs = deps.maxPendingMs ?? WATCH_MAX_PENDING_MS;
  const cellDelta = deps.cellDelta ?? WATCH_CELL_DELTA;
  const changedShare = deps.changedShare ?? WATCH_CHANGED_SHARE;

  let active = false;
  let isPaused = false;
  let timer: unknown = null;
  let busy = false;
  let generation = 0;
  /** The picture at the last read: a change is measured against this. */
  let baseline: RegionSignature | null = null;
  /** The previous sample, to tell "still moving" from "settled". */
  let last: RegionSignature | null = null;
  /** When the current, not yet read change was first seen. */
  let changedAt: number | null = null;
  /** When the current change last moved. */
  let movedAt = 0;

  const differs = (a: RegionSignature, b: RegionSignature): boolean => signatureDiff(a, b, cellDelta) > changedShare;

  const schedule = (ms: number): void => {
    if (!active || isPaused) return;
    if (timer) cancel(timer);
    const token = generation;
    timer = later(() => {
      timer = null;
      if (token === generation) void tick();
    }, ms);
  };

  async function tick(): Promise<void> {
    if (!active || isPaused) return;
    if (busy) {
      // A sample from before a restart is still in flight: look again shortly.
      schedule(settlePollMs);
      return;
    }
    busy = true;
    const token = generation;
    let next = intervalMs;
    try {
      let signature: RegionSignature | null = null;
      try {
        signature = await deps.sample();
      } catch {
        signature = null;
      }
      if (token !== generation || !active || isPaused) return;
      if (!signature) return;
      if (!baseline) {
        baseline = signature;
        last = signature;
        return;
      }
      if (!differs(signature, baseline)) {
        // Unchanged, or a change that went back to what was read (a blink).
        changedAt = null;
        last = signature;
        return;
      }
      const at = now();
      if (changedAt === null) {
        changedAt = at;
        movedAt = at;
      } else if (last && differs(signature, last)) {
        movedAt = at;
      }
      last = signature;
      const settled = at - movedAt >= settleMs;
      const starved = at - changedAt >= maxPendingMs;
      if (!settled && !starved) {
        next = settlePollMs;
        return;
      }
      baseline = signature;
      changedAt = null;
      try {
        await deps.onChange(signature);
      } catch {
        /* a failed read is the reader's to show; the watch keeps going */
      }
    } finally {
      busy = false;
      if (token === generation) schedule(next);
    }
  }

  return {
    start(initial = null) {
      generation += 1;
      if (timer) cancel(timer);
      timer = null;
      active = true;
      isPaused = false;
      baseline = initial;
      last = initial;
      changedAt = null;
      schedule(intervalMs);
    },
    stop() {
      generation += 1;
      active = false;
      isPaused = false;
      if (timer) cancel(timer);
      timer = null;
      baseline = null;
      last = null;
      changedAt = null;
    },
    pause() {
      if (!active) return;
      isPaused = true;
      if (timer) cancel(timer);
      timer = null;
    },
    resume() {
      if (!active || !isPaused) return;
      isPaused = false;
      // What was on screen while paused (a popup) is not a change to settle on.
      last = baseline;
      changedAt = null;
      schedule(intervalMs);
    },
    running: () => active,
    paused: () => isPaused,
    tick,
  };
}
