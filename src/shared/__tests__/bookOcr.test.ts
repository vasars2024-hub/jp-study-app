import { describe, expect, it } from 'vitest';
import {
  chapterXhtml,
  chunkPages,
  confidenceBand,
  escapeXml,
  linesToParagraphs,
  pageConfidence,
  pageHtml,
  paragraphHtml,
  type BookLine,
  type BookPage,
} from '../bookOcr';

const line = (text: string, confidence = 1): BookLine => ({ text, confidence });

describe('confidenceBand', () => {
  it('bands a read by how much it can be trusted', () => {
    expect(confidenceBand(0.99)).toBe('good');
    expect(confidenceBand(0.9)).toBe('good');
    expect(confidenceBand(0.89)).toBe('uncertain');
    expect(confidenceBand(0.7)).toBe('uncertain');
    expect(confidenceBand(0.69)).toBe('poor');
    expect(confidenceBand(0)).toBe('poor');
  });
});

describe('pageConfidence', () => {
  it('weights by length so a long line dominates a short one', () => {
    const conf = pageConfidence([line('あ'.repeat(90), 1), line('い'.repeat(10), 0)]);
    expect(conf).toBeCloseTo(0.9);
  });

  it('is zero for a page with no text rather than NaN', () => {
    expect(pageConfidence([])).toBe(0);
    expect(pageConfidence([line('', 0.5)])).toBe(0);
  });
});

describe('linesToParagraphs', () => {
  it('joins wrapped lines without inserting spaces', () => {
    const paras = linesToParagraphs([line('ある日の暮方の'), line('事である。')]);
    expect(paras).toHaveLength(1);
    expect(paras[0].text).toBe('ある日の暮方の事である。');
  });

  it('starts a new paragraph after sentence-ending punctuation', () => {
    const paras = linesToParagraphs([line('一人の下人がいた。'), line('広い門の下には')]);
    expect(paras.map((p) => p.text)).toEqual(['一人の下人がいた。', '広い門の下には']);
  });

  it('treats a closing quote after punctuation as part of the sentence', () => {
    const paras = linesToParagraphs([line('「待っていた。」'), line('次の段落')]);
    expect(paras.map((p) => p.text)).toEqual(['「待っていた。」', '次の段落']);
  });

  it('breaks on a blank line', () => {
    const paras = linesToParagraphs([line('前の段落'), line('   '), line('次の段落')]);
    expect(paras.map((p) => p.text)).toEqual(['前の段落', '次の段落']);
  });

  it('carries the worst confidence of its lines, so one bad line flags the paragraph', () => {
    const paras = linesToParagraphs([line('よい行', 0.99), line('あやしい行。', 0.55)]);
    expect(paras).toHaveLength(1);
    expect(paras[0].confidence).toBeCloseTo(0.55);
  });

  it('drops empty input without emitting a blank paragraph', () => {
    expect(linesToParagraphs([])).toEqual([]);
    expect(linesToParagraphs([line('  ')])).toEqual([]);
  });
});

describe('escapeXml', () => {
  it('escapes every character that would break XHTML', () => {
    expect(escapeXml('a & b < c > d " e \' f')).toBe(
      'a &amp; b &lt; c &gt; d &quot; e &apos; f',
    );
  });
});

describe('paragraphHtml', () => {
  it('leaves a confident paragraph unmarked', () => {
    expect(paragraphHtml(line('確かな文', 0.98))).toBe('<p>確かな文</p>');
  });

  it('marks uncertain and poor paragraphs for the reader to style', () => {
    expect(paragraphHtml(line('あやしい', 0.8))).toBe(
      '<p class="ocr-uncertain" data-confidence="0.80">あやしい</p>',
    );
    expect(paragraphHtml(line('ひどい', 0.4))).toBe(
      '<p class="ocr-poor" data-confidence="0.40">ひどい</p>',
    );
  });

  it('escapes paragraph text', () => {
    expect(paragraphHtml(line('a<b>'))).toBe('<p>a&lt;b&gt;</p>');
  });
});

describe('pageHtml', () => {
  const page: BookPage = {
    number: 7,
    lines: [line('日本語の文。')],
    translation: 'A Japanese sentence.',
  };

  it('omits the translation column unless bilingual is requested', () => {
    const html = pageHtml(page);
    expect(html).toContain('日本語の文。');
    expect(html).not.toContain('A Japanese sentence.');
    expect(html).not.toContain('bilingual');
  });

  it('renders source and target as side-by-side columns when bilingual', () => {
    const html = pageHtml(page, { bilingual: true });
    expect(html).toContain('class="page bilingual"');
    expect(html).toContain('<div class="col source" lang="ja">');
    expect(html).toContain('A Japanese sentence.');
    // Source must come before target so reading order is original-first.
    expect(html.indexOf('col source')).toBeLessThan(html.indexOf('col target'));
  });

  it('survives a bilingual page whose translation never arrived', () => {
    const html = pageHtml({ number: 1, lines: [line('文')] }, { bilingual: true });
    expect(html).toContain('<div class="col target"></div>');
  });

  it('emits a linkable page marker when asked', () => {
    expect(pageHtml(page, { pageMarkers: true })).toContain('id="page-7"');
  });
});

describe('chapterXhtml', () => {
  it('produces a well-formed document referencing the shared stylesheet', () => {
    const xhtml = chapterXhtml('第一章', [{ number: 1, lines: [line('本文')] }]);
    expect(xhtml.startsWith('<?xml version="1.0" encoding="utf-8"?>')).toBe(true);
    expect(xhtml).toContain('xmlns="http://www.w3.org/1999/xhtml"');
    expect(xhtml).toContain('href="style.css"');
    expect(xhtml).toContain('<title>第一章</title>');
    expect(xhtml.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('escapes the title', () => {
    expect(chapterXhtml('A & B', [])).toContain('<title>A &amp; B</title>');
  });
});

describe('chunkPages', () => {
  const pages: BookPage[] = Array.from({ length: 45 }, (_, i) => ({
    number: i + 1,
    lines: [line('x')],
  }));

  it('splits a long book into bounded chapters', () => {
    const chunks = chunkPages(pages, 20);
    expect(chunks.map((c) => c.length)).toEqual([20, 20, 5]);
  });

  it('keeps every page exactly once and in order', () => {
    const flat = chunkPages(pages, 7).flat();
    expect(flat).toHaveLength(45);
    expect(flat.map((p) => p.number)).toEqual(pages.map((p) => p.number));
  });

  it('never produces a zero-size chunk from a bad argument', () => {
    expect(chunkPages(pages.slice(0, 3), 0)).toHaveLength(3);
  });
});
