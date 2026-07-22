/**
 * General-purpose web OCR: PP-OCR detection + per-language recognition.
 *
 * Why this exists alongside mangaOcr.ts: manga-ocr is a manga speech-bubble
 * model and the extension used to hand it an entire screenshot crop as one
 * block. Given printed web text (a news headline, a video thumbnail) it is
 * out of domain and confidently returns a fluent sentence that is not on the
 * page at all. This engine instead *detects* every text line first and reads
 * each one, which is both what makes multi-line crops work and what stops the
 * hallucinations.
 *
 * Detection is language-agnostic, so the expensive model is shared and only a
 * ~10 MB recognition head swaps per language. Manga pages still route to
 * manga-ocr — see extensionServer's /v1/ocr.
 */

import * as fsp from 'node:fs/promises';
import { nativeImage } from 'electron';
import type * as OrtNamespace from 'onnxruntime-node';
import { assetPath, isInstalled, registerAssetUnloadHandler } from './downloads';
import {
  dbPostprocess,
  isVerticalBox,
  mergeDetBoxes,
  orderDetBoxes,
  type DetBox,
} from '../shared/dbPostprocess';
import { columnsFromInkProfile } from '../shared/tategakiColumns';
import {
  buildCharset,
  ctcGreedyDecode,
  parseKeysFile,
  scoreRecognition,
  type CtcDecodeResult,
} from '../shared/ctcDecode';

export type PaddleLang = 'ja' | 'zh' | 'ru';

export interface PaddleOcrLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

export interface PaddleOcrResult {
  text: string;
  lang: PaddleLang;
  lines: PaddleOcrLine[];
}

const DET_ASSET = 'paddle-ocr-det';

const LANG_ASSETS: Record<PaddleLang, { model: string; keys: string }> = {
  ja: { model: 'paddle-ocr-ja', keys: 'paddle-ocr-ja-keys' },
  zh: { model: 'paddle-ocr-zh', keys: 'paddle-ocr-zh-keys' },
  ru: { model: 'paddle-ocr-ru', keys: 'paddle-ocr-ru-keys' },
};

export const PADDLE_LANGS = Object.keys(LANG_ASSETS) as PaddleLang[];

/**
 * Detector input is padded to a multiple of 32 (the backbone downsamples five
 * times). Small crops are scaled *up* to this before detection — a dragged box
 * around a single headline is often only ~200px wide, and at that size DB
 * merges adjacent glyphs into one blob and recall collapses.
 */
const DET_TARGET_SIDE = 960;
const DET_MAX_SIDE = 1600;
const DET_STRIDE = 32;

/** PP-OCRv3/v4 recognition heads are trained at 48px line height. */
const REC_HEIGHT = 48;
const REC_MIN_WIDTH = 16;
const REC_MAX_WIDTH = 1024;

const DET_MEAN = [0.485, 0.456, 0.406];
const DET_STD = [0.229, 0.224, 0.225];

/** Below this a line is treated as noise rather than text. */
const MIN_LINE_CONFIDENCE = 0.3;
/**
 * Score above which the caller's language hint is simply accepted.
 *
 * Set low on purpose. Probing is good at catching a *script* mismatch (CJK text
 * under a Cyrillic recogniser scores near zero) but cannot reliably separate
 * Japanese from Chinese: they share most kanji, so a line with no kana —
 * 世界記録, a vertical heading — reads almost identically under both and flips
 * on a rounding error. The page's own detected language is the better evidence
 * there, so the hint only loses when it plainly fails to read the image at all.
 */
const HINT_ACCEPT_SCORE = 0.35;
/** How many boxes to sample when probing which language a crop is in. */
const LANG_PROBE_BOXES = 3;

type Ort = typeof OrtNamespace;
let ort: Ort | null = null;

async function loadOrt(): Promise<Ort> {
  if (!ort) ort = await import('onnxruntime-node');
  return ort;
}

// ----- sessions ----------------------------------------------------------

let detector: OrtNamespace.InferenceSession | null = null;
let detectorPromise: Promise<OrtNamespace.InferenceSession> | null = null;

