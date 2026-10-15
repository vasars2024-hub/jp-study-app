/**
 * The Reading Lens's bundled offline recognizer: Tesseract's Japanese data,
 * which ships with the app, behind the preparation in `ocrPreprocess.ts`.
 *
 * It is the Lens's floor, not its ceiling. PaddleOCR and manga-ocr read screen
 * text far better, but they are downloads; until one is installed (a fresh
 * install, an offline machine, a refused download) the Lens used to answer every
 * scan with "models missing" and read nothing at all. Now it reads with this,
 * says so on screen, and offers the better model alongside.
 *
 * The policy lives here, with the recognizer injected, so the renderer (a
 * tesseract.js worker fed from a canvas) and the benchmark (tesseract.js in
 * node fed from decoded PNGs) run the identical decision path:
 *
 *  1. prepare the pixels (polarity, clutter, orientation, ruby, scale);
 *  2. read with the model for that orientation (`jpn` / `jpn_vert`);
 *  3. when the orientation was a close call, also read it the other way;
 *  4. when the read is weak, also read the inverted polarity (outlined
 *     subtitles are white glyphs inside black outlines — either can be "ink");
 *  5. keep whichever read scores best (confidence weighted by how much text
 *     came back, as `scoreRecognition` does for the CTC engine);
 *  6. `stylised` (Snip to cards): when the read is still weak, also read the
 *     adaptive-threshold planes and the text-shaped colour layers
 *     (`ocrPreprocess.ts`) — outlined, coloured lettering over a photo — the
 *     most text-like first, within a time budget.
 *
 * Every extra pass is skipped once `signal` is aborted.
 */
import {
  adaptiveBinarize,
  colourLayers,
  grayToRgba,
  keepGlyphComponents,
  ORIENTATION_CONFIDENT,
  prepareOcrImage,
  textLikeness,
  toGray,
  prepToSourceBox,
  type InkPolarity,
  type PreparedOcrImage,
  type RgbaImage,
  type TextOrientation,
} from './ocrPreprocess';

export type BasicOcrModel = 'jpn' | 'jpn_vert';

export interface TesseractBox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** The subset of a tesseract.js line this module reads. */
export interface TesseractLineLike {
  text: string;
  /** 0–100. */
  confidence: number;
  bbox: TesseractBox;
}

/** The subset of a tesseract.js `recognize` result this module reads (`blocks` output). */
export interface TesseractPageLike {
  text?: string;
  confidence?: number;
  blocks?: Array<{ paragraphs?: Array<{ lines?: TesseractLineLike[] | null }> | null }> | null;
}

/** Recognize a prepared (black-on-white) RGBA image with the given model. */
export type BasicRecognizer = (
  image: { rgba: Uint8ClampedArray; width: number; height: number },
  model: BasicOcrModel,
) => Promise<TesseractPageLike>;

export interface BasicOcrLine {
  text: string;
  /** [x, y, w, h] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  /** 0–1. */
  confidence: number;
}

export interface BasicOcrRead {
  lines: BasicOcrLine[];
  text: string;
  orientation: TextOrientation;
  polarity: InkPolarity;
  /** Upscale applied before reading (1 = none). */
  scale: number;
  /** How many recognizer passes it took. */
  passes: number;
  furiganaRemoved: number;
}

/**
 * Tesseract separates CJK glyphs with spaces; Japanese has none. Latin words
 * keep their single spaces, so "Wi-Fi に接続" survives as written.
 */
export function cleanOcrJapanese(text: string): string {
  const cjk = '\\u3000-\\u30ff\\u3400-\\u9fff\\uf900-\\ufaff\\uff00-\\uffef';
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line
      .replace(new RegExp(`([${cjk}])[ \\t\\u3000]+(?=[${cjk}])`, 'g'), '$1')
      .replace(new RegExp(`([${cjk}])[ \\t\\u3000]+(?=[A-Za-z0-9])`, 'g'), '$1')
      .replace(new RegExp(`([A-Za-z0-9])[ \\t\\u3000]+(?=[${cjk}])`, 'g'), '$1')
      .replace(/[ \t\u3000]+/g, ' ')
      .trim())
    .filter(Boolean)
    .join('\n');
}

/** Below this a recognized line is noise the recognizer made up from a smear. */
const MIN_LINE_CONFIDENCE = 25;

export function tesseractLines(page: TesseractPageLike): TesseractLineLike[] {
  const out: TesseractLineLike[] = [];
  for (const block of page.blocks ?? []) {
    for (const paragraph of block.paragraphs ?? []) {
      for (const line of paragraph.lines ?? []) {
        if (line && typeof line.text === 'string' && line.bbox) out.push(line);
      }
    }
  }
  return out;
}

