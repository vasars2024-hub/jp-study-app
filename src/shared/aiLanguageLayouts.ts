import type { AiLanguageOptions, AiMiningCardFormat, AiMiningLanguage, AiPromptPreset } from './mining';
import { SEED_PROFILES, type SeedProfileId } from './seedProfiles';
import type { StudyProfile } from './profiles';

export const AI_MINING_LANGUAGES: ReadonlyArray<{ id: AiMiningLanguage; label: string }> = [
  { id: 'ja', label: 'Japanese' },
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Russian' },
  { id: 'zh', label: 'Chinese' },
];

export const DEFAULT_AI_LANGUAGE_OPTIONS: AiLanguageOptions = {
  frontLang: 'ja',
  backLang: 'en',
  reverse: false,
  backGlossLangs: [],
};

export const AI_LANGUAGE_DIRECTION_PRESETS: ReadonlyArray<
  AiLanguageOptions & { id: string; label: string }
> = [
  { id: 'ja-en', label: 'JA → EN recognition', frontLang: 'ja', backLang: 'en', reverse: false, backGlossLangs: [] },
  { id: 'ja-ru', label: 'JA → RU recognition', frontLang: 'ja', backLang: 'ru', reverse: false, backGlossLangs: [] },
  { id: 'ja-zh', label: 'JA → ZH recognition', frontLang: 'ja', backLang: 'zh', reverse: false, backGlossLangs: [] },
  { id: 'ja-tri', label: 'JA → EN+RU+ZH', frontLang: 'ja', backLang: 'en', reverse: false, backGlossLangs: ['en', 'ru', 'zh'] },
  { id: 'en-ja', label: 'EN → JA production', frontLang: 'en', backLang: 'ja', reverse: false, backGlossLangs: [] },
  { id: 'ru-ja', label: 'RU → JA production', frontLang: 'ru', backLang: 'ja', reverse: false, backGlossLangs: [] },
  { id: 'zh-ja', label: 'ZH → JA production', frontLang: 'zh', backLang: 'ja', reverse: false, backGlossLangs: [] },
  { id: 'en-ru', label: 'EN → RU gloss', frontLang: 'en', backLang: 'ru', reverse: false, backGlossLangs: [] },
  { id: 'ru-en', label: 'RU → EN gloss', frontLang: 'ru', backLang: 'en', reverse: false, backGlossLangs: [] },
  { id: 'zh-en', label: 'ZH → EN gloss', frontLang: 'zh', backLang: 'en', reverse: false, backGlossLangs: [] },
  { id: 'reverse', label: 'Reverse current pair', frontLang: 'ja', backLang: 'en', reverse: true, backGlossLangs: [] },
];

const LANG_LABEL: Record<AiMiningLanguage, string> = {
  ja: 'Japanese',
  en: 'English',
  ru: 'Russian',
  zh: 'Chinese',
};

const TERM_BLOCK: Record<AiMiningLanguage, string> = {
  ja: '{expression}\n{reading}',
  en: '{meaning}',
  ru: '{meaningRu}',
  zh: '{meaningZh}',
};

const SENTENCE_BLOCK: Record<AiMiningLanguage, string> = {
  ja: '{sentence}',
  en: '{sentenceTranslationEn}',
  ru: '{sentenceTranslationRu}',
  zh: '{sentenceTranslationZh}',
};

const GLOSS_LINE: Record<AiMiningLanguage, string> = {
  ja: 'JA: {expression}（{reading}）',
  en: 'EN: {meaning}',
  ru: 'RU: {meaningRu}',
  zh: 'ZH: {meaningZh}',
};

export function normalizeLanguageOptions(raw?: Partial<AiLanguageOptions>): AiLanguageOptions {
  const frontLang = AI_MINING_LANGUAGES.some((l) => l.id === raw?.frontLang) ? raw!.frontLang! : 'ja';
  const backLang = AI_MINING_LANGUAGES.some((l) => l.id === raw?.backLang) ? raw!.backLang! : 'en';
  const backGlossLangs = Array.isArray(raw?.backGlossLangs)
    ? raw!.backGlossLangs.filter((l): l is AiMiningLanguage =>
        AI_MINING_LANGUAGES.some((entry) => entry.id === l),
      )
    : [];
  return {
    frontLang,
    backLang,
    reverse: Boolean(raw?.reverse),
    backGlossLangs,
  };
}