interface Recognizer {
  session: OrtNamespace.InferenceSession;
  charset: string[];
}
const recognizers = new Map<PaddleLang, Recognizer>();
const recognizerPromises = new Map<PaddleLang, Promise<Recognizer>>();
let unloadRegistered = false;

/** True when detection plus at least one language is installed. */
export function paddleOcrAvailable(): boolean {
  return isInstalled(DET_ASSET) && installedPaddleLangs().length > 0;
}

export function installedPaddleLangs(): PaddleLang[] {
  return PADDLE_LANGS.filter(
    (lang) => isInstalled(LANG_ASSETS[lang].model) && isInstalled(LANG_ASSETS[lang].keys),
  );
}

/** Asset ids a language needs, for the caller to hand to startDownload(). */
export function paddleAssetsForLang(lang: PaddleLang): string[] {
  return [LANG_ASSETS[lang].model, LANG_ASSETS[lang].keys, DET_ASSET];
}

async function unloadSessions(): Promise<void> {
  const sessions: Array<OrtNamespace.InferenceSession | undefined> = [detector];
  for (const rec of recognizers.values()) sessions.push(rec.session);
  detector = null;
  detectorPromise = null;
  recognizers.clear();
  recognizerPromises.clear();
  for (const s of sessions) {
    try {
      await s?.release();
    } catch {
      // A session that failed to load has nothing to release.
    }
  }
}

function ensureUnloadHandlers(): void {
  if (unloadRegistered) return;
  unloadRegistered = true;
  const ids = [DET_ASSET];
  for (const lang of PADDLE_LANGS) {
    ids.push(LANG_ASSETS[lang].model, LANG_ASSETS[lang].keys);
  }
  for (const id of ids) registerAssetUnloadHandler(id, () => unloadSessions());
}

function sessionOptions(): OrtNamespace.InferenceSession.SessionOptions {
  return { executionProviders: ['cpu'], graphOptimizationLevel: 'all' };
}

async function ensureDetector(): Promise<OrtNamespace.InferenceSession> {
  ensureUnloadHandlers();
  if (detector) return detector;
  if (detectorPromise) return detectorPromise;
  detectorPromise = (async () => {
    const path = assetPath(DET_ASSET);
    if (!path) throw new Error('Web OCR detector is not installed.');
    const runtime = await loadOrt();
    const session = await runtime.InferenceSession.create(path, sessionOptions());
    detector = session;
    return session;
  })();
  try {
    return await detectorPromise;
  } catch (err) {
    detectorPromise = null;
    throw err;
  }
}

async function ensureRecognizer(lang: PaddleLang): Promise<Recognizer> {
  ensureUnloadHandlers();
  const cached = recognizers.get(lang);
  if (cached) return cached;
  const pending = recognizerPromises.get(lang);
  if (pending) return pending;

  const promise = (async () => {
    const modelPath = assetPath(LANG_ASSETS[lang].model);
    const keysPath = assetPath(LANG_ASSETS[lang].keys);
    if (!modelPath || !keysPath) throw new Error(`Web OCR (${lang}) is not installed.`);
    const runtime = await loadOrt();
    const session = await runtime.InferenceSession.create(modelPath, sessionOptions());
    const charset = buildCharset(parseKeysFile(await fsp.readFile(keysPath, 'utf8')));
    const rec: Recognizer = { session, charset };
    recognizers.set(lang, rec);
    return rec;
  })();

  recognizerPromises.set(lang, promise);
  try {
    return await promise;
  } catch (err) {
    recognizerPromises.delete(lang);
    throw err;
  } finally {
    recognizerPromises.delete(lang);
  }
}

// ----- image helpers -----------------------------------------------------

interface Bitmap {
  rgba: Buffer;
  width: number;
  height: number;
}

function decodeDataUrl(dataUrl: string): Bitmap {
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) throw new Error('Could not decode the captured image.');
  const { width, height } = img.getSize();
  if (width < 4 || height < 4) throw new Error('Captured image is too small to read.');
  // toBitmap is BGRA on Windows/macOS; convert to RGBA so the tensor math below
  // reads naturally (same conversion mangaOcr.ts does).
  const bgra = img.toBitmap();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    rgba[o] = bgra[o + 2];
    rgba[o + 1] = bgra[o + 1];
    rgba[o + 2] = bgra[o];
    rgba[o + 3] = bgra[o + 3];
  }
  return { rgba, width, height };
}

