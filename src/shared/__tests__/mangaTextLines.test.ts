// Mokuro-style text-line grouping for manga OCR (shared/mangaTextLines.ts):
// synthetic detector fragments with a known answer — which fragments make a
// line, which lines make a bubble, and the order a reader reads them in. The
// headless E2E has no OCR model, so this is where the grouping is pinned.

import { describe, expect, it } from 'vitest';
import {
  buildTextLines,
  groupTextLines,
  lineCropBox,
  type TextBlock,
  type TextFragment,
} from '../mangaTextLines';
import type { MokuroBox } from '../mokuroTypes';

const frag = (box: MokuroBox, score = 0.9): TextFragment => ({ box, score });

/** A vertical column at `x` (width `w`), broken into fragments at the given y ranges. */
function column(x: number, w: number, ...ys: Array<[number, number]>): TextFragment[] {
  return ys.map(([y0, y1]) => frag([x, y0, x + w, y1]));
}

/** Square glyphs `size` px wide, `step` px apart, starting at (x, y), along x or y. */
function glyphs(x: number, y: number, size: number, step: number, count: number, along: 'x' | 'y'): TextFragment[] {
  return Array.from({ length: count }, (_, i) => {
    const dx = along === 'x' ? i * (size + step) : 0;
    const dy = along === 'y' ? i * (size + step) : 0;
    return frag([x + dx, y + dy, x + dx + size, y + dy + size]);
  });
}

const lineXs = (block: TextBlock): number[] => block.lines.map((l) => l.box[0]);

describe('lines from fragments', () => {
  it('chains the pieces of one column, broken at a gap, into one vertical line', () => {
    const lines = buildTextLines(column(200, 30, [100, 160], [172, 260]));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ box: [200, 100, 230, 260], vertical: true, fontSize: 30 });
  });

  it('reads square glyphs as a row when they sit closer side by side than row to row', () => {
    const rows = [...glyphs(100, 500, 20, 2, 6, 'x'), ...glyphs(100, 530, 20, 2, 5, 'x')];
    const lines = buildTextLines(rows);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => !l.vertical)).toBe(true);
    expect(lines.map((l) => l.box[1]).sort((a, b) => a - b)).toEqual([500, 530]);
  });

  it('reads square glyphs as columns when they sit closer one under another', () => {
    const cols = [...glyphs(300, 100, 20, 2, 5, 'y'), ...glyphs(268, 100, 20, 2, 4, 'y')];
    const lines = buildTextLines(cols);
    expect(lines).toHaveLength(2);
    expect(lines.every((l) => l.vertical)).toBe(true);
  });

  it('folds furigana into the column they annotate', () => {
    const lines = buildTextLines([...column(100, 30, [100, 300]), ...column(131, 12, [150, 190])]);
    expect(lines).toHaveLength(1);
    expect(lines[0].box).toEqual([100, 100, 143, 300]);
    expect(lines[0].fontSize).toBe(30);
  });

  it('does not chain columns of very different widths', () => {
    const lines = buildTextLines([frag([100, 100, 130, 200]), frag([95, 210, 175, 400])]);
    expect(lines).toHaveLength(2);
  });
});

describe('blocks from lines', () => {
  it('groups a bubble\'s columns into one vertical block, read right to left', () => {
    const fragments = [
      // Listed out of order on purpose: the order must come from the geometry.
      ...column(120, 30, [110, 190]),
      ...column(200, 30, [100, 170], [180, 280]),
      ...column(160, 30, [100, 250]),
    ];
    const blocks = groupTextLines(fragments);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].vertical).toBe(true);
    expect(blocks[0].box).toEqual([120, 100, 230, 280]);
    expect(lineXs(blocks[0])).toEqual([200, 160, 120]);
    expect(blocks[0].fontSize).toBe(30);
  });

  it('keeps two bubbles apart and reads the right-hand one first', () => {
    const left = [...column(100, 30, [100, 260]), ...column(140, 30, [100, 220])];
    const right = [...column(300, 30, [110, 280]), ...column(340, 30, [110, 240])];
    const blocks = groupTextLines([...left, ...right]);
    expect(blocks).toHaveLength(2);
    expect(lineXs(blocks[0])).toEqual([340, 300]);
    expect(lineXs(blocks[1])).toEqual([140, 100]);
  });

  it('reads a horizontal caption top to bottom', () => {
    const caption = [...glyphs(100, 530, 20, 2, 5, 'x'), ...glyphs(100, 500, 20, 2, 6, 'x')];
    const blocks = groupTextLines(caption);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].vertical).toBe(false);
    expect(blocks[0].lines.map((l) => l.box[1])).toEqual([500, 530]);
  });

  it('keeps big SFX lettering out of the bubble next to it', () => {
    const bubble = [...column(300, 30, [100, 260]), ...column(260, 30, [100, 220])];
    const sfx = column(180, 80, [80, 400]);
    const blocks = groupTextLines([...bubble, ...sfx]);
    expect(blocks).toHaveLength(2);
    const text = blocks.find((b) => b.fontSize === 30);
    expect(text && lineXs(text)).toEqual([300, 260]);
  });

  it('does not join a vertical bubble and a horizontal caption that touch', () => {
    const bubble = column(300, 30, [100, 260]);
    const caption = glyphs(200, 262, 20, 2, 6, 'x');
    const blocks = groupTextLines([...bubble, ...caption]);
    expect(blocks.map((b) => b.vertical).sort()).toEqual([false, true]);
  });

  it('orders blocks by page tier, then right to left', () => {
    const topLeft = column(100, 30, [50, 200]);
    const topRight = column(600, 30, [60, 180]);
    const bottom = column(400, 30, [700, 900]);
    const blocks = groupTextLines([...bottom, ...topLeft, ...topRight]);
    expect(blocks.map((b) => b.box[0])).toEqual([600, 100, 400]);
  });

  it('is empty for no fragments', () => {
    expect(groupTextLines([])).toEqual([]);
  });

  it('keeps the strongest fragment score on the block', () => {
    const blocks = groupTextLines([frag([200, 100, 230, 160], 0.3), frag([200, 170, 230, 260], 0.8)]);
    expect(blocks[0].score).toBe(0.8);
  });
});

describe('lineCropBox', () => {
  it('pads a line by a fraction of its glyph size and stays on the page', () => {
    expect(lineCropBox({ box: [100, 100, 130, 300], fontSize: 30 }, 1000, 1000)).toEqual([95.5, 95.5, 134.5, 304.5]);
    expect(lineCropBox({ box: [0, 2, 30, 998], fontSize: 30 }, 1000, 1000)).toEqual([0, 0, 34.5, 1000]);
  });
});
