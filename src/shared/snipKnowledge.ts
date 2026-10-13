/**
 * Snip to cards: "is this word known / already a card?" by the reader's rule.
 *
 * The reader colours a word by the key `shared/knowledgeKey` gives it, and
 * every writer (Anki sync, reviews, the import) files evidence under that same
 * key. A snip used to ask the store with the raw lemma and surface instead, so
 * a word the reader showed as known (ネコ graded, 猫 snipped; книгу snipped,
 * книга known; a full-width form) could still become a card, and a card for
 * 勉強する did not count as a card for 勉強. This module asks the store the way
 * the reader does, and finds the existing card a snip word belongs to (for
 * "already a card" and for merging the new sentence into it).
 *
 * Pure: the tokenizer and the store are passed in. Kept out of
 * `shared/snipToCards.ts` so the boot-time snip listener does not pull the
 * segmenters in; the pipeline imports this only when a snip arrives.
 */

import {
  japaneseAliasKeys,
  japaneseTokenKey,
  knowledgeKeyFor,
  normalizeKnowledgeText,
  resolveKnowledgeAlias,
  segmentKnowledgeKey,
  type KnowledgeKeyDeps,
} from './knowledgeKey';
import type { StudyLang } from './studyLang';
import type { SnipWordLookups } from './snipToCards';

/** The parts of a snip word the key depends on. */
export interface SnipKeyWord {
  surface: string;
  lemma: string;
  /** Katakana reading of the surface (the analyser's), when it has one. */
  reading?: string;
}

/** The level the reader calls "known". */
export const SNIP_KNOWN_LEVEL = 3;

/**
 * The knowledge key of one snip word, exactly the reader's key for the same
 * token: Japanese → the token's dictionary form (NFKC); Chinese → the word;
 * Russian → the graded dictionary form, else the stem every form shares.
 */
export function snipWordKey(word: SnipKeyWord, lang: StudyLang, levelOf: (key: string) => number = () => 0): string {
  if (lang === 'ja') return japaneseTokenKey({ surface: word.surface, lemma: word.lemma || word.surface });
  return segmentKnowledgeKey(word.surface || word.lemma, lang, levelOf);
}

/** Japanese spelling variants the reader also accepts (ネコ ↔ ねこ, 猫 → its own reading). */
function aliasesFor(key: string, word: SnipKeyWord, lang: StudyLang): string[] {
  if (lang !== 'ja') return [];
  // A reading belongs to the lemma only when the token is not inflected.
  const reading = word.surface === word.lemma ? word.reading : undefined;
  return japaneseAliasKeys(key, { reading });
}

export interface SnipKnowledgeStore {
  /** The knowledge store's level for a key (0 when absent). */
  levelOf: (key: string) => number;
  /** A hand-set level (a hand-picked "New" still counts as graded for the alias). */
  isManual?: (key: string) => boolean;
}

export interface SnipDeckCard {
  id: string;
  word: string;
  studyLang?: string;
}

/**
 * The deck's cards in `lang`, by the key the reader would give their word.
 * Keys are computed only for cards that share a character with one of
 * `wanted` (the snip's own keys and spellings), so a 20,000-card deck costs a
 * snip a set lookup per card, not a tokenizer pass each.
 */
export function indexDeckForSnip(
  cards: readonly SnipDeckCard[],
  lang: StudyLang,
  wanted: readonly string[],
  deps: KnowledgeKeyDeps = {},
): Map<string, string> {
  const chars = new Set<string>();
  for (const w of wanted) for (const ch of normalizeKnowledgeText(w).toLowerCase()) chars.add(ch);
  const out = new Map<string, string>();
  for (const card of cards) {
    if (!card || typeof card.word !== 'string') continue;
    const cardLang = card.studyLang === 'zh' || card.studyLang === 'ru' ? card.studyLang : 'ja';
    if (cardLang !== lang) continue;
    const plain = normalizeKnowledgeText(card.word).toLowerCase();
    if (!plain || ![...plain].some((ch) => chars.has(ch))) continue;
    const keys = new Set<string>([plain]);
    try {
      const key = knowledgeKeyFor(card.word, lang, deps);
      if (key) keys.add(lang === 'ja' ? key : key.toLowerCase());
    } catch {
      /* the spelling alone still matches */
    }
    for (const key of keys) if (!out.has(key)) out.set(key, card.id);
  }
  return out;
}

export interface SnipKnowledge extends SnipWordLookups {
  /** The id of the card the word already is, when it is one. */
  cardFor: (word: SnipKeyWord) => string | null;
}

/**
 * The known / in-deck questions the classifier asks, answered by the reader's
 * key (and its spelling variants), with the existing card each in-deck word
 * belongs to. `words` are the snip's words, so the deck is indexed once.
 */
export function snipKnowledge(
  words: readonly SnipKeyWord[],
  lang: StudyLang,
  store: SnipKnowledgeStore,
  cards: readonly SnipDeckCard[],
  deps: KnowledgeKeyDeps = {},
): SnipKnowledge {
  const has = (key: string): boolean => store.levelOf(key) > 0 || Boolean(store.isManual?.(key));
  const keyOf = (w: SnipKeyWord): string => snipWordKey(w, lang, store.levelOf);
  const spellings = (w: SnipKeyWord): string[] => {
    const key = keyOf(w);
    const plain = (s: string): string => (lang === 'ja' ? normalizeKnowledgeText(s) : normalizeKnowledgeText(s).toLowerCase());
    return [...new Set([key, ...aliasesFor(key, w, lang), plain(w.lemma), plain(w.surface)].filter(Boolean))];
  };
  const wanted = words.flatMap(spellings);
  const deck = indexDeckForSnip(cards, lang, wanted, deps);
  const byParts = (lemma: string, surface: string): SnipKeyWord => {
    const found = words.find((w) => w.lemma === lemma && w.surface === surface);
    return found ?? { lemma, surface };
  };
  const cardFor = (w: SnipKeyWord): string | null => {
    for (const spelling of spellings(w)) {
      const id = deck.get(spelling);
      if (id) return id;
    }
    return null;
  };
  return {
    isKnown: (lemma, surface) => {
      const w = byParts(lemma, surface);
      const key = keyOf(w);
      const resolved = lang === 'ja' ? resolveKnowledgeAlias(key, has, { reading: w.surface === w.lemma ? w.reading : undefined }) : key;
      return store.levelOf(resolved) >= SNIP_KNOWN_LEVEL;
    },
    inDeck: (lemma, surface) => cardFor(byParts(lemma, surface)) !== null,
    cardFor,
  };
}
