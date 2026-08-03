/**
 * Main-process manga OCR: comic-text-detector → optional dewarp → manga-ocr
 * (encoder + decoder ONNX) → Mokuro-compatible JSON cache.
 *
 * Models arrive via the Phase 6 download manager (assetPath / isInstalled).
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { BrowserWindow, ipcMain, nativeImage, type NativeImage } from 'electron';
import type * as OrtNamespace from 'onnxruntime-node';
import {
  assetPath,
  isInstalled,
  registerAssetUnloadHandler,
} from './downloads';
import { itemDir, listMangaPageUrls, updateLibraryOcrMeta } from './library';
import {
  MOKURO_EMIT_VERSION,
  parseMokuroPage,
  regionIdFromBox,
  type MokuroBlock,
  type MokuroBox,
  type MokuroPage,
} from '../shared/mokuroTypes';
import type {
  MangaOcrAddRegionRequest,
  MangaOcrCorrectionRequest,
  MangaOcrMergeRequest,
  MangaOcrOrderRequest,
  MangaOcrProgress,
  MangaOcrRegionRescanRequest,
  MangaOcrScanRequest,
  MangaOcrSplitRequest,
  MangaOcrVolumeProgress,
  MangaOcrVolumeRequest,
  DetectionSensitivity,
} from '../shared/mangaOcrIpc';
import {
  classifyRegionKind,
  guessVertical,
  isJunkMangaOcrText,
  postprocessMangaOcrText,
  shouldDewarp,
} from '../shared/mangaOcrText';
import { sequenceConfidence, tokenProbability } from '../shared/ocrConfidence';
import { sortReadingOrder } from '../shared/readingOrder';
import { isTranslateAvailable, runTranslationBatch } from './translate';
import type { LibraryItem } from '../shared/types';

export type {
  MangaOcrAddRegionRequest,
  MangaOcrCorrectionRequest,
  MangaOcrMergeRequest,
  MangaOcrOrderRequest,
  MangaOcrProgress,
  MangaOcrRegionRescanRequest,
  MangaOcrScanRequest,
  MangaOcrSplitRequest,
};

const MIN_MANUAL_REGION_PX = 8;

type Ort = typeof OrtNamespace;
let ort: Ort | null = null;

async function loadOrt(): Promise<Ort> {
  if (!ort) ort = await import('onnxruntime-node');
  return ort;
}

const ASSET_IDS = [
  'manga-ocr',
  'manga-ocr-decoder',
  'manga-ocr-vocab',
  'comic-text-detector',
] as const;

const DETECT_SIZE = 1024;
const OCR_SIZE = 224;
const BOS = 2;
const EOS = 3;
const MAX_TOKENS = 300;

// ----- sessions ----------------------------------------------------------

let encoder: OrtNamespace.InferenceSession | null = null;
let decoder: OrtNamespace.InferenceSession | null = null;
let detector: OrtNamespace.InferenceSession | null = null;
let vocab: string[] | null = null;
let loadPromise: Promise<void> | null = null;
let unloadRegistered = false;

export function mangaOcrAvailable(): boolean {
  return ASSET_IDS.every((id) => isInstalled(id));
}

async function unloadSessions(): Promise<void> {
  const sessions = [encoder, decoder, detector];
  encoder = decoder = detector = null;
  vocab = null;
  loadPromise = null;
  for (const s of sessions) {
    try {
      await s?.release();
    } catch {
      // ignore
    }
  }
}

function ensureUnloadHandlers(): void {
  if (unloadRegistered) return;
  unloadRegistered = true;
  for (const id of ASSET_IDS) {
    registerAssetUnloadHandler(id, () => unloadSessions());
  }
}

async function ensureModels(): Promise<void> {
  ensureUnloadHandlers();
  if (encoder && decoder && detector && vocab) return;
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    if (!mangaOcrAvailable()) {
      throw new Error('Manga OCR models are not installed.');
    }
    const encPath = assetPath('manga-ocr');
    const decPath = assetPath('manga-ocr-decoder');
    const vocabPath = assetPath('manga-ocr-vocab');
    const detPath = assetPath('comic-text-detector');
    if (!encPath || !decPath || !vocabPath || !detPath) {
      throw new Error('Manga OCR model paths missing.');
    }
    const runtime = await loadOrt();
    const opts: OrtNamespace.InferenceSession.SessionOptions = {
      executionProviders: ['cpu'],
      graphOptimizationLevel: 'all',
    };
    encoder = await runtime.InferenceSession.create(encPath, opts);
    decoder = await runtime.InferenceSession.create(decPath, opts);
    detector = await runtime.InferenceSession.create(detPath, opts);
    vocab = (await fsp.readFile(vocabPath, 'utf8')).split(/\r?\n/);
  })();
  try {
    await loadPromise;
  } catch (err) {
    loadPromise = null;
    throw err;
  }
}

// ----- image helpers -----------------------------------------------------

function resolveMediaPath(mediaUrl: string): { itemId: string; full: string; stem: string } | null {
  const m = /^media:\/\/([^/]+)\/(.+)$/.exec(mediaUrl);
  if (!m) return null;
  const itemId = decodeURIComponent(m[1]);
  const rel = decodeURIComponent(m[2]);
  if (rel.includes('..')) return null;
  const full = path.join(itemDir(itemId), rel);
  if (!fs.existsSync(full)) return null;
  return { itemId, full, stem: path.parse(rel).name };
}

function loadPageImage(full: string): { img: NativeImage; width: number; height: number; rgba: Buffer } {
  const img = nativeImage.createFromPath(full);
  if (img.isEmpty()) throw new Error('Could not decode page image.');
  const { width, height } = img.getSize();
  // toBitmap is BGRA on Windows/macOS; convert to RGBA for easier math.
  const bgra = img.toBitmap();
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const o = i * 4;
    rgba[o] = bgra[o + 2];
    rgba[o + 1] = bgra[o + 1];
    rgba[o + 2] = bgra[o];
    rgba[o + 3] = bgra[o + 3];
  }
  return { img, width, height, rgba };
}

function sampleRgba(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
): [number, number, number] {
  const xi = Math.min(srcW - 1, Math.max(0, Math.round(x)));
  const yi = Math.min(srcH - 1, Math.max(0, Math.round(y)));
  const o = (yi * srcW + xi) * 4;
  return [rgba[o], rgba[o + 1], rgba[o + 2]];
}

/** Letterbox RGB float CHW tensor for the detector (0–1). */
function letterboxTensor(
  runtime: Ort,
  rgba: Buffer,
  srcW: number,
  srcH: number,
  size: number,
): { tensor: OrtNamespace.Tensor; ratio: number; padX: number; padY: number } {
  const ratio = Math.min(size / srcW, size / srcH);
  const newW = Math.round(srcW * ratio);
  const newH = Math.round(srcH * ratio);
  const padX = Math.floor((size - newW) / 2);
  const padY = Math.floor((size - newH) / 2);
  const data = new Float32Array(3 * size * size);
  // fill gray letterbox
  data.fill(0.5);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      const sx = (x + 0.5) / ratio - 0.5;
      const sy = (y + 0.5) / ratio - 0.5;
      const [r, g, b] = sampleRgba(rgba, srcW, srcH, sx, sy);
      const dx = x + padX;
      const dy = y + padY;
      data[0 * size * size + dy * size + dx] = r / 255;
      data[1 * size * size + dy * size + dx] = g / 255;
      data[2 * size * size + dy * size + dx] = b / 255;
    }
  }
  return {
    tensor: new runtime.Tensor('float32', data, [1, 3, size, size]),
    ratio,
    padX,
    padY,
  };
}

/** manga-ocr preprocess: gray→RGB, 224×224, normalize (x-0.5)/0.5. */
function mangaOcrTensorFromCrop(
  runtime: Ort,
  rgba: Buffer,
  srcW: number,
  srcH: number,
  box: MokuroBox,
  rotateDeg = 0,
): OrtNamespace.Tensor {
  const [xmin, ymin, xmax, ymax] = box;
  const bw = Math.max(1, xmax - xmin);
  const bh = Math.max(1, ymax - ymin);
  const data = new Float32Array(3 * OCR_SIZE * OCR_SIZE);
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  for (let y = 0; y < OCR_SIZE; y++) {
    for (let x = 0; x < OCR_SIZE; x++) {
      // map into crop local coords, optionally rotate around crop center
      const lx = (x / OCR_SIZE) * bw - bw / 2;
      const ly = (y / OCR_SIZE) * bh - bh / 2;
      const rx = lx * cos - ly * sin;
      const ry = lx * sin + ly * cos;
      const sx = cx + rx;
      const sy = cy + ry;
      const [r, g, b] = sampleRgba(rgba, srcW, srcH, sx, sy);
      // grayscale then RGB (manga-ocr training path)
      const gray = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
      const v = (gray - 0.5) / 0.5;
      data[0 * OCR_SIZE * OCR_SIZE + y * OCR_SIZE + x] = v;
      data[1 * OCR_SIZE * OCR_SIZE + y * OCR_SIZE + x] = v;
      data[2 * OCR_SIZE * OCR_SIZE + y * OCR_SIZE + x] = v;
    }
  }
  return new runtime.Tensor('float32', data, [1, 3, OCR_SIZE, OCR_SIZE]);
}

