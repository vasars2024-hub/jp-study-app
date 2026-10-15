/**
 * Main-process manga OCR: comic-text-detector → optional dewarp → manga-ocr
 * (encoder + decoder ONNX) → Mokuro-compatible JSON cache.
 *
 * Models arrive via the Phase 6 download manager (assetPath / isInstalled).
 */

import * as fs from 'node:fs';
import * as fsp from 'node:fs/promises';
import * as path from 'node:path';
import { readJson, writeJsonAtomic } from './atomicJson';
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
  type MokuroBlockKind,
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
  MangaMokuroImportResult,
  DetectionSensitivity,
} from '../shared/mangaOcrIpc';
import { isMangaOcrCancelled } from '../shared/mangaOcrIpc';
import {
  MOKURO_VOLUME_MAX_BYTES,
  matchMokuroPages,
  parseMokuroVolume,
  type MokuroVolume,
} from '../shared/mokuroVolume';
import {
  classifyRegionKind,
  guessVertical,
  isJunkMangaOcrText,
  postprocessMangaOcrText,
  shouldDewarp,
} from '../shared/mangaOcrText';
import { sequenceConfidence, tokenProbability } from '../shared/ocrConfidence';
import { sortReadingOrder } from '../shared/readingOrder';
import { groupTextLines, lineCropBox } from '../shared/mangaTextLines';
import {
  DEFAULT_LINE_MAP_OPTIONS,
  blocksFromYolo,
  linesFromShrinkMap,
  orphanGlyphs,
  tightenToMask,
} from '../shared/mangaTextDetect';
import { getMainStudyLang } from './studyLanguage';
import { MangaScanCancelled, createMangaScanQueue, type MangaScanPriority } from './mangaScanQueue';
import { readOcrSurface } from './ocrSurface';
import { mangaStepsToChars } from './ocrRouter';
import { ocrUnsureOf } from '../shared/ocrSurfaceCorrections';
import type { OcrChar, OcrUnsureChar } from '../shared/ocrRouterTypes';
import { isTranslateAvailable, runTranslationBatch } from './translate';
import {
  summarizeTranslateFailure,
  type TranslateBatchFailure,
} from '../shared/translateBatchFailure';
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
/** Ids below this are the tokenizer's specials ([PAD] [UNK] [CLS] [SEP] [MASK]). */
const FIRST_TEXT_TOKEN = 5;
const MAX_TOKENS = 300;

// ----- sessions ----------------------------------------------------------

let encoder: OrtNamespace.InferenceSession | null = null;
let decoder: OrtNamespace.InferenceSession | null = null;
let detector: OrtNamespace.InferenceSession | null = null;
let vocab: string[] | null = null;
let loadPromise: Promise<void> | null = null;
let unloadRegistered = false;

/**
 * The three sessions hold about 600 MB. They load in about a second, so a
 * reader that stopped scanning gives that memory back after a few idle minutes
 * rather than keeping it for the rest of the app's life.
 */
export const MANGA_OCR_IDLE_UNLOAD_MS = 5 * 60_000;
let idleTimer: ReturnType<typeof setTimeout> | null = null;

/** Push the idle unload back: called on every use of the sessions. */
function noteModelUse(): void {
  if (idleTimer) clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    idleTimer = null;
    void unloadSessions();
  }, MANGA_OCR_IDLE_UNLOAD_MS);
  // Never what keeps the process alive.
  (idleTimer as { unref?: () => void }).unref?.();
}

export function mangaOcrAvailable(): boolean {
  return ASSET_IDS.every((id) => isInstalled(id));
}

async function unloadSessions(): Promise<void> {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = null;
  }
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
  noteModelUse();
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
      // Without the arena the process peaks at ~0.7 GB instead of ~1.4 GB
      // over a page (tools/ocr-eval), at the same speed.
      enableCpuMemArena: false,
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

/**
 * Bilinear RGB sample at a continuous pixel-centre coordinate (pixel `i`'s
 * centre is `i`), clamped at the edges.
 */
export function sampleRgbaBilinear(
  rgba: Buffer | Uint8Array,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
): [number, number, number] {
  const cx = Math.min(srcW - 1, Math.max(0, x));
  const cy = Math.min(srcH - 1, Math.max(0, y));
  const x0 = Math.floor(cx);
  const y0 = Math.floor(cy);
  const x1 = Math.min(srcW - 1, x0 + 1);
  const y1 = Math.min(srcH - 1, y0 + 1);
  const fx = cx - x0;
  const fy = cy - y0;
  const o00 = (y0 * srcW + x0) * 4;
  const o10 = (y0 * srcW + x1) * 4;
  const o01 = (y1 * srcW + x0) * 4;
  const o11 = (y1 * srcW + x1) * 4;
  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;
  return [
    rgba[o00] * w00 + rgba[o10] * w10 + rgba[o01] * w01 + rgba[o11] * w11,
    rgba[o00 + 1] * w00 + rgba[o10 + 1] * w10 + rgba[o01 + 1] * w01 + rgba[o11 + 1] * w11,
    rgba[o00 + 2] * w00 + rgba[o10 + 2] * w10 + rgba[o01 + 2] * w01 + rgba[o11 + 2] * w11,
  ];
}

/**
 * Bilinear samples per output pixel along one axis when shrinking by `step`
 * source pixels per output pixel. A plain bilinear tap skips most of the
 * source when shrinking 3x, which is what drops thin strokes; averaging a few
 * taps is the cheap stand-in for the antialiased resize manga-ocr was trained
 * on (PIL bilinear).
 */
function tapsFor(step: number, max: number): number {
  return Math.min(max, Math.max(1, Math.ceil(step - 1e-9)));
}

