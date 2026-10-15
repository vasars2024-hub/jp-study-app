/**
 * Image preparation for the Reading Lens's bundled offline recognizer.
 *
 * The Lens's accurate engines (PaddleOCR, manga-ocr) are downloaded models. The
 * app also ships Tesseract's Japanese data, which works with no download and no
 * network, but Tesseract is a document recognizer: it expects dark, upright,
 * reasonably large glyphs on a clean light page. Screen text is rarely that —
 * light dialogue on a dark game box, 12 px fine print, tategaki columns, ruby
 * over every kanji, a speech bubble on screentone. Measured on the fixture set in
 * `src/shared/__tests__/fixtures/lensOcr` (see `lensOcrBenchmark.test.ts`), the raw
 * pixels read badly on exactly those categories.
 *
 * So the pixels are prepared first, every step decided from the image itself:
 *
 *  1. **Polarity.** Otsu splits the luminance histogram in two; the minority
 *     side is the ink. Light-on-dark text is inverted to dark-on-light.
 *  2. **Clutter.** Connected components that cannot be text are dropped: lone
 *     specks (paper noise), screentone dots far from any glyph, and frames
 *     (a bubble outline — huge, hollow and thin).
 *  3. **Orientation.** Projection profiles: lines are separated by wide gaps,
 *     characters by narrow ones, and a line is long where a character is square.
 *  4. **Furigana.** On the line axis, a thin band hugging a full-height line on
 *     the ruby side (above a horizontal line, right of a vertical column) is
 *     ruby, and is erased so it is not read into the sentence.
 *  5. **Scale.** The glyph size is measured from the line bands, and small text
 *     is upscaled (bilinear on the grey image, then re-thresholded) toward the
 *     size the recognizer reads best.
 *
 * Pure: plain typed arrays in, plain typed arrays out. The renderer feeds it a
 * canvas's `ImageData`; the benchmark feeds it decoded PNGs. Both therefore run
 * exactly the same code.
 */

export interface RgbaImage {
  /** RGBA, 4 bytes per pixel, row-major. */
  data: ArrayLike<number>;
  width: number;
  height: number;
}

export interface GrayImage {
  data: Uint8Array;
  width: number;
  height: number;
}

export type TextOrientation = 'horizontal' | 'vertical';
/** Whether the ink is darker or lighter than the background. */
export type InkPolarity = 'dark' | 'light';

export interface ProfileRun {
  /** First index on the axis (inclusive). */
  start: number;
  /** Last index on the axis (exclusive). */
  end: number;
}

export interface OrientationGuess {
  orientation: TextOrientation;
  /**
   * How clearly the evidence picked it, 0–1. Below `ORIENTATION_CONFIDENT` a
   * caller with time to spare should read both ways and keep the better read.
   */
  confidence: number;
  /** The runs on the line axis (rows for horizontal text, columns for vertical). */
  lineRuns: ProfileRun[];
}

export const ORIENTATION_CONFIDENT = 0.6;

// ---------------------------------------------------------------------------
// Grey, threshold, mask
// ---------------------------------------------------------------------------

export function toGray(image: RgbaImage): GrayImage {
  const { width, height, data } = image;
  const out = new Uint8Array(width * height);
  for (let i = 0, o = 0; i < out.length; i++, o += 4) {
    // Composite any transparency onto white: a cut-out PNG reads as text on paper.
    const alpha = data[o + 3] === undefined ? 255 : data[o + 3];
    const lum = 0.299 * data[o] + 0.587 * data[o + 1] + 0.114 * data[o + 2];
    out[i] = Math.round((lum * alpha + 255 * (255 - alpha)) / 255);
  }
  return { data: out, width, height };
}

function histogram(gray: GrayImage): Uint32Array {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.data.length; i++) hist[gray.data[i]] += 1;
  return hist;
}

/** Otsu's threshold: pixels `<= t` are one class, `> t` the other. */
export function otsuThreshold(gray: GrayImage): number {
  const hist = histogram(gray);
  const total = gray.data.length;
  let sum = 0;
  for (let v = 0; v < 256; v++) sum += v * hist[v];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let threshold = 127;
  for (let v = 0; v < 256; v++) {
    weightB += hist[v];
    if (weightB === 0) continue;
    const weightF = total - weightB;
    if (weightF === 0) break;
    sumB += v * hist[v];
    const meanB = sumB / weightB;
    const meanF = (sum - sumB) / weightF;
    const between = weightB * weightF * (meanB - meanF) ** 2;
    if (between > best) {
      best = between;
      threshold = v;
    }
  }
  return threshold;
}

/** The minority side of the threshold is the ink: text never covers most of a crop. */
export function guessPolarity(gray: GrayImage, threshold: number): InkPolarity {
  let dark = 0;
  for (let i = 0; i < gray.data.length; i++) if (gray.data[i] <= threshold) dark += 1;
  return dark <= gray.data.length - dark ? 'dark' : 'light';
}

/** 1 where there is ink, 0 elsewhere. */
export function inkMask(gray: GrayImage, threshold: number, polarity: InkPolarity): Uint8Array {
  const out = new Uint8Array(gray.data.length);
  for (let i = 0; i < out.length; i++) {
    const v = gray.data[i];
    out[i] = (polarity === 'dark' ? v <= threshold : v > threshold) ? 1 : 0;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Connected components
// ---------------------------------------------------------------------------

export interface Component {
  area: number;
  x0: number;
  y0: number;
  /** Exclusive. */
  x1: number;
  /** Exclusive. */
  y1: number;
}

/**
 * 8-connected components of the mask. `labels[i]` is the component index + 1,
 * 0 for background. Iterative flood fill with an explicit stack: a large glyph
 * blob would overflow recursion.
 */
export function connectedComponents(
  mask: Uint8Array,
  width: number,
  height: number,
): { labels: Int32Array; components: Component[] } {
  const labels = new Int32Array(mask.length);
  const components: Component[] = [];
  const stack = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || labels[start]) continue;
    const id = components.length + 1;
    const comp: Component = { area: 0, x0: width, y0: height, x1: 0, y1: 0 };
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const p = stack[--top];
      const x = p % width;
      const y = (p - x) / width;
      comp.area += 1;
      if (x < comp.x0) comp.x0 = x;
      if (y < comp.y0) comp.y0 = y;
      if (x + 1 > comp.x1) comp.x1 = x + 1;
      if (y + 1 > comp.y1) comp.y1 = y + 1;
      for (let dy = -1; dy <= 1; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const nx = x + dx;
          if ((dx === 0 && dy === 0) || nx < 0 || nx >= width) continue;
          const q = ny * width + nx;
          if (mask[q] && !labels[q]) {
            labels[q] = id;
            stack[top++] = q;
          }
        }
      }
    }
    components.push(comp);
  }
  return { labels, components };
}

