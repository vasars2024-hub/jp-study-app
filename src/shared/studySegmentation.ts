// Word segmentation for study-language text that kuromoji does not cover.
//
// Japanese keeps its morphological analyser (kuromoji, `renderer/tokenizer.ts`):
// it gives readings, lemmas and parts of speech. Chinese and Russian are split
// with ICU's word segmenter (`Intl.Segmenter`), which ships in Electron and
// Node with full ICU: its Chinese dictionary gives 今天天气 → 今天 / 天气, and
// its Russian rules give words with their hyphens and apostrophes intact. A
// Russian word is then grouped with the other forms of the same word by a
// light stem (`russianStem`) when no dictionary is there to name its lemma.
//
// Pure: no DOM, no Electron. Main and renderer both call it.

import type { StudyLang } from './levelScale';
import { russianStem, stripRussianStress } from './russianMorphology';

export interface StudySegment {
  text: string;
  start: number;
  end: number;
  /** A word (as opposed to spaces and punctuation). */
  wordLike: boolean;
}

type SegmenterCtor = new (
  locale: string,
  options: { granularity: 'word' },
) => { segment(text: string): Iterable<{ segment: string; index: number; isWordLike?: boolean }> };

function segmenter(): SegmenterCtor | null {
  const ctor = (Intl as unknown as { Segmenter?: SegmenterCtor }).Segmenter;
  return typeof ctor === 'function' ? ctor : null;
}

const WORD_CHAR = /[\p{L}\p{M}\p{N}]/u;
const HAN = /\p{Script=Han}/u;

/** Without ICU: Han one character at a time, other letters in runs. */
function fallbackSegments(text: string): StudySegment[] {
  const out: StudySegment[] = [];
  let index = 0;
  for (const match of text.matchAll(/\p{Script=Han}|[\p{L}\p{M}\p{N}'’-]+|[^\p{L}\p{M}\p{N}]+/gu)) {
    const part = match[0];
    const start = match.index ?? index;
    out.push({ text: part, start, end: start + part.length, wordLike: WORD_CHAR.test(part) });
    index = start + part.length;
  }
  return out;
}

/** The ICU locale for a study language (`zh-Hant` keeps Traditional segmentation rules). */
export function segmenterLocale(lang: StudyLang | string): string {
  if (lang === 'zh' || lang === 'zh-Hans') return 'zh-Hans';
  if (lang === 'zh-Hant') return 'zh-Hant';
  return lang;
}

/** Split a line of study-language text into words and the text between them. */
export function segmentStudyText(text: string, lang: StudyLang | string): StudySegment[] {
  const Segmenter = segmenter();
  if (!Segmenter) return fallbackSegments(text);
  try {
    const parts = new Segmenter(segmenterLocale(lang), { granularity: 'word' });
    return [...parts.segment(text)].map((part) => ({
      text: part.segment,
      start: part.index,
      end: part.index + part.segment.length,
      wordLike: Boolean(part.isWordLike),
    }));
  } catch {
    return fallbackSegments(text);
  }
}

/** Only the words, in order. */
export function studyWords(text: string, lang: StudyLang | string): string[] {
  return segmentStudyText(text, lang).filter((part) => part.wordLike).map((part) => part.text);
}

/**
 * The key a word is counted, known and mined under when no dictionary names its
 * lemma: Russian forms of one word share a stem (книга / книги / книгу), Chinese
 * and Japanese words are their own key. Stress marks never matter.
 */
export function studyWordKey(word: string, lang: StudyLang | string): string {
  if (lang === 'ru') return russianStem(word);
  return stripRussianStress(word.normalize('NFKC').trim().toLowerCase());
}

/** Whether a segment is worth counting as vocabulary (has a letter, not only digits). */
export function isVocabularySegment(text: string, lang: StudyLang | string): boolean {
  if (lang === 'zh' || lang === 'zh-Hans' || lang === 'zh-Hant') return HAN.test(text);
  return /\p{L}/u.test(text);
}
