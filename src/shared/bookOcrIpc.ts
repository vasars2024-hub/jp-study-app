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
}

export interface BookOcrRequest {
  itemId: string;
  /** Read every page twice and consult both engines. Slower, better. */
  quality?: 'fast' | 'heavy';
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
}

/**
 * Estimate milliseconds remaining from throughput so far.
 *
 * Returns undefined until there is enough history to be worth showing — an ETA
 * extrapolated from one page swings wildly and reads as a bug.
 */
export const MIN_SAMPLES_FOR_ETA = 3;

export function estimateEtaMs(
  done: number,
  total: number,
  elapsedMs: number,
): number | undefined {
  if (done < MIN_SAMPLES_FOR_ETA || done >= total || elapsedMs <= 0) return undefined;
  return Math.round((elapsedMs / done) * (total - done));
}
