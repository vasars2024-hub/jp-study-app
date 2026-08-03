// Book JLPT / HSK level estimate — pure scoring math (no tokenizer / DOM).
//
// Formula (cumulative coverage):
//   1. Take exam bands in easiest→hardest order (N5…N1 or HSK1…HSK6).
//   2. For band B, build the cumulative vocab set = words from B and every
//      easier band the user has configured in Settings.
//   3. coverage(B) = (# content-token occurrences whose lemma ∈ cumulative(B))
//                    / (# content-token occurrences).
//   4. Estimated level = lowest (easiest) band with coverage ≥ threshold
//      (default 0.85). Confidence = that coverage.
//   5. If no band clears the threshold, return the hardest configured band
//      (book is at least that hard / beyond the lists) with its coverage.
//
// Bands with no user list are skipped. Empty token input or no configured
// lists → null. Proper nouns / non-content tokens should already be filtered
// out by the caller before lemmas are passed in.

import {
  JA_SLOTS,
  ZH_SLOTS,
  type LevelSlotId,
  type StudyLang,
} from './levelScale';

/** Exam scheme inferred from study language. */
export type BookLevelScheme = 'jlpt' | 'hsk';

import { schemeForLang } from './levelEstimate';

export { schemeForLang };

export interface BookLevelBand {
  /** Slot id, e.g. 'jlpt-n3' / 'hsk-3'. */
  id: LevelSlotId;
  /** Short badge label, e.g. 'N3' / 'HSK 3'. */
  short: string;
  /** Lemmatized vocab words for this band only (not cumulative). */
  words: ReadonlySet<string>;
}

export interface BookLevelEstimate {
  scheme: BookLevelScheme;
  /** Numeric exam level: JLPT 5…1 (N5=5) or HSK 1…6. */
  level: number;
  /** Display label for the cover badge (`N3`, `HSK 3`). */
  label: string;
  /** Slot that produced the estimate. */
  slotId: LevelSlotId;
  /** Coverage 0..1 at the chosen cumulative band. */
  confidence: number;
  /** True when the chosen band met the threshold. */
  metThreshold: boolean;
}

export interface EstimateBookLevelOptions {
  /** Coverage required to call a band "enough". Default 0.85. */
  threshold?: number;
}

/** Default: ~85% of running text covered by cumulative vocab up to that band. */
export const DEFAULT_BOOK_LEVEL_THRESHOLD = 0.85;

/** Exam slots used for book tagging (excludes JLPT N0 / post-N1). */
export function examSlotsForLang(lang: StudyLang): readonly {
  id: LevelSlotId;
  short: string;
  /** Numeric level for the return type (JLPT: 5=N5 … 1=N1; HSK: 1…6). */
  level: number;
}[] {
  if (lang === 'zh') {
    return ZH_SLOTS.map((s, i) => ({ id: s.id, short: s.short.replace(/\s+/g, ''), level: i + 1 }));
  }
  // JA_SLOTS ends with jlpt-n0 — drop it for book badges.
  return JA_SLOTS.filter((s) => s.id !== 'jlpt-n0').map((s, i) => ({
    id: s.id,
    short: s.short,
    // N5 is easiest → level 5; N1 → level 1
    level: 5 - i,
  }));
}

// One definition, in levelEstimate. Both copies were `lang === 'zh' ? 'hsk' : 'jlpt'`
// over the same 'jlpt' | 'hsk' union. Re-exported so existing importers of this
// module are unaffected.

/**
 * Estimate the exam level of a text from its content lemmas and per-band vocab.
 * `lemmas` should be content-word occurrences only (proper nouns excluded).
 */
export function estimateBookLevel(
  lemmas: readonly string[],
  bands: readonly BookLevelBand[],
  lang: StudyLang,
  opts: EstimateBookLevelOptions = {},
): BookLevelEstimate | null {
  const threshold = opts.threshold ?? DEFAULT_BOOK_LEVEL_THRESHOLD;
  const scheme = schemeForLang(lang);
  const configured = bands.filter((b) => b.words.size > 0);
  if (lemmas.length === 0 || configured.length === 0) return null;

  // Keep easiest→hardest order from examSlotsForLang.
  const order = examSlotsForLang(lang);
  const byId = new Map(configured.map((b) => [b.id, b]));
  const ordered = order.map((o) => byId.get(o.id)).filter((b): b is BookLevelBand => Boolean(b));
  if (ordered.length === 0) return null;

  const cumulative = new Set<string>();
  let best: BookLevelEstimate | null = null;

  for (const band of ordered) {
    for (const w of band.words) cumulative.add(w);
    let hit = 0;
    for (const lemma of lemmas) {
      if (cumulative.has(lemma)) hit += 1;
    }
    const coverage = hit / lemmas.length;
    const meta = order.find((o) => o.id === band.id)!;
    const estimate: BookLevelEstimate = {
      scheme,
      level: meta.level,
      label: meta.short,
      slotId: band.id,
      confidence: coverage,
      metThreshold: coverage >= threshold,
    };
    best = estimate;
    if (estimate.metThreshold) return estimate;
  }

  // Never cleared threshold — report hardest configured band.
  return best;
}