// ----- detection (simplified CTD mask → boxes) ---------------------------

/**
 * Detection tunables per sensitivity. Higher sensitivity lowers every gate so
 * fainter / smaller / lower-scoring bubbles survive — the fix for "it doesn't
 * scan everything" — at the cost of occasional false boxes (removable by hand,
 * or by lowering sensitivity). `low` reproduces the original conservative gates.
 */
interface DetectTuning {
  /** Added to the mask mean to form the binarization threshold. */
  threshOffset: number;
  /** Minimum binarization threshold. */
  threshFloor: number;
  /** Minimum connected-component size in mask pixels. */
  ccMinArea: number;
  /** Minimum region width/height in page pixels. */
  minSidePx: number;
  /** Minimum region area as a fraction of the whole page. */
  minAreaFrac: number;
  /** Minimum mask score to keep a region. */
  minScore: number;
  /** Max regions kept after the area sort. */
  maxRegions: number;
}

/** Original conservative gates — the default when a caller/test passes no tuning. */
const LEGACY_TUNING: DetectTuning = {
  threshOffset: 0.22,
  threshFloor: 0.32,
  ccMinArea: 100,
  minSidePx: 16,
  minAreaFrac: 0.00045,
  minScore: 0.2,
  maxRegions: 48,
};

export function detectTuning(sensitivity: DetectionSensitivity = 'normal'): DetectTuning {
  switch (sensitivity) {
    case 'low':
      return LEGACY_TUNING;
    case 'high':
      return {
        threshOffset: 0.06,
        threshFloor: 0.2,
        ccMinArea: 40,
        minSidePx: 10,
        minAreaFrac: 0.00018,
        minScore: 0.08,
        maxRegions: 96,
      };
    case 'normal':
    default:
      return {
        threshOffset: 0.13,
        threshFloor: 0.26,
        ccMinArea: 70,
        minSidePx: 12,
        minAreaFrac: 0.0003,
        minScore: 0.14,
        maxRegions: 64,
      };
  }
}

export interface DetectedRegion {
  box: MokuroBox;
  score: number;
  points: Array<{ x: number; y: number }>;
}

function boxArea(box: MokuroBox): number {
  return Math.max(0, box[2] - box[0]) * Math.max(0, box[3] - box[1]);
}

function boxIntersectionArea(a: MokuroBox, b: MokuroBox): number {
  const x0 = Math.max(a[0], b[0]);
  const y0 = Math.max(a[1], b[1]);
  const x1 = Math.min(a[2], b[2]);
  const y1 = Math.min(a[3], b[3]);
  return Math.max(0, x1 - x0) * Math.max(0, y1 - y0);
}

/**
 * Union any pair of regions whose boxes overlap heavily (IoU > 0.5, or the
 * smaller box is >85% contained in the larger). Flood-fill detection can
 * split one visual bubble into two adjacent connected components (e.g. a
 * furigana gap breaking the mask); this collapses those duplicates before
 * OCR runs on each, rather than emitting two overlapping/duplicate regions.
 */
export function mergeOverlappingRegions(regions: DetectedRegion[]): DetectedRegion[] {
  const out: DetectedRegion[] = regions.map((r) => ({ ...r, box: [...r.box] as MokuroBox }));
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        const inter = boxIntersectionArea(a.box, b.box);
        if (inter <= 0) continue;
        const areaA = boxArea(a.box);
        const areaB = boxArea(b.box);
        const union = areaA + areaB - inter;
        const iou = union > 0 ? inter / union : 0;
        const smaller = Math.min(areaA, areaB);
        const containment = smaller > 0 ? inter / smaller : 0;
        if (iou > 0.5 || containment > 0.85) {
          const box: MokuroBox = [
            Math.min(a.box[0], b.box[0]),
            Math.min(a.box[1], b.box[1]),
            Math.max(a.box[2], b.box[2]),
            Math.max(a.box[3], b.box[3]),
          ];
          const points = [
            { x: box[0], y: box[1] },
            { x: box[2], y: box[1] },
            { x: box[2], y: box[3] },
            { x: box[0], y: box[3] },
          ];
          out.splice(j, 1);
          out.splice(i, 1, { box, score: Math.max(a.score, b.score), points });
          mergedAny = true;
          break outer;
        }
      }
    }
  }
  return out;
}

/** Edge gap between two axis-aligned boxes (0 if they touch/overlap). */
function boxGap(a: MokuroBox, b: MokuroBox): number {
  const dx = Math.max(0, Math.max(a[0], b[0]) - Math.min(a[2], b[2]));
  const dy = Math.max(0, Math.max(a[1], b[1]) - Math.min(a[3], b[3]));
  return Math.hypot(dx, dy);
}

/**
 * Merge fragments that sit close together (same bubble / column) even when
 * they don't overlap. Caps union growth so distant page regions stay separate.
 */
export function mergeNearbyRegions(regions: DetectedRegion[], gapPx = 14): DetectedRegion[] {
  const out: DetectedRegion[] = regions.map((r) => ({ ...r, box: [...r.box] as MokuroBox }));
  let mergedAny = true;
  while (mergedAny) {
    mergedAny = false;
    outer: for (let i = 0; i < out.length; i++) {
      for (let j = i + 1; j < out.length; j++) {
        const a = out[i];
        const b = out[j];
        if (boxGap(a.box, b.box) > gapPx) continue;
        const box: MokuroBox = [
          Math.min(a.box[0], b.box[0]),
          Math.min(a.box[1], b.box[1]),
          Math.max(a.box[2], b.box[2]),
          Math.max(a.box[3], b.box[3]),
        ];
        // Reject merges that explode into a huge box spanning unrelated areas.
        const areaA = boxArea(a.box);
        const areaB = boxArea(b.box);
        const unionArea = boxArea(box);
        if (unionArea > (areaA + areaB) * 3.5 && unionArea > Math.max(areaA, areaB) * 4) continue;
        const points = [
          { x: box[0], y: box[1] },
          { x: box[2], y: box[1] },
          { x: box[2], y: box[3] },
          { x: box[0], y: box[3] },
        ];
        out.splice(j, 1);
        out.splice(i, 1, { box, score: Math.max(a.score, b.score), points });
        mergedAny = true;
        break outer;
      }
    }
  }
  return out;
}

/** Drop speckles that are too small in page pixels or too weak by mask score. */
export function filterWeakRegions(
  regions: DetectedRegion[],
  pageW: number,
  pageH: number,
  tuning: DetectTuning = LEGACY_TUNING,
): DetectedRegion[] {
  const pageArea = Math.max(1, pageW * pageH);
  return regions.filter((r) => {
    const w = r.box[2] - r.box[0];
    const h = r.box[3] - r.box[1];
    if (w < tuning.minSidePx || h < tuning.minSidePx) return false;
    if (Math.min(w, h) < Math.max(8, tuning.minSidePx - 4)) return false;
    if (w * h < pageArea * tuning.minAreaFrac) return false;
    if (r.score < tuning.minScore) return false;
    return true;
  });
}

/**
 * Compose the detection post-processing pipeline: drop weak speckles, cap
 * runaway detections by area, merge nearby + overlapping fragments, then
 * sort into approximate manga reading order.
 */
export function finalizeRegions(
  regions: DetectedRegion[],
  pageW = 0,
  pageH = 0,
  tuning: DetectTuning = LEGACY_TUNING,
): DetectedRegion[] {
  const sized =
    pageW > 0 && pageH > 0 ? filterWeakRegions(regions, pageW, pageH, tuning) : regions.slice();
  const capped = sized
    .sort((a, b) => boxArea(b.box) - boxArea(a.box))
    .slice(0, tuning.maxRegions);
  const nearby = mergeNearbyRegions(capped, 14);
  const merged = mergeOverlappingRegions(nearby);
  return sortReadingOrder(merged);
}

