/**
 * Screen-region OCR for the Reading Lens.
 *
 * The browser extension OCR'd pixels the page handed it. The Reading Lens works
 * over the *whole desktop*, so it must grab pixels itself: `desktopCapturer`
 * screenshots the display at full physical resolution, we crop the lens region,
 * and feed the crop into the same OCR engines the bridge already uses
 * (`recognizePaddleOcrDataUrl` for printed text, `recognizeMangaOcrDataUrl` for
 * speech bubbles). Detected line boxes are converted back to region-relative
 * DIP so the renderer can paint an interactive hotspot exactly over each line —
 * the Lens window itself is transparent, so nothing here obscures the capture as
 * long as the renderer draws no opaque pixels over the region while scanning.
 */

import { desktopCapturer, screen } from 'electron';
import crypto from 'node:crypto';
import { paddleAssetsForLang, paddleOcrAvailable, installedPaddleLangs, type PaddleLang } from './paddleOcr';
import { mangaOcrAvailable } from './mangaOcr';
import { getAssetStatus, startDownload } from './downloads';
import { summarizeAssetBundle } from '../shared/assetBundleProgress';
import type { AssetError } from '../shared/assetRegistry';
import type { AutoOcrLine, AutoOcrResult, OcrEngineChoice } from './ocrAuto';
import { readOcrSurface } from './ocrSurface';
import { OCR_BUDGET_MS, unsureCharsOf, type OcrChar, type OcrPurpose, type OcrUnsureChar } from '../shared/ocrRouterTypes';
import { orderReadingLensLines } from '../shared/readingLensLineOrder';
import { getMainStudyLang } from './studyLanguage';
import { pickScreenSource } from './screenSources';
import { isE2eHeadless } from './e2eHeadless';
import { signatureFromBitmap, type RegionSignature } from './lensRegionWatch';