/** Bilinear sample, clamped at the edges. Returns [r, g, b] in 0–255. */
function sampleBilinear(bmp: Bitmap, x: number, y: number): [number, number, number] {
  const { rgba, width, height } = bmp;
  const cx = Math.min(width - 1, Math.max(0, x));
  const cy = Math.min(height - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(width - 1, x0 + 1);
  const y1 = Math.min(height - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;

  const o00 = (y0 * width + x0) * 4;
  const o10 = (y0 * width + x1) * 4;
  const o01 = (y1 * width + x0) * 4;
  const o11 = (y1 * width + x1) * 4;

  const out: [number, number, number] = [0, 0, 0];
  for (let c = 0; c < 3; c++) {
    const top = rgba[o00 + c] * (1 - fx) + rgba[o10 + c] * fx;
    const bottom = rgba[o01 + c] * (1 - fx) + rgba[o11 + c] * fx;
    out[c] = top * (1 - fy) + bottom * fy;
  }
  return out;
}

/**
 * Copy a box out of the source image into its own bitmap, optionally rotating
 * a vertical line 90° counter-clockwise so it reads left-to-right.
 *
 * Counter-clockwise specifically: tategaki runs top-to-bottom, and CCW puts the
 * top of the column on the left. Rotating the other way reverses the line.
 */
function extractCrop(src: Bitmap, box: DetBox, rotateCcw: boolean): Bitmap {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(src.width, Math.ceil(box.x1));
  const y1 = Math.min(src.height, Math.ceil(box.y1));
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);

  const outW = rotateCcw ? h : w;
  const outH = rotateCcw ? w : h;
  const rgba = Buffer.alloc(outW * outH * 4);

  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      // Inverse map: where in the crop does this output pixel come from?
      const sx = rotateCcw ? w - 1 - y : x;
      const sy = rotateCcw ? x : y;
      const o = (sy + y0) * src.width * 4 + (sx + x0) * 4;
      const d = (y * outW + x) * 4;
      rgba[d] = src.rgba[o];
      rgba[d + 1] = src.rgba[o + 1];
      rgba[d + 2] = src.rgba[o + 2];
      rgba[d + 3] = 255;
    }
  }
  return { rgba, width: outW, height: outH };
}

// ----- detection ---------------------------------------------------------

function detectionGeometry(width: number, height: number): { w: number; h: number; scale: number } {
  const longest = Math.max(width, height);
  // Scale small crops up and huge ones down; both ends hurt DB otherwise.
  let scale = DET_TARGET_SIDE / longest;
  if (longest * scale > DET_MAX_SIDE) scale = DET_MAX_SIDE / longest;
  const round = (v: number) =>
    Math.max(DET_STRIDE, Math.round((v * scale) / DET_STRIDE) * DET_STRIDE);
  return { w: round(width), h: round(height), scale };
}

async function detectBoxes(bmp: Bitmap): Promise<DetBox[]> {
  const session = await ensureDetector();
  const runtime = await loadOrt();
  const { w, h } = detectionGeometry(bmp.width, bmp.height);

  const data = new Float32Array(3 * w * h);
  const plane = w * h;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = sampleBilinear(bmp, ((x + 0.5) * bmp.width) / w - 0.5, ((y + 0.5) * bmp.height) / h - 0.5);
      const i = y * w + x;
      data[i] = (r / 255 - DET_MEAN[0]) / DET_STD[0];
      data[plane + i] = (g / 255 - DET_MEAN[1]) / DET_STD[1];
      data[2 * plane + i] = (b / 255 - DET_MEAN[2]) / DET_STD[2];
    }
  }

  const tensor = new runtime.Tensor('float32', data, [1, 3, h, w]);
  const output = await session.run({ [session.inputNames[0]]: tensor });
  const probTensor = output[session.outputNames[0]];
  const prob = probTensor.data as Float32Array;
  // Output is [1, 1, H, W]; trust the reported dims rather than assuming the
  // map matches the input size.
  const dims = probTensor.dims;
  const mapH = Number(dims[dims.length - 2]);
  const mapW = Number(dims[dims.length - 1]);

  const boxes = dbPostprocess(prob, mapW, mapH, {
    scaleX: bmp.width / mapW,
    scaleY: bmp.height / mapH,
    maxWidth: bmp.width,
    maxHeight: bmp.height,
  });
  return mergeDetBoxes(boxes);
}

