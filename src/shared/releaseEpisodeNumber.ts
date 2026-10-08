/**
 * The one reader for "which episode does this release / file name carry".
 *
 * Every place that reads an episode number out of a name — the Media Hub's file
 * parser, the subtitle matcher, the MAL download planner, the scraper's batch
 * detector and its release-to-episode matching — goes through this module, so
 * a name means the same episode to all of them.
 *
 * What it handles beyond the Latin `S01E07` / `EP 07` / `- 07` conventions:
 *
 *   - full-width digits and punctuation (`第１２話`, `＃０３`), folded by NFKC;
 *   - Japanese counters: `第N話`, `N話`, `第N回`, `第N集`, and the range form
 *     `第1話～第12話`; kanji numerals after `第` (`第三話`);
 *   - season markers: `第N期`, `N期`, `Season N`, `SN`, `2nd Season`;
 *   - bracket groups that only carry noise — CRC32, resolution, codec, source,
 *     date — are blanked before anything is matched, so `[E9ED99BE]` is not
 *     read as episode 9.
 *
 * Pure and synchronous. No imports, so any shared module can use it.
 */

export interface ReleaseEpisode {
  season: number | null;
  episode: number | null;
  /** Last episode of a range (`01-12`, `第1話～第12話`), otherwise null. */
  episodeEnd: number | null;
  /** Position of the episode marker in the text searched, or -1. */
  index: number;
  /** Position of the season marker in the text searched, or -1. */
  seasonIndex: number;
  /** Which convention the episode was read from, or null when none was. */
  marker: ReleaseEpisodeMarker | null;
}

export type ReleaseEpisodeMarker =
  'season-episode' | 'japanese' | 'hash' | 'word' | 'dash' | 'bracket' | 'underscore';

/**
 * Full-width ASCII, the ideographic space and the wave dash folded to their
 * ASCII forms, one code unit for one code unit. Length-preserving on purpose:
 * a caller that slices the original name at a match index needs the folded copy
 * to line up with it, which NFKC does not promise.
 */
export function foldReleaseWidth(text: string): string {
  return text.replace(/[\uFF01-\uFF5E\u3000\u301C]/g, (ch) => {
    const code = ch.charCodeAt(0);
    if (code === 0x3000) return ' ';
    if (code === 0x301c) return '~';
    return String.fromCharCode(code - 0xfee0);
  });
}

const CRC32 = /^\s*[0-9a-f]{8}\s*$/i;
const DATE_TAG = /^\s*(?:(?:19|20)\d{2}(?:[-./]?\d{2}[-./]?\d{2})?|\d{2}[-./]\d{2}[-./]\d{2,4})\s*$/;
const NOISE_WORDS =
  /(?:^|[^a-z0-9])(?:\d{3,4}[pi]|\d{3,4}\s*[x×]\s*\d{3,4}|4k|uhd|[xh]\.?26[45]|hevc|avc|av1|vp9|xvid|aac(?:2\.0)?|flac|opus|e?ac-?3|ddp?\d?(?:\.\d)?|dts(?:-?hd)?|truehd|\d{1,2}[\s-]?bits?|hi10p?|hdr\d*|sdr|bd(?:rip|mv|remux)?|blu-?ray|web(?:-?dl|-?rip)?|hdtv(?:rip)?|dvd(?:rip)?|remux|dual[\s-]?audio|multi(?:ple)?[\s-]?sub(?:title)?s?|mkv|mp4|avi)(?![a-z0-9])/i;

/** Bare (unbracketed) resolution and codec tokens whose digits are never an episode. */
const BARE_NOISE = /(?<![a-z0-9])(?:\d{3,4}[pi]|\d{3,4}\s*[x×]\s*\d{3,4}|[xh]\.?26[45]|\d{1,2}[\s-]?bits?)(?![a-z0-9])/gi;

/**
 * Blanks the content of bracket groups that carry only release noise (CRC32,
 * resolution, codec, source, date), and bare resolution / codec tokens.
 * Length-preserving, and the bracket characters themselves are kept, so a rule
 * that looks for "a number followed by a bracket" still sees the bracket.
 */
export function maskReleaseNoise(text: string): string {
  const blank = (s: string): string => ' '.repeat(s.length);
  return text
    .replace(/([[(【])([^\])】[(【]*)([\])】])/g, (whole, open: string, body: string, close: string) =>
      CRC32.test(body) || DATE_TAG.test(body) || NOISE_WORDS.test(body)
        ? `${open}${blank(body)}${close}`
        : whole)
    .replace(BARE_NOISE, blank);
}

