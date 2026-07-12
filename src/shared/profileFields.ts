// Canonical Kinomoto field templates + adapter for Front/Back note types.

import type { CardContent, LangCode, StudyProfile } from './profiles';

/** Map canonical Kinomoto field -> possible Anki field name synonyms. */
const FIELD_SYNONYMS: Record<string, string[]> = {
  Term: ['Term', 'Expression', 'Front', 'Word', 'Kanji'],
  Reading: ['Reading', 'Furigana', 'Kana', 'Yomi'],
  Meaning: ['Meaning', 'Definition', 'Gloss', 'English', 'Back'],
  Translation: ['Translation', 'Native', 'Russian'],
  Sentence: ['Sentence', 'Context', 'Example'],
  Notes: ['Notes', 'Note'],
  Image: ['Image', 'Picture', 'Screenshot'],
  'Term Audio': ['Term Audio', 'Audio', 'Sound'],
  'Sentence Audio': ['Sentence Audio'],
  Frequency: ['Frequency', 'Freq'],
};

export function resolveCanonicalField(canonical: string, modelFields: string[]): string | null {
  const synonyms = FIELD_SYNONYMS[canonical] ?? [canonical];
  for (const name of synonyms) {
    if (modelFields.includes(name)) return name;
  }
  return null;
}

/** Adapt seed templates (Kinomoto keys) to the user's actual note-type field names. */
export function adaptFieldTemplates(
  canonical: Record<string, string> | undefined,
  modelFields: string[],
): Record<string, string> {
  if (!canonical) return {};
  const out: Record<string, string> = {};
  for (const [canon, tpl] of Object.entries(canonical)) {
    if (!tpl.trim()) continue;
    const resolved = resolveCanonicalField(canon, modelFields);
    if (resolved) out[resolved] = tpl;
  }
  return out;
}

/** Merge profile seed templates with live model fields for the mapping editor. */
export function seedTemplatesForModel(profile: StudyProfile, modelFields: string[]): Record<string, string> {
  const saved = profile.anki.fieldTemplates ?? {};
  const direct = modelFields.some((f) => f in saved);
  const adapted = direct ? saved : adaptFieldTemplates(saved, modelFields);
  const out: Record<string, string> = {};
  for (const f of modelFields) out[f] = adapted[f] ?? '';
  return out;
}

export function seedFallbackForModel(profile: StudyProfile, modelFields: string[]): Record<string, string> {
  const saved = profile.anki.exampleFallbackTemplates ?? {};
  const direct = modelFields.some((f) => f in saved);
  const adapted = direct ? saved : adaptFieldTemplates(saved, modelFields);
  const out: Record<string, string> = {};
  for (const f of modelFields) out[f] = adapted[f] ?? '';
  return out;
}

/** Build field HTML keyed by both model fields and canonical Kinomoto names. */
export function fieldHtmlForCardPreview(
  modelFields: string[],
  templates: Record<string, string>,
  render: (template: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of modelFields) {
    const tpl = templates[f];
    if (tpl?.trim()) out[f] = render(tpl);
  }
  const canonNames = [
    'Term',
    'Reading',
    'Meaning',
    'Translation',
    'Sentence',
    'Notes',
    'Image',
    'Term Audio',
    'Sentence Audio',
    'Frequency',
  ];
  for (const canon of canonNames) {
    const resolved = resolveCanonicalField(canon, modelFields);
    if (resolved && out[resolved]) out[canon] = out[resolved];
  }
  return out;
}

/** Merge seed profile templates with live editor drafts (seed wins when live is blank). */
export function mergeEffectiveTemplates(
  profile: StudyProfile,
  fields: string[],
  live: Record<string, string>,
): Record<string, string> {
  const seed = adaptFieldTemplates(profile.anki.fieldTemplates, fields);
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f] = live[f]?.trim() ? live[f] : (seed[f]?.trim() ? seed[f] : '');
  }
  return out;
}

/** Same as mergeEffectiveTemplates, but seeded from example fallback templates. */
export function mergeEffectiveFallbackTemplates(
  profile: StudyProfile,
  fields: string[],
  live: Record<string, string>,
): Record<string, string> {
  const seed = adaptFieldTemplates(profile.anki.exampleFallbackTemplates, fields);
  const out: Record<string, string> = {};
  for (const f of fields) {
    out[f] = live[f]?.trim() ? live[f] : (seed[f]?.trim() ? seed[f] : '');
  }
  return out;
}

