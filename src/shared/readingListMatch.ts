/**
 * Deciding whether a library item IS the book a pasted line asked for. §3 / §3.1.
 *
 * Pure and deterministic like the rest of `src/shared` — no I/O, no clock, no
 * Electron. `src/main/readingListsBinder.ts` is what runs it against the real
 * library and writes the result.
 *
 * The shape is deliberately the same as `mediaMetadataMatch.ts`: score, then let
 * the caller decide, with three dispositions rather than a boolean. A silent
 * wrong bind is worse than no bind — the entry stops asking to be acquired and
 * the user opens someone else's book from their own list — so anything short of
 * {@link BIND_ACCEPT} stays `wanted` and, above {@link BIND_SUGGEST}, only asks.
 *
 * `titleSimilarity` is reused rather than reimplemented: its containment ceiling
 * is precisely the "a sequel swallows its predecessor" guard this needs too.
 */

import { titleSimilarity } from './mediaMetadataMatch';
import { normalizeMediaTitleKey } from './mediaIdentity';
import { kataToHira } from './langs';
import type { ReadingVolumeRange, ReadingWorkRef } from './readingLists';

/** At or above this the binding is applied and the entry becomes `owned`. */
export const BIND_ACCEPT = 0.82;
/** At or above this but below accept: the entry stays `wanted` and shows "is this it?". */
export const BIND_SUGGEST = 0.55;

/**
 * Below this many characters a normalized key cannot reach accept on a fuzzy
 * match — the length-aware floor §3 asks for. "IQ" contains "I", and a two-token
 * Dice overlap on a three-character key is noise, not agreement. An exact key
 * equality is exempt: a short title that matches exactly really is that title.
 */
const SHORT_KEY_FLOOR = 4;

export interface ReadingBindCandidate {
  /** The library item's id. This is what lands in `boundItemIds`. */
  id: string;
  title: string;
  author?: string;
  /** A volume the importer already knew. When absent one is read off the title. */
  volume?: ReadingVolumeRange;
}

/** Everything about a work that survives into a match, computed once per work. */
export interface ReadingWorkFingerprint {
  workId: string;
  /** Readable title variants, deduplicated. Fed to `titleSimilarity`. */
  titles: string[];
  /** Normalized keys of those variants, plus kana and romaji folds. */
  keys: string[];
  authorKey: string | null;
  volume: ReadingVolumeRange | null;
}

export type ReadingBindDisposition = 'accept' | 'suggest' | 'reject';

export interface ReadingBindScore {
  workId: string;
  itemId: string;
  confidence: number;
  disposition: ReadingBindDisposition;
  /** Machine-readable, in scoring order. This is what a false bind is debugged from. */
  reasons: string[];
}

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

/* ------------------------------------------------------------- romaji -- */

/**
 * Hepburn for KANA ONLY, and the limit is deliberate rather than an omission.
 *
 * Kanji has no reading without a dictionary, and guessing one produces confident
 * wrong bindings — the exact failure this whole module is shaped to avoid. So a
 * kanji title simply contributes no romaji key and matches through its own kana
 * and its `titleEn` instead. What this DOES buy is the common real case: a friend
 * writes `ノルウェイの森`, the file on disk is `Noruwei no Mori`, and nothing else
 * in the tree can see that those are the same book.
 */
const ROMAJI_DIGRAPHS: Record<string, string> = {
  きゃ: 'kya', きゅ: 'kyu', きょ: 'kyo', しゃ: 'sha', しゅ: 'shu', しょ: 'sho',
  ちゃ: 'cha', ちゅ: 'chu', ちょ: 'cho', にゃ: 'nya', にゅ: 'nyu', にょ: 'nyo',
  ひゃ: 'hya', ひゅ: 'hyu', ひょ: 'hyo', みゃ: 'mya', みゅ: 'myu', みょ: 'myo',
  りゃ: 'rya', りゅ: 'ryu', りょ: 'ryo', ぎゃ: 'gya', ぎゅ: 'gyu', ぎょ: 'gyo',
  じゃ: 'ja', じゅ: 'ju', じょ: 'jo', びゃ: 'bya', びゅ: 'byu', びょ: 'byo',
  ぴゃ: 'pya', ぴゅ: 'pyu', ぴょ: 'pyo',
  // Katakana-only combinations a loanword title depends on. Written in hiragana
  // because the input is folded to hiragana before the table is consulted.
  ふぁ: 'fa', ふぃ: 'fi', ふぇ: 'fe', ふぉ: 'fo', うぃ: 'wi', うぇ: 'we', うぉ: 'wo',
  ゔぁ: 'va', ゔぃ: 'vi', ゔぇ: 've', ゔぉ: 'vo', てぃ: 'ti', でぃ: 'di',
  とぅ: 'tu', どぅ: 'du', しぇ: 'she', じぇ: 'je', ちぇ: 'che',
};

