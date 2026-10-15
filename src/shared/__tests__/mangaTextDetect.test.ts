// Decoding comic-text-detector's outputs (shared/mangaTextDetect.ts): the line
// map, the stroke mask and the block head, on small synthetic maps with a known
// answer. The real model's numbers are in tools/ocr-eval (see its header).

import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINE_MAP_OPTIONS,
  blocksFromYolo,
  linesFromShrinkMap,
  orphanGlyphs,
  tightenToMask,
} from '../mangaTextDetect';
import type { MokuroBox } from '../mokuroTypes';

/** A `w`×`h` map with `value` inside each rectangle (x0, y0, x1, y1 exclusive). */
function map(w: number, h: number, rects: Array<[number, number, number, number, number]>): Float32Array {
  const out = new Float32Array(w * h);
  for (const [x0, y0, x1, y1, value] of rects) {
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) out[y * w + x] = value;
  }
  return out;
}

describe('linesFromShrinkMap', () => {
  it('finds one line per core and grows it back by the DBNet unclip distance', () => {
    // Two vertical cores 4 px wide and 40 px tall, 10 px apart.
    const m = map(100, 100, [
      [60, 10, 64, 50, 0.9],
      [50, 10, 54, 50, 0.9],
    ]);
    const lines = linesFromShrinkMap(m, 100, 100);
    expect(lines).toHaveLength(2);
    // d = 4 * 40 * 1.6 / (2 * 44) = 2.909…
    const d = (4 * 40 * DEFAULT_LINE_MAP_OPTIONS.unclipRatio) / (2 * 44);
    const right = lines.find((l) => l.box[0] > 55);
    if (!right) throw new Error('no right-hand line');
    expect(right.box[0]).toBeCloseTo(60 - d, 5);
    expect(right.box[2]).toBeCloseTo(64 + d, 5);
    expect(right.box[1]).toBeCloseTo(10 - d, 5);
    expect(right.score).toBeCloseTo(0.9, 5);
  });

  it('drops a core whose mean probability is under the box threshold, and specks', () => {
    const m = map(60, 60, [
      [10, 10, 14, 40, 0.35],
      [30, 30, 31, 31, 0.95],
    ]);
    expect(linesFromShrinkMap(m, 60, 60)).toEqual([]);
    expect(linesFromShrinkMap(m, 60, 60, { ...DEFAULT_LINE_MAP_OPTIONS, boxThresh: 0.3 })).toHaveLength(1);
  });

  it('does not read past the letterboxed content', () => {
    const m = map(80, 80, [[60, 10, 64, 40, 0.9]]);
    expect(linesFromShrinkMap(m, 80, 80, DEFAULT_LINE_MAP_OPTIONS, 50, 80)).toEqual([]);
  });
});

describe('tightenToMask', () => {
  it('shrinks a box to the stroke pixels inside it, never grows it', () => {
    const m = map(50, 50, [[20, 12, 26, 30, 0.8]]);
    expect(tightenToMask([15, 5, 35, 40], m, 50, 50)).toEqual([20, 12, 26, 30]);
    // Only the part inside the box counts.
    expect(tightenToMask([22, 5, 35, 20], m, 50, 50)).toEqual([22, 12, 26, 20]);
  });

  it('keeps the box when the mask is empty there', () => {
    const m = map(50, 50, []);
    expect(tightenToMask([1, 2, 30, 40], m, 50, 50)).toEqual([1, 2, 30, 40]);
  });
});

describe('blocksFromYolo', () => {
  /** One YOLO row: cx, cy, w, h, objectness, class0, class1. */
  const row = (cx: number, cy: number, w: number, h: number, obj: number, c0 = 1, c1 = 0): number[] => [cx, cy, w, h, obj, c0, c1];

  it('scores objectness by class, keeps the confident ones and suppresses duplicates', () => {
    const rows = [
      ...row(100, 100, 40, 80, 0.9),
      ...row(102, 98, 42, 82, 0.8), // same bubble, lower score
      ...row(300, 100, 40, 80, 0.7, 0.2, 0.9),
      ...row(500, 500, 40, 80, 0.3), // under the confidence
      ...row(600, 600, 40, 80, 0.9, 0.2, 0.3), // objectness high, class low
    ];
    const blocks = blocksFromYolo(Float32Array.from(rows), 5, 7, 0.4, 0.35);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].box).toEqual([80, 60, 120, 140]);
    expect(blocks[0].score).toBeCloseTo(0.9, 5);
    expect(blocks[1].score).toBeCloseTo(0.63, 5);
  });
});

describe('orphanGlyphs', () => {
  // A column 20 px wide from y=20 to y=200 (the line), and a lone glyph left of
  // it at the top: the 「て」 of 「待って」 set on a column of its own.
  const line: MokuroBox = [100, 20, 120, 200];

  it('finds a lone glyph beside a line, the size of the line\'s glyphs', () => {
    const m = map(300, 300, [
      [101, 22, 119, 198, 0.9], // the line's own strokes (ignored: inside it)
      [74, 24, 90, 40, 0.8], // the lone glyph, 16 px, 10 px left of the line
    ]);
    const found = orphanGlyphs(m, 300, 300, [line]);
    expect(found).toHaveLength(1);
    expect(found[0].box).toEqual([74, 24, 90, 40]);
  });

  it('joins the strokes of one glyph', () => {
    const m = map(300, 300, [
      [74, 24, 88, 29, 0.8],
      [76, 31, 90, 40, 0.8],
    ]);
    expect(orphanGlyphs(m, 300, 300, [line]).map((g) => g.box)).toEqual([[74, 24, 90, 40]]);
  });

  it('skips furigana, specks, thin strokes, far-off marks and weak mask', () => {
    const m = map(300, 300, [
      [121, 40, 129, 48, 0.8], // furigana: half size, touching the column
      [80, 100, 83, 103, 0.9], // speck
      [80, 140, 82, 160, 0.9], // a thin stroke (a box edge)
      [10, 10, 26, 26, 0.9], // a glyph-sized mark far from any line
      [74, 170, 90, 186, 0.35], // glyph-sized but faint
    ]);
    expect(orphanGlyphs(m, 300, 300, [line])).toEqual([]);
  });

  it('is empty without lines to look around', () => {
    expect(orphanGlyphs(map(20, 20, [[0, 0, 20, 20, 1]]), 20, 20, [])).toEqual([]);
  });
});
