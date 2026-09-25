// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Window geometry on a mixed-scale Windows setup.
 *
 * Fixture = the machine the defects were measured on: a 1280x720 @150% primary
 * (853x480 DIP, work area 853x448 above the taskbar) with a 1920x1080 @100% second
 * monitor to its right. The frameless main window grew to 65,535 px tall when resized
 * or moved, and its 940x600 DIP minimum did not fit on the primary at all.
 */

type Rect = { x: number; y: number; width: number; height: number };
type Listener = (...args: unknown[]) => void;

const h = vi.hoisted(() => {
  const displays = [
    { id: 1, bounds: { x: 0, y: 0, width: 853, height: 480 }, workArea: { x: 0, y: 0, width: 853, height: 448 } },
    {
      id: 2,
      bounds: { x: 853, y: 0, width: 1920, height: 1080 },
      workArea: { x: 853, y: 0, width: 1920, height: 1040 },
    },
  ];
  const screenListeners = new Map<string, Set<(...a: unknown[]) => void>>();
  /** Greatest-overlap display, like Electron's getDisplayMatching; ties go to the first. */
  function matching(r: { x: number; y: number; width: number; height: number }) {
    let best = displays[0];
    let bestArea = -1;
    for (const d of displays) {
      const b = d.bounds;
      const w = Math.max(0, Math.min(r.x + r.width, b.x + b.width) - Math.max(r.x, b.x));
      const hh = Math.max(0, Math.min(r.y + r.height, b.y + b.height) - Math.max(r.y, b.y));
      if (w * hh > bestArea) {
        best = d;
        bestArea = w * hh;
      }
    }
    return best;
  }
  return { displays, screenListeners, matching };
});

vi.mock('electron', () => ({
  screen: {
    getDisplayMatching: (r: Rect) => h.matching(r),
    getPrimaryDisplay: () => h.displays[0],
    on: (event: string, cb: (...a: unknown[]) => void) => {
      if (!h.screenListeners.has(event)) h.screenListeners.set(event, new Set());
      h.screenListeners.get(event)!.add(cb);
    },
    removeListener: (event: string, cb: (...a: unknown[]) => void) => {
      h.screenListeners.get(event)?.delete(cb);
    },
  },
}));

const mod = await import('../windowBounds');

/** A window whose OS keeps a bogus size once (the 65,535 px growth), then obeys. */
class FakeWindow {
  bounds: Rect;
  min: [number, number] = [0, 0];
  maximized = false;
  listeners = new Map<string, Listener[]>();
  setBoundsCalls: Rect[] = [];
  /** How many upcoming setBounds calls the "OS" ignores. */
  ignoreNextSets = 0;
  constructor(b: Rect) {
    this.bounds = { ...b };
  }
  on(event: string, cb: Listener): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), cb]);
    return this;
  }
  removeListener(event: string, cb: Listener): this {
    this.listeners.set(event, (this.listeners.get(event) ?? []).filter((l) => l !== cb));
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const cb of this.listeners.get(event) ?? []) cb(...args);
  }
  getBounds(): Rect {
    return { ...this.bounds };
  }
  setBounds(b: Rect): void {
    this.setBoundsCalls.push({ ...b });
    if (this.ignoreNextSets > 0) {
      this.ignoreNextSets -= 1;
    } else {
      this.bounds = { ...b };
    }
    // Real windows report programmatic geometry changes synchronously on Windows.
    this.emit('resize');
  }
  setMinimumSize(w: number, hgt: number): void {
    this.min = [w, hgt];
  }
  getMinimumSize(): number[] {
    return [...this.min];
  }
  isDestroyed(): boolean {
    return false;
  }
  isMaximized(): boolean {
    return this.maximized;
  }
  isMinimized(): boolean {
    return false;
  }
  isFullScreen(): boolean {
    return false;
  }
}

function guard(win: FakeWindow) {
  return mod.guardWindowToWorkArea(win as unknown as Parameters<typeof mod.guardWindowToWorkArea>[0]);
}

beforeEach(() => {
  h.screenListeners.clear();
});

describe('applyBoundsVerified', () => {
  it('sets the bounds again when the window landed at the wrong scale', () => {
    // Electron placed a 1920x1080 request at 1920/1.5 x 1080/1.5 the first time.
    const win = new FakeWindow({ x: 0, y: 0, width: 0, height: 0 });
    win.ignoreNextSets = 1;
    win.bounds = { x: 853, y: 0, width: 1280, height: 720 };
    const target = { x: 853, y: 0, width: 1920, height: 1040 };
    expect(mod.applyBoundsVerified(win, target)).toBe(true);
    expect(win.getBounds()).toEqual(target);
  });

  it('sets once when the first placement sticks', () => {
    const win = new FakeWindow({ x: 0, y: 0, width: 10, height: 10 });
    expect(mod.applyBoundsVerified(win, { x: 1, y: 2, width: 3, height: 4 })).toBe(false);
    expect(win.setBoundsCalls).toHaveLength(1);
  });
});

