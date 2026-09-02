/**
 * `clampLayoutToViewport` and what `authoredW/H` is allowed to claim.
 *
 * The multi-monitor slice gave this function its first live caller from a
 * second window, and a real desk immediately re-authored itself: a layout built
 * in a 1264x821 main window was opened once in an 880x507 secondary window and
 * came back claiming it had been authored at 880x507. In `clamp` mode nothing
 * is rescaled (`sx = sy = 1`), so those coordinates were still 1264-space
 * coordinates wearing an 880 label. Reopening that desk proportionally at
 * 1264x821 would then scale everything up by ~1.44x against an origin that had
 * never existed.
 *
 * The rule these tests pin: `authoredW/H` describes the space the RETURNED
 * coordinates are in. A proportional pass moves them into this viewport, so it
 * may stamp. A clamp pass does not, so it must preserve a known origin. An
 * unknown origin may always be stamped — there is nothing to protect.
 */
import { describe, expect, it } from 'vitest';
import type { DesktopLayout, WindowSnapshot } from '../../shared/desktop';
import { parsePresentation } from '../../shared/liquidWindowState';
import { clampLayoutToViewport } from '../desktopLayoutFit';

function win(over: Partial<WindowSnapshot> = {}): WindowSnapshot {
  return {
    id: 'w1',
    section: 'novels',
    x: 100,
    y: 60,
    w: 500,
    h: 300,
    z: 10,
    visible: true,
    maximized: false,
    ...over,
  };
}

function layout(over: Partial<DesktopLayout> = {}): DesktopLayout {
  return {
    desktopIndex: 0,
    windows: [win()],
    icons: [{ id: 'i1', kind: 'app', name: 'Novels', x: 20, y: 20 }],
    notes: {},
    widgets: [{ id: 'g1', type: 'clock', x: 74, y: 53, w: 275, h: 131, z: 5 }],
    wallpaper: { kind: 'preset', id: 'crimsonveil' },
    layoutEpoch: 1,
    ...over,
  };
}

const BIG = { w: 1264, h: 821 };
const SMALL = { w: 880, h: 507 };

describe('clamp mode preserves the authored origin', () => {
  it('does not re-stamp authoredW/H when it changed nothing', () => {
    const src = layout({ authoredW: BIG.w, authoredH: BIG.h });
    const out = clampLayoutToViewport(src, SMALL, 'clamp');

    expect(out.authoredW).toBe(1264);
    expect(out.authoredH).toBe(821);
  });

  it('leaves a window that already fits byte-for-byte unchanged', () => {
    const src = layout({ authoredW: BIG.w, authoredH: BIG.h });
    const out = clampLayoutToViewport(src, SMALL, 'clamp');

    // 500x300 at (100,60) fits inside 880x507, so clamp is a no-op on it.
    expect(out.windows[0]).toEqual(src.windows[0]);
  });

  it('survives the reopen that used to inflate the desk by 1.44x', () => {
    const authored = layout({ authoredW: BIG.w, authoredH: BIG.h });

    // Open once on the small secondary display, then back on the big one.
    const onSmall = clampLayoutToViewport(authored, SMALL, 'clamp');
    const back = clampLayoutToViewport(onSmall, BIG, 'proportional');

    // The origin was preserved, so the trip home is a 1.0x no-op, not a blow-up.
    expect(back.windows[0].w).toBe(500);
    expect(back.windows[0].h).toBe(300);
    expect(back.windows[0].x).toBe(100);
    expect(back.windows[0].y).toBe(60);
    expect(back.widgets[0]).toEqual(authored.widgets[0]);
  });
});

describe('proportional mode does re-stamp', () => {
  it('records the viewport it actually rescaled into', () => {
    const src = layout({ authoredW: BIG.w, authoredH: BIG.h });
    const out = clampLayoutToViewport(src, SMALL, 'proportional');

    expect(out.authoredW).toBe(880);
    expect(out.authoredH).toBe(507);
    // 500 * (880/1264) = 348.1..., 300 * (507/821) = 185.2...
    expect(out.windows[0].w).toBe(348);
    expect(out.windows[0].h).toBe(185);
  });
});

describe('an unknown origin is always stamped', () => {
  it('records this viewport when the layout never had one', () => {
    const out = clampLayoutToViewport(layout(), SMALL, 'clamp');

    expect(out.authoredW).toBe(880);
    expect(out.authoredH).toBe(507);
  });

  it('still clamps an oversized window despite having no ratio to scale by', () => {
    const src = layout({ windows: [win({ x: 900, y: 700, w: 1264, h: 773 })] });
    const out = clampLayoutToViewport(src, SMALL, 'clamp');

    expect(out.windows[0].w).toBe(880);
    expect(out.windows[0].h).toBe(507);
    expect(out.windows[0].x).toBe(0);
    expect(out.windows[0].y).toBe(0);
  });
});

