/**
 * What an AI analysis contains, and where it goes afterwards.
 *
 * The analysis is not one fixed report: a beginner mining vocabulary and a
 * translator checking register want different things out of the same sentence.
 * These preferences are therefore load-bearing rather than cosmetic — they
 * decide which fields the prompt asks for, which the provider schema allows,
 * how deep the prose goes, which deck a mined card lands in, and whether a
 * notebook snapshot is written automatically.
 *
 * Two consequences follow, and both are handled here:
 *
 *   - Turning a section off must remove it from the *request*, not just hide it
 *     on screen. A hidden section is paid for on every call.
 *   - Two different preference sets produce two different artifacts for the
 *     same sentence, so `analysisPrefsFingerprint` folds into the cache key.
 *
 * Pure module — the main process persists it, the renderer edits it, the
 * extension's HTTP route reads the same stored copy, so all three surfaces
 * agree without duplicating the shape.
 */

/** How much prose each explanation carries. */
export type AnalysisDepth = 'brief' | 'standard' | 'deep';

export const ANALYSIS_DEPTHS: readonly AnalysisDepth[] = ['brief', 'standard', 'deep'];

/**
 * A togglable part of the report. `annotations` is what makes the sentence
 * clickable and is the feature itself, so it is not in this list — everything
 * here can be switched off without leaving an empty panel.
 */
export type AnalysisSectionId =
  | 'translations'
  | 'literal'
  | 'formality'
  | 'structure'
  | 'examples'
  | 'vocabulary'
  | 'nuance'
  | 'pitfalls';

export const ANALYSIS_SECTIONS: readonly AnalysisSectionId[] = [
  'translations',
  'literal',
  'formality',
  'structure',
  'examples',
  'vocabulary',
  'nuance',
  'pitfalls',
];

/** Language the prose comes back in; `ui` follows the app's UI language. */
export type ExplainLang = 'ui' | 'en' | 'ja' | 'zh' | 'ru';
export const EXPLAIN_LANGS: readonly ExplainLang[] = ['ui', 'en', 'ja', 'zh', 'ru'];

/** Languages the sentence itself can be rendered in. */
export type TranslationLang = 'en' | 'ja' | 'zh';
export const TRANSLATION_LANGS: readonly TranslationLang[] = ['en', 'ja', 'zh'];

export type AnalysisCardKind = 'word' | 'sentence';

export interface AnalysisAnkiPrefs {
  /** Empty string means "whatever deck the mining profile already picks". */
  deck: string;
  /** Whether a card made from a span is a word card or a whole-sentence card. */
  cardKind: AnalysisCardKind;
  /** Carry the AI explanation into the card instead of just the one-line meaning. */
  includeExplanation: boolean;
  /** Carry the sentence translation into the card's sentence-translation field. */
  includeTranslation: boolean;
  /** Mine every analyzed sentence the moment it lands, without a click. */
  auto: boolean;
  extraTags: string[];
}

export interface AnalysisSnapshotPrefs {
  /** Write a notebook snapshot for every analysis, unprompted. */
  auto: boolean;
  /** Which parts of the report the snapshot carries. */
  sections: AnalysisSectionId[];
  /** Notebook folder the snapshots are filed under. */
  folder: string;
}

export interface SentenceAnalysisPrefs {
  depth: AnalysisDepth;
  /** Sections to request and render, in the order listed in ANALYSIS_SECTIONS. */
  sections: AnalysisSectionId[];
  explainIn: ExplainLang;
  /** Which renderings of the sentence to ask for. Empty disables translations. */
  translations: TranslationLang[];
  /** Free-form learner level ("N4", "HSK 3", "beginner"). Empty means unset. */
  learnerLevel: string;
  /** Appended verbatim to the prompt — the escape hatch for anything above. */
  customInstructions: string;
  anki: AnalysisAnkiPrefs;
  snapshot: AnalysisSnapshotPrefs;
}

export const MAX_CUSTOM_INSTRUCTIONS = 600;

export const DEFAULT_ANALYSIS_PREFS: SentenceAnalysisPrefs = {
  depth: 'standard',
  sections: ['translations', 'literal', 'formality', 'structure', 'examples', 'vocabulary', 'nuance', 'pitfalls'],
  explainIn: 'ui',
  translations: ['en', 'ja', 'zh'],
  learnerLevel: '',
  customInstructions: '',
  anki: {
    deck: '',
    cardKind: 'word',
    includeExplanation: true,
    includeTranslation: true,
    auto: false,
    extraTags: ['ai-analysis'],
  },
  snapshot: {
    auto: false,
    sections: ['translations', 'formality', 'structure', 'nuance', 'pitfalls'],
    folder: 'AI analysis',
  },
};