export interface LensOcrLine {
  unsure?: OcrUnsureChar[];
  text: string;
  /** [x, y, w, h] relative to the region's top-left, in DIP. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

/**
 * The other engine's read of the same pixels, already paid for.
 *
 * `auto` runs both engines whenever the routing heuristic fires, so when a
 * reader disagrees with the pick the losing read already exists in memory.
 * Carrying it here lets the Lens offer a swap with no second OCR pass at all.
 * Absent whenever only one engine ran, or the loser came back empty.
 */
export interface LensOcrAlternate {
  engine: 'manga' | 'web';
  lang?: string;
  lines: LensOcrLine[];
  text: string;
}

export interface LensOcrResult {
  ok: boolean;
  engine: 'manga' | 'web' | 'none';
  lang?: string;
  lines: LensOcrLine[];
  text: string;
  /** The engine that lost the comparison, offered as a no-cost swap. */
  alternate?: LensOcrAlternate;
  /** Whether the engine's models are installed. */
  available: boolean;
  /**
   * True only when a download of the missing models is actually queued or
   * running. It used to be set whenever the web model was missing, with nothing
   * started anywhere, so the Lens promised a download that never came.
   */
  downloading?: boolean;
  /**
   * The assets the missing engine needs, so the Lens can show their live
   * progress (or an install button) instead of a sentence.
   */
  missingAssets?: {
    ids: string[];
    /** What an install button should start: the parent of each requires-group. */
    startIds: string[];
    /** Why the automatic start was refused (e.g. not enough disk space). */
    error?: AssetError;
  };
  error?: string;
  /** Content hash of the captured crop, for change detection between scans. */
  hash: string;
  /** Upscale factor applied for accuracy on small text (1 = none). */
  zoom?: number;
  /** Optional bounded JPEG crop, requested only for study-card attachment. */
  screenshotDataUrl?: string;
  /** Served from the result cache: the same pixels, read by the same engine, a moment ago. */
  cached?: boolean;
  /**
   * Present only when the downloaded engine is missing and the study language
   * is Japanese: the lossless crop, for the renderer's bundled offline
   * recognizer (`shared/lensBasicOcr.ts`) to read while the model downloads.
   * `dipPerPixel` maps its pixel boxes back to region-relative DIP.
   */
  fallbackImage?: LensFallbackImage;
}

export interface LensFallbackImage {
  dataUrl: string;
  width: number;
  height: number;
  dipPerPixelX: number;
  dipPerPixelY: number;
}

/** Where a scan is, reported to the Lens while it runs. */
export type LensOcrStage = 'capturing' | 'reading' | 'refining';

export interface LensOcrRunOptions {
  engine?: OcrEngineChoice;
  purpose?: Extract<OcrPurpose, 'lens' | 'vn'>;
  langs?: readonly string[];
  budgetMs?: number;
  includeScreenshot?: boolean;
  /** The user's cancel: checked between capture and each OCR pass. */
  signal?: AbortSignal;
  onStage?: (stage: LensOcrStage) => void;
}

/** Region in the Lens window's local DIP coords (window covers one display at its origin). */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Manga OCR's full set, and what starts it (the encoder pulls its decoder and vocab). */
const MANGA_ASSETS = ['manga-ocr', 'manga-ocr-decoder', 'manga-ocr-vocab', 'comic-text-detector'];
const MANGA_START = ['manga-ocr', 'comic-text-detector'];

/**
 * Queue the web-OCR pack for `lang` when it is missing and not already on its
 * way, and report what the download manager says is actually happening.
 *
 * The web pack is ~15 MB and is what every Lens scan needs, so it is fetched on
 * first use the same way the browser extension's OCR route does
 * (`extensionServer.ts` ensureWebOcrModels). One language, and its parent id
 * only: the manager queues the shared detector and the charset as `requires`,
 * so there is no parallel fan-out to race on the detector's staging directory.
 * Manga OCR is ~550 MB and is never started without the user asking.
 */
async function ensureWebOcrModels(lang: PaddleLang): Promise<{
  downloading: boolean;
  missingAssets: NonNullable<LensOcrResult['missingAssets']>;
}> {
  const ids = paddleAssetsForLang(lang);
  const parent = `paddle-ocr-${lang}`;
  const before = summarizeAssetBundle(ids.map((id) => getAssetStatus(id)));
  let error: AssetError | undefined;
  // A headless test run never fetches a model pack on its own: the run must not
  // depend on (or wait for) the network, and a pack landing mid-run would change
  // what every later flow reads with. The offer is still returned, so the Lens
  // shows its install button exactly as it would for a user.
  if (before.state !== 'busy' && before.state !== 'installed' && !isE2eHeadless()) {
    try {
      const started = await startDownload(parent);
      if (!started.ok) error = started.error;
    } catch (err) {
      error = { key: 'assetError.generic', vars: { detail: err instanceof Error ? err.message : String(err) } };
    }
  }
  const after = summarizeAssetBundle(ids.map((id) => getAssetStatus(id)));
  const why = error ?? after.error;
  return {
    downloading: after.state === 'busy',
    missingAssets: { ids, startIds: [parent], ...(why ? { error: why } : null) },
  };
}

const EMPTY = (over: Partial<LensOcrResult>): LensOcrResult => ({
  ok: false,
  engine: 'none',
  lines: [],
  text: '',
  available: true,
  hash: '',
  ...over,
});

/**
 * Convert a display-local DIP region into a crop rect in thumbnail pixels,
 * clamped to the thumbnail, or `null` when nothing usable remains.
 *
 * Split out of `captureRegion` so the clamping is testable without Electron.
 * Every input here crosses an IPC boundary from a renderer, so it is treated as
 * untrusted: non-finite values (`NaN` from a `Number()` coercion, `Infinity`
 * from a runaway drag) must reject rather than reach `nativeImage.crop`, which
 * is native code with no contract for them. `NaN <= 1` is `false`, so the
 * dimension check below is not on its own sufficient — the finite guard is.
 */
function regionToPixels(
  region: RegionRect,
  scale: number | CaptureScale,
  size: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const finite = (n: number): boolean => Number.isFinite(n);
  if (!finite(region.x) || !finite(region.y) || !finite(region.width) || !finite(region.height)) {
    return null;
  }
  const sx = typeof scale === 'number' ? scale : scale.x;
  const sy = typeof scale === 'number' ? scale : scale.y;
  if (!finite(sx) || sx <= 0 || !finite(sy) || sy <= 0) return null;
  if (!finite(size.width) || !finite(size.height)) return null;

  const x = Math.max(0, Math.round(region.x * sx));
  const y = Math.max(0, Math.round(region.y * sy));
  // A region whose origin is already past the thumbnail has no overlap at all.
  if (x >= size.width || y >= size.height) return null;

  // Clamp the crop to the actual thumbnail so a region straddling an edge is safe.
  const width = Math.min(Math.round(region.width * sx), size.width - x);
  const height = Math.min(Math.round(region.height * sy), size.height - y);
  if (width <= 1 || height <= 1) return null;

  return { x, y, width, height };
}

/** Physical capture pixels per DIP, per axis. */
interface CaptureScale {
  x: number;
  y: number;
}

/**
 * How many captured pixels one DIP covers, read from the capture itself.
 *
 * `display.scaleFactor` is what the capture was *asked* to be, not what it is:
 * `desktopCapturer` fits the screen into the requested thumbnail, and on a
 * fractional scale (125 %, 175 %) the DIP bounds are already rounded, so
 * `bounds × scaleFactor` is off by a pixel or more on a 4K panel — and a capturer
 * that hands back a smaller frame than asked (a capped size, a driver that
 * ignores the request) would put every crop in the wrong place by a whole
 * factor. The real ratio of frame to bounds is right in every one of those
 * cases. When it agrees with the scale factor to within 1.5 % the scale factor
 * itself is used, so exact setups keep their exact integer crops.
 */
function captureScale(
  bounds: { width: number; height: number },
  frame: { width: number; height: number },
  scaleFactor: number,
): CaptureScale | null {
  const sf = Number.isFinite(scaleFactor) && scaleFactor > 0 ? scaleFactor : 1;
  if (!(bounds.width > 0 && bounds.height > 0 && frame.width > 0 && frame.height > 0)) return null;
  const x = frame.width / bounds.width;
  const y = frame.height / bounds.height;
  const near = (v: number): boolean => Math.abs(v - sf) / sf <= 0.015;
  return { x: near(x) ? sf : x, y: near(y) ? sf : y };
}

// Which capturer source shows which display: `screenSources.ts`, shared with the
// Region Recorder (the rule and its reasoning live there).

/**
 * Grab `region` (display-local DIP) from `displayId` as a PNG data URL at full
 * physical resolution. Returns the crop and the display's scale factor so the
 * caller can map pixel boxes back to DIP.
 */
async function captureRegion(
  region: RegionRect,
  displayId: number,
): Promise<{ image: Electron.NativeImage; scale: CaptureScale } | null> {
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.bounds.width * scaleFactor),
    height: Math.round(display.bounds.height * scaleFactor),
  };

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  // No sources at all is a different condition — the capturer gave us nothing,
  // which `capture-failed` already covers. Ambiguity is specifically "screens
  // exist and we cannot tell which one is the requested display".
  if (sources.length === 0) return null;
  const source = pickScreenSource(sources, screen.getAllDisplays(), display);
  if (!source) throw new Error('capture-display-ambiguous');
  if (source.thumbnail.isEmpty()) return null;

  const full = source.thumbnail;
  const scale = captureScale(display.bounds, full.getSize(), scaleFactor);
  if (!scale) return null;
  const px = regionToPixels(region, scale, full.getSize());
  if (!px) return null;

  const crop = full.crop(px);
  if (crop.isEmpty()) return null;
  return { image: crop, scale };
}

