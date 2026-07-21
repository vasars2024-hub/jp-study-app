import { describe, expect, it } from 'vitest';
import {
  dbPostprocess,
  mergeDetBoxes,
  isVerticalBox,
  orderDetBoxes,
  type DetBox,
} from '../dbPostprocess';

/** Paint a filled rectangle of probability `value` into a w*h map. */
function paint(
  map: Float32Array,
  width: number,
  rect: { x0: number; y0: number; x1: number; y1: number },
  value = 0.9,
): void {
  for (let y = rect.y0; y < rect.y1; y++) {
    for (let x = rect.x0; x < rect.x1; x++) {
      map[y * width + x] = value;
    }
  }
}

describe('dbPostprocess', () => {
  it('finds one box per connected region', () => {
    const w = 40;
    const h = 20;
    const map = new Float32Array(w * h);
    paint(map, w, { x0: 2, y0: 2, x1: 12, y1: 8 });
    paint(map, w, { x0: 25, y0: 2, x1: 35, y1: 8 });

    const boxes = dbPostprocess(map, w, h, { unclipRatio: 0 });
    expect(boxes).toHaveLength(2);
    // Emitted left-to-right is not guaranteed by scan order, so compare sorted.
    const sorted = boxes.slice().sort((a, b) => a.x0 - b.x0);
    expect(sorted[0].x0).toBeCloseTo(2);
    expect(sorted[0].x1).toBeCloseTo(12);
    expect(sorted[1].x0).toBeCloseTo(25);
    expect(sorted[1].score).toBeCloseTo(0.9, 5);
  });

  it('joins diagonally-touching strokes into a single region', () => {
    // 4-connectivity would split this into two boxes; 8-connectivity must not.
    const w = 10;
    const h = 10;
    const map = new Float32Array(w * h);
    paint(map, w, { x0: 1, y0: 1, x1: 5, y1: 5 });
    paint(map, w, { x0: 5, y0: 5, x1: 9, y1: 9 });

    const boxes = dbPostprocess(map, w, h, { unclipRatio: 0, minSize: 1 });
    expect(boxes).toHaveLength(1);
  });

  it('drops regions below the score and size thresholds', () => {
    const w = 30;
    const h = 20;
    const map = new Float32Array(w * h);
    // Confident but tiny.
    paint(map, w, { x0: 1, y0: 1, x1: 3, y1: 2 }, 0.95);
    // Large but barely above the pixel threshold — mean score fails boxThreshold.
    paint(map, w, { x0: 10, y0: 5, x1: 25, y1: 15 }, 0.35);

    const boxes = dbPostprocess(map, w, h, {
      threshold: 0.3,
      boxThreshold: 0.5,
      minSize: 3,
      unclipRatio: 0,
    });
    expect(boxes).toHaveLength(0);
  });

  it('grows boxes by the unclip ratio and clamps to the image', () => {
    const w = 20;
    const h = 20;
    const map = new Float32Array(w * h);
    paint(map, w, { x0: 0, y0: 0, x1: 6, y1: 6 });

    const boxes = dbPostprocess(map, w, h, { unclipRatio: 1.5, maxWidth: 20, maxHeight: 20 });
    expect(boxes).toHaveLength(1);
    // Region is 6x6: distance = 6*6*1.5 / (2*(6+6)) = 2.25
    expect(boxes[0].x1).toBeCloseTo(8.25);
    // Clamped at the image edge rather than going negative.
    expect(boxes[0].x0).toBe(0);
    expect(boxes[0].y0).toBe(0);
  });

  it('maps map coordinates back to source scale', () => {
    const w = 20;
    const h = 20;
    const map = new Float32Array(w * h);
    paint(map, w, { x0: 2, y0: 2, x1: 8, y1: 8 });

    const boxes = dbPostprocess(map, w, h, { unclipRatio: 0, scaleX: 4, scaleY: 2 });
    expect(boxes[0].x0).toBeCloseTo(8);
    expect(boxes[0].y0).toBeCloseTo(4);
    expect(boxes[0].x1).toBeCloseTo(32);
    expect(boxes[0].y1).toBeCloseTo(16);
  });

  it('returns nothing for an empty or undersized map', () => {
    expect(dbPostprocess(new Float32Array(0), 0, 0)).toEqual([]);
    expect(dbPostprocess(new Float32Array(4), 10, 10)).toEqual([]);
  });
});

describe('mergeDetBoxes', () => {
  it('merges overlapping and near-touching boxes', () => {
    const boxes: DetBox[] = [
      { x0: 0, y0: 0, x1: 10, y1: 10, score: 0.9 },
      { x0: 11, y0: 0, x1: 20, y1: 10, score: 0.7 },
      { x0: 100, y0: 0, x1: 110, y1: 10, score: 0.8 },
    ];
    const merged = mergeDetBoxes(boxes, 2);
    expect(merged).toHaveLength(2);
    const wide = merged.find((b) => b.x1 === 20);
    expect(wide).toBeDefined();
    expect(wide?.x0).toBe(0);
  });

  it('leaves well-separated boxes alone', () => {
    const boxes: DetBox[] = [
      { x0: 0, y0: 0, x1: 10, y1: 10, score: 0.9 },
      { x0: 50, y0: 50, x1: 60, y1: 60, score: 0.9 },
    ];
    expect(mergeDetBoxes(boxes, 2)).toHaveLength(2);
  });
});

describe('orderDetBoxes', () => {
  it('reads horizontal text left-to-right, top-to-bottom', () => {
    // Two lines, each with two boxes, supplied deliberately out of order.
    const boxes: DetBox[] = [
      { x0: 60, y0: 0, x1: 100, y1: 20, score: 1 }, // line 1 right
      { x0: 0, y0: 50, x1: 40, y1: 70, score: 1 }, // line 2 left
      { x0: 0, y0: 0, x1: 40, y1: 20, score: 1 }, // line 1 left
      { x0: 60, y0: 50, x1: 100, y1: 70, score: 1 }, // line 2 right
    ];
    const ordered = orderDetBoxes(boxes);
    expect(ordered.map((b) => `${b.x0},${b.y0}`)).toEqual(['0,0', '60,0', '0,50', '60,50']);
  });

  it('reads vertical text right-to-left', () => {
    const boxes: DetBox[] = [
      { x0: 0, y0: 0, x1: 20, y1: 100, score: 1 },
      { x0: 40, y0: 0, x1: 60, y1: 100, score: 1 },
      { x0: 80, y0: 0, x1: 100, y1: 100, score: 1 },
    ];
    const ordered = orderDetBoxes(boxes, { vertical: true });
    expect(ordered.map((b) => b.x0)).toEqual([80, 40, 0]);
  });
});

describe('isVerticalBox', () => {
  it('flags tall narrow boxes as vertical lines', () => {
    expect(isVerticalBox({ x0: 0, y0: 0, x1: 20, y1: 200, score: 1 })).toBe(true);
    expect(isVerticalBox({ x0: 0, y0: 0, x1: 200, y1: 20, score: 1 })).toBe(false);
    // Roughly square text is treated as horizontal — a single large glyph
    // should not flip a whole crop into tategaki ordering.
    expect(isVerticalBox({ x0: 0, y0: 0, x1: 50, y1: 55, score: 1 })).toBe(false);
  });
});