export function effectiveLanguagePair(options: AiLanguageOptions): { front: AiMiningLanguage; back: AiMiningLanguage } {
  if (options.reverse) {
    return { front: options.backLang, back: options.frontLang };
  }
  return { front: options.frontLang, back: options.backLang };
}

export function languageOptionsForProfile(
  profileId: string,
  resolver?: (id: string) => StudyProfile | undefined,
): AiLanguageOptions {
  const profile = resolver?.(profileId) ?? SEED_PROFILES[profileId as SeedProfileId];
  if (!profile) return { ...DEFAULT_AI_LANGUAGE_OPTIONS };
  return {
    frontLang: profile.card.frontLang as AiMiningLanguage,
    backLang: profile.card.backLang as AiMiningLanguage,
    reverse: false,
    backGlossLangs: [],
  };
}

export function profileForLanguagePair(front: AiMiningLanguage, back: AiMiningLanguage): string {
  const key = `${front}-${back}`;
  const map: Record<string, string> = {
    'ja-en': 'p1-ja-focus',
    'ja-ru': 'seed-ru-examples',
    'ja-zh': 'seed-chinese-bridge',
    'en-ja': 'p2-en-ja',
    'ru-ja': 'p3-ru-ja',
    'zh-ja': 'seed-zh-ja',
    'en-ru': 'seed-trilingual',
    'ru-en': 'seed-trilingual',
    'zh-en': 'seed-zh-en',
    'en-zh': 'seed-zh-en',
    'ru-zh': 'seed-chinese-bridge',
    'zh-ru': 'seed-chinese-bridge',
    'ja-ja': 'seed-ja-immersion',
    'en-en': 'seed-en-examples',
    'ru-ru': 'seed-ru-examples',
    'zh-zh': 'seed-zh-examples',
  };
  return map[key] ?? 'p1-ja-focus';
}

function inferStructureType(format: AiMiningCardFormat): 'recognition' | 'production' | 'cloze' {
  const sample = format.cardTemplates[0];
  if (!sample) return 'recognition';
  if (sample.front.includes('{cloze-before}') || sample.front.includes('[ … ]')) return 'cloze';
  if (
    format.profileId.includes('en-ja') ||
    format.profileId.includes('ru-ja') ||
    format.profileId.includes('zh-ja') ||
    format.id.includes('reverse') ||
    format.id.includes('production')
  ) {
    return 'production';
  }
  if (sample.front.includes('{meaning}') && !sample.front.includes('{expression}')) return 'production';
  return 'recognition';
}

function presetSupplement(presetId: string): string {
  if (
    presetId.includes('grammar') ||
    presetId.includes('conjugation') ||
    presetId.includes('particle') ||
    presetId.includes('classical') ||
    presetId.includes('aspect') ||
    presetId.includes('keigo')
  ) {
    return 'Breakdown:\n{grammarBreakdown}\n\nNuance: {nuance}';
  }
  if (presetId.includes('proper-name') || presetId.includes('surname') || presetId.includes('honorific')) {
    return 'Entity: {properNameNotes}\n\nNotes: {meaning}';
  }
  if (presetId.includes('toponym') || presetId.includes('regional') || presetId.includes('city')) {
    return 'Location: {toponymNotes}\n\nContext: {culturalContext}';
  }
  if (
    presetId.includes('idiom') ||
    presetId.includes('proverb') ||
    presetId.includes('slang') ||
    presetId.includes('internet')
  ) {
    return 'Nuance: {nuance}\n\nRegister: {culturalContext}';
  }
  if (presetId.includes('cloze') || presetId.includes('particle')) {
    return '{meaning}\n\nNuance: {nuance}';
  }
  return 'Gloss: {meaning}\n\nNuance: {nuance}\n\nContext: {culturalContext}';
}