// ----- recognition -------------------------------------------------------

async function recognizeCrop(rec: Recognizer, crop: Bitmap): Promise<CtcDecodeResult> {
  const runtime = await loadOrt();
  const ratio = crop.width / Math.max(1, crop.height);
  const w = Math.min(REC_MAX_WIDTH, Math.max(REC_MIN_WIDTH, Math.round(REC_HEIGHT * ratio)));

  const data = new Float32Array(3 * REC_HEIGHT * w);
  const plane = REC_HEIGHT * w;
  for (let y = 0; y < REC_HEIGHT; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b] = sampleBilinear(
        crop,
        ((x + 0.5) * crop.width) / w - 0.5,
        ((y + 0.5) * crop.height) / REC_HEIGHT - 0.5,
      );
      const i = y * w + x;
      // PP-OCR recognition normalises to [-1, 1].
      data[i] = r / 127.5 - 1;
      data[plane + i] = g / 127.5 - 1;
      data[2 * plane + i] = b / 127.5 - 1;
    }
  }

  const tensor = new runtime.Tensor('float32', data, [1, 3, REC_HEIGHT, w]);
  const output = await rec.session.run({ [rec.session.inputNames[0]]: tensor });
  const logits = output[rec.session.outputNames[0]];
  const dims = logits.dims;
  const timeSteps = Number(dims[dims.length - 2]);
  const numClasses = Number(dims[dims.length - 1]);
  return ctcGreedyDecode(logits.data as Float32Array, timeSteps, numClasses, rec.charset);
}

/**
 * Read a tall box, which is ambiguous by shape alone.
 *
 * It is either tategaki — upright glyphs stacked down the page, as in a
 * Japanese heading — or text that is simply rotated, as on a sideways sign.
 * Rotating tategaki upright is exactly wrong: it lays every glyph on its side
 * and the recogniser returns plausible-looking nonsense (世界記録 came back as
 * 中界品板). Reading it both ways and keeping whichever is more confident
 * settles it from evidence instead of guessing.
 */
/**
 * Read one detected box, picking the right strategy for its shape.
 *
 * Tategaki gets one more chance first: DB routinely merges several adjacent
 * columns into a single box (see splitTategakiColumns), and reading such a box
 * as one unit interleaves the columns character by character while still
 * reporting high confidence — measured 0.95 on a novel page that came back as
 * pure noise. Splitting first is what makes vertical text work at all.
 */
async function readBox(rec: Recognizer, bmp: Bitmap, box: DetBox): Promise<CtcDecodeResult> {
  const columns = splitTategakiColumns(bmp, box);
  if (columns) return recognizeColumns(rec, bmp, box, columns);
  return isVerticalBox(box)
    ? recognizeVerticalBox(rec, bmp, box)
    : recognizeCrop(rec, extractCrop(bmp, box, false));
}

/**
 * Read pre-split tategaki columns right-to-left and concatenate them.
 *
 * No separator between columns: they are a single run of text that happened to
 * wrap, so a bubble reading ああッ！！レイリーに並ぶ… must come back as one string.
 */
async function recognizeColumns(
  rec: Recognizer,
  bmp: Bitmap,
  box: DetBox,
  columns: Array<[number, number]>,
): Promise<CtcDecodeResult> {
  let text = '';
  let weighted = 0;
  let chars = 0;
  for (const [x0, x1] of columns) {
    const column: DetBox = { x0, y0: box.y0, x1, y1: box.y1, score: box.score };
    const decoded = await recognizeVerticalBox(rec, bmp, column);
    const piece = decoded.text.trim();
    if (!piece) continue;
    text += piece;
    weighted += decoded.confidence * piece.length;
    chars += piece.length;
  }
  return { text, confidence: chars > 0 ? weighted / chars : 0 };
}