/**
 * The watch region's cheap look: the region at half the capture resolution,
 * reduced to a grey-level grid (`lensRegionWatch.ts`). No OCR, no encoding.
 *
 * Inset a few DIP on every side so the watch frame the Lens draws just outside
 * the region can never fall inside the sample, even on a fractional scale.
 */
const WATCH_SAMPLE_INSET = 3;

export async function sampleRegionSignature(
  region: RegionRect,
  displayId: number,
): Promise<RegionSignature | null> {
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const sampleScale = Math.max(0.5, (display.scaleFactor || 1) / 2);
  const thumbnailSize = {
    width: Math.max(1, Math.round(display.bounds.width * sampleScale)),
    height: Math.max(1, Math.round(display.bounds.height * sampleScale)),
  };
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  if (!sources.length) return null;
  const source = pickScreenSource(sources, screen.getAllDisplays(), display);
  if (!source || source.thumbnail.isEmpty()) return null;
  const full = source.thumbnail;
  const scale = captureScale(display.bounds, full.getSize(), sampleScale);
  if (!scale) return null;
  const inset = Math.min(WATCH_SAMPLE_INSET, Math.floor(Math.min(region.width, region.height) / 4));
  const px = regionToPixels(
    { x: region.x + inset, y: region.y + inset, width: region.width - inset * 2, height: region.height - inset * 2 },
    scale,
    full.getSize(),
  );
  if (!px) return null;
  const crop = full.crop(px);
  if (crop.isEmpty()) return null;
  const size = crop.getSize();
  return signatureFromBitmap(new Uint8Array(crop.toBitmap()), size.width, size.height);
}

