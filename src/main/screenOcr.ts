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
import { paddleOcrAvailable, type PaddleLang } from './paddleOcr';
import { mangaOcrAvailable } from './mangaOcr';
import { ocrAuto, type AutoOcrLine, type AutoOcrResult, type OcrEngineChoice } from './ocrAuto';

export interface LensOcrLine {
  text: string;
  /** [x, y, w, h] relative to the region's top-left, in DIP. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

export interface LensOcrResult {
  ok: boolean;
  engine: 'manga' | 'web' | 'none';
  lang?: string;
  lines: LensOcrLine[];
  text: string;
  /** Whether the engine's models are installed. */
  available: boolean;
  /** True when models are being fetched — caller should retry shortly. */
  downloading?: boolean;
  error?: string;
  /** Content hash of the captured crop, for change detection between scans. */
  hash: string;
  /** Upscale factor applied for accuracy on small text (1 = none). */
  zoom?: number;
}

/** Region in the Lens window's local DIP coords (window covers one display at its origin). */
export interface RegionRect {
  x: number;
  y: number;
  width: number;
  height: number;
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
 * Grab `region` (display-local DIP) from `displayId` as a PNG data URL at full
 * physical resolution. Returns the crop and the display's scale factor so the
 * caller can map pixel boxes back to DIP.
 */
async function captureRegion(
  region: RegionRect,
  displayId: number,
): Promise<{ image: Electron.NativeImage; scaleFactor: number } | null> {
  const display =
    screen.getAllDisplays().find((d) => d.id === displayId) ?? screen.getPrimaryDisplay();
  const scaleFactor = display.scaleFactor || 1;
  const thumbnailSize = {
    width: Math.round(display.bounds.width * scaleFactor),
    height: Math.round(display.bounds.height * scaleFactor),
  };

  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize });
  const source =
    sources.find((s) => s.display_id === String(display.id)) ??
    sources.find((s) => s.display_id === String(screen.getPrimaryDisplay().id)) ??
    sources[0];
  if (!source || source.thumbnail.isEmpty()) return null;

  const full = source.thumbnail;
  const size = full.getSize();
  const px = {
    x: Math.max(0, Math.round(region.x * scaleFactor)),
    y: Math.max(0, Math.round(region.y * scaleFactor)),
    width: Math.round(region.width * scaleFactor),
    height: Math.round(region.height * scaleFactor),
  };
  // Clamp the crop to the actual thumbnail so a region straddling an edge is safe.
  px.width = Math.min(px.width, size.width - px.x);
  px.height = Math.min(px.height, size.height - px.y);
  if (px.width <= 1 || px.height <= 1) return null;

  const crop = full.crop(px);
  if (crop.isEmpty()) return null;
  return { image: crop, scaleFactor };
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

function scaleLines(lines: AutoOcrLine[], k: number): AutoOcrLine[] {
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
function betterPass(a: AutoOcrResult, b: AutoOcrResult): AutoOcrResult {
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
async function ocrAdaptive(
  image: Electron.NativeImage,
  lang: PaddleLang,
  engine: OcrEngineChoice,
): Promise<{ result: AutoOcrResult; zoom: number }> {
  // The Lens reads one known study language, so pin the recognizer to it rather
  // than letting the multi-language probe misfire on hard text.
  const first = await ocrAuto(image.toDataURL(), { engine, langHint: lang, forceLang: lang });
  if (first.engine === 'manga') return { result: first, zoom: 1 };

  let f = decideZoom(first.lines);
  if (f <= 1.05) return { result: first, zoom: 1 };

  // Bound the upscaled size so a large region can't blow past MAX_SIDE.
  const { width, height } = image.getSize();
  f = Math.min(f, MAX_SIDE / Math.max(width, height));
  if (f <= 1.05) return { result: first, zoom: 1 };

  const upscaled = image.resize({
    width: Math.round(width * f),
    height: Math.round(height * f),
    quality: 'best',
  });
  const second = await ocrAuto(upscaled.toDataURL(), { engine, langHint: lang, forceLang: lang });
  // Map the second pass back into the original crop's pixel space.
  const secondMapped: AutoOcrResult = { ...second, lines: scaleLines(second.lines, 1 / f) };
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
export async function ocrRegion(
  region: RegionRect,
  displayId: number,
  opts: { engine?: OcrEngineChoice } = {},
): Promise<LensOcrResult> {
  let cap: { image: Electron.NativeImage; scaleFactor: number } | null;
  try {
    cap = await captureRegion(region, displayId);
  } catch (err) {
    return EMPTY({ error: err instanceof Error ? err.message : 'capture-failed' });
  }
  if (!cap) return EMPTY({ error: 'capture-failed' });

  const { image, scaleFactor: sf } = cap;
  const hash = crypto.createHash('sha1').update(image.toBitmap()).digest('hex');
  const engine = opts.engine ?? 'auto';

  if (engine === 'manga' && !mangaOcrAvailable()) {
    return EMPTY({ engine: 'manga', available: false, hash, error: 'manga-models-missing' });
  }
  // 'auto' still needs the general engine, since that is the pass it decides from.
  if (engine !== 'manga' && !paddleOcrAvailable()) {
    return EMPTY({ engine: 'web', available: false, downloading: true, hash, error: 'web-models-missing' });
  }

  let result: AutoOcrResult;
  let zoom = 1;
  try {
    const adaptive = await ocrAdaptive(image, 'ja', engine);
    result = adaptive.result;
    zoom = adaptive.zoom;
  } catch (err) {
    return EMPTY({
      engine: engine === 'manga' ? 'manga' : 'web',
      available: paddleOcrAvailable(),
      hash,
      error: err instanceof Error ? err.message : 'ocr-failed',
    });
  }

  const lines: LensOcrLine[] = result.lines.map((l: AutoOcrLine) => {
    const [x0, y0, x1, y1] = l.box; // original crop-pixel coords
    return {
      text: l.text,
      box: [x0 / sf, y0 / sf, Math.max(1, (x1 - x0) / sf), Math.max(1, (y1 - y0) / sf)],
      vertical: l.vertical,
      confidence: l.confidence,
    };
  });
  return {
    ok: true,
    engine: result.engine,
    lang: result.lang,
    lines,
    text: result.text,
    available: true,
    hash,
    zoom,
  };
}