describe('minimum size', () => {
  it('the shell minimum fits a 1280x720 @150% screen', () => {
    expect(mod.MAIN_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(853);
    expect(mod.MAIN_WINDOW_MIN_SIZE.width).toBeLessThanOrEqual(800);
    expect(mod.MAIN_WINDOW_MIN_SIZE.height).toBeLessThanOrEqual(500);
  });

  it('is clamped to the work area of the display the window opens on', () => {
    expect(mod.minimumSizeAt({ width: 800, height: 500 }, { x: 10, y: 10, width: 700, height: 400 })).toEqual({
      minWidth: 800,
      minHeight: 448,
    });
    expect(mod.minimumSizeAt({ width: 800, height: 500 }, { x: 1000, y: 10, width: 1280, height: 860 })).toEqual({
      minWidth: 800,
      minHeight: 500,
    });
    // No restore bounds: the primary display.
    expect(mod.minimumSizeAt({ width: 940, height: 600 })).toEqual({ minWidth: 853, minHeight: 448 });
  });

  it('follows the window to another display', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    expect(win.getMinimumSize()).toEqual([800, 448]);
    win.bounds = { x: 1000, y: 10, width: 800, height: 400 };
    win.emit('move');
    expect(win.getMinimumSize()).toEqual([800, 500]);
  });
});

describe('guardWindowToWorkArea', () => {
  it('shrinks a default 1280x860 window that opens on the small primary', () => {
    const win = new FakeWindow({ x: 0, y: 0, width: 1280, height: 860 });
    guard(win);
    // The larger overlap is on the second monitor; either way it must fit one work area.
    const b = win.getBounds();
    const wa = h.matching(b).workArea;
    expect(b.width).toBeLessThanOrEqual(wa.width);
    expect(b.height).toBeLessThanOrEqual(wa.height);
  });

  it('corrects the 65,535 px growth after a resize, and stays put afterwards', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    win.setBoundsCalls = [];
    win.bounds = { x: 20, y: 10, width: 800, height: 65535 };
    win.emit('resize');
    expect(win.getBounds()).toEqual({ x: 20, y: 0, width: 800, height: 448 });
    // The correction's own resize event did not trigger another one.
    expect(win.setBoundsCalls).toHaveLength(1);
  });

  it('corrects growth that happens during a move too', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    win.bounds = { x: 1000, y: 10, width: 65535, height: 700 };
    win.emit('move');
    // Matched to the second monitor (largest overlap) and pulled fully inside it.
    expect(win.getBounds()).toEqual({ x: 853, y: 10, width: 1920, height: 700 });
  });

  it('refuses a user resize or move that proposes a size beyond the work area', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    const big = { preventDefault: vi.fn() };
    win.emit('will-resize', big, { x: 20, y: 10, width: 800, height: 65535 });
    expect(big.preventDefault).toHaveBeenCalled();
    const drift = { preventDefault: vi.fn() };
    win.emit('will-move', drift, { x: 40, y: 10, width: 65535, height: 400 });
    expect(drift.preventDefault).toHaveBeenCalled();
    const ok = { preventDefault: vi.fn() };
    win.emit('will-resize', ok, { x: 20, y: 10, width: 820, height: 440 });
    win.emit('will-move', ok, { x: 300, y: 10, width: 800, height: 400 });
    expect(ok.preventDefault).not.toHaveBeenCalled();
  });

  it('leaves the position of a window the user drags partly off-screen alone', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    win.setBoundsCalls = [];
    win.bounds = { x: -300, y: 100, width: 800, height: 400 };
    win.emit('move');
    expect(win.setBoundsCalls).toHaveLength(0);
  });

  it('does not fight a window the OS refuses to resize (no feedback loop)', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    guard(win);
    win.setBoundsCalls = [];
    win.ignoreNextSets = 100;
    win.bounds = { x: 20, y: 10, width: 800, height: 65535 };
    win.emit('resize');
    win.emit('resize');
    win.emit('move');
    // One verified correction (set + one retry), then it stops retrying that rectangle.
    expect(win.setBoundsCalls).toHaveLength(2);
  });

  it('leaves a maximized window to the OS', () => {
    const win = new FakeWindow({ x: 0, y: 0, width: 853, height: 448 });
    win.maximized = true;
    guard(win);
    win.bounds = { x: -8, y: -8, width: 869, height: 464 };
    win.setBoundsCalls = [];
    win.emit('resize');
    expect(win.setBoundsCalls).toHaveLength(0);
  });

  it('re-checks when a display changes scale, and unsubscribes on dispose', () => {
    const win = new FakeWindow({ x: 20, y: 10, width: 800, height: 400 });
    const dispose = guard(win);
    expect(h.screenListeners.get('display-metrics-changed')?.size).toBe(1);
    // The primary went from 150% to 175%: its DIP work area shrank under the window.
    h.displays[0].workArea = { x: 0, y: 0, width: 731, height: 384 };
    try {
      for (const cb of h.screenListeners.get('display-metrics-changed') ?? []) cb();
      expect(win.getBounds()).toEqual({ x: 0, y: 0, width: 731, height: 384 });
      expect(win.getMinimumSize()).toEqual([731, 384]);
    } finally {
      h.displays[0].workArea = { x: 0, y: 0, width: 853, height: 448 };
    }
    dispose();
    expect(h.screenListeners.get('display-metrics-changed')?.size).toBe(0);
  });
});