// ---- Adaptive zoom ------------------------------------------------------
//
// OCR accuracy falls off a cliff on small text: a line only ~10 px tall carries
// too few pixels per glyph for the recognizer to decode reliably (subtitles,
// distant game text, fine print). When the first pass comes back with small
// and/or low-confidence lines, we upscale the *same* capture with a high-quality
// (Lanczos) filter and OCR again — larger input helps both the box detector
// (recall on tiny text) and the CTC recognizer — then keep whichever pass reads
// better. Bounded to 3× and 4096 px/side so cost and memory stay predictable.

const TARGET_GLYPH_PX = 32; // recognizer is comfortable around here
const MIN_CONF_OK = 0.85;
const MAX_ZOOM = 3;
const MAX_SIDE = 4096;

/** Median short-axis thickness of the lines, i.e. the glyph size in pixels. */
function medianGlyphPx(lines: AutoOcrLine[]): number {
  if (!lines.length) return 0;
  const thick = lines
    .map((l) => (l.vertical ? l.box[2] - l.box[0] : l.box[3] - l.box[1]))
    .sort((a, b) => a - b);
  return thick[Math.floor(thick.length / 2)] ?? 0;
}

function meanConfidence(lines: AutoOcrLine[]): number {
  if (!lines.length) return 0;
  return lines.reduce((s, l) => s + l.confidence, 0) / lines.length;
}

function totalChars(lines: AutoOcrLine[]): number {
  return lines.reduce((s, l) => s + l.text.length, 0);
}

/**
 * Zoom factor for a second pass, or 1 to skip. Small median glyphs drive the
 * factor toward TARGET_GLYPH_PX; low confidence forces at least a modest zoom;
 * an empty first pass earns a 2× retry in case tiny text was missed entirely.
 */
function decideZoom(lines: AutoOcrLine[]): number {
  if (!lines.length) return 2;
  const glyph = medianGlyphPx(lines);
  const conf = meanConfidence(lines);
  if (glyph >= TARGET_GLYPH_PX && conf >= MIN_CONF_OK) return 1;
  let f = glyph > 0 ? TARGET_GLYPH_PX / glyph : 2;
  if (conf < 0.7) f = Math.max(f, 1.8);
  return Math.max(1.5, Math.min(MAX_ZOOM, f));
}

function scaleLines<T extends AutoOcrLine>(lines: T[], k: number): T[] {
  if (k === 1) return lines;
  return lines.map((l) => ({
    ...l,
    box: [l.box[0] * k, l.box[1] * k, l.box[2] * k, l.box[3] * k] as [
      number,
      number,
      number,
      number,
    ],
  }));
}

/** Prefer clearly higher confidence; when it's close, prefer the fuller read. */
function betterPass<T extends AutoOcrResult>(a: T, b: T): T {
  const ca = meanConfidence(a.lines);
  const cb = meanConfidence(b.lines);
  if (Math.abs(ca - cb) > 0.03) return cb > ca ? b : a;
  return totalChars(b.lines) > totalChars(a.lines) ? b : a;
}

/**
 * OCR the crop, escalating to an upscaled re-read when the text is small or the
 * confidence is weak. Returns lines in the *original* crop-pixel space so the
 * caller's DIP mapping is unchanged, plus the zoom actually applied.
 *
 * The zoom retry only applies to the general engine. manga-ocr letterboxes to
 * its own fixed input, so upscaling the source changes nothing — measured
 * byte-identical output at 1×, 2× and 3× on the same bubble.
 */
