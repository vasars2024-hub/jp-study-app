/**
 * Dictionary-guided OCR decoding, and the per-character merge of two engines.
 *
 * An OCR engine reads characters; a learner reads words. On stylised lettering
 * the recogniser's first guess is often a real character that makes no word
 * (恐竜の → 彼後の, 語る → 語え) while the right one sits a little lower in its
 * own candidate list. This module uses the dictionary as the judge:
 *
 *  - **Coverage.** How many characters of a line sit inside a dictionary word of
 *    two or more characters (CJK: the best non-overlapping segmentation by
 *    dynamic programming; Russian: whole space-separated words).
 *  - **Decoding.** For the characters the engine was unsure of, try its top-k
 *    alternatives (one position, or two near each other: 彼後 → 恐竜 needs both)
 *    and take a change only when it turns characters that were in no word into
 *    a real word, and only when the alternative's probability is reasonable.
 *    A character already inside a word is never touched.
 *  - **Merge.** Two engines' reads of the same line are combined per character
 *    when they align, otherwise compared whole, by coverage plus confidence.
 *
 * The dictionary is injected (`WordOracle`), so main uses its real dictionary
 * and the tests use a word list. Every lookup is cached and bounded by a count
 * and a deadline, so a long page cannot stall a read.
 */

import type { OcrChar, OcrEngineId, OcrLangId } from './ocrRouterTypes';

export interface WordOracle {
  /** Whether `text` is a dictionary word (exact headword or reading, or a de-inflected form). */
  isWord(text: string): Promise<boolean>;
  /** Lookups actually made (cache misses). */
  readonly lookups: number;
  /** True once the count or the deadline ran out; later queries answer false. */
  readonly exhausted: boolean;
}

export function memoWordOracle(
  lookup: (text: string) => Promise<boolean>,
  opts: { maxLookups?: number; deadline?: number; now?: () => number } = {},
): WordOracle {
  const cache = new Map<string, Promise<boolean>>();
  const maxLookups = opts.maxLookups ?? 600;
  const now = opts.now ?? (() => Date.now());
  let lookups = 0;
  let exhausted = false;
  return {
    get lookups() {
      return lookups;
    },
    get exhausted() {
      return exhausted;
    },
    isWord(text: string): Promise<boolean> {
      const hit = cache.get(text);
      if (hit) return hit;
      if (lookups >= maxLookups || (opts.deadline !== undefined && now() > opts.deadline)) {
        exhausted = true;
        return Promise.resolve(false);
      }
      lookups += 1;
      const answer = lookup(text).catch(() => false);
      cache.set(text, answer);
      return answer;
    },
  };
}

/** A character that can be part of a word (letters, digits, the iteration and long-vowel marks). */
const WORD_CHAR = /^[\p{L}\p{N}ー々〆ヶ]$/u;

export function isWordChar(ch: string): boolean {
  return WORD_CHAR.test(ch);
}

export interface Coverage {
  /** Per character: inside a dictionary word. */
  covered: boolean[];
  /** How many characters are covered. */
  score: number;
}

/**
 * Whether a language writes words without spaces between them (Japanese,
 * Chinese, Thai, Lao, Khmer, Burmese, Tibetan): coverage then segments by the
 * dictionary instead of splitting at spaces.
 */
export function writesWithoutSpaces(lang: OcrLangId): boolean {
  return /^(ja|zh|cmn|yue|th|lo|km|my|bo)(-|$)/i.test(lang);
}

/** Longest word tried in CJK text. */
export const COVERAGE_MAX_LEN = 4;

/**
 * How much of `chars` the dictionary explains. Unspaced scripts (CJK, Thai…):
 * the segmentation into dictionary words (2–4 characters) that covers the most
 * characters; single characters never count (every kanji is a word, so they
 * would say nothing). Spaced scripts: whole words of two letters or more.
 */
export async function wordCoverage(
  chars: readonly string[],
  lang: OcrLangId,
  oracle: WordOracle,
  maxLen = COVERAGE_MAX_LEN,
): Promise<Coverage> {
  const n = chars.length;
  const covered = new Array<boolean>(n).fill(false);
  if (!writesWithoutSpaces(lang)) {
    let score = 0;
    let i = 0;
    while (i < n) {
      if (!isWordChar(chars[i])) {
        i += 1;
        continue;
      }
      let j = i;
      while (j < n && isWordChar(chars[j])) j += 1;
      const word = chars.slice(i, j).join('').toLowerCase();
      if (j - i >= 2 && await oracle.isWord(word)) {
        for (let k = i; k < j; k++) covered[k] = true;
        score += j - i;
      }
      i = j;
    }
    return { covered, score };
  }
  // best[i]: most characters coverable in chars[i..]; take[i]: the word length used there (0 = skip).
  const best = new Array<number>(n + 1).fill(0);
  const take = new Array<number>(n + 1).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    best[i] = best[i + 1];
    take[i] = 0;
    if (!isWordChar(chars[i])) continue;
    for (let len = 2; len <= maxLen && i + len <= n; len++) {
      if (!isWordChar(chars[i + len - 1])) break;
      const value = len + best[i + len];
      if (value <= best[i]) continue;
      if (await oracle.isWord(chars.slice(i, i + len).join(''))) {
        best[i] = value;
        take[i] = len;
      }
    }
  }
  for (let i = 0; i < n;) {
    if (take[i]) {
      for (let k = i; k < i + take[i]; k++) covered[k] = true;
      i += take[i];
    } else {
      i += 1;
    }
  }
  return { covered, score: best[0] };
}

