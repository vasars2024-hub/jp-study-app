/**
 * Text lines and speech-bubble blocks from the comic text detector's fragments.
 *
 * The detector's mask comes out of `connectedComponents` as fragments: a whole
 * column, part of one broken at a gap or a punctuation mark, or a lone glyph.
 * The old post-processing unioned anything within 14 px into one box, so a
 * bubble's columns, a neighbouring bubble and a stray caption could become one
 * region, read by manga-ocr as one crop in no particular line order. Mokuro
 * reads a page the other way round: lines first, then the block a line belongs
 * to, and each line on its own. This module does that, from boxes alone:
 *
 *  1. **Orientation.** An elongated fragment says which way it runs. A square
 *     one (a single glyph) takes the direction of its nearest aligned
 *     neighbour, because along a line the glyphs sit closer together than the
 *     lines do; alone, it is vertical, the default for Japanese manga.
 *  2. **Lines.** Fragments of one orientation that share a column (or a row),
 *     have a similar width (or height), and leave a gap under about a glyph
 *     between them chain into one line. A thin line hugging a much wider one
 *     (furigana beside its column) is folded into it: manga-ocr reads a column
 *     with its furigana and ignores them.
 *  3. **Blocks.** Parallel lines of a similar font size whose gap across is
 *     at most about one glyph, and whose extents along the line overlap, are one
 *     block (a bubble or a caption). A bubble's border keeps the next bubble
 *     further away than that; a different font size keeps SFX and narration out.
 *  4. **Order.** Lines in a vertical block read right to left, in a horizontal
 *     block top to bottom; blocks follow the page's reading order
 *     (`sortReadingOrder`: tiers top to bottom, right to left within a tier).
 *
 * Written from the Mokuro JSON format and the published idea (detect lines,
 * group them into blocks, OCR line by line); no Mokuro or comic-text-detector
 * source is used (see the licence note in `mokuroTypes.ts`).
 */

import type { MokuroBox } from './mokuroTypes';
import { sortReadingOrder } from './readingOrder';

/** One detector fragment in page pixels, with the detector's score. */
export interface TextFragment {
  box: MokuroBox;
  score: number;
}

/** One text line: a column in vertical text, a row in horizontal text. */
export interface TextLine {
  box: MokuroBox;
  vertical: boolean;
  /** Glyph size across the line: the column's width, or the row's height. */
  fontSize: number;
  score: number;
}

/** A speech bubble (or caption): its lines in reading order. */
export interface TextBlock {
  box: MokuroBox;
  vertical: boolean;
  /** Median glyph size of the block's lines. */
  fontSize: number;
  score: number;
  lines: TextLine[];
}

/** An elongation ratio past which a fragment's shape alone gives its direction. */
const ELONGATED = 1.3;
/** Glyph sizes within this ratio are "the same font" (line chaining and blocks). */
const SAME_FONT = 1.8;
/** Along a line, glyphs are at most this many glyph sizes apart. */
const ALONG_GAP = 0.9;
/** Across a block, lines are at most this many glyph sizes apart. */
const ACROSS_GAP = 1.1;
/** Furigana: a parallel line at most this fraction of its neighbour's glyph size. */
const RUBY_RATIO = 0.62;

const width = (b: MokuroBox): number => Math.max(0, b[2] - b[0]);
const height = (b: MokuroBox): number => Math.max(0, b[3] - b[1]);

function union(a: MokuroBox, b: MokuroBox): MokuroBox {
  return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
}

/** Overlap of two 1-D ranges (negative when apart: minus the gap). */
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

/** Overlap along x (columns share it) and y (rows share it). */
const xOverlap = (a: MokuroBox, b: MokuroBox): number => overlap(a[0], a[2], b[0], b[2]);
const yOverlap = (a: MokuroBox, b: MokuroBox): number => overlap(a[1], a[3], b[1], b[3]);

function sameFont(a: number, b: number, ratio = SAME_FONT): boolean {
  const lo = Math.max(1, Math.min(a, b));
  return Math.max(a, b) / lo <= ratio;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Union-find over indices. */
function makeSets(n: number): { find: (i: number) => number; join: (a: number, b: number) => void } {
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  return {
    find,
    join: (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
    },
  };
}

function groupsOf(n: number, find: (i: number) => number): number[][] {
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const list = groups.get(root);
    if (list) list.push(i);
    else groups.set(root, [i]);
  }
  return [...groups.values()];
}

/**
 * Whether `a` and `b` can be neighbours along one vertical line: they share a
 * column (x overlap of at least half the narrower), have a similar width, and
 * the gap between them is under about a glyph.
 */
function chainsVertically(a: MokuroBox, b: MokuroBox): number | null {
  const wa = width(a);
  const wb = width(b);
  if (xOverlap(a, b) < 0.5 * Math.min(wa, wb)) return null;
  if (!sameFont(wa, wb)) return null;
  const gap = -yOverlap(a, b);
  return gap <= ALONG_GAP * Math.max(wa, wb) ? Math.max(0, gap) : null;
}