/** Lines of a read, in source pixels, with the recognizer's spacing removed. */
export function linesFromPage(
  page: TesseractPageLike,
  prepared: Pick<PreparedOcrImage, 'scale' | 'pad' | 'orientation' | 'rows'>,
  source: { width: number; height: number },
): BasicOcrLine[] {
  const lines: BasicOcrLine[] = [];
  for (const line of tesseractLines(page)) {
    const text = cleanOcrJapanese(line.text).replace(/\n/g, '');
    if (!text || !(line.confidence >= MIN_LINE_CONFIDENCE)) continue;
    lines.push({
      text,
      box: prepToSourceBox(line.bbox, prepared, source),
      vertical: prepared.orientation === 'vertical',
      confidence: Math.max(0, Math.min(1, line.confidence / 100)),
    });
  }
  if (prepared.rows?.length) {
    // Re-laid columns: every recognized piece maps to its source column, and a
    // column the recognizer split in two is one line again, in reading order.
    const byColumn = new Map<string, BasicOcrLine>();
    for (const line of lines) {
      const key = line.box.join(',');
      const seen = byColumn.get(key);
      if (!seen) {
        byColumn.set(key, { ...line });
        continue;
      }
      const chars = seen.text.length + line.text.length;
      seen.confidence = (seen.confidence * seen.text.length + line.confidence * line.text.length) / chars;
      seen.text += line.text;
    }
    return [...byColumn.values()].sort((a, b) => (b.box[0] + b.box[2]) - (a.box[0] + a.box[2]));
  }
  // Reading order: top-to-bottom for horizontal text, right-to-left for columns.
  if (prepared.orientation === 'vertical') lines.sort((a, b) => (b.box[0] + b.box[2]) - (a.box[0] + a.box[2]));
  else lines.sort((a, b) => a.box[1] - b.box[1]);
  return lines;
}

/** Confidence weighted by how much text came back, so one confident glyph cannot win. */
export function scoreBasicRead(lines: readonly BasicOcrLine[]): number {
  const chars = lines.reduce((sum, line) => sum + line.text.length, 0);
  if (!chars) return 0;
  const conf = lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / chars;
  return conf * Math.log1p(chars);
}

function meanConfidence(lines: readonly BasicOcrLine[]): number {
  const chars = lines.reduce((sum, line) => sum + line.text.length, 0);
  return chars ? lines.reduce((sum, line) => sum + line.confidence * line.text.length, 0) / chars : 0;
}

/** Luminance above which a pixel counts as the white core of outlined lettering. */
const OUTLINED_CORE_THRESHOLD = 222;

/** The largest prepared side handed to the recognizer. */
const MAX_PREPARED_SIDE = 8192;

/** A read weaker than this earns the other polarity a try. */
export const WEAK_READ_CONFIDENCE = 0.72;

export class BasicOcrCancelledError extends Error {
  constructor() {
    super('OCR cancelled.');
    this.name = 'AbortError';
  }
}

interface Candidate {
  prepared: PreparedOcrImage;
  lines: BasicOcrLine[];
  score: number;
}

/** How long the stylised passes may run, after the first ones. */
export const STYLISED_BUDGET_MS = 12_000;

export interface BasicReadOptions {
  signal?: AbortSignal;
  onPass?: (pass: number) => void;
  /** Also try the adaptive and colour-layer preparations when the read is weak. */
  stylised?: boolean;
  /** The stylised passes stop once this much time has gone (default `STYLISED_BUDGET_MS`). */
  budgetMs?: number;
  now?: () => number;
}

