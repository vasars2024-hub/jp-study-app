// Built-in study profiles shipped with the app. Each has field mappings,
// expression fallback, required dictionaries, and card CSS.

import { CARD_CSS_COMPACT, DEFAULT_CARD_CSS } from './kinomotoCard';
import { FIELD_PACKS, packToAnki, type ProfileFieldPack } from './profileFields';
import type { ProfileId, StudyProfile } from './profiles';

const THRESH = { familiar: 1, known: 21 } as const;

function seed(
  id: string,
  label: string,
  description: string,
  card: StudyProfile['card'],
  deckName: string,
  deckParams: StudyProfile['deckParams'],
  pack: ProfileFieldPack,
  lookup: StudyProfile['lookup'] = { pipeline: 'jmdict-jisho' },
  noteCss: string = DEFAULT_CARD_CSS,
): StudyProfile {
  return {
    id,
    label,
    description,
    targetLang: 'ja',
    card,
    anki: { ...packToAnki(pack), deckName },
    deckParams,
    lookup,
    requiredDictionaries: pack.requiredDictionaries,
    noteCss,
  };
}

/** Grouped profile folders for the picker UI. */
export const PROFILE_GROUPS: ReadonlyArray<{ label: string; ids: readonly ProfileId[] }> = [
  {
    label: 'Japanese ↔ English',
    ids: [
      'p1-ja-focus',
      'seed-sentence-mine',
      'seed-reading-first',
      'seed-kanji-front',
      'seed-minimal',
      'seed-context-cloze',
      'seed-ja-immersion',
    ],
  },
  {
    label: 'English → Japanese',
    ids: ['p2-en-ja', 'seed-en-n5', 'seed-en-n3', 'seed-en-n1', 'seed-en-examples', 'seed-en-pairs'],
  },
  {
    label: 'Russian',
    ids: [
      'p3-ru-ja',
      'seed-ru-production',
      'seed-ru-examples',
      'seed-ru-pairs',
      'seed-ru-ex-fallback',
      'seed-trilingual',
    ],
  },
  {
    label: 'Chinese',
    ids: ['seed-chinese-bridge', 'seed-zh-en', 'seed-zh-ja', 'seed-zh-examples', 'seed-zh-pairs'],
  },
  {
    label: 'Specialty mining',
    ids: ['seed-frequency', 'seed-image-mine', 'seed-audio', 'seed-speed-review'],
  },
];

/** Canonical built-in profile ids (order = picker order). */
export const PROFILE_IDS = [
  'p1-ja-focus',
  'p2-en-ja',
  'p3-ru-ja',
  'seed-ja-immersion',
  'seed-en-n5',
  'seed-en-n3',
  'seed-en-n1',
  'seed-ru-production',
  'seed-ru-examples',
  'seed-ru-pairs',
  'seed-ru-ex-fallback',
  'seed-en-examples',
  'seed-en-pairs',
  'seed-context-cloze',
  'seed-sentence-mine',
  'seed-reading-first',
  'seed-kanji-front',
  'seed-minimal',
  'seed-audio',
  'seed-frequency',
  'seed-image-mine',
  'seed-chinese-bridge',
  'seed-zh-en',
  'seed-zh-ja',
  'seed-zh-examples',
  'seed-zh-pairs',
  'seed-trilingual',
  'seed-speed-review',
] as const;

export type SeedProfileId = (typeof PROFILE_IDS)[number];

export const DEFAULT_PROFILE_ID: SeedProfileId = 'p1-ja-focus';

