// Shared JLPT / HSK level estimation for Statistics (user) and EPUB cover (text).
// Pure math only — no Electron / DOM. Wraps levelScale's user derivation and
// adds a text/book estimator that cover UI can call with the same badge labels.
//
// User formula (Statistics):
//   coverage(slot) = Familiar-or-better words in that band list / list size.
//   A slot is reached when coverage ≥ threshold (default 0.8).
//   Level = highest reached slot tier (JA: Beginner→N5…N1→Advanced; ZH: HSK1…6→Advanced).
//   Advanced also needs the top graded slot cleared plus an advanced list or ≥8000 known words
//   (see deriveUserLevel). Study language picks JLPT vs HSK slots.
//
// Text / book formula (EPUB cover):
//   Assign each unique lemma to the easiest band list containing it (N5→N1 / HSK1→6).
//   Lemmas in no list count as above the top graded band.
//   Walk bands easy→hard; estimated tier is the easiest band whose cumulative share of
//   lemmas (that band or easier) ≥ threshold (default 0.8). If even the top graded band
//   stays under the threshold (too much unlisted vocab) → Advanced (7).

import {
  DEFAULT_LEVEL_THRESHOLD,
  deriveUserLevel,
  slotsForLang,
  tierName,
  tierNameKey,
  type DeriveLevelInput,
  type LevelSlotId,
  type LevelTier,
  type StudyLang,
} from './levelScale';

export type LevelScheme = 'jlpt' | 'hsk' | 'cefr';

/** Compact result both Statistics and EPUB cover render as a badge. */
export interface LevelEstimate {
  lang: StudyLang;
  scheme: LevelScheme;
  tier: LevelTier;
  /** Short badge, e.g. "N3" or "HSK 4". */
  short: string;
  /** Prose label, e.g. "JLPT N3" or "HSK 4". */
  label: string;
}

export function schemeForLang(lang: StudyLang): LevelScheme {
  if (lang === 'zh') return 'hsk';
  if (lang === 'ru') return 'cefr';
  return 'jlpt';
}

/**
 * Short badge for a tier. Prefer slot.short when the tier maps to a graded
 * exam slot. Tier 7 always reads "Advanced" (N0 is an optional proof list,
 * not the public badge name).
 */
export function badgeForTier(lang: StudyLang, tier: LevelTier): string {
  if (tier === 7) return tierName(lang, 7);
  const slot = slotsForLang(lang).find((s) => s.tier === tier);
  if (slot) return slot.short;
  return tierName(lang, tier);
}

/** Full prose label for a tier. */
export function levelLabel(lang: StudyLang, tier: LevelTier): string {
  if (tier === 7) return lang === 'ja' ? 'JLPT Advanced' : 'Advanced';
  const slot = slotsForLang(lang).find((s) => s.tier === tier);
  if (slot) return slot.label;
  if (lang === 'ja' && tier === 1) return 'JLPT Beginner';
  return tierName(lang, tier);
}

/**
 * i18n key for `badgeForTier`'s output, or `null` when that output is a proper
 * noun (`N3`, `HSK 4`). Only tier 7's "Advanced" is an English word.
 */
export function badgeKeyForTier(lang: StudyLang, tier: LevelTier): string | null {
  if (tier === 7) return tierNameKey(lang, 7);
  const slot = slotsForLang(lang).find((s) => s.tier === tier);
  if (slot) return null;
  return tierNameKey(lang, tier);
}

/**
 * i18n key for `levelLabel`'s output, or `null` when it is a proper noun
 * (`JLPT N3`, `HSK 4`). The scheme name stays Latin inside the translation —
 * "JLPT" is the exam's own name in every language.
 */
export function levelLabelKey(lang: StudyLang, tier: LevelTier): string | null {
  if (tier === 7) return lang === 'ja' ? 'level.label.jlptAdvanced' : 'level.tier.advanced';
  const slot = slotsForLang(lang).find((s) => s.tier === tier);
  if (slot) return null;
  if (lang === 'ja' && tier === 1) return 'level.label.jlptBeginner';
  return tierNameKey(lang, tier);
}

function toEstimate(lang: StudyLang, tier: LevelTier): LevelEstimate {
  return {
    lang,
    scheme: schemeForLang(lang),
    tier,
    short: badgeForTier(lang, tier),
    label: levelLabel(lang, tier),
  };
}

/**
 * User estimated level from per-slot known-word coverage of configured bands.
 * Cover UIs that only need the user's badge can call this with the same input
 * LevelService builds (or use getLevelEstimate() in the renderer).
 */
export function estimateUserLevel(lang: StudyLang, input: DeriveLevelInput): LevelEstimate {
  return toEstimate(lang, deriveUserLevel(lang, input).level);
}

export interface EstimateTextLevelInput {
  /** Unique content lemmas from the text (already tokenized / de-duplicated). */
  lemmas: readonly string[];
  /**
   * Words belonging to each configured band slot. Missing slots are skipped.
   * Match lemmas with the same normalization the slot lists use (lemma form).
   */
  wordsBySlot: Partial<Record<LevelSlotId, ReadonlySet<string> | readonly string[]>>;
  /** Cumulative coverage threshold, 0..1. Defaults to DEFAULT_LEVEL_THRESHOLD. */
  threshold?: number;
}

function asSet(words: ReadonlySet<string> | readonly string[] | undefined): Set<string> | null {
  if (!words) return null;
  if (words instanceof Set) return words;
  return new Set(words);
}

/**
 * Estimate a text/book's JLPT or HSK level from how its lemmas sit in the
 * configured band lists. Safe to call from EPUB cover / library once lemmas
 * and slot word sets are available.
 */
export function estimateTextLevel(lang: StudyLang, input: EstimateTextLevelInput): LevelEstimate {
  const threshold = input.threshold ?? DEFAULT_LEVEL_THRESHOLD;
  const seen = new Set<string>();
  const lemmas: string[] = [];
  for (const w of input.lemmas) {
    if (!w || seen.has(w)) continue;
    seen.add(w);
    lemmas.push(w);
  }
  if (lemmas.length === 0) return toEstimate(lang, 1);

  const graded = slotsForLang(lang).filter((s) => s.tier < 7);
  const slotSets = graded.map((s) => ({
    slot: s,
    words: asSet(input.wordsBySlot[s.id]),
  }));

  // Assign each lemma to the easiest band that contains it, or "above top".
  const ABOVE = 8;
  const counts = new Map<number, number>();
  for (const lemma of lemmas) {
    let assigned = ABOVE;
    for (const { slot, words } of slotSets) {
      if (words?.has(lemma)) {
        assigned = slot.tier;
        break;
      }
    }
    counts.set(assigned, (counts.get(assigned) ?? 0) + 1);
  }

  const total = lemmas.length;
  let cumulative = 0;
  for (const slot of graded) {
    cumulative += counts.get(slot.tier) ?? 0;
    if (cumulative / total >= threshold) return toEstimate(lang, slot.tier);
  }

  // Too much vocab sits above the top graded band → Advanced.
  return toEstimate(lang, 7);
}
