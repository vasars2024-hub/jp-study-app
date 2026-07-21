// Where the Arena's language content comes from.
//
// The games used to run entirely on the bundled tables in data/gradedSentences.
// That made every player drill the same 35 sentences regardless of what they
// actually study. This module makes the user's own material the primary source:
//
//   vocab      ← the words in a level slot's deck (N5…N1, N0), with the reading
//                and meaning supplied by the matching mined flashcard
//   sentences  ← mined flashcards that captured the sentence a word was found in
//
// The key observation is that a mined card is ALREADY a cloze: it stores the
// word, its meaning, and the sentence it came from. Blanking `word` out of
// `sentence` and showing `meaning` as the prompt gives a fill-in-the-blank
// where the hint is a real translation of exactly the missing word — no
// runtime translation, no AI, nothing to get wrong.
//
// Everything here is pure: callers pass the deck and the word list in. The
// renderer glue that reads the stores lives in contentStore.ts.

import type { LevelTier } from '../../shared/levelScale';

/** The subset of DeckFlashcard the Arena needs. */
export interface SourceCard {
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
}

export interface VocabItem {
  word: string;
  reading: string;
  meaning: string;
  level: LevelTier;
}

export interface ClozeItem {
  /** The sentence with the target word replaced by the blank. */
  masked: string;
  /** What the player must type, in Japanese. */
  answer: string;
  /** Reading of the answer — accepted as an alternative, and shown on reveal. */
  reading: string;
  /** The translated meaning of the missing word: the only clue given. */
  hint: string;
  /** Full original sentence, revealed after answering. */
  sentence: string;
}

/** The blank rendered in a cloze sentence. */
export const CLOZE_BLANK = '＿＿＿';

function clean(value: string | undefined): string {
  return (value ?? '').trim();
}

/**
 * Usable cards only: a card with no word or no meaning can't drive any game,
 * and a meaning identical to the word teaches nothing.
 */
export function isUsableCard(card: SourceCard): boolean {
  const word = clean(card.word);
  const meaning = clean(card.meaning);
  return !!word && !!meaning && word !== meaning;
}

/**
 * Build the vocabulary pool for a level: the words in that level's list, joined
 * to the deck for readings and meanings.
 *
 * `allowedWords` is the level slot's word list. A word only reaches a game if
 * BOTH sides have it — the list says it belongs to this level, the deck says
 * what it means. Passing null means "no list bound to this slot", in which case
 * the whole deck is eligible (better than showing the player nothing).
 *
 * `lemmaOf` lets the caller supply tokenizer-backed lemmatization; the level
 * lists store raw expressions, so 食べる in the list and 食べた on the card must
 * still meet. Defaults to identity for pure tests.
 */
export function buildVocabPool(
  cards: readonly SourceCard[],
  allowedWords: readonly string[] | null,
  level: LevelTier,
  lemmaOf: (s: string) => string = (s) => s,
): VocabItem[] {
  const allowed = allowedWords ? new Set(allowedWords.map((w) => lemmaOf(clean(w)))) : null;
  const seen = new Set<string>();
  const out: VocabItem[] = [];
  for (const card of cards) {
    if (!isUsableCard(card)) continue;
    const word = clean(card.word);
    const lemma = lemmaOf(word);
    if (allowed && !allowed.has(lemma)) continue;
    if (seen.has(lemma)) continue;
    seen.add(lemma);
    out.push({ word, reading: clean(card.reading), meaning: clean(card.meaning), level });
  }
  return out;
}

/**
 * Replace `surface` in `sentence` with the blank. Returns null when the surface
 * isn't actually present — the caller must skip that card rather than serve a
 * sentence with nothing removed.
 *
 * Only the FIRST occurrence is blanked: masking every occurrence can delete the
 * answer's own context and turn a solvable sentence into a guess.
 */
export function maskSentence(sentence: string, surface: string): string | null {
  const text = clean(sentence);
  const target = clean(surface);
  if (!text || !target) return null;
  const at = text.indexOf(target);
  if (at < 0) return null;
  return text.slice(0, at) + CLOZE_BLANK + text.slice(at + target.length);
}

/**
 * Turn a mined card into a fill-in-the-blank.
 *
 * `surfaceIn` resolves which literal substring of the sentence to remove. The
 * card's `word` is a dictionary form but the sentence contains it conjugated
 * (word 食べる, sentence 食べました), so an exact substring match alone drops most
 * real mined cards. The renderer passes a tokenizer-backed resolver; the
 * default handles the already-exact case so this stays testable.
 */
export function clozeFromCard(
  card: SourceCard,
  surfaceIn: (sentence: string, word: string) => string | null = (sentence, word) =>
    sentence.includes(word) ? word : null,
): ClozeItem | null {
  if (!isUsableCard(card)) return null;
  const sentence = clean(card.sentence);
  const word = clean(card.word);
  if (!sentence) return null;
  // A sentence that is just the word carries no context to reason from.
  if (sentence === word) return null;
  const surface = surfaceIn(sentence, word);
  if (!surface) return null;
  const masked = maskSentence(sentence, surface);
  if (!masked) return null;
  return {
    masked,
    answer: surface,
    reading: clean(card.reading),
    hint: clean(card.meaning),
    sentence,
  };
}

/** Every card that can produce a cloze, in deck order. */
export function buildClozePool(
  cards: readonly SourceCard[],
  surfaceIn?: (sentence: string, word: string) => string | null,
): ClozeItem[] {
  const out: ClozeItem[] = [];
  const seen = new Set<string>();
  for (const card of cards) {
    const item = clozeFromCard(card, surfaceIn);
    if (!item || seen.has(item.sentence)) continue;
    seen.add(item.sentence);
    out.push(item);
  }
  return out;
}

/** Cards that carry a usable example sentence (for listening / recall games). */
export function buildSentencePool(cards: readonly SourceCard[]): SourceCard[] {
  const seen = new Set<string>();
  return cards.filter((card) => {
    if (!isUsableCard(card)) return false;
    const sentence = clean(card.sentence);
    if (!sentence || sentence === clean(card.word) || seen.has(sentence)) return false;
    seen.add(sentence);
    return true;
  });
}
