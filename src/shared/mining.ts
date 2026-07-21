import type { AiApiKeysSet, AiProviderId } from './aiProviders';

export type MiningAnalyzer = 'kuromoji' | 'simple';

export interface MiningLimitSettings {
  minFrequency: number;
  maxCommonRank: number;
  blacklist: string[];
  /** Drop common junk lemmas during analyze (copula, aux, particles, fillers). Default on. */
  useBuiltinJunkFilter?: boolean;
}

export interface FrequencyDictionarySummary {
  id: string;
  label: string;
  source: string;
  entryCount: number;
  enabled: boolean;
  importedAt: number;
  /** Set on bundled lists; used to show only relevant dicts for Japanese EPUB mining. */
  language?: 'ja' | 'zh' | 'ru';
}

export interface MiningFrequencyRanks {
  primary?: number;
  byDictionary: Record<string, number>;
}

/** Any ISO-ish language code — see shared/langs.ts for the known table. */
export type CandidateGlossLang = string;

export interface CandidateGlosses {
  [lang: string]: string | undefined;
}

/** Where a resolved template value came from. */
export type FieldSource = 'dict' | 'qwen' | 'api';

export type TranslationEngine = 'qwen' | 'api';

export interface MiningEnrichHealth {
  /** Cross-language fields already covered by offline dictionaries. */
  dictFields: number;
  /** LLM translations completed this run. */
  translated: number;
  /** LLM translations that failed validation. */
  failed: number;
  /** LLM translation jobs still queued. */
  pending: number;
}

export interface MiningEnrichProgress {
  phase: 'tokenize' | 'gloss' | 'translation' | 'export';
  done: number;
  total: number;
  message?: string;
  health?: MiningEnrichHealth;
}

export type NameTag =
  | 'ja-person'
  | 'ja-place'
  | 'ja-org'
  | 'ja-proper'
  | 'cn-name'
  | 'ru-name'
  | null;

export interface ExcludeNamesOptions {
  japanese: boolean;
  chinese: boolean;
  russian: boolean;
  places: boolean;
}

export interface MiningCandidate {
  expression: string;
  reading?: string;
  count: number;
  sampleSentence: string;
  frequencies: MiningFrequencyRanks;
  /** Offline dictionary glosses resolved at analyze time. */
  glosses?: CandidateGlosses;
  /** Cross-language template values keyed as base:lang (e.g. expression:ru). */
  translations?: Record<string, string>;
  /** Provenance per translations/glosses key — dictionary vs Qwen fail-switch. */
  fieldSources?: Record<string, FieldSource>;
  /** Proper-noun tag from kuromoji or name heuristics. */
  nameTag?: NameTag;
}

export interface EpubMiningAnalysis {
  itemId: string;
  title: string;
  totalCharacters: number;
  analyzer: MiningAnalyzer;
  candidates: MiningCandidate[];
  generatedAt: number;
  /** True when the run was cancelled and enrichment is partial. */
  cancelled?: boolean;
  /** User-visible problems (e.g. Qwen model missing) — never silent blanks. */
  warnings?: string[];
}

/** One row in a traditional (non-AI) EPUB deck export. */
export interface EpubDeckRow {
  expression: string;
  reading: string;
  sentence: string;
  front: string;
  back: string;
}

export interface EpubDeckExport {
  title: string;
  itemId: string;
  cardCount: number;
  csv: string;
  rows: EpubDeckRow[];
}

export interface MiningTemplateDraft {
  front: string;
  back: string;
  resetToAutomatic: boolean;
}

export type EpubExportFormat = 'anki' | 'csv' | 'txt' | 'txt-rep' | 'yomitan';

export type EpubDownloadStrategy = 'manual' | 'occurrences';

export type OccurrenceFilterOp = 'gte' | 'lte' | 'eq';

export type EpubFilterBy = 'deck-frequency' | 'term-frequency';

export type EpubSortBy = 'deck-frequency' | 'alphabetical';

/** One field rendered on an EPUB deck card front or back. */
export type EpubCardSideField =
  | 'expression'
  | 'reading'
  | 'expression-reading'
  | 'definition-en'
  | 'definition-ja'
  | 'sentence'
  | 'frequency'
  | 'blank';

export type EpubCardLayoutPreset =
  | 'ja-en'
  | 'en-ja'
  | 'expression-reading'
  | 'reading-expression'
  | 'ja-sentence'
  | 'custom';