async function recognizeVerticalBox(
  rec: Recognizer,
  bmp: Bitmap,
  box: DetBox,
): Promise<CtcDecodeResult> {
  const rotated = await recognizeCrop(rec, extractCrop(bmp, box, true));
  const stacked = await recognizeStackedColumn(rec, bmp, box);
  return scoreRecognition(stacked) >= scoreRecognition(rotated) ? stacked : rotated;
}

// ----- tategaki column splitting -----------------------------------------
//
// The decision logic lives in shared/tategakiColumns.ts so it can be tested
// against ink profiles captured from real pages; this half just reads pixels.

interface InkProfile {
  /** Inked pixel count for each x within the box. */
  counts: number[];
  /** Left edge of the profile in source-image pixels. */
  x0: number;
  h: number;
}

/**
 * Per-column ink counts across a box.
 *
 * Background is the median luminance rather than an assumed light page, so
 * light-on-dark text profiles correctly — the same assumption
 * segmentColumnRows makes.
 */
function inkColumnProfile(bmp: Bitmap, box: DetBox): InkProfile | null {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(bmp.width, Math.ceil(box.x1));
  const y1 = Math.min(bmp.height, Math.ceil(box.y1));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 8 || h < 8) return null;

  const luminance = new Uint8Array(w * h);
  const histogram = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((y + y0) * bmp.width + (x + x0)) * 4;
      const l =
        (0.299 * bmp.rgba[o] + 0.587 * bmp.rgba[o + 1] + 0.114 * bmp.rgba[o + 2]) | 0;
      luminance[y * w + x] = l;
      histogram[l] += 1;
    }
  }
  const { median: background, range } = histogramStats(histogram, w * h);
  const inkDelta = Math.max(20, range * 0.25);

  const counts: number[] = [];
  for (let x = 0; x < w; x++) {
    let count = 0;
    for (let y = 0; y < h; y++) {
      if (Math.abs(luminance[y * w + x] - background) > inkDelta) count += 1;
    }
    counts.push(count);
  }
  return { counts, x0, h };
}

/**
 * Median and range of a luminance histogram.
 *
 * Collecting every pixel into an array and sorting it is the obvious way to get
 * a median, and it is what this module used to do — but a detected box can cover
 * most of a 1600px page, and a three-million-entry JS array plus a sort of the
 * same is enough to take the process down. Luminance only has 256 possible
 * values, so a histogram gives the same answer in one pass and constant memory.
 */
function histogramStats(histogram: Uint32Array, total: number): { median: number; range: number } {
  let min = 0;
  while (min < 255 && histogram[min] === 0) min += 1;
  let max = 255;
  while (max > 0 && histogram[max] === 0) max -= 1;

  const half = total / 2;
  let seen = 0;
  let median = min;
  for (let v = 0; v <= 255; v++) {
    seen += histogram[v];
    if (seen >= half) {
      median = v;
      break;
    }
  }
  return { median, range: max - min };
}

/** Column boundaries in source-image pixels, or null when this is not tategaki. */
function splitTategakiColumns(bmp: Bitmap, box: DetBox): Array<[number, number]> | null {
  const profile = inkColumnProfile(bmp, box);
  if (!profile) return null;
  const columns = columnsFromInkProfile(profile.counts, profile.h);
  if (!columns) return null;
  return columns.map(([a, b]) => [a + profile.x0, b + profile.x0] as [number, number]);
}

/**
 * Split a column into character rows by looking at where the ink actually is.
 *
 * Deriving the character count from the box's aspect ratio does not work: the
 * detector's boxes are grown outward (see unclip), so the width is inflated by
 * padding and a four-character column measures as three. Ink is the honest
 * signal — the gaps between stacked glyphs are genuinely empty.
 *
 * The background is taken as the median luminance rather than assumed light,
 * so this works on the light-on-dark text that video thumbnails are full of.
 */
