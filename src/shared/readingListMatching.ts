/**
 * Reading Lists P2 — deciding whether a pasted title *is* a book you already hold.
 *
 * `docs/ACTIVE/READING_LISTS_PLAN.md` §3(a) is the design; this file is its
 * executable half. It scores, it never binds: a score above {@link BIND_ACCEPT}
 * is the caller's licence to bind, a score between {@link BIND_SUGGEST} and
 * accept produces an "is this it?" suggestion the user confirms, and everything
 * below produces nothing at all. The plan's §10.4 — "titles are not identity" —
 * is why the middle band exists rather than a single threshold.
 *
 * Three things here are deliberate and are the reason the cheaper shapes were
 * rejected:
 *
 *   · **Scores are explained.** Every result carries the signals that produced
 *     it. §11.4 wants an honest "why do you think that", and when a false bind
 *     is reported the signal breakdown is the only way to tell which rule
 *     misfired — the same argument §4.3 makes for the finish detector's
 *     `evidence`.
 *   · **A short title cannot accept on fuzz.** `titleSimilarity`'s containment
 *     branch is generous by design, and against two-character titles it will
 *     happily tie an unrelated book. The length floor below is what stops that,
 *     and its negative control is in the suite.
 *   · **Kana are transliterated; kanji are not.** A kana→Hepburn table is
 *     twenty lines and closes the real `よるのばけもの` / `Yoru no Bakemono`
 *     case. Reading kanji needs a dictionary, so this module does not pretend
 *     to: a kanji title that has no romaji variant on either side simply scores
 *     on its own script and falls to `none` rather than guessing.
 *
 * Pure and deterministic, like the rest of `src/shared` — no clock, no I/O. The
 * library side lives in `src/main/readingListsBinding.ts`.
 */

import { normalizeMediaTitleKey } from './mediaIdentity';
import { titleSimilarity } from './mediaMetadataMatch';
import type { ReadingWorkRef } from './readingLists';

/** At or above this, the caller may bind and mark the entry `owned`. */
export const BIND_ACCEPT = 0.82;
/** At or above this but below accept: offer it, never apply it. */
export const BIND_SUGGEST = 0.55;

/**
 * Below this many characters, a non-exact title match contributes nothing.
 *
 * Latin and CJK get different floors because they carry different information
 * per character: `IT` and `In` share half their letters and nothing else, while
 * two kanji are already a distinguishing title. Both floors are exercised by the
 * suite's negative controls.
 */
const FUZZY_FLOOR_LATIN = 5;
const FUZZY_FLOOR_CJK = 3;

/** A library item, narrowed to what matching actually reads. */
export interface ReadingMatchCandidate {
  id: string;
  title: string;
  /** Author as the item records it, when it records one. */
  author?: string;
  /** Volume the file itself claims, when one was parsed out of it. */
  volume?: number;
  /** Other names for the same item: a canonical work title, a filename. */
  altTitles?: readonly string[];
}

export type ReadingMatchDisposition = 'accept' | 'suggest' | 'none';

/** Why a score is what it is. Never decoration — see the header. */
export interface ReadingMatchSignals {
  /** Best title similarity found across every title pair tried, 0–1. */
  title: number;
  /** Which pair produced it. `romaji` means a transliteration was involved. */
  titleVia: 'exact' | 'romaji' | 'fuzzy' | 'none';
  /** `+1` both known and agreeing, `-1` both known and disagreeing, `0` unknown. */
  author: -1 | 0 | 1;
  /** `+1` the item's volume is inside the work's range, `-1` outside, `0` unknown. */
  volume: -1 | 0 | 1;
  /** True when the length floor suppressed an otherwise-scoring fuzzy match. */
  belowLengthFloor: boolean;
}

export interface ReadingMatchScore {
  candidateId: string;
  score: number;
  signals: ReadingMatchSignals;
}

export interface ReadingMatchOutcome {
  disposition: ReadingMatchDisposition;
  /** The winner, or `null` when nothing scored above zero. */
  best: ReadingMatchScore | null;
  /** The next best, when there was one. A near-tie is why a caller may want to ask. */
  runnerUp: ReadingMatchScore | null;
}

/* ------------------------------------------------------------- romaji -- */

const KANA_DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo',
  ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  しゃ: 'sha', しゅ: 'shu', しょ: 'sho', しぇ: 'she',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', じぇ: 'je',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', ちぇ: 'che',
  ぢゃ: 'ja', ぢゅ: 'ju', ぢょ: 'jo',
  にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo',
  びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo',
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo',
  てぃ: 'ti', でぃ: 'di', とぅ: 'tu', どぅ: 'du',
  うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo',
};

