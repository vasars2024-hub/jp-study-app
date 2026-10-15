/**
 * Decoding comic-text-detector's three outputs into text lines and blocks.
 *
 * The model (the `comictextdetector.pt.onnx` export) answers a 1024×1024 page
 * with three heads:
 *
 *  - `det` [1, 2, H, W]: a DBNet text-LINE map. Channel 0 is the probability
 *    that a pixel lies inside a line's *shrunk* core — one blob per column or
 *    row, clear of the art — and channel 1 is DBNet's threshold map.
 *  - `seg` [1, 1, H, W]: a stroke-level text mask (every glyph pixel).
 *  - `blk` [1, N, 7]: YOLO text-BLOCK candidates, `cx, cy, w, h, objectness,
 *    class0, class1`, before non-maximum suppression.
 *
 * The scanner used to read only the mask (`seg`, picked as "the first output
 * near 1024²"), whose connected components are glyphs or bits of columns; the
 * grouping in `mangaTextLines.ts` then had to rebuild lines from those pieces.
 * Measured on rendered pages (`tools/ocr-eval`), that split half of all bubbles
 * and dropped trailing `！`/`？` pieces. The line map gives the lines directly,
 * and the block head says which lines share a bubble, which is how Mokuro (via
 * the same detector) builds its blocks.
 *
 * Pure functions over typed arrays, in the model's own 1024 coordinate space;
 * the caller maps the results back to page pixels.
 *
 * Written from DBNet's published method (threshold the shrink map, unclip each
 * component by `area × ratio / perimeter`) and the YOLO output layout; no
 * comic-text-detector or Mokuro source is used (see `mokuroTypes.ts`).
 */

import type { MokuroBox } from './mokuroTypes';

/** A box in the detector's coordinates with a 0-1 score. */
export interface ScoredBox {
  box: MokuroBox;
  score: number;
}

export interface LineMapOptions {
  /** Pixels of the shrink map at or above this are line cores (DBNet uses 0.3). */
  thresh: number;
  /** A component's mean probability must reach this to be kept (DBNet's box threshold). */
  boxThresh: number;
  /** Components smaller than this many pixels are noise. */
  minArea: number;
  /** DBNet unclip ratio: how far a shrunk core is grown back to the line's real extent. */
  unclipRatio: number;
}

export const DEFAULT_LINE_MAP_OPTIONS: LineMapOptions = {
  thresh: 0.3,
  boxThresh: 0.5,
  minArea: 6,
  unclipRatio: 1.6,
};

/**
 * Text lines from the DBNet shrink map (channel 0 of `det`): connected
 * components above `thresh`, kept when their mean probability reaches
 * `boxThresh`, each grown by DBNet's unclip distance `area × ratio / perimeter`
 * (on the component's bounding box) so the box covers the whole glyphs again.
 *
 * `limitW`/`limitH` bound the scan to the letterboxed content, so padding is
 * never read.
 */
export function linesFromShrinkMap(
  map: Float32Array | readonly number[],
  mapW: number,
  mapH: number,
  opts: LineMapOptions = DEFAULT_LINE_MAP_OPTIONS,
  limitW = mapW,
  limitH = mapH,
): ScoredBox[] {
  const w = Math.min(mapW, Math.max(0, Math.floor(limitW)));
  const h = Math.min(mapH, Math.max(0, Math.floor(limitH)));
  const seen = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  const out: ScoredBox[] = [];
  for (let y0 = 0; y0 < h; y0++) {
    for (let x0 = 0; x0 < w; x0++) {
      const start = y0 * w + x0;
      if (seen[start] || map[y0 * mapW + x0] < opts.thresh) continue;
      seen[start] = 1;
      let head = 0;
      let tail = 0;
      queue[tail++] = start;
      let minX = x0;
      let maxX = x0;
      let minY = y0;
      let maxY = y0;
      let sum = 0;
      while (head < tail) {
        const i = queue[head++];
        const x = i % w;
        const y = (i - x) / w;
        sum += map[y * mapW + x];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        // 8-connected: a thin diagonal core is still one line.
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = x + dx;
            if ((dx === 0 && dy === 0) || nx < 0 || nx >= w) continue;
            const ni = ny * w + nx;
            if (seen[ni] || map[ny * mapW + nx] < opts.thresh) continue;
            seen[ni] = 1;
            queue[tail++] = ni;
          }
        }
      }
      const area = tail;
      if (area < opts.minArea) continue;
      const score = sum / area;
      if (score < opts.boxThresh) continue;
      const bw = maxX + 1 - minX;
      const bh = maxY + 1 - minY;
      const d = (bw * bh * opts.unclipRatio) / (2 * (bw + bh));
      out.push({
        box: [Math.max(0, minX - d), Math.max(0, minY - d), Math.min(w, maxX + 1 + d), Math.min(h, maxY + 1 + d)],
        score,
      });
    }
  }
  return out;
}

