// @vitest-environment node
/**
 * EPUB OPF metadata (scorecard bug 14 and the Library/Files metadata gap).
 *
 * The title used to be the raw inner XML with tags stripped: `Tom &amp; Jerry`
 * reached the shelf with the entity showing, and a title wrapped in CDATA came
 * back undefined (the CDATA markup was stripped as a "tag" along with its
 * text). Authors, series and tags were not read at all.
 */
import { describe, expect, it } from 'vitest';
import {
  decodeXmlEntities,
  extractEpubMetadataFromOpf,
  extractEpubTitleFromOpf,
  xmlInnerText,
} from '../epubMeta';

const opf = (metadata: string) =>
  `<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0">` +
  `<metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">${metadata}</metadata>` +
  `<manifest/><spine/></package>`;

describe('bug 14 — dc:title is decoded, not echoed', () => {
  it('decodes the predefined entities', () => {
    expect(extractEpubTitleFromOpf(opf('<dc:title>Tom &amp; Jerry &lt;3 &quot;x&quot; &apos;y&apos;</dc:title>'))).toBe(
      `Tom & Jerry <3 "x" 'y'`,
    );
  });

  it('decodes decimal and hex character references, including astral ones', () => {
    expect(extractEpubTitleFromOpf(opf('<dc:title>&#x732B;&#30340;&#x1F431;</dc:title>'))).toBe('猫的🐱');
  });

  it('decodes once: an escaped entity stays an entity', () => {
    expect(extractEpubTitleFromOpf(opf('<dc:title>A &amp;lt; B</dc:title>'))).toBe('A &lt; B');
  });

  it('leaves junk references as written rather than inventing characters', () => {
    expect(decodeXmlEntities('&bogus; &#0; &#xD800; &#x110000;')).toBe('&bogus; &#0; &#xD800; &#x110000;');
  });

  it('reads a CDATA title verbatim (no entity decoding inside CDATA)', () => {
    expect(extractEpubTitleFromOpf(opf('<dc:title><![CDATA[吾輩は猫である & <その他>]]></dc:title>'))).toBe(
      '吾輩は猫である & <その他>',
    );
    expect(xmlInnerText('a <![CDATA[&amp;]]> &amp; b')).toBe('a &amp; & b');
  });

  it('collapses whitespace and still answers undefined for a blank title', () => {
    expect(extractEpubTitleFromOpf(opf('<dc:title>\n  走れ\n  メロス </dc:title>'))).toBe('走れ メロス');
    expect(extractEpubTitleFromOpf(opf('<dc:title>   </dc:title>'))).toBeUndefined();
    expect(extractEpubTitleFromOpf(opf('<dc:title/>'))).toBeUndefined();
    expect(extractEpubTitleFromOpf(opf(''))).toBeUndefined();
  });

  it('prefers the EPUB 3 main title over a subtitle listed first', () => {
    const xml = opf(
      '<dc:title id="sub">A subtitle</dc:title><dc:title id="t1">The Main Title</dc:title>' +
        '<meta refines="#t1" property="title-type">main</meta><meta refines="#sub" property="title-type">subtitle</meta>',
    );
    expect(extractEpubTitleFromOpf(xml)).toBe('The Main Title');
  });
});

describe('metadata the Library keeps', () => {
  it('authors: EPUB 2 roles, EPUB 3 refinements, editors left out, duplicates once', () => {
    const xml = opf(
      '<dc:creator opf:role="aut">夏目 漱石</dc:creator>' +
        '<dc:creator opf:role="edt">An Editor</dc:creator>' +
        '<dc:creator id="c2">Lafcadio &amp; Hearn</dc:creator><meta refines="#c2" property="role">aut</meta>' +
        '<dc:creator id="c3">Translator</dc:creator><meta refines="#c3" property="role">trl</meta>' +
        '<dc:creator>夏目 漱石</dc:creator>',
    );
    expect(extractEpubMetadataFromOpf(xml).author).toBe('夏目 漱石 & Lafcadio & Hearn');
  });

  it('series: Calibre meta, attribute order free, entity-decoded, with a fractional index', () => {
    const xml = opf(
      '<dc:title>よつばと! 3</dc:title>' +
        '<meta content="よつばと&amp;!" name="calibre:series"/>' +
        '<meta name="calibre:series_index" content="3.5"/>',
    );
    expect(extractEpubMetadataFromOpf(xml)).toMatchObject({ series: 'よつばと&!', seriesIndex: 3.5 });
  });

  it('series: EPUB 3 belongs-to-collection with group-position; a "set" is not a series', () => {
    const series = opf(
      '<meta property="belongs-to-collection" id="c01">ハリー・ポッター</meta>' +
        '<meta refines="#c01" property="collection-type">series</meta>' +
        '<meta refines="#c01" property="group-position">2</meta>',
    );
    expect(extractEpubMetadataFromOpf(series)).toMatchObject({ series: 'ハリー・ポッター', seriesIndex: 2 });
    const set = opf(
      '<meta property="belongs-to-collection" id="c02">Box set</meta>' +
        '<meta refines="#c02" property="collection-type">set</meta>',
    );
    expect(extractEpubMetadataFromOpf(set).series).toBeUndefined();
  });

  it('ignores a nonsense series index', () => {
    const xml = opf('<meta name="calibre:series" content="S"/><meta name="calibre:series_index" content="-1"/>');
    const meta = extractEpubMetadataFromOpf(xml);
    expect(meta.series).toBe('S');
    expect(meta.seriesIndex).toBeUndefined();
  });

  it('tags: dc:subject, case-folded de-duplication, document order; language', () => {
    const xml = opf(
      '<dc:subject>Fiction</dc:subject><dc:subject>小説</dc:subject><dc:subject>fiction</dc:subject>' +
        '<dc:subject>  </dc:subject><dc:language>ja</dc:language>',
    );
    expect(extractEpubMetadataFromOpf(xml)).toMatchObject({ tags: ['Fiction', '小説'], language: 'ja' });
  });

  it('an OPF with nothing in it answers an empty object, not a throw', () => {
    expect(extractEpubMetadataFromOpf('')).toEqual({});
    expect(extractEpubMetadataFromOpf('<package><metadata></metadata></package>')).toEqual({});
  });
});
