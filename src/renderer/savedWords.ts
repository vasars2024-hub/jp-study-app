// Words the user saved (starred) from the dictionary.
//
// These used to live in a third store of their own (`jp-saved-words-<lang>`):
// not flashcards, not reviewable with a saved grade, and dropped the sentence
// the popup passed. Since the study database unification a star IS a deck card
// (`source: 'dictionary'`), written through `mineToStudy`, so it is reviewed,
// scheduled, backed up and counted like every other card. This module keeps
// the old API as a view over the deck for its many readers, and migrates each
// language's legacy list once.
//
// Phase 8 per-language split is kept: a card records the study language it
// was saved under (`studyLang`, absent = Japanese), and `loadSaved()` returns
// the current language's words only.

import { getStudyLang, onStudyLangChanged, type StudyLang } from './studyEnvironment';
import {
  addDeckCardsTracked,
  loadDeck,
  onDeckChanged,
  removeDeckCards,
  type DeckFlashcard,
} from './flashcardDeck';

export interface SavedWord {
  /** The kanji/expression form — also the unique key. */
  word: string;
  reading: string;
  meaning: string;
  /** Sentence the word was looked up in, when the lookup had one. */
  sentence?: string;
  addedAt: number;
}

export const LEGACY_SAVED_KEY = 'jp-saved-words';

export function savedWordsKey(lang: StudyLang = getStudyLang()): string {
  return `${LEGACY_SAVED_KEY}-${lang}`;
}

/** Marks a language whose legacy list has been turned into deck cards. */
function migratedKey(lang: StudyLang): string {
  return `${savedWordsKey(lang)}-migrated`;
}

export const SAVED_WORDS_FOLDER = 'Dictionary';
export const SAVED_WORDS_BOOK_ID = 'dictionary';
export const SAVED_WORDS_BOOK_TITLE = 'Dictionary';

let legacyCopied = false;

function copyUnsuffixedLegacyOnce(): void {
  if (legacyCopied) return;
  legacyCopied = true;
  try {
    const jaKey = savedWordsKey('ja');
    if (localStorage.getItem(jaKey)) return;
    const legacy = localStorage.getItem(LEGACY_SAVED_KEY);
    if (!legacy) return;
    localStorage.setItem(jaKey, legacy);
  } catch {
    /* ignore */
  }
}

function cardLang(card: DeckFlashcard): string {
  return card.studyLang || 'ja';
}

function isSavedCard(card: DeckFlashcard, lang: StudyLang): boolean {
  return card.source === 'dictionary' && cardLang(card) === lang;
}

function draftFor(entry: SavedWord, lang: StudyLang): Omit<DeckFlashcard, 'id' | 'addedAt'> {
  return {
    word: entry.word,
    reading: entry.reading ?? '',
    meaning: entry.meaning ?? '',
    ...(entry.sentence?.trim() ? { sentence: entry.sentence.trim().slice(0, 2000) } : {}),
    source: 'dictionary',
    bookId: SAVED_WORDS_BOOK_ID,
    bookTitle: SAVED_WORDS_BOOK_TITLE,
    folder: SAVED_WORDS_FOLDER,
    ...(lang !== 'ja' ? { studyLang: lang } : {}),
  };
}

/**
 * Turn one language's legacy saved-word list into deck cards, once.
 *
 * Idempotent twice over: a marker records the language as done, and a word
 * already saved as a dictionary card is never added again, so an interrupted
 * run (or a marker lost with cleared storage) cannot duplicate anything. The
 * legacy key is left in place — deleting user data is not this module's call.
 */
export function migrateSavedWordsToDeck(lang: StudyLang = getStudyLang()): number {
  copyUnsuffixedLegacyOnce();
  try {
    if (localStorage.getItem(migratedKey(lang)) === '1') return 0;
    const raw = localStorage.getItem(savedWordsKey(lang));
    const list = raw ? (JSON.parse(raw) as SavedWord[]) : [];
    const present = new Set(loadDeck().filter((card) => isSavedCard(card, lang)).map((card) => card.word));
    const fresh = (Array.isArray(list) ? list : []).filter(
      (entry) => entry && typeof entry.word === 'string' && entry.word && !present.has(entry.word),
    );
    const unique = fresh.filter((entry, i) => fresh.findIndex((other) => other.word === entry.word) === i);
    if (unique.length) addDeckCardsTracked(unique.map((entry) => draftFor(entry, lang)));
    localStorage.setItem(migratedKey(lang), '1');
    return unique.length;
  } catch {
    return 0;
  }
}

export function loadSaved(): SavedWord[] {
  const lang = getStudyLang();
  migrateSavedWordsToDeck(lang);
  return loadDeck()
    .filter((card) => isSavedCard(card, lang))
    .map((card) => ({
      word: card.word,
      reading: card.reading,
      meaning: card.meaning,
      ...(card.sentence ? { sentence: card.sentence } : {}),
      addedAt: card.addedAt,
    }));
}

/** The deck cards behind the saved list, for surfaces that review them. */
export function loadSavedCards(): DeckFlashcard[] {
  const lang = getStudyLang();
  migrateSavedWordsToDeck(lang);
  return loadDeck().filter((card) => isSavedCard(card, lang));
}

export function isSaved(word: string): boolean {
  return loadSaved().some((w) => w.word === word);
}

/**
 * Save a word as a deck card. Synchronous on purpose: the star toggles in the
 * same frame it is clicked. A word already saved is left as it is.
 */
export function addSaved(entry: SavedWord): SavedWord[] {
  const lang = getStudyLang();
  migrateSavedWordsToDeck(lang);
  if (loadDeck().some((card) => isSavedCard(card, lang) && card.word === entry.word)) return loadSaved();
  addDeckCardsTracked([draftFor(entry, lang)]);
  return loadSaved();
}

/**
 * Un-star: remove the word's dictionary cards. A card that already went to
 * Anki (or is waiting to) stays — un-starring must not delete study the user
 * is also doing there.
 */
export function removeSaved(word: string): SavedWord[] {
  const lang = getStudyLang();
  const doomed = loadDeck()
    .filter((card) => isSavedCard(card, lang) && card.word === word && !card.ankiNoteId && !card.ankiPending)
    .map((card) => card.id);
  if (doomed.length) removeDeckCards(doomed);
  return loadSaved();
}

/** Subscribe to saved-list changes (from any view). Returns an unsubscribe fn. */
export function onSavedChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  const offDeck = onDeckChanged(handler);
  window.addEventListener('saved-words-changed', handler);
  const unsubLang = onStudyLangChanged(handler);
  return () => {
    offDeck();
    window.removeEventListener('saved-words-changed', handler);
    unsubLang();
  };
}
