/**
 * The two derivations the document capture producer in `NovelReader.tsx` makes,
 * pulled out so they can be tested without loading the reader.
 *
 * Importing the reader into a test drags in `pdf.worker.min.mjs?url`, which the
 * suite has already been observed to refuse; these are pure functions over the
 * table of contents, so they do not need it.
 */

import type { EpubTocEntry } from './epubLoader';

/**
 * The label of the part the reader is showing: the last entry at or before it.
 *
 * A table of contents does not have an entry per chapter — several chapters can
 * sit under one heading, and the first chapters of a book often sit under none
 * at all. Walking backwards is what maps an arbitrary position onto the heading
 * that governs it; `''` when nothing does, which the contract accepts (a
 * document capture is still addressable by its id and page).
 */
export function documentCaptureSection(toc: readonly EpubTocEntry[], part: number): string {
  let best: EpubTocEntry | null = null;
  for (const entry of toc) {
    if (entry.chapterIndex > part) continue;
    if (!best || entry.chapterIndex >= best.chapterIndex) best = entry;
  }
  return best?.label ?? '';
}

/**
 * The 1-based ordinal of the open **part**, never the screen page inside it.
 *
 * `pdfLoader.ts` emits one chapter per PDF page, so for a PDF this ordinal is
 * the page number and is what makes the capture addressable. For an EPUB the
 * screen page is a function of font size and window width, so recording it
 * would produce a ref that resolves elsewhere on the next launch.
 */
export function documentCapturePage(part: number): string {
  return String(Math.max(0, Math.floor(part)) + 1);
}