function clearComponents(mask: Uint8Array, labels: Int32Array, drop: Set<number>): void {
  if (!drop.size) return;
  for (let i = 0; i < mask.length; i++) if (labels[i] && drop.has(labels[i])) mask[i] = 0;
}

/**
 * Drop what cannot be text, in place. Returns how many components went.
 *
 * - **Frames**: a component spanning most of the crop on either axis whose ink
 *   fills under 12% of its own box — a bubble outline, a box border, a rule.
 *   Text that large is solid by comparison.
 * - **Background bleed**: a component reaching three or four edges of the crop.
 * - **Specks and screentone**: components no bigger than `speckSide` on both
 *   axes that sit further than `speckSide * 2.5` from any larger component. A
 *   dakuten or the dot of ！ is small too, but it always sits beside its glyph,
 *   which is exactly what the distance test keeps.
 */
export function removeClutter(mask: Uint8Array, width: number, height: number): number {
  return removeClutterDetailed(mask, width, height).dropped;
}

interface ClutterReport {
  dropped: number;
  /** Isolated small components dropped as specks (not frames). */
  specks: number;
  /** Components that survived and are large enough to be glyph strokes. */
  glyphs: number;
}

/**
 * `speckled`: the page is known to be noisy (see `isSpeckled`), so a component
 * under 1.5% of a typical stroke's area goes even beside a glyph — at that size
 * it is a speck that landed on the stroke, not a dakuten, which is several
 * times larger.
 */
function removeClutterDetailed(mask: Uint8Array, width: number, height: number, speckled = false): ClutterReport {
  const { labels, components } = connectedComponents(mask, width, height);
  if (!components.length) return { dropped: 0, specks: 0, glyphs: 0 };
  const drop = new Set<number>();

  components.forEach((c, index) => {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const big = w >= width * 0.55 || h >= height * 0.55;
    const density = c.area / Math.max(1, w * h);
    if (big && density < 0.12 && (w > 24 || h > 24)) drop.add(index + 1);
    // Background showing through around a box (a subtitle's dark band on a
    // bright frame, a dialogue window's surroundings) reaches three or four
    // edges of the crop. Text cropped tightly reaches two at most.
    const edges = (c.x0 === 0 ? 1 : 0) + (c.y0 === 0 ? 1 : 0) + (c.x1 === width ? 1 : 0) + (c.y1 === height ? 1 : 0);
    if (edges >= 3) drop.add(index + 1);
  });

  // Speck size is relative to the glyph strokes actually present. Weighted by
  // ink area, not counted: on a speckled page the specks outnumber the strokes
  // ten to one, but the strokes hold almost all of the ink.
  const kept = components
    .filter((_, index) => !drop.has(index + 1))
    .map((c) => ({ side: Math.max(c.x1 - c.x0, c.y1 - c.y0), area: c.area }))
    .sort((a, b) => a.side - b.side);
  const inkTotal = kept.reduce((sum, c) => sum + c.area, 0);
  let typical = 0;
  for (let i = 0, seen = 0; i < kept.length; i++) {
    seen += kept[i].area;
    if (seen >= inkTotal / 2) {
      typical = kept[i].side;
      break;
    }
  }
  const speckSide = Math.max(2, Math.min(6, Math.round(typical * 0.18)));
  const isSmall = (c: Component): boolean => c.x1 - c.x0 <= speckSide && c.y1 - c.y0 <= speckSide;
  const anchors = components.filter((c, index) => !drop.has(index + 1) && !isSmall(c));
  // Wide enough for a colon's dots or a dakuten set slightly off its glyph.
  const reach = speckSide * 3;
  const strokeArea = median(anchors.map((a) => a.area));
  const speckArea = speckled ? Math.max(3, Math.round(strokeArea * 0.015)) : 0;
  components.forEach((c, index) => {
    if (drop.has(index + 1) || !isSmall(c)) return;
    if (c.area <= speckArea) {
      drop.add(index + 1);
      return;
    }
    if (c.area <= 2 && anchors.length > 0) {
      // A one- or two-pixel blob next to a glyph is anti-aliasing; anywhere else, noise.
      const nearGlyph = anchors.some((a) => c.x0 >= a.x0 - 1 && c.x1 <= a.x1 + 1 && c.y0 >= a.y0 - 1 && c.y1 <= a.y1 + 1);
      if (!nearGlyph) drop.add(index + 1);
      return;
    }
    const near = anchors.some((a) => {
      const dx = Math.max(a.x0 - c.x1, 0, c.x0 - a.x1);
      const dy = Math.max(a.y0 - c.y1, 0, c.y0 - a.y1);
      return dx <= reach && dy <= reach;
    });
    if (!near) drop.add(index + 1);
  });

  clearComponents(mask, labels, drop);
  let specks = 0;
  components.forEach((c, index) => {
    if (drop.has(index + 1) && isSmall(c)) specks += 1;
  });
  return { dropped: drop.size, specks, glyphs: anchors.length };
}

/**
 * Whether the page is speckled: far more isolated specks than glyph strokes.
 * Clean screen text produces almost none; a scan or a textured background
 * produces hundreds.
 */