class LensScanCancelled extends Error {
  constructor() {
    super('cancelled');
    this.name = 'AbortError';
  }
}

type SurfaceRead = AutoOcrResult & { lines: Array<AutoOcrLine & { chars?: OcrChar[] }> };

async function routedRead(image: Electron.NativeImage, lang: PaddleLang, engine: OcrEngineChoice, run: LensOcrRunOptions): Promise<SurfaceRead> {
  const result = await readOcrSurface(image, {
    langs: run.langs ?? [lang], purpose: run.purpose ?? 'lens', engine,
    orientation: 'auto', signal: run.signal, budgetMs: run.budgetMs,
  });
  if (!result.ok && result.error !== 'empty') throw new Error(result.error ?? 'ocr-failed');
  return { ...result, engine: result.engine === 'manga' ? 'manga' : 'web', mangaConsidered: result.engines.includes('manga'),
    alternate: result.alternate ? { ...result.alternate, engine: result.alternate.engine === 'manga' ? 'manga' : 'web' } : undefined };
}

async function ocrAdaptive(
  image: Electron.NativeImage,
  lang: PaddleLang,
  engine: OcrEngineChoice,
  run: LensOcrRunOptions = {},
): Promise<{ result: SurfaceRead; zoom: number }> {
  // The Lens reads one known study language, so pin the recognizer to it rather
  // than letting the multi-language probe misfire on hard text.
  const startedAt = Date.now();
  const budget = run.budgetMs ?? OCR_BUDGET_MS[run.purpose ?? 'lens'];
  const first = await routedRead(image, lang, engine, run);
  if (first.engine === 'manga') return { result: first, zoom: 1 };

  let f = decideZoom(first.lines);
  if (f <= 1.05) return { result: first, zoom: 1 };

  // Bound the upscaled size so a large region can't blow past MAX_SIDE.
  const { width, height } = image.getSize();
  f = Math.min(f, MAX_SIDE / Math.max(width, height));
  if (f <= 1.05) return { result: first, zoom: 1 };

  const remaining = budget - (Date.now() - startedAt);
  if (remaining <= 0) return { result: first, zoom: 1 };

  // The second pass is the expensive one; a reader who cancelled does not pay for it.
  if (run.signal?.aborted) throw new LensScanCancelled();
  run.onStage?.('refining');

  const upscaled = image.resize({
    width: Math.round(width * f),
    height: Math.round(height * f),
    quality: 'best',
  });
  const second = await routedRead(upscaled, lang, engine, { ...run, budgetMs: remaining });
  // Map the second pass back into the original crop's pixel space. The
  // alternate was read off the same upscaled bitmap, so it carries the same
  // factor — leaving it unscaled would place its hotspots f× too far out.
  const secondMapped: SurfaceRead = {
    ...second,
    lines: scaleLines(second.lines, 1 / f),
    alternate: second.alternate
      ? { ...second.alternate, lines: scaleLines(second.alternate.lines, 1 / f) }
      : undefined,
  };
  // An upscaled pass that landed on manga-ocr wins outright: it means the first
  // pass's weak general read was a layout failure, not a resolution one.
  if (secondMapped.engine === 'manga') return { result: secondMapped, zoom: f };

  const chosen = betterPass(first, secondMapped);
  return { result: chosen, zoom: chosen === secondMapped ? f : 1 };
}

/**
 * Capture + OCR one lens region. `engine: 'manga' | 'web'` forces that engine —
 * the Lens's manual toggle — while `'auto'` lets ocrAuto pick from the pixels.
 * Line boxes come back in region-relative DIP, ready for hotspot placement in
 * the Lens renderer.
 */
// ---- Result cache -------------------------------------------------------
//
// A visual novel's dialogue box, a paused video frame, a manga page the reader
// keeps returning to: the Lens is asked to read the same pixels again and again
// ("repeat", a rescan, a resize that ends where it started). OCR is
// deterministic for the same pixels, engine, language and installed models, so
// the second read is the first one, served instantly. Keyed by the crop's
// content hash, never by the region, so a changed screen is always read fresh.
// In memory only and bounded: nothing about the user's screen is written down.

