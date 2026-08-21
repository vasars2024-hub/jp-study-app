import { describe, expect, it } from 'vitest';
import {
  READ_FRAME_MIN_HEIGHT,
  READ_FRAME_MIN_WIDTH,
  clampReadFrame,
  defaultReadFrame,
  moveReadFrame,
  parseReadFrame,
  resizeReadFrame,
} from '../readingLensReadFrame';

const HD = { width: 1920, height: 1080 };
const WIDE = { width: 2560, height: 1600 };

describe('defaultReadFrame', () => {
  it('centres a 760-wide sheet with a 24 px inset', () => {
    expect(defaultReadFrame(WIDE)).toEqual({ x: 900, y: 24, width: 760, height: 1552 });
  });

  it('narrows to the viewport rather than overflowing it', () => {
    const frame = defaultReadFrame({ width: 500, height: 400 });
    expect(frame.width).toBe(452);
    expect(frame.x).toBe(24);
    expect(frame.x + frame.width).toBeLessThanOrEqual(500);
  });
});

describe('clampReadFrame', () => {
  it('pulls a frame saved on a wider display back onto a narrower one', () => {
    // The second display on this machine starts at x=1920, so a sheet moved
    // onto it and saved is a frame no HD viewport can show as stored.
    const stored = { x: 2100, y: 40, width: 760, height: 900 };
    const frame = clampReadFrame(stored, HD);
    expect(frame.x).toBe(1920 - 760);
    expect(frame.x + frame.width).toBe(1920);
    expect(frame.y).toBe(40);
  });

  it('never lets a frame start off the top or left edge', () => {
    expect(clampReadFrame({ x: -500, y: -200, width: 600, height: 400 }, HD)).toEqual({
      x: 0,
      y: 0,
      width: 600,
      height: 400,
    });
  });

  it('enforces the minimum size', () => {
    const frame = clampReadFrame({ x: 10, y: 10, width: 40, height: 30 }, HD);
    expect(frame.width).toBe(READ_FRAME_MIN_WIDTH);
    expect(frame.height).toBe(READ_FRAME_MIN_HEIGHT);
  });

  it('loses to a viewport smaller than the minimum rather than hanging off it', () => {
    const tiny = { width: 200, height: 120 };
    const frame = clampReadFrame({ x: 0, y: 0, width: 800, height: 800 }, tiny);
    expect(frame).toEqual({ x: 0, y: 0, width: 200, height: 120 });
  });

  it('settles size before position, so a shrunk sheet is still fully on screen', () => {
    const frame = clampReadFrame({ x: 1800, y: 1000, width: 4000, height: 4000 }, HD);
    expect(frame.x + frame.width).toBeLessThanOrEqual(HD.width);
    expect(frame.y + frame.height).toBeLessThanOrEqual(HD.height);
  });
});

describe('parseReadFrame', () => {
  it('returns null for nothing stored, so a caller can fall back to the default', () => {
    expect(parseReadFrame(null, HD)).toBeNull();
    expect(parseReadFrame('', HD)).toBeNull();
  });

  it('returns null rather than throwing on junk', () => {
    expect(parseReadFrame('{not json', HD)).toBeNull();
    expect(parseReadFrame('42', HD)).toBeNull();
    expect(parseReadFrame('{"x":1}', HD)).toBeNull();
    expect(parseReadFrame('{"x":null,"y":0,"width":600,"height":400}', HD)).toBeNull();
  });

  it('restores an off-screen frame clamped rather than dropping it', () => {
    const raw = JSON.stringify({ x: 9000, y: 9000, width: 600, height: 400 });
    expect(parseReadFrame(raw, HD)).toEqual({ x: 1320, y: 680, width: 600, height: 400 });
  });

  it('round-trips a frame that is already on screen unchanged', () => {
    const frame = { x: 120, y: 60, width: 640, height: 480 };
    expect(parseReadFrame(JSON.stringify(frame), HD)).toEqual(frame);
  });
});

describe('moveReadFrame', () => {
  it('applies the pointer delta exactly while the sheet stays on screen', () => {
    const origin = { x: 400, y: 200, width: 600, height: 400 };
    expect(moveReadFrame(origin, 130, -70, HD)).toEqual({ x: 530, y: 130, width: 600, height: 400 });
  });

  it('stops at the edge instead of following the pointer off screen', () => {
    const origin = { x: 400, y: 200, width: 600, height: 400 };
    const moved = moveReadFrame(origin, 5000, 5000, HD);
    expect(moved.x).toBe(HD.width - 600);
    expect(moved.y).toBe(HD.height - 400);
  });
});

describe('resizeReadFrame', () => {
  const origin = { x: 400, y: 200, width: 800, height: 600 };

  it('grows from the south-east grip without moving the origin', () => {
    const next = resizeReadFrame(origin, 'se', 120, 90, HD);
    expect(next).toEqual({ x: 400, y: 200, width: 920, height: 690 });
  });

  it('moves the origin when the north-west grip is dragged', () => {
    const next = resizeReadFrame(origin, 'nw', 100, 50, HD);
    expect(next).toEqual({ x: 500, y: 250, width: 700, height: 550 });
  });

  it('holds the opposite edge still when a north/west drag hits the minimum', () => {
    const next = resizeReadFrame(origin, 'nw', 5000, 5000, HD);
    expect(next.width).toBe(READ_FRAME_MIN_WIDTH);
    expect(next.height).toBe(READ_FRAME_MIN_HEIGHT);
    // The right and bottom edges are exactly where they started — the sheet
    // shrank onto them rather than walking down the screen.
    expect(next.x + next.width).toBe(origin.x + origin.width);
    expect(next.y + next.height).toBe(origin.y + origin.height);
  });

  it('leaves the axis a single-edge grip does not own alone', () => {
    expect(resizeReadFrame(origin, 'e', 60, 999, HD)).toEqual({
      x: 400,
      y: 200,
      width: 860,
      height: 600,
    });
    expect(resizeReadFrame(origin, 'n', 999, -50, HD)).toEqual({
      x: 400,
      y: 150,
      width: 800,
      height: 650,
    });
  });
});