const CANONICAL_FOR_CONTENT: Record<CardContent, string> = {
  term: 'Term',
  reading: 'Reading',
  meaning: 'Meaning',
  translation: 'Translation',
  sentence: 'Sentence',
  frequency: 'Frequency',
  image: 'Image',
  audio: 'Term Audio',
};

const CONTENT_BY_LANG: Record<CardContent, Record<LangCode, string>> = {
  term: { ja: '勉強', en: 'study', ru: 'учёба', zh: '学习' },
  reading: { ja: 'べんきょう', en: 'benkyou', ru: 'benkyou', zh: 'xuéxí' },
  meaning: { ja: '勉強', en: 'study; diligence', ru: 'учёба', zh: '学习；用功' },
  translation: { ja: 'учёба', en: 'study', ru: 'учёба', zh: '学习' },
  sentence: {
    ja: '毎日日本語を勉強します。',
    en: 'I study Japanese every day.',
    ru: 'Я занимаюсь японским каждый день.',
    zh: '我每天学习日语。',
  },
  frequency: { ja: '#1,240', en: '#1,240', ru: '#1,240', zh: '#1,240' },
  image: {
    ja: '<span class="jsa-image">[clipboard screenshot]</span>',
    en: '<span class="jsa-image">[clipboard screenshot]</span>',
    ru: '<span class="jsa-image">[clipboard screenshot]</span>',
    zh: '<span class="jsa-image">[clipboard screenshot]</span>',
  },
  audio: {
    ja: '[sound:sample.mp3]',
    en: '[sound:sample.mp3]',
    ru: '[sound:sample.mp3]',
    zh: '[sound:sample.mp3]',
  },
};

const PAIR_SAMPLES = {
  'en:ja':
    'He studies every day.<br>彼は毎日勉強している。<br><br>She reads books often.<br>彼女はよく本を読む。',
  'ru:ja':
    'Он занимается каждый день.<br>彼は毎日勉強している。<br><br>Она часто читает книги.<br>彼女はよく本を読む。',
  'zh:ja': '我每天学习日语。<br>毎日日本語を勉強します。<br><br>她经常看书。<br>彼女はよく本を読む。',
} as const;

function templatesBlob(templates?: Record<string, string>, profile?: StudyProfile): string {
  const parts = [
    ...Object.values(templates ?? {}),
    ...Object.values(profile?.anki.fieldTemplates ?? {}),
    ...Object.values(profile?.anki.exampleFallbackTemplates ?? {}),
  ];
  return parts.join(' ');
}

