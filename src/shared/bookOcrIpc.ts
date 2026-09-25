/** Wire types for the bulk book-OCR job, shared by main and renderer. */

export type BookOcrPhase =
  | 'preparing'
  | 'rasterizing'
  | 'recognizing'
  | 'translating'
  | 'packaging'
  | 'done'
  | 'cancelled'
  | 'error';

export interface BookOcrProgress {
  /** Library item the job belongs to. */
  itemId: string;
  phase: BookOcrPhase;
  /** Pages finished so far in the current phase. */
  done: number;
  /** Total pages, or 0 while still being counted. */
  total: number;
  /** Rolling mean confidence across pages read so far, 0–1. */
  confidence: number;
  /** Milliseconds remaining, estimated from throughput so far; absent early on. */
  etaMs?: number;
  error?: string;
  /**
   * Catalog key describing `error` for the reader, with its interpolations.
   * Main composes the reason; only the renderer knows the UI language.
   */
  errorKey?: string;
  errorVars?: Record<string, string | number>;
}

export interface BookOcrRequest {
  itemId: string;
  /** Read every page twice and consult both engines. Slower, better. */
  quality?: 'fast' | 'heavy';
  /** The book's language; the study language when omitted. */
  lang?: BookOcrLang;
  /** Also translate each page and lay the book out side by side. */
  bilingual?: boolean;
  /** Target language for the bilingual build. */
  targetLang?: string;
  /** Show page-number markers in the generated EPUB. */
  pageMarkers?: boolean;
}

export interface BookOcrResult {
  ok: boolean;
  itemId?: string;
  pages?: number;
  /** Mean confidence over the whole book, 0–1. */
  confidence?: number;
  error?: string;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
}

/**
 * Which way a converted item is shelved: as its original page images (or PDF),
 * or as the EPUB the OCR job built from them. Switching is free in both
 * directions — nothing is deleted either way.
 */
export type BookOcrView = 'original' | 'text';

/** File names the job writes. Items converted before `ocrEpubFile` existed carry only these. */
const GENERATED_EPUB = /^ocr(-bilingual)?\.epub$/;

export function isGeneratedOcrEpub(file: string | undefined): boolean {
  return !!file && GENERATED_EPUB.test(file);
}

/**
 * The converted text file of an item, whether it is on screen or parked —
 * `ocrEpubFile` for items converted since conversion became reversible, the
 * current `epubFile` for ones converted before.
 */
export function ocrTextFile(item: { epubFile?: string; ocrEpubFile?: string }): string | undefined {
  if (item.ocrEpubFile) return item.ocrEpubFile;
  return isGeneratedOcrEpub(item.epubFile) ? item.epubFile : undefined;
}

/** Which shelf a converted item is on; `null` for an item that was never converted. */
export function bookOcrViewOf(item: {
  kind: string;
  epubFile?: string;
  ocrEpubFile?: string;
}): BookOcrView | null {
  const text = ocrTextFile(item);
  if (!text) return null;
  return item.kind === 'book' && item.epubFile === text ? 'text' : 'original';
}

/*
 * ---------------------------------------------------------------------------
 * Engine readiness.
 * ---------------------------------------------------------------------------
 *
 * The job used to start with no model installed at all. Every page then threw
 * `web-models-missing`, the per-page catch turned each throw into an empty page,
 * and the job reported "done" — after which the item was re-filed as a book
 * whose every page was blank, with the manga reader no longer offered. So
 * readiness is decided BEFORE a page is read, and by one rule shared by the
 * panel (which offers the install) and the job (which refuses without one).
 */

/** The manga-ocr set, as `main/mangaOcr.ts` requires it. */
export const BOOK_OCR_MANGA_ASSETS = [
  'manga-ocr',
  'manga-ocr-decoder',
  'manga-ocr-vocab',
  'comic-text-detector',
] as const;

export type BookOcrEngine = 'auto' | 'manga';

/** The languages a book can be read in: PaddleOCR has a recognizer for each. */
export type BookOcrLang = 'ja' | 'zh' | 'ru';

