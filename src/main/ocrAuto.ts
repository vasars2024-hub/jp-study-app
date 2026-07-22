/**
 * One OCR entry point for every caller: Reading Lens, browser extension, and
 * anything added later.
 *
 * Before this existed, engine choice was duplicated — screenOcr.ts only used
 * manga-ocr when the caller passed `engine: 'manga'` (and the Lens always sent
 * `'auto'`, so it never did), while extensionServer.ts routed on the *page's*
 * category, which says nothing about the pixels actually captured. Both
 * therefore sent manga to the general engine, which cannot read tategaki
 * bubbles — see the failure analysis in shared/ocrRouting.ts.
 *
 * The policy here is: run the general engine, and only when its own output says
 * it struggled, spend a second pass on manga-ocr and keep the better read. That
 * ordering matters — it means printed text never reaches manga-ocr, whose
 * failure mode on out-of-domain input is a confident hallucination.
 */

import { nativeImage } from 'electron';
import {
  recognizePaddleOcrDataUrl,
  paddleOcrAvailable,
  type PaddleLang,
  type PaddleOcrResult,
} from './paddleOcr';
import {
  recognizeMangaOcrRegionsDataUrl,
  mangaOcrAvailable,
  type MangaOcrRegionLine,
} from './mangaOcr';
import { summarizePaddle, shouldTryMangaOcr, pickBetterRead } from '../shared/ocrRouting';

export type OcrEngineChoice = 'auto' | 'manga' | 'web';
export type OcrEngineUsed = 'manga' | 'web';

export interface AutoOcrLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  confidence: number;
}

export interface AutoOcrResult {
  engine: OcrEngineUsed;
  lang: string;
  lines: AutoOcrLine[];
  text: string;
  /** True when the manga engine was tried but lost the comparison. */
  mangaConsidered: boolean;
}

/**
 * How much compute to spend.
 *
 * `fast` is the interactive default: one general pass, escalating to manga-ocr
 * only when that pass looks like it failed. `heavy` is for batch work where the
 * page is read once and the result is kept — it also reads an upscaled copy and
 * lowers the bar for consulting manga-ocr, trading roughly 2–3× the time for
 * accuracy on small or noisy scans.
 */
export type OcrQuality = 'fast' | 'heavy';

export interface AutoOcrOptions {
  engine?: OcrEngineChoice;
  langHint?: PaddleLang;
  /** Pin the recognizer, skipping the multi-language probe. */
  forceLang?: PaddleLang;
  quality?: OcrQuality;
}

/** Upscale factor for the heavy mode's second general pass. */
const HEAVY_ZOOM = 2;
/** Longest side the upscaled pass is allowed to reach. */
const HEAVY_MAX_SIDE = 4096;
/**
 * Only upscale images smaller than this on their longest side.
 *
 * The upscaled pass exists to rescue text too small to resolve — a subtitle, a
 * dragged crop, a low-res thumbnail. A 300 dpi page scan already arrives well
 * above the recognizer's comfortable glyph size, so doubling it costs ~3s a page
 * and buys nothing. Measured on a 1600x2294 scanned page: identical text either
 * way.
 */
const HEAVY_UPSCALE_BELOW_SIDE = 1600;

function paddleLines(result: PaddleOcrResult): AutoOcrLine[] {
  return result.lines.map((l) => ({
    text: l.text,
    box: l.box,
    vertical: l.vertical,
    confidence: l.confidence,
  }));
}

/**
 * Rank two general-engine passes of the same page.
 *
 * Confidence alone would pick a pass that read one word perfectly over one that
 * read the whole page well, so it is weighted by how much text came back — the
 * same reasoning as scoreRecognition in the CTC decoder.
 */
function scorePaddle(r: PaddleOcrResult): number {
  if (!r.lines.length) return 0;
  const chars = r.lines.reduce((s, l) => s + l.text.length, 0);
  const conf = r.lines.reduce((s, l) => s + l.confidence, 0) / r.lines.length;
  return conf * Math.log1p(chars);
}

function mangaLines(lines: MangaOcrRegionLine[]): AutoOcrLine[] {
  return lines.map((l) => ({
    text: l.text,
    box: l.box,
    vertical: l.vertical,
    confidence: l.confidence,
  }));
}