describe('the fit invariant still holds', () => {
  it('never returns a window larger than the viewport, in either mode', () => {
    for (const mode of ['clamp', 'proportional'] as const) {
      const src = layout({
        authoredW: 3440,
        authoredH: 1440,
        windows: [win({ x: 3000, y: 1300, w: 2000, h: 1200 })],
      });
      const out = clampLayoutToViewport(src, SMALL, mode);
      const w = out.windows[0];

      expect(w.w).toBeLessThanOrEqual(SMALL.w);
      expect(w.h).toBeLessThanOrEqual(SMALL.h);
      expect(w.x).toBeGreaterThanOrEqual(0);
      expect(w.y).toBeGreaterThanOrEqual(0);
      expect(w.x + w.w).toBeLessThanOrEqual(SMALL.w);
      expect(w.y + w.h).toBeLessThanOrEqual(SMALL.h);
    }
  });

  it('returns the layout untouched for a zero viewport', () => {
    const src = layout({ authoredW: BIG.w, authoredH: BIG.h });
    expect(clampLayoutToViewport(src, { w: 0, h: 0 })).toBe(src);
  });
});

/**
 * L11 bullet 4, clause 3 — multi-monitor.
 *
 * The fit moved the live rect and nothing else, so a window arriving from a
 * bigger display was on-screen right up until the user pressed one of the two
 * controls that restore it. Measured on this profile's real desktop 4 (authored
 * 880x393, opened in a 642x385 desk window, 2026-09-01): the maximized `scraper`
 * clamped correctly to 642x385, then its own Maximize button restored the
 * untouched `restoreRect` 820x580 at (94,54) — 272px past the right edge, 249px
 * past the bottom, `overflow: hidden`, no scrollbar, resize grip unreachable.
 *
 * `presentation.standardRect` is the same field one level down: it is where
 * Return to standard lands, and §2.1 makes that reversal non-negotiable.
 */
const DESK_4 = { w: 642, h: 385 };

describe('restore targets are fitted too, not just the live rect', () => {
  it('pulls restoreRect in — the exact desktop-4 case, with its real numbers', () => {
    const src = layout({
      authoredW: 880,
      authoredH: 393,
      windows: [
        win({ x: 0, y: 0, w: 880, h: 393, maximized: true, restoreRect: { x: 94, y: 54, w: 820, h: 580 } }),
      ],
    });
    const out = clampLayoutToViewport(src, DESK_4, 'clamp');
    const r = out.windows[0].restoreRect!;

    expect({ ...r }).toEqual({ x: 0, y: 0, w: 642, h: 385 });
    expect(r.x + r.w).toBeLessThanOrEqual(DESK_4.w);
    expect(r.y + r.h).toBeLessThanOrEqual(DESK_4.h);
  });

  it('pulls presentation.standardRect in, and it stays a valid way home', () => {
    const src = layout({
      windows: [
        win({
          x: 40,
          y: 40,
          w: 820,
          h: 580,
          presentation: { v: 1, mode: 'liquid', standardRect: { x: 60, y: 24, w: 820, h: 580 }, standardMaximized: false },
        }),
      ],
    });
    const out = clampLayoutToViewport(src, DESK_4, 'clamp');
    const p = out.windows[0].presentation!;

    expect(p.standardRect).toEqual({ x: 0, y: 0, w: 642, h: 385 });
    // Still liquid, still reversible — a clamped way home beats no way home.
    expect(p.mode).toBe('liquid');
    expect(p.standardMaximized).toBe(false);
    expect(parsePresentation(p)).toEqual(p);
  });

  it('scales both restore targets in proportional mode, like everything else', () => {
    const src = layout({
      authoredW: BIG.w,
      authoredH: BIG.h,
      windows: [
        win({
          restoreRect: { x: 200, y: 120, w: 600, h: 400 },
          presentation: { v: 1, mode: 'liquid', standardRect: { x: 200, y: 120, w: 600, h: 400 } },
        }),
      ],
    });
    const out = clampLayoutToViewport(src, SMALL, 'proportional');

    // 600 * (880/1264) = 417.7..., 400 * (507/821) = 246.9...
    expect(out.windows[0].restoreRect).toEqual({ x: 139, y: 74, w: 418, h: 247 });
    expect(out.windows[0].presentation!.standardRect).toEqual({ x: 139, y: 74, w: 418, h: 247 });
  });

  it('is byte-for-byte identity when both restore targets already fit', () => {
    // The control against over-reach: this must be a no-op on every layout that
    // was never cross-monitor, or the fit starts re-authoring desks that are fine.
    const src = layout({
      authoredW: BIG.w,
      authoredH: BIG.h,
      windows: [
        win({
          restoreRect: { x: 100, y: 60, w: 500, h: 300 },
          presentation: { v: 1, mode: 'liquid', standardRect: { x: 100, y: 60, w: 500, h: 300 } },
        }),
      ],
    });
    const out = clampLayoutToViewport(src, SMALL, 'clamp');

    expect(out.windows[0]).toBe(src.windows[0]);
    expect(out.windows[0].presentation).toBe(src.windows[0].presentation);
  });

  it('adds neither key to a window that never had one', () => {
    // Decision (1) of `shared/liquidWindowState.ts`: conventional IS the absence
    // of the field. A fit that grows `presentation: undefined` onto every window
    // makes every pre-L3 blob differ from itself on disk.
    const src = layout({ windows: [win({ x: 900, y: 700, w: 1264, h: 773 })] });
    const keys = Object.keys(clampLayoutToViewport(src, DESK_4, 'clamp').windows[0]);

    expect(keys).not.toContain('presentation');
    expect(keys).not.toContain('restoreRect');
  });
});