// ---- normalization ---------------------------------------------------------

function asTrimmed(v: unknown, max: number): string {
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function asSections(v: unknown, fallback: readonly AnalysisSectionId[]): AnalysisSectionId[] {
  if (!Array.isArray(v)) return [...fallback];
  const wanted = new Set(v.filter((x): x is string => typeof x === 'string'));
  // Filtering ANALYSIS_SECTIONS rather than the input both de-duplicates and
  // pins the render order, so a stored array from an older build cannot make
  // sections appear in an order the UI was never designed for.
  return ANALYSIS_SECTIONS.filter((id) => wanted.has(id));
}

export function normalizeAnalysisPrefs(raw: unknown): SentenceAnalysisPrefs {
  const src = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const anki = (src.anki && typeof src.anki === 'object' ? src.anki : {}) as Record<string, unknown>;
  const snapshot = (
    src.snapshot && typeof src.snapshot === 'object' ? src.snapshot : {}
  ) as Record<string, unknown>;

  const translations = Array.isArray(src.translations)
    ? TRANSLATION_LANGS.filter((code) => (src.translations as unknown[]).includes(code))
    : [...DEFAULT_ANALYSIS_PREFS.translations];

  const tags = Array.isArray(anki.extraTags)
    ? anki.extraTags
      .filter((tag): tag is string => typeof tag === 'string')
      .map((tag) => tag.trim().replace(/\s+/g, '-'))
      .filter(Boolean)
      .slice(0, 8)
    : [...DEFAULT_ANALYSIS_PREFS.anki.extraTags];

  return {
    depth: ANALYSIS_DEPTHS.includes(src.depth as AnalysisDepth)
      ? (src.depth as AnalysisDepth)
      : DEFAULT_ANALYSIS_PREFS.depth,
    sections: asSections(src.sections, DEFAULT_ANALYSIS_PREFS.sections),
    explainIn: EXPLAIN_LANGS.includes(src.explainIn as ExplainLang)
      ? (src.explainIn as ExplainLang)
      : DEFAULT_ANALYSIS_PREFS.explainIn,
    translations,
    learnerLevel: asTrimmed(src.learnerLevel, 32),
    customInstructions: asTrimmed(src.customInstructions, MAX_CUSTOM_INSTRUCTIONS),
    anki: {
      deck: asTrimmed(anki.deck, 120),
      cardKind: anki.cardKind === 'sentence' ? 'sentence' : 'word',
      includeExplanation: anki.includeExplanation !== false,
      includeTranslation: anki.includeTranslation !== false,
      auto: anki.auto === true,
      extraTags: tags,
    },
    snapshot: {
      auto: snapshot.auto === true,
      sections: asSections(snapshot.sections, DEFAULT_ANALYSIS_PREFS.snapshot.sections),
      folder: asTrimmed(snapshot.folder, 60) || DEFAULT_ANALYSIS_PREFS.snapshot.folder,
    },
  };
}

/** Is this part of the report switched on? */
export function hasSection(prefs: SentenceAnalysisPrefs, id: AnalysisSectionId): boolean {
  return prefs.sections.includes(id);
}

/** The concrete language code for prose, resolving the `ui` passthrough. */
export function resolveExplainLang(prefs: SentenceAnalysisPrefs, uiLang: string): string {
  return prefs.explainIn === 'ui' ? uiLang || 'en' : prefs.explainIn;
}

/**
 * A short, stable digest of everything that changes what the model returns.
 *
 * Folded into the analysis cache key: with the same sentence but "brief, no
 * examples, explain in Japanese", the cached "deep, English" report is the
 * wrong answer, and serving it would make the settings look broken. Anki and
 * snapshot preferences are deliberately excluded — they govern what happens
 * *after* the call and must not invalidate a perfectly good cached analysis.
 */
export function analysisPrefsFingerprint(prefs: SentenceAnalysisPrefs, explainLang: string): string {
  return [
    prefs.depth,
    prefs.sections.join(','),
    explainLang,
    prefs.translations.join(','),
    prefs.learnerLevel,
    prefs.customInstructions,
  ].join('|');
}

/** How the depth setting is phrased to the model. */
export const DEPTH_GUIDANCE: Record<AnalysisDepth, string> = {
  brief:
    'Keep every explanation to one tight sentence. The reader wants a fast check, not a lesson — ' +
    'omit background they did not ask for.',
  standard:
    'Give each explanation two to three sentences: what the form does, and why it was chosen here.',
  deep:
    'Give each explanation three to five sentences with real depth — what the form implies, what ' +
    'it contrasts with, how it differs from the near-synonym a learner would confuse it with, and ' +
    'when they should reach for it themselves.',
};