export const SEED_PROFILES: Record<SeedProfileId, StudyProfile> = {
  'p1-ja-focus': seed(
    'p1-ja-focus',
    'Japanese Focus',
    'Classic recognition: Japanese headword on the front, reading + English gloss on the back. Best default for JLPT vocab.',
    { front: ['term'], back: ['reading', 'meaning', 'sentence'], frontLang: 'ja', backLang: 'en' },
    'JP Study::N2 Vocab',
    { syncQuery: 'deck:*', jlptTarget: 'N2', newPerDay: 20, thresholds: THRESH },
    FIELD_PACKS.jaEnClassic,
  ),

  'p2-en-ja': seed(
    'p2-en-ja',
    'English → Japanese',
    'Production drill: English definition on the front, kanji + reading on the back. Good when you want to recall the Japanese word.',
    { front: ['meaning'], back: ['term', 'reading', 'sentence'], frontLang: 'en', backLang: 'ja' },
    'JP Study::EN to JP',
    { syncQuery: 'deck:"JP Study::EN to JP"', thresholds: THRESH },
    FIELD_PACKS.enJaProduction,
  ),

  'p3-ru-ja': seed(
    'p3-ru-ja',
    'Russian → Japanese',
    'Production for Russian speakers: Russian gloss on the front, Japanese on the back.',
    { front: ['translation'], back: ['term', 'reading', 'sentence'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::RU to JP',
    { syncQuery: 'deck:"JP Study::RU to JP"', thresholds: THRESH },
    FIELD_PACKS.ruJaProduction,
  ),

  'seed-ja-immersion': seed(
    'seed-ja-immersion',
    'Japanese Immersion',
    'Both faces in Japanese — no English on the card. For when you want pure JP→JP recall.',
    { front: ['term'], back: ['reading', 'sentence'], frontLang: 'ja', backLang: 'ja' },
    'JP Study::Immersion',
    { syncQuery: 'deck:"JP Study::Immersion"', jlptTarget: 'N3', thresholds: THRESH },
    FIELD_PACKS.jaImmersion,
  ),

  'seed-en-n5': seed(
    'seed-en-n5',
    'N5 Beginner (EN)',
    'Gentle EN→JP deck tuned for N5. English front, hiragana-friendly back with reading prominent.',
    { front: ['meaning'], back: ['reading', 'term'], frontLang: 'en', backLang: 'ja' },
    'JP Study::N5',
    { syncQuery: 'deck:"JP Study::N5"', jlptTarget: 'N5', newPerDay: 15, thresholds: THRESH },
    FIELD_PACKS.enJaProduction,
    { pipeline: 'jmdict-jisho' },
    CARD_CSS_COMPACT,
  ),

  'seed-en-n3': seed(
    'seed-en-n3',
    'N3 Core (EN)',
    'Mid-level EN→JP production with reader sentence on the back when mining from text.',
    { front: ['meaning'], back: ['term', 'reading', 'sentence'], frontLang: 'en', backLang: 'ja' },
    'JP Study::N3',
    { syncQuery: 'deck:"JP Study::N3"', jlptTarget: 'N3', newPerDay: 20, thresholds: THRESH },
    FIELD_PACKS.enJaProduction,
  ),

  'seed-en-n1': seed(
    'seed-en-n1',
    'N1 Advanced (EN)',
    'Advanced EN→JP for N1 rare vocab. Meaning front, full kanji stack back.',
    { front: ['meaning'], back: ['term', 'reading', 'sentence'], frontLang: 'en', backLang: 'ja' },
    'JP Study::N1',
    { syncQuery: 'deck:"JP Study::N1"', jlptTarget: 'N1', newPerDay: 10, thresholds: THRESH },
    FIELD_PACKS.enJaProduction,
  ),

  'seed-ru-production': seed(
    'seed-ru-production',
    'Russian Production',
    'Russian gloss front, Japanese term + reading back. Expression fallback when Tatoeba is unavailable.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::RU Production',
    { syncQuery: 'deck:"JP Study::RU Production"', thresholds: THRESH },
    FIELD_PACKS.ruJaProduction,
  ),

  'seed-ru-examples': seed(
    'seed-ru-examples',
    'Russian Examples',
    'Tatoeba-driven: Russian example on front, Japanese examples + headword on back.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::RU Examples',
    { syncQuery: 'deck:"JP Study::RU Examples"', thresholds: THRESH },
    FIELD_PACKS.ruExamples,
  ),

  'seed-ru-pairs': seed(
    'seed-ru-pairs',
    'RU / JA Example Pairs',
    'Interleaved pairs on one face: Russian sentence 1, Japanese sentence 1, then pair 2.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::RU Pairs',
    { syncQuery: 'deck:"JP Study::RU Pairs"', thresholds: THRESH },
    FIELD_PACKS.ruPairs,
  ),

  'seed-ru-ex-fallback': seed(
    'seed-ru-ex-fallback',
    'RU Example + Expression Fallback',
    'Tries Russian Tatoeba examples first; if none exist, mines RU expression front / JA expression back automatically.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::RU Smart Fallback',
    { syncQuery: 'deck:"JP Study::RU Smart Fallback"', thresholds: THRESH },
    FIELD_PACKS.ruExFallback,
  ),

  'seed-en-examples': seed(
    'seed-en-examples',
    'English Examples',
    'English Tatoeba example on front, Japanese example + word on back.',
    { front: ['meaning'], back: ['term', 'reading'], frontLang: 'en', backLang: 'ja' },
    'JP Study::EN Examples',
    { syncQuery: 'deck:"JP Study::EN Examples"', thresholds: THRESH },
    FIELD_PACKS.enExamples,
  ),

  'seed-en-pairs': seed(
    'seed-en-pairs',
    'EN / JA Example Pairs',
    'Interleaved English + Japanese example pairs on the front; headword on the back.',
    { front: ['meaning'], back: ['term', 'reading'], frontLang: 'en', backLang: 'ja' },
    'JP Study::EN Pairs',
    { syncQuery: 'deck:"JP Study::EN Pairs"', thresholds: THRESH },
    FIELD_PACKS.enPairs,
  ),

  'seed-context-cloze': seed(
    'seed-context-cloze',
    'Reader Cloze',
    'Mines the sentence you clicked from the reader. Cloze fields split around the word when mapped.',
    { front: ['sentence'], back: ['term', 'reading', 'meaning'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Cloze',
    { syncQuery: 'deck:"JP Study::Cloze"', thresholds: THRESH },
    FIELD_PACKS.cloze,
  ),

  'seed-sentence-mine': seed(
    'seed-sentence-mine',
    'Sentence Mining',
    'Full reader context sentence on the back; word on the front. Ideal for novel/manga mining.',
    { front: ['term'], back: ['reading', 'meaning', 'sentence'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Sentences',
    { syncQuery: 'deck:"JP Study::Sentences"', thresholds: THRESH },
    FIELD_PACKS.jaEnClassic,
  ),

  'seed-reading-first': seed(
    'seed-reading-first',
    'Reading First',
    'Kana reading on the front — trains pronunciation before kanji recall.',
    { front: ['reading'], back: ['term', 'meaning'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Reading',
    { syncQuery: 'deck:"JP Study::Reading"', thresholds: THRESH },
    FIELD_PACKS.readingFirst,
  ),

  'seed-kanji-front': seed(
    'seed-kanji-front',
    'Kanji Only Front',
    'Kanji alone on front; reading + meaning on back. Strict kanji recognition.',
    { front: ['term'], back: ['reading', 'meaning'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Kanji',
    { syncQuery: 'deck:"JP Study::Kanji"', jlptTarget: 'N2', thresholds: THRESH },
    FIELD_PACKS.kanjiFront,
  ),

  'seed-minimal': seed(
    'seed-minimal',
    'Minimal',
    'Just the word and a one-line gloss. Fastest cards for cramming.',
    { front: ['term'], back: ['meaning'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Minimal',
    { syncQuery: 'deck:"JP Study::Minimal"', thresholds: THRESH },
    FIELD_PACKS.minimal,
    { pipeline: 'jmdict-jisho' },
    CARD_CSS_COMPACT,
  ),

  'seed-audio': seed(
    'seed-audio',
    'Audio Mining',
    'Headword plus native audio on the back. Add {audio} to your field mapping.',
    { front: ['term'], back: ['reading', 'audio'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Audio',
    { syncQuery: 'deck:"JP Study::Audio"', thresholds: THRESH },
    FIELD_PACKS.audio,
  ),

  'seed-frequency': seed(
    'seed-frequency',
    'Frequency Tracker',
    'Shows corpus frequency rank on the back when a frequency dictionary is installed.',
    { front: ['term'], back: ['reading', 'frequency'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Frequency',
    { syncQuery: 'deck:"JP Study::Frequency"', thresholds: THRESH },
    FIELD_PACKS.frequency,
  ),

  'seed-image-mine': seed(
    'seed-image-mine',
    'Screenshot Mining',
    'Grabs clipboard image into the card. Enable capture image when mining or map {image}.',
    { front: ['term'], back: ['reading', 'image'], frontLang: 'ja', backLang: 'en' },
    'JP Study::Images',
    { syncQuery: 'deck:"JP Study::Images"', thresholds: THRESH },
    FIELD_PACKS.image,
  ),

  'seed-chinese-bridge': seed(
    'seed-chinese-bridge',
    'Chinese Bridge',
    'Uses CC-CEDICT for lookups when studying kanji with Chinese background.',
    { front: ['term'], back: ['reading', 'meaning'], frontLang: 'zh', backLang: 'en' },
    'JP Study::ZH Bridge',
    { syncQuery: 'deck:"JP Study::ZH Bridge"', thresholds: THRESH },
    FIELD_PACKS.chinese,
    { pipeline: 'cedict-local' },
  ),

  'seed-zh-en': seed(
    'seed-zh-en',
    'Chinese → English',
    'Chinese headword on the front, pinyin + English gloss on the back. Uses CC-CEDICT lookups.',
    { front: ['term'], back: ['reading', 'meaning'], frontLang: 'zh', backLang: 'en' },
    'JP Study::ZH to EN',
    { syncQuery: 'deck:"JP Study::ZH to EN"', thresholds: THRESH },
    FIELD_PACKS.zhEn,
    { pipeline: 'cedict-local' },
  ),

  'seed-zh-ja': seed(
    'seed-zh-ja',
    'Chinese → Japanese',
    'Chinese gloss on the front, Japanese kanji + reading on the back. For learners with Chinese background.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'zh', backLang: 'ja' },
    'JP Study::ZH to JP',
    { syncQuery: 'deck:"JP Study::ZH to JP"', thresholds: THRESH },
    FIELD_PACKS.zhJaProduction,
    { pipeline: 'cedict-local' },
  ),

  'seed-zh-examples': seed(
    'seed-zh-examples',
    'Chinese Examples',
    'Chinese Tatoeba example on the front, Japanese example + headword on the back.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'zh', backLang: 'ja' },
    'JP Study::ZH Examples',
    { syncQuery: 'deck:"JP Study::ZH Examples"', thresholds: THRESH },
    FIELD_PACKS.zhJaExamples,
    { pipeline: 'cedict-local' },
  ),

  'seed-zh-pairs': seed(
    'seed-zh-pairs',
    'ZH / JA Example Pairs',
    'Interleaved Chinese + Japanese example pairs on the front; headword on the back.',
    { front: ['translation'], back: ['term', 'reading'], frontLang: 'zh', backLang: 'ja' },
    'JP Study::ZH Pairs',
    { syncQuery: 'deck:"JP Study::ZH Pairs"', thresholds: THRESH },
    FIELD_PACKS.zhJaPairs,
    { pipeline: 'cedict-local' },
  ),

  'seed-trilingual': seed(
    'seed-trilingual',
    'RU + EN + JA',
    'Russian front with English meaning and Japanese back — three-language exposure on one card.',
    { front: ['translation'], back: ['term', 'reading', 'meaning'], frontLang: 'ru', backLang: 'ja' },
    'JP Study::Trilingual',
    { syncQuery: 'deck:"JP Study::Trilingual"', thresholds: THRESH },
    FIELD_PACKS.trilingual,
  ),

  'seed-speed-review': seed(
    'seed-speed-review',
    'Speed Review',
    'Tiny cards for queue clearing: word front, reading-only back.',
    { front: ['term'], back: ['reading'], frontLang: 'ja', backLang: 'ja' },
    'JP Study::Speed',
    { syncQuery: 'deck:"JP Study::Speed"', newPerDay: 50, thresholds: { familiar: 1, known: 7 } },
    FIELD_PACKS.speed,
    { pipeline: 'jmdict-jisho' },
    CARD_CSS_COMPACT,
  ),
};
