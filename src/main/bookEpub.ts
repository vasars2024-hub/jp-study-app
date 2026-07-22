/**
 * Build a real EPUB from OCR'd pages.
 *
 * library.ts already has a `buildEpub` for the Inbox, but it writes one chapter
 * from a single HTML blob — fine for a saved article, wrong for a 288-page
 * novel, which needs a spine, a navigation document and files small enough that
 * a reader can paginate them without stalling.
 */

import { zipSync } from 'fflate';
import crypto from 'node:crypto';
import {
  BOOK_CSS,
  chapterXhtml,
  chunkPages,
  escapeXml,
  PAGES_PER_CHAPTER,
  type BookPage,
  type ChapterOptions,
} from '../shared/bookOcr';

export interface BuildBookEpubOptions extends ChapterOptions {
  title: string;
  /** BCP-47 code for the source text. */
  language?: string;
  pagesPerChapter?: number;
}

function contentOpf(title: string, language: string, chapterCount: number): string {
  const manifest: string[] = [
    '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
    '<item id="css" href="style.css" media-type="text/css"/>',
  ];
  const spine: string[] = [];
  for (let i = 0; i < chapterCount; i++) {
    manifest.push(
      `<item id="ch${i}" href="chapter-${i}.xhtml" media-type="application/xhtml+xml"/>`,
    );
    spine.push(`<itemref idref="ch${i}"/>`);
  }
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">' +
    '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">' +
    `<dc:identifier id="uid">urn:uuid:${crypto.randomUUID()}</dc:identifier>` +
    `<dc:title>${escapeXml(title)}</dc:title>` +
    `<dc:language>${escapeXml(language)}</dc:language>` +
    `<meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>` +
    '</metadata>' +
    `<manifest>${manifest.join('')}</manifest>` +
    `<spine>${spine.join('')}</spine>` +
    '</package>'
  );
}

function navXhtml(title: string, chapterCount: number): string {
  const items: string[] = [];
  for (let i = 0; i < chapterCount; i++) {
    items.push(`<li><a href="chapter-${i}.xhtml">${escapeXml(title)} ${i + 1}</a></li>`);
  }
  return (
    '<?xml version="1.0" encoding="utf-8"?><!DOCTYPE html>' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">' +
    `<head><title>${escapeXml(title)}</title></head><body>` +
    `<nav epub:type="toc" id="toc"><h1>${escapeXml(title)}</h1><ol>${items.join('')}</ol></nav>` +
    '</body></html>'
  );
}

/**
 * Zip up an EPUB whose spine is `pages` split into bounded chapters.
 *
 * fflate rather than adm-zip, because the EPUB container format has two rules a
 * general-purpose zip writer will not honour: `mimetype` must be the *first*
 * entry and must be STORED, not deflated. adm-zip writes entries in sorted
 * order, which silently put META-INF first and produced a file strict readers
 * reject. fflate preserves insertion order and takes a per-entry level.
 */
export function buildBookEpub(pages: readonly BookPage[], opts: BuildBookEpubOptions): Buffer {
  const { title, language = 'ja' } = opts;
  const chapters = chunkPages(pages, opts.pagesPerChapter ?? PAGES_PER_CHAPTER);
  const utf8 = (s: string): Uint8Array => new TextEncoder().encode(s);

  const files: Record<string, Uint8Array | [Uint8Array, { level: 0 }]> = {
    // First entry, stored uncompressed — required by the EPUB OCF spec.
    mimetype: [utf8('application/epub+zip'), { level: 0 }],
    'META-INF/container.xml': utf8(
      '<?xml version="1.0"?>' +
        '<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">' +
        '<rootfiles><rootfile full-path="OEBPS/content.opf" ' +
        'media-type="application/oebps-package+xml"/></rootfiles></container>',
    ),
    'OEBPS/content.opf': utf8(contentOpf(title, language, chapters.length)),
    'OEBPS/nav.xhtml': utf8(navXhtml(title, chapters.length)),
    'OEBPS/style.css': utf8(BOOK_CSS),
  };

  chapters.forEach((chapterPages, i) => {
    files[`OEBPS/chapter-${i}.xhtml`] = utf8(
      chapterXhtml(title, chapterPages, {
        bilingual: opts.bilingual,
        pageMarkers: opts.pageMarkers,
      }),
    );
  });

  return Buffer.from(zipSync(files));
}
