/**
 * In-book search for the novel reader.
 *
 * A hit is named the same way a saved position is: a part and a character
 * index among that part's running-text characters (`anchorChars` in
 * novelTextAnchor.ts — no spaces, no ruby readings, no inserted translations).
 * So a hit is found over the part's HTML without laying it out, and the reader
 * lands on it with the same character jump a bookmark uses, in any writing
 * mode and at any font size.
 *
 * Japanese and Chinese have no spaces between words, so a match is a plain
 * substring of the running text, never a word match. Spaces are not part of
 * the running text, so they are dropped from the query too. "Kana and width"
 * folds katakana onto hiragana and full-width letters/digits (and half-width
 * katakana) onto their usual forms, so カタカナ finds かたかな and ＡＢＣ finds abc.
 */
import { anchorChars, type CharPos } from './novelTextAnchor';

export interface SearchOptions {
  /** Match hiragana with katakana, and full-/half-width forms with each other. */
  ignoreWidth: boolean;
}

export interface SearchHit {
  /** Part (spine item) index. */
  part: number;
  /** Index of the first matched character among the part's anchor characters. */
  index: number;
  /** Matched characters. */
  length: number;
  /** `index / partLength`: the character fraction a jump lands on. */
  frac: number;
  before: string;
  match: string;
  after: string;
}

/** A part's running text, one entry per anchor character. */
export interface PartText {
  chars: string[];
}

export const SEARCH_MAX_HITS = 500;
const CONTEXT_CHARS = 14;

/** The running-text characters of one part's HTML (the same ones the reader anchors on). */
export function partTextOf(html: string, parser: DOMParser = new DOMParser()): PartText {
  if (!html) return { chars: [] };
  const doc = parser.parseFromString(`<!doctype html><body>${html}</body>`, 'text/html');
  const chars = anchorChars(doc.body).map((pos) => pos.node.data.slice(pos.offset, pos.offset + pos.length));
  return { chars };
}

function isSpaceChar(ch: string): boolean {
  return /^[\s\u3000\u200b]$/u.test(ch);
}

/** One character, folded for comparison. Never empty, so indexes stay aligned. */
export function foldChar(ch: string, opts: SearchOptions): string {
  let out = ch;
  if (opts.ignoreWidth) {
    const code = ch.codePointAt(0) ?? 0;
    // Half-width katakana and full-width ASCII → their usual forms.
    if ((code >= 0xff01 && code <= 0xff5e) || (code >= 0xff61 && code <= 0xff9f)) out = ch.normalize('NFKC');
    const k = out.codePointAt(0) ?? 0;
    // Katakana ァ..ヶ → hiragana ぁ..ゖ (same order, 0x60 apart).
    if (out.length === 1 && k >= 0x30a1 && k <= 0x30f6) out = String.fromCharCode(k - 0x60);
  }
  out = out.toLowerCase();
  return out || ch;
}

/** The query as folded characters, with spaces removed. */
export function foldQuery(query: string, opts: SearchOptions): string {
  let out = '';
  for (const ch of query) {
    if (isSpaceChar(ch)) continue;
    out += foldChar(ch, opts);
  }
  return out;
}

/**
 * Every match of `query` in `parts`, in reading order, at most `max`.
 * `capped` is true when more matches exist than were returned.
 */
export function searchParts(
  parts: readonly PartText[],
  query: string,
  opts: SearchOptions,
  max = SEARCH_MAX_HITS,
): { hits: SearchHit[]; capped: boolean } {
  const needle = foldQuery(query, opts);
  const hits: SearchHit[] = [];
  if (!needle) return { hits, capped: false };
  for (let part = 0; part < parts.length; part++) {
    const chars = parts[part].chars;
    if (!chars.length) continue;
    // Folded text plus where each character starts in it.
    const starts: number[] = new Array(chars.length);
    let hay = '';
    for (let i = 0; i < chars.length; i++) {
      starts[i] = hay.length;
      hay += foldChar(chars[i], opts);
    }
    let from = 0;
    for (;;) {
      const at = hay.indexOf(needle, from);
      if (at < 0) break;
      const first = charIndexAt(starts, at);
      // A match must begin on a character boundary (a fold can widen one).
      if (starts[first] === at) {
        const end = charIndexAt(starts, at + needle.length - 1);
        const length = end - first + 1;
        if (hits.length >= max) return { hits, capped: true };
        hits.push({
          part,
          index: first,
          length,
          frac: first / chars.length,
          before: chars.slice(Math.max(0, first - CONTEXT_CHARS), first).join(''),
          match: chars.slice(first, first + length).join(''),
          after: chars.slice(first + length, first + length + CONTEXT_CHARS).join(''),
        });
        from = at + needle.length;
      } else {
        from = at + 1;
      }
    }
  }
  return { hits, capped: false };
}

/** The character whose folded text covers offset `o`. */
function charIndexAt(starts: readonly number[], o: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (starts[mid] <= o) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/**
 * The live DOM range of `length` characters from `index`, given the rendered
 * part's anchor characters (`anchorChars(root)`), or null when the rendered
 * text no longer has that many characters.
 */
export function rangeOfChars(chars: readonly CharPos[], index: number, length: number): Range | null {
  const first = chars[index];
  const last = chars[index + length - 1];
  const doc = first?.node.ownerDocument;
  if (!first || !last || !doc) return null;
  const range = doc.createRange();
  try {
    range.setStart(first.node, first.offset);
    range.setEnd(last.node, last.offset + last.length);
  } catch {
    return null;
  }
  return range;
}

/** `rangeOfChars` for one hit inside `root` (the part's rendered element). */
export function rangeOfHit(root: Element, index: number, length: number): Range | null {
  return rangeOfChars(anchorChars(root), index, length);
}