const KANA_MONOGRAPHS: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', ゐ: 'wi', ゑ: 'we', を: 'wo', ん: 'n',
  ゔ: 'vu',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
};

const KANA_RANGE = /[ぁ-ゖァ-ヺー]/;

function katakanaToHiragana(text: string): string {
  let out = '';
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    // The two syllabaries are 0x60 apart for every syllable in this range; ー and
    // ・ are outside it and are handled by the transliterator itself.
    out += code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
  }
  return out;
}

/**
 * Kana → Hepburn romaji. Kanji and everything else pass through unchanged.
 *
 * Returns the input untouched when it holds no kana at all, so a caller can test
 * `result !== input` to ask "was there anything to transliterate".
 */
export function kanaToRomaji(raw: string): string {
  if (!KANA_RANGE.test(raw)) return raw;
  const kana = katakanaToHiragana(raw.normalize('NFKC'));
  let out = '';
  let index = 0;
  while (index < kana.length) {
    const char = kana[index];
    // Prolonged sound mark: repeat whatever vowel we last emitted. `ー` after a
    // consonant-only tail (only `n` can be one) is dropped rather than invented.
    if (char === 'ー') {
      const last = out.slice(-1);
      if ('aiueo'.includes(last)) out += last;
      index += 1;
      continue;
    }
    // Sokuon doubles the consonant the *next* syllable starts with.
    if (char === 'っ') {
      const next = KANA_DIGRAPHS[kana.slice(index + 1, index + 3)] ?? KANA_MONOGRAPHS[kana[index + 1]];
      if (next && !'aiueo'.includes(next[0])) out += next[0] === 'c' ? 't' : next[0];
      index += 1;
      continue;
    }
    const digraph = KANA_DIGRAPHS[kana.slice(index, index + 2)];
    if (digraph) {
      out += digraph;
      index += 2;
      continue;
    }
    const mono = KANA_MONOGRAPHS[char];
    if (mono) {
      out += mono;
      index += 1;
      continue;
    }
    // Interpuncts separate names in katakana titles; everything else survives.
    out += char === '・' ? ' ' : char;
    index += 1;
  }
  return out;
}

/* -------------------------------------------------------------- scoring -- */

const CJK = /[぀-ヿ㐀-鿿豈-﫿]/;

function collapse(key: string): string {
  return key.replace(/\s+/g, '');
}

/** Dice over character bigrams — the fallback for scripts that have no spaces. */
function bigramDice(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) return 0;
  const left = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    left.set(gram, (left.get(gram) ?? 0) + 1);
  }
  let shared = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const seen = left.get(gram) ?? 0;
    if (seen > 0) {
      shared += 1;
      left.set(gram, seen - 1);
    }
  }
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

function tooShortToFuzz(a: string, b: string): boolean {
  const floor = CJK.test(a) || CJK.test(b) ? FUZZY_FLOOR_CJK : FUZZY_FLOOR_LATIN;
  return Math.min(collapse(a).length, collapse(b).length) < floor;
}

/**
 * Similarity of two titles for *this* feature, 0–1.
 *
 * `titleSimilarity` handles spaced scripts well and CJK badly — its token branch
 * sees one token per side, so `コンビニ人間` against `コンビニ人間 上巻` scores on
 * containment or not at all. The bigram branch covers that, ceilinged at 0.72 so
 * it can never outrank an exact key match, exactly as containment is.
 */