/** Sample mining values tuned to profile direction and active field templates. */
export function buildPreviewSampleValues(
  profile: StudyProfile,
  templates?: Record<string, string>,
): Record<string, string> {
  const fl = profile.card.frontLang;
  const bl = profile.card.backLang;
  const blob = templatesBlob(templates, profile);

  const pick = (content: CardContent, lang: LangCode) =>
    CONTENT_BY_LANG[content][lang] ?? CONTENT_BY_LANG[content].ja;

  const values: Record<string, string> = {
    expression: pick('term', 'ja'),
    reading: pick('reading', 'ja'),
    meaning: pick('meaning', 'en'),
    translation: pick('translation', 'ru'),
    sentence: pick('sentence', 'ja'),
    'sentence-translation': pick('sentence', 'en'),
    'example-sentence': pick('sentence', 'ja'),
    'example-sentence:ja': '彼は毎日勉強している。',
    'example-sentence:en': 'He studies every day.',
    'example-sentence:ru': 'Он занимается каждый день.',
    'example-sentence:zh': '我每天学习日语。',
    'expression:ja': pick('term', 'ja'),
    'expression:ru': pick('term', 'ru'),
    'expression:en': pick('term', 'en'),
    'expression:zh': pick('term', 'zh'),
    'example-pairs:en:ja': PAIR_SAMPLES['en:ja'],
    'example-pairs:ru:ja': PAIR_SAMPLES['ru:ja'],
    'example-pairs:zh:ja': PAIR_SAMPLES['zh:ja'],
    'cloze-before': '毎日日本語を',
    'cloze-inside': '勉強',
    'cloze-after': 'します。',
    pitch: 'べんきょう',
    frequency: '#1,240',
    audio: '[sound:sample.mp3]',
    image: '',
  };

  if (profile.lookup.pipeline === 'cedict-local') {
    values.expression = pick('term', 'zh');
    values.reading = pick('reading', 'zh');
    values.meaning = pick('meaning', 'en');
  }

  if (/\{example-pairs:en:ja\}/i.test(blob)) values.meaning = PAIR_SAMPLES['en:ja'];
  if (/\{example-pairs:ru:ja\}/i.test(blob)) values.translation = PAIR_SAMPLES['ru:ja'];
  if (/\{example-pairs:zh:ja\}/i.test(blob)) values.meaning = PAIR_SAMPLES['zh:ja'];

  if (/\{example-sentence:en\}/i.test(blob)) values['example-sentence:en'] = 'He studies every day.';
  if (/\{example-sentence:ru\}/i.test(blob)) values['example-sentence:ru'] = 'Он занимается каждый день.';
  if (/\{example-sentence:zh\}/i.test(blob)) values['example-sentence:zh'] = '我每天学习日语。';

  for (const c of profile.card.front) {
    const text = pick(c, fl);
    if (c === 'translation') values.translation = text;
    if (c === 'meaning' && !/\{example-pairs/i.test(blob)) values.meaning = text;
    if (c === 'term') values.expression = text;
    if (c === 'reading') values.reading = text;
    if (c === 'sentence') values.sentence = text;
  }
  for (const c of profile.card.back) {
    const text = pick(c, bl);
    if (c === 'term') values.expression = text;
    if (c === 'reading') values.reading = text;
    if (c === 'meaning') values.meaning = pick('meaning', 'en');
    if (c === 'translation') values.translation = text;
    if (c === 'sentence') values.sentence = text;
  }

  return values;
}

/** Fill only blueprint slots that templates did not already populate. */
export function fillBlueprintFieldGaps(
  profile: StudyProfile,
  fieldHtml: Record<string, string>,
): Record<string, string> {
  const out = { ...fieldHtml };
  const add = (content: CardContent, lang: LangCode) => {
    const canon = CANONICAL_FOR_CONTENT[content];
    if (out[canon]?.trim()) return;
    out[canon] = CONTENT_BY_LANG[content][lang] ?? CONTENT_BY_LANG[content].ja;
  };
  for (const c of profile.card.front) add(c, profile.card.frontLang);
  for (const c of profile.card.back) add(c, profile.card.backLang);
  return out;
}

/** Standard JMdict + optional extras per profile purpose. */
export const DICT = {
  jmdict: 'JMdict / Jisho (online or Yomitan import)',
  yomitan: 'Yomitan term dictionary (.zip import)',
  pitch: 'Kanjium pitch accent (bundled)',
  frequency: 'Frequency list (Yomitan import)',
  tatoeba: 'Tatoeba examples (online; optional offline CSV)',
  cedict: 'CC-CEDICT (Chinese, bundled)',
  qwen: 'Qwen3 translator (for {base:lang} variables)',
} as const;

export type ProfileFieldPack = {
  /** Unique Anki note type name for this profile. */
  modelName: string;
  /** Ordered fields created on the note type (profile-specific, not Kinomoto). */
  noteFields: readonly string[];
  templates: Record<string, string>;
  exampleCounts?: StudyProfile['anki']['exampleCounts'];
  exampleFallback?: boolean;
  exampleFallbackTemplates?: Record<string, string>;
  requiredDictionaries: string[];
};

export const PROFILE_MODEL_PREFIX = 'JP Study App';

export function profileModelName(short: string): string {
  return `${PROFILE_MODEL_PREFIX}::${short}`;
}

function pk(
  short: string,
  noteFields: readonly string[],
  templates: Record<string, string>,
  requiredDictionaries: string[],
  extra?: Partial<
    Pick<ProfileFieldPack, 'exampleCounts' | 'exampleFallback' | 'exampleFallbackTemplates'>
  >,
): ProfileFieldPack {
  return {
    modelName: profileModelName(short),
    noteFields,
    templates,
    requiredDictionaries,
    exampleFallback: extra?.exampleFallback ?? true,
    exampleFallbackTemplates: extra?.exampleFallbackTemplates ?? templates,
    exampleCounts: extra?.exampleCounts,
  };
}

/** Canonical field packs — each profile gets its own note type and field list. */
export const FIELD_PACKS = {
  jaEnClassic: pk(
    'JA-EN Classic',
    ['Term', 'Reading', 'Meaning', 'Sentence'],
    { Term: '{expression}', Reading: '{reading}', Meaning: '{meaning}', Sentence: '{sentence}' },
    [DICT.jmdict, DICT.yomitan],
    {
      exampleFallbackTemplates: {
        Term: '{expression}',
        Reading: '{reading}',
        Meaning: '{meaning}',
        Sentence: '',
      },
    },
  ),
  enJaProduction: pk(
    'EN-JA Production',
    ['Meaning', 'Term', 'Reading', 'Sentence'],
    {
      Meaning: '{meaning}',
      Term: '{expression}',
      Reading: '{reading}',
      Sentence: '{sentence}',
    },
    [DICT.jmdict, DICT.qwen],
    {
      exampleFallbackTemplates: {
        Meaning: '{meaning}',
        Term: '{expression}',
        Reading: '{reading}',
        Sentence: '',
      },
    },
  ),
  ruJaProduction: pk(
    'RU-JA Production',
    ['Translation', 'Term', 'Reading', 'Sentence'],
    {
      Translation: '{translation}',
      Term: '{expression}',
      Reading: '{reading}',
      Sentence: '{sentence}',
    },
    [DICT.jmdict, DICT.qwen, DICT.tatoeba],
    {
      exampleFallbackTemplates: {
        Translation: '{expression:ru}',
        Term: '{expression}',
        Reading: '{reading}',
        Sentence: '',
      },
    },
  ),
  ruExamples: pk(
    'RU Examples',
    ['Translation', 'Term', 'Reading'],
    {
      Translation: '{example-sentence:ru}',
      Term: '{example-sentence:ja} {expression:ja}',
      Reading: '{reading}',
    },
    [DICT.jmdict, DICT.qwen, DICT.tatoeba],
    {
      exampleCounts: { ru: 1, ja: 2 },
      exampleFallbackTemplates: {
        Translation: '{expression:ru}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  ruPairs: pk(
    'RU-JA Pairs',
    ['Translation', 'Term', 'Reading'],
    {
      Translation: '{example-pairs:ru:ja}',
      Term: '{expression:ja}',
      Reading: '{reading}',
    },
    [DICT.jmdict, DICT.qwen, DICT.tatoeba],
    {
      exampleCounts: { ru: 2, ja: 2 },
      exampleFallbackTemplates: {
        Translation: '{expression:ru}<br>{expression:ja}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  ruExFallback: pk(
    'RU Smart Fallback',
    ['Translation', 'Term', 'Reading'],
    {
      Translation: '{example-sentence:ru}',
      Term: '{example-sentence:ja} {expression:ja}',
      Reading: '{reading}',
    },
    [DICT.jmdict, DICT.qwen, DICT.tatoeba],
    {
      exampleCounts: { ru: 1, ja: 1 },
      exampleFallbackTemplates: {
        Translation: '{expression:ru}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  enExamples: pk(
    'EN Examples',
    ['Meaning', 'Term', 'Reading'],
    {
      Meaning: '{example-sentence:en}',
      Term: '{example-sentence:ja} {expression:ja}',
      Reading: '{reading}',
    },
    [DICT.jmdict, DICT.tatoeba],
    {
      exampleCounts: { en: 1, ja: 1 },
      exampleFallbackTemplates: {
        Meaning: '{meaning}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  enPairs: pk(
    'EN-JA Pairs',
    ['Meaning', 'Term', 'Reading'],
    {
      Meaning: '{example-pairs:en:ja}',
      Term: '{expression:ja}',
      Reading: '{reading}',
    },
    [DICT.jmdict, DICT.tatoeba],
    {
      exampleCounts: { en: 2, ja: 2 },
      exampleFallbackTemplates: {
        Meaning: '{meaning}<br>{expression:ja}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  cloze: pk(
    'Reader Cloze',
    ['Sentence', 'Term', 'Meaning'],
    {
      Sentence: '{cloze-before}【{cloze-inside}】{cloze-after}',
      Term: '{expression}（{reading}）',
      Meaning: '{meaning}',
    },
    [DICT.jmdict],
    {
      exampleFallbackTemplates: {
        Sentence: '{sentence}',
        Term: '{expression}',
        Meaning: '{meaning}',
      },
    },
  ),
  jaImmersion: pk(
    'JA Immersion',
    ['Term', 'Reading', 'Sentence'],
    { Term: '{expression}', Reading: '{reading}', Sentence: '{sentence}' },
    [DICT.jmdict, DICT.yomitan],
    { exampleFallbackTemplates: { Term: '{expression}', Reading: '{reading}', Sentence: '' } },
  ),
  readingFirst: pk(
    'Reading First',
    ['Reading', 'Term', 'Meaning'],
    { Reading: '{reading}', Term: '{expression}', Meaning: '{meaning}' },
    [DICT.jmdict],
  ),
  kanjiFront: pk(
    'Kanji Front',
    ['Term', 'Reading', 'Meaning'],
    { Term: '{expression}', Reading: '{reading}', Meaning: '{meaning}' },
    [DICT.jmdict],
  ),
  minimal: pk(
    'Minimal',
    ['Term', 'Meaning'],
    { Term: '{expression}', Meaning: '{meaning}' },
    [DICT.jmdict],
  ),
  audio: pk(
    'Audio',
    ['Term', 'Reading', 'Term Audio'],
    { Term: '{expression}', Reading: '{reading}', 'Term Audio': '{audio}' },
    [DICT.jmdict],
    { exampleFallbackTemplates: { Term: '{expression}', Reading: '{reading}', 'Term Audio': '' } },
  ),
  frequency: pk(
    'Frequency',
    ['Term', 'Reading', 'Frequency'],
    { Term: '{expression}', Reading: '{reading}', Frequency: '{frequency}' },
    [DICT.jmdict, DICT.frequency, DICT.yomitan],
    { exampleFallbackTemplates: { Term: '{expression}', Reading: '{reading}', Frequency: '' } },
  ),
  image: pk(
    'Screenshot',
    ['Term', 'Reading', 'Image'],
    { Term: '{expression}', Reading: '{reading}', Image: '{image}' },
    [DICT.jmdict],
    { exampleFallbackTemplates: { Term: '{expression}', Reading: '{reading}', Image: '' } },
  ),
  chinese: pk(
    'ZH Bridge',
    ['Term', 'Reading', 'Meaning'],
    { Term: '{expression}', Reading: '{reading}', Meaning: '{meaning}' },
    [DICT.cedict, DICT.jmdict],
  ),
  trilingual: pk(
    'Trilingual',
    ['Translation', 'Term', 'Meaning'],
    {
      Translation: '{expression:ru}',
      Term: '{expression:ja}（{reading}）',
      Meaning: '{meaning}',
    },
    [DICT.jmdict, DICT.qwen],
    {
      exampleFallbackTemplates: {
        Translation: '{expression:ru}',
        Term: '{expression:ja}',
        Meaning: '{meaning}',
      },
    },
  ),
  speed: pk(
    'Speed',
    ['Term', 'Reading'],
    { Term: '{expression}', Reading: '{reading}' },
    [DICT.jmdict],
  ),
  zhEn: pk(
    'ZH-EN',
    ['Term', 'Reading', 'Meaning'],
    { Term: '{expression}', Reading: '{reading}', Meaning: '{meaning}' },
    [DICT.cedict],
  ),
  zhJaProduction: pk(
    'ZH-JA Production',
    ['Translation', 'Term', 'Reading'],
    { Translation: '{expression:zh}', Term: '{expression:ja}', Reading: '{reading}' },
    [DICT.cedict, DICT.jmdict, DICT.qwen],
  ),
  zhJaExamples: pk(
    'ZH Examples',
    ['Translation', 'Term', 'Reading'],
    {
      Translation: '{example-sentence:zh}',
      Term: '{example-sentence:ja} {expression:ja}',
      Reading: '{reading}',
    },
    [DICT.cedict, DICT.jmdict, DICT.tatoeba, DICT.qwen],
    {
      exampleCounts: { zh: 1, ja: 1 },
      exampleFallbackTemplates: {
        Translation: '{expression:zh}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
  zhJaPairs: pk(
    'ZH-JA Pairs',
    ['Translation', 'Term', 'Reading'],
    {
      Translation: '{example-pairs:zh:ja}',
      Term: '{expression:ja}',
      Reading: '{reading}',
    },
    [DICT.cedict, DICT.jmdict, DICT.tatoeba, DICT.qwen],
    {
      exampleCounts: { zh: 2, ja: 2 },
      exampleFallbackTemplates: {
        Translation: '{expression:zh}<br>{expression:ja}',
        Term: '{expression:ja}',
        Reading: '{reading}',
      },
    },
  ),
} satisfies Record<string, ProfileFieldPack>;

export function packToAnki(pack: ProfileFieldPack): StudyProfile['anki'] {
  return {
    deckName: '',
    modelName: pack.modelName,
    noteFields: pack.noteFields,
    fieldTemplates: pack.templates,
    exampleCounts: pack.exampleCounts,
    exampleFallback: pack.exampleFallback ?? true,
    exampleFallbackTemplates: pack.exampleFallbackTemplates ?? pack.templates,
  };
}
