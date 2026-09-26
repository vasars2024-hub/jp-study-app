// A text sample reduced to what scoring needs: its distinct vocabulary words
// and how often each occurs.
//
// The Library scores every book twice — a "% known" (comprehensibility) and an
// exam-band estimate (JLPT / HSK / CEFR) — and both only ever looked at content
// words and their counts. Tokenizing is the expensive part (kuromoji ran on a
// 40,000-character sample per book, on the UI thread, every time the Library
// opened), so it is done once per book, off the UI thread, and this compact
// profile is what gets cached and scored. Scoring a profile is a few hundred
// map lookups.
//
// Pure: no DOM, no tokenizer. The tokenizing half lives in the worker
// (`renderer/workers/studyWords.worker.ts`), the knowledge lookups in the
// renderer (`renderer/bookProfiles.ts`).

import type { StudyLang } from './studyLang';
import type { ScoredToken } from './comprehensibility';
import { isVocabularySegment, segmentStudyText } from './studySegmentation';
import { stripRussianStress } from './russianMorphology';

/** Profile format version; bump when the word keys change meaning. */
export const STUDY_WORD_PROFILE_VERSION = 1;

/**
 * Characters of a book sampled for its scores. The first ~2k characters of
 * running text give a stable "% known" and band estimate; 40k took seconds per
 * book and kept the token arrays resident.
 */
export const BOOK_SAMPLE_CHARS = 2_000;

export interface StudyWordProfile {
  v: number;
  /** The language the sample was segmented as. */
  lang: StudyLang;
  /**
   * Distinct content words: `[word, occurrences, proper]`. Japanese words are
   * kuromoji lemmas; Chinese and Russian are the words as written (Russian
   * lower-cased, stress marks removed) — their knowledge key is resolved at
   * scoring time, because it depends on what the learner has graded.
   */
  words: Array<[string, number, 0 | 1]>;
}

/** The token fields the profile is built from (a `JpToken` fits). */
export interface ProfileToken {
  lemma: string;
  surface?: string;
  content: boolean;
  proper?: boolean;
}

/** Aggregate tokens into a profile. Non-content tokens are dropped. */
export function buildStudyWordProfile(tokens: Iterable<ProfileToken>, lang: StudyLang): StudyWordProfile {
  const counts = new Map<string, [number, 0 | 1]>();
  for (const token of tokens) {
    if (!token.content) continue;
    const word = token.lemma;
    if (!word) continue;
    const seen = counts.get(word);
    if (seen) seen[0] += 1;
    else counts.set(word, [1, token.proper ? 1 : 0]);
  }
  return {
    v: STUDY_WORD_PROFILE_VERSION,
    lang,
    words: [...counts].map(([word, [count, proper]]) => [word, count, proper]),
  };
}

/**
 * Chinese and Russian words of `text` as profile tokens (ICU segmentation, the
 * same rule `studyTokens` uses). Japanese needs kuromoji and is not handled here.
 */
export function segmentedProfileTokens(text: string, lang: StudyLang): ProfileToken[] {
  const out: ProfileToken[] = [];
  for (const part of segmentStudyText(text, lang)) {
    if (!part.wordLike || !isVocabularySegment(part.text, lang)) continue;
    const word = lang === 'ru'
      ? stripRussianStress(part.text.normalize('NFKC').trim().toLowerCase())
      : part.text;
    if (word) out.push({ lemma: word, content: true });
  }
  return out;
}

/**
 * The profile as scoring tokens, one per occurrence, with each word mapped to
 * the key the knowledge store knows it by.
 */
export function* profileScoredTokens(
  profile: StudyWordProfile,
  keyFor: (word: string) => string = (word) => word,
): Generator<ScoredToken> {
  for (const [word, count, proper] of profile.words) {
    const token: ScoredToken = { lemma: proper ? word : keyFor(word), content: true, proper: proper === 1 };
    for (let i = 0; i < count; i++) yield token;
  }
}

/** Lemmas of every non-proper occurrence, for the exam-band estimate. */
export function profileLemmas(profile: StudyWordProfile, keyFor: (word: string) => string = (word) => word): string[] {
  const out: string[] = [];
  for (const [word, count, proper] of profile.words) {
    if (proper) continue;
    const key = keyFor(word);
    for (let i = 0; i < count; i++) out.push(key);
  }
  return out;
}

/** Whether a stored value is a profile this build can read. */
export function isStudyWordProfile(value: unknown): value is StudyWordProfile {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<StudyWordProfile>;
  return v.v === STUDY_WORD_PROFILE_VERSION
    && (v.lang === 'ja' || v.lang === 'zh' || v.lang === 'ru')
    && Array.isArray(v.words);
}