function buildExtraGlossBlock(langs: AiMiningLanguage[], primaryBack: AiMiningLanguage): string {
  const unique = langs.filter((lang, index) => langs.indexOf(lang) === index && lang !== primaryBack);
  if (!unique.length) return '';
  return unique.map((lang) => GLOSS_LINE[lang]).join('\n\n');
}

function buildLanguageShell(
  structureType: 'recognition' | 'production' | 'cloze',
  front: AiMiningLanguage,
  back: AiMiningLanguage,
  supplement: string,
  backGlossLangs: AiMiningLanguage[],
): { front: string; back: string } {
  if (structureType === 'cloze') {
    return {
      front: '{cloze-before}[ … ]{cloze-after}\n\nRecall ({lang-back}):'.replace('{lang-back}', LANG_LABEL[back]),
      back: `${TERM_BLOCK[back]}\n\n${supplement}\n\n${SENTENCE_BLOCK.ja}`,
    };
  }

  if (structureType === 'production' || (front !== 'ja' && back === 'ja')) {
    return {
      front: `${TERM_BLOCK[front]}\n\n${SENTENCE_BLOCK[front]}\n\n→ ${LANG_LABEL[back]}:`,
      back: `${TERM_BLOCK[back]}\n\n${SENTENCE_BLOCK.ja}\n\n${supplement}`,
    };
  }

  const extra = buildExtraGlossBlock(backGlossLangs, back);
  return {
    front: `${TERM_BLOCK[front]}\n\n${SENTENCE_BLOCK[front]}`,
    back: `${TERM_BLOCK[back]}\n\n${supplement}${extra ? `\n\n${extra}` : ''}\n\nFrequency: {frequency}`,
  };
}

export function applyLanguageOptionsToFormat(
  format: AiMiningCardFormat,
  preset: AiPromptPreset,
  options: AiLanguageOptions,
): AiMiningCardFormat {
  const normalized = normalizeLanguageOptions(options);
  const profileDefault = languageOptionsForProfile(format.profileId);
  const { front, back } = effectiveLanguagePair(normalized);
  const pairLabel = `${front.toUpperCase()} → ${back.toUpperCase()}${normalized.reverse ? ' (reversed)' : ''}`;
  const langsMatchProfile =
    normalized.frontLang === profileDefault.frontLang &&
    normalized.backLang === profileDefault.backLang &&
    !normalized.reverse &&
    normalized.backGlossLangs.length === 0;

  if (langsMatchProfile) {
    return {
      ...format,
      label: `${format.label} · ${pairLabel}`,
      description: `${format.description} Language direction: ${pairLabel}.`,
      cardTemplates: format.cardTemplates.map((template) => ({
        ...template,
        label: `${template.label} (${pairLabel})`,
        tags: [...template.tags, `lang-${front}-${back}`, 'profile-default'],
      })),
    };
  }

  const structureType = inferStructureType(format);
  const supplement = presetSupplement(preset.id);
  const shell = buildLanguageShell(structureType, front, back, supplement, normalized.backGlossLangs);

  return {
    ...format,
    label: `${format.label} · ${pairLabel}`,
    description: `${format.description} Language direction: ${pairLabel}.`,
    cardTemplates: format.cardTemplates.map((template) => ({
      ...template,
      label: `${template.label} (${pairLabel})`,
      front: shell.front,
      back: shell.back,
      tags: [...template.tags, `lang-${front}-${back}`, normalized.reverse ? 'reversed' : 'normal'],
    })),
  };
}

export function languageDirectionLabel(options: AiLanguageOptions): string {
  const { front, back } = effectiveLanguagePair(normalizeLanguageOptions(options));
  const base = `${LANG_LABEL[front]} → ${LANG_LABEL[back]}`;
  const extras = normalizeLanguageOptions(options).backGlossLangs
    .filter((lang) => lang !== back)
    .map((lang) => LANG_LABEL[lang]);
  if (extras.length) return `${base} + ${extras.join(' + ')}`;
  return base;
}
