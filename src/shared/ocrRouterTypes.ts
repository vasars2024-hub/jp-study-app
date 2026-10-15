/**
 * The OCR router's types, shared by main (`main/ocrRouter.ts`, which runs the
 * engines) and every surface that shows its result (Snip to cards today; the
 * Reading Lens, the manga reader, VN capture and book OCR as they adopt it).
 *
 * The router reads a picture with the best installed engine for the language,
 * re-reads the lines (or single characters) it is unsure of with the next
 * engine, merges per character by confidence plus dictionary validity, and
 * returns what it is still unsure of so a surface can offer one-click fixes.
 * See the top of `main/ocrRouter.ts` for the policy.
 *
 * Pure types and a few tiny helpers: no Electron, no DOM.
 */

/**
 * A language id, BCP-47-ish ('ja', 'zh-Hans', 'ru', 'ko'). Deliberately a
 * plain string: languages arrive as pluggable packs, so the router's core
 * never enumerates them. Surfaces that only handle Gum's study languages
 * narrow it with `normalizeStudyLang`.
 */
export type OcrLangId = string;

/** Who is asking; it decides the primary engine and the default time budget. */
export type OcrPurpose = 'snip' | 'manga' | 'lens' | 'vn' | 'book';

/**
 * The engines: `web` = PaddleOCR (detection + per-language CTC recognition),
 * `manga` = manga-ocr (Japanese, strongest on manga and stylised lettering),
 * `basic` = the bundled Tesseract (renderer side; the last resort).
 */
export type OcrEngineId = 'web' | 'manga' | 'basic' | (string & {});

/** One candidate for one character, with the engine's probability (0–1). */
export interface OcrCharCandidate {
  ch: string;
  p: number;
}

/**
 * One character of a read line. `alts` are the other candidates the engine
 * considered at that position, most likely first (never including `ch`).
 * An engine that reports no per-character scores (manga-ocr) gives `p` as the
 * line's own confidence and no `alts`.
 */
export interface OcrChar {
  ch: string;
  p: number;
  alts: OcrCharCandidate[];
  /** The engine this character came from after the merge. */
  engine?: OcrEngineId;
  /** Changed by dictionary-guided decoding (`was` is what the engine read). */
  was?: string;
}

export interface OcrRouterLine {
  text: string;
  /** [x0, y0, x1, y1] in source-image pixels. */
  box: [number, number, number, number];
  vertical: boolean;
  /** 0–1. */
  confidence: number;
  /** The engine whose read this line mostly is. */
  engine: OcrEngineId;
  /** Per character, aligned with `[...text]`; absent when no engine scored characters. */
  chars?: OcrChar[];
  /** Every engine that read this line (the primary, plus any fallback). */
  consulted: OcrEngineId[];
  /** Characters the dictionary-guided decoding changed. */
  corrected?: number;
}

/**
 * A character the router is still unsure of, with what else it could be: the
 * one-click fix list. `at` is the code-point index into `OcrRouterResult.text`
 * (line breaks count as one).
 */
export interface OcrUnsureChar {
  at: number;
  ch: string;
  p: number;
  alts: string[];
}

export interface OcrRouterOptions {
  /** The languages the picture may be in; the first is the learner's own (active) language. */
  langs: readonly OcrLangId[];
  orientation?: 'horizontal' | 'vertical' | 'auto';
  purpose: OcrPurpose;
  /** Wall-clock budget; fallbacks and dictionary work stop when it is spent. */
  budgetMs?: number;
  signal?: AbortSignal;
}

export type OcrRouterError = 'no-engine' | 'ocr-failed' | 'empty' | 'cancelled';

export interface OcrRouterResult {
  ok: boolean;
  text: string;
  lines: OcrRouterLine[];
  /** Character-weighted mean confidence, 0–1 (absent with no text). */
  confidence?: number;
  /** The engine most of the text came from. */
  engine: OcrEngineId | 'none';
  /** Every engine that contributed. */
  engines: OcrEngineId[];
  /** The language the text is in (by script; see `detectStudyLangOfText`). */
  lang: OcrLangId;
  unsure: OcrUnsureChar[];
  /**
   * The text looks like a language no installed engine reads (e.g. Chinese on
   * a Japanese-only install): the assets that would read it. The text above is
   * the best read anyway, but should not be trusted for that language.
   */
  missing?: { lang: OcrLangId; assetIds: string[] };
  /** The budget ran out before every fallback ran. */
  timedOut?: boolean;
  error?: OcrRouterError;
}

/** Below this a line is re-read with the next engine. */
export const OCR_LINE_FALLBACK_CONFIDENCE = 0.8;
/** A character below this sends its line to the next engine too. */
export const OCR_CHAR_FALLBACK_P = 0.5;
/** A character below this is reported as unsure (one-click fix). */
export const OCR_UNSURE_P = 0.7;
/** Default budgets by purpose (ms). */
export const OCR_BUDGET_MS: Readonly<Record<OcrPurpose, number>> = {
  snip: 15_000,
  manga: 8_000,
  lens: 4_000,
  vn: 3_000,
  book: 20_000,
};

/** Character-weighted mean confidence of some lines (undefined with no text). */
export function meanLineConfidence(lines: readonly Pick<OcrRouterLine, 'text' | 'confidence'>[]): number | undefined {
  const chars = lines.reduce((sum, line) => sum + [...line.text].length, 0);
  if (!chars) return undefined;
  return lines.reduce((sum, line) => sum + line.confidence * [...line.text].length, 0) / chars;
}

/** The unsure characters of some lines, indexed into their `\n`-joined text. */
export function unsureCharsOf(lines: readonly Pick<OcrRouterLine, 'text' | 'chars'>[], threshold = OCR_UNSURE_P): OcrUnsureChar[] {
  const out: OcrUnsureChar[] = [];
  let offset = 0;
  for (const line of lines) {
    const text = [...line.text];
    const chars = line.chars && line.chars.length === text.length ? line.chars : null;
    if (chars) {
      chars.forEach((c, i) => {
        const alts = [...new Set([...(c.was && c.was !== c.ch ? [c.was] : []), ...c.alts.map((a) => a.ch)])]
          .filter((a) => a && a !== c.ch && a.trim())
          .slice(0, 5);
        if ((c.p < threshold || c.was) && alts.length && c.ch.trim()) out.push({ at: offset + i, ch: c.ch, p: c.p, alts });
      });
    }
    offset += text.length + 1;
  }
  return out;
}