function segmentColumnRows(bmp: Bitmap, box: DetBox): Array<[number, number]> {
  const x0 = Math.max(0, Math.floor(box.x0));
  const y0 = Math.max(0, Math.floor(box.y0));
  const x1 = Math.min(bmp.width, Math.ceil(box.x1));
  const y1 = Math.min(bmp.height, Math.ceil(box.y1));
  const w = x1 - x0;
  const h = y1 - y0;
  if (w < 2 || h < 2) return [];

  const luminance = new Uint8Array(w * h);
  const histogram = new Uint32Array(256);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const o = ((y + y0) * bmp.width + (x + x0)) * 4;
      const l =
        (0.299 * bmp.rgba[o] + 0.587 * bmp.rgba[o + 1] + 0.114 * bmp.rgba[o + 2]) | 0;
      luminance[y * w + x] = l;
      histogram[l] += 1;
    }
  }
  const { median: background, range } = histogramStats(histogram, w * h);
  const inkDelta = Math.max(20, range * 0.25);
  const minInkPerRow = Math.max(1, Math.floor(w * 0.04));

  const inked: boolean[] = [];
  for (let y = 0; y < h; y++) {
    let count = 0;
    for (let x = 0; x < w; x++) {
      if (Math.abs(luminance[y * w + x] - background) > inkDelta) count += 1;
    }
    inked.push(count >= minInkPerRow);
  }

  const runs: Array<[number, number]> = [];
  let start = -1;
  for (let y = 0; y <= h; y++) {
    if (y < h && inked[y]) {
      if (start < 0) start = y;
    } else if (start >= 0) {
      runs.push([start, y]);
      start = -1;
    }
  }
  if (!runs.length) return [];

  // Stitch parts of one glyph back together: some kanji have a vertically
  // detached component that reads as its own short run.
  //
  // The height cap is what makes this safe. Judging by gap alone fails badly —
  // the space between stacked characters is smaller than a glyph's own height,
  // so a gap-only rule swallows the entire column into one run and the crop
  // degenerates to an unreadable sliver. A merge that would produce something
  // taller than a single character is therefore refused outright.
  const heights = runs.map(([a, b]) => b - a).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  const maxGap = medianHeight * 0.5;
  const maxMergedHeight = medianHeight * 1.35;
  const merged: Array<[number, number]> = [runs[0]];
  for (let i = 1; i < runs.length; i++) {
    const prev = merged[merged.length - 1];
    const gap = runs[i][0] - prev[1];
    const combined = runs[i][1] - prev[0];
    if (gap <= maxGap && combined <= maxMergedHeight) prev[1] = runs[i][1];
    else merged.push(runs[i]);
  }

  // Drop specks that survived the merge.
  return merged
    .filter(([a, b]) => b - a >= medianHeight * 0.4)
    .map(([a, b]) => [a + y0, b + y0] as [number, number]);
}

/**
 * Read a column as upright glyphs, one character at a time.
 */
async function recognizeStackedColumn(
  rec: Recognizer,
  bmp: Bitmap,
  box: DetBox,
): Promise<CtcDecodeResult> {
  const rows = segmentColumnRows(bmp, box);
  if (rows.length < 2) return recognizeCrop(rec, extractCrop(bmp, box, false));

  let text = '';
  let confidenceSum = 0;
  let read = 0;

  for (const [top, bottom] of rows) {
    // Pad each cell slightly: the recogniser was trained on text with margin,
    // and a glyph cropped flush to its own ink reads noticeably worse.
    const pad = (bottom - top) * 0.12;
    const cell: DetBox = {
      x0: box.x0,
      y0: top - pad,
      x1: box.x1,
      y1: bottom + pad,
      score: box.score,
    };
    const decoded = await recognizeCrop(rec, extractCrop(bmp, cell, false));
    const ch = decoded.text.trim();
    if (!ch) continue;
    text += ch;
    confidenceSum += decoded.confidence;
    read += 1;
  }

  return { text, confidence: read > 0 ? confidenceSum / read : 0 };
}

/**
 * Work out which language a crop is in by reading a few lines with each
 * installed recogniser and keeping the one that explains them best.
 *
 * Confidence alone is not enough — a recogniser fed the wrong script tends to
 * emit one very confident character — so scoreRecognition() weights confidence
 * by how much text came out.
 */
