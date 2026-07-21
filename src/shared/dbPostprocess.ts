/**
 * Post-processing for a DB (Differentiable Binarization) text-detection map —
 * the head PP-OCR's detector emits. The model returns a per-pixel "is this
 * text?" probability at a downscaled resolution; turning that into usable text
 * boxes is entirely CPU-side work, which is what lives here.
 *
 * Pure on purpose (no electron, no onnxruntime, no fs) so the geometry can be
 * unit-tested without models on disk.
 *
 * Boxes are axis-aligned rather than PP-OCR's rotated min-area rectangles.
 * This engine reads screenshots of web pages, where text is laid out on the
 * pixel grid; rotating calipers plus Vatti clipping would buy accuracy we
 * cannot use here and is a well-known source of subtle geometry bugs.
 */

export interface DetBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  /** Mean detector probability inside the box — the box's confidence. */
  score: number;
}

export interface DbPostprocessOptions {
  /** Probability at or above which a pixel counts as text. */
  threshold?: number;
  /** Minimum mean probability inside a region for it to survive. */
  boxThreshold?: number;
  /** How far to grow each box (PP-OCR's unclip ratio) — DB output hugs glyphs too tightly to crop from. */
  unclipRatio?: number;
  /** Drop regions whose shorter side is under this many map pixels. */
  minSize?: number;
  /** Scale mapping probability-map coords back to source-image coords. */
  scaleX?: number;
  scaleY?: number;
  /** Clamp emitted boxes to the source image bounds. */
  maxWidth?: number;
  maxHeight?: number;
}

const DEFAULTS = {
  threshold: 0.3,
  boxThreshold: 0.5,
  unclipRatio: 1.7,
  minSize: 3,
} as const;

/**
 * Group above-threshold pixels into connected regions and emit one box each.
 *
 * Uses 8-connectivity: at detector resolution the strokes of a single glyph
 * frequently touch only diagonally, and 4-connectivity shatters them into
 * dozens of fragments that each fail the size filter.
 */
export function dbPostprocess(
  prob: Float32Array | number[],
  width: number,
  height: number,
  options: DbPostprocessOptions = {},
): DetBox[] {
  const threshold = options.threshold ?? DEFAULTS.threshold;
  const boxThreshold = options.boxThreshold ?? DEFAULTS.boxThreshold;
  const unclipRatio = options.unclipRatio ?? DEFAULTS.unclipRatio;
  const minSize = options.minSize ?? DEFAULTS.minSize;
  const scaleX = options.scaleX ?? 1;
  const scaleY = options.scaleY ?? 1;

  if (width <= 0 || height <= 0 || prob.length < width * height) return [];

  // 0 = unvisited, 1 = visited. Separate from the box list so a pixel is only
  // ever pushed onto the stack once (a region can otherwise revisit its own
  // interior and blow the stack on large text).
  const seen = new Uint8Array(width * height);
  const stack: number[] = [];
  const boxes: DetBox[] = [];

  for (let start = 0; start < width * height; start++) {
    if (seen[start]) continue;
    if (prob[start] < threshold) {
      seen[start] = 1;
      continue;
    }

    seen[start] = 1;
    stack.length = 0;
    stack.push(start);

    let minX = width;
    let minY = height;
    let maxX = -1;
    let maxY = -1;
    let sum = 0;
    let count = 0;

    while (stack.length) {
      const idx = stack.pop() as number;
      const x = idx % width;
      const y = (idx - x) / width;

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      sum += prob[idx];
      count += 1;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (seen[nIdx]) continue;
          if (prob[nIdx] < threshold) {
            seen[nIdx] = 1;
            continue;
          }
          seen[nIdx] = 1;
          stack.push(nIdx);
        }
      }
    }

    if (count === 0) continue;
    const score = sum / count;
    if (score < boxThreshold) continue;

    const boxW = maxX - minX + 1;
    const boxH = maxY - minY + 1;
    if (Math.min(boxW, boxH) < minSize) continue;

    const grown = unclip(minX, minY, maxX + 1, maxY + 1, unclipRatio);
    const box: DetBox = {
      x0: grown.x0 * scaleX,
      y0: grown.y0 * scaleY,
      x1: grown.x1 * scaleX,
      y1: grown.y1 * scaleY,
      score,
    };
    clampBox(box, options.maxWidth, options.maxHeight);
    if (box.x1 > box.x0 && box.y1 > box.y0) boxes.push(box);
  }

  return boxes;
}