export interface EpubExportOptions {
  format: EpubExportFormat;
  strategy: EpubDownloadStrategy;
  filterBy: EpubFilterBy;
  sortBy: EpubSortBy;
  freqRangeMin: number;
  freqRangeMax: number;
  occurrenceFilterOp: OccurrenceFilterOp;
  occurrenceThreshold: number;
  excludeKanaOnly: boolean;
  useProfileFieldMapping: boolean;
  /** Preset that sets frontContent/backContent; `custom` when edited manually. */
  cardLayoutPreset: EpubCardLayoutPreset;
  frontContent: EpubCardSideField;
  backContent: EpubCardSideField;
  /** Exclude proper nouns / foreign names when filtering deck candidates. */
  excludeNames: ExcludeNamesOptions;
  /** Target language for bare `{translation}` token. */
  translationTargetLang: CandidateGlossLang;
  /** Run fail-switch translation when downloading the deck (not during analyze). */
  fillTranslations: boolean;
  /** Offline Qwen3 or cloud API (Gemini / DeepSeek). */
  translationEngine?: TranslationEngine;
  /** API provider when translationEngine is api; falls back to global AI Card Studio provider. */
  translationApiProvider?: import('./aiProviders').AiProviderId;
  /** Translate full context sentences for `{sentence-translation:*}` (slow). */
  translateSentences: boolean;
  /** Separator inserted between adjacent {tokens} (default newline). */
  tokenSeparator?: string;
  /** CSV column delimiter. */
  csvDelimiter?: ',' | ';' | 'tab';
  /** Include the header row in CSV exports. */
  csvHeader?: boolean;
  /** Append a small [FS] marker to values filled by the Qwen fail-switch. */
  fsMarker?: boolean;
  /** Drop cards that still have unfilled template fields from the export. */
  excludeIncomplete?: boolean;
  /** Kana style for {reading:ja} (readings are stored as hiragana). */
  readingStyle?: 'hiragana' | 'katakana';
}

export interface TraditionalMiningConfig {
  analyzer: MiningAnalyzer;
  limits: MiningLimitSettings;
  templates: MiningTemplateDraft;
  export: EpubExportOptions;
}

export const DEFAULT_EXCLUDE_NAMES: ExcludeNamesOptions = {
  japanese: false,
  chinese: false,
  russian: false,
  places: false,
};

export const DEFAULT_EPUB_EXPORT_OPTIONS: EpubExportOptions = {
  format: 'csv',
  strategy: 'manual',
  filterBy: 'term-frequency',
  sortBy: 'deck-frequency',
  freqRangeMin: 0,
  freqRangeMax: 0,
  occurrenceFilterOp: 'gte',
  occurrenceThreshold: 2,
  excludeKanaOnly: false,
  useProfileFieldMapping: false,
  cardLayoutPreset: 'ja-en',
  frontContent: 'expression-reading',
  backContent: 'definition-en',
  excludeNames: DEFAULT_EXCLUDE_NAMES,
  translationTargetLang: 'ru',
  fillTranslations: true,
  translationEngine: 'qwen',
  translateSentences: false,
  tokenSeparator: '\n',
  csvDelimiter: ',',
  csvHeader: true,
  fsMarker: true,
  excludeIncomplete: false,
  readingStyle: 'hiragana',
};

export const DEFAULT_MINING_LIMITS: MiningLimitSettings = {
  minFrequency: 2,
  maxCommonRank: 0,
  blacklist: [],
  useBuiltinJunkFilter: true,
};

export interface AiPromptPreset {
  id: string;
  label: string;
  category: 'core' | 'specialized';
  description: string;
  instruction: string;
}

export type AiMiningOutputFormat = 'anki' | 'csv';

export type AiMiningLanguage = 'ja' | 'en' | 'ru' | 'zh';

export interface AiLanguageOptions {
  frontLang: AiMiningLanguage;
  backLang: AiMiningLanguage;
  reverse: boolean;
  backGlossLangs: AiMiningLanguage[];
}

export interface AiMiningCardFormat {
  id: string;
  presetId: string;
  label: string;
  profileId: string;
  outputFormat: AiMiningOutputFormat;
  description: string;
  cardTemplates: Array<{
    label: string;
    front: string;
    back: string;
    tags: string[];
  }>;
}

export interface AiEngineConfig {
  apiKeySet: boolean;
  apiKeysSet: AiApiKeysSet;
  providerId: AiProviderId;
  selectedPresetId: string;
  selectedFormatId: string;
  cardCount: number;
  outputFormat: AiMiningOutputFormat;
  frontLang: AiMiningLanguage;
  backLang: AiMiningLanguage;
  reverse: boolean;
  backGlossLangs: AiMiningLanguage[];
}

export interface AiEnrichmentRequest {
  term: string;
  reading?: string;
  sentence: string;
  bookTitle?: string;
  presetId: string;
  formatId?: string;
  cardCount?: number;
  outputFormat?: AiMiningOutputFormat;
  providerId?: AiProviderId;
  frontLang?: AiMiningLanguage;
  backLang?: AiMiningLanguage;
  reverse?: boolean;
  backGlossLangs?: AiMiningLanguage[];
  frequencies?: Record<string, number>;
  language?: 'ja' | 'en' | 'ru' | 'zh';
}

export type AiDeckGenerationSource = 'preset' | 'dictionary';

export interface AiDeckGenerationRequest {
  source: AiDeckGenerationSource;
  /** How many distinct vocabulary items to invent when source is preset. */
  wordCount?: number;
  /** Saved dictionary words when source is dictionary. */
  terms?: Array<{ term: string; reading?: string; sentence?: string }>;
  presetId: string;
  formatId?: string;
  cardCount?: number;
  outputFormat?: AiMiningOutputFormat;
  providerId?: AiProviderId;
  frontLang?: AiMiningLanguage;
  backLang?: AiMiningLanguage;
  reverse?: boolean;
  backGlossLangs?: AiMiningLanguage[];
}