/**
 * Shrink a box to the stroke mask's pixels inside it (`seg` above `thresh`),
 * so a line's crop hugs its glyphs; an unclipped core is a rectangle only
 * roughly the line's width. Returns the box unchanged when the mask is empty
 * there. Never grows the box.
 */
export function tightenToMask(
  box: MokuroBox,
  mask: Float32Array | readonly number[],
  mapW: number,
  mapH: number,
  thresh = 0.3,
): MokuroBox {
  const x0 = Math.max(0, Math.floor(box[0]));
  const y0 = Math.max(0, Math.floor(box[1]));
  const x1 = Math.min(mapW, Math.ceil(box[2]));
  const y1 = Math.min(mapH, Math.ceil(box[3]));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      if (mask[y * mapW + x] < thresh) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (!Number.isFinite(minX)) return box;
  return [Math.max(box[0], minX), Math.max(box[1], minY), Math.min(box[2], maxX + 1), Math.min(box[3], maxY + 1)];
}

/**
 * Lone glyphs the line map missed. DBNet scores a line by its shape, and a
 * column of one glyph — the `て` that ends 「待って」 on a column of its own —
 * often stays under the line threshold while the stroke mask marks it clearly.
 * Measured on the eval pages, those were most of the remaining misread bubbles.
 *
 * Looks only near the lines already found (within about a glyph and a half),
 * outside them, for stroke-mask clusters the size of one glyph of a nearby
 * line. Furigana (half-size glyphs hugging a column) and thin art strokes do
 * not pass the size test. Returned boxes are in map coordinates, scored by the
 * mask's mean.
 */