export interface DecodeOptions {
  lang: OcrLangId;
  oracle: WordOracle;
  /** A character at or above this is trusted as read. */
  unsureP?: number;
  /** An alternative below this is not considered. */
  minAltP?: number;
  /** ...nor one far below the character it would replace. */
  minAltRatio?: number;
  /** At most this many changes per line. */
  maxChanges?: number;
  /** At most this many unsure positions are tried (the least sure first). */
  maxPositions?: number;
}

export const DECODE_UNSURE_P = 0.9;
export const DECODE_MIN_ALT_P = 0.04;
export const DECODE_MIN_ALT_RATIO = 0.08;

function product(values: readonly number[]): number {
  return values.reduce((a, b) => a * b, 1);
}

/**
 * Correct a line's characters with the dictionary (see the module comment).
 * Returns the characters (a changed one keeps what the engine read in `was`,
 * and the engine's own reading becomes its first alternative) and how many
 * were changed.
 */
export async function dictionaryDecode(chars: readonly OcrChar[], opts: DecodeOptions): Promise<{ chars: OcrChar[]; changed: number }> {
  const unsureP = opts.unsureP ?? DECODE_UNSURE_P;
  const minAltP = opts.minAltP ?? DECODE_MIN_ALT_P;
  const minAltRatio = opts.minAltRatio ?? DECODE_MIN_ALT_RATIO;
  const maxChanges = opts.maxChanges ?? 3;
  const maxPositions = opts.maxPositions ?? 8;
  const out = chars.map((c) => ({ ...c, alts: [...c.alts] }));
  const current = out.map((c) => c.ch);
  const altsAt = (i: number): Array<{ ch: string; p: number }> => out[i].alts
    .filter((a) => isWordChar(a.ch) && a.p >= minAltP && a.p >= out[i].p * minAltRatio)
    .slice(0, 3);
  const positions = out
    .map((c, i) => ({ i, p: c.p }))
    .filter(({ i, p }) => p < unsureP && isWordChar(out[i].ch) && altsAt(i).length > 0)
    .sort((a, b) => a.p - b.p)
    .slice(0, maxPositions)
    .map(({ i }) => i)
    .sort((a, b) => a - b);
  if (!positions.length) return { chars: out, changed: 0 };

  let coverage = await wordCoverage(current, opts.lang, opts.oracle);
  const done = new Set<number>();
  let changed = 0;
  while (changed < maxChanges && !opts.oracle.exhausted) {
    const open = positions.filter((i) => !done.has(i) && !coverage.covered[i]);
    if (!open.length) break;
    type Change = Array<{ i: number; ch: string; p: number }>;
    const tries: Change[] = [];
    for (const i of open) for (const a of altsAt(i)) tries.push([{ i, ch: a.ch, p: a.p }]);
    for (let x = 0; x < open.length; x++) {
      for (let y = x + 1; y < open.length; y++) {
        const i = open[x];
        const j = open[y];
        if (j - i >= COVERAGE_MAX_LEN) break;
        for (const a of altsAt(i).slice(0, 2)) for (const b of altsAt(j).slice(0, 2)) tries.push([{ i, ch: a.ch, p: a.p }, { i: j, ch: b.ch, p: b.p }]);
        // One side kept as read, the other changed, is already a single try.
      }
    }
    let best: { change: Change; coverage: Coverage; gain: number; prob: number } | null = null;
    for (const change of tries) {
      const next = [...current];
      for (const { i, ch } of change) next[i] = ch;
      const cov = await wordCoverage(next, opts.lang, opts.oracle);
      const gain = cov.score - coverage.score;
      if (gain <= 0) continue;
      // Only a change that puts every changed character into a word, without
      // costing a character that was already in one.
      if (!change.every(({ i }) => cov.covered[i])) continue;
      if (coverage.covered.some((was, k) => was && !cov.covered[k])) continue;
      const prob = product(change.map((c) => c.p));
      if (!best || gain > best.gain || (gain === best.gain && prob > best.prob)) best = { change, coverage: cov, gain, prob };
    }
    if (!best) break;
    for (const { i, ch, p } of best.change) {
      const was = out[i];
      out[i] = {
        ...was,
        ch,
        p,
        was: was.was ?? was.ch,
        alts: [{ ch: was.ch, p: was.p }, ...was.alts.filter((a) => a.ch !== ch && a.ch !== was.ch)],
      };
      current[i] = ch;
      done.add(i);
      changed += 1;
    }
    coverage = best.coverage;
  }
  return { chars: out, changed };
}