/** `chainsVertically`, turned on its side. */
function chainsHorizontally(a: MokuroBox, b: MokuroBox): number | null {
  const ha = height(a);
  const hb = height(b);
  if (yOverlap(a, b) < 0.5 * Math.min(ha, hb)) return null;
  if (!sameFont(ha, hb)) return null;
  const gap = -xOverlap(a, b);
  return gap <= ALONG_GAP * Math.max(ha, hb) ? Math.max(0, gap) : null;
}

/** Each fragment's direction: its shape when elongated, its closest aligned neighbour when not. */
function orientations(boxes: MokuroBox[]): boolean[] {
  return boxes.map((box, i) => {
    const w = width(box);
    const h = height(box);
    if (h >= w * ELONGATED) return true;
    if (w >= h * ELONGATED) return false;
    let bestV = Infinity;
    let bestH = Infinity;
    boxes.forEach((other, j) => {
      if (j === i) return;
      const ow = width(other);
      const oh = height(other);
      // An elongated neighbour only counts in its own direction.
      const v = ow >= oh * ELONGATED ? null : chainsVertically(box, other);
      const hz = oh >= ow * ELONGATED ? null : chainsHorizontally(box, other);
      if (v !== null) bestV = Math.min(bestV, v);
      if (hz !== null) bestH = Math.min(bestH, hz);
    });
    if (bestH < bestV) return false;
    return true;
  });
}

/** Chain fragments into lines (step 1 and 2 of the file header). */
export function buildTextLines(fragments: readonly TextFragment[]): TextLine[] {
  const boxes = fragments.map((f) => f.box);
  const vertical = orientations(boxes);
  const sets = makeSets(boxes.length);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (vertical[i] !== vertical[j]) continue;
      const gap = vertical[i] ? chainsVertically(boxes[i], boxes[j]) : chainsHorizontally(boxes[i], boxes[j]);
      if (gap !== null) sets.join(i, j);
    }
  }
  const lines: TextLine[] = groupsOf(boxes.length, sets.find).map((members) => {
    const box = members.map((i) => boxes[i]).reduce(union);
    const isVertical = vertical[members[0]];
    // A lone square glyph is a line of one: its size is its own.
    const fontSize = isVertical ? width(box) : height(box);
    return { box, vertical: isVertical, fontSize, score: Math.max(...members.map((i) => fragments[i].score)) };
  });
  return foldRuby(lines);
}

/**
 * Fold furigana into the line they annotate: a parallel line at most
 * `RUBY_RATIO` of a neighbour's glyph size, touching it across and lying within
 * its extent along. Repeats until nothing folds, since a column can carry
 * several furigana runs.
 */
function foldRuby(lines: TextLine[]): TextLine[] {
  const out = lines.slice();
  let folded = true;
  while (folded) {
    folded = false;
    for (let i = 0; i < out.length && !folded; i++) {
      for (let j = 0; j < out.length && !folded; j++) {
        if (i === j) continue;
        const ruby = out[i];
        const base = out[j];
        if (ruby.vertical !== base.vertical || ruby.fontSize > base.fontSize * RUBY_RATIO) continue;
        // Furigana hug their column; a normal column a gap away from a big SFX does not.
        const across = ruby.vertical ? -xOverlap(ruby.box, base.box) : -yOverlap(ruby.box, base.box);
        if (across > base.fontSize * 0.2) continue;
        const along = ruby.vertical ? yOverlap(ruby.box, base.box) : xOverlap(ruby.box, base.box);
        const rubyLength = ruby.vertical ? height(ruby.box) : width(ruby.box);
        if (along < rubyLength * 0.6) continue;
        // A line with a sibling column of its own size is text (a bubble beside
        // big SFX lettering), not furigana: adjacent furigana runs sit a whole
        // base column apart, much further than their own size.
        if (out.some((other, k) => k !== i && k !== j && sameBlock(ruby, other))) continue;
        out[j] = { ...base, box: union(base.box, ruby.box), score: Math.max(base.score, ruby.score) };
        out.splice(i, 1);
        folded = true;
      }
    }
  }
  return out;
}

/**
 * Whether two parallel lines belong to one block: same orientation, a similar
 * font, at most about a glyph apart across, and overlapping along the line by
 * at least a glyph or a third of the shorter one (a bubble's last column is
 * often short, but it starts level with or below the first).
 */
function sameBlock(a: TextLine, b: TextLine): boolean {
  if (a.vertical !== b.vertical || !sameFont(a.fontSize, b.fontSize, 1.6)) return false;
  const font = Math.max(a.fontSize, b.fontSize);
  const across = a.vertical ? -xOverlap(a.box, b.box) : -yOverlap(a.box, b.box);
  if (across > ACROSS_GAP * font) return false;
  const along = a.vertical ? yOverlap(a.box, b.box) : xOverlap(a.box, b.box);
  const shorter = Math.min(a.vertical ? height(a.box) : width(a.box), b.vertical ? height(b.box) : width(b.box));
  return along >= Math.min(font, shorter / 3);
}