export function isSpeckled(report: { specks: number; glyphs: number }): boolean {
  return report.specks >= 40 && report.specks > report.glyphs * 1.5;
}

// ---------------------------------------------------------------------------
// Projection profiles and orientation
// ---------------------------------------------------------------------------

export function projectionRuns(
  mask: Uint8Array,
  width: number,
  height: number,
  axis: 'rows' | 'cols',
): ProfileRun[] {
  const length = axis === 'rows' ? height : width;
  const across = axis === 'rows' ? width : height;
  const profile = new Uint32Array(length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!mask[y * width + x]) continue;
      profile[axis === 'rows' ? y : x] += 1;
    }
  }
  // A row that a stray pixel touches is still a gap.
  const minInk = Math.max(2, Math.floor(across * 0.004));
  const runs: ProfileRun[] = [];
  let start = -1;
  for (let i = 0; i <= length; i++) {
    const inked = i < length && profile[i] >= minInk;
    if (inked && start < 0) start = i;
    else if (!inked && start >= 0) {
      runs.push({ start, end: i });
      start = -1;
    }
  }
  return runs;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

/** Median gap between consecutive runs, relative to the median run thickness. */
function gapRatio(runs: ProfileRun[]): number {
  if (runs.length < 2) return 0;
  const thick = median(runs.map((r) => r.end - r.start));
  const gaps: number[] = [];
  for (let i = 1; i < runs.length; i++) gaps.push(runs[i].start - runs[i - 1].end);
  return thick > 0 ? median(gaps) / thick : 0;
}

/**
 * How long a run is along the other axis, relative to its own thickness: a text
 * line is many glyphs long, a character cell about one.
 */
function elongation(mask: Uint8Array, width: number, height: number, axis: 'rows' | 'cols', runs: ProfileRun[]): number {
  if (!runs.length) return 0;
  const values = runs.map((run) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (let a = run.start; a < run.end; a++) {
      const across = axis === 'rows' ? width : height;
      for (let b = 0; b < across; b++) {
        const inked = axis === 'rows' ? mask[a * width + b] : mask[b * width + a];
        if (!inked) continue;
        if (b < lo) lo = b;
        if (b > hi) hi = b;
      }
    }
    const thickness = Math.max(1, run.end - run.start);
    return hi >= lo ? (hi - lo + 1) / thickness : 0;
  });
  return median(values);
}

/** Gap ratios at or above this are line spacing; at or below LOW, character spacing. */
const LINE_GAP_HIGH = 0.5;
const LINE_GAP_LOW = 0.3;

/**
 * Which way the text runs. See the module comment for the evidence used; the
 * rules, in order of how much they can be trusted:
 *
 *  - both axes split into several runs: the axis with the wider gaps is the
 *    line axis (lines are spaced, characters packed);
 *  - one axis splits and the other does not: wide gaps on the split axis make
 *    it the line axis, narrow gaps make it the character axis;
 *  - otherwise compare elongation (lines are long, character cells square),
 *    and as a last resort the ink's own aspect ratio.
 */
export function detectOrientation(mask: Uint8Array, width: number, height: number): OrientationGuess {
  const rows = projectionRuns(mask, width, height, 'rows');
  const cols = projectionRuns(mask, width, height, 'cols');
  const pick = (orientation: TextOrientation, confidence: number): OrientationGuess => ({
    orientation,
    confidence: Math.max(0, Math.min(1, confidence)),
    lineRuns: orientation === 'horizontal' ? rows : cols,
  });
  if (!rows.length || !cols.length) return pick('horizontal', 0);

  const gr = gapRatio(rows);
  const gc = gapRatio(cols);
  const er = elongation(mask, width, height, 'rows', rows);
  const ec = elongation(mask, width, height, 'cols', cols);
  // Elongation as a soft vote, in [-1, 1]: positive favours horizontal.
  const elongVote = er + ec > 0 ? (er - ec) / (er + ec) : 0;

  if (rows.length >= 2 && cols.length >= 2) {
    if (Math.max(gr, gc) >= LINE_GAP_LOW && Math.abs(gr - gc) >= 0.12) {
      return pick(gr > gc ? 'horizontal' : 'vertical', 0.55 + Math.min(0.45, Math.abs(gr - gc)));
    }
    return pick(elongVote >= 0 ? 'horizontal' : 'vertical', Math.abs(elongVote));
  }
  if (rows.length >= 2 || cols.length >= 2) {
    // One axis is a single band. Elongation is the stronger witness here: a
    // single line is many glyphs long while the cells across it are about
    // square, whatever the spacing between those cells happens to be — a
    // median-filtered い splits into two strokes and fakes a wide gap.
    if (er >= ec * 1.6) return pick('horizontal', 0.6 + Math.min(0.4, (er / Math.max(ec, 0.01) - 1.6) / 4));
    if (ec >= er * 1.6) return pick('vertical', 0.6 + Math.min(0.4, (ec / Math.max(er, 0.01) - 1.6) / 4));
    const splitIsRows = rows.length >= 2;
    const g = splitIsRows ? gr : gc;
    if (g >= LINE_GAP_HIGH) return pick(splitIsRows ? 'horizontal' : 'vertical', 0.45 + Math.min(0.3, g - LINE_GAP_HIGH));
    if (g <= LINE_GAP_LOW) return pick(splitIsRows ? 'vertical' : 'horizontal', 0.45 + Math.min(0.3, LINE_GAP_LOW - g));
    return pick(elongVote >= 0 ? 'horizontal' : 'vertical', Math.abs(elongVote) * 0.8);
  }
  // One blob each way: a single line or a single glyph.
  const inkW = cols[cols.length - 1].end - cols[0].start;
  const inkH = rows[rows.length - 1].end - rows[0].start;
  const aspect = inkW / Math.max(1, inkH);
  return pick(aspect >= 1 ? 'horizontal' : 'vertical', Math.min(1, Math.abs(Math.log(aspect)) / Math.log(3)));
}

// ---------------------------------------------------------------------------
// Furigana
// ---------------------------------------------------------------------------

