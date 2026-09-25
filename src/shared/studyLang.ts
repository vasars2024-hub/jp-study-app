// The study language, as one pure module shared by main and renderer.
//
// Gum studies three languages on equal terms: Japanese, Chinese (Simplified and
// Traditional script) and Russian. Every surface that needs to know "which
// language is this content in" reads the value through these helpers, so an
// unknown or legacy value degrades the same way everywhere instead of each call
// site hand-rolling `lang === 'zh' ? 'zh' : 'ja'` (which silently turned Russian
// into Japanese).
//
// No Electron / DOM imports: main (`main/studyLanguage.ts`) and the renderer
// (`renderer/studyEnvironment.ts`) both consume it.

import type { StudyLang } from './levelScale';

export type { StudyLang };

/** Every study language, in the order the switcher shows them. */
export const STUDY_LANGS: readonly StudyLang[] = ['ja', 'zh', 'ru'];

/** The language a fresh profile studies. */
export const DEFAULT_STUDY_LANG: StudyLang = 'ja';

export function isStudyLang(value: unknown): value is StudyLang {
  return value === 'ja' || value === 'zh' || value === 'ru';
}

/**
 * A stored or foreign value → a study language. Accepts BCP-47-ish tags
 * (`zh-Hant`, `ru-RU`, `jpn`, `chi`, `rus`) so a subtitle track or a book's
 * `dc:language` can be passed straight in.
 */
export function normalizeStudyLang(value: unknown, fallback: StudyLang = DEFAULT_STUDY_LANG): StudyLang {
  const lang = studyLangFromTag(value);
  return lang ?? fallback;
}

/** A language tag → the study language it names, or null when it names none of them. */
export function studyLangFromTag(value: unknown): StudyLang | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/_/g, '-');
  if (!tag) return null;
  const primary = tag.split('-')[0];
  if (primary === 'ja' || primary === 'jp' || primary === 'jpn') return 'ja';
  if (
    primary === 'zh' || primary === 'cmn' || primary === 'yue' || primary === 'chi' || primary === 'zho'
    || primary === 'chs' || primary === 'cht'
  ) return 'zh';
  if (primary === 'ru' || primary === 'rus') return 'ru';
  return null;
}

/** Which script a Chinese learner reads. */
export type ChineseScript = 'simplified' | 'traditional';

/**
 * The BCP-47 tag content in a study language should carry in a `lang`
 * attribute. Chinese carries its script so the browser picks the right glyph
 * set (Simplified and Traditional share code points with Japanese kanji and
 * render with the wrong shapes under `lang="ja"`).
 */
export function studyLangTag(lang: StudyLang, script: ChineseScript = 'simplified'): string {
  if (lang === 'zh') return script === 'traditional' ? 'zh-Hant' : 'zh-Hans';
  return lang;
}

/** The language's own name for itself, for switchers and column headers. Not translated by design. */
export const STUDY_LANG_NATIVE_NAME: Readonly<Record<StudyLang, string>> = {
  ja: '日本語',
  zh: '中文',
  ru: 'Русский',
};

/** i18n key of the language's name in the UI language (e.g. "Russian" / "ロシア語"). */
export const STUDY_LANG_NAME_KEY: Readonly<Record<StudyLang, string>> = {
  ja: 'settings.study.lang.ja',
  zh: 'settings.study.lang.zh',
  ru: 'settings.study.lang.ru',
};

/** i18n key of "{lang} subtitles"; pass the name from `STUDY_LANG_NAME_KEY`. */
export const STUDY_LANG_SUBTITLES_KEY = 'settings.study.lang.subtitles';

/**
 * i18n key of the language's reading aid: furigana over kanji, pinyin over
 * hanzi, stress marks on Russian words. The toggles that switch it on and off
 * are named by it, so a Chinese learner is not offered "Furigana".
 */
export const STUDY_LANG_READING_AID_KEY: Readonly<Record<StudyLang, string>> = {
  ja: 'settings.study.lang.readingAid.ja',
  zh: 'settings.study.lang.readingAid.zh',
  ru: 'settings.study.lang.readingAid.ru',
};

/** Whisper's language name for the study language. */
export const WHISPER_LANGUAGE: Readonly<Record<StudyLang, string>> = {
  ja: 'japanese',
  zh: 'chinese',
  ru: 'russian',
};

/** ISO 639-3 / Tatoeba code for the study language. */
export const TATOEBA_LANG: Readonly<Record<StudyLang, string>> = {
  ja: 'jpn',
  zh: 'cmn',
  ru: 'rus',
};

/** The level scale a language is measured on. */
export const STUDY_LANG_LEVEL_SCALE: Readonly<Record<StudyLang, 'jlpt' | 'hsk' | 'cefr'>> = {
  ja: 'jlpt',
  zh: 'hsk',
  ru: 'cefr',
};
