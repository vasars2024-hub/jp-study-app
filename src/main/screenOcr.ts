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
import { paddleAssetsForLang, paddleOcrAvailable, type PaddleLang } from './paddleOcr';
import { mangaOcrAvailable } from './mangaOcr';
import { getAssetStatus, startDownload } from './downloads';
import { summarizeAssetBundle } from '../shared/assetBundleProgress';
import type { AssetError } from '../shared/assetRegistry';
import { ocrAuto, type AutoOcrLine, type AutoOcrResult, type OcrEngineChoice } from './ocrAuto';
import { orderReadingLensLines } from '../shared/readingLensLineOrder';

export interface LensOcrLine {
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
  if (before.state !== 'busy' && before.state !== 'installed') {
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
  scaleFactor: number,
  size: { width: number; height: number },
): { x: number; y: number; width: number; height: number } | null {
  const finite = (n: number): boolean => Number.isFinite(n);
  if (!finite(region.x) || !finite(region.y) || !finite(region.width) || !finite(region.height)) {
    return null;
  }
  if (!finite(scaleFactor) || scaleFactor <= 0) return null;
  if (!finite(size.width) || !finite(size.height)) return null;

  const x = Math.max(0, Math.round(region.x * scaleFactor));
  const y = Math.max(0, Math.round(region.y * scaleFactor));
  // A region whose origin is already past the thumbnail has no overlap at all.
  if (x >= size.width || y >= size.height) return null;

  // Clamp the crop to the actual thumbnail so a region straddling an edge is safe.
  const width = Math.min(Math.round(region.width * scaleFactor), size.width - x);
  const height = Math.min(Math.round(region.height * scaleFactor), size.height - y);
  if (width <= 1 || height <= 1) return null;

  return { x, y, width, height };
}

interface ScreenSourceLike {
  display_id: string;
  thumbnail: { getSize: () => { width: number; height: number } };
}

interface DisplayLike {
  id: number;
  bounds: { width: number; height: number };
}

/** Whether a source's thumbnail has the display's shape (it is letterboxed to it). */
function sameShape(source: ScreenSourceLike, display: DisplayLike): boolean {
  const { width, height } = source.thumbnail.getSize();
  if (!(width > 0 && height > 0 && display.bounds.width > 0 && display.bounds.height > 0)) return false;
  const a = width / height;
  const b = display.bounds.width / display.bounds.height;
  return Math.abs(a - b) / b < 0.02;
}

/**
 * Which `desktopCapturer` screen source shows `target`, or `null` when that
 * cannot be told.
 *
 * Which screen we grab has to be certain, not probable: a wrong pick OCRs a
 * different monitor and returns `ok: true`, so the user reads text that was
 * never inside the box they drew. But "certain" is not the same as "labelled".
 * Electron fills `display_id` on Windows only when DXGI output duplication
 * works; where it is refused (hybrid-GPU laptops report access denied) every
 * source comes back with an empty id, and the old rule — refuse unless there is
 * exactly one screen — left the Lens unable to capture on any two-monitor setup.
 *
 * So, in order, each step only where it cannot be wrong:
 *   1. the source whose `display_id` names the target;
 *   2. the one unlabelled source left when exactly one display is unclaimed;
 *   3. the only unlabelled source shaped like the target, when the target is
 *      the only unclaimed display of that shape (the thumbnail is letterboxed
 *      into the requested size, so it keeps the screen's aspect ratio);
 *   4. pairing by order — the capturer and `screen.getAllDisplays()` both walk
 *      the system's monitor list, which Electron itself relies on to label
 *      DXGI sources — but only when the counts agree and every pair has the
 *      same shape, so a mismatched order is caught rather than trusted.
 * Anything else is genuinely ambiguous and refuses.
 */
function pickScreenSource<S extends ScreenSourceLike>(
  sources: S[],
  displays: DisplayLike[],
  target: DisplayLike,
): S | null {
  const byId = sources.find((s) => s.display_id === String(target.id));
  if (byId) return byId;

  const known = new Set(displays.map((d) => String(d.id)));
  const claimed = new Set(sources.map((s) => s.display_id).filter((id) => known.has(id)));
  // A source labelled with another display is that display's, never ours.
  const unlabelled = sources.filter((s) => !known.has(s.display_id));
  const open = displays.filter((d) => !claimed.has(String(d.id)));
  if (!unlabelled.length || !open.some((d) => d.id === target.id)) return null;

  if (unlabelled.length === 1 && open.length === 1) return unlabelled[0];

  const shaped = unlabelled.filter((s) => sameShape(s, target));
  if (shaped.length === 1 && open.filter((d) => sameShape(shaped[0], d)).length === 1) {
    return shaped[0];
  }

  if (unlabelled.length === open.length && open.every((d, i) => sameShape(unlabelled[i], d))) {
    return unlabelled[open.findIndex((d) => d.id === target.id)] ?? null;
  }
  return null;
}

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
  // No sources at all is a different condition — the capturer gave us nothing,
  // which `capture-failed` already covers. Ambiguity is specifically "screens
  // exist and we cannot tell which one is the requested display".
  if (sources.length === 0) return null;
  const source = pickScreenSource(sources, screen.getAllDisplays(), display);
  if (!source) throw new Error('capture-display-ambiguous');
  if (source.thumbnail.isEmpty()) return null;

