/**
 * Shared EPUB OPF metadata parsing — used by both the Library importer
 * (main/library.ts) and the mining analyzer (main/mining.ts) so a book's stored
 * title and its mining-panel title can never disagree.
 *
 * Regex over the raw OPF rather than a DOM parser: main has no DOMParser, and
 * the package document is small, flat and machine-written. What a regex
 * reader must not do is hand back the XML's *encoding* as the book's text —
 * `Tom &amp; Jerry` is the title `Tom & Jerry`, and a title wrapped in
 * `<![CDATA[…]]>` is still a title (scorecard bug 14).
 */

/** Metadata the Library keeps from a book's OPF. Every field is optional. */
export interface EpubOpfMetadata {
  title?: string;
  /** Authors (`dc:creator` with role `aut`, or no role), joined with " & " like Calibre. */
  author?: string;
  /** Calibre `calibre:series`, or EPUB 3 `belongs-to-collection`. */
  series?: string;
  /** Position within the series (`calibre:series_index` / `group-position`). */
  seriesIndex?: number;
  /** `dc:subject` entries, de-duplicated, in document order. */
  tags?: string[];
  /** First `dc:language`, e.g. `ja`. */
  language?: string;
}

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function codePointText(cp: number): string | null {
  // XML forbids NUL and the surrogate range; an out-of-range reference is junk,
  // not a character, and is left as written rather than thrown on.
  if (!Number.isInteger(cp) || cp <= 0 || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return null;
  return String.fromCodePoint(cp);
}

/**
 * Decode XML character and the predefined (plus `nbsp`) entity references in
 * ONE pass, so `&amp;lt;` becomes the text `&lt;` and not `<`.
 */
export function decodeXmlEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (whole, ref: string) => {
    if (ref[0] === '#') {
      const cp = ref[1] === 'x' || ref[1] === 'X' ? parseInt(ref.slice(2), 16) : parseInt(ref.slice(1), 10);
      return codePointText(cp) ?? whole;
    }
    return NAMED_ENTITIES[ref.toLowerCase()] ?? whole;
  });
}

/**
 * The text content of an element's inner XML: CDATA sections are taken
 * verbatim (no entity decoding inside them, per XML), markup outside them is
 * dropped, the rest is entity-decoded, and whitespace runs collapse to one
 * space. Returns '' for nothing.
 */
export function xmlInnerText(inner: string): string {
  let out = '';
  let rest = inner;
  for (;;) {
    const start = rest.indexOf('<![CDATA[');
    if (start < 0) break;
    const end = rest.indexOf(']]>', start + 9);
    if (end < 0) break;
    out += decodeXmlEntities(rest.slice(0, start).replace(/<[^>]*>/g, ''));
    out += rest.slice(start + 9, end);
    rest = rest.slice(end + 3);
  }
  out += decodeXmlEntities(rest.replace(/<[^>]*>/g, ''));
  return out.replace(/\s+/g, ' ').trim();
}

/** Attributes of one start tag, names lower-cased, values entity-decoded. */
function tagAttributes(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const m of tag.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = decodeXmlEntities(m[3] ?? m[4] ?? '').trim();
  }
  return attrs;
}

interface OpfElement {
  attrs: Record<string, string>;
  text: string;
}

/** Every `<dc:NAME …>…</dc:NAME>` element, in document order. */
function dcElements(opf: string, name: string): OpfElement[] {
  const re = new RegExp(`<dc:${name}\\b([^>]*?)(?:/>|>([\\s\\S]*?)</dc:${name}\\s*>)`, 'gi');
  return [...opf.matchAll(re)].map((m) => ({ attrs: tagAttributes(m[1] ?? ''), text: xmlInnerText(m[2] ?? '') }));
}

/** Every `<meta …>` (EPUB 2 empty form and EPUB 3 element form). */
function metaElements(opf: string): OpfElement[] {
  return [...opf.matchAll(/<meta\b([^>]*?)(?:\/>|>([\s\S]*?)<\/meta\s*>)/gi)].map((m) => ({
    attrs: tagAttributes(m[1] ?? ''),
    text: xmlInnerText(m[2] ?? ''),
  }));
}

/** EPUB 3 refinements: `<meta refines="#id" property="…">value</meta>`. */
function refinementsOf(metas: readonly OpfElement[], id: string | undefined, property: string): string[] {
  if (!id) return [];
  return metas
    .filter((m) => m.attrs.refines === `#${id}` && m.attrs.property?.toLowerCase() === property)
    .map((m) => m.text);
}

function parseSeriesIndex(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const n = Number(raw.trim());
  return Number.isFinite(n) && n >= 0 && n <= 100_000 ? n : undefined;
}

/** Pull `<dc:title>` out of an OPF package document's raw XML. Returns undefined if missing/blank. */
export function extractEpubTitleFromOpf(opfXml: string): string | undefined {
  const titles = dcElements(opfXml, 'title').filter((el) => el.text);
  if (!titles.length) return undefined;
  if (titles.length > 1) {
    // EPUB 3 may carry a main title and a subtitle; take the one marked main.
    const metas = metaElements(opfXml);
    const main = titles.find((el) =>
      refinementsOf(metas, el.attrs.id, 'title-type').some((v) => v.toLowerCase() === 'main'),
    );
    if (main) return main.text;
  }
  return titles[0].text;
}

/** Everything the Library keeps from an OPF: title, authors, series, tags, language. */
export function extractEpubMetadataFromOpf(opfXml: string): EpubOpfMetadata {
  const out: EpubOpfMetadata = {};
  const metas = metaElements(opfXml);

  const title = extractEpubTitleFromOpf(opfXml);
  if (title) out.title = title;

  const authors: string[] = [];
  for (const creator of dcElements(opfXml, 'creator')) {
    if (!creator.text) continue;
    const role = (creator.attrs['opf:role'] ?? refinementsOf(metas, creator.attrs.id, 'role')[0] ?? '').toLowerCase();
    if (role && role !== 'aut') continue;
    if (!authors.includes(creator.text)) authors.push(creator.text);
  }
  if (authors.length) out.author = authors.join(' & ');

  const calibreSeries = metas.find((m) => m.attrs.name?.toLowerCase() === 'calibre:series')?.attrs.content;
  if (calibreSeries) {
    out.series = calibreSeries;
    const idx = parseSeriesIndex(metas.find((m) => m.attrs.name?.toLowerCase() === 'calibre:series_index')?.attrs.content);
    if (idx !== undefined) out.seriesIndex = idx;
  } else {
    const collection = metas.find((m) => m.attrs.property?.toLowerCase() === 'belongs-to-collection' && m.text);
    if (collection) {
      // A collection explicitly typed as something other than a series (a
      // publisher "set") is not a reading order.
      const type = refinementsOf(metas, collection.attrs.id, 'collection-type')[0]?.toLowerCase();
      if (!type || type === 'series') {
        out.series = collection.text;
        const idx = parseSeriesIndex(refinementsOf(metas, collection.attrs.id, 'group-position')[0]);
        if (idx !== undefined) out.seriesIndex = idx;
      }
    }
  }

  const tags: string[] = [];
  const seen = new Set<string>();
  for (const subject of dcElements(opfXml, 'subject')) {
    const key = subject.text.toLowerCase();
    if (!subject.text || seen.has(key)) continue;
    seen.add(key);
    tags.push(subject.text);
  }
  if (tags.length) out.tags = tags.slice(0, 50);

  const language = dcElements(opfXml, 'language').find((el) => el.text)?.text;
  if (language) out.language = language;

  return out;
}