/** Letterboxed RGB (0–1, CHW) for the detector, with the mapping back to page pixels. */
export function letterboxRgb(
  rgba: Buffer | Uint8Array,
  srcW: number,
  srcH: number,
  size: number,
  opts: { align?: 'center' | 'start'; fill?: number } = {},
): { data: Float32Array; ratio: number; padX: number; padY: number } {
  const ratio = Math.min(size / srcW, size / srcH);
  const newW = Math.round(srcW * ratio);
  const newH = Math.round(srcH * ratio);
  const start = opts.align === 'start';
  const padX = start ? 0 : Math.floor((size - newW) / 2);
  const padY = start ? 0 : Math.floor((size - newH) / 2);
  const data = new Float32Array(3 * size * size);
  data.fill(opts.fill ?? 0.5);
  const taps = tapsFor(1 / ratio, 3);
  const weight = 1 / (taps * taps * 255);
  for (let y = 0; y < newH; y++) {
    for (let x = 0; x < newW; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let ty = 0; ty < taps; ty++) {
        const sy = (y + (ty + 0.5) / taps) / ratio - 0.5;
        for (let tx = 0; tx < taps; tx++) {
          const sx = (x + (tx + 0.5) / taps) / ratio - 0.5;
          const [sr, sg, sb] = sampleRgbaBilinear(rgba, srcW, srcH, sx, sy);
          r += sr;
          g += sg;
          b += sb;
        }
      }
      const dx = x + padX;
      const dy = y + padY;
      data[0 * size * size + dy * size + dx] = r * weight;
      data[1 * size * size + dy * size + dx] = g * weight;
      data[2 * size * size + dy * size + dx] = b * weight;
    }
  }
  return { data, ratio, padX, padY };
}

/**
 * One box of the page resampled to `size`×`size` grayscale (0–1), optionally
 * rotated about the box centre. Bilinear, with a few taps per pixel when the
 * box is larger than the output — the nearest-neighbour sampling this used to
 * do turned 1–2 px strokes into broken dots on a large bubble.
 */
export function cropGray(
  rgba: Buffer | Uint8Array,
  srcW: number,
  srcH: number,
  box: MokuroBox,
  size: number,
  rotateDeg = 0,
): Float32Array {
  const [xmin, ymin, xmax, ymax] = box;
  const bw = Math.max(1, xmax - xmin);
  const bh = Math.max(1, ymax - ymin);
  const out = new Float32Array(size * size);
  const rad = (rotateDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = (xmin + xmax) / 2;
  const cy = (ymin + ymax) / 2;
  const tapsX = tapsFor(bw / size, 4);
  const tapsY = tapsFor(bh / size, 4);
  const weight = 1 / (tapsX * tapsY * 255);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let sum = 0;
      for (let ty = 0; ty < tapsY; ty++) {
        // crop-local coords of this tap, centred on the box
        const ly = ((y + (ty + 0.5) / tapsY) / size) * bh - bh / 2;
        for (let tx = 0; tx < tapsX; tx++) {
          const lx = ((x + (tx + 0.5) / tapsX) / size) * bw - bw / 2;
          const rx = lx * cos - ly * sin;
          const ry = lx * sin + ly * cos;
          // box edges are pixel edges; the sampler wants pixel centres
          const [r, g, b] = sampleRgbaBilinear(rgba, srcW, srcH, cx + rx - 0.5, cy + ry - 0.5);
          sum += 0.299 * r + 0.587 * g + 0.114 * b;
        }
      }
      out[y * size + x] = sum * weight;
    }
  }
  return out;
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
  const gray = cropGray(rgba, srcW, srcH, box, OCR_SIZE, rotateDeg);
  const plane = OCR_SIZE * OCR_SIZE;
  const data = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    // grayscale then RGB (manga-ocr training path)
    const v = (gray[i] - 0.5) / 0.5;
    data[i] = v;
    data[plane + i] = v;
    data[2 * plane + i] = v;
  }
  return new runtime.Tensor('float32', data, [1, 3, OCR_SIZE, OCR_SIZE]);
}

// ----- IPC request hygiene -----------------------------------------------

/** The renderer's detection setting, or undefined (the detector's default) for anything else. */
export function parseDetectionSensitivity(value: unknown): DetectionSensitivity | undefined {
  return value === 'low' || value === 'normal' || value === 'high' ? value : undefined;
}

/**
 * The `mangaOcr:scanPage` payload as `scanMangaPage` takes it. Rebuilt field by
 * field (the renderer is not trusted to send only these), and that rebuild used
 * to leave `detectionSensitivity` out, so every page scan and rescan ran at
 * "normal" whatever the reader's setting said.
 */
export function scanRequestFromIpc(r: MangaOcrScanRequest): MangaOcrScanRequest {
  const detectionSensitivity = parseDetectionSensitivity(r.detectionSensitivity);
  return {
    itemId: r.itemId,
    mediaUrl: r.mediaUrl,
    force: !!r.force,
    ...(detectionSensitivity ? { detectionSensitivity } : null),
    ...(r.priority === 'prefetch' ? { priority: 'prefetch' as const } : null),
  };
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
  /** Line map (`det`) binarization threshold. */
  lineThresh: number;
  /** Minimum mean line-map probability of a kept line. */
  lineBoxThresh: number;
  /** Minimum objectness × class score of a detector text block. */
  blockConf: number;
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
  lineThresh: 0.35,
  lineBoxThresh: 0.6,
  blockConf: 0.5,
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
        lineThresh: 0.2,
        lineBoxThresh: 0.35,
        blockConf: 0.25,
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
        lineThresh: 0.3,
        lineBoxThresh: 0.5,
        blockConf: 0.4,
      };
  }
}

export interface DetectedRegion {
  box: MokuroBox;
  score: number;
  points: Array<{ x: number; y: number }>;
  /**
   * Set by the line grouping (`finalizeTextBlocks`): the block's text lines in
   * reading order, each read on its own, as Mokuro does. Absent on a region
   * that is not a grouped block (a whole image, a hand-drawn box).
   */
  lines?: Array<{ box: MokuroBox; fontSize: number }>;
  vertical?: boolean;
  fontSize?: number;
}

