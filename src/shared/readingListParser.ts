/**
 * Paste → list. The parser.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §2: "the whole feature stands or falls
 * here. Input is a real text message, not clean data." Everything in this file is
 * pure — the same `rawText` always yields the same parse — which is what makes
 * §2.4's re-parse possible: a better parser can be re-run over every historical
 * import and shown as a diff, instead of the raw text being thrown away.
 *
 * ## Segmentation is scored, not chosen
 *
 * §2.2 is explicit that no single strategy is hard-coded. A numbered list, a
 * bulleted list, one-title-per-line and a comma-run are all real message shapes,
 * and a message often mixes two. So every strategy runs, each is scored on how
 * uniform and plausible its output is, and the best wins. The score is what
 * rejects the failure mode that makes a parser useless: a strategy that produces
 * one 400-character "title" scores below one that produces five short ones.
 *
 * ## Nothing is silently guessed
 *
 * §0 records the codebase's own rule for `metadataConfidence`: a low-confidence
 * match "flags the card for review rather than pretending a guess is a fact".
 * The same idiom here. A line that needed a judgement call — an author picked
 * from two candidates, a title too short or too long to be plausible — comes back
 * with `needsTriage` set and the reason, and §2.5's preview pre-selects those. The
 * parser never decides on the user's behalf and never hides that it was unsure.
 */

import type { ReadingVolumeRange } from './readingLists';

/** Bumped whenever a rule changes, so a stored import records what produced it. */
export const READING_LIST_PARSER_VERSION = '1';

export type ReadingListSegmentation =
  | 'numbered'
  | 'bulleted'
  | 'line-per-title'
  | 'inline-separated'
  | 'quoted-prose';

export type ReadingListTriageReason =
  | 'author-ambiguous'
  | 'very-short'
  | 'very-long';

export interface ParsedReadingEntry {
  /** The line exactly as it appeared, before any cleanup. Provenance, always. */
  rawLine: string;
  /** Index into the source text's lines, so the preview can point at the original. */
  lineIndex: number;
  title: string;
  titleJa?: string;
  titleEn?: string;
  author?: string;
  volume?: ReadingVolumeRange;
  /** A URL that belonged to this line rather than to the message. */
  url?: string;
  /** Set when a judgement call was made. §2.5 pre-selects these for attention. */
  needsTriage?: ReadingListTriageReason;
}

export interface ParsedReadingList {
  entries: ParsedReadingEntry[];
  /** A URL that stood on its own line belongs to the list, not to an entry (§2.1). */
  sourceUrl?: string;
  segmentation: ReadingListSegmentation;
  parserVersion: string;
  /** Lines dropped as chatter, kept so the preview can show what was ignored. */
  dropped: string[];
}

const URL_PATTERN = /https?:\/\/\S+/g;

/**
 * Greetings and sign-offs. Matched against the whole cleaned line, never as a
 * substring: "Kino no Tabi" must not lose its "no", and a title containing "ok"
 * is not a sign-off.
 */
const CHATTER_LINES = new Set([
  'yo',
  'hi',
  'hey',
  'hello',
  'ok',
  'okay',
  'thanks',
  'ty',
  'np',
  'lol',
  'lmao',
  'idk',
  'these are the ones i said',
  'here you go',
  'here u go',
  'enjoy',
  'よろしく',
  'おつ',
  'これ',
]);

/**
 * Openers a message uses before the actual list. Matched as a PREFIX of the whole
 * line, and only when the rest of the line is short enough to be an introduction
 * rather than a title with an unlucky first word.
 */
const CHATTER_PREFIXES = [
  'yo ',
  'hey ',
  'hi ',
  'so ',
  'ok so ',
  'these are ',
  'here are ',
  'this is ',
];

/** Trailing asides. Stripped from the end of a line, longest first. */
const TRAILING_CHATTER = [
  'if u can find it',
  'if you can find it',
  'if u find it',
  'i think',
  'i guess',
  'maybe',
  'probably',
  'lol',
  'lmao',
  'haha',
  'imo',
  'btw',
];