/**
 * The line-axis runs that are ruby: thin (under 62% of a full line) and hugging
 * a full line on the ruby side — above it for horizontal text, to its right for
 * vertical. Returned in axis coordinates.
 */
export function furiganaRuns(lineRuns: ProfileRun[], orientation: TextOrientation): ProfileRun[] {
  if (lineRuns.length < 2) return [];
  const thick = lineRuns.map((r) => r.end - r.start);
  const full = Math.max(...thick);
  const major = median(thick.filter((t) => t >= full * 0.62));
  if (!major) return [];
  const out: ProfileRun[] = [];
  lineRuns.forEach((run, index) => {
    const t = run.end - run.start;
    if (t >= major * 0.62) return;
    // Horizontal: ruby sits before (above) its line. Vertical: ruby sits after
    // (right of, larger x) its column.
    const neighbour = orientation === 'horizontal' ? lineRuns[index + 1] : lineRuns[index - 1];
    if (!neighbour || neighbour.end - neighbour.start < major * 0.62) return;
    const gap = orientation === 'horizontal' ? neighbour.start - run.end : run.start - neighbour.end;
    if (gap >= 0 && gap <= major * 0.6) out.push(run);
  });
  return out;
}

function eraseRuns(mask: Uint8Array, width: number, height: number, runs: ProfileRun[], orientation: TextOrientation): void {
  for (const run of runs) {
    if (orientation === 'horizontal') {
      for (let y = run.start; y < run.end; y++) mask.fill(0, y * width, (y + 1) * width);
    } else {
      for (let y = 0; y < height; y++) mask.fill(0, y * width + run.start, y * width + run.end);
    }
  }
}

// ---------------------------------------------------------------------------
// Scale
// ---------------------------------------------------------------------------

/** Bilinear resize of a grey image by `factor`. */
export function resizeGray(gray: GrayImage, factor: number): GrayImage {
  if (factor === 1) return gray;
  const width = Math.max(1, Math.round(gray.width * factor));
  const height = Math.max(1, Math.round(gray.height * factor));
  const out = new Uint8Array(width * height);
  const sx = gray.width / width;
  const sy = gray.height / height;
  for (let y = 0; y < height; y++) {
    const fy = Math.min(gray.height - 1, Math.max(0, (y + 0.5) * sy - 0.5));
    const y0 = Math.floor(fy);
    const y1 = Math.min(gray.height - 1, y0 + 1);
    const wy = fy - y0;
    for (let x = 0; x < width; x++) {
      const fx = Math.min(gray.width - 1, Math.max(0, (x + 0.5) * sx - 0.5));
      const x0 = Math.floor(fx);
      const x1 = Math.min(gray.width - 1, x0 + 1);
      const wx = fx - x0;
      const top = gray.data[y0 * gray.width + x0] * (1 - wx) + gray.data[y0 * gray.width + x1] * wx;
      const bottom = gray.data[y1 * gray.width + x0] * (1 - wx) + gray.data[y1 * gray.width + x1] * wx;
      out[y * width + x] = Math.round(top * (1 - wy) + bottom * wy);
    }
  }
  return { data: out, width, height };
}

/** The glyph size the bundled recognizer reads best, measured on the benchmark set. */
export const OCR_TARGET_GLYPH_PX = 40;
const MAX_UPSCALE = 4;
const MAX_SIDE = 4096;

/**
 * Upscale factor for a measured glyph size: toward the target, never down, and
 * bounded so a large crop cannot blow up memory.
 */
export function chooseOcrScale(glyphPx: number, width: number, height: number, target = OCR_TARGET_GLYPH_PX): number {
  if (!(glyphPx > 0)) return 1;
  let factor = target / glyphPx;
  if (factor <= 1.15) return 1;
  factor = Math.min(factor, MAX_UPSCALE, MAX_SIDE / Math.max(width, height, 1));
  return factor <= 1.15 ? 1 : Math.round(factor * 100) / 100;
}


// ---------------------------------------------------------------------------
// Output plane
// ---------------------------------------------------------------------------

/** Grow the mask by `radius` pixels (square neighbourhood). */
function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask;
  // Separable: a horizontal pass, then a vertical one.
  const tmp = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      if (!mask[row + x]) continue;
      const lo = Math.max(0, x - radius);
      const hi = Math.min(width - 1, x + radius);
      for (let k = lo; k <= hi; k++) tmp[row + k] = 1;
    }
  }
  const out = new Uint8Array(mask.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!tmp[y * width + x]) continue;
      const lo = Math.max(0, y - radius);
      const hi = Math.min(height - 1, y + radius);
      for (let k = lo; k <= hi; k++) out[k * width + x] = 1;
    }
  }
  return out;
}

/**
 * What the recognizer is shown: 0 = ink, 255 = paper.
 *
 * `gray` keeps the anti-aliased edges (stretched so the ink is black and the
 * paper white) inside a one-pixel halo around the cleaned mask, and blanks the
 * rest — clutter and ruby stay gone, but a 12 px glyph is not reduced to the
 * staircase a hard threshold leaves. `binary` is the plain mask.
 */