/** Lines in reading order inside one block: right to left, or top to bottom. */
function orderLines(lines: TextLine[], vertical: boolean): TextLine[] {
  return lines.slice().sort((a, b) =>
    vertical
      ? (b.box[0] + b.box[2]) - (a.box[0] + a.box[2]) || a.box[1] - b.box[1]
      : (a.box[1] + a.box[3]) - (b.box[1] + b.box[3]) || a.box[0] - b.box[0],
  );
}

/**
 * The detector block (`blockBoxes`) a line lies in: the one covering the
 * largest share of the line, when that share is at least half. -1 for none.
 */
function owningBlock(line: MokuroBox, blockBoxes: readonly MokuroBox[]): number {
  const area = width(line) * height(line);
  if (area <= 0) return -1;
  let best = -1;
  let bestShare = 0.5;
  blockBoxes.forEach((b, k) => {
    const share = (Math.max(0, xOverlap(line, b)) * Math.max(0, yOverlap(line, b))) / area;
    if (share >= bestShare) {
      best = k;
      bestShare = share;
    }
  });
  return best;
}

/**
 * Group lines into blocks (step 3 and 4 of the file header).
 *
 * `blockBoxes` are text blocks the detector found itself (comic-text-detector's
 * block head). When given, lines inside one detector block are one block
 * whatever the geometry says, and lines in two different detector blocks are
 * never joined; only lines outside every detector block fall back to the
 * geometric rule. A block's direction is that of most of its text.
 */
export function groupLinesIntoBlocks(lines: readonly TextLine[], blockBoxes: readonly MokuroBox[] = []): TextBlock[] {
  const sets = makeSets(lines.length);
  const owner = lines.map((l) => owningBlock(l.box, blockBoxes));
  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      if (owner[i] >= 0 && owner[j] >= 0) {
        if (owner[i] === owner[j]) sets.join(i, j);
      } else if (sameBlock(lines[i], lines[j])) {
        sets.join(i, j);
      }
    }
  }
  const blocks = groupsOf(lines.length, sets.find).map((members): TextBlock => {
    const own = members.map((i) => lines[i]);
    let verticalArea = 0;
    let horizontalArea = 0;
    for (const l of own) {
      const a = width(l.box) * height(l.box);
      if (l.vertical) verticalArea += a;
      else horizontalArea += a;
    }
    const vertical = verticalArea >= horizontalArea;
    const aligned = own.map((l) =>
      l.vertical === vertical ? l : { ...l, vertical, fontSize: vertical ? width(l.box) : height(l.box) },
    );
    return {
      box: aligned.map((l) => l.box).reduce(union),
      vertical,
      fontSize: median(aligned.map((l) => l.fontSize)),
      score: Math.max(...aligned.map((l) => l.score)),
      lines: orderLines(aligned, vertical),
    };
  });
  return sortReadingOrder(absorbContained(blocks));
}

/**
 * A block lying almost entirely inside another (a stray glyph read the other
 * way inside a bubble) joins it: two overlapping crops would read the same
 * text twice.
 */
function absorbContained(blocks: TextBlock[]): TextBlock[] {
  const out = blocks.slice();
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < out.length && !merged; i++) {
      for (let j = 0; j < out.length && !merged; j++) {
        if (i === j) continue;
        const inner = out[i];
        const outer = out[j];
        const area = width(inner.box) * height(inner.box);
        const inter = Math.max(0, xOverlap(inner.box, outer.box)) * Math.max(0, yOverlap(inner.box, outer.box));
        if (area <= 0 || inter / area < 0.85 || area > width(outer.box) * height(outer.box)) continue;
        const lines = [...outer.lines, ...inner.lines.map((l) => ({ ...l, vertical: outer.vertical }))];
        out[j] = {
          ...outer,
          box: union(outer.box, inner.box),
          score: Math.max(outer.score, inner.score),
          lines: orderLines(lines, outer.vertical),
        };
        out.splice(i, 1);
        merged = true;
      }
    }
  }
  return out;
}

/**
 * Fragments → blocks of lines, in reading order. `blockBoxes` (optional) are
 * the detector's own text blocks; see `groupLinesIntoBlocks`.
 */
export function groupTextLines(fragments: readonly TextFragment[], blockBoxes: readonly MokuroBox[] = []): TextBlock[] {
  if (!fragments.length) return [];
  return groupLinesIntoBlocks(buildTextLines(fragments), blockBoxes);
}

/**
 * A line's crop for the recognizer: the line box with a margin of a fraction of
 * its glyph size, so a glyph the mask clipped is not cut off, kept on the page.
 */
export function lineCropBox(line: Pick<TextLine, 'box' | 'fontSize'>, pageW: number, pageH: number): MokuroBox {
  const m = Math.max(2, line.fontSize * 0.15);
  return [
    Math.max(0, line.box[0] - m),
    Math.max(0, line.box[1] - m),
    Math.min(pageW, line.box[2] + m),
    Math.min(pageH, line.box[3] + m),
  ];
}