/**
 * A circled numeral, stripped from the RAW line before anything normalizes it.
 *
 * Found by the message corpus: NFKC folds ① to a bare `1`, so by the time
 * `stripLeadingMarker` runs, `①走れメロス` reads `1走れメロス` and no marker rule
 * matches a digit with no separator after it. Adding one that did would eat the
 * `1` out of `1Q84`, so the fix has to happen before the fold, not after.
 */
const CIRCLED_MARKER = /^\s*[①-⑳]\s*/u;

const LEADING_MARKERS = [
  /^\s*\(?\d{1,3}\)\s*/,
  /^\s*\d{1,3}\s*[.)、]\s*/,
  /^\s*\d{1,3}\s+-\s+/,
  /^\s*[①-⑳]\s*/u,
  /^\s*[一二三四五六七八九十]{1,3}\s*、\s*/,
  /^\s*[-*•・→>＞]+\s*/,
];

const NUMBERED_LINE = /^\s*(?:\(?\d{1,3}[.)、]|\d{1,3}\s+-\s|[①-⑳]|[一二三四五六七八九十]{1,3}、)/u;
/*
  The space after the bullet is required for `-` and `*` and optional for the
  rest. `・こころ` with no space is the ordinary Japanese form and appears in real
  messages, while `-こころ` is more likely a dash-prefixed title than a bullet, and
  a rule that accepted it would strip a leading hyphen out of a title for free.
*/
const BULLETED_LINE = /^\s*(?:[•・→＞]\s*|[-*]\s+|>>?\s+)\S/;

/** `「」`, `『』`, `""`, `""`. A quoted span is a strong title signal (§2.3 step 3). */
const QUOTED_SPAN = /[「『"“]([^」』"”]{2,80})[」』"”]/;
const QUOTED_SPAN_GLOBAL = /[「『"“]([^」』"”]{2,80})[」』"”]/g;

/**
 * NFKC plus the normalizations a pasted message actually needs.
 *
 * NFKC alone already folds full-width digits and Latin, which is most of it, and
 * it maps the ideographic space U+3000 to U+0020. What NFKC does not do is
 * collapse a run or trim the ends — and a trailing ideographic space is invisible
 * in the UI while making two identical titles compare unequal.
 *
 * `\s` covers U+3000 on its own; spelling the character out as well only earned an
 * `no-irregular-whitespace` error.
 */
export function normalizeLine(raw: string): string {
  return raw.normalize('NFKC').replace(/\s+/gu, ' ').trim();
}

function stripLeadingMarker(line: string): string {
  for (const marker of LEADING_MARKERS) {
    const stripped = line.replace(marker, '');
    if (stripped !== line) return stripped.trim();
  }
  return line;
}

function stripTrailingChatter(line: string): string {
  let out = line;
  let changed = true;
  while (changed) {
    changed = false;
    const lowered = out.toLowerCase();
    for (const phrase of TRAILING_CHATTER) {
      if (lowered.endsWith(phrase)) {
        out = out.slice(0, out.length - phrase.length).trim();
        changed = true;
        break;
      }
    }
    // Punctuation runs left behind by the phrase above, and the ones a message
    // ends with on its own: "…if u can find it!!" and "…おもしろい？？".
    // Emoji join the punctuation run: the corpus had `ハイキュー!! 🔥🔥` and
    // `呪術廻戦 😭`, and §2.3 step 2 names emoji runs as chatter outright.
    // \u200D and \uFE0F are the ZWJ and variation selector that hold a composite
    // emoji together; spelled as escapes rather than literals so they stay visible
    // to the next reader and cannot be eaten by an editor.
    const trimmed = out.replace(
      /(?:[!?！？~〜.,、。\s\p{Extended_Pictographic}]|\u200D|\uFE0F)+$/u,
      '',
    );
    if (trimmed !== out) {
      out = trimmed;
      changed = true;
    }
  }
  return out.trim();
}

/**
 * `1-3`, `1〜3`, `vol 1-5`, `巻1-5`, `第1-3巻`, `#1-3`, and the single-volume
 * forms. Returns the range and the line with the volume text removed, because a
 * volume left in the title makes "ハリー・ポッター 1〜3巻" a different work from
 * "ハリー・ポッター".
 */
export function extractVolume(line: string): { line: string; volume?: ReadingVolumeRange } {
  const patterns: RegExp[] = [
    /\s*第\s*(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})\s*巻/u,
    /\s*(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})\s*巻/u,
    /\s*巻\s*(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})/u,
    /\s*(?:vol\.?|volumes?)\s*(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})/iu,
    /\s*#\s*(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})/u,
    /\s*第\s*(\d{1,4})\s*巻()/u,
    /\s*(\d{1,4})\s*巻()/u,
    /\s*(?:vol\.?|volume)\s*(\d{1,4})()/iu,
    // A bare range, and only at the very end after whitespace. §2.3 lists `1-3`,
    // but unanchored it would eat the "1-3" out of a title like "Q&A 1-3 の話",
    // and a digit run mid-title is far more often part of the title than a volume.
    /\s+(\d{1,4})\s*[-–—~〜]\s*(\d{1,4})\s*$/u,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(line);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : undefined;
    if (!Number.isFinite(from)) continue;
    const rest = `${line.slice(0, match.index)} ${line.slice(match.index + match[0].length)}`;
    const volume: ReadingVolumeRange =
      to !== undefined && Number.isFinite(to)
        ? { from: Math.min(from, to), to: Math.max(from, to) }
        : { from };
    return { line: normalizeLine(rest), volume };
  }
  return { line };
}