function pick2dMask(outputs: OrtNamespace.Tensor[]): Float32Array | null {
  // Prefer the output whose spatial size is closest to DETECT_SIZE²
  let best: { t: ort.Tensor; score: number } | null = null;
  for (const t of outputs) {
    if (t.dims.length < 2) continue;
    const h = t.dims[t.dims.length - 2];
    const w = t.dims[t.dims.length - 1];
    if (h < 32 || w < 32) continue;
    const score = 1 / (1 + Math.abs(h - DETECT_SIZE) + Math.abs(w - DETECT_SIZE));
    if (!best || score > best.score) best = { t, score };
  }
  if (!best) return null;
  const t = best.t;
  const data = t.data as Float32Array;
  // If multi-channel, take channel 0 / last channel mean
  const h = t.dims[t.dims.length - 2];
  const w = t.dims[t.dims.length - 1];
  const spatial = h * w;
  if (data.length === spatial) return data;
  // average across leading batch/channel dims into one HxW
  const planes = Math.floor(data.length / spatial);
  const out = new Float32Array(spatial);
  for (let p = 0; p < planes; p++) {
    for (let i = 0; i < spatial; i++) out[i] += data[p * spatial + i];
  }
  for (let i = 0; i < spatial; i++) out[i] /= planes;
  return out;
}

function connectedComponents(
  mask: Float32Array,
  mh: number,
  mw: number,
  thresh: number,
  minArea = 100,
): Array<{ minX: number; minY: number; maxX: number; maxY: number; area: number; cx: number; cy: number }> {
  const visited = new Uint8Array(mh * mw);
  const regions: Array<{
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    area: number;
    cx: number;
    cy: number;
  }> = [];
  const qx = new Int32Array(mh * mw);
  const qy = new Int32Array(mh * mw);

  for (let y = 0; y < mh; y++) {
    for (let x = 0; x < mw; x++) {
      const i = y * mw + x;
      if (visited[i] || mask[i] < thresh) continue;
      let head = 0;
      let tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail++;
      visited[i] = 1;
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;
      let sx = 0;
      let sy = 0;
      while (head < tail) {
        const cx0 = qx[head];
        const cy0 = qy[head];
        head++;
        area++;
        sx += cx0;
        sy += cy0;
        minX = Math.min(minX, cx0);
        maxX = Math.max(maxX, cx0);
        minY = Math.min(minY, cy0);
        maxY = Math.max(maxY, cy0);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx0 + dx;
          const ny = cy0 + dy;
          if (nx < 0 || ny < 0 || nx >= mw || ny >= mh) continue;
          const ni = ny * mw + nx;
          if (visited[ni] || mask[ni] < thresh) continue;
          visited[ni] = 1;
          qx[tail] = nx;
          qy[tail] = ny;
          tail++;
        }
      }
      if (area < minArea) continue;
      regions.push({
        minX,
        minY,
        maxX,
        maxY,
        area,
        cx: sx / area,
        cy: sy / area,
      });
    }
  }
  return regions;
}

async function detectRegions(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  sensitivity?: DetectionSensitivity,
): Promise<DetectedRegion[]> {
  const tuning = detectTuning(sensitivity);
  if (!detector) throw new Error('Detector not loaded');
  const runtime = await loadOrt();
  const { tensor, ratio, padX, padY } = letterboxTensor(runtime, rgba, srcW, srcH, DETECT_SIZE);
  const inputName = detector.inputNames[0];
  const feeds: Record<string, OrtNamespace.Tensor> = { [inputName]: tensor };
  const outMap = await detector.run(feeds);
  const outs = detector.outputNames.map((n) => outMap[n]);
  const maskData = pick2dMask(outs);
  if (!maskData) {
    // Whole-page fallback so OCR still runs when outputs are unexpected.
    return [
      {
        box: [0, 0, srcW, srcH],
        score: 0.3,
        points: [
          { x: 0, y: 0 },
          { x: srcW, y: 0 },
          { x: srcW, y: srcH },
          { x: 0, y: srcH },
        ],
      },
    ];
  }
  // Infer spatial dims from the tensor we picked
  let mh = DETECT_SIZE;
  let mw = DETECT_SIZE;
  for (const t of outs) {
    if ((t.data as Float32Array) === maskData || t.data === maskData) {
      mh = t.dims[t.dims.length - 2];
      mw = t.dims[t.dims.length - 1];
      break;
    }
  }
  // If pick2dMask averaged, dims may not match identity — use sqrt
  if (mh * mw !== maskData.length) {
    mh = Math.round(Math.sqrt(maskData.length));
    mw = Math.floor(maskData.length / mh);
  }

  // Adaptive threshold from mean; the offset/floor come from the sensitivity
  // tuning (higher sensitivity → lower gate → more faint text survives).
  let sum = 0;
  for (let i = 0; i < maskData.length; i++) sum += maskData[i];
  const mean = sum / maskData.length;
  const thresh = Math.max(tuning.threshFloor, Math.min(0.65, mean + tuning.threshOffset));

  const comps = connectedComponents(maskData, mh, mw, thresh, tuning.ccMinArea);
  const scaleX = srcW / Math.max(1, mw - padX * 2 * (mw / DETECT_SIZE));
  // Map letterboxed mask coords → original image
  const regions: DetectedRegion[] = [];
  for (const c of comps) {
    const mapX = (x: number) => (x - padX * (mw / DETECT_SIZE)) / ratio;
    const mapY = (y: number) => (y - padY * (mh / DETECT_SIZE)) / ratio;
    // Simpler: mask is letterboxed at DETECT_SIZE; if mh!=DETECT_SIZE, scale first
    const toSrcX = (x: number) => {
      const atDetect = (x / mw) * DETECT_SIZE;
      return (atDetect - padX) / ratio;
    };
    const toSrcY = (y: number) => {
      const atDetect = (y / mh) * DETECT_SIZE;
      return (atDetect - padY) / ratio;
    };
    let xmin = toSrcX(c.minX);
    let ymin = toSrcY(c.minY);
    let xmax = toSrcX(c.maxX + 1);
    let ymax = toSrcY(c.maxY + 1);
    xmin = Math.max(0, Math.min(srcW - 1, xmin));
    ymin = Math.max(0, Math.min(srcH - 1, ymin));
    xmax = Math.max(xmin + 1, Math.min(srcW, xmax));
    ymax = Math.max(ymin + 1, Math.min(srcH, ymax));
    // pad slightly
    const pad = 2;
    xmin = Math.max(0, xmin - pad);
    ymin = Math.max(0, ymin - pad);
    xmax = Math.min(srcW, xmax + pad);
    ymax = Math.min(srcH, ymax + pad);
    void scaleX;
    void mapX;
    void mapY;
    regions.push({
      box: [xmin, ymin, xmax, ymax],
      score: Math.min(1, c.area / 500),
      points: [
        { x: xmin, y: ymin },
        { x: xmax, y: ymin },
        { x: xmax, y: ymax },
        { x: xmin, y: ymax },
      ],
    });
  }
  // Cap by area, merge nearby/overlapping fragments, drop speckles, sort.
  return finalizeRegions(regions, srcW, srcH, tuning);
}

// ----- manga-ocr recognize -----------------------------------------------

/** Decoded text plus how confident the decoder was, 0-1. */
interface MangaCropRead {
  text: string;
  confidence: number;
}