async function pickLanguage(
  bmp: Bitmap,
  boxes: DetBox[],
  langHint: PaddleLang | undefined,
  candidates: PaddleLang[],
): Promise<PaddleLang> {
  if (candidates.length === 1) return candidates[0];

  // Probe the highest-scoring boxes; they are the most likely to be real text.
  const sample = boxes
    .slice()
    .sort((a, b) => b.score - a.score)
    .slice(0, LANG_PROBE_BOXES);
  if (!sample.length) return langHint && candidates.includes(langHint) ? langHint : candidates[0];

  const scoreLang = async (lang: PaddleLang): Promise<number> => {
    try {
      const rec = await ensureRecognizer(lang);
      let total = 0;
      for (const box of sample) total += scoreRecognition(await readBox(rec, bmp, box));
      return total / sample.length;
    } catch {
      // A language that fails to load simply loses the comparison.
      return -1;
    }
  };

  let best: PaddleLang | null = null;
  let bestScore = -Infinity;

  // Take the hint at its word unless it cannot read the image — that is the
  // only case the probe is actually competent to overrule (see HINT_ACCEPT_SCORE).
  if (langHint) {
    const hintScore = await scoreLang(langHint);
    if (hintScore >= HINT_ACCEPT_SCORE) return langHint;
    best = langHint;
    bestScore = hintScore;
  }

  for (const lang of candidates) {
    if (lang === langHint) continue;
    const score = await scoreLang(lang);
    if (score > bestScore) {
      bestScore = score;
      best = lang;
    }
  }
  return best ?? candidates[0];
}

// ----- public API --------------------------------------------------------

/**
 * Detect and read every line of text in a captured image.
 *
 * `langHint` is the caller's guess (usually the active study language); it is
 * tried first and short-circuits the probe when it reads the image well.
 */
export async function recognizePaddleOcrDataUrl(
  dataUrl: string,
  opts: { langHint?: PaddleLang; forceLang?: PaddleLang } = {},
): Promise<PaddleOcrResult> {
  const candidates = installedPaddleLangs();
  if (!isInstalled(DET_ASSET) || !candidates.length) {
    throw new Error('Web OCR models are not installed.');
  }

  const bmp = decodeDataUrl(dataUrl);
  const boxes = await detectBoxes(bmp);
  const langHint = opts.langHint && candidates.includes(opts.langHint) ? opts.langHint : undefined;
  // `forceLang` pins the recognizer to a known language and skips the probe. The
  // auto-picker exists for the extension, which OCRs pages of unknown language;
  // a caller that already knows the language (the Reading Lens uses the study
  // language) must not be second-guessed — on hard, low-res text the probe can
  // otherwise mis-score and pick e.g. the Cyrillic head for Japanese manga.
  const forced = opts.forceLang && candidates.includes(opts.forceLang) ? opts.forceLang : undefined;

  if (!boxes.length) {
    return { text: '', lang: forced ?? langHint ?? candidates[0], lines: [] };
  }

  const lang = forced ?? (await pickLanguage(bmp, boxes, langHint, candidates));
  const rec = await ensureRecognizer(lang);

  // Whether the crop as a whole is vertical decides reading order; individual
  // boxes still rotate on their own shape.
  const verticalCount = boxes.filter((b) => isVerticalBox(b)).length;
  const mostlyVertical = verticalCount * 2 > boxes.length;
  const ordered = orderDetBoxes(boxes, { vertical: mostlyVertical });

  const lines: PaddleOcrLine[] = [];
  for (const box of ordered) {
    const vertical = isVerticalBox(box);
    const decoded = await readBox(rec, bmp, box);
    const text = decoded.text.trim();
    if (!text || decoded.confidence < MIN_LINE_CONFIDENCE) continue;
    lines.push({
      text,
      box: [box.x0, box.y0, box.x1, box.y1],
      vertical,
      confidence: decoded.confidence,
    });
  }

  return { text: lines.map((l) => l.text).join('\n'), lang, lines };
}