const JAPANESE = /[぀-ヿ㐀-䶿一-鿿]/u;

export function hasJapanese(text: string): boolean {
  return JAPANESE.test(text);
}

/**
 * `English (日本語)` or `日本語 (English)` → one work, both titles (§2.3 step 6).
 *
 * The parenthetical only counts as the other-language title when the two sides
 * differ in script. "Kino no Tabi (the anime one)" is a note, not a title, and
 * merging it would produce a work whose English title is a comment.
 */
export function pairTitles(line: string): { title: string; titleJa?: string; titleEn?: string } {
  const match = /^(.+?)\s*[（(]\s*([^）)]{2,60})\s*[）)]\s*$/u.exec(line);
  if (!match) {
    return hasJapanese(line) ? { title: line, titleJa: line } : { title: line, titleEn: line };
  }
  const [, outside, inside] = match;
  const outsideJa = hasJapanese(outside);
  const insideJa = hasJapanese(inside);
  if (outsideJa === insideJa) return outsideJa ? { title: line, titleJa: line } : { title: line };
  // The Japanese title is the canonical one: this is a Japanese-study app, and the
  // matcher's catalogues are keyed on it.
  const ja = outsideJa ? outside.trim() : inside.trim();
  const en = outsideJa ? inside.trim() : outside.trim();
  return { title: ja, titleJa: ja, titleEn: en };
}

/**
 * `著者著 タイトル`. The suffix form below is the one §2.3 step 4 spells out, but
 * the corpus turned up the prefix form on three of three real Japanese messages
 * that used the marker at all, and `line.slice(0, match.index)` yields an empty
 * title for it — so it needs its own rule rather than another entry in the list.
 */
const AUTHOR_PREFIX = /^([^\s、,]{2,20})\s*著\s+(.+)$/u;

const AUTHOR_MARKERS = [
  /\s+by\s+([^,;]{2,40})$/iu,
  /\s*[【[]([^】\]]{2,40})[】\]]\s*$/u,
  /\s*([^\s、,]{2,20})\s*著\s*$/u,
];