async function recognizeCrop(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  box: MokuroBox,
  points: Array<{ x: number; y: number }>,
): Promise<MangaCropRead> {
  if (!encoder || !decoder || !vocab) throw new Error('OCR models not loaded');
  const runtime = await loadOrt();

  let rotateDeg = 0;
  if (shouldDewarp(points)) {
    // Rotation-only dewarp from first→last chord angle (no-op when nearly axis-aligned).
    const a = points[0];
    const b = points[points.length - 1];
    const ang = (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    if (Math.abs(ang) > 8 && Math.abs(Math.abs(ang) - 90) > 8) {
      rotateDeg = -ang;
    }
  }

  const pixelValues = mangaOcrTensorFromCrop(runtime, rgba, srcW, srcH, box, rotateDeg);
  const encIn = encoder.inputNames[0];
  const encOut = await encoder.run({ [encIn]: pixelValues });
  const hiddenName = encoder.outputNames[0];
  const hidden = encOut[hiddenName];

  const tokenIds = [BOS];
  // Probability the decoder assigned to each token it actually chose. These are
  // what make a real confidence score possible — see shared/ocrConfidence.ts.
  const tokenProbs: number[] = [];
  let finished = false;
  const decInIds = decoder.inputNames.find((n) => /input_ids/i.test(n)) ?? decoder.inputNames[1];
  const decInHidden =
    decoder.inputNames.find((n) => /hidden/i.test(n)) ?? decoder.inputNames[0];

  for (let step = 0; step < MAX_TOKENS; step++) {
    const ids = BigInt64Array.from(tokenIds.map((t) => BigInt(t)));
    const inputIds = new runtime.Tensor('int64', ids, [1, tokenIds.length]);
    const logitsOut = await decoder.run({
      [decInHidden]: hidden,
      [decInIds]: inputIds,
    });
    const logits = logitsOut[decoder.outputNames[0]];
    const data = logits.data as Float32Array;
    const vocabSize = logits.dims[logits.dims.length - 1];
    const lastRow = (logits.dims[1] - 1) * vocabSize;
    let best = 0;
    let bestV = -Infinity;
    for (let i = 0; i < vocabSize; i++) {
      const v = data[lastRow + i];
      if (v > bestV) {
        bestV = v;
        best = i;
      }
    }
    tokenIds.push(best);
    tokenProbs.push(tokenProbability(data, lastRow, vocabSize, best));
    if (best === EOS) {
      finished = true;
      break;
    }
  }

  let text = '';
  for (const id of tokenIds) {
    if (id < 5) continue;
    text += vocab[id] ?? '';
  }
  return {
    text: postprocessMangaOcrText(text),
    // Never finishing means the token ceiling was hit, which in practice is a
    // repetition loop; sequenceConfidence caps those rather than rewarding them.
    confidence: sequenceConfidence(tokenProbs, { truncated: !finished }),
  };
}

// ----- cache / corrections -----------------------------------------------

function ocrDir(itemId: string): string {
  return path.join(itemDir(itemId), '_ocr');
}

function cachePath(itemId: string, stem: string): string {
  return path.join(ocrDir(itemId), `${stem}.json`);
}

function correctionsPath(itemId: string, stem: string): string {
  return path.join(ocrDir(itemId), `${stem}.corrections.json`);
}

function translateCachePath(itemId: string, stem: string, lang: string): string {
  const safe = lang.replace(/[^a-z0-9_-]/gi, '') || 'en';
  return path.join(ocrDir(itemId), `${stem}.tr.${safe}.json`);
}

export interface CorrectionEntry {
  lines?: string[];
  kind?: MokuroBlockKind;
  vertical?: boolean;
  order?: number;
}
export type CorrectionMap = Record<string, CorrectionEntry>;

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

export async function readCorrections(itemId: string, stem: string): Promise<CorrectionMap> {
  const p = correctionsPath(itemId, stem);
  try {
    const raw = JSON.parse(await fsp.readFile(p, 'utf8')) as unknown;
    if (!raw || typeof raw !== 'object') return {};
    const out: CorrectionMap = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      // Legacy shape: a bare string[] of corrected lines (pre-schema-extension).
      if (isStringArray(v)) {
        out[k] = { lines: v };
        continue;
      }
      if (!v || typeof v !== 'object') continue;
      const entry = v as Record<string, unknown>;
      const parsed: CorrectionEntry = {};
      if (isStringArray(entry.lines)) parsed.lines = entry.lines;
      if (entry.kind === 'text' || entry.kind === 'sfx' || entry.kind === 'ignore') parsed.kind = entry.kind;
      if (typeof entry.vertical === 'boolean') parsed.vertical = entry.vertical;
      if (typeof entry.order === 'number' && Number.isFinite(entry.order)) parsed.order = entry.order;
      if (Object.keys(parsed).length) out[k] = parsed;
    }
    return out;
  } catch {
    return {};
  }
}

export async function writeCorrections(itemId: string, stem: string, map: CorrectionMap): Promise<void> {
  await fsp.mkdir(ocrDir(itemId), { recursive: true });
  await fsp.writeFile(correctionsPath(itemId, stem), JSON.stringify(map, null, 2), 'utf8');
}

export function applyCorrections(page: MokuroPage, map: CorrectionMap): MokuroPage {
  if (!Object.keys(map).length) return page;
  return {
    ...page,
    blocks: page.blocks.map((b) => {
      const id = b.regionId;
      const entry = id ? map[id] : undefined;
      if (!entry) return b;
      return {
        ...b,
        ...(entry.lines ? { lines: [...entry.lines] } : null),
        ...(entry.kind ? { kind: entry.kind } : null),
        ...(entry.vertical !== undefined ? { vertical: entry.vertical } : null),
        ...(entry.order !== undefined ? { order: entry.order } : null),
      };
    }),
  };
}

async function writeCache(itemId: string, stem: string, page: MokuroPage): Promise<void> {
  await fsp.mkdir(ocrDir(itemId), { recursive: true });
  await fsp.writeFile(cachePath(itemId, stem), JSON.stringify(page, null, 2), 'utf8');
}

export async function loadMangaOcrCache(itemId: string, mediaUrl: string): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(mediaUrl);
  if (!resolved || resolved.itemId !== itemId) return null;
  const p = cachePath(itemId, resolved.stem);
  try {
    const raw = JSON.parse(await fsp.readFile(p, 'utf8')) as unknown;
    const page = parseMokuroPage(raw);
    const corrections = await readCorrections(itemId, resolved.stem);
    return applyCorrections(page, corrections);
  } catch {
    return null;
  }
}

export async function loadMangaOcrTranslateCache(
  itemId: string,
  mediaUrl: string,
  targetLang: string,
): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(mediaUrl);
  if (!resolved || resolved.itemId !== itemId) return null;
  try {
    const raw = JSON.parse(
      await fsp.readFile(translateCachePath(itemId, resolved.stem, targetLang), 'utf8'),
    ) as { page?: unknown };
    if (!raw?.page) return null;
    return parseMokuroPage(raw.page);
  } catch {
    return null;
  }
}

async function writeTranslateCache(
  itemId: string,
  stem: string,
  targetLang: string,
  page: MokuroPage,
): Promise<void> {
  await fsp.mkdir(ocrDir(itemId), { recursive: true });
  await fsp.writeFile(
    translateCachePath(itemId, stem, targetLang),
    JSON.stringify({ version: 1, targetLang, page }, null, 2),
    'utf8',
  );
}

/** Count OCR / translate caches on disk and sync LibraryItem.ocrMeta. */
export async function refreshMangaOcrMeta(
  itemId: string,
  opts?: { targetLang?: string; broadcast?: boolean; markComplete?: boolean },
): Promise<NonNullable<LibraryItem['ocrMeta']>> {
  const pages = listMangaPageUrls(itemId);
  const pageTotal = pages.length;
  let ocrPages = 0;
  let translatedPages = 0;
  const lang = opts?.targetLang || 'en';
  for (const url of pages) {
    const resolved = resolveMediaPath(url);
    if (!resolved) continue;
    try {
      await fsp.access(cachePath(itemId, resolved.stem));
      ocrPages++;
    } catch {
      continue;
    }
    try {
      await fsp.access(translateCachePath(itemId, resolved.stem, lang));
      translatedPages++;
    } catch {
      /* no tr cache */
    }
  }
  const now = Date.now();
  const fullyOcr = pageTotal > 0 && ocrPages >= pageTotal;
  const fullyTr = pageTotal > 0 && translatedPages >= pageTotal;
  const meta: NonNullable<LibraryItem['ocrMeta']> = {
    ocrPages,
    translatedPages,
    targetLang: lang,
    updatedAt: now,
  };
  if (opts?.markComplete && fullyOcr && fullyTr) {
    meta.completedAt = now;
  } else if (fullyOcr && fullyTr) {
    meta.completedAt = now;
  }
  updateLibraryOcrMeta(itemId, meta, { broadcast: opts?.broadcast !== false });
  return meta;
}

/** Read the on-disk cache file as literally persisted (no corrections applied). */
async function readRawCachePage(itemId: string, stem: string): Promise<MokuroPage | null> {
  try {
    const raw = JSON.parse(await fsp.readFile(cachePath(itemId, stem), 'utf8')) as unknown;
    return parseMokuroPage(raw);
  } catch {
    return null;
  }
}

/**
 * Stable-sort blocks by their manual `order` override (C5), pushing blocks
 * without one to the end in their original relative order. A no-op when no
 * block on the page has ever had its order manually set.
 */
function applyManualOrder(blocks: MokuroBlock[]): MokuroBlock[] {
  return blocks
    .map((b, i) => ({ b, i }))
    .sort((x, y) => {
      const xo = x.b.order;
      const yo = y.b.order;
      if (xo == null && yo == null) return x.i - y.i;
      if (xo == null) return 1;
      if (yo == null) return -1;
      return xo - yo || x.i - y.i;
    })
    .map((x) => x.b);
}

/** Recognize one arbitrary box on an already-decoded page image. */
async function recognizeBox(
  rgba: Buffer,
  width: number,
  height: number,
  box: MokuroBox,
): Promise<MangaCropRead> {
  const points = [
    { x: box[0], y: box[1] },
    { x: box[2], y: box[1] },
    { x: box[2], y: box[3] },
    { x: box[0], y: box[3] },
  ];
  return recognizeCrop(rgba, width, height, box, points);
}

function broadcastProgress(progress: MangaOcrProgress): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send('mangaOcr:progress', progress);
  }
}

// ----- scan pipeline -----------------------------------------------------

