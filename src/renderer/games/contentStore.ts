// Renderer glue between the Arena and the user's own material.
//
// contentSource.ts is the pure logic; this reads the actual stores (the mined
// flashcard deck + the level-slot word lists) and supplies the kuromoji-backed
// resolvers those pure functions take as parameters.
//
// Fallback policy: when the user's deck can't fill a round, the games fall back
// to the bundled tables rather than locking. `usingFallback` lets the UI say so
// honestly instead of passing built-in content off as the player's own.

import { loadDeck } from '../flashcardDeck';
import { getSlotList } from '../levelLists';
import { tokenizeSync, tokenizerReady } from '../tokenizer';
import { slotsForLang, type LevelTier } from '../../shared/levelScale';
import { getStudyLang } from '../studyEnvironment';
import { normalizeStudyLang } from '../../shared/studyLang';
import { segmentStudyText, studyWordKey } from '../../shared/studySegmentation';
import {
  buildClozePool,
  buildVocabPool,
  buildSentencePool,
  type ClozeItem,
  type SourceCard,
  type VocabItem,
} from './contentSource';

/**
 * Reduce an expression to its lemma so list and deck entries meet: kuromoji's
 * lemma for Japanese, the shared stem for Russian (книга / книгу), the word
 * itself for Chinese.
 */
function lemmaOf(expr: string): string {
  const lang = getStudyLang();
  if (lang !== 'ja') return studyWordKey(expr, lang);
  if (!tokenizerReady()) return expr;
  try {
    const tokens = tokenizeSync(expr);
    return tokens.length === 1 ? tokens[0].lemma || expr : expr;
  } catch {
    return expr;
  }
}

/**
 * Find the literal substring of `sentence` to blank for `word`.
 *
 * Mined cards store the dictionary form while the sentence carries it
 * conjugated (word 食べる, sentence 食べました), so an exact match finds almost
 * nothing. Tokenize the sentence and take the surface of the token whose lemma
 * matches; fall back to an exact hit when the tokenizer isn't up yet.
 */
export function surfaceInSentence(sentence: string, word: string): string | null {
  if (sentence.includes(word)) return word;
  const lang = getStudyLang();
  if (lang !== 'ja') {
    // The inflected Russian form in the sentence (книгу for книга); Chinese
    // words do not inflect, so only the exact hit above can match.
    const key = studyWordKey(word, lang);
    return segmentStudyText(sentence, lang).find((part) => part.wordLike && studyWordKey(part.text, lang) === key)?.text ?? null;
  }
  if (!tokenizerReady()) return null;
  try {
    const target = lemmaOf(word);
    for (const token of tokenizeSync(sentence)) {
      if (token.lemma === target || token.surface === word) return token.surface;
    }
  } catch {
    /* fall through */
  }
  return null;
}

/** The level slot whose tier matches, if the user bound a list to it. */
function wordsForLevel(level: LevelTier): string[] | null {
  const slot = slotsForLang(getStudyLang()).find((s) => s.tier === level);
  if (!slot) return null;
  const list = getSlotList(slot.id);
  return list && list.words.length ? list.words : null;
}

/** The deck's cards in the study language only: a Russian learner's round never deals Japanese cards. */
function deckCards(): SourceCard[] {
  const lang = getStudyLang();
  return loadDeck().filter((c) => normalizeStudyLang(c.studyLang) === lang).map((c) => ({
    word: c.word,
    reading: c.reading,
    meaning: c.meaning,
    sentence: c.sentence,
  }));
}

export interface ArenaContent {
  vocab: VocabItem[];
  cloze: ClozeItem[];
  sentences: SourceCard[];
  /** True when the deck produced nothing usable and the caller must fall back. */
  usingFallback: boolean;
}

/**
 * Everything the Arena can draw from the user's material for one level.
 *
 * Vocab narrows to the level's list when one is bound; with no list the whole
 * deck is eligible, since showing the player nothing is worse than showing them
 * their own words at an approximate level.
 */
export function loadArenaContent(level: LevelTier): ArenaContent {
  const cards = deckCards();
  const vocab = buildVocabPool(cards, wordsForLevel(level), level, lemmaOf);
  const cloze = buildClozePool(cards, surfaceInSentence);
  const sentences = buildSentencePool(cards);
  return {
    vocab,
    cloze,
    sentences,
    usingFallback: vocab.length === 0 && cloze.length === 0 && sentences.length === 0,
  };
}

/** How much of a level's list the deck can actually teach — drives the progress bar. */
export function levelCoverage(level: LevelTier): { have: number; total: number; pct: number } {
  const words = wordsForLevel(level);
  const total = words?.length ?? 0;
  const have = total ? buildVocabPool(deckCards(), words, level, lemmaOf).length : 0;
  return { have, total, pct: total > 0 ? (have / total) * 100 : 0 };
}
