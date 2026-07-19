// Shared shapes for the offline grammar reference + learning guides.

import type { GrammarFunctionId } from './functions';

export type GrammarLang = 'ja' | 'zh';

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

/** HSK 1–9 official bands + HSK10 advanced/beyond-9 catch-all. */
export type HskLevel =
  | 'HSK1'
  | 'HSK2'
  | 'HSK3'
  | 'HSK4'
  | 'HSK5'
  | 'HSK6'
  | 'HSK7'
  | 'HSK8'
  | 'HSK9'
  | 'HSK10';

export type GrammarLevel = JlptLevel | HskLevel;

export type GrammarRegister = 'neutral' | 'casual' | 'business' | 'literary';

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
  'HSK7',
  'HSK8',
  'HSK9',
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
  provenance?: GrammarProvenance;
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