export async function scanMangaPage(req: MangaOcrScanRequest): Promise<MokuroPage> {
  const { itemId, mediaUrl, force } = req;
  const resolved = resolveMediaPath(mediaUrl);
  if (!resolved || resolved.itemId !== itemId) {
    throw new Error('Invalid manga page URL.');
  }
  const { stem, full } = resolved;

  if (!force) {
    const cached = await loadMangaOcrCache(itemId, mediaUrl);
    if (cached) {
      broadcastProgress({
        itemId,
        mediaUrl,
        phase: 'done',
        current: cached.blocks.length,
        total: cached.blocks.length,
        page: cached,
      });
      return cached;
    }
  }

  await ensureModels();
  const { width, height, rgba } = loadPageImage(full);
  const pageArea = width * height;

  broadcastProgress({
    itemId,
    mediaUrl,
    phase: 'detect',
    current: 0,
    total: 0,
    page: { version: MOKURO_EMIT_VERSION, img_width: width, img_height: height, blocks: [] },
  });

  const regions = await detectRegions(rgba, width, height, req.detectionSensitivity);
  const corrections = await readCorrections(itemId, stem);
  const previousPage = await readRawCachePage(itemId, stem);
  const prevRawByRegion = new Map<string, string[]>();
  if (previousPage) {
    for (const b of previousPage.blocks) {
      if (b.regionId && b.rawLines) prevRawByRegion.set(b.regionId, b.rawLines);
    }
  }
  const blocks: MokuroBlock[] = [];
  const total = Math.max(1, regions.length);

  for (let i = 0; i < regions.length; i++) {
    const region = regions[i];
    const [xmin, ymin, xmax, ymax] = region.box;
    const bw = xmax - xmin;
    const bh = ymax - ymin;
    const regionId = regionIdFromBox(
      [Math.round(xmin), Math.round(ymin), Math.round(xmax), Math.round(ymax)],
      stem,
    );
    const correction = corrections[regionId];
    // How sure the decoder was about this region's text. Starts at 1 so a
    // reused cached read or a user correction is treated as certain.
    let readConfidence = 1;
    let lines: string[];
    let rawLines: string[];
    if (correction?.lines) {
      // A line correction exists — freeze the model's raw output the first
      // time we see it so it's never silently overwritten by the correction
      // text on a later forced rescan (the bug: raw cache used to just BE
      // the correction). Once frozen, reuse it — no more inference for this
      // region until an explicit per-region rescan.
      const prevRaw = prevRawByRegion.get(regionId);
      if (prevRaw) {
        rawLines = prevRaw;
      } else {
        try {
          const read = await recognizeCrop(rgba, width, height, region.box, region.points);
          rawLines = read.text ? [read.text] : [];
          readConfidence = read.confidence;
        } catch (err) {
          console.error('[mangaOcr] region raw-backfill failed', regionId, err);
          rawLines = [];
        }
      }
      lines = [...correction.lines];
    } else {
      try {
        const read = await recognizeCrop(rgba, width, height, region.box, region.points);
        rawLines = read.text ? [read.text] : [];
        readConfidence = read.confidence;
      } catch (err) {
        console.error('[mangaOcr] region failed', regionId, err);
        rawLines = [];
      }
      lines = [...rawLines];
    }
    const vertical = correction?.vertical ?? guessVertical(bw, bh);
    const fontSize = Math.max(10, Math.min(bw, bh) * 0.12);
    const joined = lines.join('\n');
    const junk =
      !correction?.lines &&
      (isJunkMangaOcrText(joined) || lines.every((l) => isJunkMangaOcrText(l)));
    const classified = classifyRegionKind({
      width: bw,
      height: bh,
      pageArea,
    });
    // Prefer explicit correction kind; otherwise drop junk hallucinations as ignore,
    // then fall back to SFX/text heuristics.
    const kind =
      correction?.kind ??
      (junk ? 'ignore' : classified.kind);
    const confidenceScale = junk ? 0.2 : classified.confidenceScale;
    blocks.push({
      box: [
        Math.round(xmin),
        Math.round(ymin),
        Math.round(xmax),
        Math.round(ymax),
      ],
      vertical,
      font_size: fontSize,
      lines: junk && !correction?.lines ? [] : lines,
      rawLines,
      regionId,
      // The decoder's own score, damped for junk/SFX. This used to be
      // region.score — the detector's *area* proxy — which said nothing about
      // whether the text was read correctly and always looked high.
      // A user-corrected region is taken as certain.
      confidence: correction?.lines ? 1 : readConfidence * confidenceScale,
      kind,
      ...(correction?.order !== undefined ? { order: correction.order } : null),
    });

    const partial: MokuroPage = {
      version: MOKURO_EMIT_VERSION,
      img_width: width,
      img_height: height,
      blocks: [...blocks],
    };
    broadcastProgress({
      itemId,
      mediaUrl,
      phase: 'ocr',
      current: i + 1,
      total,
      page: partial,
    });
  }

  const page: MokuroPage = {
    version: MOKURO_EMIT_VERSION,
    img_width: width,
    img_height: height,
    blocks: applyManualOrder(blocks),
  };
  await writeCache(itemId, stem, page);
  const finalPage = applyCorrections(page, corrections);
  broadcastProgress({
    itemId,
    mediaUrl,
    phase: 'done',
    current: total,
    total,
    page: finalPage,
  });
  return finalPage;
}

export async function saveMangaOcrCorrection(req: MangaOcrCorrectionRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const map = await readCorrections(req.itemId, resolved.stem);
  map[req.regionId] = {
    ...map[req.regionId],
    ...(req.lines !== undefined ? { lines: req.lines } : null),
    ...(req.kind !== undefined ? { kind: req.kind } : null),
    ...(req.vertical !== undefined ? { vertical: req.vertical } : null),
  };
  await writeCorrections(req.itemId, resolved.stem, map);

  // loadMangaOcrCache re-reads corrections (already includes the one just
  // saved above) and applies them on top of the raw cache — so `cached`
  // already reflects this correction. Persist it so the on-disk cache file
  // stays "corrections already baked in", matching scanMangaPage's convention.
  const cached = await loadMangaOcrCache(req.itemId, req.mediaUrl);
  if (!cached) return null;
  await writeCache(req.itemId, resolved.stem, cached);
  return cached;
}

/** Re-run OCR on exactly one region's existing box, refreshing its raw snapshot without touching any saved correction. */
export async function rescanMangaOcrRegion(req: MangaOcrRegionRescanRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const { stem, full } = resolved;
  const raw = await readRawCachePage(req.itemId, stem);
  if (!raw) return null;
  const block = raw.blocks.find((b) => b.regionId === req.regionId);
  if (!block) return null;

  await ensureModels();
  const { width, height, rgba } = loadPageImage(full);
  let text = '';
  let confidence = 0;
  try {
    const read = await recognizeBox(rgba, width, height, block.box);
    text = read.text;
    confidence = read.confidence;
  } catch (err) {
    console.error('[mangaOcr] region rescan failed', req.regionId, err);
  }
  const rawLines = text ? [text] : [];
  const patchedRaw: MokuroPage = {
    ...raw,
    blocks: raw.blocks.map((b) =>
      b.regionId === req.regionId ? { ...b, rawLines, confidence } : b,
    ),
  };
  await writeCache(req.itemId, stem, patchedRaw);
  const corrections = await readCorrections(req.itemId, stem);
  return applyCorrections(patchedRaw, corrections);
}

/** Union two regions' boxes into one, re-OCR the combined crop, and drop their individual corrections. */
export async function mergeMangaOcrRegions(req: MangaOcrMergeRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const { stem, full } = resolved;
  const raw = await readRawCachePage(req.itemId, stem);
  if (!raw) return null;
  const [idA, idB] = req.regionIds;
  const a = raw.blocks.find((b) => b.regionId === idA);
  const b = raw.blocks.find((b) => b.regionId === idB);
  if (!a || !b || a === b) return null;

  const box: MokuroBox = [
    Math.min(a.box[0], b.box[0]),
    Math.min(a.box[1], b.box[1]),
    Math.max(a.box[2], b.box[2]),
    Math.max(a.box[3], b.box[3]),
  ];
  await ensureModels();
  const { width, height, rgba } = loadPageImage(full);
  let text = '';
  let confidence = 0;
  try {
    const read = await recognizeBox(rgba, width, height, box);
    text = read.text;
    confidence = read.confidence;
  } catch (err) {
    console.error('[mangaOcr] region merge failed', idA, idB, err);
  }
  const merged: MokuroBlock = {
    box,
    vertical: a.vertical,
    font_size: a.font_size,
    lines: text ? [text] : [],
    rawLines: text ? [text] : [],
    regionId: regionIdFromBox(box, stem),
    // From the combined re-read, not the two old halves: the merged crop was
    // decoded fresh, so the old scores describe text that no longer exists.
    confidence,
    kind: a.kind ?? b.kind,
  };
  const remaining = raw.blocks.filter((blk) => blk.regionId !== idA && blk.regionId !== idB);
  const orderedIndexed = sortReadingOrder(
    [...remaining, merged].map((blk) => ({ box: blk.box, blk })),
  );
  const patchedRaw: MokuroPage = { ...raw, blocks: orderedIndexed.map((x) => x.blk) };
  await writeCache(req.itemId, stem, patchedRaw);

  const corrections = await readCorrections(req.itemId, stem);
  let changed = false;
  for (const oldId of [idA, idB]) {
    if (corrections[oldId]) {
      delete corrections[oldId];
      changed = true;
    }
  }
  if (changed) await writeCorrections(req.itemId, stem, corrections);
  return applyCorrections(patchedRaw, corrections);
}

