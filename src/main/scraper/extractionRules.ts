// The Extraction settings group's text and numbering rules.
//
// `extraction.siteRules` already drove the engine; the twelve toggles beside it
// did not. These are the ones that can be applied to rows once they exist,
// whichever path produced them — a catalogue lookup or a site rule. They run in
// one pass, in the order below, because each one's input is the previous one's
// output: decoding `&amp;` before matching "Episode&nbsp;3" is not optional.
//
// Not here, and deliberately: cssSelectors, xpathSelectors, regexPattern,
// regexFlags and attribute. Those configure a generic "point the scraper at any
// page" extractor that this backend does not have — the only extraction path is
// a site rule, which carries its own selectors. Wiring them would mean building
// that extractor, not reading a setting.

import type { EpisodeKind, EpisodeRow } from '../../shared/scraperResults';
import type { ScraperExtractionSettings } from '../../shared/scraperSettings';
import { foldReleaseWidth, parseKanjiNumeral } from '../../shared/releaseEpisodeNumber';

/**
 * The entity references that actually turn up in episode titles.
 *
 * A full HTML entity table is ~2,000 names and would be dead weight: a page's
 * `<title>` and an episode cell carry the five XML predefined entities, the
 * space and dash family, and the typographic quotes. Numeric references are
 * handled generally below, which covers everything else a page can encode.
 */
const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  ensp: ' ',
  emsp: ' ',
  thinsp: ' ',
  ndash: '–',
  mdash: '—',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  middot: '·',
  bull: '•',
  deg: '°',
  times: '×',
  copy: '©',
  reg: '®',
  trade: '™',
};

export function decodeHtmlEntities(text: string): string {
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]{1,31});/gi, (whole, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      // Surrogates and out-of-range code points would make String.fromCodePoint
      // throw; leaving the reference as written is better than losing the title.
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return whole;
      if (code >= 0xd800 && code <= 0xdfff) return whole;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole;
  });
}

