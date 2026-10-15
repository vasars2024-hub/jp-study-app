/**
 * Small decisions of the manga reader's automatic OCR, kept pure so they are
 * tested without mounting the reader.
 */

import type { MangaOcrProgress } from '../shared/mangaOcrIpc';
import type { TVars } from '../shared/i18n/core';

/**
 * The pages to read ahead: the spread after the one on screen (one page in
 * single-page mode). Reading further ahead costs CPU the reader may never use;
 * one spread hides the 3–4 s a page takes behind the time spent on this one.
 */
export function mangaReadAheadIndices(currentSpread: readonly number[], spreadCount: number, total: number): number[] {
  if (!currentSpread.length || total <= 0) return [];
  const last = Math.max(...currentSpread);
  const out: number[] = [];
  for (let i = last + 1; i < total && out.length < Math.max(1, spreadCount); i++) out.push(i);
  return out;
}

/** What a page scan is doing, for the line under its progress bar. */
export type MangaScanPhase = { key: string; vars?: TVars };

/**
 * The progress line for one `mangaOcr:progress` event (keys of the
 * `mangaOcrUi` pack). `detect` arrives once the models are loaded and the page
 * decoded; `ocr` once per text block read.
 */
export function mangaScanPhase(p: Pick<MangaOcrProgress, 'phase' | 'current' | 'total'> | null): MangaScanPhase {
  if (!p) return { key: 'mangaOcrUi.phase.loading' };
  if (p.phase === 'ocr' && p.total > 0) {
    return { key: 'mangaOcrUi.phase.read', vars: { current: Math.min(p.total, p.current + 1), total: p.total } };
  }
  if (p.phase === 'detect') return { key: 'mangaOcrUi.phase.detect' };
  return { key: 'mangaOcrUi.phase.loading' };
}
