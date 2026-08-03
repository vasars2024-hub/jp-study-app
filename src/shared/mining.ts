/**
 * Mining barrel. The definitions live in `./miningTypes` (a leaf); this module
 * re-exports them together with the implementations from the sibling modules, so
 * every existing `from './mining'` import keeps working unchanged.
 *
 * Do not move a definition back into this file: the leaf modules below import the
 * types, and a definition here would recreate the cycle the split removed.
 */

export * from './miningTypes';

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