const OCR_CACHE_LIMIT = 24;
type CachedRead = Omit<LensOcrResult, 'screenshotDataUrl' | 'cached' | 'fallbackImage'>;
const ocrCache = new Map<string, CachedRead>();

function ocrCacheKey(hash: string, engine: OcrEngineChoice, lang: string, opts: LensOcrRunOptions): string {
  // Installed engines are part of the key: `auto` reads differently once
  // manga-ocr is installed, and a read cached before that must not outlive it.
  return `${hash}|${engine}|${opts.purpose ?? 'lens'}|${(opts.langs ?? [lang]).join(',')}|${installedPaddleLangs().join(',')}|${mangaOcrAvailable() ? 1 : 0}`;
}

function ocrCacheGet(key: string): CachedRead | undefined {
  const hit = ocrCache.get(key);
  if (hit) {
    // Least-recently-used: a hit moves to the back of the eviction queue.
    ocrCache.delete(key);
    ocrCache.set(key, hit);
  }
  return hit;
}

function ocrCachePut(key: string, value: CachedRead): void {
  ocrCache.set(key, value);
  while (ocrCache.size > OCR_CACHE_LIMIT) {
    const oldest = ocrCache.keys().next().value;
    if (oldest === undefined) break;
    ocrCache.delete(oldest);
  }
}

/** The longest side of a fallback image; a full 4K screen is read at a still-legible 2400 px. */
const FALLBACK_MAX_SIDE = 2400;

/** The lossless crop for the renderer's bundled recognizer, with its DIP mapping. */
function fallbackImageOf(image: Electron.NativeImage, scale: CaptureScale): LensFallbackImage {
  const size = image.getSize();
  const longest = Math.max(size.width, size.height);
  const out = longest > FALLBACK_MAX_SIDE
    ? image.resize({
      width: Math.max(1, Math.round((size.width * FALLBACK_MAX_SIDE) / longest)),
      height: Math.max(1, Math.round((size.height * FALLBACK_MAX_SIDE) / longest)),
      quality: 'best',
    })
    : image;
  const outSize = out.getSize();
  return {
    dataUrl: out.toDataURL(),
    width: outSize.width,
    height: outSize.height,
    dipPerPixelX: size.width / scale.x / Math.max(1, outSize.width),
    dipPerPixelY: size.height / scale.y / Math.max(1, outSize.height),
  };
}

