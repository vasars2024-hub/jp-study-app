/**
 * Words of study-language text, for the surfaces that count and colour them —
 * comprehensibility scores and the reader's known-word highlight. Japanese is
 * kuromoji (`tokenizer.ts`); Chinese and Russian are ICU words
 * (`shared/studySegmentation`). Each token carries the key the knowledge store
 * knows it by.
 */
import { tokenizeSync, tokenizerReady, type JpToken } from './tokenizer';
import { getLevel } from './knownWords';
import { getStudyLang } from './studyEnvironment';
import type { StudyLang } from '../shared/studyLang';
import { russianLemmaCandidates, stripRussianStress } from '../shared/russianMorphology';
import { isVocabularySegment, segmentStudyText, studyWordKey } from '../shared/studySegmentation';

/**
 * The knowledge-store key for a word. Russian: whichever of its likely
 * dictionary forms the learner already graded (книги → книга once книга is
 * known), else the stem all its forms share — so a word marked known is
 * recognised in every case it appears in. Chinese: the word.
 */
export function knownKeyFor(word: string, lang: StudyLang, levelOf: (key: string) => number = getLevel): string {
  if (lang !== 'ru') return word;
  const plain = stripRussianStress(word.normalize('NFKC').trim().toLowerCase());
  let best = plain;
  let bestLevel = levelOf(plain);
  for (const candidate of russianLemmaCandidates(plain)) {
    const level = levelOf(candidate);
    if (level > bestLevel) {
      best = candidate;
      bestLevel = level;
    }
  }
  if (bestLevel > 0) return best;
  // Unknown in every form: the stem every form shares, which is also the key a
  // grade from the dictionary pop-up lands under (`gradeKeyFor`).
  return studyWordKey(plain, 'ru');
}

/**
 * The key a grade is stored under: the form the learner already graded when
 * there is one, else — for Russian — the stem every form of the word shares, so
 * grading `книги` also colours `книгу` and `книгой`.
 */
export function gradeKeyFor(word: string, lang: StudyLang, levelOf: (key: string) => number = getLevel): string {
  if (lang !== 'ru') return word;
  return knownKeyFor(word, lang, levelOf);
}

/** Tokens of `text` in `lang`, JpToken-shaped so existing scorers read them unchanged. */
export function studyTokens(text: string, lang: StudyLang = getStudyLang()): JpToken[] {
  if (lang === 'ja') return tokenizeSync(text);
  return segmentStudyText(text, lang).map((part) => {
    const content = part.wordLike && isVocabularySegment(part.text, lang);
    return {
      surface: part.text,
      lemma: content ? knownKeyFor(part.text, lang) : part.text,
      content,
      proper: false,
      pos: '',
      posDetail: '',
    };
  });
}

/** Whether `studyTokens` can run now: Japanese needs kuromoji built; the others need nothing. */
export function studyTokensReady(lang: StudyLang = getStudyLang()): boolean {
  return lang !== 'ja' || tokenizerReady();
}

/** The study language's text in a string: kana/kanji, hanzi, or Cyrillic. */
export function hasStudyText(text: string, lang: StudyLang = getStudyLang()): boolean {
  if (lang === 'ru') return /\p{Script=Cyrillic}/u.test(text);
  if (lang === 'zh') return /\p{Script=Han}/u.test(text);
  return /[぀-ヿ㐀-鿿々]/.test(text);
}
