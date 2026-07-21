/**
 * Pure text helpers for manga OCR post-processing.
 * Ported behavior from mayocream manga-ocr-onnx inference (no jaconv dependency).
 */

const HALF_TO_FULL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  // ASCII printable → fullwidth
  for (let i = 33; i <= 126; i++) {
    map[String.fromCharCode(i)] = String.fromCharCode(i + 0xfee0);
  }
  map[' '] = '\u3000';
  return map;
})();

/** Halfwidth ASCII letters/digits/punct → fullwidth (manga-ocr postprocess). */
export function halfToFullAscii(text: string): string {
  let out = '';
  for (const ch of text) {
    out += HALF_TO_FULL[ch] ?? ch;
  }
  return out;
}

/**
 * manga-ocr decoder postprocess: collapse whitespace, normalize ellipsis runs,
 * half→full ASCII/digits.
 */
export function postprocessMangaOcrText(text: string): string {
  let t = text.split(/\s+/).join('');
  t = t.replace(/…/g, '...');
  t = t.replace(/[・.]{2,}/g, (m) => '.'.repeat(m.length));
  t = halfToFullAscii(t);
  return t;
}

/**
 * Strip ruby-sized furigana fragments that tesseract often emits interleaved
 * with base kanji (e.g. 漢かん字じ → 漢字). Aggressive: drop short hiragana/katakana
 * runs that sit between kanji when they look like readings.
 *
 * manga-ocr usually does not emit ruby; still safe to run lightly.
 */
export function stripFuriganaFragments(text: string, aggressive = false): string {
  if (!text) return text;
  // Remove combining-style patterns: kanji + short kana reading immediately after
  // when the kana length is small relative to the preceding kanji run.
  let t = text.replace(
    /([\u4e00-\u9fff々〆ヵヶ]+)([\u3041-\u3096\u30a1-\u30fa]{1,4})(?=[\u4e00-\u9fff々〆ヵヶ]|$)/g,
    (full, kanji: string, kana: string) => {
      // Keep if kana is plausibly part of the word (okurigana): length >= kanji run
      // and not aggressive mode → keep okurigana-looking tails on single kanji.
      if (!aggressive && kanji.length === 1 && kana.length <= 2) return full;
      if (!aggressive && kana.length >= kanji.length) return full;
      return kanji;
    },
  );
  // Collapse leftover CJK-inter-glyph spaces (tesseract habit).
  t = t
    .split('\n')
    .map((line) => line.replace(/[ \t　]+/g, ''))
    .filter((line) => line.length > 0)
    .join('\n');
  return t;
}

/**
 * Heuristic: tiny boxes or extreme aspect ratios are likely sound effects.
 * Returns suggested kind + lowered confidence multiplier.
 */
export function classifyRegionKind(opts: {
  width: number;
  height: number;
  pageArea: number;
}): { kind: 'text' | 'sfx'; confidenceScale: number } {
  const { width, height, pageArea } = opts;
  const area = Math.max(1, width * height);
  const aspect = Math.max(width, height) / Math.max(1, Math.min(width, height));
  const areaRatio = area / Math.max(1, pageArea);
  // Slightly stricter than before — art speckles and speed lines often land here.
  if (areaRatio < 0.006 || aspect > 7) {
    return { kind: 'sfx', confidenceScale: 0.55 };
  }
  return { kind: 'text', confidenceScale: 1 };
}

const JUNK_PUNCT_ONLY = /^[\s.．・…‥ー−\-—―~～〰、。！？!?,，･・]*$/u;
const HAS_JP_SCRIPT = /[\u3040-\u30ff\u3400-\u9fff々〆ヵヶ]/u;

/**
 * True when OCR output is empty, punctuation-only (．．．．), or a short
 * non-Japanese hallucination typical of art false positives.
 */
export function isJunkMangaOcrText(text: string): boolean {
  const t = (text ?? '').replace(/\s+/g, '');
  if (!t) return true;
  if (JUNK_PUNCT_ONLY.test(t)) return true;
  if (!HAS_JP_SCRIPT.test(t) && t.length < 4) return true;
  if (t.length === 1 && !HAS_JP_SCRIPT.test(t)) return true;
  // Long runs of only dots / middles after postprocess
  if (/^[.．・…]{2,}$/u.test(t)) return true;
  return false;
}

/** Vertical writing when the box is taller than wide (classic manga bubbles). */
export function guessVertical(width: number, height: number): boolean {
  return height >= width * 1.05;
}

/**
 * Sample polyline curvature: mean absolute second difference of points, normalized
 * by path length. Above `threshold` → dewarp; otherwise no-op.
 */
export function lineCurvature(points: Array<{ x: number; y: number }>): number {
  if (points.length < 3) return 0;
  let pathLen = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    pathLen += Math.hypot(dx, dy);
  }
  if (pathLen < 1e-3) return 0;
  let bend = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const ax = points[i].x - points[i - 1].x;
    const ay = points[i].y - points[i - 1].y;
    const bx = points[i + 1].x - points[i].x;
    const by = points[i + 1].y - points[i].y;
    const cross = Math.abs(ax * by - ay * bx);
    bend += cross;
  }
  return bend / pathLen;
}

/** Default curvature threshold: only dewarp clearly curved lines. */
export const DEWARP_CURVATURE_THRESHOLD = 12;

export function shouldDewarp(
  points: Array<{ x: number; y: number }>,
  threshold = DEWARP_CURVATURE_THRESHOLD,
): boolean {
  return lineCurvature(points) > threshold;
}
