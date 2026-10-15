// @vitest-environment node
/**
 * Reading Lens watch region: the pixel-change check and its debounce.
 *
 * The watcher is driven with a hand-run clock and timer queue, and a sampler
 * that returns whatever picture the test puts "on screen", so every decision —
 * changed or not, settled or still moving, paused — is asserted exactly.
 */
import { describe, expect, it } from 'vitest';
import {
  createRegionWatcher,
  signatureDiff,
  signatureFromBitmap,
  WATCH_CHANGED_SHARE,
  WATCH_INTERVAL_MS,
  WATCH_MAX_PENDING_MS,
  WATCH_SETTLE_MS,
  WATCH_SETTLE_POLL_MS,
  type RegionSignature,
} from '../lensRegionWatch';

/** A BGRA bitmap filled with one grey, with optional dark "text" rectangles. */
function bitmap(width: number, height: number, ink: Array<[number, number, number, number]> = [], paper = 240): Uint8Array {
  const out = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    out[i * 4] = paper;
    out[i * 4 + 1] = paper;
    out[i * 4 + 2] = paper;
    out[i * 4 + 3] = 255;
  }
  for (const [x0, y0, w, h] of ink) {
    for (let y = y0; y < y0 + h; y += 1) {
      for (let x = x0; x < x0 + w; x += 1) {
        const at = (y * width + x) * 4;
        out[at] = 20;
        out[at + 1] = 20;
        out[at + 2] = 20;
      }
    }
  }
  return out;
}

function sig(ink: Array<[number, number, number, number]> = [], width = 480, height = 120): RegionSignature {
  const s = signatureFromBitmap(bitmap(width, height, ink), width, height);
  if (!s) throw new Error('no signature');
  return s;
}

describe('signatureFromBitmap', () => {
  it('reduces the longer side to the grid and keeps the aspect', () => {
    const s = sig([], 480, 120);
    expect(s.width).toBe(48);
    expect(s.height).toBe(12);
    const tall = signatureFromBitmap(bitmap(100, 400), 100, 400);
    expect(tall?.height).toBe(48);
    expect(tall?.width).toBe(12);
  });

  it('averages each block to its grey level', () => {
    const s = sig();
    expect([...s.cells].every((c) => c === 240)).toBe(true);
  });

  it('refuses an empty or short bitmap', () => {
    expect(signatureFromBitmap(new Uint8Array(0), 0, 0)).toBeNull();
    expect(signatureFromBitmap(new Uint8Array(10), 10, 10)).toBeNull();
  });

  it('never makes more cells than pixels', () => {
    const s = signatureFromBitmap(bitmap(6, 3), 6, 3);
    expect(s?.width).toBe(6);
    expect(s?.height).toBe(3);
  });
});

describe('signatureDiff', () => {
  it('is zero for the same picture', () => {
    expect(signatureDiff(sig([[20, 20, 200, 30]]), sig([[20, 20, 200, 30]]))).toBe(0);
  });

  it('sees a new line of text', () => {
    const before = sig([[20, 20, 200, 30]]);
    const after = sig([[20, 20, 200, 30], [20, 70, 300, 30]]);
    expect(signatureDiff(before, after)).toBeGreaterThan(WATCH_CHANGED_SHARE);
  });

  it('ignores one changed pixel (a cursor blink, video noise)', () => {
    const before = sig();
    const after = sig([[100, 50, 1, 1]]);
    expect(signatureDiff(before, after)).toBeLessThanOrEqual(WATCH_CHANGED_SHARE);
  });

  it('counts a different grid shape as a full change', () => {
    expect(signatureDiff(sig([], 480, 120), sig([], 120, 480))).toBe(1);
  });
});

/** A watcher on a fake clock: `advance` runs due timers and lets their samples resolve. */
function harness(over: { settleMs?: number } = {}) {
  let clock = 0;
  let screen = sig([[20, 20, 200, 30]]);
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let nextId = 1;
  const reads: RegionSignature[] = [];
  let samples = 0;
  const watcher = createRegionWatcher({
    sample: async () => {
      samples += 1;
      return screen;
    },
    onChange: (s) => {
      reads.push(s);
    },
    now: () => clock,
    setTimeout: (fn, ms) => {
      const id = nextId++;
      timers.push({ at: clock + ms, fn, id });
      return id;
    },
    clearTimeout: (handle) => {
      const i = timers.findIndex((t) => t.id === handle);
      if (i >= 0) timers.splice(i, 1);
    },
    ...over,
  });
  const flush = async (): Promise<void> => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };
  const advance = async (ms: number): Promise<void> => {
    const end = clock + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const due = timers[0];
      if (!due || due.at > end) break;
      timers.shift();
      clock = due.at;
      due.fn();
      await flush();
    }
    clock = end;
  };
  return {
    watcher,
    reads,
    advance,
    setScreen: (s: RegionSignature) => {
      screen = s;
    },
    samples: () => samples,
    pending: () => timers.length,
  };
}