/**
 * Splits an author off the end of a line, and says when it had to guess.
 *
 * The hard case is §2.1's line 3: "Convenience Store Woman (コンビニ人間) —
 * Murakami? no, Sayaka Murata". Two candidate authors, the first explicitly
 * retracted. Rather than pick silently, the correction form `X? no, Y` is
 * recognised — the user wrote the correction down, so it is data, not noise —
 * and the entry is still flagged `author-ambiguous` so the preview asks.
 */
export function splitAuthor(line: string): {
  line: string;
  author?: string;
  triage?: ReadingListTriageReason;
} {
  const correction = /\s*[-–—:]\s*([^?？]{2,40})[?？]\s*(?:no|nope|違う|いや)\s*,?\s*([^,;]{2,40})$/iu
    .exec(line);
  if (correction) {
    return {
      line: line.slice(0, correction.index).trim(),
      author: correction[2].trim(),
      triage: 'author-ambiguous',
    };
  }
  const prefixed = AUTHOR_PREFIX.exec(line);
  if (prefixed) return { line: prefixed[2].trim(), author: prefixed[1].trim() };
  for (const marker of AUTHOR_MARKERS) {
    const match = marker.exec(line);
    if (!match) continue;
    return { line: line.slice(0, match.index).trim(), author: match[1].trim() };
  }
  // A dash-separated line is genuinely ambiguous — "Title - Author" and
  // "Author - Title" look identical — so it is left whole rather than split on a
  // coin flip. §3's matcher scores against both halves anyway.
  return { line };
}

function isChatter(line: string): boolean {
  const lowered = line.toLowerCase().replace(/[!?.…、。]+$/u, '').trim();
  if (!lowered) return true;
  if (CHATTER_LINES.has(lowered)) return true;
  // An opener only counts when what follows is short. "so I finally read
  // 夜は短し歩けよ乙女" is a title line with an unlucky first word.
  return CHATTER_PREFIXES.some(
    (prefix) => lowered.startsWith(prefix) && lowered.length <= 40 && !hasJapanese(line),
  );
}

interface Segments {
  strategy: ReadingListSegmentation;
  /**
   * `text` is what gets cleaned into a title. `rawLine` is the source line the
   * preview shows beside it, and they differ for the two strategies that carve a
   * title OUT of a line — `inline-separated` and `quoted-prose`. Storing the
   * carved piece as the provenance made `sourceRef.rawLine` a fragment rather
   * than "which line of which paste produced this entry" (§1).
   */
  lines: { text: string; lineIndex: number; rawLine?: string }[];
}

function segmentCandidates(lines: string[]): Segments[] {
  const indexed = lines
    .map((text, lineIndex) => ({ text, lineIndex }))
    .filter((line) => line.text.trim().length > 0);

  const out: Segments[] = [];
  const numbered = indexed.filter((line) => NUMBERED_LINE.test(line.text));
  if (numbered.length) out.push({ strategy: 'numbered', lines: numbered });
  const bulleted = indexed.filter((line) => BULLETED_LINE.test(line.text));
  if (bulleted.length) out.push({ strategy: 'bulleted', lines: bulleted });
  /*
    "every non-empty line, when >=3 lines and NONE matched above" -- 2.2, literally.
    The gate matters: on 2.1's own example, offered as a candidate this strategy
    scored 0.533 against `numbered`'s 0.343 and won, because taking the greeting
    line too made the set larger. It produced the same five books by luck, via the
    chatter filter, and it would report the shape as prose. A message that mixes a
    numbered list with real sentences is where that luck runs out.
  */
  if (indexed.length >= 3 && !numbered.length && !bulleted.length) {
    out.push({ strategy: 'line-per-title', lines: indexed });
  }

  /*
    One line holding a run of titles. Only worth trying when there is essentially
    one line, or the split yields more pieces than there are lines.

    URLs come out BEFORE the split, and the corpus is why: `/` is one of the
    separators, so a single link anywhere in the message split it into "https:",
    "example.com" and "a 2. 折りたたみ北京 https:" — three pieces, which beat the
    real numbered strategy and shredded a perfectly ordinary list. A message whose
    only content is "check this <link>" produced two fabricated titles the same
    way.
  */
  const joined = indexed.map((line) => line.text.replace(URL_PATTERN, ' ')).join(' ');
  const pieces = joined.split(/\s*[、,;；/／]\s*/u).filter((piece) => piece.trim().length > 1);
  if (pieces.length >= 3 && pieces.length > indexed.length) {
    out.push({
      strategy: 'inline-separated',
      lines: pieces.map((text) => ({
        text,
        lineIndex: indexed[0]?.lineIndex ?? 0,
        // The piece is the title; the LINE is the provenance §2.5 shows beside it.
        rawLine: indexed[0]?.text ?? text,
      })),
    });
  }

  const quoted: Segments['lines'] = [];
  for (const line of indexed) {
    for (const match of line.text.matchAll(QUOTED_SPAN_GLOBAL)) {
      quoted.push({ text: match[1], lineIndex: line.lineIndex, rawLine: line.text });
    }
  }
  if (quoted.length) out.push({ strategy: 'quoted-prose', lines: quoted });
  return out;
}