const ROMAJI_MONOGRAPHS: Record<string, string> = {
  あ: 'a', い: 'i', う: 'u', え: 'e', お: 'o',
  か: 'ka', き: 'ki', く: 'ku', け: 'ke', こ: 'ko',
  さ: 'sa', し: 'shi', す: 'su', せ: 'se', そ: 'so',
  た: 'ta', ち: 'chi', つ: 'tsu', て: 'te', と: 'to',
  な: 'na', に: 'ni', ぬ: 'nu', ね: 'ne', の: 'no',
  は: 'ha', ひ: 'hi', ふ: 'fu', へ: 'he', ほ: 'ho',
  ま: 'ma', み: 'mi', む: 'mu', め: 'me', も: 'mo',
  や: 'ya', ゆ: 'yu', よ: 'yo',
  ら: 'ra', り: 'ri', る: 'ru', れ: 're', ろ: 'ro',
  わ: 'wa', を: 'o', ん: 'n',
  が: 'ga', ぎ: 'gi', ぐ: 'gu', げ: 'ge', ご: 'go',
  ざ: 'za', じ: 'ji', ず: 'zu', ぜ: 'ze', ぞ: 'zo',
  だ: 'da', ぢ: 'ji', づ: 'zu', で: 'de', ど: 'do',
  ば: 'ba', び: 'bi', ぶ: 'bu', べ: 'be', ぼ: 'bo',
  ぱ: 'pa', ぴ: 'pi', ぷ: 'pu', ぺ: 'pe', ぽ: 'po',
  ゔ: 'vu',
  ぁ: 'a', ぃ: 'i', ぅ: 'u', ぇ: 'e', ぉ: 'o',
  ゃ: 'ya', ゅ: 'yu', ょ: 'yo',
};

// Hiragana and katakana proper, plus the iteration marks and the chōonpu, but
// deliberately NOT U+3099–U+309C: those are combining voice marks, and naming
// them in a class is what `no-misleading-character-class` exists to catch.
const KANA_RANGE = /[ぁ-ゖゝ-ヿ]/;

/**
 * Transliterates the kana runs of `text`; every other character is passed
 * through unchanged so `ノルウェイの森` still yields `noruuei no 森` — a partial
 * key that scores through Dice overlap rather than nothing at all.
 */
export function kanaToRomaji(text: string): string {
  if (!KANA_RANGE.test(text)) return text;
  const hira = kataToHira(text.normalize('NFKC'));
  let out = '';
  let index = 0;
  while (index < hira.length) {
    const pair = hira.slice(index, index + 2);
    const digraph = ROMAJI_DIGRAPHS[pair];
    if (digraph) {
      out += digraph;
      index += 2;
      continue;
    }
    const char = hira[index];
    // Sokuon doubles the next consonant. At end of input it has nothing to
    // double, so it is dropped rather than emitted as a stray letter.
    if (char === 'っ') {
      const next = hira.slice(index + 1, index + 3);
      const nextRomaji = ROMAJI_DIGRAPHS[next] ?? ROMAJI_MONOGRAPHS[hira[index + 1] ?? ''] ?? '';
      if (nextRomaji) out += nextRomaji[0] === 'c' ? 't' : nextRomaji[0];
      index += 1;
      continue;
    }
    // The chōonpu lengthens the preceding vowel. Hepburn writes that as a macron;
    // a doubled vowel is the ASCII spelling a filename actually uses, and both
    // sides of a comparison go through this same function.
    if (char === 'ー') {
      if (out) out += out[out.length - 1];
      index += 1;
      continue;
    }
    out += ROMAJI_MONOGRAPHS[char] ?? char;
    index += 1;
  }
  return out;
}

/* -------------------------------------------------------- fingerprint -- */

/**
 * Adds `raw`'s normalized key, its romaji key, and the space-stripped form of
 * each.
 *
 * The stripped form is not belt-and-braces — it is required. Japanese writes no
 * word boundaries, so `ノルウェイのもり` romanizes to `noruweinomori` while the
 * file beside it on disk is `Noruwei no Mori`. Without the stripped variant those
 * two are a fuzzy near-miss instead of the exact same title, which is the single
 * case the transliterator was written for.
 */
function pushKey(keys: Set<string>, raw: string | undefined): void {
  if (!raw) return;
  for (const candidate of [normalizeMediaTitleKey(raw), normalizeMediaTitleKey(kanaToRomaji(raw))]) {
    if (!candidate) continue;
    keys.add(candidate);
    const stripped = candidate.replace(/\s+/g, '');
    if (stripped) keys.add(stripped);
  }
}

/**
 * The matcher fingerprint §3.1 says a `wanted` entry keeps. Derived, never
 * stored: a stored fingerprint would go stale the moment the romanizer improves,
 * and recomputing it costs a few string operations per work.
 */
