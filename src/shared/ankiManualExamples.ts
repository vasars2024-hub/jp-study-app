/**
 * Example content for the Anki manual-card form's placeholders, per study
 * language.
 *
 * The form used to show a Japanese word, its kana and a Japanese sentence to
 * every learner, with an English gloss and a Russian translation beside them,
 * whatever was being studied and whatever language the UI was in. The term,
 * reading and sentence are study-language CONTENT, so they live here, chosen by
 * the profile's study language (and Chinese script); the gloss and the
 * translation are in the learner's own language and come from the UI catalog.
 *
 * One word across the three languages — "to study" — so the placeholders show
 * the same card however it is filled.
 */
import type { StudyLang } from './levelScale';

export interface AnkiManualExample {
  term: string;
  /** What the reading field holds for this language: kana, pinyin, or the word with its stress marked. */
  reading: string;
  sentence: string;
}

const EXAMPLES: Record<StudyLang, AnkiManualExample> = {
  ja: { term: '勉強', reading: 'べんきょう', sentence: '毎日日本語を勉強します。' },
  zh: { term: '学习', reading: 'xuéxí', sentence: '我每天学习中文。' },
  ru: { term: 'учиться', reading: 'учи́ться', sentence: 'Я каждый день учусь в библиотеке.' },
};

/** The same Chinese example in Traditional characters, for a learner who studies that script. */
const ZH_TRADITIONAL: AnkiManualExample = { term: '學習', reading: 'xuéxí', sentence: '我每天學習中文。' };

export function ankiManualExample(lang: StudyLang, script?: 'simplified' | 'traditional'): AnkiManualExample {
  if (lang === 'zh' && script === 'traditional') return ZH_TRADITIONAL;
  return EXAMPLES[lang] ?? EXAMPLES.ja;
}