export async function ocrRegion(
  region: RegionRect,
  displayId: number,
  opts: LensOcrRunOptions = {},
): Promise<LensOcrResult> {
  // The Lens reads the study language: PaddleOCR's pack for it, and manga-ocr
  // (Japanese only) never for a Chinese or Russian learner.
  const lang = getMainStudyLang();
  const webReady = paddleOcrAvailable() && installedPaddleLangs().includes(lang);
  const engine: OcrEngineChoice = lang !== 'ja' && opts.engine === 'manga' ? 'web' : opts.engine ?? 'auto';

  // Models first, capture second. The capture can fail for reasons of its own
  // (an ambiguous monitor, a compositor hiccup), and when it ran first those
  // failures hid the one thing a fresh install needs to see — the offer to
  // fetch the model — behind an error the user could do nothing about.
  if (engine === 'manga' && !mangaOcrAvailable()) {
    return EMPTY({
      engine: 'manga',
      available: false,
      error: 'manga-models-missing',
      missingAssets: { ids: MANGA_ASSETS, startIds: MANGA_START },
    });
  }
  // 'auto' still needs the general engine, since that is the pass it decides from.
  if (engine !== 'manga' && !webReady && !(lang === 'ja' && mangaOcrAvailable())) {
    const fetch = await ensureWebOcrModels(lang);
    const missing = EMPTY({
      engine: 'web',
      available: false,
      downloading: fetch.downloading,
      missingAssets: fetch.missingAssets,
      error: 'web-models-missing',
    });
    // The app ships Tesseract's Japanese data, so a Japanese learner is read
    // with that while the model downloads, instead of shown nothing. The
    // capture is attempted only after the offer exists, and any capture problem
    // returns the offer alone — exactly what this path returned before.
    if (lang !== 'ja') return missing;
    opts.onStage?.('capturing');
    let fallbackCap: { image: Electron.NativeImage; scale: CaptureScale } | null = null;
    try {
      fallbackCap = await captureRegion(region, displayId);
    } catch {
      fallbackCap = null;
    }
    if (!fallbackCap || opts.signal?.aborted) return missing;
    return {
      ...missing,
      hash: crypto.createHash('sha1').update(fallbackCap.image.toBitmap()).digest('hex'),
      fallbackImage: fallbackImageOf(fallbackCap.image, fallbackCap.scale),
      screenshotDataUrl: opts.includeScreenshot ? boundedScreenshotDataUrl(fallbackCap.image) : undefined,
    };
  }

  opts.onStage?.('capturing');
  let cap: { image: Electron.NativeImage; scale: CaptureScale } | null;
  try {
    cap = await captureRegion(region, displayId);
  } catch (err) {
    return EMPTY({ error: err instanceof Error ? err.message : 'capture-failed' });
  }
  if (!cap) return EMPTY({ error: 'capture-failed' });

  const { image, scale } = cap;
  const hash = crypto.createHash('sha1').update(image.toBitmap()).digest('hex');
  if (opts.signal?.aborted) return EMPTY({ error: 'cancelled', hash });

  const key = ocrCacheKey(hash, engine, lang, opts);
  const cached = ocrCacheGet(key);
  if (cached) {
    return {
      ...cached,
      cached: true,
      screenshotDataUrl: opts.includeScreenshot ? boundedScreenshotDataUrl(image) : undefined,
    };
  }

  opts.onStage?.('reading');
  let result: SurfaceRead;
  let zoom = 1;
  try {
    const adaptive = await ocrAdaptive(image, lang, engine, opts);
    result = adaptive.result;
    zoom = adaptive.zoom;
  } catch (err) {
    if (err instanceof LensScanCancelled) return EMPTY({ error: 'cancelled', hash });
    return EMPTY({
      engine: engine === 'manga' ? 'manga' : 'web',
      available: paddleOcrAvailable(),
      hash,
      error: err instanceof Error ? err.message : 'ocr-failed',
    });
  }
  if (opts.signal?.aborted) return EMPTY({ error: 'cancelled', hash });

  // Preserve an engine's own whitespace when its order was already sound.
  // Once geometry repairs the order, the passage must follow the same array
  // the renderer paints or downstream analysis would read a different story.
  const toLens = (
    src: Array<AutoOcrLine & { chars?: OcrChar[] }>,
    ownText: string,
  ): { lines: LensOcrLine[]; text: string } => {
    const mapped: LensOcrLine[] = src.map((l) => {
      const [x0, y0, x1, y1] = l.box; // original crop-pixel coords
      return {
        text: l.text,
        unsure: unsureCharsOf([l]),
        box: [x0 / scale.x, y0 / scale.y, Math.max(1, (x1 - x0) / scale.x), Math.max(1, (y1 - y0) / scale.y)],
        vertical: l.vertical,
        confidence: l.confidence,
      };
    });
    const ordered = orderReadingLensLines(mapped);
    const changed = ordered.some((line, index) => line !== mapped[index]);
    return { lines: ordered, text: changed ? ordered.map((line) => line.text).join('\n') : ownText };
  };

  const primary = toLens(result.lines, result.text);
  // The alternate goes through the same geometry repair as the primary: it is
  // swapped in wholesale, so a read that skipped ordering would paint hotspots
  // in provider order while the passage claimed reading order.
  const alt = result.alternate;
  const alternate = alt ? { engine: alt.engine, lang: alt.lang, ...toLens(alt.lines, alt.text) } : undefined;
  const read: CachedRead = {
    ok: true,
    engine: result.engine,
    lang: result.lang,
    lines: primary.lines,
    alternate,
    text: primary.text,
    available: true,
    hash,
    zoom,
  };
  ocrCachePut(key, read);
  return {
    ...read,
    screenshotDataUrl: opts.includeScreenshot ? boundedScreenshotDataUrl(image) : undefined,
  };
}

