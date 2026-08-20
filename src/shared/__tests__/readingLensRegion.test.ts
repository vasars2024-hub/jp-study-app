import { describe, expect, it } from 'vitest';
import {
  LENS_MIN_REGION,
  LENS_RESIZE_HANDLES,
  isLensResizeHandle,
  lensRegionChanged,
  resizeLensRegion,
  type LensRegionRect,
} from '../readingLensRegion';

const SCREEN = { width: 1920, height: 1080 };
const BASE: LensRegionRect = { x: 400, y: 300, width: 600, height: 200 };

describe('LENS_RESIZE_HANDLES', () => {
  it('names all four edges and all four corners exactly once', () => {
    expect([...LENS_RESIZE_HANDLES].sort()).toEqual(
      ['e', 'n', 'ne', 'nw', 's', 'se', 'sw', 'w'],
    );
  });

  it('guards the handle name so a stray string cannot reach the arithmetic', () => {
    expect(isLensResizeHandle('se')).toBe(true);
    expect(isLensResizeHandle('SE')).toBe(false);
    expect(isLensResizeHandle('news')).toBe(false);
    expect(isLensResizeHandle(null)).toBe(false);
  });
});

describe('resizeLensRegion — the edge a handle owns, and only that edge', () => {
  it('moves the south edge down without touching the other three', () => {
    expect(resizeLensRegion(BASE, 's', 0, 60, SCREEN)).toEqual({
      x: 400,
      y: 300,
      width: 600,
      height: 260,
    });
  });

  it('moves the north edge up, which grows the height and lowers y together', () => {
    expect(resizeLensRegion(BASE, 'n', 0, -50, SCREEN)).toEqual({
      x: 400,
      y: 250,
      width: 600,
      height: 250,
    });
  });

  it('moves the west edge right, which shrinks the width and raises x together', () => {
    expect(resizeLensRegion(BASE, 'w', 40, 0, SCREEN)).toEqual({
      x: 440,
      y: 300,
      width: 560,
      height: 200,
    });
  });

  it('moves the east edge only, ignoring dy entirely', () => {
    expect(resizeLensRegion(BASE, 'e', 100, -999, SCREEN)).toEqual({
      x: 400,
      y: 300,
      width: 700,
      height: 200,
    });
  });

  it('moves both edges of a corner in one drag', () => {
    expect(resizeLensRegion(BASE, 'se', 100, 60, SCREEN)).toEqual({
      x: 400,
      y: 300,
      width: 700,
      height: 260,
    });
    expect(resizeLensRegion(BASE, 'nw', -100, -60, SCREEN)).toEqual({
      x: 300,
      y: 240,
      width: 700,
      height: 260,
    });
  });

  it('leaves the rect untouched when nothing moved', () => {
    for (const handle of LENS_RESIZE_HANDLES) {
      expect(resizeLensRegion(BASE, handle, 0, 0, SCREEN)).toEqual(BASE);
    }
  });
});

describe('resizeLensRegion — clamps rather than flipping or escaping the display', () => {
  it('stops the south edge at MIN_REGION below the north edge instead of inverting', () => {
    const r = resizeLensRegion(BASE, 's', 0, -5000, SCREEN);
    expect(r).toEqual({ x: 400, y: 300, width: 600, height: LENS_MIN_REGION });
    expect(r.height).toBeGreaterThan(0);
  });

  it('stops the west edge at MIN_REGION left of the east edge instead of inverting', () => {
    const r = resizeLensRegion(BASE, 'w', 5000, 0, SCREEN);
    expect(r).toEqual({ x: 1000 - LENS_MIN_REGION, y: 300, width: LENS_MIN_REGION, height: 200 });
  });

  it('never lets the north or west edge leave the display', () => {
    expect(resizeLensRegion(BASE, 'nw', -5000, -5000, SCREEN)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });

  it('never lets the south or east edge leave the display', () => {
    expect(resizeLensRegion(BASE, 'se', 5000, 5000, SCREEN)).toEqual({
      x: 400,
      y: 300,
      width: 1520,
      height: 780,
    });
  });

  it('keeps MIN_REGION when a region already overflows the display', () => {
    // A stored region replayed onto a monitor that shrank: `lo > hi`, and the
    // minimum-size invariant is the one that wins.
    const overflowing: LensRegionRect = { x: 700, y: 40, width: 300, height: 60 };
    const r = resizeLensRegion(overflowing, 'e', -500, 0, { width: 640, height: 480 });
    expect(r.width).toBe(LENS_MIN_REGION);
    expect(r.x).toBe(700);
  });

  it('rounds to whole DIP so a persisted region compares equal to itself', () => {
    const r = resizeLensRegion({ x: 10.4, y: 10.6, width: 100.5, height: 100.5 }, 'se', 0.4, 0.4, SCREEN);
    expect(Number.isInteger(r.x)).toBe(true);
    expect(Number.isInteger(r.y)).toBe(true);
    expect(Number.isInteger(r.width)).toBe(true);
    expect(Number.isInteger(r.height)).toBe(true);
  });
});

describe('lensRegionChanged', () => {
  it('is false for an identical rect, so a grab-and-release never rescans', () => {
    expect(lensRegionChanged(BASE, { ...BASE })).toBe(false);
  });

  it('is false for a drag that only pushed against a clamp it already sat on', () => {
    const pinned: LensRegionRect = { x: 0, y: 0, width: 300, height: 200 };
    expect(lensRegionChanged(pinned, resizeLensRegion(pinned, 'nw', -40, -40, SCREEN))).toBe(false);
  });

  it('is true for a one-pixel move on any single field', () => {
    expect(lensRegionChanged(BASE, { ...BASE, x: BASE.x + 1 })).toBe(true);
    expect(lensRegionChanged(BASE, { ...BASE, y: BASE.y + 1 })).toBe(true);
    expect(lensRegionChanged(BASE, { ...BASE, width: BASE.width + 1 })).toBe(true);
    expect(lensRegionChanged(BASE, { ...BASE, height: BASE.height + 1 })).toBe(true);
  });
});
