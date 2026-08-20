/**
 * The document producer's own derivations — what only `NovelReader.tsx` decides,
 * separate from the contract's tests for `buildDocumentCaptureTarget`.
 */

import { describe, expect, it } from 'vitest';
import type { EpubTocEntry } from '../epubLoader';
import { documentCapturePage, documentCaptureSection } from '../novelLensCapture';
import { buildDocumentCaptureTarget } from '../../shared/lensCaptureTarget';

const entry = (label: string, chapterIndex: number): EpubTocEntry => (
  { label, chapterIndex, anchor: '', depth: 0 }
);

describe('the section a document capture came from', () => {
  const toc: EpubTocEntry[] = [
    entry('Part One', 2),
    entry('Chapter 1', 2),
    entry('Chapter 2', 5),
    entry('Part Two', 9),
  ];

  it('takes the last heading at or before the open part, not the first', () => {
    expect(documentCaptureSection(toc, 5)).toBe('Chapter 2');
    expect(documentCaptureSection(toc, 7)).toBe('Chapter 2');
    expect(documentCaptureSection(toc, 9)).toBe('Part Two');
    expect(documentCaptureSection(toc, 40)).toBe('Part Two');
  });

  it('prefers the deeper of two headings that point at the same chapter', () => {
    // `Part One` and `Chapter 1` both point at chapter 2; the one a reader would
    // say they are in is the later, finer entry.
    expect(documentCaptureSection(toc, 2)).toBe('Chapter 1');
  });

  it('is empty before the first heading and for a book with no contents at all', () => {
    // Front matter sits under no heading in a great many books.
    expect(documentCaptureSection(toc, 0)).toBe('');
    expect(documentCaptureSection([], 3)).toBe('');
  });
});

describe('the page a document capture came from', () => {
  it('is the 1-based ordinal of the part', () => {
    expect(documentCapturePage(0)).toBe('1');
    expect(documentCapturePage(11)).toBe('12');
  });

  it('never produces a page below 1, whatever the caller hands it', () => {
    expect(documentCapturePage(-3)).toBe('1');
    expect(documentCapturePage(4.7)).toBe('5');
  });

  it('produces the ref a PDF page is addressable by', () => {
    // `pdfLoader.ts` emits one chapter per page labelled `Page N`, so part 11
    // is page 12 and the two agree — which is the whole point of the rule.
    const target = buildDocumentCaptureTarget({
      documentId: 'book-7',
      title: '日本語の文法',
      format: 'pdf',
      section: documentCaptureSection([entry('Page 12', 11)], 11),
      page: documentCapturePage(11),
    }, 50_000);
    expect(target.sourceRef).toBe('doc:book-7?format=pdf&section=Page%2012&page=12');
    expect(target.sourceLabel).toBe('日本語の文法 · Page 12 · p. 12');
  });
});