describe('createRegionWatcher', () => {
  const line1 = sig([[20, 20, 200, 30]]);
  const line2 = sig([[20, 20, 320, 30], [20, 70, 120, 30]]);

  it('samples on an interval and reads nothing while the region is unchanged', async () => {
    const h = harness();
    h.watcher.start(line1);
    await h.advance(WATCH_INTERVAL_MS * 6);
    expect(h.samples()).toBe(6);
    expect(h.reads).toHaveLength(0);
  });

  it('takes the first sample as the baseline when started without one', async () => {
    const h = harness();
    h.watcher.start();
    await h.advance(WATCH_INTERVAL_MS * 4);
    expect(h.reads).toHaveLength(0);
  });

  it('reads a change once it has held still for the settle time (debounce)', async () => {
    const h = harness();
    h.watcher.start(line1);
    await h.advance(WATCH_INTERVAL_MS);
    h.setScreen(line2);
    // The first sample that sees the change starts the settle clock; no read yet.
    await h.advance(WATCH_INTERVAL_MS);
    expect(h.reads).toHaveLength(0);
    // Settling polls faster, and the read lands once the change has held still.
    await h.advance(WATCH_SETTLE_MS + WATCH_SETTLE_POLL_MS);
    expect(h.reads).toHaveLength(1);
    expect(signatureDiff(h.reads[0], line2)).toBe(0);
    // ...and only once: the new picture is now the baseline.
    await h.advance(WATCH_INTERVAL_MS * 4);
    expect(h.reads).toHaveLength(1);
  });

  it('waits for a typewriter effect to finish instead of reading it half-way', async () => {
    const h = harness();
    h.watcher.start(sig());
    await h.advance(WATCH_INTERVAL_MS);
    // A line that keeps growing every poll never settles...
    for (let w = 40; w <= 400; w += 40) {
      h.setScreen(sig([[20, 20, w, 30]]));
      await h.advance(WATCH_SETTLE_POLL_MS);
    }
    expect(h.reads).toHaveLength(0);
    // ...and is read once, complete, after it stops.
    await h.advance(WATCH_SETTLE_MS + WATCH_SETTLE_POLL_MS * 2);
    expect(h.reads).toHaveLength(1);
    expect(signatureDiff(h.reads[0], sig([[20, 20, 400, 30]]))).toBe(0);
  });

  it('reads a region that never stops moving after the longest wait', async () => {
    const h = harness();
    h.watcher.start(sig());
    await h.advance(WATCH_INTERVAL_MS);
    let x = 0;
    for (let t = 0; t <= WATCH_MAX_PENDING_MS + WATCH_INTERVAL_MS; t += WATCH_SETTLE_POLL_MS) {
      x = (x + 37) % 400;
      h.setScreen(sig([[x, 20, 60, 60]]));
      await h.advance(WATCH_SETTLE_POLL_MS);
    }
    expect(h.reads.length).toBeGreaterThanOrEqual(1);
  });

  it('forgets a change that goes back to what was read (a blink)', async () => {
    const h = harness();
    h.watcher.start(line1);
    await h.advance(WATCH_INTERVAL_MS);
    h.setScreen(line2);
    await h.advance(WATCH_INTERVAL_MS);
    h.setScreen(line1);
    await h.advance(WATCH_INTERVAL_MS * 4);
    expect(h.reads).toHaveLength(0);
  });

  it('does not sample while paused, and reads a change made meanwhile after resuming', async () => {
    const h = harness();
    h.watcher.start(line1);
    await h.advance(WATCH_INTERVAL_MS);
    h.watcher.pause();
    const before = h.samples();
    h.setScreen(line2);
    await h.advance(WATCH_INTERVAL_MS * 6);
    expect(h.samples()).toBe(before);
    expect(h.reads).toHaveLength(0);
    h.watcher.resume();
    await h.advance(WATCH_INTERVAL_MS + WATCH_SETTLE_MS + WATCH_SETTLE_POLL_MS * 2);
    expect(h.reads).toHaveLength(1);
  });

  it('stops for good: no timers left, no reads', async () => {
    const h = harness();
    h.watcher.start(line1);
    await h.advance(WATCH_INTERVAL_MS);
    h.watcher.stop();
    expect(h.watcher.running()).toBe(false);
    h.setScreen(line2);
    await h.advance(WATCH_INTERVAL_MS * 10);
    expect(h.reads).toHaveLength(0);
    expect(h.pending()).toBe(0);
  });

  it('keeps going when a sample fails', async () => {
    let fail = true;
    let clock = 0;
    const queue: Array<() => void> = [];
    const reads: unknown[] = [];
    const w = createRegionWatcher({
      sample: async () => {
        if (fail) throw new Error('capture failed');
        return line2;
      },
      onChange: (s) => {
        reads.push(s);
      },
      now: () => clock,
      setTimeout: (fn) => {
        queue.push(fn);
        return queue.length;
      },
      clearTimeout: () => undefined,
      settleMs: 0,
    });
    w.start(line1);
    await w.tick();
    expect(w.running()).toBe(true);
    fail = false;
    clock += 1000;
    await w.tick();
    clock += 1000;
    await w.tick();
    expect(reads).toHaveLength(1);
  });
});