function boxPoints(box: MokuroBox): Array<{ x: number; y: number }> {
  return [
    { x: box[0], y: box[1] },
    { x: box[2], y: box[1] },
    { x: box[2], y: box[3] },
    { x: box[0], y: box[3] },
  ];
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

/**
 * The detection pipeline the scanner uses: drop weak speckles, cap runaway
 * detections by area, then group the mask's fragments into text lines and the
 * lines into speech-bubble blocks in reading order (`shared/mangaTextLines.ts`).
 *
 * `finalizeRegions` above unions anything within 14 px into one box, so two
 * close bubbles or a caption beside a bubble became one crop, read in no line
 * order. The fragment cap is wider than the block cap because a fragment is now
 * a line or part of one, not a bubble.
 */
export function finalizeTextBlocks(
  regions: DetectedRegion[],
  pageW = 0,
  pageH = 0,
  tuning: DetectTuning = LEGACY_TUNING,
  blockBoxes: readonly MokuroBox[] = [],
): DetectedRegion[] {
  const sized =
    pageW > 0 && pageH > 0 ? filterWeakRegions(regions, pageW, pageH, tuning) : regions.slice();
  const fragments = sized
    .sort((a, b) => boxArea(b.box) - boxArea(a.box))
    .slice(0, tuning.maxRegions * 4);
  const blocks = groupTextLines(fragments, blockBoxes);
  // Keep the largest blocks when a page overflows the cap, in reading order.
  const kept = new Set(
    blocks
      .slice()
      .sort((a, b) => boxArea(b.box) - boxArea(a.box))
      .slice(0, tuning.maxRegions),
  );
  return blocks
    .filter((block) => kept.has(block))
    .map((block) => ({
      box: block.box,
      score: block.score,
      points: boxPoints(block.box),
      lines: block.lines.map((line) => ({ box: line.box, fontSize: line.fontSize })),
      vertical: block.vertical,
      fontSize: block.fontSize,
    }));
}

function pick2dMask(outputs: OrtNamespace.Tensor[]): Float32Array | null {
  // Prefer the output whose spatial size is closest to DETECT_SIZE²
  let best: { t: OrtNamespace.Tensor; score: number } | null = null;
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

/**
 * The scanner's detection, from comic-text-detector's line map (`det`) and
 * block head (`blk`), with the stroke mask (`seg`) tightening each line to its
 * glyphs (see `shared/mangaTextDetect.ts`). Null when the model's outputs are
 * not that shape, so the caller falls back to the mask-only path.
 */
function regionsFromLineMap(
  outMap: Record<string, OrtNamespace.Tensor>,
  srcW: number,
  srcH: number,
  ratio: number,
  padX: number,
  padY: number,
  tuning: DetectTuning,
): DetectedRegion[] | null {
  const det = outMap.det;
  if (!det || det.dims.length !== 4 || det.dims[1] < 1) return null;
  const mh = det.dims[2];
  const mw = det.dims[3];
  if (mh < 32 || mw < 32) return null;
  const toDetX = DETECT_SIZE / mw;
  const toDetY = DETECT_SIZE / mh;
  const lineMap = (det.data as Float32Array).subarray(0, mw * mh);
  const contentW = (padX + srcW * ratio) / toDetX;
  const contentH = (padY + srcH * ratio) / toDetY;
  const lines = linesFromShrinkMap(
    lineMap,
    mw,
    mh,
    { ...DEFAULT_LINE_MAP_OPTIONS, thresh: tuning.lineThresh, boxThresh: tuning.lineBoxThresh },
    Math.ceil(contentW),
    Math.ceil(contentH),
  );
  const seg = outMap.seg;
  const segData =
    seg && seg.dims.length === 4 && seg.dims[2] === mh && seg.dims[3] === mw
      ? (seg.data as Float32Array).subarray(0, mw * mh)
      : null;
  const toSrc = (box: MokuroBox): MokuroBox => {
    const x0 = Math.max(0, Math.min(srcW, (box[0] * toDetX - padX) / ratio));
    const y0 = Math.max(0, Math.min(srcH, (box[1] * toDetY - padY) / ratio));
    const x1 = Math.max(0, Math.min(srcW, (box[2] * toDetX - padX) / ratio));
    const y1 = Math.max(0, Math.min(srcH, (box[3] * toDetY - padY) / ratio));
    return [x0, y0, Math.max(x0 + 1, x1), Math.max(y0 + 1, y1)];
  };
  const tight = segData
    ? lines.map((line) => ({ ...line, box: tightenToMask(line.box, segData, mw, mh) }))
    : lines;
  // A column of one glyph is often too short for the line map; the stroke mask has it.
  const orphans = segData ? orphanGlyphs(segData, mw, mh, tight.map((l) => l.box)) : [];
  const fragments: DetectedRegion[] = [...tight, ...orphans].map((line) => {
    const box = toSrc(line.box);
    return { box, score: line.score, points: boxPoints(box) };
  });
  const blk = outMap.blk;
  const blockBoxes =
    blk && blk.dims.length === 3 && blk.dims[2] >= 5
      ? blocksFromYolo(blk.data as Float32Array, blk.dims[1], blk.dims[2], tuning.blockConf).map((b) =>
          // The block head works in the 1024 input space whatever the map size.
          toSrc([b.box[0] / toDetX, b.box[1] / toDetY, b.box[2] / toDetX, b.box[3] / toDetY]),
        )
      : [];
  // The page-area gate in `filterWeakRegions` is for mask speckles; a line or a
  // lone glyph here already passed the line map or the stroke mask, and a small
  // glyph on a low-resolution scan is below that gate. Only slivers go.
  const kept = fragments.filter((f) => Math.min(f.box[2] - f.box[0], f.box[3] - f.box[1]) >= 4);
  return finalizeTextBlocks(kept, 0, 0, tuning, blockBoxes);
}

/**
 * How the page goes into the detector: top-left, black padding to the right or
 * below — the letterbox comic-text-detector was trained with. Centring it on
 * gray (what this used to do) is the form other YOLO exports use.
 */
const DETECT_LETTERBOX = { align: 'start', fill: 0 } as const;

async function detectRegions(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  sensitivity?: DetectionSensitivity,
): Promise<DetectedRegion[]> {
  const tuning = detectTuning(sensitivity);
  if (!detector) throw new Error('Detector not loaded');
  const runtime = await loadOrt();
  const { data, ratio, padX, padY } = letterboxRgb(rgba, srcW, srcH, DETECT_SIZE, DETECT_LETTERBOX);
  const tensor = new runtime.Tensor('float32', data, [1, 3, DETECT_SIZE, DETECT_SIZE]);
  const inputName = detector.inputNames[0];
  const feeds: Record<string, OrtNamespace.Tensor> = { [inputName]: tensor };
  const outMap = await detector.run(feeds);
  const fromLines = regionsFromLineMap(outMap, srcW, srcH, ratio, padX, padY, tuning);
  if (fromLines) return fromLines;
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
  // Drop speckles, cap by area, group fragments into lines and lines into blocks.
  return finalizeTextBlocks(regions, srcW, srcH, tuning);
}

// ----- manga-ocr recognize -----------------------------------------------

/** Decoded text plus how confident the decoder was, 0-1. */
interface MangaCropRead {
  unsure?: OcrUnsureChar[];
  text: string;
  confidence: number;
}

/**
 * One decoding step of manga-ocr, for a caller that wants to second-guess a
 * character (the shared OCR router's per-character fallback and dictionary-
 * guided decoding). manga-ocr's tokenizer is character level, so a step is a
 * character in practice.
 */
export interface MangaOcrTokenStep {
  /** The token the greedy decoder chose. */
  token: string;
  /** Its softmax probability, 0-1. */
  prob: number;
  /** The most likely tokens at this step, best first; the chosen one is first. Special tokens are left out. */
  candidates: Array<{ token: string; prob: number }>;
}

/** A crop read by manga-ocr, with the detail the OCR router needs. */
export interface MangaCropRecognition {
  /** The text after manga-ocr's post-processing (what the reader shows). */
  text: string;
  /** The tokens joined as decoded, before post-processing; `steps` line up with this. */
  rawText: string;
  /** Geometric mean of the chosen tokens' probabilities (see shared/ocrConfidence.ts). */
  confidence: number;
  /** True when the decoder hit the token ceiling without finishing (a repetition loop). */
  truncated: boolean;
  /** Per-step top-k candidates, present when `topK` was asked for. */
  steps?: MangaOcrTokenStep[];
}

/**
 * The `k` most likely non-special tokens in one logits row, with softmax
 * probabilities. Exported for tests; the softmax is computed in log space like
 * `tokenProbability`, so large logits do not overflow.
 */
export function topKTokens(
  row: Float32Array | readonly number[],
  offset: number,
  vocabSize: number,
  k: number,
  vocabList: readonly string[],
): Array<{ id: number; token: string; prob: number }> {
  if (k <= 0 || vocabSize <= 0) return [];
  let max = -Infinity;
  for (let i = 0; i < vocabSize; i++) if (row[offset + i] > max) max = row[offset + i];
  if (!Number.isFinite(max)) return [];
  let sum = 0;
  for (let i = 0; i < vocabSize; i++) sum += Math.exp(row[offset + i] - max);
  // Keep a small sorted list instead of sorting the whole (~6k) row.
  const best: Array<{ id: number; v: number }> = [];
  for (let i = FIRST_TEXT_TOKEN; i < vocabSize; i++) {
    const v = row[offset + i];
    if (best.length === k && v <= best[k - 1].v) continue;
    let at = best.length;
    while (at > 0 && best[at - 1].v < v) at--;
    best.splice(at, 0, { id: i, v });
    if (best.length > k) best.pop();
  }
  return best.map(({ id, v }) => ({ id, token: vocabList[id] ?? '', prob: Math.exp(v - max) / sum }));
}

/**
 * One region cropped out of the page's RGBA pixels as a PNG data URL (the
 * native image wants BGRA), for a recognizer that reads images, not tensors.
 */
export function cropRegionDataUrl(rgba: Buffer, srcW: number, srcH: number, box: MokuroBox): string {
  const pad = 4;
  const x0 = Math.max(0, Math.floor(box[0]) - pad);
  const y0 = Math.max(0, Math.floor(box[1]) - pad);
  const x1 = Math.min(srcW, Math.ceil(box[2]) + pad);
  const y1 = Math.min(srcH, Math.ceil(box[3]) + pad);
  const w = Math.max(1, x1 - x0);
  const h = Math.max(1, y1 - y0);
  const bgra = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const src = ((y0 + y) * srcW + (x0 + x)) * 4;
      const dst = (y * w + x) * 4;
      bgra[dst] = rgba[src + 2];
      bgra[dst + 1] = rgba[src + 1];
      bgra[dst + 2] = rgba[src];
      bgra[dst + 3] = rgba[src + 3];
    }
  }
  return nativeImage.createFromBitmap(bgra, { width: w, height: h }).toDataURL();
}

