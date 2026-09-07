// The user's language level as a single 1..7 scale, shared by main and
// renderer (no Electron / DOM imports allowed here — this is the pure math the
// LevelService and its tests both consume).
//
// Scale (Plan 0.5, "Road to v1.01"):
//   JP: 1 Beginner (pre-N5), 2 N5, 3 N4, 4 N3, 5 N2, 6 N1, 7 Advanced (post-N1).
//   ZH: 1 HSK1 … 6 HSK6, 7 Advanced.
// A level "counts as reached" when coverage of its list ≥ threshold (default
// 0.8). Level 7 is inferred from an advanced custom list and/or the total
// known-word count, since there is no single canonical post-N1 / post-HSK6 list.

export type StudyLang = 'ja' | 'zh';
export type LevelTier = 1 | 2 | 3 | 4 | 5 | 6 | 7;

/** Stable identifier for one upload/paste slot on the Level page. */
export type LevelSlotId =
  | 'jlpt-n5'
  | 'jlpt-n4'
  | 'jlpt-n3'
  | 'jlpt-n2'
  | 'jlpt-n1'
  | 'jlpt-n0'
  | 'hsk-1'
  | 'hsk-2'
  | 'hsk-3'
  | 'hsk-4'
  | 'hsk-5'
  | 'hsk-6';

export interface LevelSlot {
  id: LevelSlotId;
  /** The tier this slot proves when its coverage crosses the threshold. */
  tier: LevelTier;
  /** Short badge label, e.g. "N5" or "HSK 3". */
  short: string;
  /** Full label for prose, e.g. "JLPT N5". */
  label: string;
}

export interface TierInfo {
  tier: LevelTier;
  /** One-word name of the tier, e.g. "Beginner", "N5", "Advanced". */
  name: string;
}

/** Default coverage of a list required to call its level "reached". */
export const DEFAULT_LEVEL_THRESHOLD = 0.8;

/**
 * Known-word count that, combined with the top list being cleared, lifts a user
 * to tier 7 (Advanced) when no dedicated advanced list is provided. Post-N1 /
 * post-HSK6 active vocabulary is conventionally ~8–10k words.
 */
export const ADVANCED_KNOWN_WORDS = 8000;

export const JA_SLOTS: readonly LevelSlot[] = [
  { id: 'jlpt-n5', tier: 2, short: 'N5', label: 'JLPT N5' },
  { id: 'jlpt-n4', tier: 3, short: 'N4', label: 'JLPT N4' },
  { id: 'jlpt-n3', tier: 4, short: 'N3', label: 'JLPT N3' },
  { id: 'jlpt-n2', tier: 5, short: 'N2', label: 'JLPT N2' },
  { id: 'jlpt-n1', tier: 6, short: 'N1', label: 'JLPT N1' },
  // Tier 7 has no canonical list (there is no official post-N1 exam), so "N0"
  // is the user's own advanced deck. Supplying one proves tier 7 directly
  // instead of leaning on the ADVANCED_KNOWN_WORDS count heuristic below.
  { id: 'jlpt-n0', tier: 7, short: 'N0', label: 'JLPT N0 (post-N1)' },
];

export const ZH_SLOTS: readonly LevelSlot[] = [
  { id: 'hsk-1', tier: 1, short: 'HSK 1', label: 'HSK 1' },
  { id: 'hsk-2', tier: 2, short: 'HSK 2', label: 'HSK 2' },
  { id: 'hsk-3', tier: 3, short: 'HSK 3', label: 'HSK 3' },
  { id: 'hsk-4', tier: 4, short: 'HSK 4', label: 'HSK 4' },
  { id: 'hsk-5', tier: 5, short: 'HSK 5', label: 'HSK 5' },
  { id: 'hsk-6', tier: 6, short: 'HSK 6', label: 'HSK 6' },
];

export const JA_TIERS: readonly TierInfo[] = [
  { tier: 1, name: 'Beginner' },
  { tier: 2, name: 'N5' },
  { tier: 3, name: 'N4' },
  { tier: 4, name: 'N3' },
  { tier: 5, name: 'N2' },
  { tier: 6, name: 'N1' },
  { tier: 7, name: 'Advanced' },
];

export const ZH_TIERS: readonly TierInfo[] = [
  { tier: 1, name: 'HSK 1' },
  { tier: 2, name: 'HSK 2' },
  { tier: 3, name: 'HSK 3' },
  { tier: 4, name: 'HSK 4' },
  { tier: 5, name: 'HSK 5' },
  { tier: 6, name: 'HSK 6' },
  { tier: 7, name: 'Advanced' },
];