export async function readWithBasicEngine(
  image: RgbaImage,
  recognize: BasicRecognizer,
  opts: BasicReadOptions = {},
): Promise<BasicOcrRead> {
  const now = opts.now ?? (() => Date.now());
  const startedAt = now();
  const source = { width: image.width, height: image.height };
  let passes = 0;
  const check = (): void => {
    if (opts.signal?.aborted) throw new BasicOcrCancelledError();
  };
  const run = async (prepared: PreparedOcrImage): Promise<Candidate> => {
    check();
    // A preparation with no ink left (the flipped polarity of a clean page is
    // all background) costs no recognizer pass at all.
    if (!prepared.hasInk) return { prepared, lines: [], score: 0 };
    // Tesseract refuses a side over 32767 px ("Image too large") and throws; a
    // preparation that big is a layout gone wrong, never text worth reading.
    if (prepared.width > MAX_PREPARED_SIDE || prepared.height > MAX_PREPARED_SIDE) return { prepared, lines: [], score: 0 };
    passes += 1;
    opts.onPass?.(passes);
    const page = await recognize({ rgba: prepared.rgba, width: prepared.width, height: prepared.height }, prepared.model);
    const lines = linesFromPage(page, prepared, source);
    return { prepared, lines, score: scoreBasicRead(lines) };
  };

  const first = prepareOcrImage(image);
  let best = await run(first);

  if (first.hasInk && first.orientationConfidence < ORIENTATION_CONFIDENT) {
    const other: TextOrientation = first.orientation === 'vertical' ? 'horizontal' : 'vertical';
    const turned = await run(prepareOcrImage(image, { polarity: first.polarity, orientation: other }));
    if (turned.score > best.score) best = turned;
  }

  if (first.hasInk && meanConfidence(best.lines) < WEAK_READ_CONFIDENCE) {
    const flipped = await run(prepareOcrImage(image, {
      polarity: first.polarity === 'dark' ? 'light' : 'dark',
      orientation: best.prepared.orientation,
    }));
    if (flipped.score > best.score) best = flipped;
  }

  // Outlined subtitles: white glyphs inside black outlines over a busy picture.
  // Neither Otsu class is the text there — the near-white core is.
  if (meanConfidence(best.lines) < WEAK_READ_CONFIDENCE) {
    const core = await run(prepareOcrImage(image, { polarity: 'light', threshold: OUTLINED_CORE_THRESHOLD }));
    if (core.score > best.score) best = core;
  }

  if (opts.stylised && meanConfidence(best.lines) < WEAK_READ_CONFIDENCE) {
    const deadline = startedAt + (opts.budgetMs ?? STYLISED_BUDGET_MS);
    const gray = toGray(image);
    const planes = [
      keepGlyphComponents(adaptiveBinarize(gray, { polarity: 'dark' })),
      keepGlyphComponents(adaptiveBinarize(gray, { polarity: 'light' })),
      ...colourLayers(image),
    ]
      .map((plane) => ({ plane, score: textLikeness(plane) }))
      .filter((p) => p.score > 0)
      .sort((a, b) => b.score - a.score);
    for (const { plane } of planes) {
      if (now() > deadline || meanConfidence(best.lines) >= WEAK_READ_CONFIDENCE) break;
      const layer = await run(prepareOcrImage(grayToRgba(plane), { polarity: 'dark', threshold: 127 }));
      if (layer.score > best.score) best = layer;
    }
  }

  return {
    lines: best.lines,
    text: best.lines.map((line) => line.text).join('\n'),
    orientation: best.prepared.orientation,
    polarity: best.prepared.polarity,
    scale: best.prepared.scale,
    passes,
    furiganaRemoved: best.prepared.furiganaRemoved,
  };
}

/**
 * Lines read off the Lens's fallback image, in region-relative DIP: the image
 * is the captured crop (possibly downscaled), and main says how many DIP one of
 * its pixels covers on each axis.
 */
export function basicLinesToDip(
  lines: readonly BasicOcrLine[],
  dipPerPixelX: number,
  dipPerPixelY: number,
): BasicOcrLine[] {
  const sx = Number.isFinite(dipPerPixelX) && dipPerPixelX > 0 ? dipPerPixelX : 1;
  const sy = Number.isFinite(dipPerPixelY) && dipPerPixelY > 0 ? dipPerPixelY : 1;
  return lines.map((line) => ({
    ...line,
    box: [line.box[0] * sx, line.box[1] * sy, Math.max(1, line.box[2] * sx), Math.max(1, line.box[3] * sy)],
  }));
}

// ---------------------------------------------------------------------------
// Scoring, shared by the benchmark and its unit tests
// ---------------------------------------------------------------------------

function levenshtein(a: readonly string[], b: readonly string[]): number {
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = new Array<number>(b.length + 1);
  let cur = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

/** Text as compared: NFKC, no whitespace or line breaks. */
export function normalizeForScore(text: string): string[] {
  return [...text.normalize('NFKC').replace(/\s+/g, '')];
}

/** 1 − character error rate, floored at 0. */
export function characterAccuracy(expected: string, actual: string): number {
  const want = normalizeForScore(expected);
  if (!want.length) return actual.trim() ? 0 : 1;
  const got = normalizeForScore(actual);
  return Math.max(0, 1 - levenshtein(want, got) / want.length);
}
