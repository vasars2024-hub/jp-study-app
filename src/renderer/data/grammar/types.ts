// Shared shapes for the offline grammar reference + learning guides.

export type JlptLevel = 'N5' | 'N4' | 'N3' | 'N2' | 'N1';

export const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

export interface GrammarExample {
  /** Japanese sentence. */
  jp: string;
  /** Full hiragana reading (optional). */
  reading?: string;
  /** English translation. */
  en: string;
}

export interface GrammarPoint {
  id: string;
  level: JlptLevel;
  /** The pattern itself, e.g. 〜てください. */
  title: string;
  /** Short English gloss. */
  meaning: string;
  /** How the pattern is formed. */
  structure: string;
  /** When and how to use it. */
  explanation: string;
  examples: GrammarExample[];
}

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
