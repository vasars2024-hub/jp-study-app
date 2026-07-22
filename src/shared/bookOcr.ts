/**
 * Turning OCR'd page images into a readable book.
 *
 * A scanned novel arrives as a folder of page images with no text layer at all
 * — the sample PDF that motivated this has 165 pages, zero fonts and zero
 * ToUnicode entries. OCR gives back a bag of lines per page; this module decides
 * how those become paragraphs, how uncertain text is marked, and what XHTML the
 * EPUB carries.
 *
 * Kept pure and free of Electron so the layout decisions are testable without
 * running a model.
 */

/** One OCR'd line as the book pipeline sees it. */
export interface BookLine {
  text: string;
  confidence: number;
}

export interface BookPage {
  /** 1-based page number, used for the reader's page markers. */
  number: number;
  lines: BookLine[];
  /** Translation of the whole page, when a bilingual build was requested. */
  translation?: string;
}

/**
 * How much to trust a run of text, as three bands rather than a raw number.
 *
 * A percentage on every line is noise — the reader only needs to know where to
 * look. `good` is not marked at all, `uncertain` is worth a glance, and `poor`
 * usually means the line needs the page image.
 */
export type ConfidenceBand = 'good' | 'uncertain' | 'poor';

export const UNCERTAIN_BELOW = 0.9;
export const POOR_BELOW = 0.7;

export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence < POOR_BELOW) return 'poor';
  if (confidence < UNCERTAIN_BELOW) return 'uncertain';
  return 'good';
}

/** Mean confidence over lines, weighted by length so long lines count more. */
export function pageConfidence(lines: readonly BookLine[]): number {
  let chars = 0;
  let weighted = 0;
  for (const l of lines) {
    chars += l.text.length;
    weighted += l.confidence * l.text.length;
  }
  return chars > 0 ? weighted / chars : 0;
}

/**
 * Join OCR lines into paragraphs.
 *
 * A recognizer emits one line per detected text region, but a novel's paragraph
 * runs across many of them, and re-reading a book broken at every line is
 * miserable. Japanese does not use spaces at line breaks, so lines are joined
 * with nothing; a paragraph ends where the text itself says it does — sentence
 * punctuation — or where a blank line appears.
 *
 * Confidence travels with the paragraph as the minimum of its parts: one bad
 * line is enough to make the whole paragraph worth checking.
 */
export function linesToParagraphs(lines: readonly BookLine[]): BookLine[] {
  const paragraphs: BookLine[] = [];
  let text = '';
  let worst = 1;

  const flush = (): void => {
    const trimmed = text.trim();
    if (trimmed) paragraphs.push({ text: trimmed, confidence: worst });
    text = '';
    worst = 1;
  };

  for (const line of lines) {
    const piece = line.text.trim();
    if (!piece) {
      flush();
      continue;
    }
    text += piece;
    worst = Math.min(worst, line.confidence);
    // 。！？ and their closing quotes end a sentence; 」』） only when they follow one.
    if (/[。！？…]["'」』）】]*$/.test(piece)) flush();
  }
  flush();
  return paragraphs;
}

const XML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

export function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => XML_ESCAPES[c]);
}

/**
 * Paragraph markup, with uncertain text tagged for the reader to style.
 *
 * The band goes on a data attribute rather than a colour so the reader's theme
 * decides how to show it, and so a `good` paragraph carries no markup at all.
 */
export function paragraphHtml(p: BookLine): string {
  const band = confidenceBand(p.confidence);
  const body = escapeXml(p.text);
  if (band === 'good') return `<p>${body}</p>`;
  return `<p class="ocr-${band}" data-confidence="${p.confidence.toFixed(2)}">${body}</p>`;
}

export interface ChapterOptions {
  /** Render the page's translation beside the original. */
  bilingual?: boolean;
  /** Show a page-number marker before each page's text. */
  pageMarkers?: boolean;
}

/**
 * One page of the book as an XHTML fragment.
 *
 * Bilingual pages use a two-column grid rather than interleaved paragraphs: the
 * request was to read them side by side, and paragraph counts rarely match
 * between an OCR'd page and its translation, so aligning per paragraph would
 * drift. Aligning per page always holds.
 */
export function pageHtml(page: BookPage, opts: ChapterOptions = {}): string {
  const paragraphs = linesToParagraphs(page.lines);
  const original = paragraphs.map(paragraphHtml).join('');
  const marker = opts.pageMarkers
    ? `<p class="page-marker" id="page-${page.number}">${page.number}</p>`
    : '';

  if (!opts.bilingual) return `${marker}<section class="page">${original}</section>`;

  const translated = (page.translation ?? '')
    .split(/\n{2,}/)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => `<p>${escapeXml(t)}</p>`)
    .join('');
  return (
    `${marker}<section class="page bilingual">` +
    `<div class="col source" lang="ja">${original}</div>` +
    `<div class="col target">${translated}</div>` +
    '</section>'
  );
}

/** Stylesheet shipped inside the EPUB. Kept small and reader-theme friendly. */
export const BOOK_CSS = `
body { line-height: 1.8; }
p { margin: 0 0 0.9em; text-indent: 1em; }
.page-marker {
  text-indent: 0; text-align: center; font-size: 0.75em;
  opacity: 0.45; margin: 1.6em 0 0.8em;
}
/* Uncertain OCR: underlined rather than coloured, so it survives any theme. */
.ocr-uncertain { text-decoration: underline dotted; text-underline-offset: 0.2em; }
.ocr-poor { text-decoration: underline wavy; text-underline-offset: 0.2em; opacity: 0.85; }
.bilingual { display: flex; gap: 1.5em; align-items: flex-start; }
.bilingual .col { flex: 1 1 0; min-width: 0; }
.bilingual .target { opacity: 0.85; }
@media (max-width: 700px) { .bilingual { display: block; } }
`.trim();

/** A complete XHTML document for one chapter of the book. */
export function chapterXhtml(
  title: string,
  pages: readonly BookPage[],
  opts: ChapterOptions = {},
): string {
  const body = pages.map((p) => pageHtml(p, opts)).join('');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<!DOCTYPE html>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" lang="ja">' +
    `<head><title>${escapeXml(title)}</title>` +
    '<link rel="stylesheet" type="text/css" href="style.css"/></head>' +
    `<body>${body}</body></html>`
  );
}

/**
 * Split pages into chapters so no single XHTML file gets unwieldy.
 *
 * Purely mechanical — a scan carries no chapter marks to find — but it keeps
 * each file small enough for readers to paginate without stalling.
 */
export const PAGES_PER_CHAPTER = 20;

export function chunkPages(
  pages: readonly BookPage[],
  perChapter = PAGES_PER_CHAPTER,
): BookPage[][] {
  const size = Math.max(1, perChapter);
  const out: BookPage[][] = [];
  for (let i = 0; i < pages.length; i += size) out.push(pages.slice(i, i + size));
  return out;
}