export function readingWorkFingerprint(work: ReadingWorkRef): ReadingWorkFingerprint {
  const titles = [...new Set(
    [work.titleRaw, work.titleJa, work.titleEn, work.titleRomaji]
      .map((title) => title?.trim())
      .filter((title): title is string => Boolean(title)),
  )];
  const keys = new Set<string>();
  for (const title of titles) pushKey(keys, title);
  return {
    workId: work.id,
    titles,
    keys: [...keys],
    authorKey: work.authorRaw ? normalizeMediaTitleKey(work.authorRaw) || null : null,
    volume: work.volume ?? null,
  };
}

function volumesOverlap(a: ReadingVolumeRange, b: ReadingVolumeRange): boolean {
  return a.from <= (b.to ?? b.from) && b.from <= (a.to ?? a.from);
}

/* -------------------------------------------------------------- score -- */

/**
 * Scores one library item against one work.
 *
 * The title carries the decision and everything else only adjusts, with one
 * deliberate exception: a volume DISAGREEMENT is a hard penalty rather than a
 * nudge. Volume 1 and volume 7 of a series have identical titles, so the title
 * signal is at its strongest exactly where it is least able to tell them apart,
 * and binding the wrong volume is a wrong answer rather than a weak one.
 */
export function scoreReadingBind(
  fingerprint: ReadingWorkFingerprint,
  candidate: ReadingBindCandidate,
): ReadingBindScore {
  const reasons: string[] = [];
  const candidateTitles = [...new Set([candidate.title, kanaToRomaji(candidate.title)])].filter(
    Boolean,
  );
  const candidateKeys = new Set<string>();
  for (const title of candidateTitles) pushKey(candidateKeys, title);

  let exact = false;
  for (const key of fingerprint.keys) {
    if (candidateKeys.has(key)) {
      exact = true;
      break;
    }
  }

  let best = 0;
  if (exact) {
    best = 1;
    reasons.push('title-exact');
  } else {
    for (const left of fingerprint.titles) {
      for (const right of candidateTitles) {
        const score = Math.max(
          titleSimilarity(left, right),
          titleSimilarity(kanaToRomaji(left), right),
        );
        if (score > best) best = score;
      }
    }
    reasons.push(best > 0 ? 'title-partial' : 'title-mismatch');
  }

  let confidence = best;

  if (fingerprint.authorKey && candidate.author) {
    const authorScore = titleSimilarity(fingerprint.authorKey, candidate.author);
    if (authorScore >= 0.8) {
      confidence += 0.1;
      reasons.push('author-match');
    } else if (authorScore < 0.3) {
      // A warning, never a rejection: the same book is catalogued under a romanized
      // author on one shelf and a kanji author on another, and neither is wrong.
      confidence -= 0.12;
      reasons.push('author-mismatch');
    } else {
      reasons.push('author-near');
    }
  }

  const candidateVolume = candidate.volume ?? null;
  if (fingerprint.volume && candidateVolume) {
    if (volumesOverlap(fingerprint.volume, candidateVolume)) {
      confidence += 0.06;
      reasons.push('volume-match');
    } else {
      confidence -= 0.35;
      reasons.push('volume-mismatch');
    }
  } else if (fingerprint.volume || candidateVolume) {
    // One side simply did not record a volume. That is silence, not disagreement.
    reasons.push('volume-unknown');
  }

  if (!exact && best > 0) {
    const shortest = Math.min(
      ...[...fingerprint.keys, ...candidateKeys].map((key) => key.length).filter((n) => n > 0),
      Number.MAX_SAFE_INTEGER,
    );
    if (shortest < SHORT_KEY_FLOOR) {
      confidence = Math.min(confidence, BIND_SUGGEST - 0.01);
      reasons.push('short-key-floor');
    }
  }

  const bounded = clamp01(confidence);
  return {
    workId: fingerprint.workId,
    itemId: candidate.id,
    confidence: bounded,
    disposition: readingBindDisposition(bounded),
    reasons,
  };
}

export function readingBindDisposition(confidence: number): ReadingBindDisposition {
  if (confidence >= BIND_ACCEPT) return 'accept';
  if (confidence >= BIND_SUGGEST) return 'suggest';
  return 'reject';
}

/**
 * The single best candidate, or `null` when nothing even suggests.
 *
 * Ties break on the earlier candidate, which is the caller's own ordering —
 * `readingListsBinder` passes newest-first, so a re-rip of a book already bound
 * does not displace the copy the user has been reading.
 */
export function bestReadingBind(
  fingerprint: ReadingWorkFingerprint,
  candidates: readonly ReadingBindCandidate[],
): ReadingBindScore | null {
  let best: ReadingBindScore | null = null;
  for (const candidate of candidates) {
    const score = scoreReadingBind(fingerprint, candidate);
    if (score.disposition === 'reject') continue;
    if (!best || score.confidence > best.confidence) best = score;
  }
  return best;
}