/**
 * Split one region into two along a single straight cut. Manual only — the
 * OCR decoder has no per-line spatial output, so there is no data to guess
 * a split point from; `at` must come from a user-placed divider.
 */
export async function splitMangaOcrRegion(req: MangaOcrSplitRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const { stem, full } = resolved;
  const raw = await readRawCachePage(req.itemId, stem);
  if (!raw) return null;
  const block = raw.blocks.find((b) => b.regionId === req.regionId);
  if (!block) return null;

  const at = Math.min(0.9, Math.max(0.1, req.at));
  const [xmin, ymin, xmax, ymax] = block.box;
  let boxA: MokuroBox;
  let boxB: MokuroBox;
  if (req.axis === 'x') {
    const cut = xmin + (xmax - xmin) * at;
    boxA = [xmin, ymin, cut, ymax];
    boxB = [cut, ymin, xmax, ymax];
  } else {
    const cut = ymin + (ymax - ymin) * at;
    boxA = [xmin, ymin, xmax, cut];
    boxB = [xmin, cut, xmax, ymax];
  }

  await ensureModels();
  const { width, height, rgba } = loadPageImage(full);
  const empty: MangaCropRead = { text: '', confidence: 0 };
  const [readA, readB] = await Promise.all([
    recognizeBox(rgba, width, height, boxA).catch((err) => {
      console.error('[mangaOcr] region split-half failed', req.regionId, err);
      return empty;
    }),
    recognizeBox(rgba, width, height, boxB).catch((err) => {
      console.error('[mangaOcr] region split-half failed', req.regionId, err);
      return empty;
    }),
  ]);
  // Each half is decoded on its own, so each carries its own score rather than
  // inheriting the confidence of the region they came from.
  const make = (box: MokuroBox, read: MangaCropRead): MokuroBlock => ({
    box,
    vertical: block.vertical,
    font_size: block.font_size,
    lines: read.text ? [read.text] : [],
    rawLines: read.text ? [read.text] : [],
    regionId: regionIdFromBox(box, stem),
    confidence: read.confidence,
    kind: block.kind,
  });
  const remaining = raw.blocks.filter((b) => b.regionId !== req.regionId);
  const newBlocks = [make(boxA, readA), make(boxB, readB)];
  const orderedIndexed = sortReadingOrder(
    [...remaining, ...newBlocks].map((blk) => ({ box: blk.box, blk })),
  );
  const patchedRaw: MokuroPage = { ...raw, blocks: orderedIndexed.map((x) => x.blk) };
  await writeCache(req.itemId, stem, patchedRaw);

  const corrections = await readCorrections(req.itemId, stem);
  if (corrections[req.regionId]) {
    delete corrections[req.regionId];
    await writeCorrections(req.itemId, stem, corrections);
  }
  return applyCorrections(patchedRaw, corrections);
}

/**
 * Add (or replace) a manually drawn region: OCR the crop, insert into the page
 * cache, and return the corrected page. Creates an empty page cache when none
 * exists yet so users can OCR a single bubble without a full-page scan.
 */
export async function addMangaOcrRegion(req: MangaOcrAddRegionRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const { stem, full } = resolved;

  if (!Array.isArray(req.box) || req.box.length < 4 || !req.box.every((n) => typeof n === 'number' && Number.isFinite(n))) {
    throw new Error('Invalid region box.');
  }

  await ensureModels();
  const { width, height, rgba } = loadPageImage(full);

  const x0 = Math.round(Math.min(req.box[0], req.box[2]));
  const y0 = Math.round(Math.min(req.box[1], req.box[3]));
  const x1 = Math.round(Math.max(req.box[0], req.box[2]));
  const y1 = Math.round(Math.max(req.box[1], req.box[3]));
  const xmin = Math.max(0, Math.min(width - 1, x0));
  const ymin = Math.max(0, Math.min(height - 1, y0));
  const xmax = Math.max(xmin + 1, Math.min(width, x1));
  const ymax = Math.max(ymin + 1, Math.min(height, y1));
  if (xmax - xmin < MIN_MANUAL_REGION_PX || ymax - ymin < MIN_MANUAL_REGION_PX) {
    throw new Error('Region too small.');
  }

  const box: MokuroBox = [xmin, ymin, xmax, ymax];
  const regionId = regionIdFromBox(box, stem);
  const bw = xmax - xmin;
  const bh = ymax - ymin;
  const pageArea = width * height;
  const { kind, confidenceScale } = classifyRegionKind({ width: bw, height: bh, pageArea });

  let text = '';
  let readConfidence = 0;
  try {
    const read = await recognizeBox(rgba, width, height, box);
    text = read.text;
    readConfidence = read.confidence;
  } catch (err) {
    console.error('[mangaOcr] add-region OCR failed', regionId, err);
  }
  const lines = text ? [text] : [];
  const newBlock: MokuroBlock = {
    box,
    vertical: guessVertical(bw, bh),
    font_size: Math.max(10, Math.min(bw, bh) * 0.12),
    lines,
    rawLines: [...lines],
    regionId,
    confidence: readConfidence * confidenceScale,
    kind,
  };

  const raw = (await readRawCachePage(req.itemId, stem)) ?? {
    version: MOKURO_EMIT_VERSION,
    img_width: width,
    img_height: height,
    blocks: [],
  };
  const remaining = raw.blocks.filter((b) => b.regionId !== regionId);
  const orderedIndexed = sortReadingOrder(
    [...remaining, newBlock].map((blk) => ({ box: blk.box, blk })),
  );
  const patchedRaw: MokuroPage = {
    version: raw.version || MOKURO_EMIT_VERSION,
    img_width: raw.img_width || width,
    img_height: raw.img_height || height,
    blocks: orderedIndexed.map((x) => x.blk),
  };
  await writeCache(req.itemId, stem, patchedRaw);

  const corrections = await readCorrections(req.itemId, stem);
  if (corrections[regionId]) {
    delete corrections[regionId];
    await writeCorrections(req.itemId, stem, corrections);
  }
  return applyCorrections(patchedRaw, corrections);
}

/** Persist a full manual reading-order override in one round trip (vs. N separate correction saves). */
export async function saveMangaOcrRegionOrder(req: MangaOcrOrderRequest): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(req.mediaUrl);
  if (!resolved || resolved.itemId !== req.itemId) throw new Error('Invalid manga page URL.');
  const { stem } = resolved;
  const corrections = await readCorrections(req.itemId, stem);
  req.order.forEach((regionId, index) => {
    corrections[regionId] = { ...corrections[regionId], order: index };
  });
  await writeCorrections(req.itemId, stem, corrections);

  const raw = await readRawCachePage(req.itemId, stem);
  if (!raw) return null;
  const withOrder: MokuroPage = {
    ...raw,
    blocks: raw.blocks.map((b) =>
      b.regionId && corrections[b.regionId]?.order !== undefined
        ? { ...b, order: corrections[b.regionId].order }
        : b,
    ),
  };
  const patchedRaw: MokuroPage = { ...withOrder, blocks: applyManualOrder(withOrder.blocks) };
  await writeCache(req.itemId, stem, patchedRaw);
  return applyCorrections(patchedRaw, corrections);
}

