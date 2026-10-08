/**
 * Pure helpers for the hover scan: "which dictionary word starts here?".
 *
 * The browser extension hovers a point in page text and sends the text from
 * that point on. The main process looks up every prefix of it in one batched
 * read and answers with the LONGEST prefix that is a real word (`main/
 * dictionary.ts` `scanOfflinePrefixes`). Choosing that prefix is kept here, away
 * from the database, so it can be tested on plain data.
 */

import type { DeinflectionInfo, DictEntry, DictResult } from './types';

/** The provenance values that mean "the query is this word". */
export type ScanAcceptedVia = 'exact' | 'reading' | 'deinflected';

/** Default and ceiling for how many characters of the window are scanned. */
export const SCAN_DEFAULT_MAX_LEN = 24;
export const SCAN_MAX_LEN_CEILING = 64;

const VIA_RANK: Record<ScanAcceptedVia, number> = { exact: 0, reading: 1, deinflected: 2 };

/**
 * Whether a scan may present this entry as the hovered word.
 *
 * `prefix`, `gloss` and `fuzzy` are near misses: 猫 must not be answered with
 * 猫舌 because one starts with the other. An entry with no `via` comes from a
 * source that does not record it (CC-CEDICT, a legacy exact probe) and counts
 * as exact — the scan only ever asks those sources exact questions.
 */
export function isScanAcceptedEntry(entry: DictEntry): boolean {
  return entry.via === undefined || entry.via === 'exact' || entry.via === 'reading' || entry.via === 'deinflected';
}

/** Characters that start a CJK scan (every prefix is a candidate word). */
const CJK_START = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}ー々〆〇ヶ]/u;
/** Where a CJK word cannot continue: whitespace, punctuation, symbols. */
const CJK_BREAK = /[\s\p{P}\p{S}]/u;
/** A leading Latin/Cyrillic/other-alphabet word. */
const ALPHA_WORD = /^[\p{L}\p{M}\p{N}](?:[\p{L}\p{M}\p{N}]|['’-](?=[\p{L}\p{M}\p{N}]))*/u;

/**
 * The candidate queries for a hover window, longest first.
 *
 * CJK text has no spaces, so every prefix (by code point) up to `maxLen` is a
 * candidate, cut at the first whitespace or punctuation — no headword spans
 * those. Alphabetic text (Latin, Cyrillic) is spaced: the candidate is just the
 * leading word, and the dictionary's own de-inflection takes it from there.
 */
export function buildScanPrefixes(windowText: string, maxLen = SCAN_DEFAULT_MAX_LEN): string[] {
  const text = (typeof windowText === 'string' ? windowText : '').normalize('NFC').trim();
  if (!text) return [];
  const cap = Math.max(1, Math.min(SCAN_MAX_LEN_CEILING, Math.floor(Number.isFinite(maxLen) ? maxLen : SCAN_DEFAULT_MAX_LEN)));
  const chars = [...text];
  if (CJK_START.test(chars[0])) {
    const run: string[] = [];
    for (const c of chars) {
      if (run.length >= cap || CJK_BREAK.test(c)) break;
      run.push(c);
    }
    const out: string[] = [];
    for (let len = run.length; len >= 1; len -= 1) out.push(run.slice(0, len).join(''));
    return out;
  }
  const word = ALPHA_WORD.exec(text)?.[0] ?? '';
  return word ? [[...word].slice(0, cap).join('')] : [];
}

export interface ScanHit {
  /** Index into the `prefixes` array that won. */
  index: number;
  /** The text the hit covers on the page. */
  matched: string;
  /** Only the accepted entries, in their original order. */
  entries: DictEntry[];
  deinflection?: DeinflectionInfo;
  /** The best provenance among `entries`; absent when none recorded one. */
  via?: ScanAcceptedVia;
}

/**
 * The longest prefix with at least one accepted entry, or `null`.
 *
 * `results[i]` is the lookup of `prefixes[i]`. Length is measured in code
 * points and wins outright — a long de-inflected hit (食べさせられた → 食べる)
 * beats a short exact one (食) — and a tie keeps the earlier index.
 *
 * `matched` is the prefix itself: it is the page text, which is what the caller
 * highlights. A de-inflection's `source` is used only when it differs from the
 * prefix after normalisation (it never does for the database path, whose source
 * IS the query).
 */
export function pickLongestScanHit(prefixes: readonly string[], results: readonly (DictResult | undefined)[]): ScanHit | null {
  let best: ScanHit | null = null;
  let bestLen = 0;
  for (let i = 0; i < prefixes.length; i += 1) {
    const prefix = prefixes[i];
    const result = results[i];
    if (!prefix || !result?.entries?.length) continue;
    const len = [...prefix].length;
    if (len <= bestLen) continue;
    const entries = result.entries.filter(isScanAcceptedEntry);
    if (!entries.length) continue;
    let via: ScanAcceptedVia | undefined;
    for (const entry of entries) {
      const v = entry.via;
      if (v === 'exact' || v === 'reading' || v === 'deinflected') {
        if (via === undefined || VIA_RANK[v] < VIA_RANK[via]) via = v;
      }
    }
    const deinflected = entries.some((entry) => entry.via === 'deinflected' || entry.via === undefined);
    const deinflection = deinflected ? result.deinflection : undefined;
    const source = deinflection?.source;
    const matched = source && source.normalize('NFKC') !== prefix.normalize('NFKC') ? source : prefix;
    best = {
      index: i,
      matched,
      entries,
      ...(deinflection ? { deinflection } : {}),
      ...(via ? { via } : {}),
    };
    bestLen = len;
  }
  return best;
}