  const full = source.thumbnail;
  const px = regionToPixels(region, scaleFactor, full.getSize());
  if (!px) return null;

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
  // Map the second pass back into the original crop's pixel space. The
  // alternate was read off the same upscaled bitmap, so it carries the same
  // factor — leaving it unscaled would place its hotspots f× too far out.
  const secondMapped: AutoOcrResult = {
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
export async function ocrRegion(
  region: RegionRect,
  displayId: number,
  opts: { engine?: OcrEngineChoice; includeScreenshot?: boolean } = {},
): Promise<LensOcrResult> {
  const engine = opts.engine ?? 'auto';

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
  if (engine !== 'manga' && !paddleOcrAvailable()) {
    const fetch = await ensureWebOcrModels('ja');
    return EMPTY({
      engine: 'web',
      available: false,
      downloading: fetch.downloading,
      missingAssets: fetch.missingAssets,
      error: 'web-models-missing',
    });
  }

  let cap: { image: Electron.NativeImage; scaleFactor: number } | null;
  try {
    cap = await captureRegion(region, displayId);
  } catch (err) {
    return EMPTY({ error: err instanceof Error ? err.message : 'capture-failed' });
  }
  if (!cap) return EMPTY({ error: 'capture-failed' });

  const { image, scaleFactor: sf } = cap;
  const hash = crypto.createHash('sha1').update(image.toBitmap()).digest('hex');

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

  // Preserve an engine's own whitespace when its order was already sound.
  // Once geometry repairs the order, the passage must follow the same array
  // the renderer paints or downstream analysis would read a different story.
  const toLens = (
    src: AutoOcrLine[],
    ownText: string,
  ): { lines: LensOcrLine[]; text: string } => {
    const mapped: LensOcrLine[] = src.map((l: AutoOcrLine) => {
      const [x0, y0, x1, y1] = l.box; // original crop-pixel coords
      return {
        text: l.text,
        box: [x0 / sf, y0 / sf, Math.max(1, (x1 - x0) / sf), Math.max(1, (y1 - y0) / sf)],
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
  return {
    ok: true,
    engine: result.engine,
    lang: result.lang,
    lines: primary.lines,
    alternate,
    text: primary.text,
    available: true,
    hash,
    zoom,
    screenshotDataUrl: opts.includeScreenshot ? boundedScreenshotDataUrl(image) : undefined,
  };
}

function boundedScreenshotDataUrl(image: Electron.NativeImage): string {
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
  regionToPixels,
  pickScreenSource,
  decideZoom,
  scaleLines,
  betterPass,
  medianGlyphPx,
  meanConfidence,
  totalChars,
};
