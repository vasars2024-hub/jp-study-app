import {
  DEFAULT_AI_LANGUAGE_OPTIONS,
  effectiveLanguagePair,
  languageDirectionLabel,
  normalizeLanguageOptions,
} from './aiLanguageLayouts';
import type {
  AiDeckGenerationSource,
  AiEnrichmentRequest,
  AiLanguageOptions,
  AiMiningCardFormat,
  AiMiningLanguage,
  AiPromptPreset,
} from './mining';

export function renderAiTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\s*([A-Za-z][A-Za-z0-9-]*)\s*\}/g, (whole, key: string) => data[key] ?? whole);
}

const BASE_SAMPLES = {
  expression: '勉強する',
  reading: 'べんきょうする',
  meaning: 'to study',
  meaningRu: 'заниматься, учиться',
  meaningZh: '学习',
  translation: 'заниматься, учиться',
  nuance: 'Everyday verb; neutral register.',
  sentence: '毎日日本語を勉強しています。',
  sentenceTranslationEn: 'I study Japanese every day.',
  sentenceTranslationRu: 'Я занимаюсь японским каждый день.',
  sentenceTranslationZh: '我每天学习日语。',
  grammarBreakdown: '勉強する（一段動詞）· 毎日 + を + 勉強している',
  culturalContext: 'Classroom-safe example.',
  properNameNotes: 'Personal name — reading たろう is standard.',
  toponymNotes: 'Fictional or real place name in context.',
  frequency: 'BCCWJ: #4,820',
  'cloze-before': '毎日日本語を',
  'cloze-after': 'しています。',
} as const;

const IDIOM_SAMPLES: Record<string, string> = {
  expression: '猫の手も借りたい',
  reading: 'ねこのてもかりたい',
  meaning: 'desperate for any help; overwhelmed',
  meaningRu: 'нужна любая помощь; очень занят',
  meaningZh: '忙得不可开交',
  translation: 'нужна любая помощь',
  nuance: 'Figurative idiom — not about cats. Implies overload.',
  sentence: '年末は猫の手も借りたいほど忙しい。',
  sentenceTranslationEn: 'Year-end is so busy I would even borrow a cats paw.',
  sentenceTranslationRu: 'В конце года так занят, что нужна любая помощь.',
  sentenceTranslationZh: '年底忙得不可开交。',
  grammarBreakdown: '忙しい + ほど · set phrase 猫の手も借りたい',
  culturalContext: 'Common workplace / exam-season register.',
  'cloze-before': '年末は',
  'cloze-after': 'ほど忙しい。',
};

/** Per-preset sample overrides so the AI card example matches each task type. */
const PRESET_SAMPLE_PATCHES: Record<string, Partial<Record<string, string>>> = {
  'ru-production': {
    sentenceTranslationRu: 'Как по-японски сказать «заниматься, учиться»?',
    meaningRu: 'заниматься, учиться',
    translation: 'заниматься, учиться',
  },
  'en-production-n2': {
    meaning: 'to study; to learn diligently',
    sentenceTranslationEn: 'Say it in Japanese: to study every day.',
  },
  'idiom-reverse': {
    meaning: 'to be so busy you would take help from anyone',
    sentenceTranslationRu: 'Так занят, что нужна любая помощь.',
    toponymNotes: 'Blended EN/ZH cue for recall drill.',
  },
  'idiom-cloze': {
    'cloze-before': '年末は',
    'cloze-after': 'ほど忙しい。',
  },
  'proper-name': {
    expression: '田中太郎',
    reading: 'たなかたろう',
    meaning: 'Tanaka Taro — common Japanese male name',
    properNameNotes: 'Family name 田中 + given name 太郎',
  },
  'grammar-deconstruction': {
    expression: '食べさせられた',
    reading: 'たべさせられた',
    grammarBreakdown: '食べる → 食べさせる (causative) → 食べさせられる (causative-passive)',
  },
  'particle-contrast': {
    grammarBreakdown: 'は: topic/contrast · が: subject focus · に: target/static location',
  },
};

function isIdiomPreset(presetId?: string): boolean {
  return Boolean(
    presetId?.includes('idiom') ||
      presetId?.includes('slang') ||
      presetId?.includes('proverb') ||
      presetId?.includes('internet'),
  );
}

/** Representative AI field values for format / prompt previews in the studio UI. */
export function buildAiFormatSampleValues(
  presetId?: string,
  langOptions?: AiLanguageOptions,
): Record<string, string> {
  const { front, back } = effectiveLanguagePair(normalizeLanguageOptions(langOptions ?? DEFAULT_AI_LANGUAGE_OPTIONS));
  const core = {
    ...(isIdiomPreset(presetId) ? IDIOM_SAMPLES : BASE_SAMPLES),
    ...(presetId ? PRESET_SAMPLE_PATCHES[presetId] : {}),
  };

  const values: Record<string, string> = { ...core };
  values.translation = values.translation || values.meaningRu || values.meaning;

  if (front === 'ru') {
    values['expression:ru'] = values.meaningRu;
    values['example-sentence:ru'] = values.sentenceTranslationRu;
  }
  if (front === 'en') {
    values['expression:en'] = values.meaning;
    values['example-sentence:en'] = values.sentenceTranslationEn;
  }
  if (front === 'zh') {
    values['expression:zh'] = values.meaningZh;
    values['example-sentence:zh'] = values.sentenceTranslationZh;
  }
  if (back === 'ja') {
    values['expression:ja'] = values.expression;
    values['example-sentence:ja'] = values.sentence;
  }

  void back;
  return values;
}

