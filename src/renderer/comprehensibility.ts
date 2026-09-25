// Renderer glue for the comprehensibility score: tokenizes text with kuromoji
// and scores it against the user's knowledge store. The scoring math itself is
// the pure shared/comprehensibility.ts; this file only supplies the two things
// that can't live in shared — the tokenizer and knownWords.

import { getTokenizer } from './tokenizer';
import { getLevel } from './knownWords';
import { getStudyLang } from './studyEnvironment';
import { studyTokens } from './studyTokens';
import type { StudyLang } from '../shared/studyLang';
import {
  scoreComprehensibility,
  type ComprehensibilityScore,
  type ScoreOptions,
} from '../shared/comprehensibility';

export type { ComprehensibilityScore } from '../shared/comprehensibility';
export { knownPercent } from '../shared/comprehensibility';

// Scoring is a one-shot op on explicit user action (opening/previewing a
// candidate), never during scroll/drag — but a whole chapter can still be tens
// of thousands of characters, so cap the tokenized span. The first N characters
// are a representative sample for a "% known" estimate and keep kuromoji snappy
// (the CLAUDE.md no-UI-jank rule).
const MAX_SCORE_CHARS = 60_000;

/**
 * Tokenize `text` and return its comprehensibility for the current user.
 * Resolves the tokenizer first (no-op once built). Returns a zero score for
 * empty/blank input.
 */
export async function scoreTextComprehensibility(
  text: string,
  opts?: ScoreOptions,
  lang: StudyLang = getStudyLang(),
): Promise<ComprehensibilityScore> {
  const trimmed = (text ?? '').slice(0, MAX_SCORE_CHARS);
  if (!trimmed.trim()) {
    return scoreComprehensibility([], getLevel, opts);
  }
  // Chinese and Russian are split by ICU and need no analyser build; a Chinese
  // text run through kuromoji was scored as Japanese words.
  if (lang === 'ja') {
    try {
      await getTokenizer();
    } catch {
      // Tokenizer unavailable → no honest score to give.
      return scoreComprehensibility([], getLevel, opts);
    }
  }
  const tokens = studyTokens(trimmed, lang).map((t) => ({
    lemma: t.lemma,
    content: t.content,
    proper: t.proper,
  }));
  return scoreComprehensibility(tokens, getLevel, opts);
}
