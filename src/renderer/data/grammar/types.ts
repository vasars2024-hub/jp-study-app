// Shared shapes for the offline grammar reference + learning guides.

import type { GrammarFunctionId } from './functions';

export type GrammarLang = 'ja' | 'zh';

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

/**
 * HSK 3.0 bands as the standard actually publishes them, plus one slot we own.
 *
 * 7-9 is a single combined advanced band upstream, not three levels. This
 * corpus used to split it into HSK7 / HSK8 / HSK9, which invented two bands the
 * standard does not define and spread 16 records so thin that each looked
 * empty. Records that predate the merge keep their original band in
 * `provenance.sourceLevel`, so the split stays recoverable if HSK ever
 * publishes one.
 */
export type HskLevel =
  | 'HSK1'
  | 'HSK2'
  | 'HSK3'
  | 'HSK4'
  | 'HSK5'
  | 'HSK6'
  | 'HSK7-9'
  | 'HSK10';

/** Bands this corpus used to publish, mapped onto the band that replaced them. */
export const LEGACY_HSK_LEVELS: Record<string, HskLevel> = {
  HSK7: 'HSK7-9',
  HSK8: 'HSK7-9',
  HSK9: 'HSK7-9',
};

export type GrammarLevel = JlptLevel | HskLevel;

export type GrammarRegister = 'neutral' | 'casual' | 'business' | 'literary';

/**
 * Single source of truth for the register axis.
 *
 * The filter panel used to hand-maintain its own copy of this list, which could
 * drift from the union above without producing a compile error.
 */
export const GRAMMAR_REGISTERS: GrammarRegister[] = [
  'neutral',
  'casual',
  'business',
  'literary',
];

/**
 * Where a record's function/register tags came from.
 *
 * This exists because most of the corpus was tagged by regexes over the English
 * gloss (see functions.ts) and the result was frozen into the data files, which
 * made a guess indistinguishable from an authored fact. The Business filter
 * returning informal patterns was that bug surfacing. Filters can now decline
 * to trust a guess instead of trying to guess better.
 */
export type GrammarTagSource =
  /** Hand-written and reviewed for this app. */
  | 'authored'
  /** Came from an external dataset with its own categories. */
  | 'imported'
  /** Produced by gloss-regex inference. Not evidence of anything. */
  | 'heuristic'
  /** Derived from the pattern's own morphology by an explicit rule. */
  | 'derived'
  /**
   * Assigned by a language model reading the pattern, structure and examples.
   *
   * Deliberately its own tier rather than folded into 'authored' or 'derived'.
   * It is better evidence than the gloss-regex this module exists to atone for —
   * it reads the pattern itself, and every label was validated against a fixed
   * value set before it landed — but it is still a guess, so `trusted()` leaves
   * it out and the "verified tags only" filter hides it by default. Turning
   * that toggle off is what surfaces it.
   */
  | 'classified'
  | 'unknown';

/** How much of a record has been checked by a human. */
export type GrammarVerification =
  | 'verified'
  | 'imported-unreviewed'
  | 'partial'
  /** Classification is contested between sources. */
  | 'disputed'
  /** Essential content (examples, explanation) is absent. */
  | 'missing';

/**
 * Which published standard a level belongs to.
 *
 * `grammarx` marks a level slot this app invented. HSK 3.0 publishes bands 1-6
 * plus a combined 7-9; HSK10 in this corpus is our own "beyond 9" slot and must
 * never be presented to users as an official classification.
 *
 * `HSK7-9` is now modelled as the single band the standard publishes, so this
 * function no longer has to launder two invented levels as `hsk3.0`.
 */
export type GrammarFramework = 'jlpt' | 'hsk3.0' | 'grammarx';

export interface GrammarProvenance {
  /** Human-readable origin, e.g. 'mazii-n3-dump' or 'authored:core-n5'. */
  source?: string;
  /** License / permitted-use note for imported content. */
  license?: string;
  /**
   * Weakest-link summary of the two below, for display and audit totals.
   * Never gate a filter on this — a record can have a trustworthy register and
   * guessed categories, and a register query should still return it.
   */
  tagSource: GrammarTagSource;
  /** Provenance of `register` specifically. */
  registerSource: GrammarTagSource;
  /** Provenance of `categories` specifically. */
  categorySource: GrammarTagSource;
  verification: GrammarVerification;
  /** Level string as the source published it, before normalization. */
  sourceLevel?: string;
  framework: GrammarFramework;
  /** Confidence that sourceLevel -> level is the right mapping (0..1). */
  mappingConfidence?: number;
}