export interface AiPromptPreviewInput {
  mode: AiDeckGenerationSource;
  preset: AiPromptPreset;
  localizedFormat: AiMiningCardFormat;
  langOptions: AiLanguageOptions;
  cardCount: number;
  outputFormat: 'anki' | 'csv';
  templateFront: string;
  templateBack: string;
  targetLang?: string;
  wordCount?: number;
  /** Expressions already invented in earlier batches — must not repeat. */
  avoidExpressions?: string[];
  /** When inventing in chunks, labels the current batch for the model. */
  inventBatch?: { index: number; total: number };
  sampleTerm?: AiEnrichmentRequest;
}

/** English names of the study languages, for prompts. */
const TARGET_LANGUAGE_NAME: Readonly<Record<string, string>> = { ja: 'Japanese', zh: 'Chinese (Mandarin)', ru: 'Russian' };

export function buildAiPromptPreview(input: AiPromptPreviewInput): string {
  const langOptions = normalizeLanguageOptions(input.langOptions);
  const { front, back } = effectiveLanguagePair(langOptions);
  const targetLang = input.targetLang ?? 'ja';

  if (input.mode === 'preset') {
    const wordCount = Math.max(1, input.wordCount ?? 10);
    const batchNote = input.inventBatch
      ? `Batch ${input.inventBatch.index} of ${input.inventBatch.total} for a larger deck run.\n`
      : '';
    const avoidNote =
      input.avoidExpressions && input.avoidExpressions.length > 0
        ? `Already invented — do not repeat: ${input.avoidExpressions.join(', ')}\n\n`
        : '';
    return (
      `You are a language-learning flashcard generator for a desktop study app.\n` +
      `Invent vocabulary content from the preset below — do not wait for a user-supplied word list.\n\n` +
      batchNote +
      `Preset: ${input.preset.label}\n` +
      `Instruction: ${input.preset.instruction}\n\n` +
      `Card format: ${input.localizedFormat.label}\n` +
      `Format aim: ${input.localizedFormat.description}\n` +
      `Language direction: ${languageDirectionLabel(langOptions)} (${front} → ${back})\n` +
      `Anki profile: ${input.localizedFormat.profileId}\n` +
      `Cards per invented word: ${input.cardCount}\n` +
      `Output target: ${input.outputFormat.toUpperCase()}\n\n` +
      avoidNote +
      // The deck's own language: a Chinese or Russian profile invents Chinese or Russian items.
      `Generate exactly ${wordCount} distinct ${TARGET_LANGUAGE_NAME[targetLang] ?? 'Japanese'} items that fit this preset.\n` +
      `Each item needs a natural example sentence, reading, English meaning, Russian meaning (meaningRu), ` +
      `Chinese meaning when useful (meaningZh), and sentence translations.\n` +
      `Do not repeat expressions. Prefer useful study material over obscure trivia.\n\n` +
      `Active front template: ${input.templateFront}\n` +
      `Active back template: ${input.templateBack}\n` +
      `Target language: ${targetLang}\n\n` +
      `Return JSON: { "items": [ ...${wordCount} objects... ] } using the item schema.`
    );
  }

  const samples = buildAiFormatSampleValues(input.preset.id, langOptions);
  const req = input.sampleTerm ?? {
    term: samples.expression,
    reading: samples.reading,
    sentence: samples.sentence,
    bookTitle: 'Sample novel',
    presetId: input.preset.id,
  };

  return (
    `You are a language-mining assistant for a desktop EPUB reader and Anki workflow.\n` +
    `Analyze the target token using the selected preset.\n\n` +
    `Preset: ${input.preset.label}\n` +
    `Instruction: ${input.preset.instruction}\n\n` +
    `Card format: ${input.localizedFormat.label}\n` +
    `Format aim: ${input.localizedFormat.description}\n` +
    `Language direction: ${languageDirectionLabel(langOptions)} (${front} → ${back})\n` +
    `Anki profile: ${input.localizedFormat.profileId}\n` +
    `Number of cards requested: ${input.cardCount}\n` +
    `Output target: ${input.outputFormat.toUpperCase()}\n\n` +
    `Provide English meaning in "meaning", Russian in "meaningRu", Chinese in "meaningZh".\n` +
    `Provide sentence translations in sentenceTranslationEn/Ru/Zh.\n\n` +
    `Target term: ${req.term}\n` +
    `Reading: ${req.reading ?? ''}\n` +
    `Sentence context: ${req.sentence ?? ''}\n` +
    `Book title: ${req.bookTitle ?? ''}\n` +
    `Frequency ranks: {}\n` +
    `Active front template: ${input.templateFront}\n` +
    `Active back template: ${input.templateBack}\n` +
    `Target language: ${targetLang}\n\n` +
    `Return concise card-ready text. For idiom formats, prioritize figurative meaning, usage constraints, and context-dependent nuance.`
  );
}