/** Decode a data URL to RGBA (toBitmap is BGRA on Windows/macOS) plus its dims. */
function rgbaFromDataUrl(dataUrl: string): { rgba: Buffer; width: number; height: number } | null {
  const img = nativeImage.createFromDataURL(dataUrl);
  if (img.isEmpty()) throw new Error('Could not decode drawing.');
  const { width, height } = img.getSize();
  if (width < 8 || height < 8) return null;
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

function wholeImageRegion(width: number, height: number): DetectedRegion {
  return {
    box: [0, 0, width, height],
    score: 1,
    points: [
      { x: 0, y: 0 },
      { x: width, y: 0 },
      { x: width, y: height },
      { x: 0, y: height },
    ],
  };
}

export async function recognizeMangaOcrDataUrl(dataUrl: string): Promise<string> {
  await ensureModels();
  const decoded = rgbaFromDataUrl(dataUrl);
  if (!decoded) return '';
  const { rgba, width, height } = decoded;
  const region = wholeImageRegion(width, height);
  return (await recognizeCrop(rgba, width, height, region.box, region.points)).text;
}

export interface MangaOcrRegionLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

/**
 * Read every speech bubble in an arbitrary image.
 *
 * `recognizeMangaOcrDataUrl` reads its whole input as one block, which is right
 * for a single cropped bubble and useless for a page — manga-ocr fed a full page
 * returns one short fragment. This runs comic-text-detector first, so the same
 * call site works for a lens region containing one bubble and for a whole scanned
 * page, and the caller gets a box per bubble to hang hotspots on.
 *
 * When detection finds nothing the whole image is read as one block, so a tight
 * crop the detector considers featureless still produces text.
 *
 * Confidence is the decoder's own: the geometric mean of the probability it
 * assigned to each token it chose (see shared/ocrConfidence.ts). It is directly
 * comparable to the general engine's per-line CTC score, so a reader can trust
 * the number and callers can weigh the two engines on more than text alone.
 */
export async function recognizeMangaOcrRegionsDataUrl(
  dataUrl: string,
  opts: { sensitivity?: DetectionSensitivity } = {},
): Promise<{ text: string; lines: MangaOcrRegionLine[] }> {
  await ensureModels();
  const decoded = rgbaFromDataUrl(dataUrl);
  if (!decoded) return { text: '', lines: [] };
  const { rgba, width, height } = decoded;

  let regions = await detectRegions(rgba, width, height, opts.sensitivity);
  if (!regions.length) regions = [wholeImageRegion(width, height)];

  const lines: MangaOcrRegionLine[] = [];
  for (const region of regions) {
    const read = await recognizeCrop(rgba, width, height, region.box, region.points);
    const text = read.text.trim();
    if (!text) continue;
    const [x0, y0, x1, y1] = region.box;
    lines.push({
      text,
      box: [x0, y0, x1, y1],
      vertical: y1 - y0 > x1 - x0,
      confidence: read.confidence,
    });
  }
  // detectRegions already returns regions in manga reading order.
  return { text: lines.map((l) => l.text).join('\n'), lines };
}

// ----- volume analyze / translate ----------------------------------------

const volumeCancel = new Set<string>();

function broadcastVolumeProgress(p: MangaOcrVolumeProgress): void {
  for (const w of BrowserWindow.getAllWindows()) {
    w.webContents.send('mangaOcr:volumeProgress', p);
  }
}

/**
 * Translate a page's regions, reporting how many actually came back translated.
 *
 * The count is what the caller needs, and it used to be impossible to recover.
 * When nothing translated this returned the page *unchanged* — i.e. holding its
 * original Japanese — which the caller then persisted as the page's translation
 * cache, so `refreshMangaOcrMeta` counted the page as translated and the reader
 * showed the same Japanese under both "Show original" and "Show translation".
 * Nothing surfaced, because `runTranslationBatch` reports a failed item as an
 * empty string rather than throwing.
 */
async function translateMokuroPage(
  page: MokuroPage,
  targetLang: string,
  shouldCancel: () => boolean,
): Promise<{ page: MokuroPage; requested: number; translated: number }> {
  const items: Array<{ id: string; text: string; source: string; target: string }> = [];
  for (const block of page.blocks) {
    if (block.kind === 'ignore') continue;
    const id = block.regionId ?? '';
    if (!id) continue;
    const text = block.lines.join(block.vertical ? '' : '\n').trim();
    if (!text) continue;
    items.push({ id, text, source: 'ja', target: targetLang });
  }
  if (!items.length) return { page, requested: 0, translated: 0 };
  const results = await runTranslationBatch(items, { shouldCancel });
  const sourceById = new Map(items.map((i) => [i.id, i.text]));
  const byId = new Map(
    results
      .map((r) => [r.id, r.text.trim()] as const)
      // `runTranslationBatch` already rejects an echoed source, but the check is
      // repeated here on purpose: this function decides what gets *persisted* as
      // a translation, and that decision should not depend on a distant module
      // continuing to validate. An echo is not a translation.
      .filter(([id, text]) => text && text !== sourceById.get(id)?.trim()),
  );
  return {
    page: {
      ...page,
      blocks: page.blocks.map((b) => {
        const id = b.regionId ?? '';
        const tr = byId.get(id);
        if (!tr) return b;
        return { ...b, lines: [tr], vertical: false };
      }),
    },
    requested: items.length,
    translated: byId.size,
  };
}

/**
 * OCR every page of a manga (using cache unless force), optionally translate
 * each page, persist translation caches, and update LibraryItem.ocrMeta.
 */
export async function analyzeMangaVolume(
  req: MangaOcrVolumeRequest,
): Promise<{
  ok: boolean;
  cancelled?: boolean;
  error?: string;
  /** Set when OCR succeeded but one or more pages produced no translation. */
  warning?: string;
  ocrMeta?: NonNullable<LibraryItem['ocrMeta']>;
}> {
  const itemId = req.itemId;
  const force = !!req.force;
  const doTranslate = req.translate !== false;
  const targetLang = (req.targetLang || 'en').trim() || 'en';
  volumeCancel.delete(itemId);

  const allPages = listMangaPageUrls(itemId);
  if (!allPages.length) return { ok: false, error: 'No manga pages found.' };

  if (doTranslate && !isTranslateAvailable()) {
    return {
      ok: false,
      error:
        'Qwen3 translation model not found. Place Qwen3-1.7B (Q4_K_M) in Downloads or the app models folder.',
    };
  }

  const last = allPages.length - 1;
  const startPage = Math.min(last, Math.max(0, Math.floor(req.startPage ?? 0)));
  const endPage = Math.min(last, Math.max(startPage, Math.floor(req.endPage ?? last)));
  const pages = allPages.slice(startPage, endPage + 1);
  const pageTotal = pages.length;
  /** Pages that had text but came back with nothing translated. */
  let translateFailures = 0;
  try {
    for (let offset = 0; offset < pages.length; offset++) {
      const i = startPage + offset;
      if (volumeCancel.has(itemId)) {
        const ocrMeta = await refreshMangaOcrMeta(itemId, { targetLang });
        broadcastVolumeProgress({
          itemId,
          phase: 'cancelled',
          pageIndex: offset,
          pageTotal,
          ocrMeta,
        });
        return { ok: false, cancelled: true, ocrMeta };
      }
      const mediaUrl = pages[offset];
      broadcastVolumeProgress({
        itemId,
        phase: 'ocr',
        pageIndex: offset,
        pageTotal,
        mediaUrl,
        message: `OCR ${i + 1}/${allPages.length}`,
      });
      const page = await scanMangaPage({
        itemId,
        mediaUrl,
        force,
        detectionSensitivity: req.detectionSensitivity,
      });

      if (doTranslate) {
        if (volumeCancel.has(itemId)) {
          const ocrMeta = await refreshMangaOcrMeta(itemId, { targetLang });
          broadcastVolumeProgress({
            itemId,
            phase: 'cancelled',
            pageIndex: offset,
            pageTotal,
            ocrMeta,
          });
          return { ok: false, cancelled: true, ocrMeta };
        }
        const resolved = resolveMediaPath(mediaUrl);
        broadcastVolumeProgress({
          itemId,
          phase: 'translate',
          pageIndex: offset,
          pageTotal,
          mediaUrl,
          message: `Translate ${i + 1}/${allPages.length}`,
        });
        const cached =
          !force && resolved
            ? await loadMangaOcrTranslateCache(itemId, mediaUrl, targetLang)
            : null;
        if (!cached) {
          const result = await translateMokuroPage(page, targetLang, () =>
            volumeCancel.has(itemId),
          );
          // Only a page that gained at least one real translation is cached.
          // Writing the untranslated page is what made `translatedPages` count
          // it and made the reader show Japanese as its own translation.
          if (resolved && result.translated > 0) {
            await writeTranslateCache(itemId, resolved.stem, targetLang, result.page);
          }
          if (result.requested > 0 && result.translated === 0) {
            translateFailures += 1;
            console.error(
              `[mangaOcr] no region on page ${i + 1} could be translated to "${targetLang}"; not caching it`,
            );
          }
        }
      }

      // Periodic meta so the library badge can show partial progress.
      if (offset === 0 || offset === pages.length - 1 || offset % 3 === 2) {
        await refreshMangaOcrMeta(itemId, { targetLang, broadcast: true });
      }
    }

    const volumeTotal = allPages.length;
    const ocrMeta = await refreshMangaOcrMeta(itemId, {
      targetLang,
      // Only mark the volume complete when this pass covered every page.
      markComplete: doTranslate && startPage === 0 && endPage === last,
      broadcast: true,
    });
    // If translate was skipped, still mark OCR-complete when all pages scanned.
    if (!doTranslate && ocrMeta.ocrPages >= volumeTotal) {
      const doneMeta = { ...ocrMeta, completedAt: undefined, updatedAt: Date.now() };
      updateLibraryOcrMeta(itemId, doneMeta);
    }
    if (doTranslate && ocrMeta.ocrPages >= volumeTotal && ocrMeta.translatedPages >= volumeTotal) {
      // refreshMangaOcrMeta already set completedAt when markComplete
    }

    const warning =
      translateFailures > 0
        ? translateFailures === pageTotal
          ? `OCR finished, but the translation model produced nothing usable for any of the ${pageTotal} page(s). They are cached as OCR only.`
          : `OCR finished, but ${translateFailures} of ${pageTotal} page(s) could not be translated. Those pages are cached as OCR only.`
        : undefined;

    broadcastVolumeProgress({
      itemId,
      phase: 'done',
      pageIndex: pageTotal,
      pageTotal,
      ocrMeta,
      ...(warning ? { warning } : null),
    });
    return { ok: true, ocrMeta, ...(warning ? { warning } : null) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    broadcastVolumeProgress({
      itemId,
      phase: 'error',
      pageIndex: 0,
      pageTotal,
      error: message,
    });
    return { ok: false, error: message };
  } finally {
    volumeCancel.delete(itemId);
  }
}

export function cancelMangaVolumeAnalyze(itemId: string): void {
  if (itemId) volumeCancel.add(itemId);
}

// ----- IPC ---------------------------------------------------------------

export function registerMangaOcrIpc(): void {
  ensureUnloadHandlers();

  ipcMain.handle('mangaOcr:available', () => mangaOcrAvailable());

  ipcMain.handle('mangaOcr:recognizeImage', async (_e, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid image data.');
    }
    return recognizeMangaOcrDataUrl(dataUrl);
  });

  ipcMain.handle('mangaOcr:loadCache', async (_e, itemId: unknown, mediaUrl: unknown) => {
    if (typeof itemId !== 'string' || typeof mediaUrl !== 'string') return null;
    return loadMangaOcrCache(itemId, mediaUrl);
  });

  ipcMain.handle('mangaOcr:scanPage', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid scan request');
    const r = req as MangaOcrScanRequest;
    if (typeof r.itemId !== 'string' || typeof r.mediaUrl !== 'string') {
      throw new Error('Invalid scan request');
    }
    try {
      return await scanMangaPage({
        itemId: r.itemId,
        mediaUrl: r.mediaUrl,
        force: !!r.force,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      broadcastProgress({
        itemId: r.itemId,
        mediaUrl: r.mediaUrl,
        phase: 'error',
        current: 0,
        total: 0,
        error: message,
      });
      throw err;
    }
  });

  ipcMain.handle('mangaOcr:saveCorrection', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid correction');
    const r = req as MangaOcrCorrectionRequest;
    const hasLines = Array.isArray(r.lines);
    const hasKind = r.kind === 'text' || r.kind === 'sfx' || r.kind === 'ignore';
    const hasVertical = typeof r.vertical === 'boolean';
    if (
      typeof r.itemId !== 'string' ||
      typeof r.mediaUrl !== 'string' ||
      typeof r.regionId !== 'string' ||
      !(hasLines || hasKind || hasVertical)
    ) {
      throw new Error('Invalid correction');
    }
    return saveMangaOcrCorrection({
      itemId: r.itemId,
      mediaUrl: r.mediaUrl,
      regionId: r.regionId,
      ...(hasLines ? { lines: r.lines.map(String) } : null),
      ...(hasKind ? { kind: r.kind } : null),
      ...(hasVertical ? { vertical: r.vertical } : null),
    });
  });

  ipcMain.handle('mangaOcr:rescanRegion', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid request');
    const r = req as MangaOcrRegionRescanRequest;
    if (typeof r.itemId !== 'string' || typeof r.mediaUrl !== 'string' || typeof r.regionId !== 'string') {
      throw new Error('Invalid request');
    }
    return rescanMangaOcrRegion(r);
  });

  ipcMain.handle('mangaOcr:mergeRegions', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid request');
    const r = req as MangaOcrMergeRequest;
    if (
      typeof r.itemId !== 'string' ||
      typeof r.mediaUrl !== 'string' ||
      !Array.isArray(r.regionIds) ||
      r.regionIds.length !== 2 ||
      !r.regionIds.every((id) => typeof id === 'string')
    ) {
      throw new Error('Invalid request');
    }
    return mergeMangaOcrRegions({
      itemId: r.itemId,
      mediaUrl: r.mediaUrl,
      regionIds: [r.regionIds[0], r.regionIds[1]],
    });
  });

  ipcMain.handle('mangaOcr:splitRegion', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid request');
    const r = req as MangaOcrSplitRequest;
    if (
      typeof r.itemId !== 'string' ||
      typeof r.mediaUrl !== 'string' ||
      typeof r.regionId !== 'string' ||
      (r.axis !== 'x' && r.axis !== 'y') ||
      typeof r.at !== 'number' ||
      !Number.isFinite(r.at)
    ) {
      throw new Error('Invalid request');
    }
    return splitMangaOcrRegion(r);
  });

  ipcMain.handle('mangaOcr:addRegion', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid request');
    const r = req as MangaOcrAddRegionRequest;
    if (
      typeof r.itemId !== 'string' ||
      typeof r.mediaUrl !== 'string' ||
      !Array.isArray(r.box) ||
      r.box.length < 4 ||
      !r.box.every((n) => typeof n === 'number' && Number.isFinite(n))
    ) {
      throw new Error('Invalid request');
    }
    return addMangaOcrRegion({
      itemId: r.itemId,
      mediaUrl: r.mediaUrl,
      box: [r.box[0], r.box[1], r.box[2], r.box[3]],
    });
  });

  ipcMain.handle('mangaOcr:saveOrder', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid request');
    const r = req as MangaOcrOrderRequest;
    if (
      typeof r.itemId !== 'string' ||
      typeof r.mediaUrl !== 'string' ||
      !Array.isArray(r.order) ||
      !r.order.every((id) => typeof id === 'string')
    ) {
      throw new Error('Invalid request');
    }
    return saveMangaOcrRegionOrder({ itemId: r.itemId, mediaUrl: r.mediaUrl, order: r.order });
  });

  ipcMain.handle('mangaOcr:loadTranslateCache', async (_e, itemId: unknown, mediaUrl: unknown, targetLang: unknown) => {
    if (typeof itemId !== 'string' || typeof mediaUrl !== 'string') return null;
    const lang = typeof targetLang === 'string' && targetLang.trim() ? targetLang.trim() : 'en';
    return loadMangaOcrTranslateCache(itemId, mediaUrl, lang);
  });

  ipcMain.handle(
    'mangaOcr:saveTranslateCache',
    async (_e, itemId: unknown, mediaUrl: unknown, targetLang: unknown, page: unknown) => {
      if (typeof itemId !== 'string' || typeof mediaUrl !== 'string') return { ok: false };
      const lang = typeof targetLang === 'string' && targetLang.trim() ? targetLang.trim() : 'en';
      const resolved = resolveMediaPath(mediaUrl);
      if (!resolved) return { ok: false };
      try {
        const parsed = parseMokuroPage(page);
        await writeTranslateCache(itemId, resolved.stem, lang, parsed);
        await refreshMangaOcrMeta(itemId, { targetLang: lang, broadcast: true });
        return { ok: true };
      } catch (err) {
        console.error('[mangaOcr] saveTranslateCache', err);
        return { ok: false };
      }
    },
  );

  ipcMain.handle('mangaOcr:analyzeVolume', async (_e, req: unknown) => {
    if (!req || typeof req !== 'object') throw new Error('Invalid volume request');
    const r = req as MangaOcrVolumeRequest;
    if (typeof r.itemId !== 'string' || !r.itemId) throw new Error('Invalid volume request');
    const startPage =
      typeof r.startPage === 'number' && Number.isFinite(r.startPage) ? Math.floor(r.startPage) : undefined;
    const endPage =
      typeof r.endPage === 'number' && Number.isFinite(r.endPage) ? Math.floor(r.endPage) : undefined;
    return analyzeMangaVolume({
      itemId: r.itemId,
      force: !!r.force,
      translate: r.translate !== false,
      targetLang: typeof r.targetLang === 'string' ? r.targetLang : 'en',
      detectionSensitivity: r.detectionSensitivity,
      startPage,
      endPage,
    });
  });

  ipcMain.handle('mangaOcr:cancelVolume', (_e, itemId: unknown) => {
    if (typeof itemId === 'string' && itemId) cancelMangaVolumeAnalyze(itemId);
    return { ok: true };
  });

  ipcMain.handle('mangaOcr:refreshMeta', async (_e, itemId: unknown, targetLang: unknown) => {
    if (typeof itemId !== 'string' || !itemId) return null;
    const lang = typeof targetLang === 'string' && targetLang.trim() ? targetLang.trim() : 'en';
    return refreshMangaOcrMeta(itemId, { targetLang: lang });
  });
}