export const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];
/** @deprecated Prefer JLPT_LEVELS — kept for existing imports. */
export const LEVELS = JLPT_LEVELS;

export const HSK_LEVELS: HskLevel[] = [
  'HSK1',
  'HSK2',
  'HSK3',
  'HSK4',
  'HSK5',
  'HSK6',
  'HSK7-9',
  'HSK10',
];

export const ALL_GRAMMAR_LEVELS: GrammarLevel[] = [...JLPT_LEVELS, ...HSK_LEVELS];

export function isJlptLevel(level: string): level is JlptLevel {
  return (JLPT_LEVELS as string[]).includes(level);
}

export function isHskLevel(level: string): level is HskLevel {
  return (HSK_LEVELS as string[]).includes(level);
}

export interface GrammarExample {
  /** Japanese or Chinese sentence. */
  jp: string;
  /** Full reading (hiragana / pinyin) when available. */
  reading?: string;
  /** English translation. */
  en: string;
  /**
   * Corpus the sentence was imported from. Absent for hand-authored examples.
   * Imported sentences carry a licence obligation, so the origin has to travel
   * with the sentence rather than living only in an import script.
   */
  source?: 'tatoeba';
  /** Upstream id within `source`, keeping the sentence traceable to its author. */
  sourceId?: string;
}

export interface GrammarPoint {
  id: string;
  /** Study language corpus. Defaults to `ja` when omitted (legacy modules). */
  lang?: GrammarLang;
  level: GrammarLevel;
  /** The pattern itself, e.g. 〜てください / 是…的. */
  title: string;
  /** Short English gloss. */
  meaning: string;
  /** How the pattern is formed. */
  structure: string;
  /** When and how to use it. */
  explanation: string;
  examples: GrammarExample[];
  /** Legacy Mazii function tags. Kept as searchable aliases; see taxonomy.ts. */
  functions?: GrammarFunctionId[];
  /** Register / politeness band. Defaults to neutral. */
  register?: GrammarRegister;
  /** Canonical taxonomy ids. Resolved from `functions` when absent. */
  categories?: string[];
  /**
   * Levels other sources assign to this same pattern, set during dedupe when
   * they disagree. Kept rather than resolved — 53 of the 189 authored/Mazii
   * duplicate pairs conflict, and picking a winner silently would dress one
   * source's claim up as settled.
   */
  alternateLevels?: GrammarLevel[];
  /**
   * Per-record provenance overrides. Partial by design: a source record states
   * only the fields it actually knows — `sourceLevel` on a relevelled HSK7-9
   * point, `registerSource: 'classified'` on an LLM-labelled one — and
   * normalization fills the rest in from its module's defaults. The normalized
   * record carries the complete shape.
   */
  provenance?: Partial<GrammarProvenance>;
}

/** True for level slots this app invented rather than took from a standard. */
export function isUnofficialLevel(level: GrammarLevel): boolean {
  return level === 'HSK10';
}

export function frameworkForLevel(level: GrammarLevel): GrammarFramework {
  if (isJlptLevel(level)) return 'jlpt';
  if (level === 'HSK10') return 'grammarx';
  return 'hsk3.0';
}

export type { GrammarFunctionId };

// ---- Guides & hacks (prose tutorials) ----

export interface GuideExample {
  jp: string;
  reading?: string;
  en: string;
}

export interface GuideSection {
  heading: string;
  /** Body paragraphs (each string is one paragraph). */
  body: string[];
  /** Optional bullet tips. */
  tips?: string[];
  /** Optional Japanese examples. */
  examples?: GuideExample[];
}

export interface Guide {
  id: string;
  category: GuideCategory;
  icon: string;
  title: string;
  summary: string;
  /** Rough difficulty / who it's for. */
  level?: string;
  sections: GuideSection[];
}

export type GuideCategory =
  | 'Hacks'
  | 'Reading'
  | 'Writing'
  | 'Literature'
  | 'Speaking'
  | 'Culture';

export const GUIDE_CATEGORIES: GuideCategory[] = [
  'Hacks',
  'Reading',
  'Writing',
  'Speaking',
  'Literature',
  'Culture',
];