/**
 * Read one detected region in the study language. manga-ocr is a Japanese
 * model: on a Chinese manhua or a Russian comic it answers with fluent Japanese
 * that is not on the page. Those regions go to PaddleOCR's recognizer for the
 * language instead (the page's regions still come from the comic detector).
 */
async function recognizeCrop(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  box: MokuroBox,
  _points: Array<{ x: number; y: number }>,
): Promise<MangaCropRead> {
  return readRoutedMangaCrop(cropRegionDataUrl(rgba, srcW, srcH, box), box[3] - box[1] > box[2] - box[0], getMainStudyLang() === 'ja');
}

async function readRoutedMangaCrop(dataUrl: string, vertical: boolean, line = true): Promise<MangaCropRecognition & { unsure: OcrUnsureChar[] }> {
  const read = await readOcrSurface(nativeImage.createFromDataURL(dataUrl), {
    langs: [getMainStudyLang()], purpose: 'manga', line,
    orientation: vertical ? 'vertical' : 'horizontal',
  });
  if (!read.ok && read.error !== 'empty') throw new Error(read.error ?? 'ocr-failed');
  const chars = read.lines.flatMap((line) => line.chars ?? []);
  const steps = chars.map((char) => ({ token: char.ch, prob: char.p, candidates: [{ token: char.ch, prob: char.p }, ...char.alts.map((alt) => ({ token: alt.ch, prob: alt.p }))] }));
  return { text: read.text, rawText: read.text, confidence: read.confidence ?? 0, truncated: false, unsure: read.unsure,
    ...(chars.map((char) => char.ch).join('') === read.text ? { steps } : {}) };
}

