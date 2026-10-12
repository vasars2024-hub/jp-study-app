/**
 * What the optional AI helpers for watching and reading share (docs/AI_AUDIT.md
 * N9-N12 and the Study command fallback):
 *
 * - `mediaBrief`      episode / video summary plus comprehension questions
 * - `linePick`        the most teachable of the deterministic i+1 lines, with a reason
 * - `readerExplain`   "Explain this i+1 sentence" in the immersion reader
 * - `readerSimplify`  "Simplify this paragraph" when known-word coverage is low
 * - `vnExplain`       explain the current visual-novel line with its context
 * - `vnTranslate`     a context-aware translation for a line that has none
 * - `studyCommand`    free text to one of the Study workspace's typed operations
 *
 * Every one is ADDITIVE: the surface it sits on works exactly as before without
 * it, each has a deterministic fallback, each runs on the offline model when that
 * is the configured engine, and a cloud provider is used only when the feature's
 * own opt-in in Settings > AI allows it. Replies use the shared
 * `AiStudyResponse` shape and the shared error codes.
 *
 * Pure and framework-free: the renderer and main both read it.
 */
import type { StudyLang } from './studyLang';

export type AiImmerseFeature =
  | 'mediaBrief'
  | 'linePick'
  | 'readerExplain'
  | 'readerSimplify'
  | 'vnExplain'
  | 'vnTranslate'
  | 'studyCommand';

/** Which script a line of the study language is written in, to catch an answer in the wrong language. */
const STUDY_SCRIPT: Readonly<Record<StudyLang, RegExp>> = {
  ja: /[぀-ヿ㐀-鿿豈-﫿]/u,
  zh: /[㐀-鿿豈-﫿]/u,
  ru: /[Ѐ-ӿ]/u,
};

/** True when `text` contains the study language's script at all. */
export function immerseTextInStudyLang(text: string, lang: StudyLang): boolean {
  return STUDY_SCRIPT[lang].test(text);
}

const LEVEL_SCALE: Readonly<Record<StudyLang, string>> = {
  ja: 'JLPT N5-N1',
  zh: 'HSK 1-6',
  ru: 'CEFR A1-C2',
};

/** The level scale a prompt names for the study language. */
export function immerseLevelScale(lang: StudyLang): string {
  return LEVEL_SCALE[lang];
}

/** A language code the prompt can name ("en", "de", "pt-BR"). */
export function immerseLanguageName(code: string): string {
  const clean = /^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(code) ? code : 'en';
  try {
    return new Intl.DisplayNames(['en'], { type: 'language' }).of(clean) ?? 'English';
  } catch {
    return clean === 'ja' ? 'Japanese' : clean === 'zh' ? 'Chinese' : clean === 'ru' ? 'Russian' : 'English';
  }
}

/** The learner's level as one short line, derived from the known-word share (never invented). */
export function immerseLevelLine(knownPct: number | null | undefined, lang: StudyLang): string {
  if (typeof knownPct !== 'number' || !Number.isFinite(knownPct)) return `unknown (${immerseLevelScale(lang)} scale)`;
  const pct = Math.round(Math.min(100, Math.max(0, knownPct)));
  const band = pct >= 95 ? 'easy for them' : pct >= 90 ? 'comfortable' : pct >= 80 ? 'a stretch' : 'hard';
  return `knows ${pct}% of the words in this text (${band}); use ${immerseLevelScale(lang)} terms`;
}
