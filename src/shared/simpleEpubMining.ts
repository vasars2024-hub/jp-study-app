import {
  DEFAULT_EPUB_EXPORT_OPTIONS,
  DEFAULT_EXCLUDE_NAMES,
  DEFAULT_MINING_LIMITS,
  DEFAULT_TRADITIONAL_MINING_CONFIG,
  type TraditionalMiningConfig,
} from './mining';

export type SimpleEpubFilterMode = 'book' | 'dictionary';

export const SIMPLE_EPUB_TEMPLATES = {
  front: '{expression:ja}\n{reading:ja}',
  back: '{meaning:en}\n\n{sentence}\n\n{meaning:ja}',
  resetToAutomatic: false,
} as const;

export function buildSimpleEpubConfig(
  filterMode: SimpleEpubFilterMode,
  opts?: {
    freqMin?: number;
    freqMax?: number;
    minOccurrences?: number;
    excludeKanaOnly?: boolean;
  },
): TraditionalMiningConfig {
  const freqMin = opts?.freqMin ?? 0;
  const freqMax = opts?.freqMax ?? 0;
  const minOccurrences = opts?.minOccurrences ?? 1;
  const excludeKanaOnly = opts?.excludeKanaOnly ?? true;

  return {
    analyzer: 'kuromoji',
    limits: {
      ...DEFAULT_MINING_LIMITS,
      minFrequency: minOccurrences,
      // Simple mode should only use the explicit UI range filters.
      // A hidden common-word cap here conflicts with "rank to (0 = no cap)".
      maxCommonRank: 0,
      useBuiltinJunkFilter: true,
    },
    templates: { ...SIMPLE_EPUB_TEMPLATES },
    export: {
      ...DEFAULT_EPUB_EXPORT_OPTIONS,
      format: 'csv',
      strategy: 'manual',
      filterBy: filterMode === 'book' ? 'term-frequency' : 'deck-frequency',
      sortBy: 'deck-frequency',
      freqRangeMin: freqMin,
      freqRangeMax: freqMax,
      excludeKanaOnly,
      cardLayoutPreset: 'ja-en',
      frontContent: 'expression-reading',
      backContent: 'definition-en',
      excludeNames: {
        ...DEFAULT_EXCLUDE_NAMES,
        japanese: true,
        chinese: true,
        russian: true,
        places: true,
      },
      translationTargetLang: 'en',
      fillTranslations: false,
      translationEngine: 'qwen',
      translateSentences: false,
      fsMarker: false,
      excludeIncomplete: true,
      csvHeader: true,
    },
  };
}