async function recognizeCropJapanese(
  rgba: Buffer,
  srcW: number,
  srcH: number,
  box: MokuroBox,
  points: Array<{ x: number; y: number }>,
  topK = 0,
): Promise<MangaCropRecognition> {
  if (!encoder || !decoder || !vocab) throw new Error('OCR models not loaded');
  noteModelUse();
  const runtime = await loadOrt();
  const vocabList = vocab;

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
  const steps: MangaOcrTokenStep[] = [];
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
    const prob = tokenProbability(data, lastRow, vocabSize, best);
    tokenProbs.push(prob);
    if (topK > 0 && best >= FIRST_TEXT_TOKEN) {
      steps.push({
        token: vocabList[best] ?? '',
        prob,
        candidates: topKTokens(data, lastRow, vocabSize, topK, vocabList).map(({ token, prob: p }) => ({
          token,
          prob: p,
        })),
      });
    }
    if (best === EOS) {
      finished = true;
      break;
    }
  }

  let text = '';
  for (const id of tokenIds) {
    if (id < FIRST_TEXT_TOKEN) continue;
    text += vocabList[id] ?? '';
  }
  return {
    text: postprocessMangaOcrText(text),
    rawText: text,
    // Never finishing means the token ceiling was hit, which in practice is a
    // repetition loop; sequenceConfidence caps those rather than rewarding them.
    confidence: sequenceConfidence(tokenProbs, { truncated: !finished }),
    truncated: !finished,
    ...(topK > 0 ? { steps } : null),
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
    const raw = await readJson<unknown>(p, {}, { validate: (v) => typeof v === 'object' && v !== null });
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
  // The user's hand corrections: keep a last-good copy (unlike the OCR caches below).
  await writeJsonAtomic(correctionsPath(itemId, stem), map);
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
  await writeJsonAtomic(cachePath(itemId, stem), page, { backup: false });
}

