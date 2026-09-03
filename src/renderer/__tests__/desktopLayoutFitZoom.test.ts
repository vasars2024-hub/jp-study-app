/**
 * A zoom round trip must hand back the geometry the user authored.
 *
 * Boss audit `audit-20260902-121014-bab1b330`, Finding 3, measured live through
 * the product's own `setZoom`: a desktop note authored 260x220 went to 240x140
 * at 200% zoom (its MIN_W x MIN_H floor, not the 130x110 the ratio gives) and
 * came back at zoom 1 as 480x302 — the floor, multiplied — and 480x302 was
 * written to `desktop-layout.json`. The re-fit was reading the previous fit's
 * committed output and a fit is not invertible: the floor and the viewport cap
 * both throw information away.
 *
 * `rememberFit` + `toAuthoredSpace` are the repair. Every number below is the
 * audit's own: a 1264x765 desk at zoom 1, 632x355 at zoom 2 (the desk element
 * is 1264x821 / 632x411 and the taskbar takes 56), proportional remap on, a
 * note at 260,60 260x220 and a city window at 30,11 680x739.
 */
import { describe, expect, it } from 'vitest';
import type { DesktopLayout, WindowSnapshot } from '../../shared/desktop';
import { clampLayoutToViewport, rememberFit, toAuthoredSpace } from '../desktopLayoutFit';

const FULL = { w: 1264, h: 765 };
const ZOOMED = { w: 632, h: 355 };

function win(over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id: 'note',
    section: 'note',
    x: 260,
    y: 60,
    w: 260,
    h: 220,
    z: 10,
    visible: true,
    maximized: false,
    ...over,
  };
}

const NOTE = win();
const CITY = win({ id: 'city', section: 'city', x: 30, y: 11, w: 680, h: 739 });

function layout(windows: WindowSnapshot[], over: Partial<DesktopLayout> = {}): DesktopLayout {
  return {
    desktopIndex: 0,
    authoredW: FULL.w,
    authoredH: FULL.h,
    windows,
    icons: [],
    notes: {},
    widgets: [],
    wallpaper: { kind: 'preset', id: 'crimsonveil' },
    layoutEpoch: 1,
    ...over,
  };
}

const rect = (w: WindowSnapshot) => ({ x: w.x, y: w.y, w: w.w, h: w.h });
const byId = (l: DesktopLayout, id: string) => {
  const found = l.windows.find((w) => w.id === id);
  if (!found) throw new Error(`no window ${id}`);
  return rect(found);
};

/** One zoom step exactly as `DesktopShell`'s `onZoomChanged` effect performs it. */
function zoomTo(
  live: WindowSnapshot[],
  memory: ReturnType<typeof rememberFit>,
  viewport: { w: number; h: number },
  mode: 'clamp' | 'proportional' = 'proportional',
) {
  const source = layout(toAuthoredSpace(live, memory), {
    authoredW: memory.authoredW,
    authoredH: memory.authoredH,
  });
  const fitted = clampLayoutToViewport(source, viewport, mode);
  return { fitted, memory: rememberFit(source, fitted, viewport, mode) };
}

/** The hydrate at zoom 1: an identity fit that seeds the memory. */
function hydrate(windows: WindowSnapshot[], mode: 'clamp' | 'proportional' = 'proportional') {
  const stored = layout(windows);
  const fitted = clampLayoutToViewport(stored, FULL, mode);
  return { fitted, memory: rememberFit(stored, fitted, FULL, mode) };
}