/**
 * How plausible a segmentation is.
 *
 * Count rewards finding several titles over finding one. Uniformity rewards lines
 * of similar length, which is what a list looks like and a paragraph does not.
 * The length penalty is the one §2.2 names outright: a strategy that produces one
 * 400-character "title" must lose to one that produces five short ones.
 *
 * The single-line discount at the end is not cosmetic. Uniformity is *perfect* for
 * a set of one — there is nothing for it to vary against — so without it a
 * strategy that matched one line beats a strategy that matched five. Measured on
 * §2.1's own worked example, which mixes three numbered lines with one bulleted
 * one: `bulleted` scored 0.613 against `numbered`'s 0.376 and won, and the three
 * numbered books were dropped. A list of one is not a list.
 */
export function scoreSegmentation(lines: readonly { text: string }[]): number {
  if (!lines.length) return 0;
  const lengths = lines.map((line) => normalizeLine(line.text).length).filter((n) => n > 0);
  if (!lengths.length) return 0;
  const mean = lengths.reduce((sum, n) => sum + n, 0) / lengths.length;
  const variance =
    lengths.reduce((sum, n) => sum + (n - mean) ** 2, 0) / lengths.length;
  const spread = Math.sqrt(variance) / Math.max(1, mean);

  const count = Math.min(lengths.length, 12) / 12;
  const uniformity = 1 / (1 + spread);
  const overlong = lengths.filter((n) => n > 90).length / lengths.length;
  const tooShort = lengths.filter((n) => n < 2).length / lengths.length;
  const score = count * 0.7 + uniformity * 0.3 - overlong * 0.9 - tooShort * 0.5;
  return lengths.length < 2 ? score * 0.25 : score;
}

function cleanEntry(
  source: string,
  lineIndex: number,
  rawLine: string = source,
): ParsedReadingEntry | null {
  // The circled numeral has to go before NFKC folds it to a bare digit.
  let text = normalizeLine(source.replace(CIRCLED_MARKER, ''));

  // 1. URLs out first, so a trailing link cannot be mistaken for a title word.
  const urls = text.match(URL_PATTERN) ?? [];
  if (urls.length) text = normalizeLine(text.replace(URL_PATTERN, ' '));
  if (!text) return null;

  // 2/3. Markers, then trailing chatter.
  text = stripLeadingMarker(text);
  text = stripTrailingChatter(text);
  if (!text || isChatter(text)) return null;

  // 4. A quoted span wins outright — quotes are the strongest title signal there
  //    is, and everything outside them on that line is commentary.
  const quoted = QUOTED_SPAN.exec(text);
  if (quoted) text = normalizeLine(quoted[1]);

  // 5. Author, then 6. volume, then 7. the EN/JA pair.
  const authored = splitAuthor(text);
  const volumed = extractVolume(authored.line);
  const paired = pairTitles(stripTrailingChatter(volumed.line));
  const title = normalizeLine(paired.title);
  if (!title || /^[\s\p{P}\p{S}]+$/u.test(title)) return null;

  const entry: ParsedReadingEntry = { rawLine, lineIndex, title };
  if (paired.titleJa) entry.titleJa = paired.titleJa;
  if (paired.titleEn) entry.titleEn = paired.titleEn;
  if (authored.author) entry.author = authored.author;
  if (volumed.volume) entry.volume = volumed.volume;
  if (urls.length) entry.url = urls[0];

  const triage: ReadingListTriageReason | undefined =
    authored.triage ??
    (title.length < 3 ? 'very-short' : undefined) ??
    (title.length > 80 ? 'very-long' : undefined);
  if (triage) entry.needsTriage = triage;
  return entry;
}