// ---------------------------------------------------------------------------
// Merging two engines' reads of one line

export interface LineReadCandidate {
  engine: OcrEngineId;
  text: string;
  /** 0–1; manga-ocr reading a crop reports none, so the caller passes its prior. */
  confidence: number;
  chars?: OcrChar[];
}

export interface MergedLine {
  text: string;
  chars: OcrChar[];
  confidence: number;
  engine: OcrEngineId;
  consulted: OcrEngineId[];
}

/** How much coverage weighs against confidence when two reads compete. */
const COVERAGE_WEIGHT = 0.6;
/** At most this many disagreeing positions are combined character by character. */
const MAX_DIFFS = 4;

function charsOf(read: LineReadCandidate): OcrChar[] {
  const text = [...read.text];
  if (read.chars && read.chars.length === text.length) return read.chars.map((c) => ({ ...c, engine: c.engine ?? read.engine }));
  return text.map((ch) => ({ ch, p: read.confidence, alts: [], engine: read.engine }));
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

/**
 * The best line from two or more engines' reads. When two reads have the same
 * length, every mix of their disagreeing characters is a candidate (so manga-ocr
 * can fix one character of PaddleOCR's line and keep the rest); otherwise the
 * whole lines compete. The winner maximises dictionary coverage, then
 * confidence; at a tie the first read (the primary engine) stays. The losing
 * engine's character at each disagreement becomes an alternative.
 */
export async function mergeLineReads(reads: readonly LineReadCandidate[], lang: OcrLangId, oracle: WordOracle): Promise<MergedLine> {
  const usable = reads.filter((r) => r.text.trim());
  const consulted = [...new Set(reads.map((r) => r.engine))];
  if (!usable.length) {
    const first = reads[0];
    return { text: '', chars: [], confidence: 0, engine: first?.engine ?? 'web', consulted };
  }
  const candidates: OcrChar[][] = usable.map(charsOf);
  const [primary] = candidates;
  for (const other of candidates.slice(1)) {
    if (other.length !== primary.length) continue;
    const diffs = primary.map((c, i) => (c.ch !== other[i].ch ? i : -1)).filter((i) => i >= 0);
    if (!diffs.length || diffs.length > MAX_DIFFS) continue;
    for (let mask = 1; mask < (1 << diffs.length); mask++) {
      const mix = primary.map((c) => ({ ...c }));
      diffs.forEach((i, bit) => {
        if (mask & (1 << bit)) mix[i] = { ...other[i] };
      });
      candidates.push(mix);
    }
  }
  let best: { chars: OcrChar[]; score: number } | null = null;
  for (const cand of candidates) {
    const cov = await wordCoverage(cand.map((c) => c.ch), lang, oracle);
    const wordy = cand.filter((c) => isWordChar(c.ch)).length;
    const score = COVERAGE_WEIGHT * (wordy ? cov.score / wordy : 0) + (1 - COVERAGE_WEIGHT) * mean(cand.map((c) => c.p));
    if (!best || score > best.score + 1e-9) best = { chars: cand, score };
  }
  const chosen = (best as { chars: OcrChar[] }).chars;
  // What the other engines read at each position becomes an alternative there.
  const merged = chosen.map((c, i) => {
    const others = candidates
      .slice(0, usable.length)
      .filter((cand) => cand.length === chosen.length && cand[i].ch !== c.ch)
      .map((cand) => ({ ch: cand[i].ch, p: cand[i].p }));
    const alts = [...others, ...c.alts].filter((a, k, all) => a.ch !== c.ch && all.findIndex((b) => b.ch === a.ch) === k);
    return { ...c, alts };
  });
  const counts = new Map<OcrEngineId, number>();
  for (const c of merged) counts.set(c.engine ?? usable[0].engine, (counts.get(c.engine ?? usable[0].engine) ?? 0) + 1);
  const engine = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? usable[0].engine;
  return {
    text: merged.map((c) => c.ch).join(''),
    chars: merged,
    confidence: mean(merged.map((c) => c.p)),
    engine,
    consulted,
  };
}