export interface AiGenerationProgress {
  phase: 'invent' | 'enrich' | 'done';
  done: number;
  total: number;
  message?: string;
}

export interface AiGeneratedCard {
  formatId: string;
  label: string;
  front: string;
  back: string;
  tags: string[];
}

export interface AiEnrichmentResult {
  presetId: string;
  formatId: string;
  expression: string;
  reading: string;
  meaning: string;
  nuance: string;
  sentence: string;
  sentenceTranslationEn: string;
  sentenceTranslationRu: string;
  sentenceTranslationZh: string;
  meaningRu: string;
  meaningZh: string;
  grammarBreakdown: string;
  culturalContext: string;
  properNameNotes: string;
  toponymNotes: string;
  tags: string[];
  imageQuery: string;
  imageHtml: string;
  suggestedFront: string;
  suggestedBack: string;
  cards: AiGeneratedCard[];
  csv: string;
  frequencies: Record<string, number>;
  rawJson: string;
}

export const DEFAULT_TRADITIONAL_MINING_CONFIG: TraditionalMiningConfig = {
  analyzer: 'kuromoji',
  limits: DEFAULT_MINING_LIMITS,
  templates: {
    front: '{expression:ja}\n{reading:ja}',
    back: '{meaning:en}',
    resetToAutomatic: false,
  },
  export: DEFAULT_EPUB_EXPORT_OPTIONS,
};

// AI_PROMPT_PRESETS / AI_MINING_FORMATS / formatsForPreset are deliberately NOT
// re-exported here. This module is a barrel, and `renderer/storage/storage.ts`
// imports DEFAULT_TRADITIONAL_MINING_CONFIG from it — storage.ts is in Blanc's
// boot path, so the re-export dragged aiMiningCatalog's 41 KB of prompt presets
// into the entry chunk even though nothing in Blanc uses them. Rollup could not
// shake it out through the re-export. Import them from './aiMiningCatalog'.

export {
  AI_PROVIDERS,
  DEFAULT_AI_PROVIDER_ID,
  providerById,
  providerKeyBucket,
  type AiApiKeysSet,
  type AiProviderDefinition,
  type AiProviderId,
  type AiProviderKeyBucket,
} from './aiProviders';

export {
  AI_MINING_LANGUAGES,
  AI_LANGUAGE_DIRECTION_PRESETS,
  DEFAULT_AI_LANGUAGE_OPTIONS,
  applyLanguageOptionsToFormat,
  effectiveLanguagePair,
  languageDirectionLabel,
  languageOptionsForProfile,
  normalizeLanguageOptions,
} from './aiLanguageLayouts';

export {
  EPUB_CARD_LAYOUT_PRESETS,
  EPUB_CARD_SIDE_OPTIONS,
  applyEpubCardLayoutPreset,
  migrateEpubCardTemplates,
  buildEpubDeckExport,
  buildEpubDeckExportAsync,
  exportDeckFileContent,
  filterEpubCandidates,
  describeEpubFilterPipeline,
  needsDictionaryLookup,
  type EpubFilterPipelineBreakdown,
  type EpubFilterPipelineStep,
} from './epubDeck';

export {
  buildEpubMiningValues,
  candidateLookupKey,
  candidateNeedsEnrichment,
  collapseEmptySegments,
  extractTemplateTokens,
  firstGlossSegment,
  isUsableTemplateValue,
  mergeEnrichedCandidates,
  needsEnrichmentLookup,
  isNameExcluded,
  inferTranslationTargetLang,
  normalizeEpubTemplateSeparators,
  resolveTraditionalTemplates,
  resolveTranslationSource,
  type EnrichmentNeeds,
  type GlossLang,
} from './epubEnrichment';

export {
  FS_MARKER,
  buildFieldValuesWithSources,
  candidateIsComplete,
  computeFillReport,
  decorateFsValues,
  glossForLangFromEntries,
  reportableTemplateTokens,
  runEnrichment,
  type EnrichmentIO,
  type EnrichmentOutcome,
  type FillReport,
  type FillReportToken,
  type TranslateJob,
  type ValueSource,
} from './fieldRouter';

export {
  BUILTIN_JUNK_EXPRESSIONS,
  BUILTIN_JUNK_FILTER_SUMMARY,
  effectiveMiningBlacklist,
  isBuiltinJunkExpression,
  isSingleKanaJunk,
  shouldDropMiningCandidate,
} from './miningBlacklist';

export const BASE_MINING_TOKENS = [
  '{expression}',
  '{reading}',
  '{meaning}',
  '{sentence}',
  '{example-sentence}',
  '{pitch}',
  '{frequency}',
  '{audio}',
  '{image}',
  '{cloze-before}',
  '{cloze-inside}',
  '{cloze-after}',
];