export async function loadMangaOcrCache(itemId: string, mediaUrl: string): Promise<MokuroPage | null> {
  const resolved = resolveMediaPath(mediaUrl);
  if (!resolved || resolved.itemId !== itemId) return null;
  const p = cachePath(itemId, resolved.stem);
  try {
    const raw = await readJson<unknown>(p, null);
    const page = parseCachedMangaPage(raw);
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
    const raw = await readJson<{ page?: unknown } | null>(
      translateCachePath(itemId, resolved.stem, targetLang),
      null,
    );
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
  await writeJsonAtomic(
    translateCachePath(itemId, stem, targetLang),
    { version: 1, targetLang, page },
    { backup: false },
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

function parseCachedMangaPage(raw: unknown): MokuroPage {
  const page = parseMokuroPage(raw);
  const blocks = (raw as { blocks: unknown[] }).blocks;
  return { ...page, blocks: page.blocks.map((block, i) => ({ ...block, unsure: ocrUnsureOf(blocks[i], block.lines.join('\n')) })) };
}

/** Read the on-disk cache file as literally persisted (no corrections applied). */
async function readRawCachePage(itemId: string, stem: string): Promise<MokuroPage | null> {
  try {
    return parseCachedMangaPage(await readJson<unknown>(cachePath(itemId, stem), null));
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

/**
 * Read one detected block. A grouped block is read line by line, like Mokuro:
 * each line's crop goes to manga-ocr on its own and its text is one entry of
 * the block's `lines`, in the block's reading order. The confidence is the
 * lines' mean weighted by text length. Anything else — no lines, or a study
 * language manga-ocr does not read (PaddleOCR finds its own lines in the crop)
 * — is read as one crop, as before.
 */
async function recognizeRegion(
  rgba: Buffer,
  width: number,
  height: number,
  region: DetectedRegion,
): Promise<{ lines: string[]; confidence: number; unsure?: OcrUnsureChar[] }> {
  if (region.lines?.length && getMainStudyLang() === 'ja') {
    const read = await readBlockLines(rgba, width, height, region, 0);
    let offset = 0;
    const unsure = read.lines.flatMap((line) => {
      const fixes = (line.unsure ?? []).map((fix) => ({ ...fix, at: fix.at + offset }));
      offset += [...line.text].length + 1;
      return fixes;
    });
    return { lines: read.lines.map((l) => l.text), confidence: read.confidence, unsure };
  }
  const read = await recognizeCrop(rgba, width, height, region.box, region.points);
  return { lines: read.text ? [read.text] : [], confidence: read.confidence, unsure: read.unsure };
}

/** One line of a block as `readMangaTextBlock` returns it. */
export interface MangaBlockLineRead extends MangaCropRecognition {
  unsure?: OcrUnsureChar[];
  /** The line's crop on the page (the line box plus a small margin). */
  box: MokuroBox;
}

async function readBlockLines(
  rgba: Buffer,
  width: number,
  height: number,
  region: DetectedRegion,
  topK: number,
  providerOnly = false,
): Promise<{ lines: MangaBlockLineRead[]; confidence: number }> {
  const lines: MangaBlockLineRead[] = [];
  let weighted = 0;
  let chars = 0;
  for (const line of region.lines ?? []) {
    const crop = lineCropBox(line, width, height);
    const read: MangaCropRecognition & { unsure?: OcrUnsureChar[] } = providerOnly
      ? await recognizeCropJapanese(rgba, width, height, crop, boxPoints(crop), topK)
      : await readRoutedMangaCrop(cropRegionDataUrl(rgba, width, height, crop), region.vertical ?? true);
    const text = read.text.trim();
    if (!text) continue;
    lines.push({ ...read, text, box: crop });
    weighted += read.confidence * text.length;
    chars += text.length;
  }
  return { lines, confidence: chars ? weighted / chars : 0 };
}

// ----- API for the shared OCR router and dev tools ----------------------
//
// These take a decoded page (RGBA, row-major) so a caller that already holds
// pixels — the OCR router with a snip, `tools/ocr-eval` with a test page — runs
// exactly the reader's pipeline without going through a library item.

/**
 * comic-text-detector over one page, grouped into blocks of lines in reading
 * order (`finalizeTextBlocks`). Loads the models on first use.
 */
export async function detectMangaTextBlocks(
  rgba: Buffer,
  width: number,
  height: number,
  sensitivity?: DetectionSensitivity,
): Promise<DetectedRegion[]> {
  await ensureModels();
  return detectRegions(rgba, width, height, sensitivity);
}

/**
 * Read one detected block line by line with manga-ocr (Japanese), keeping each
 * line's crop, confidence and — with `topK` — its per-step candidates. A block
 * without lines (a hand-drawn box) is read as one crop.
 */
export async function readMangaTextBlock(
  rgba: Buffer,
  width: number,
  height: number,
  region: DetectedRegion,
  opts: { topK?: number } = {},
): Promise<{ lines: MangaBlockLineRead[]; confidence: number }> {
  await ensureModels();
  const topK = Math.max(0, Math.floor(opts.topK ?? 0));
  if (region.lines?.length) return readBlockLines(rgba, width, height, region, topK);
  const read = await readRoutedMangaCrop(cropRegionDataUrl(rgba, width, height, region.box), region.vertical ?? true);
  const text = read.text.trim();
  return text
    ? { lines: [{ ...read, text, box: region.box }], confidence: read.confidence }
    : { lines: [], confidence: 0 };
}

/**
 * manga-ocr on one crop of a decoded image: the entry point for the OCR
 * router's per-line / per-character fallback. `box` is in image pixels; the
 * crop is resampled to the model's 224×224 input as the reader does. Japanese
 * only — the router picks another engine for other languages.
 */
export async function recognizeMangaCrop(
  rgba: Buffer,
  width: number,
  height: number,
  box: MokuroBox,
  opts: { topK?: number } = {},
): Promise<MangaCropRecognition> {
  await ensureModels();
  return recognizeCropJapanese(rgba, width, height, box, boxPoints(box), Math.max(0, Math.floor(opts.topK ?? 0)));
}

/** `recognizeMangaCrop` over a whole image given as a data URL (a snip, a lens crop). */
export async function recognizeMangaCropDataUrl(
  dataUrl: string,
  opts: { topK?: number } = {},
): Promise<MangaCropRecognition> {
  await ensureModels();
  const decoded = rgbaFromDataUrl(dataUrl);
  if (!decoded) return { text: '', rawText: '', confidence: 0, truncated: false, ...(opts.topK ? { steps: [] } : null) };
  const { rgba, width, height } = decoded;
  return recognizeMangaCrop(rgba, width, height, [0, 0, width, height], opts);
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

/** The box a region id was made from (`regionIdFromBox`), or null for an id of another shape. */
export function boxFromRegionId(regionId: string): MokuroBox | null {
  const m = /:(-?\d+),(-?\d+),(-?\d+),(-?\d+)$/.exec(regionId);
  if (!m) return null;
  const box = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])] as MokuroBox;
  return box[2] > box[0] && box[3] > box[1] ? box : null;
}

function overlapScore(a: MokuroBox, b: MokuroBox): number {
  const inter = boxIntersectionArea(a, b);
  if (inter <= 0) return 0;
  const union = boxArea(a) + boxArea(b) - inter;
  const iou = union > 0 ? inter / union : 0;
  // A box that lies mostly inside the other (a bubble now read as a tighter
  // block, or one of two halves) still counts, a little below a true match.
  const containment = inter / Math.max(1, Math.min(boxArea(a), boxArea(b)));
  return Math.max(iou, containment * 0.8);
}

/**
 * Carry the user's corrections over to a fresh detection of the page.
 *
 * A correction is filed under its region's id, and the id is the region's box.
 * A forced rescan (a new sensitivity, a better detector) finds slightly
 * different boxes, so every correction used to be orphaned: still on disk,
 * matching nothing, and the user's fixed text silently replaced by the raw
 * read. Each correction whose region is gone moves to the new region that
 * overlaps its old box best (IoU, or mostly-contained at 0.8 weight; at least
 * 0.4), one to one, strongest overlaps first, never onto a region that has a
 * correction of its own. Unmatched corrections stay as they are.
 *
 * Returns the new map and which old ids moved where.
 */
export function carryCorrectionsToRegions(
  map: CorrectionMap,
  regions: ReadonlyArray<{ regionId: string; box: MokuroBox }>,
): { map: CorrectionMap; moved: Record<string, string> } {
  const current = new Set(regions.map((r) => r.regionId));
  const orphans = Object.keys(map).filter((id) => !current.has(id));
  if (!orphans.length) return { map, moved: {} };
  const pairs: Array<{ oldId: string; newId: string; score: number }> = [];
  for (const oldId of orphans) {
    const oldBox = boxFromRegionId(oldId);
    if (!oldBox) continue;
    for (const r of regions) {
      if (map[r.regionId]) continue;
      const score = overlapScore(oldBox, r.box);
      if (score >= 0.4) pairs.push({ oldId, newId: r.regionId, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const out: CorrectionMap = { ...map };
  const moved: Record<string, string> = {};
  const taken = new Set<string>();
  for (const { oldId, newId } of pairs) {
    if (oldId in moved || taken.has(newId)) continue;
    out[newId] = out[oldId];
    delete out[oldId];
    moved[oldId] = newId;
    taken.add(newId);
  }
  return { map: out, moved };
}

/**
 * One queue for every page scan (see `mangaScanQueue.ts`): the page the reader
 * shows first, then its read-ahead, then whole-volume work.
 */
const scanQueue = createMangaScanQueue<MangaOcrScanRequest, MokuroPage>((req, shouldCancel) =>
  scanMangaPage(req, { shouldCancel }),
);

/**
 * Scan a page through the queue. A `page` request first cancels the item's
 * scans of other pages, then answers from the cache when it can without waiting
 * for the queue — a turn to a page already read must not sit behind a volume
 * pass's current page.
 */
export async function requestMangaPageScan(
  req: MangaOcrScanRequest,
  priority: MangaScanPriority = req.priority === 'prefetch' ? 'prefetch' : 'page',
  opts: { shouldCancel?: () => boolean } = {},
): Promise<MokuroPage> {
  if (priority === 'page') scanQueue.cancelOthers(req.itemId, req.mediaUrl);
  if (!req.force) {
    const cached = await loadMangaOcrCache(req.itemId, req.mediaUrl);
    if (cached) {
      if (priority !== 'background') {
        broadcastProgress({
          itemId: req.itemId,
          mediaUrl: req.mediaUrl,
          phase: 'done',
          current: cached.blocks.length,
          total: cached.blocks.length,
          page: cached,
        });
      }
      return cached;
    }
  }
  return scanQueue.request(req, priority, opts);
}

export async function scanMangaPage(
  req: MangaOcrScanRequest,
  opts: { shouldCancel?: () => boolean } = {},
): Promise<MokuroPage> {
  const checkCancel = (): void => {
    if (opts.shouldCancel?.()) throw new MangaScanCancelled();
  };
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
  checkCancel();
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
  checkCancel();
  const regionIds = regions.map((r) =>
    regionIdFromBox(r.box.map((n) => Math.round(n)) as MokuroBox, stem),
  );
  const savedCorrections = await readCorrections(itemId, stem);
  const carried = carryCorrectionsToRegions(
    savedCorrections,
    regions.map((r, i) => ({ regionId: regionIds[i], box: r.box })),
  );
  const corrections = carried.map;
  const previousPage = await readRawCachePage(itemId, stem);
  const prevRawByRegion = new Map<string, string[]>();
  if (previousPage) {
    for (const b of previousPage.blocks) {
      if (b.regionId && b.rawLines) prevRawByRegion.set(b.regionId, b.rawLines);
    }
  }
  const blocks: MokuroBlock[] = [];
  const total = Math.max(1, regions.length);
  // The reader says "reading bubble 1 of N" from here, not "finding text" until
  // the first block is done.
  broadcastProgress({
    itemId,
    mediaUrl,
    phase: 'ocr',
    current: 0,
    total,
    page: { version: MOKURO_EMIT_VERSION, img_width: width, img_height: height, blocks: [] },
  });

  for (let i = 0; i < regions.length; i++) {
    checkCancel();
    const region = regions[i];
    const [xmin, ymin, xmax, ymax] = region.box;
    const bw = xmax - xmin;
    const bh = ymax - ymin;
    const regionId = regionIds[i];
    const correction = corrections[regionId];
    // How sure the decoder was about this region's text. Starts at 1 so a
    // reused cached read or a user correction is treated as certain.
    let readConfidence = 1;
    let unsure: OcrUnsureChar[] = [];
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
          const read = await recognizeRegion(rgba, width, height, region);
          rawLines = read.lines;
          readConfidence = read.confidence;
        } catch (err) {
          console.error('[mangaOcr] region raw-backfill failed', regionId, err);
          rawLines = [];
        }
      }
      lines = [...correction.lines];
    } else {
      try {
        const read = await recognizeRegion(rgba, width, height, region);
        rawLines = read.lines;
        readConfidence = read.confidence;
        unsure = read.unsure ?? [];
      } catch (err) {
        console.error('[mangaOcr] region failed', regionId, err);
        rawLines = [];
      }
      lines = [...rawLines];
    }
    const vertical = correction?.vertical ?? region.vertical ?? guessVertical(bw, bh);
    // The grouped block's own glyph size when there is one (Mokuro's
    // `font_size`); the old box-proportional guess otherwise.
    const fontSize = region.fontSize ? Math.max(10, region.fontSize) : Math.max(10, Math.min(bw, bh) * 0.12);
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
      ...(!correction?.lines && !junk ? { unsure } : {}),
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
  checkCancel();
  await writeCache(itemId, stem, page);
  if (Object.keys(carried.moved).length) await writeCorrections(itemId, stem, corrections);
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
  let unsure: OcrUnsureChar[] = [];
  try {
    const read = await recognizeBox(rgba, width, height, block.box);
    text = read.text;
    confidence = read.confidence;
    unsure = read.unsure ?? [];
  } catch (err) {
    console.error('[mangaOcr] region rescan failed', req.regionId, err);
  }
  const rawLines = text ? [text] : [];
  const patchedRaw: MokuroPage = {
    ...raw,
    blocks: raw.blocks.map((b) =>
      b.regionId === req.regionId ? { ...b, rawLines, confidence, unsure } : b,
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
  let unsure: OcrUnsureChar[] = [];
  try {
    const read = await recognizeBox(rgba, width, height, box);
    text = read.text;
    confidence = read.confidence;
    unsure = read.unsure ?? [];
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
    ...(unsure.length ? { unsure } : {}),
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
    ...(read.unsure?.length ? { unsure: read.unsure } : {}),
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
  let unsure: OcrUnsureChar[] = [];
  try {
    const read = await recognizeBox(rgba, width, height, box);
    text = read.text;
    readConfidence = read.confidence;
    unsure = read.unsure ?? [];
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
    ...(unsure.length ? { unsure } : {}),
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
  return (await recognizeCropJapanese(rgba, width, height, region.box, region.points)).text;
}

export interface MangaOcrRegionLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
  chars?: OcrChar[];
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
    // Raw provider path: never enter the router from a provider's page read.
    const read = region.lines?.length
      ? await readBlockLines(rgba, width, height, region, 4, true)
      : await recognizeCropJapanese(rgba, width, height, region.box, region.points, 4).then((line) => ({ lines: [{ ...line, box: region.box }], confidence: line.confidence }));
    const chars = read.lines.flatMap((line) => mangaStepsToChars(line.text, line.steps) ?? []);
    // One entry per bubble: its lines, in reading order, make one text.
    const text = read.lines.map((line) => line.text).join('').trim();
    if (!text) continue;
    const [x0, y0, x1, y1] = region.box;
    lines.push({
      text,
      box: [x0, y0, x1, y1],
      vertical: region.vertical ?? y1 - y0 > x1 - x0,
      confidence: read.confidence,
      ...(chars.map((char) => char.ch).join('') === text ? { chars } : {}),
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
): Promise<{
  page: MokuroPage;
  requested: number;
  translated: number;
  /** Why nothing translated, when nothing did. */
  failure?: TranslateBatchFailure;
}> {
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
  const failure = byId.size === 0
    ? summarizeTranslateFailure(results.length ? results : items.map((i) => ({ id: i.id, text: '' })))
    : null;
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
    ...(failure ? { failure } : null),
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
  /** The warning as a catalog key for the renderer, and why pages failed. */
  warningKey?: string;
  warningVars?: Record<string, string | number>;
  failure?: TranslateBatchFailure;
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
      failure: { reason: 'model-missing' },
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
  /** The first such page's reason — one fix usually covers them all. */
  let firstFailure: TranslateBatchFailure | undefined;
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
      const pageReq: MangaOcrScanRequest = {
        itemId,
        mediaUrl,
        force,
        detectionSensitivity: req.detectionSensitivity,
      };
      const stop = { shouldCancel: () => volumeCancel.has(itemId) };
      let page: MokuroPage;
      try {
        // Behind whatever page the reader shows, and its read-ahead.
        page = await requestMangaPageScan(pageReq, 'background', stop);
      } catch (err) {
        if (!isMangaOcrCancelled(err) || volumeCancel.has(itemId)) {
          if (isMangaOcrCancelled(err)) continue;
          throw err;
        }
        // The reader's scan this pass had joined was cancelled by a page turn:
        // the volume still wants the page.
        page = await requestMangaPageScan(pageReq, 'background', stop);
      }

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
            firstFailure ??= result.failure;
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

    const localized = translateFailures > 0
      ? {
        warningKey: translateFailures === pageTotal
          ? 'manga.translate.warning.none'
          : 'manga.translate.warning.some',
        warningVars: { failed: translateFailures, total: pageTotal },
        ...(firstFailure ? { failure: firstFailure } : null),
      }
      : null;

    broadcastVolumeProgress({
      itemId,
      phase: 'done',
      pageIndex: pageTotal,
      pageTotal,
      ocrMeta,
      ...(warning ? { warning } : null),
    });
    return { ok: true, ocrMeta, ...(warning ? { warning } : null), ...localized };
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

// ----- Mokuro volume import ---------------------------------------------

/**
 * Write a Mokuro `.mokuro` volume into this item's OCR cache, one page file per
 * matched library page, in the same schema a scan writes — so the overlay, the
 * clean-text view, region editing, mining and translation all work on it
 * without knowing where the boxes came from. No model is needed.
 *
 * A page that already had a cache is overwritten (the user asked for this
 * import); its old translation cache is removed, because those boxes no longer
 * exist and a stale translation would paint over the wrong bubbles.
 */
export async function importMokuroVolume(itemId: string, json: string): Promise<MangaMokuroImportResult> {
  if (json.length > MOKURO_VOLUME_MAX_BYTES) return { ok: false, reason: 'tooLarge' };
  let volume: MokuroVolume;
  try {
    volume = parseMokuroVolume(JSON.parse(json));
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  if (!volume.pages.length) return { ok: false, reason: 'noPages' };
  const stems: string[] = [];
  for (const url of listMangaPageUrls(itemId)) {
    const resolved = resolveMediaPath(url);
    if (resolved && resolved.itemId === itemId) stems.push(resolved.stem);
  }
  const match = matchMokuroPages(volume, stems);
  if (match.matchedBy === 'none' || !match.assignments.length) return { ok: false, reason: 'noMatch' };
  let existing: string[] = [];
  try {
    existing = await fsp.readdir(ocrDir(itemId));
  } catch {
    existing = [];
  }
  for (const { stem, page } of match.assignments) {
    await writeCache(itemId, stem, page);
    for (const name of existing) {
      if (!name.startsWith(`${stem}.tr.`) || !name.endsWith('.json')) continue;
      try {
        await fsp.unlink(path.join(ocrDir(itemId), name));
      } catch {
        /* already gone */
      }
    }
  }
  await refreshMangaOcrMeta(itemId, { broadcast: true });
  return { ok: true, pages: match.assignments.length, unmatched: match.unmatched, matchedBy: match.matchedBy };
}

// ----- IPC ---------------------------------------------------------------

export function registerMangaOcrIpc(): void {
  ensureUnloadHandlers();

  ipcMain.handle('mangaOcr:available', () => mangaOcrAvailable());

  ipcMain.handle('mangaOcr:recognizeImage', async (_e, dataUrl: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid image data.');
    }
    const read = await readOcrSurface(nativeImage.createFromDataURL(dataUrl), {
      langs: [getMainStudyLang()], purpose: 'manga', orientation: 'auto',
    });
    if (!read.ok && read.error !== 'empty') throw new Error(read.error ?? 'ocr-failed');
    return read.text;
  });

  // A hand-drawn character in a study language: manga-ocr reads Japanese, the
  // PaddleOCR recognizer of the language reads Chinese and Russian (manga-ocr
  // would answer a hanzi with a kanji reading of it, and never with Cyrillic).
  ipcMain.handle('ocr:recognizeGlyph', async (_e, dataUrl: unknown, lang: unknown) => {
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:')) {
      throw new Error('Invalid image data.');
    }
    const glyphLang = lang === 'zh' || lang === 'ru' ? lang : 'ja';
    const read = await readOcrSurface(nativeImage.createFromDataURL(dataUrl), {
      langs: [glyphLang], purpose: 'lens', line: true, orientation: 'auto',
    });
    return read.text;
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
      return await requestMangaPageScan(scanRequestFromIpc(r));
    } catch (err) {
      // A page turn superseded it: the reader is on another page, nothing failed.
      if (isMangaOcrCancelled(err)) throw err;
      // A read-ahead failing is not this page's error; the page itself will
      // report when the reader gets there.
      if (r.priority === 'prefetch') throw err;
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
      ...(hasLines && r.lines ? { lines: r.lines.map(String) } : null),
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
      detectionSensitivity: parseDetectionSensitivity(r.detectionSensitivity),
      startPage,
      endPage,
    });
  });

  ipcMain.handle('mangaOcr:cancelVolume', (_e, itemId: unknown) => {
    if (typeof itemId === 'string' && itemId) cancelMangaVolumeAnalyze(itemId);
    return { ok: true };
  });

  ipcMain.handle('mangaOcr:importMokuro', async (_e, itemId: unknown, json: unknown) => {
    if (typeof itemId !== 'string' || !itemId || typeof json !== 'string') {
      return { ok: false, reason: 'invalid' } satisfies MangaMokuroImportResult;
    }
    return importMokuroVolume(itemId, json);
  });

  ipcMain.handle('mangaOcr:refreshMeta', async (_e, itemId: unknown, targetLang: unknown) => {
    if (typeof itemId !== 'string' || !itemId) return null;
    const lang = typeof targetLang === 'string' && targetLang.trim() ? targetLang.trim() : 'en';
    return refreshMangaOcrMeta(itemId, { targetLang: lang });
  });
}

export const __mangaOcrRoutingTestables = { recognizeCrop, recognizeRegion, readBlockLines, parseCachedMangaPage };