export function readingTitleSimilarity(a: string, b: string): number {
  const left = normalizeMediaTitleKey(a);
  const right = normalizeMediaTitleKey(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  if (collapse(left) === collapse(right)) return 0.97;
  if (tooShortToFuzz(left, right)) return 0;
  const spaced = titleSimilarity(a, b);
  const bigram = Math.min(0.72, bigramDice(collapse(left), collapse(right)) * 0.8);
  return Math.max(spaced, bigram);
}

function titleVariants(values: readonly (string | undefined)[]): string[] {
  const out = new Set<string>();
  for (const value of values) {
    if (!value || !value.trim()) continue;
    out.add(value);
    const romaji = kanaToRomaji(value);
    if (romaji !== value) out.add(romaji);
  }
  return [...out];
}

function bestTitleMatch(
  work: ReadingWorkRef,
  candidate: ReadingMatchCandidate,
): { score: number; via: ReadingMatchSignals['titleVia']; floored: boolean } {
  const workRaw = [work.titleRaw, work.titleJa, work.titleEn, work.titleRomaji];
  const candidateRaw = [candidate.title, ...(candidate.altTitles ?? [])];
  const workTitles = titleVariants(workRaw);
  const candidateTitles = titleVariants(candidateRaw);

  let best = 0;
  let via: ReadingMatchSignals['titleVia'] = 'none';
  let transliterated = false;
  let floored = false;

  for (const left of workTitles) {
    const leftIsRomaji = !workRaw.includes(left);
    for (const right of candidateTitles) {
      const rightIsRomaji = !candidateRaw.includes(right);
      if (tooShortToFuzz(normalizeMediaTitleKey(left), normalizeMediaTitleKey(right))) {
        // Record that the floor is what silenced this pair, so a caller reading
        // `title: 0` can tell "nothing alike" from "too short to judge".
        if (normalizeMediaTitleKey(left) !== normalizeMediaTitleKey(right)) floored = true;
      }
      const score = readingTitleSimilarity(left, right);
      if (score <= best) continue;
      best = score;
      transliterated = leftIsRomaji || rightIsRomaji;
      via = score >= 0.97 ? 'exact' : 'fuzzy';
    }
  }
  if (best > 0 && transliterated) via = 'romaji';
  return { score: best, via, floored: floored && best === 0 };
}

function authorAgreement(work: ReadingWorkRef, candidate: ReadingMatchCandidate): -1 | 0 | 1 {
  const left = normalizeMediaTitleKey(work.authorRaw ?? '');
  const right = normalizeMediaTitleKey(candidate.author ?? '');
  if (!left || !right) return 0;
  // Author strings arrive in both orders and with or without a middle name, so
  // token overlap decides rather than equality; "Sayaka Murata" and "村田沙耶香"
  // share nothing and correctly read as unknown-disagreement territory only when
  // both sides are in the same script.
  return readingTitleSimilarity(left, right) >= 0.5 ? 1 : -1;
}

function volumeAgreement(work: ReadingWorkRef, candidate: ReadingMatchCandidate): -1 | 0 | 1 {
  if (!work.volume || candidate.volume === undefined) return 0;
  const from = work.volume.from;
  const to = work.volume.to ?? work.volume.from;
  return candidate.volume >= from && candidate.volume <= to ? 1 : -1;
}

/**
 * One work against one candidate.
 *
 * The title carries 0.9 of the weight so an exact match alone (0.9) clears
 * accept and nothing else can: a merely-similar title tops out at the 0.72
 * containment/bigram ceiling, and even with author *and* volume agreeing that is
 * 0.648 + 0.1 + 0.05 = 0.798, still under the line. A volume mismatch is the
 * heaviest single penalty because "vol 1" and "vol 7" of the same series share a
 * title completely and are not the same book.
 *
 * 0.9 rather than 0.85 is measured, not chosen: at 0.85 a real subtitle suffix
 * (`Kino no Tabi` against `Kino no Tabi - Beautiful World`) scored 0.532 and fell
 * to `none`, which hides exactly the case §3 wants offered as "is this it?".
 */
export function scoreReadingMatch(
  work: ReadingWorkRef,
  candidate: ReadingMatchCandidate,
): ReadingMatchScore {
  const title = bestTitleMatch(work, candidate);
  const author = authorAgreement(work, candidate);
  const volume = volumeAgreement(work, candidate);

  let score = title.score * 0.9;
  if (score > 0) {
    if (author === 1) score += 0.1;
    else if (author === -1) score -= 0.15;
    if (volume === 1) score += 0.05;
    else if (volume === -1) score -= 0.25;
  }

  return {
    candidateId: candidate.id,
    score: Math.min(1, Math.max(0, score)),
    signals: {
      title: title.score,
      titleVia: title.via,
      author,
      volume,
      belowLengthFloor: title.floored,
    },
  };
}

/**
 * One work against everything the library holds.
 *
 * A near-tie deliberately does NOT accept: two candidates within 0.05 of each
 * other above the accept line means the title matched a series rather than a
 * book, and silently binding the first one is how a user ends up reading volume
 * 4 because volume 1 sorted later. It degrades to a suggestion instead.
 */
export function matchReadingWork(
  work: ReadingWorkRef,
  candidates: readonly ReadingMatchCandidate[],
): ReadingMatchOutcome {
  const scored = candidates
    .map((candidate) => scoreReadingMatch(work, candidate))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.candidateId.localeCompare(b.candidateId));

  const best = scored[0] ?? null;
  const runnerUp = scored[1] ?? null;
  if (!best) return { disposition: 'none', best: null, runnerUp: null };

  const ambiguous = !!runnerUp && best.score - runnerUp.score < 0.05;
  if (best.score >= BIND_ACCEPT && !ambiguous) {
    return { disposition: 'accept', best, runnerUp };
  }
  if (best.score >= BIND_SUGGEST) return { disposition: 'suggest', best, runnerUp };
  return { disposition: 'none', best, runnerUp };
}