function renderPlane(
  gray: GrayImage,
  mask: Uint8Array,
  polarity: InkPolarity,
  mode: 'gray' | 'binary',
  radius: number,
): Uint8Array {
  const out = new Uint8Array(mask.length).fill(255);
  if (mode === 'binary') {
    for (let i = 0; i < mask.length; i++) if (mask[i]) out[i] = 0;
    return out;
  }
  const keep = dilate(mask, gray.width, gray.height, radius);
  let inkSum = 0;
  let inkCount = 0;
  let paperSum = 0;
  let paperCount = 0;
  for (let i = 0; i < mask.length; i++) {
    const n = polarity === 'dark' ? gray.data[i] : 255 - gray.data[i];
    if (mask[i]) {
      inkSum += n;
      inkCount += 1;
    } else if (!keep[i]) {
      paperSum += n;
      paperCount += 1;
    }
  }
  const ink = inkCount ? inkSum / inkCount : 0;
  const paper = paperCount ? paperSum / paperCount : 255;
  const span = Math.max(1, paper - ink);
  for (let i = 0; i < mask.length; i++) {
    if (!keep[i]) continue;
    const n = polarity === 'dark' ? gray.data[i] : 255 - gray.data[i];
    out[i] = Math.max(0, Math.min(255, Math.round(((n - ink) / span) * 255)));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Vertical text, re-laid as horizontal lines
// ---------------------------------------------------------------------------
//
// The bundled `jpn_vert` model reads tategaki badly — measured 0–4% character
// accuracy on the benchmark's vertical fixtures, the horizontal model ~100% on
// the same glyphs laid out sideways. So vertical text is not rotated (that lays
// every glyph on its side) but re-laid: each column is cut into character
// cells, and the cells are placed left to right, one output line per column,
// in reading order. Glyphs stay upright; only the long-vowel bar, which
// tategaki itself rotates, is turned back.

/** One output line of a re-laid column, and the source region it came from. */
export interface RelaidRow {
  /** Prepared-image rows, padding included. */
  y0: number;
  y1: number;
  /** [x, y, w, h] in source pixels. */
  source: [number, number, number, number];
}

interface ColumnCell {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  /** A single unbroken stroke much taller than wide: tategaki's rotated ー. */
  bar: boolean;
}

function inkRowCounts(mask: Uint8Array, width: number, height: number, band: ProfileRun): Uint32Array {
  const counts = new Uint32Array(height);
  for (let y = 0; y < height; y++) {
    let c = 0;
    for (let x = band.start; x < band.end; x++) if (mask[y * width + x]) c += 1;
    counts[y] = c;
  }
  return counts;
}

/** Character cells of one column, top to bottom. */
export function columnCells(mask: Uint8Array, width: number, height: number, band: ProfileRun, em: number): ColumnCell[] {
  const counts = inkRowCounts(mask, width, height, band);
  const raw: ProfileRun[] = [];
  let start = -1;
  for (let y = 0; y <= height; y++) {
    const inked = y < height && counts[y] > 0;
    if (inked && start < 0) start = y;
    else if (!inked && start >= 0) {
      raw.push({ start, end: y });
      start = -1;
    }
  }
  if (!raw.length) return [];

  // Glyphs that touch (heavy manga lettering) arrive as one long run: cut it at
  // the thinnest row near each expected character boundary.
  const pitch = em * 1.05;
  const split: ProfileRun[] = [];
  for (const run of raw) {
    const h = run.end - run.start;
    if (h <= em * 1.35) {
      split.push(run);
      continue;
    }
    const n = Math.max(2, Math.round(h / pitch));
    let from = run.start;
    for (let k = 1; k < n; k++) {
      const target = Math.round(run.start + (k * h) / n);
      const lo = Math.max(from + 1, Math.round(target - em * 0.25));
      const hi = Math.min(run.end - 1, Math.round(target + em * 0.25));
      let cut = target;
      let least = Infinity;
      for (let y = lo; y <= hi; y++) {
        if (counts[y] < least) {
          least = counts[y];
          cut = y;
        }
      }
      if (cut > from) {
        split.push({ start: from, end: cut });
        from = cut;
      }
    }
    split.push({ start: from, end: run.end });
  }

  // Re-join the parts of one glyph (三, 二, the dot of ！) without ever making
  // a cell taller than a character.
  const merged: Array<ProfileRun & { pieces: number }> = [];
  for (const run of split) {
    const last = merged[merged.length - 1];
    if (last && run.start - last.end <= em * 0.45 && run.end - last.start <= em * 1.12) {
      last.end = run.end;
      last.pieces += 1;
    } else {
      merged.push({ ...run, pieces: 1 });
    }
  }

  return merged.map((run) => {
    let x0 = band.end;
    let x1 = band.start;
    for (let y = run.start; y < run.end; y++) {
      for (let x = band.start; x < band.end; x++) {
        if (!mask[y * width + x]) continue;
        if (x < x0) x0 = x;
        if (x + 1 > x1) x1 = x + 1;
      }
    }
    const w = Math.max(1, x1 - x0);
    const h = run.end - run.start;
    return { x0, x1: Math.max(x0 + 1, x1), y0: run.start, y1: run.end, bar: run.pieces === 1 && h > w * 2.2 && h >= em * 0.45 };
  });
}

function relayoutColumns(
  plane: Uint8Array,
  mask: Uint8Array,
  width: number,
  height: number,
  columns: ProfileRun[],
  em: number,
): { plane: Uint8Array; width: number; height: number; rows: Array<{ y0: number; y1: number; box: [number, number, number, number] }> } | null {
  const order = [...columns].sort((a, b) => b.start - a.start);
  const margin = Math.max(4, Math.round(em * 0.4));
  const rowH = Math.max(8, Math.round(em * 1.3));
  const rowGap = Math.max(4, Math.round(em * 0.6));
  const gap = Math.max(1, Math.round(em * 0.12));

  interface Placed { cell: ColumnCell; dx: number; dy: number; w: number; h: number }
  const lines: Array<{ placed: Placed[]; width: number; box: [number, number, number, number] }> = [];
  for (const band of order) {
    const cells = columnCells(mask, width, height, band, em);
    if (!cells.length) continue;
    const placed: Placed[] = [];
    let x = margin;
    for (const cell of cells) {
      const cw = cell.x1 - cell.x0;
      const ch = cell.y1 - cell.y0;
      const w = cell.bar ? ch : cw;
      const h = cell.bar ? cw : ch;
      const small = Math.max(cw, ch) < em * 0.72;
      const punct = Math.max(cw, ch) < em * 0.42;
      // Row-local: the line's centre is rowH / 2. Small kana and punctuation
      // sit low, as they do in horizontal text; everything else is centred.
      const dy = small ? Math.round(rowH / 2 + em * 0.42 - h) : Math.round((rowH - h) / 2);
      placed.push({ cell, dx: x, dy: Math.max(0, Math.min(rowH - h, dy)), w, h });
      x += (punct ? Math.max(w, Math.round(em * 0.9)) : w) + gap;
    }
    const first = cells[0];
    const last = cells[cells.length - 1];
    lines.push({
      placed,
      width: x + margin,
      box: [band.start, first.y0, band.end - band.start, last.y1 - first.y0],
    });
  }
  if (!lines.length) return null;

  const outW = Math.max(...lines.map((line) => line.width));
  const outH = margin * 2 + lines.length * rowH + (lines.length - 1) * rowGap;
  // A "column" that is really a photo cut into hundreds of cells lays out as a
  // strip hundreds of thousands of pixels long, which the recognizer refuses
  // outright (it failed a whole snip). That is not tategaki: read it as it is.
  if (outW > MAX_SIDE || outH > MAX_SIDE) return null;
  const out = new Uint8Array(outW * outH).fill(255);
  const rows: Array<{ y0: number; y1: number; box: [number, number, number, number] }> = [];
  lines.forEach((line, index) => {
    const top = margin + index * (rowH + rowGap);
    for (const p of line.placed) {
      const { cell } = p;
      const cw = cell.x1 - cell.x0;
      for (let ty = 0; ty < p.h; ty++) {
        for (let tx = 0; tx < p.w; tx++) {
          // A bar is turned 90° counter-clockwise back to horizontal.
          const sx = cell.bar ? cell.x0 + (cw - 1 - ty) : cell.x0 + tx;
          const sy = cell.bar ? cell.y0 + tx : cell.y0 + ty;
          if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue;
          const ox = p.dx + tx;
          const oy = top + p.dy + ty;
          if (ox >= outW || oy >= outH) continue;
          out[oy * outW + ox] = Math.min(out[oy * outW + ox], plane[sy * width + sx]);
        }
      }
    }
    rows.push({ y0: top, y1: top + rowH, box: line.box });
  });
  return { plane: out, width: outW, height: outH, rows };
}

// ---------------------------------------------------------------------------
// The pipeline
// ---------------------------------------------------------------------------

export interface PrepareOcrOptions {
  /** `auto` (default) decides from the histogram; a retry passes the other one. */
  polarity?: 'auto' | InkPolarity;
  /** Overrides Otsu, e.g. a near-white cut for outlined subtitles. */
  threshold?: number;
  /** Force an orientation instead of detecting it (a retry reading the other way). */
  orientation?: TextOrientation;
  removeFurigana?: boolean;
  targetGlyphPx?: number;
  /** `gray` (default) keeps anti-aliasing; `binary` is the bare mask. */
  output?: 'gray' | 'binary';
  /** Re-lay vertical columns as horizontal lines (default true). */
  relayoutVertical?: boolean;
}

export interface PreparedOcrImage {
  /** Black ink on white, RGBA, ready for a canvas or an encoder. */
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  /** prepared = (source × scale) + pad, on both axes — unless `rows` is set. */
  scale: number;
  pad: number;
  orientation: TextOrientation;
  orientationConfidence: number;
  polarity: InkPolarity;
  /** The recognizer model this image is laid out for. */
  model: 'jpn' | 'jpn_vert';
  /**
   * Present when vertical columns were re-laid as horizontal lines: each output
   * line and the source column it came from. Boxes then map through these.
   */
  rows?: RelaidRow[];
  /** Measured line thickness in source pixels (0 when there was no ink). */
  glyphPx: number;
  furiganaRemoved: number;
  clutterRemoved: number;
  /** False when the mask came out empty: there is nothing to read. */
  hasInk: boolean;
}

function planeToRgba(plane: Uint8Array, width: number, height: number, pad: number): Uint8ClampedArray {
  const outW = width + pad * 2;
  const outH = height + pad * 2;
  const out = new Uint8ClampedArray(outW * outH * 4).fill(255);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = plane[y * width + x];
      if (v === 255) continue;
      const o = ((y + pad) * outW + (x + pad)) * 4;
      out[o] = v;
      out[o + 1] = v;
      out[o + 2] = v;
    }
  }
  return out;
}