const KANJI_DIGITS: Record<string, number> = {
  〇: 0, 零: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9,
};
const KANJI_UNITS: Record<string, number> = { 十: 10, 百: 100, 千: 1000 };

/** `十二` -> 12, `二十五` -> 25, `百` -> 100, `一二` -> 12. Null for anything else. */
export function parseKanjiNumeral(text: string): number | null {
  if (!text) return null;
  if (/^\d+$/.test(text)) return Number.parseInt(text, 10);
  let total = 0;
  let current: number | null = null;
  let positional = '';
  let sawUnit = false;
  for (const ch of text) {
    if (ch in KANJI_DIGITS) {
      current = (current ?? 0) * (sawUnit ? 1 : 10) + KANJI_DIGITS[ch];
      positional += String(KANJI_DIGITS[ch]);
    } else if (ch in KANJI_UNITS) {
      total += (current ?? 1) * KANJI_UNITS[ch];
      current = null;
      sawUnit = true;
    } else {
      return null;
    }
  }
  if (!sawUnit) return positional ? Number.parseInt(positional, 10) : null;
  return total + (current ?? 0);
}

const NUM = String.raw`(\d{1,4}|[〇零一二三四五六七八九十百千]+)`;
const JP_COUNTER = '[話回集]';

const SEASON_RULES: RegExp[] = [
  new RegExp(String.raw`第\s*${NUM}\s*期`),
  /(?<![\d.])(\d{1,2})\s*期/,
  /(?<![a-z0-9])season[\s._-]*(\d{1,2})(?!\d)/i,
  /(?<![a-z0-9])(\d{1,2})(?:st|nd|rd|th)[\s._-]*season(?![a-z])/i,
  /(?<![a-z0-9])s(\d{1,2})(?=e\d|[^a-z0-9]|$)/i,
];

/** `第1話～第12話`, `第12話`, `12話` — never `全12話`, which is a count. */
const JP_EPISODE = new RegExp(
  String.raw`(?<![全\d])(?:第\s*${NUM}|(\d{1,4}))\s*${JP_COUNTER}`
  + String.raw`(?:\s*[~\-–]\s*(?:第\s*${NUM}|(\d{1,4}))\s*${JP_COUNTER})?`,
);

const SEASON_EPISODE =
  /(?<![a-z0-9])s(\d{1,2})[\s._-]*e(\d{1,4})(?:v\d+)?(?:[\s._-]*(?:-|~|to)[\s._-]*e?(\d{1,4}))?(?![a-z0-9]|\.\d)/i;
const HASH_EPISODE = /#\s*(\d{1,4})(?:v\d+)?(?![\d]|\.\d)/;
const WORD_EPISODE =
  /(?<![a-z0-9])(?:(?:episodes?|episodio|ep)[\s._-]*|e)(\d{1,4})(?:v\d+)?(?:[\s._]*[-~][\s._]*(?:ep?)?(\d{1,4}))?(?![a-z0-9]|\.\d)/i;
const DASH_EPISODE =
  /(?:^|(?<=[\s._\])]))[-–—~][\s._]*(\d{1,4})(?:v\d+)?(?:\s*[-~]\s*(\d{1,4}))?(?![a-z0-9]|\.\d)/i;
const BRACKET_EPISODE = /[[(](\d{1,4})(?:v\d+)?[\])]/;
const UNDERSCORE_EPISODE = /_(\d{1,4})_/;

function isYear(value: number | null): boolean {
  return value !== null && value >= 1900 && value <= 2099;
}

/**
 * Finds the episode (and season) marker in text that has NOT been NFKC'd, so
 * the returned indices line up with the caller's string. Folding width and
 * masking noise are both length-preserving, which is what makes that possible.
 */