async function readManga(dataUrl: string): Promise<AutoOcrResult> {
  const manga = await recognizeMangaOcrRegionsDataUrl(dataUrl);
  return {
    engine: 'manga',
    lang: 'ja',
    lines: mangaLines(manga.lines),
    text: manga.text,
    mangaConsidered: true,
  };
}

/**
 * Recognize an image, choosing the engine from the image itself.
 *
 * `engine: 'manga' | 'web'` forces a specific engine — that is what the Lens's
 * manual toggle sends, and a user override must never be second-guessed.
 * Throws when the requested engine's models are not installed; callers surface
 * that as a download prompt.
 */
export async function ocrAuto(dataUrl: string, opts: AutoOcrOptions = {}): Promise<AutoOcrResult> {
  const choice = opts.engine ?? 'auto';

  if (choice === 'manga') {
    if (!mangaOcrAvailable()) throw new Error('manga-models-missing');
    return readManga(dataUrl);
  }
  if (!paddleOcrAvailable()) {
    // No general engine: manga-ocr alone is still better than failing outright.
    if (choice === 'auto' && mangaOcrAvailable()) return readManga(dataUrl);
    throw new Error('web-models-missing');
  }

  const heavy = opts.quality === 'heavy';
  const image = nativeImage.createFromDataURL(dataUrl);
  const size = image.getSize();

  let paddle = await recognizePaddleOcrDataUrl(dataUrl, {
    langHint: opts.langHint,
    forceLang: opts.forceLang,
  });

  // Heavy mode also reads an upscaled copy: on a 300 dpi scan the glyphs are
  // often just below the recognizer's comfortable size, and the upscaled pass
  // routinely recovers lines the first one dropped entirely.
  const longestSide = Math.max(1, size.width, size.height);
  if (heavy && longestSide < HEAVY_UPSCALE_BELOW_SIDE) {
    const factor = Math.min(HEAVY_ZOOM, HEAVY_MAX_SIDE / longestSide);
    if (factor > 1.05) {
      const upscaled = image.resize({
        width: Math.round(size.width * factor),
        height: Math.round(size.height * factor),
        quality: 'best',
      });
      const second = await recognizePaddleOcrDataUrl(upscaled.toDataURL(), {
        langHint: opts.langHint,
        forceLang: opts.forceLang,
      });
      if (scorePaddle(second) > scorePaddle(paddle)) {
        // Map boxes back into the original page's pixel space.
        paddle = {
          ...second,
          lines: second.lines.map((l) => ({
            ...l,
            box: [
              l.box[0] / factor,
              l.box[1] / factor,
              l.box[2] / factor,
              l.box[3] / factor,
            ] as [number, number, number, number],
          })),
        };
      }
    }
  }

  const web: AutoOcrResult = {
    engine: 'web',
    lang: paddle.lang,
    lines: paddleLines(paddle),
    text: paddle.text,
    mangaConsidered: false,
  };

  if (choice !== 'auto') return web;
  if (!mangaOcrAvailable()) return web;

  // Character density is only meaningful against the image's own size, and the
  // size is otherwise not needed here — decoding the header is cheap next to
  // either OCR pass.
  // Heavy mode deliberately does NOT lower this bar. An earlier version consulted
  // manga-ocr whenever confidence was below 0.97, and on scanned book pages —
  // dense printed text it was never trained on — it answered with fluent
  // nonsense reported at confidence 1.0, which is worse than a merely imperfect
  // read because nothing downstream can tell it is wrong. Heavy buys a more
  // thorough *general* pass; which engine is right is a question about the
  // layout, and shouldTryMangaOcr already answers it from evidence.
  const quality = summarizePaddle(paddle.lines, size.width * size.height);
  if (!shouldTryMangaOcr(quality)) return web;

  let manga: AutoOcrResult;
  try {
    manga = await readManga(dataUrl);
  } catch {
    // A manga pass that fails to load leaves the general read untouched.
    return web;
  }

  return pickBetterRead(web.text, manga.text) === 'manga'
    ? manga
    : { ...web, mangaConsidered: true };
}