function cleanMask(
  gray: GrayImage,
  threshold: number,
  polarity: InkPolarity,
  speckled = false,
): { mask: Uint8Array; clutter: number; report: ClutterReport } {
  const mask = inkMask(gray, threshold, polarity);
  const report = removeClutterDetailed(mask, gray.width, gray.height, speckled);
  return { mask, clutter: report.dropped, report };
}

export function prepareOcrImage(image: RgbaImage, options: PrepareOcrOptions = {}): PreparedOcrImage {
  const gray = toGray(image);
  const threshold = options.threshold ?? otsuThreshold(gray);
  const polarity: InkPolarity = options.polarity && options.polarity !== 'auto'
    ? options.polarity
    : guessPolarity(gray, threshold);

  // First pass at source resolution: orientation and glyph size.
  const first = cleanMask(gray, threshold, polarity);
  // Specks that hug a stroke survive the distance test (they look like a
  // dakuten). On a page known to be speckled, the size test takes them too.
  const speckled = isSpeckled(first.report);
  let { mask, clutter } = speckled ? cleanMask(gray, threshold, polarity, true) : first;
  const guess = detectOrientation(mask, gray.width, gray.height);
  const orientation = options.orientation ?? guess.orientation;
  const lineRuns = options.orientation && options.orientation !== guess.orientation
    ? projectionRuns(mask, gray.width, gray.height, orientation === 'horizontal' ? 'rows' : 'cols')
    : guess.lineRuns;
  const ruby = options.removeFurigana === false ? [] : furiganaRuns(lineRuns, orientation);
  const rubySet = new Set(ruby);
  const lineThickness = median(lineRuns.filter((run) => !rubySet.has(run)).map((run) => run.end - run.start));
  // A line band is a little taller than its glyphs (ascending strokes, kana
  // overhang); 0.9 brings it back to roughly the em the recognizer cares about.
  const glyphPx = Math.round(lineThickness * 0.9);

  const scale = chooseOcrScale(glyphPx, gray.width, gray.height, options.targetGlyphPx);
  let working = gray;
  let runs = ruby;
  if (scale !== 1) {
    working = resizeGray(gray, scale);
    ({ mask, clutter } = cleanMask(working, threshold, polarity, speckled));
    runs = ruby.map((run) => ({ start: Math.floor(run.start * scale), end: Math.ceil(run.end * scale) }));
  }
  const { width, height } = working;
  eraseRuns(mask, width, height, runs, orientation);

  let hasInk = false;
  for (let i = 0; i < mask.length; i++) {
    if (mask[i]) {
      hasInk = true;
      break;
    }
  }
  const plane = renderPlane(working, mask, polarity, options.output ?? 'gray', Math.max(1, Math.round(scale)));
  // A margin of white: glyphs touching the image edge read noticeably worse.
  const pad = Math.max(8, Math.round((glyphPx || 20) * scale * 0.5));
  const base = {
    scale,
    pad,
    orientation,
    orientationConfidence: options.orientation ? 1 : guess.confidence,
    polarity,
    glyphPx,
    furiganaRemoved: ruby.length,
    clutterRemoved: clutter,
    hasInk,
  };

  if (hasInk && orientation === 'vertical' && options.relayoutVertical !== false) {
    const columns = projectionRuns(mask, width, height, 'cols');
    const em = median(columns.map((c) => c.end - c.start));
    const relaid = em > 0 ? relayoutColumns(plane, mask, width, height, columns, em) : null;
    if (relaid) {
      return {
        ...base,
        rgba: planeToRgba(relaid.plane, relaid.width, relaid.height, pad),
        width: relaid.width + pad * 2,
        height: relaid.height + pad * 2,
        model: 'jpn',
        rows: relaid.rows.map((row) => ({
          y0: row.y0 + pad,
          y1: row.y1 + pad,
          source: [row.box[0] / scale, row.box[1] / scale, row.box[2] / scale, row.box[3] / scale],
        })),
      };
    }
  }

  return {
    ...base,
    rgba: planeToRgba(plane, width, height, pad),
    width: width + pad * 2,
    height: height + pad * 2,
    model: orientation === 'vertical' ? 'jpn_vert' : 'jpn',
  };
}