export function findReleaseEpisode(text: string): ReleaseEpisode {
  const probe = maskReleaseNoise(foldReleaseWidth(text ?? ''));
  let season: number | null = null;
  let seasonIndex = -1;
  for (const rule of SEASON_RULES) {
    const match = rule.exec(probe);
    if (!match) continue;
    const value = parseKanjiNumeral(match[1]);
    if (value === null || value <= 0) continue;
    season = value;
    seasonIndex = match.index;
    break;
  }

  const result = (
    episode: number | null,
    end: number | null,
    index: number,
    marker: ReleaseEpisodeMarker | null,
  ): ReleaseEpisode => ({
    season,
    episode,
    episodeEnd: episode !== null && end !== null && end > episode ? end : null,
    index: episode === null ? -1 : index,
    seasonIndex,
    marker: episode === null ? null : marker,
  });

  const se = SEASON_EPISODE.exec(probe);
  if (se) {
    season = Number.parseInt(se[1], 10);
    seasonIndex = se.index;
    return result(Number.parseInt(se[2], 10), se[3] ? Number.parseInt(se[3], 10) : null, se.index, 'season-episode');
  }

  const jp = JP_EPISODE.exec(probe);
  if (jp) {
    const start = parseKanjiNumeral(jp[1] ?? jp[2]);
    const end = parseKanjiNumeral(jp[3] ?? jp[4] ?? '');
    if (start !== null) return result(start, end, jp.index, 'japanese');
  }

  const simple: Array<[RegExp, boolean, ReleaseEpisodeMarker]> = [
    [HASH_EPISODE, false, 'hash'],
    [WORD_EPISODE, true, 'word'],
    [DASH_EPISODE, true, 'dash'],
    [BRACKET_EPISODE, false, 'bracket'],
    [UNDERSCORE_EPISODE, false, 'underscore'],
  ];
  for (const [rule, ranged, marker] of simple) {
    const match = rule.exec(probe);
    if (!match) continue;
    const value = Number.parseInt(match[1], 10);
    if (isYear(value)) continue;
    const end = ranged && match[2] ? Number.parseInt(match[2], 10) : null;
    return result(value, end, match.index, marker);
  }
  return result(null, null, -1, null);
}

const MEDIA_EXTENSION =
  /(?:\.[a-z]{2,3}(?:-[a-z]{2,4})?)?\.(?:mkv|mp4|avi|webm|m4v|mov|wmv|flv|m2ts|srt|ass|ssa|vtt|sub|sup|torrent)$/i;

/** NFKC, width-folded, extension-stripped: the text {@link parseReleaseEpisode} reads. */
function prepareReleaseName(name: string): string {
  return foldReleaseWidth((name ?? '').normalize('NFKC')).replace(MEDIA_EXTENSION, '');
}

/** The season / episode a release or file name carries. */
export function parseReleaseEpisode(name: string): ReleaseEpisode {
  return findReleaseEpisode(prepareReleaseName(name));
}

/**
 * Whether the name's own episode marker is a single episode `number`. A range
 * (`01-12`) is deliberately not a match: whether a batch covers an episode is
 * the caller's opt-in, read through {@link releaseEpisodeRange}.
 */
export function releaseMarkerIsEpisode(name: string, number: number): boolean {
  if (!Number.isInteger(number) || number < 0) return false;
  const parsed = parseReleaseEpisode(name);
  return parsed.episode === number && parsed.episodeEnd === null;
}

const NUMERIC_RANGE =
  /(?<![a-z\d.~-])((?:ep?|episodes?)\s?)?(\d{1,3})(\s*)([-~–])(\s*)(?:(?:ep?)\s?)?(\d{1,3})(?![\d.]|[a-z])/gi;

/**
 * An episode range the name advertises (`01-12`, `01~12`, `E01-E12`,
 * `第1話～第12話`), or null.
 *
 * `Title - 07` is the single most common release shape, so a spaced hyphen
 * is the separator that needs a guard: `Mob Psycho 100 - 07` and
 * `Steins;Gate 0 - 05` are a title number followed by an episode, not a
 * range. A spaced hyphen therefore counts only between equally padded numbers
 * (`01 - 12`); an unspaced hyphen, a tilde, or an `E` prefix counts as given.
 * Every range must also run forwards.
 */
export function releaseEpisodeRange(name: string): { start: number; end: number } | null {
  const text = maskReleaseNoise(prepareReleaseName(name));
  const marked = findReleaseEpisode(text);
  if (marked.episode !== null && marked.episodeEnd !== null) {
    return { start: marked.episode, end: marked.episodeEnd };
  }
  for (const match of text.matchAll(NUMERIC_RANGE)) {
    const [, prefix, left, spaceBefore, separator, spaceAfter, right] = match;
    const start = Number.parseInt(left, 10);
    const end = Number.parseInt(right, 10);
    if (!(end > start)) continue;
    const spacedHyphen = separator !== '~' && (spaceBefore.length > 0 || spaceAfter.length > 0);
    if (spacedHyphen && !prefix && !(left.length === right.length && left.length >= 2)) continue;
    return { start, end };
  }
  return null;
}
