// The text-layer clean-up the PDF loader applies, apart from pdf.js so it can be
// tested without a worker.

/**
 * Text as a PDF's font maps it, made lookup-able.
 *
 * Many CJK fonts map ideographs that double as radicals to the Kangxi Radicals
 * (U+2F00–U+2FDF) or CJK Radicals Supplement (U+2E80–U+2EFF) blocks, so pdf.js
 * hands back ⿂ (U+2FC2) where the page shows 魚 (U+9B5A) — measured on a PDF
 * printed by Edge: the reader rendered it, and the dictionary found nothing.
 * Those code points (and CJK compatibility ideographs, via NFC) are folded to
 * the unified ideograph; nothing else is touched, so full-width punctuation and
 * digits keep the book's typography (full NFKC would rewrite them).
 */
export function cleanPdfText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[\u2E80-\u2EFF\u2F00-\u2FDF]/g, (ch) => ch.normalize('NFKC'));
}

/** Scripts that separate words with spaces: a wrapped line joins with one. */
const SPACED_END = /[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\d,;:]$/u;
const SPACED_START = /^[\p{Script=Latin}\p{Script=Cyrillic}\p{Script=Greek}\d(«"“]/u;

// Turn a page's positioned text fragments into paragraphs: join wrapped lines,
// and start a new paragraph after sentence/quote-ending punctuation. Japanese
// and Chinese lines are joined without spaces (there are none between words);
// Russian and other spaced scripts get the space the line break stood for —
// "слово" + "слово" used to become one word.
export function linesToParagraphs(lines: string[]): string[] {
  const paras: string[] = [];
  let buf = '';
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      if (buf) {
        paras.push(buf);
        buf = '';
      }
      continue;
    }
    if (buf && /\p{L}-$/u.test(buf) && /^\p{Ll}/u.test(line)) {
      // A word hyphenated across the break: rejoin it.
      buf = buf.slice(0, -1) + line;
    } else {
      buf += buf && SPACED_END.test(buf) && SPACED_START.test(line) ? ` ${line}` : line;
    }
    if (/[。．.！？!?」』）)”"»]$/.test(line)) {
      paras.push(buf);
      buf = '';
    }
  }
  if (buf) paras.push(buf);
  return paras;
}
