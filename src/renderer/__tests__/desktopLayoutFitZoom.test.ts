/**
 * The zoom re-fit's commit-side inverse (boss audit 2026-09-02, Finding 3).
 *
 * `DesktopShell`'s `onZoomChanged` re-fits the stored layout into the zoomed
 * viewport and applies the clamp to the live windows. Its header claimed
 * "nothing is committed"; live it was, and a window that hit the fit's
 * `MIN_W`/`MIN_H` floor came back the wrong size: a desktop note authored
 * 260x220 became 240x140 at 200% zoom, then 480x302 on the way back, and
 * 480x302 reached disk. These tests pin the repair with the audit's own
 * numbers, and keep a negative control that reproduces the loss through the
 * old path so the fixture is proven to see the defect it guards against.
 */
import { describe, expect, it } from 'vitest';
import type { DesktopLayout, WindowSnapshot } from '../../shared/desktop';
import { clampLayoutToViewport, unfitZoomedWindows } from '../desktopLayoutFit';
import type { ZoomFit } from '../desktopLayoutFit';

const MAIN = { w: 1264, h: 821 };
const ZOOMED = { w: 632, h: 411 };

function note(over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id: 'note-1',
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

function city(over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id: 'city-1',
    section: 'city',
    x: 60,
    y: 22,
    w: 680,
    h: 739,
    z: 11,
    visible: true,
    maximized: false,
    ...over,
  };
}

function layout(windows: WindowSnapshot[], authored = MAIN): DesktopLayout {
  return {
    desktopIndex: 0,
    authoredW: authored.w,
    authoredH: authored.h,
    windows,
    icons: [],
    notes: {},
    widgets: [],
    wallpaper: { kind: 'preset', id: 'crimsonveil' },
  };
}

const rect = (w: { x: number; y: number; w: number; h: number }) => ({ x: w.x, y: w.y, w: w.w, h: w.h });

/** What `onZoomChanged` records: the fit, against the stored rect it came from. */
function recordFits(stored: DesktopLayout, fitted: DesktopLayout): Map<string, ZoomFit> {
  const fits = new Map<string, ZoomFit>();
  const byId = new Map(fitted.windows.map((w) => [w.id, w]));
  for (const snap of stored.windows) {
    const fit = byId.get(snap.id);
    if (!fit) continue;
    const a = rect(snap);
    const f = rect(fit);
    if (f.x === a.x && f.y === a.y && f.w === a.w && f.h === a.h) continue;
    fits.set(snap.id, { fit: f, authored: a });
  }
  return fits;
}

describe('the proportional zoom fit floors a small window (the premise)', () => {
  it('a 260x220 note lands on the 240x140 floor at 200% zoom, and city does not', () => {
    const fitted = clampLayoutToViewport(layout([note(), city()]), ZOOMED, 'proportional');
    const n = fitted.windows.find((w) => w.id === 'note-1')!;
    const c = fitted.windows.find((w) => w.id === 'city-1')!;
    expect([n.w, n.h]).toEqual([240, 140]);
    // 680x739 halves cleanly to 340x370 -> city never touches the floor, so it was
    // the one window the audit measured round-tripping exactly. Its fit here is
    // what `clamp` then pulls fully on-screen; the point is only that it is not floored.
    expect(c.w).toBe(340);
    expect(c.h).toBeGreaterThan(140);
  });
});

describe('unfitZoomedWindows commits the authored rect, not the clamp', () => {
  it('a window still at its fit is written back at the rect it was authored at', () => {
    const stored = layout([note(), city()]);
    const fitted = clampLayoutToViewport(stored, ZOOMED, 'proportional');
    const fits = recordFits(stored, fitted);
    expect(fits.has('note-1')).toBe(true);

    // The live windows are exactly what the fit produced (the user touched nothing).
    const live = fitted.windows.map((w) => ({ ...w }));
    const out = unfitZoomedWindows(live, fits);
    const n = out.wins.find((w) => w.id === 'note-1')!;
    expect(rect(n)).toEqual({ x: 260, y: 60, w: 260, h: 220 });
    expect(out.stale).toEqual([]);
  });

  it('the round trip is exact: stored stays authored, so zoom-out re-fits to 260x220', () => {
    const stored = layout([note()]);
    const fitted = clampLayoutToViewport(stored, ZOOMED, 'proportional');
    const fits = recordFits(stored, fitted);
    // What the commit writes while zoomed. Origin unchanged because geometry did not move.
    const committed = layout(unfitZoomedWindows(fitted.windows, fits).wins, MAIN);
    // Zoom back out: the re-fit reads the committed layout into the main viewport.
    const back = clampLayoutToViewport(committed, MAIN, 'proportional');
    expect(rect(back.windows[0])).toEqual({ x: 260, y: 60, w: 260, h: 220 });
  });

  it('NEGATIVE CONTROL: committing the clamp reproduces the audit loss (480 wide, not 260)', () => {
    // The old path: the floored 240x140 reached disk stamped with the zoomed origin.
    const stored = layout([note()]);
    const fitted = clampLayoutToViewport(stored, ZOOMED, 'proportional');
    const committedClamp = layout(fitted.windows, ZOOMED);
    const back = clampLayoutToViewport(committedClamp, MAIN, 'proportional');
    expect(back.windows[0].w).toBe(480);
    expect(back.windows[0].w).not.toBe(260);
  });

  it('a window the user moved since the fit is committed as it is, and its record goes stale', () => {
    const stored = layout([note(), city()]);
    const fitted = clampLayoutToViewport(stored, ZOOMED, 'proportional');
    const fits = recordFits(stored, fitted);
    const live = fitted.windows.map((w) => (w.id === 'note-1' ? { ...w, x: w.x + 40, y: w.y + 12 } : { ...w }));
    const out = unfitZoomedWindows(live, fits);
    const n = out.wins.find((w) => w.id === 'note-1')!;
    // The user's own coordinates survive untouched.
    expect(rect(n)).toEqual({ x: live[0].x, y: live[0].y, w: 240, h: 140 });
    expect(out.stale).toEqual(['note-1']);
    // And the other window, untouched by the user, is still restored.
    const c = out.wins.find((w) => w.id === 'city-1')!;
    expect(rect(c)).toEqual(rect(city()));
  });

  it('is identity-preserving when there is nothing to substitute', () => {
    const live = [note(), city()];
    expect(unfitZoomedWindows(live, new Map()).wins).toBe(live);
    const fits = new Map<string, ZoomFit>([
      ['note-1', { fit: rect(note()), authored: rect(note()) }],
    ]);
    expect(unfitZoomedWindows(live, fits).wins).toBe(live);
  });
});