/** The general-OCR set for a book's language: detector, recognizer, charset. */
export function bookOcrWebAssets(lang: BookOcrLang = 'ja'): string[] {
  return ['paddle-ocr-det', `paddle-ocr-${lang}`, `paddle-ocr-${lang}-keys`];
}

/**
 * What the Convert panel offers to install for a book in `lang`: the general
 * web OCR for that language, because printed pages are what it reads well
 * (manga-ocr answers dense print with fluent nonsense) and because it is
 * ~15 MB against manga-ocr's ~550 MB. Starting it queues its `requires` — the
 * shared detector and the charset — too.
 */
export function bookOcrInstallAsset(lang: BookOcrLang = 'ja'): string {
  return `paddle-ocr-${lang}`;
}

/**
 * The engine the job can run with, or `null` when nothing that reads Japanese
 * is installed.
 *
 * `auto` needs the JAPANESE recognizer specifically, not just "some" web OCR:
 * the job pins `forceLang: 'ja'`, and with only the Chinese pack installed
 * every page would throw. manga-ocr alone is still a usable engine for a
 * manga, so it is the fallback rather than a refusal.
 */
export function bookOcrEngine(
  installed: (assetId: string) => boolean,
  lang: BookOcrLang = 'ja',
): BookOcrEngine | null {
  if (bookOcrWebAssets(lang).every(installed)) return 'auto';
  // manga-ocr reads Japanese only; a Chinese or Russian book needs its own recognizer.
  if (lang === 'ja' && BOOK_OCR_MANGA_ASSETS.every(installed)) return 'manga';
  return null;
}

/*
 * ---------------------------------------------------------------------------
 * Whether a finished run is a book.
 * ---------------------------------------------------------------------------
 */

/**
 * Below this share of pages with any text, the run is a failure, not a book.
 *
 * A scanned novel has text on nearly every page — the covers and the odd
 * illustration plate are the exceptions — so a run where most pages came back
 * empty says the engine could not read this material (or could not run), and
 * filing it as a book would replace a readable original with blank pages.
 */
export const BOOK_OCR_MIN_TEXT_PAGE_RATIO = 0.5;

export interface BookOcrVerdict {
  ok: boolean;
  /** Pages that came back with at least one non-blank line. */
  textPages: number;
  total: number;
  /** Set when `ok` is false. */
  error?: string;
  errorKey?: string;
  errorVars?: Record<string, string | number>;
}

/**
 * Judge a run from how many of its pages produced text and why the rest did not.
 *
 * `engineError` is the first error a page threw. When every page threw, that
 * error IS the story — a model that failed to load, say — and naming it beats
 * the generic "mostly empty".
 */
export function judgeBookOcrRun(
  pageTexts: readonly string[],
  failedPages: number,
  engineError?: string,
): BookOcrVerdict {
  const total = pageTexts.length;
  const textPages = pageTexts.filter((text) => text.trim() !== '').length;
  if (total === 0) {
    return { ok: false, textPages, total, error: 'no-pages', errorKey: 'bookOcr.error.noPages' };
  }
  if (failedPages === total && engineError) {
    return {
      ok: false,
      textPages,
      total,
      error: engineError,
      errorKey: 'bookOcr.error.engine',
      errorVars: { detail: engineError },
    };
  }
  if (textPages / total < BOOK_OCR_MIN_TEXT_PAGE_RATIO) {
    return {
      ok: false,
      textPages,
      total,
      error: 'mostly-empty',
      errorKey: 'bookOcr.error.mostlyEmpty',
      errorVars: { read: textPages, total },
    };
  }
  return { ok: true, textPages, total };
}

/**
 * Estimate milliseconds remaining from throughput so far. Returns undefined until
 * there is enough history to be worth showing.
 *
 * Declared in `jobEta.ts` and re-exported here: every background job wants the
 * same behaviour, and existing importers take it from this module.
 */
export { MIN_SAMPLES_FOR_ETA, estimateEtaMs } from './jobEta';