/**
 * OCR a picture that is not on screen — the clipboard's (a Win+Shift+S snip, a
 * copied manga panel) — in the study language, as one passage. The Lens shows
 * it the way it shows copied text, so no line geometry is needed.
 */
export async function ocrClipboardImage(image: Electron.NativeImage): Promise<{
  ok: boolean;
  text: string;
  engine: string;
  lang: string;
  screenshotDataUrl?: string;
  /** Mean line confidence 0–1, weighted by line length (Snip to cards' garbage gate). */
  confidence?: number;
  unsure?: OcrUnsureChar[];
  lines?: LensOcrLine[];
  error?: string;
}> {
  const lang = getMainStudyLang();
  if (image.isEmpty()) return { ok: false, text: '', engine: 'none', lang, error: 'empty' };
  const webReady = paddleOcrAvailable() && installedPaddleLangs().includes(lang);
  if (!webReady && !(lang === 'ja' && mangaOcrAvailable())) {
    return { ok: false, text: '', engine: 'none', lang, error: 'web-models-missing' };
  }
  try {
    const engine: OcrEngineChoice = webReady ? 'auto' : 'manga';
    const { result } = await ocrAdaptive(image, lang, engine);
    const lines = orderReadingLensLines(
      result.lines.map((l) => ({
        text: l.text,
        unsure: unsureCharsOf([l]),
        box: [l.box[0], l.box[1], Math.max(1, l.box[2] - l.box[0]), Math.max(1, l.box[3] - l.box[1])] as [
          number,
          number,
          number,
          number,
        ],
        vertical: l.vertical,
        confidence: l.confidence,
      })),
    );
    const text = lines.map((l) => l.text).join('\n').trim() || result.text.trim();
    let offset = 0;
    const unsure = lines.flatMap((line) => {
      const fixes = (line.unsure ?? []).map((fix) => ({ ...fix, at: fix.at + offset }));
      offset += [...line.text].length + 1;
      return fixes;
    });
    const chars = totalChars(result.lines);
    const confidence = chars
      ? result.lines.reduce((s, l) => s + l.confidence * l.text.length, 0) / chars
      : undefined;
    return {
      ok: Boolean(text),
      text,
      engine: result.engine,
      lang: result.lang || lang,
      lines,
      unsure,
      screenshotDataUrl: boundedScreenshotDataUrl(image),
      ...(confidence !== undefined && Number.isFinite(confidence) ? { confidence } : {}),
    };
  } catch (err) {
    return { ok: false, text: '', engine: 'none', lang, error: err instanceof Error ? err.message : 'ocr-failed' };
  }
}

/** A JPEG of `image` bounded to 1280 px and ~900 KB, as a data URL (cards, previews). */
export function boundedScreenshotDataUrl(image: Electron.NativeImage): string {
  const size = image.getSize();
  const longest = Math.max(size.width, size.height);
  let resized = longest > 1280
    ? image.resize({
      width: Math.max(1, Math.round(size.width * 1280 / longest)),
      height: Math.max(1, Math.round(size.height * 1280 / longest)),
      quality: 'best',
    })
    : image;
  let jpeg = resized.toJPEG(72);
  if (jpeg.length > 900 * 1024) {
    const current = resized.getSize();
    const currentLongest = Math.max(current.width, current.height);
    if (currentLongest > 800) {
      resized = resized.resize({
        width: Math.max(1, Math.round(current.width * 800 / currentLongest)),
        height: Math.max(1, Math.round(current.height * 800 / currentLongest)),
        quality: 'best',
      });
    }
    jpeg = resized.toJPEG(52);
    if (jpeg.length > 900 * 1024) jpeg = resized.toJPEG(35);
  }
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

export const __screenOcrTestables = {
  clearOcrCache: (): void => ocrCache.clear(),
  ocrCacheSize: (): number => ocrCache.size,
  OCR_CACHE_LIMIT,
  captureScale,
  fallbackImageOf,
  regionToPixels,
  pickScreenSource,
  decideZoom,
  scaleLines,
  betterPass,
  medianGlyphPx,
  meanConfidence,
  totalChars,
};
