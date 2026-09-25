// The study language's reading aid, as data: furigana over kanji (Japanese,
// from kuromoji in the renderer), pinyin over hanzi (Chinese, CC-CEDICT in
// main) and stress marks on Russian words (the Wiktionary extract in main).
//
// Main answers "what is the reading of these words"; the renderer segments
// the line (`studySegmentation.ts`) and draws. Kept pure so both halves and the
// tests share one definition of the wire shape.

import { applyRussianStress } from './russianMorphology';

/** The languages main supplies readings for. Japanese readings come from kuromoji. */
export type ReadingAidLang = 'zh' | 'ru';

/**
 * Word → reading. Chinese: one tone-marked syllable per character of the word
 * (`今天` → `['jīn', 'tiān']`, '' where a character has none). Russian: the
 * stressed spelling as a single element (`книги` → `['кни́ги']`). A word with no
 * known reading is absent.
 */
export type ReadingAidResult = Record<string, string[]>;

export const MAX_READING_AID_WORDS = 400;
export const MAX_READING_AID_WORD_CHARS = 32;

/** A request's words, deduplicated and bounded (they arrive from a renderer). */
export function cleanReadingAidWords(words: unknown): string[] {
  if (!Array.isArray(words)) return [];
  const out = new Set<string>();
  for (const word of words) {
    if (typeof word !== 'string') continue;
    const trimmed = word.trim();
    if (!trimmed || [...trimmed].length > MAX_READING_AID_WORD_CHARS) continue;
    out.add(trimmed);
    if (out.size >= MAX_READING_AID_WORDS) break;
  }
  return [...out];
}

/** One ruby pair: a base character run and its reading ('' when it needs none). */
export interface RubyPair {
  base: string;
  rt: string;
}

/**
 * A Chinese word and its per-character pinyin → ruby pairs, one per character.
 * Characters with no syllable (punctuation, Latin) get an empty `rt`.
 */
export function pinyinRubyPairs(word: string, syllables: readonly string[] | undefined): RubyPair[] {
  const chars = [...word];
  return chars.map((base, i) => ({ base, rt: syllables?.[i] ?? '' }));
}

/** The word as it should be drawn with the Russian reading aid on. */
export function stressedRussian(word: string, reading: readonly string[] | undefined): string {
  const stressed = reading?.[0];
  return stressed ? applyRussianStress(word, stressed) : word;
}

/** Vowels, for "does this Russian word need a stress mark at all". */
const RU_VOWELS = /[аеёиоуыэюя]/giu;

export function russianVowelCount(word: string): number {
  return word.match(RU_VOWELS)?.length ?? 0;
}