/**
 * A box from the prepared image back into source pixels, as `[x, y, w, h]`,
 * clamped to the source. Re-laid vertical text maps through its rows instead:
 * the line whose band holds the box's centre names the source column.
 */
export function prepToSourceBox(
  box: { x0: number; y0: number; x1: number; y1: number },
  prepared: Pick<PreparedOcrImage, 'scale' | 'pad' | 'rows'>,
  source: { width: number; height: number },
): [number, number, number, number] {
  if (prepared.rows?.length) {
    const cy = (box.y0 + box.y1) / 2;
    let best = prepared.rows[0];
    let bestDistance = Infinity;
    for (const row of prepared.rows) {
      const distance = cy < row.y0 ? row.y0 - cy : cy > row.y1 ? cy - row.y1 : 0;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = row;
      }
    }
    const [x, y, w, h] = best.source;
    const x0 = Math.max(0, Math.min(source.width, x));
    const y0 = Math.max(0, Math.min(source.height, y));
    return [x0, y0, Math.max(1, Math.min(source.width - x0, w)), Math.max(1, Math.min(source.height - y0, h))];
  }
  const map = (v: number): number => (v - prepared.pad) / prepared.scale;
  const x0 = Math.max(0, Math.min(source.width, map(box.x0)));
  const y0 = Math.max(0, Math.min(source.height, map(box.y0)));
  const x1 = Math.max(0, Math.min(source.width, map(box.x1)));
  const y1 = Math.max(0, Math.min(source.height, map(box.y1)));
  return [x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)];
}
// ---------------------------------------------------------------------------
// Extra preparations for stylised text (Snip to cards' basic reader)
// ---------------------------------------------------------------------------
//
// A video thumbnail's title is not a page: big red, white and green glyphs,
// each with a contrasting outline, over a photo. No single global threshold
// separates that ink from that background. Two more ways to find the ink:
//
//  - **Adaptive threshold** (Bradley's local mean): a pixel is ink when it is
//    clearly darker (or lighter) than its own neighbourhood, so a glyph over a
//    bright sky and one over dark hair are both found.
//  - **Colour layers**: the picture's colours are clustered (k-means on a
//    sample), and each cluster that is shaped like text — many glyph-sized
//    components, a modest share of the picture — becomes its own ink plane.
//    Outlined lettering separates cleanly: the fill is one colour and its
//    outline another, and either reads better alone than the mix of both.
//
// Each returns plain grey planes (0 = ink, 255 = paper) that go through
// `prepareOcrImage` like any picture.

/** A grey plane as an RGBA image (for `prepareOcrImage`). */
export function grayToRgba(gray: GrayImage): RgbaImage {
  const data = new Uint8ClampedArray(gray.width * gray.height * 4);
  for (let i = 0, o = 0; i < gray.data.length; i++, o += 4) {
    data[o] = gray.data[i];
    data[o + 1] = gray.data[i];
    data[o + 2] = gray.data[i];
    data[o + 3] = 255;
  }
  return { data, width: gray.width, height: gray.height };
}

/**
 * Bradley's adaptive threshold: ink where a pixel is `k` (a fraction) darker
 * than the mean of its `(2r+1)²` neighbourhood — or lighter, for light ink.
 * Integral image, so the cost does not depend on the radius.
 */