/**
 * Grow a box outward. PP-OCR expands by `area * ratio / perimeter`, which
 * scales the padding with the region's own size — a headline grows more than
 * body text, so both end up with comparable visual margin.
 */
function unclip(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  ratio: number,
): { x0: number; y0: number; x1: number; y1: number } {
  const w = x1 - x0;
  const h = y1 - y0;
  const perimeter = 2 * (w + h);
  if (perimeter <= 0) return { x0, y0, x1, y1 };
  const distance = (w * h * ratio) / perimeter;
  return {
    x0: x0 - distance,
    y0: y0 - distance,
    x1: x1 + distance,
    y1: y1 + distance,
  };
}

function clampBox(box: DetBox, maxWidth?: number, maxHeight?: number): void {
  box.x0 = Math.max(0, box.x0);
  box.y0 = Math.max(0, box.y0);
  if (maxWidth != null) box.x1 = Math.min(maxWidth, box.x1);
  if (maxHeight != null) box.y1 = Math.min(maxHeight, box.y1);
}

/**
 * Merge boxes that overlap or nearly touch.
 *
 * DB frequently splits one text line into several regions (a gap between
 * words, a comma sitting below the baseline). Recognising those separately
 * produces fragmented output, so they are stitched back together before the
 * recogniser ever sees them.
 */
export function mergeDetBoxes(boxes: DetBox[], gap = 2): DetBox[] {
  const out = boxes.slice();
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        if (!boxesTouch(out[i], out[j], gap)) continue;
        const a = out[i];
        const b = out[j];
        const areaA = (a.x1 - a.x0) * (a.y1 - a.y0);
        const areaB = (b.x1 - b.x0) * (b.y1 - b.y0);
        const total = areaA + areaB;
        out[i] = {
          x0: Math.min(a.x0, b.x0),
          y0: Math.min(a.y0, b.y0),
          x1: Math.max(a.x1, b.x1),
          y1: Math.max(a.y1, b.y1),
          // Area-weighted so a stray speck cannot drag a solid box's score down.
          score: total > 0 ? (a.score * areaA + b.score * areaB) / total : Math.max(a.score, b.score),
        };
        out.splice(j, 1);
        merged = true;
        break outer;
      }
    }
  }
  return out;
}

function boxesTouch(a: DetBox, b: DetBox, gap: number): boolean {
  return !(
    a.x1 + gap < b.x0 ||
    b.x1 + gap < a.x0 ||
    a.y1 + gap < b.y0 ||
    b.y1 + gap < a.y0
  );
}

/** A box is treated as a vertical line when it is clearly taller than it is wide. */
export function isVerticalBox(box: DetBox, ratio = 1.6): boolean {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  return w > 0 && h / w >= ratio;
}

/**
 * Put detected boxes into reading order.
 *
 * Deliberately not `sortReadingOrder` from readingOrder.ts: that one is
 * hard-coded right-to-left for manga panels, which is correct for tategaki but
 * reverses every horizontal line of a news page, a Chinese article or Russian
 * text. Vertical Japanese still reads right-to-left, so orientation picks the
 * rule rather than the caller.
 */
export function orderDetBoxes(boxes: DetBox[], opts: { vertical?: boolean } = {}): DetBox[] {
  if (boxes.length <= 1) return boxes.slice();

  // Vertical text: each box is a column; columns read right to left.
  if (opts.vertical) {
    return boxes.slice().sort((a, b) => b.x1 - a.x1);
  }

  // Horizontal text: group into lines by vertical overlap, then read each
  // line left to right, lines top to bottom.
  const byTop = boxes.slice().sort((a, b) => a.y0 - b.y0);
  const bands: DetBox[][] = [];
  let bandMinY = 0;
  let bandMaxY = 0;

  for (const box of byTop) {
    const band = bands[bands.length - 1];
    let sameBand = false;
    if (band) {
      const overlap = Math.min(bandMaxY, box.y1) - Math.max(bandMinY, box.y0);
      const shorter = Math.min(box.y1 - box.y0, bandMaxY - bandMinY);
      sameBand = shorter > 0 && overlap / shorter >= 0.4;
    }
    if (band && sameBand) {
      band.push(box);
      bandMinY = Math.min(bandMinY, box.y0);
      bandMaxY = Math.max(bandMaxY, box.y1);
    } else {
      bands.push([box]);
      bandMinY = box.y0;
      bandMaxY = box.y1;
    }
  }

  const out: DetBox[] = [];
  for (const band of bands) {
    band.sort((a, b) => a.x0 - b.x0);
    out.push(...band);
  }
  return out;
}