/** Zero-width space / non-joiner / joiner, BOM, soft hyphen. */
const INVISIBLE = /[\u200B-\u200D\uFEFF\u00AD]/g;
/** Non-breaking, en/em/thin and ideographic spaces. */
const EXOTIC_SPACE = /[\u00A0\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * What "Clean Text" means: one space between words, no invisible characters,
 * nothing hanging off either end.
 *
 * The zero-width set matters more than it looks — a zero-width space inside a
 * title survives every comparison the app makes, which turns the duplicate
 * check below into a pass.
 */
export function cleanExtractedText(text: string): string {
  return text
    .replace(INVISIBLE, '')
    // Folded to a plain space before the collapse below, which only knows \s.
    .replace(EXOTIC_SPACE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A leading episode marker, if the title starts with one.
 *
 * Anchored at the start on purpose: "Episode 3 — Killing Magic" is a marker,
 * "The Village at Episode 3" is a title, and only the anchor tells them apart.
 */
const LEADING_MARKER =
  /^\s*(?:(?:episode|episodio|ep\.?|e|#)\s*0*(\d+(?:\.\d+)?)|第\s*0*(\d+(?:\.\d+)?|[〇一二三四五六七八九十百千]+)\s*[話回])\s*(?:[-–—:.、｜|]\s*)?/i;

export interface NormalizedNumbering {
  number: number | null;
  title: string;
}

export function normalizeEpisodeNumbering(title: string): NormalizedNumbering {
  // Width-folded copy, same length as `title`, so `第３話` / `＃５` match and the
  // slice below still lines up with the original.
  const match = LEADING_MARKER.exec(foldReleaseWidth(title));
  if (!match) return { number: null, title };
  const kanji = match[2] && !/^\d/.test(match[2]) ? parseKanjiNumeral(match[2]) : null;
  const value = kanji ?? Number.parseFloat(match[1] ?? match[2] ?? '');
  const rest = title.slice(match[0].length).trim();
  return {
    number: Number.isFinite(value) ? value : null,
    // A title that was *only* a marker ("Episode 3") has nothing left; keeping
    // the original is better than an empty title column, and the validation
    // group's placeholder-title check is what should flag it.
    title: rest || title.trim(),
  };
}

const SEASON_PATTERNS: RegExp[] = [
  /\bseason\s*0*(\d{1,2})\b/i,
  /\bs0*(\d{1,2})\s*(?:e|ep|episode)\s*\d/i,
  /第\s*0*(\d{1,2})\s*期/,
  /\b(\d{1,2})(?:nd|rd|th|st)\s+season\b/i,
];

export function seasonFromTitle(title: string): number | null {
  for (const pattern of SEASON_PATTERNS) {
    const match = pattern.exec(title);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (Number.isFinite(value) && value > 0) return value;
  }
  return null;
}

/**
 * The non-episode kinds a title can announce.
 *
 * Ordered most specific first: "OVA Special" is an OVA, and a list that tested
 * `special` first would swallow it.
 */
const SPECIAL_PATTERNS: { kind: EpisodeKind; pattern: RegExp }[] = [
  { kind: 'ova', pattern: /\bOVA\b/i },
  { kind: 'ona', pattern: /\bONA\b/i },
  { kind: 'recap', pattern: /\b(?:recap|digest)\b|総集編/i },
  { kind: 'movie', pattern: /\bmovie\b|劇場版/i },
  { kind: 'trailer', pattern: /\b(?:trailer|teaser|preview)\b/i },
  { kind: 'special', pattern: /\b(?:special|extra|bonus|omake)\b|特別編/i },
];

export function specialKindFromTitle(title: string): EpisodeKind | null {
  for (const { kind, pattern } of SPECIAL_PATTERNS) {
    if (pattern.test(title)) return kind;
  }
  return null;
}

function numberLabelFor(n: number): string {
  return `EP ${String(n).padStart(2, '0')}`;
}

/**
 * Applies the group to a built row set.
 *
 * Called on both engine paths before validation runs, so a row the user can see
 * has already been through whatever they turned on — and, when they turned
 * everything off, has not been touched at all.
 */
export function applyExtractionSettings(
  rows: EpisodeRow[],
  extraction: ScraperExtractionSettings,
): EpisodeRow[] {
  const mapped = rows.map((row) => {
    let titleEn = row.titleEn;
    let titleJa = row.titleJa;
    if (extraction.decodeHtmlEntities) {
      titleEn = decodeHtmlEntities(titleEn);
      titleJa = decodeHtmlEntities(titleJa);
    }
    if (extraction.cleanText) {
      titleEn = cleanExtractedText(titleEn);
      titleJa = cleanExtractedText(titleJa);
    }

    // Season and kind are read from the title as it arrived: the normalisation
    // below strips the leading marker, and "Season 2" is often that marker's
    // immediate neighbour.
    const source = titleEn;
    let { number, numberLabel, season, kind } = row;

    if (extraction.normalizeEpisodeNumbering) {
      const normalized = normalizeEpisodeNumbering(titleEn);
      titleEn = normalized.title;
      // The parsed marker only wins when the row has nothing better. A
      // catalogue's own numbering is evidence; a number scraped out of a title
      // is a guess, and overwriting the first with the second would be the kind
      // of silent corruption that surfaces three screens later.
      if ((!Number.isFinite(number) || number <= 0) && normalized.number !== null) {
        number = normalized.number;
      }
      numberLabel = numberLabelFor(number);
    }
    if (extraction.detectSeasonNumbers) season = seasonFromTitle(source) ?? season;
    if (extraction.detectSpecials) kind = specialKindFromTitle(source) ?? kind;

    return { ...row, titleEn, titleJa, number, numberLabel, season, kind };
  });

  if (!extraction.removeDuplicateEpisodes) return mapped;
  // Keyed on season *and* number: a season-2 episode 1 is not a duplicate of a
  // season-1 episode 1, and collapsing them is how a two-cour listing loses half
  // its rows.
  const seen = new Set<string>();
  return mapped.filter((row) => {
    const key = `${row.season}:${row.number}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