/**
 * A pure function of `rawText`. §2.4 depends on that being literally true: a
 * better parser is re-run over stored imports and shown as a diff, which is only
 * meaningful if the same input cannot yield two different parses.
 */
export function parseReadingList(rawText: string): ParsedReadingList {
  const lines = rawText.split(/\r?\n/);

  // A URL alone on its line belongs to the LIST, not to an entry (§2.1).
  let sourceUrl: string | undefined;
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^https?:\/\/\S+$/.test(trimmed)) {
      sourceUrl = trimmed;
      break;
    }
  }
  const body = lines.map((line) => (line.trim() === sourceUrl ? '' : line));

  const candidates = segmentCandidates(body);
  if (!candidates.length) {
    return {
      entries: [],
      segmentation: 'line-per-title',
      parserVersion: READING_LIST_PARSER_VERSION,
      dropped: body.filter((line) => line.trim().length > 0),
      ...(sourceUrl ? { sourceUrl } : {}),
    };
  }

  let best = candidates[0];
  let bestScore = scoreSegmentation(best.lines);
  for (const candidate of candidates.slice(1)) {
    const score = scoreSegmentation(candidate.lines);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  /*
    A numbered or bulleted list rarely covers the whole message: §2.1 has three
    numbered lines, one bulleted, and one in prose. Taking only the winning
    strategy's lines would silently drop the other two — which is the single
    biggest way a parser loses a book, and the user would never know which.

    So the winner sets the SHAPE, and any remaining line that carries a marker or a
    quoted span still gets a pass. Such a line is NOT flagged for triage: §2.3 step
    3 calls a quoted span a strong title signal, and asking the user about the case
    the parser is most confident in is how a triage strip gets ignored.
  */
  const claimed = new Set(best.lines.map((line) => line.lineIndex));
  const entries: ParsedReadingEntry[] = [];
  const dropped: string[] = [];

  for (const line of best.lines) {
    const entry = cleanEntry(line.text, line.lineIndex, line.rawLine ?? line.text);
    if (entry) entries.push(entry);
    else dropped.push(line.text);
  }

  if (best.strategy !== 'line-per-title' && best.strategy !== 'inline-separated') {
    for (let index = 0; index < body.length; index++) {
      if (claimed.has(index)) continue;
      const text = body[index];
      if (!text.trim()) continue;
      const normalized = normalizeLine(text);
      // A leading marker is as strong a signal as a quote, and §2.1's own example
      // mixes `1.` with `-`: whichever of the two wins the score, the other's
      // lines must still be read or the message silently loses books.
      const marked = NUMBERED_LINE.test(normalized) || BULLETED_LINE.test(normalized);
      // Without either there is nothing to tell a title apart from a sentence, and
      // guessing is what §2.5 exists to prevent.
      if (!marked && !QUOTED_SPAN.test(normalized)) {
        dropped.push(text);
        continue;
      }
      const entry = cleanEntry(text, index);
      if (entry) entries.push(entry);
      else dropped.push(text);
    }
  }

  entries.sort((a, b) => a.lineIndex - b.lineIndex);
  return {
    entries,
    segmentation: best.strategy,
    parserVersion: READING_LIST_PARSER_VERSION,
    dropped,
    ...(sourceUrl ? { sourceUrl } : {}),
  };
}