export function orphanGlyphs(
  mask: Float32Array | readonly number[],
  mapW: number,
  mapH: number,
  lines: readonly MokuroBox[],
  thresh = 0.3,
): ScoredBox[] {
  if (!lines.length) return [];
  const font = (b: MokuroBox): number => Math.min(b[2] - b[0], b[3] - b[1]);
  // Search zone: around each line, by its glyph size; never inside a line.
  const zones = lines.map((b) => ({ box: b, reach: font(b) * 1.5 }));
  let zx0 = mapW;
  let zy0 = mapH;
  let zx1 = 0;
  let zy1 = 0;
  for (const { box, reach } of zones) {
    zx0 = Math.min(zx0, Math.max(0, Math.floor(box[0] - reach)));
    zy0 = Math.min(zy0, Math.max(0, Math.floor(box[1] - reach)));
    zx1 = Math.max(zx1, Math.min(mapW, Math.ceil(box[2] + reach)));
    zy1 = Math.max(zy1, Math.min(mapH, Math.ceil(box[3] + reach)));
  }
  const zw = Math.max(0, zx1 - zx0);
  const zh = Math.max(0, zy1 - zy0);
  // Paint the zones, then blank the lines: 1 = look here, 0 = not.
  const zone = new Uint8Array(zw * zh);
  const paint = (b: MokuroBox, m: number, v: number): void => {
    const x0 = Math.max(zx0, Math.floor(b[0] - m));
    const y0 = Math.max(zy0, Math.floor(b[1] - m));
    const x1 = Math.min(zx1, Math.ceil(b[2] + m));
    const y1 = Math.min(zy1, Math.ceil(b[3] + m));
    for (let y = y0; y < y1; y++) zone.fill(v, (y - zy0) * zw + (x0 - zx0), (y - zy0) * zw + (x1 - zx0));
  };
  for (const { box, reach } of zones) paint(box, reach, 1);
  for (const box of lines) paint(box, 1, 0);
  const on = new Uint8Array(zw * zh);
  for (let y = zy0; y < zy1; y++) {
    for (let x = zx0; x < zx1; x++) {
      const i = (y - zy0) * zw + (x - zx0);
      if (zone[i] && mask[y * mapW + x] >= thresh) on[i] = 1;
    }
  }
  // Stroke pieces (8-connected), then pieces of one glyph joined by proximity.
  const pieces: Array<{ box: MokuroBox; sum: number; n: number }> = [];
  const queue = new Int32Array(zw * zh);
  for (let i0 = 0; i0 < on.length; i0++) {
    if (on[i0] !== 1) continue;
    on[i0] = 2;
    let head = 0;
    let tail = 0;
    queue[tail++] = i0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let sum = 0;
    while (head < tail) {
      const i = queue[head++];
      const x = i % zw;
      const y = (i - x) / zw;
      sum += mask[(y + zy0) * mapW + x + zx0];
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= zw || ny >= zh) continue;
          const ni = ny * zw + nx;
          if (on[ni] !== 1) continue;
          on[ni] = 2;
          queue[tail++] = ni;
        }
      }
    }
    pieces.push({ box: [minX + zx0, minY + zy0, maxX + 1 + zx0, maxY + 1 + zy0], sum, n: tail });
  }
  const nearestLine = (b: MokuroBox): { line: MokuroBox; gap: number } | null => {
    let best: { line: MokuroBox; gap: number } | null = null;
    for (const line of lines) {
      const gx = Math.max(0, Math.max(b[0], line[0]) - Math.min(b[2], line[2]));
      const gy = Math.max(0, Math.max(b[1], line[1]) - Math.min(b[3], line[3]));
      const gap = Math.hypot(gx, gy);
      if (!best || gap < best.gap) best = { line, gap };
    }
    return best;
  };
  // Join pieces closer than a quarter of the nearby glyph size.
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < pieces.length && !merged; i++) {
      const near = nearestLine(pieces[i].box);
      const join = near ? font(near.line) * 0.25 : 2;
      for (let j = i + 1; j < pieces.length && !merged; j++) {
        const a = pieces[i].box;
        const b = pieces[j].box;
        const gx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
        const gy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
        if (Math.hypot(gx, gy) > join) continue;
        const box: MokuroBox = [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])];
        pieces[i] = { box, sum: pieces[i].sum + pieces[j].sum, n: pieces[i].n + pieces[j].n };
        pieces.splice(j, 1);
        merged = true;
      }
    }
  }
  const out: ScoredBox[] = [];
  for (const p of pieces) {
    const near = nearestLine(p.box);
    if (!near) continue;
    const f = font(near.line);
    const w = p.box[2] - p.box[0];
    const h = p.box[3] - p.box[1];
    const long = Math.max(w, h);
    const short = Math.min(w, h);
    // One glyph of the neighbour's size: not a speck, not a stroke of art or a
    // caption box's edge (thin), not a run of several glyphs (the line map
    // would have seen that). A lone 「！」 column is lost to this; a border read
    // as 「！」 was the more common mistake on the eval pages.
    if (long < f * 0.6 || long > f * 1.4 || short < f * 0.3) continue;
    if (near.gap > f * 1.2) continue;
    // Furigana: small and hugging its column.
    if (near.gap < f * 0.25 && Math.max(w, h) < f * 0.75) continue;
    const score = p.sum / Math.max(1, p.n);
    if (score < 0.5) continue;
    out.push({ box: p.box, score });
  }
  return out;
}

function iou(a: MokuroBox, b: MokuroBox): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const union = (a[2] - a[0]) * (a[3] - a[1]) + (b[2] - b[0]) * (b[3] - b[1]) - inter;
  return union > 0 ? inter / union : 0;
}

/**
 * Text blocks from the YOLO head: rows of `cx, cy, w, h, objectness, cls…`,
 * scored objectness × best class, kept at `conf` or above, then greedy
 * non-maximum suppression at `nmsIou`. `stride` is the row length (7 here).
 */
export function blocksFromYolo(
  rows: Float32Array | readonly number[],
  count: number,
  stride: number,
  conf = 0.4,
  nmsIou = 0.35,
): ScoredBox[] {
  const candidates: ScoredBox[] = [];
  for (let i = 0; i < count; i++) {
    const o = i * stride;
    const obj = rows[o + 4];
    if (!(obj >= conf)) continue;
    let cls = stride > 5 ? 0 : 1;
    for (let c = 5; c < stride; c++) cls = Math.max(cls, rows[o + c]);
    const score = obj * cls;
    if (score < conf) continue;
    const cx = rows[o];
    const cy = rows[o + 1];
    const bw = rows[o + 2];
    const bh = rows[o + 3];
    if (!(bw > 0 && bh > 0)) continue;
    candidates.push({ box: [cx - bw / 2, cy - bh / 2, cx + bw / 2, cy + bh / 2], score });
  }
  candidates.sort((a, b) => b.score - a.score);
  const kept: ScoredBox[] = [];
  for (const c of candidates) {
    if (kept.some((k) => iou(k.box, c.box) > nmsIou)) continue;
    kept.push(c);
  }
  return kept;
}