export function adaptiveBinarize(
  gray: GrayImage,
  opts: { polarity: InkPolarity; radius?: number; k?: number },
): GrayImage {
  const { width, height, data } = gray;
  const radius = Math.max(4, Math.round(opts.radius ?? Math.min(width, height) / 12));
  const k = opts.k ?? 0.15;
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y++) {
    let row = 0;
    for (let x = 0; x < width; x++) {
      row += data[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + row;
    }
  }
  const out = new Uint8Array(width * height).fill(255);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height, y + radius + 1);
    for (let x = 0; x < width; x++) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width, x + radius + 1);
      const sum = integral[y1 * (width + 1) + x1] - integral[y0 * (width + 1) + x1]
        - integral[y1 * (width + 1) + x0] + integral[y0 * (width + 1) + x0];
      const mean = sum / ((x1 - x0) * (y1 - y0));
      const v = data[y * width + x];
      const ink = opts.polarity === 'dark' ? v < mean * (1 - k) : v > mean * (1 + k) && v > mean + 12;
      if (ink) out[y * width + x] = 0;
    }
  }
  return { data: out, width, height };
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function colourDistance(a: Rgb, b: Rgb): number {
  return (a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2;
}

/** k-means on a deterministic sample of the picture's colours. */
export function colourClusters(image: RgbaImage, k = 6, iterations = 8): Rgb[] {
  const { width, height, data } = image;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 4000));
  const sample: Rgb[] = [];
  for (let i = 0; i < total; i += step) sample.push({ r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] });
  if (!sample.length) return [];
  // Farthest-point seeding: deterministic, and it does not miss a small, vivid cluster (red lettering).
  const centres: Rgb[] = [sample[0]];
  while (centres.length < Math.min(k, sample.length)) {
    let far = sample[0];
    let farD = -1;
    for (const c of sample) {
      const d = Math.min(...centres.map((m) => colourDistance(c, m)));
      if (d > farD) {
        farD = d;
        far = c;
      }
    }
    if (farD <= 0) break;
    centres.push(far);
  }
  for (let it = 0; it < iterations; it++) {
    const sums = centres.map(() => ({ r: 0, g: 0, b: 0, n: 0 }));
    for (const c of sample) {
      let best = 0;
      let bestD = Infinity;
      centres.forEach((m, j) => {
        const d = colourDistance(c, m);
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      });
      sums[best].r += c.r;
      sums[best].g += c.g;
      sums[best].b += c.b;
      sums[best].n += 1;
    }
    sums.forEach((s, j) => {
      if (s.n) centres[j] = { r: s.r / s.n, g: s.g / s.n, b: s.b / s.n };
    });
  }
  return centres;
}

/**
 * How much a binary plane looks like text: glyph-sized components (not
 * specks, not the whole picture), covering a modest share of it. 0 = not text.
 */
export function textLikeness(plane: GrayImage): number {
  const mask = new Uint8Array(plane.data.length);
  let ink = 0;
  for (let i = 0; i < mask.length; i++) {
    if (plane.data[i] < 128) {
      mask[i] = 1;
      ink += 1;
    }
  }
  const share = ink / Math.max(1, mask.length);
  if (share < 0.004 || share > 0.45) return 0;
  const { components } = connectedComponents(mask, plane.width, plane.height);
  const minSide = Math.max(6, Math.min(plane.width, plane.height) * 0.04);
  let glyphs = 0;
  for (const c of components) {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const edges = (c.x0 === 0 ? 1 : 0) + (c.y0 === 0 ? 1 : 0) + (c.x1 === plane.width ? 1 : 0) + (c.y1 === plane.height ? 1 : 0);
    if (edges >= 2) continue;
    if (Math.max(w, h) < minSide || h > plane.height * 0.9 || w > plane.width * 0.9) continue;
    const density = c.area / Math.max(1, w * h);
    if (density < 0.08 || density > 0.9) continue;
    glyphs += 1;
  }
  return glyphs ? Math.log1p(glyphs) * (1 - Math.abs(share - 0.12)) : 0;
}

/**
 * A plane with only its glyph-sized components left: photo texture (specks
 * smaller than a stroke), and regions that touch two edges or span the picture
 * are dropped. What stays is what a recognizer can read as lettering.
 */
export function keepGlyphComponents(plane: GrayImage): GrayImage {
  const { width, height } = plane;
  const mask = new Uint8Array(plane.data.length);
  for (let i = 0; i < mask.length; i++) mask[i] = plane.data[i] < 128 ? 1 : 0;
  const { labels, components } = connectedComponents(mask, width, height);
  const minSide = Math.max(5, Math.min(width, height) * 0.035);
  const keep = components.map((c) => {
    const w = c.x1 - c.x0;
    const h = c.y1 - c.y0;
    const edges = (c.x0 === 0 ? 1 : 0) + (c.y0 === 0 ? 1 : 0) + (c.x1 === width ? 1 : 0) + (c.y1 === height ? 1 : 0);
    const density = c.area / Math.max(1, w * h);
    return edges < 2 && Math.max(w, h) >= minSide && w <= width * 0.9 && h <= height * 0.9 && density >= 0.06;
  });
  const out = new Uint8Array(mask.length).fill(255);
  for (let i = 0; i < mask.length; i++) if (labels[i] && keep[labels[i] - 1]) out[i] = 0;
  return { data: out, width, height };
}

/**
 * The colour clusters that look like text, as ink planes (best first, at most
 * `max`). A pixel belongs to a layer when its colour is nearer that cluster's
 * centre than any other's.
 */
export function colourLayers(image: RgbaImage, opts: { k?: number; max?: number } = {}): GrayImage[] {
  const centres = colourClusters(image, opts.k ?? 6);
  if (centres.length < 2) return [];
  const { width, height, data } = image;
  const labels = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i++) {
    const c = { r: data[i * 4], g: data[i * 4 + 1], b: data[i * 4 + 2] };
    let best = 0;
    let bestD = Infinity;
    centres.forEach((m, j) => {
      const d = colourDistance(c, m);
      if (d < bestD) {
        bestD = d;
        best = j;
      }
    });
    labels[i] = best;
  }
  const layers = centres.map((_, j) => {
    const out = new Uint8Array(width * height).fill(255);
    for (let i = 0; i < labels.length; i++) if (labels[i] === j) out[i] = 0;
    const plane = keepGlyphComponents({ data: out, width, height });
    return { plane, score: textLikeness(plane) };
  });
  return layers
    .filter((l) => l.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, opts.max ?? 3)
    .map((l) => l.plane);
}