export function slotsForLang(lang: StudyLang): readonly LevelSlot[] {
  return lang === 'zh' ? ZH_SLOTS : JA_SLOTS;
}

export function tiersForLang(lang: StudyLang): readonly TierInfo[] {
  return lang === 'zh' ? ZH_TIERS : JA_TIERS;
}

export function tierName(lang: StudyLang, tier: LevelTier): string {
  return tiersForLang(lang).find((t) => t.tier === tier)?.name ?? String(tier);
}

/**
 * i18n key for a tier name, or `null` when the name is a proper noun that must
 * NOT be translated (`N5`, `HSK 3` — CLAUDE.md i18n rule 4). Only two tier names
 * are ordinary English words: tier 1 on the JLPT scale ("Beginner") and tier 7
 * on both ("Advanced"). This module is pure shared math with no `t()` of its
 * own, so it hands back the key and the consumer resolves it (i18n rule 7).
 */
export function tierNameKey(lang: StudyLang, tier: LevelTier): string | null {
  if (tier === 7) return 'level.tier.advanced';
  if (tier === 1 && lang === 'ja') return 'level.tier.beginner';
  return null;
}

/**
 * The tier name a user should SEE. Takes `t` as an argument rather than calling
 * a hook, so this module stays pure shared math that main can import too.
 */
export function tierLabel(
  t: (key: string) => string,
  lang: StudyLang,
  tier: LevelTier,
): string {
  const key = tierNameKey(lang, tier);
  return key ? t(key) : tierName(lang, tier);
}

export interface DeriveLevelInput {
  /** Coverage 0..1 for each slot that has a list; missing = no list. */
  coverageBySlot: Partial<Record<LevelSlotId, number>>;
  /** Coverage 0..1 of a user-provided "advanced" custom list, if any. */
  advancedCoverage?: number;
  /** Total known/familiar words for this language (for the tier-7 inference). */
  totalKnown?: number;
  /** Reached threshold, 0..1. Defaults to DEFAULT_LEVEL_THRESHOLD. */
  threshold?: number;
}

export interface DerivedLevel {
  level: LevelTier;
  /** Slots whose coverage met the threshold, in ascending tier order. */
  reached: LevelSlotId[];
  /** Whether the tier-7 (Advanced) condition was satisfied. */
  advanced: boolean;
}

/**
 * Derive the user's overall level from per-slot coverage. The level is the
 * highest tier whose slot cleared the threshold (slots need not be contiguous —
 * clearing N1 alone is enough to read as N1). Tier 7 requires the top slot to
 * be cleared AND either an advanced list cleared or the known-word count over
 * ADVANCED_KNOWN_WORDS.
 */
export function deriveUserLevel(lang: StudyLang, input: DeriveLevelInput): DerivedLevel {
  const threshold = input.threshold ?? DEFAULT_LEVEL_THRESHOLD;
  const slots = slotsForLang(lang);
  const reached: LevelSlotId[] = [];
  let level: LevelTier = 1;

  for (const slot of slots) {
    const cov = input.coverageBySlot[slot.id];
    if (cov != null && cov >= threshold) {
      reached.push(slot.id);
      if (slot.tier > level) level = slot.tier;
    }
  }

  // A tier-7 slot (JLPT N0) is an OPTIONAL direct proof of Advanced, so it must
  // not become the gate for it: taking the last slot blindly made N0 the gate,
  // and since almost nobody supplies an N0 deck, tier 7 became unreachable by
  // the known-word route that has always backed it. The gate stays the top
  // graded slot (N1 / HSK 6); clearing an N0 list proves Advanced on its own.
  const gradedSlots = slots.filter((s) => s.tier < 7);
  const topSlot = gradedSlots[gradedSlots.length - 1];
  const topCleared = !!topSlot && reached.includes(topSlot.id);
  const advancedSlotCleared = slots.some((s) => s.tier === 7 && reached.includes(s.id));
  const advanced =
    advancedSlotCleared ||
    (topCleared &&
      ((input.advancedCoverage != null && input.advancedCoverage >= threshold) ||
        (input.totalKnown ?? 0) >= ADVANCED_KNOWN_WORDS));
  if (advanced) level = 7;

  return { level, reached, advanced };
}