describe('the audit sequence: 260x220 -> zoom 2 -> zoom 1', () => {
  it('floors the note at 200% exactly as measured, then hands back 260x220 at 100%', () => {
    const h = hydrate([NOTE, CITY]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    // The forward leg is unchanged and matches the live measurement.
    expect(byId(z2.fitted, 'note')).toEqual({ x: 130, y: 28, w: 240, h: 140 });
    expect(byId(z2.fitted, 'city')).toEqual({ x: 15, y: 5, w: 340, h: 343 });
    // The reverse leg is what the audit found broken.
    const z1 = zoomTo(z2.fitted.windows, z2.memory, FULL);
    expect(byId(z1.fitted, 'note')).toEqual({ x: 260, y: 60, w: 260, h: 220 });
    expect(byId(z1.fitted, 'city')).toEqual({ x: 30, y: 11, w: 680, h: 739 });
  });

  it('MUTATION CONTROL: re-fitting the committed zoomed layout, as before, gives the 480x302 the audit measured', () => {
    const h = hydrate([NOTE, CITY]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    // What the commit effect writes while zoomed: the fitted rects, stamped with the zoomed desk.
    const committed = layout(z2.fitted.windows, { authoredW: ZOOMED.w, authoredH: ZOOMED.h });
    const oldReverse = clampLayoutToViewport(committed, FULL, 'proportional');
    expect(byId(oldReverse, 'note')).toEqual({ x: 260, y: 60, w: 480, h: 302 });
    // city never hit its floor, which is why the audit saw it round-trip exactly.
    expect(byId(oldReverse, 'city')).toEqual({ x: 30, y: 11, w: 680, h: 739 });
  });

  it('a second cycle is still lossless, not merely non-compounding', () => {
    const h = hydrate([NOTE]);
    let step = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    step = zoomTo(step.fitted.windows, step.memory, FULL);
    step = zoomTo(step.fitted.windows, step.memory, ZOOMED);
    expect(byId(step.fitted, 'note')).toEqual({ x: 130, y: 28, w: 240, h: 140 });
    step = zoomTo(step.fitted.windows, step.memory, FULL);
    expect(byId(step.fitted, 'note')).toEqual({ x: 260, y: 60, w: 260, h: 220 });
  });
});

describe('what the user did while zoomed survives the zoom coming off', () => {
  it('a window dragged at 200% keeps its move, scaled back, and its untouched authored size', () => {
    const h = hydrate([NOTE, CITY]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    const moved = z2.fitted.windows.map((w) => (w.id === 'city' ? { ...w, x: 100, y: 5 } : w));
    const z1 = zoomTo(moved, z2.memory, FULL);
    // 100 / (632/1264) = 200; 5 / (355/765) = 10.8 -> 11. (A 739-tall window in a 765 desk can
    // sit no lower than y = 26, so the dragged y must stay under that for this to test the
    // inverse scale rather than the bound.)
    expect(byId(z1.fitted, 'city')).toEqual({ x: 200, y: 11, w: 680, h: 739 });
    expect(byId(z1.fitted, 'note')).toEqual({ x: 260, y: 60, w: 260, h: 220 });
  });

  it('a floored note that was only dragged still comes back at its authored size', () => {
    const h = hydrate([NOTE]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    const moved = z2.fitted.windows.map((w) => ({ ...w, x: 10, y: 10 }));
    const z1 = zoomTo(moved, z2.memory, FULL);
    expect(byId(z1.fitted, 'note')).toEqual({ x: 20, y: 22, w: 260, h: 220 });
  });

  it('a window resized at 200% keeps its new size, scaled back, at its authored position', () => {
    const h = hydrate([NOTE]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    const resized = z2.fitted.windows.map((w) => ({ ...w, w: 300, h: 200 }));
    const z1 = zoomTo(resized, z2.memory, FULL);
    // 300 / 0.5 = 600; 200 / (355/765) = 431.0 -> 431.
    expect(byId(z1.fitted, 'note')).toEqual({ x: 260, y: 60, w: 600, h: 431 });
  });

  it('a window opened while zoomed is carried into the authored space by the inverse scale', () => {
    const h = hydrate([NOTE]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    const opened = win({ id: 'note-2', x: 260, y: 60, w: 260, h: 220 });
    const z1 = zoomTo([...z2.fitted.windows, opened], z2.memory, FULL);
    // 260 / 0.5 = 520; 220 / (355/765) = 474.1 -> 474; 60 / (355/765) = 129.3 -> 129.
    expect(byId(z1.fitted, 'note-2')).toEqual({ x: 520, y: 129, w: 520, h: 474 });
    expect(byId(z1.fitted, 'note')).toEqual({ x: 260, y: 60, w: 260, h: 220 });
  });
});

describe('clamp mode', () => {
  const SETTINGS = win({ id: 'settings', section: 'settings', x: 60, y: 24, w: 960, h: 680 });

  it('a window capped to the zoomed desk comes back at its authored size instead of staying capped', () => {
    const h = hydrate([SETTINGS], 'clamp');
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED, 'clamp');
    expect(byId(z2.fitted, 'settings')).toEqual({ x: 0, y: 0, w: 632, h: 355 });
    const z1 = zoomTo(z2.fitted.windows, z2.memory, FULL, 'clamp');
    expect(byId(z1.fitted, 'settings')).toEqual({ x: 60, y: 24, w: 960, h: 680 });
  });

  it('MUTATION CONTROL: without the memory the cap is permanent, because a clamp of a rect that fits is the identity', () => {
    const h = hydrate([SETTINGS], 'clamp');
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED, 'clamp');
    const committed = layout(z2.fitted.windows, { authoredW: ZOOMED.w, authoredH: ZOOMED.h });
    expect(byId(clampLayoutToViewport(committed, FULL, 'clamp'), 'settings')).toEqual({ x: 0, y: 0, w: 632, h: 355 });
  });

  it('a window moved at 200% keeps that position unscaled — clamp-mode coordinates are pixels', () => {
    const h = hydrate([SETTINGS], 'clamp');
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED, 'clamp');
    const moved = z2.fitted.windows.map((w) => ({ ...w, x: 10, y: 12 }));
    const z1 = zoomTo(moved, z2.memory, FULL, 'clamp');
    expect(byId(z1.fitted, 'settings')).toEqual({ x: 10, y: 12, w: 960, h: 680 });
  });
});

describe('the memory itself', () => {
  it('records the source origin and the forward scale of a proportional fit', () => {
    const h = hydrate([NOTE]);
    const z2 = zoomTo(h.fitted.windows, h.memory, ZOOMED);
    expect(z2.memory.authoredW).toBe(FULL.w);
    expect(z2.memory.authoredH).toBe(FULL.h);
    expect(z2.memory.sx).toBeCloseTo(0.5, 10);
    expect(z2.memory.sy).toBeCloseTo(355 / 765, 10);
    expect(z2.memory.viewport).toEqual(ZOOMED);
    expect(z2.memory.rects.get('note')).toEqual({
      base: { x: 260, y: 60, w: 260, h: 220 },
      fitted: { x: 130, y: 28, w: 240, h: 140 },
    });
  });

  it('records this viewport as the base space when the layout never had an origin', () => {
    const stored = layout([NOTE], { authoredW: undefined, authoredH: undefined });
    const fitted = clampLayoutToViewport(stored, ZOOMED, 'proportional');
    const memory = rememberFit(stored, fitted, ZOOMED, 'proportional');
    expect(memory.authoredW).toBe(ZOOMED.w);
    expect(memory.authoredH).toBe(ZOOMED.h);
    expect(memory.sx).toBe(1);
    expect(memory.sy).toBe(1);
  });

  it('toAuthoredSpace without a memory is the identity, element for element', () => {
    const live = [NOTE, CITY];
    expect(toAuthoredSpace(live, null)).toBe(live);
  });

  it('toAuthoredSpace preserves object identity for a window that needs no change', () => {
    const h = hydrate([NOTE]);
    const [only] = h.fitted.windows;
    expect(toAuthoredSpace([only], h.memory)[0]).toBe(only);
  });
});
