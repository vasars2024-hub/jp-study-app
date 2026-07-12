// Load a PDF into the same shape the custom reader uses for EPUBs, so PDFs open
// like any other book. We extract the text layer with pdf.js (offline, bundled)
// and reconstruct paragraphs; scanned/image-only PDFs have no text layer and
// will come through mostly empty (a future OCR pass could fill those in).
import * as pdfjsLib from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { LoadedEpub, EpubChapter, EpubTocEntry } from './epubLoader';

pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Turn a page's positioned text fragments into paragraphs: join wrapped lines,
// and start a new paragraph after sentence/quote-ending punctuation. Japanese
// lines are joined without spaces (there are none between words).
function linesToParagraphs(lines: string[]): string[] {
  const paras: string[] = [];
  let buf = '';
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) {
      if (buf) {
        paras.push(buf);
        buf = '';
      }
      continue;
    }
    buf += t;
    if (/[。．.！？!?」』）)”"]$/.test(t)) {
      paras.push(buf);
      buf = '';
    }
  }
  if (buf) paras.push(buf);
  return paras;
}

export async function loadPdf(
  buffer: ArrayBuffer,
  onProgress?: (fraction: number) => void,
): Promise<LoadedEpub> {
  // pdf.js transfers/detaches the buffer, so hand it a copy (the caller may reuse it).
  const data = buffer.slice(0);
  const task = pdfjsLib.getDocument({
    data,
    // Bundled standard fonts / cmaps so CJK text extraction works offline.
    cMapUrl: undefined,
    isEvalSupported: false,
  });
  const pdf = await task.promise;

  let title = '';
  try {
    const meta = await pdf.getMetadata();
    title = (meta?.info as { Title?: string })?.Title ?? '';
  } catch {
    /* no metadata */
  }

  const chapters: EpubChapter[] = [];
  const toc: EpubTocEntry[] = [];
  const pageCount = pdf.numPages;

  for (let p = 1; p <= pageCount; p++) {
    let html = '';
    let chars = 0;
    try {
      const page = await pdf.getPage(p);
      const content = await page.getTextContent();
      // Rebuild lines using pdf.js's end-of-line hints.
      const lines: string[] = [];
      let cur = '';
      for (const it of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
        cur += it.str ?? '';
        if (it.hasEOL) {
          lines.push(cur);
          cur = '';
        }
      }
      if (cur) lines.push(cur);
      const paras = linesToParagraphs(lines);
      html = paras.map((t) => `<p>${esc(t)}</p>`).join('');
      chars = paras.join('').replace(/\s+/g, '').length;
      page.cleanup();
    } catch {
      /* unreadable page — keep an empty slot so page numbers stay aligned */
    }

    chapters.push({
      href: `page-${p}`,
      absPath: '',
      html: html || `<p class="pdf-blank">（ページ ${p}）</p>`,
      chars,
      label: `Page ${p}`,
    });
    // A TOC entry every 10 pages keeps the dropdown usable for long PDFs.
    if (p === 1 || p % 10 === 0) {
      toc.push({ label: `Page ${p}`, chapterIndex: p - 1, anchor: '', depth: 0 });
    }
    onProgress?.(p / pageCount);
  }

  const totalChars = chapters.reduce((n, c) => n + c.chars, 0);

  return {
    title,
    chapters,
    toc,
    totalChars,
    direction: 'ltr',
    destroy: () => {
      try {
        pdf.cleanup();
        pdf.destroy();
      } catch {
        /* ignore */
      }
    },
  };
}
