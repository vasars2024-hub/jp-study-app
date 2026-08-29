// Local deck store for EPUB-mined flashcards with user folders and auto book groups.

export type FlashcardSource =
  | 'dictionary'
  | 'epub'
  | 'epub-ai'
  | 'import'
  | 'csv'
  | 'jiten'
  | 'extension'
  | 'media';

import {
  scheduleLocalReview,
  type LocalSrsRating,
  type LocalSrsState,
} from '../shared/localSrs';

export interface DeckFlashcard {
  id: string;
  word: string;
  reading: string;
  meaning: string;
  sentence?: string;
  front?: string;
  back?: string;
  source: FlashcardSource;
  bookId?: string;
  bookTitle?: string;
  folder?: string;
  studyKind?: import('../shared/visualNovelStudyCards').VisualNovelStudyCardKind;
  frequency?: number;
  jlptLevel?: string;
  sceneReference?: string;
  /** Exact media context retained by Study Mode and player handoffs. */
  sourceRef?: import('../shared/mediaStudyOrchestrator').StudyContextRef;
  /** Reversible Study action that created this card batch. */
  studyActionId?: string;
  /** Optional recorded audio as a data URL (short clips from extension). */
  audioDataUrl?: string;
  /** Managed VN voice clip, loaded on demand to keep localStorage compact. */
  audioPath?: string;
  /** Managed VN capture image, loaded on demand to avoid localStorage bloat. */
  imagePath?: string;
  /** Backward-compatible last-result rollup used by knowledge surfaces. */
  known?: boolean;
  /** Local-copy schedule; an exported Anki copy remains owned by Anki's scheduler. */
  srs?: LocalSrsState;
  addedAt: number;
  /** Anki export status for reader collection. */
  ankiExported?: boolean;
  ankiExportedAt?: number;
  ankiNoteId?: number;
  ankiExportError?: string;
  ankiDeck?: string;
}

export type DeckFolderFilter = 'all' | 'unfiled' | string;

interface FlashcardDeckStore {
  folders: string[];
  cards: DeckFlashcard[];
}

import {
  buildLocalDeckDraft,
  type BuildLocalDeckOptions,
  type LocalDeckDraftResult,
} from '../shared/ankiLocalDeck';
import { stripFieldHtml } from '../shared/apkgParse';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';
import { isOverEncoded, quarantineIfUnrepaired, unwrapOverEncoded } from '../shared/overEncodedJson';
import { emitCompanionEvent } from './environment/companionEvents';
import { logBlanc } from './blancConsole';

const KEY = 'jp-flashcard-deck';
const EVENT = 'flashcard-deck-changed';

function newId(): string {
  return `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): FlashcardDeckStore {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { folders: [], cards: [] };
    // v1.0 audit 5.1 — this key accumulated one JSON layer per boot from an old
    // migration-runner bug. A single parse then yields a *string*, both checks
    // below fail, and a real deck reads as empty (measured: 3,221 cards gone,
    // 37.25 MB of text, 5.2 s of blocked main thread per read).
    const { value, layers } = unwrapOverEncoded<Partial<FlashcardDeckStore>>(raw);
    const parsed = (value ?? {}) as Partial<FlashcardDeckStore>;
    const store: FlashcardDeckStore = {
      folders: Array.isArray(parsed.folders) ? parsed.folders.filter((f) => typeof f === 'string') : [],
      cards: Array.isArray(parsed.cards) ? parsed.cards.filter((c) => c && typeof c.id === 'string') : [],
    };
    // Self-heal once, so the cost is paid a single time rather than per read.
    // Only when peeling actually recovered a deck — never write back an empty
    // store over a value we simply failed to understand.
    if (isOverEncoded(layers)) {
      if (store.cards.length > 0 || store.folders.length > 0) {
        try {
          localStorage.setItem(KEY, JSON.stringify(store));
          mirrorToIdb(IDB_KEYS.flashcardDeck, store);
        } catch {
          /* quota — the value stays as it was and the next read peels again */
        }
      } else {
        // Damaged and unrecoverable. The first deck write would overwrite it,
        // so keep a copy — this is the loss that happened to the CSV draft.
        quarantineIfUnrepaired(localStorage, KEY, layers);
      }
    }
    return store;
  } catch {
    return { folders: [], cards: [] };
  }
}

function writeStore(store: FlashcardDeckStore): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    /* localStorage full — the IndexedDB mirror below still persists it */
  }
  // Write-through to IndexedDB: durable home for deck data. localStorage is
  // just the synchronous cache (see storage/storage.ts).
  mirrorToIdb(IDB_KEYS.flashcardDeck, store);
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function loadDeck(): DeckFlashcard[] {
  return readStore().cards;
}

export function loadDeckFolders(): string[] {
  return readStore().folders;
}

/**
 * This deck, in the Anki workbench's normalized draft shape — source adapter 4
 * of `src/ANKI_DECK_WORKBENCH_PLAN.md`.
 *
 * It lives here rather than in a main-process reader because the deck *is* this
 * renderer store: an IPC round trip would ship the cards out and the draft back
 * for no gain. One read of the store serves both cards and folders, so an empty
 * folder still becomes a subdeck.
 */
export function loadDeckAsAnkiDraft(options: BuildLocalDeckOptions = {}): LocalDeckDraftResult {
  const store = readStore();
  return buildLocalDeckDraft(store.cards, stripFieldHtml, {
    folders: store.folders,
    ...options,
  });
}

export function setDeckFolders(folders: string[]): string[] {
  const store = readStore();
  const next = folders.filter((f) => f.trim() && f !== 'all' && f !== 'unfiled');
  store.folders = next;
  writeStore(store);
  return next;
}

export function createDeckFolder(name: string): string[] {
  const trimmed = name.trim();
  if (!trimmed || trimmed === 'all' || trimmed === 'unfiled') return loadDeckFolders();
  const store = readStore();
  if (store.folders.includes(trimmed)) return store.folders;
  store.folders = [...store.folders, trimmed];
  writeStore(store);
  return store.folders;
}

export function deleteDeckFolder(name: string): { folders: string[]; cards: DeckFlashcard[] } {
  const store = readStore();
  store.folders = store.folders.filter((f) => f !== name);
  store.cards = store.cards.map((c) => (c.folder === name ? { ...c, folder: undefined } : c));
  writeStore(store);
  return { folders: store.folders, cards: store.cards };
}

export function addDeckCards(entries: Omit<DeckFlashcard, 'id' | 'addedAt'>[]): DeckFlashcard[] {
  const store = readStore();
  const now = Date.now();
  const created = entries.map((entry, index) => ({
    ...entry,
    id: newId(),
    addedAt: now + index,
  }));
  for (const entry of created) {
    if (entry.folder && !store.folders.includes(entry.folder)) {
      store.folders = [...store.folders, entry.folder];
    }
  }
  store.cards = [...created, ...store.cards];
  writeStore(store);
  // Pillar 5: every deck write is traceable. This is the "where did that card
  // go" question the console exists to answer, so it records the destination
  // folders and sources rather than just a count.
  logBlanc('info', 'deck', `Added ${created.length} card${created.length === 1 ? '' : 's'} to the local deck`, {
    folders: [...new Set(created.map((c) => c.folder ?? '(unfiled)'))],
    sources: [...new Set(created.map((c) => c.source))],
    words: created.slice(0, 5).map((c) => c.word),
    deckSize: store.cards.length,
  });
  return store.cards;
}

/** Add cards while returning only the new rows, without changing legacy callers. */
export function addDeckCardsTracked(
  entries: Omit<DeckFlashcard, 'id' | 'addedAt'>[],
): DeckFlashcard[] {
  return addDeckCards(entries).slice(0, entries.length);
}

/** One persisted write for a reversible Study-created batch. */
export function removeDeckCards(ids: readonly string[]): DeckFlashcard[] {
  if (!ids.length) return loadDeck();
  const wanted = new Set(ids);
  const store = readStore();
  store.cards = store.cards.filter((card) => !wanted.has(card.id));
  writeStore(store);
  return store.cards;
}

export function removeDeckCard(id: string): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.filter((c) => c.id !== id);
  writeStore(store);
  return store.cards;
}

/** Patch a card's editable fields in place (word/reading/meaning/sentence…). */
export function updateDeckCard(
  id: string,
  patch: Partial<
    Pick<
      DeckFlashcard,
      | 'word'
      | 'reading'
      | 'meaning'
      | 'sentence'
      | 'front'
      | 'back'
      | 'imagePath'
      | 'audioPath'
      | 'audioDataUrl'
      | 'studyKind'
      | 'frequency'
      | 'jlptLevel'
      | 'sceneReference'
      | 'sourceRef'
      | 'studyActionId'
      | 'ankiExported'
      | 'ankiExportedAt'
      | 'ankiNoteId'
      | 'ankiExportError'
      | 'ankiDeck'
    >
  >,
): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
  writeStore(store);
  return store.cards;
}

/** Attach generated/captured audio to many cards with one persisted deck write. */
export function updateDeckCardAudioBatch(
  updates: ReadonlyArray<{ id: string; audioPath?: string; audioDataUrl?: string }>,
): DeckFlashcard[] {
  if (!updates.length) return loadDeck();
  const byId = new Map(updates.map((update) => [update.id, update]));
  const store = readStore();
  store.cards = store.cards.map((card) => {
    const update = byId.get(card.id);
    return update ? { ...card, ...update } : card;
  });
  writeStore(store);
  return store.cards;
}

export function setDeckCardFolder(id: string, folder: string | null): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.map((c) =>
    c.id === id ? { ...c, folder: folder && folder.trim() ? folder.trim() : undefined } : c,
  );
  writeStore(store);
  return store.cards;
}

export function setDeckCardKnown(id: string, known: boolean): DeckFlashcard[] {
  return reviewDeckCard(id, known ? 'good' : 'again');
}

/** Persist one local review judgement and its next due time atomically. */
export function reviewDeckCard(
  id: string,
  rating: LocalSrsRating,
  reviewedAt = Date.now(),
): DeckFlashcard[] {
  const store = readStore();
  let reviewed = false;
  store.cards = store.cards.map((card) => {
    if (card.id !== id) return card;
    reviewed = true;
    return {
      ...card,
      known: rating !== 'again' || undefined,
      srs: scheduleLocalReview(card.srs, rating, reviewedAt),
    };
  });
  if (!reviewed) return store.cards;
  writeStore(store);
  // A real review action ("Got it"), distinct from folder/import edits — the
  // one flashcard-deck event the city bridge's telemetry collector counts.
  emitCompanionEvent('flashcard');
  return store.cards;
}

export function setBookGroupFolder(
  bookId: string,
  bookTitle: string,
  folder: string | null,
): DeckFlashcard[] {
  const store = readStore();
  const trimmed = folder?.trim();
  store.cards = store.cards.map((c) => {
    const matches =
      (c.bookId || 'unknown') === bookId && (c.bookTitle || 'Unknown source') === bookTitle;
    if (!matches) return c;
    return { ...c, folder: trimmed || undefined };
  });
  writeStore(store);
  return store.cards;
}

export function renameBookGroup(
  bookId: string,
  oldTitle: string,
  newTitle: string,
): DeckFlashcard[] {
  const store = readStore();
  const trimmed = newTitle.trim();
  if (!trimmed) return store.cards;
  store.cards = store.cards.map((c) => {
    const matches =
      (c.bookId || 'unknown') === bookId && (c.bookTitle || 'Unknown source') === oldTitle;
    if (!matches) return c;
    return { ...c, bookTitle: trimmed };
  });
  writeStore(store);
  return store.cards;
}

export function filterDeckByBook(cards: DeckFlashcard[], bookKey: string): DeckFlashcard[] {
  if (bookKey === 'all') return cards;
  return cards.filter((c) => `${c.bookId || 'unknown'}::${c.bookTitle || 'Unknown source'}` === bookKey);
}

export function removeBookGroup(bookId: string, bookTitle: string): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.filter(
    (c) =>
      !(
        (c.bookId || 'unknown') === bookId &&
        (c.bookTitle || 'Unknown source') === bookTitle
      ),
  );
  writeStore(store);
  return store.cards;
}

export function replaceImportedDeck(
  bookId: string,
  bookTitle: string,
  entries: Omit<DeckFlashcard, 'id' | 'addedAt'>[],
): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.filter(
    (c) =>
      !(
        (c.bookId || 'unknown') === bookId &&
        (c.bookTitle || 'Unknown source') === bookTitle
      ),
  );
  const now = Date.now();
  const created = entries.map((entry, index) => ({
    ...entry,
    id: newId(),
    addedAt: now + index,
  }));
  store.cards = [...created, ...store.cards];
  writeStore(store);
  return store.cards;
}

import type { ImportDeckEntry } from '../shared/deckImport';

export function importDeckFromEntries(entries: ImportDeckEntry[]): DeckFlashcard[] {
  if (!entries.length) return loadDeck();
  const bookId = entries[0].bookId;
  const bookTitle = entries[0].bookTitle;
  return replaceImportedDeck(bookId, bookTitle, entries);
}

export function filterDeckCards(cards: DeckFlashcard[], filter: DeckFolderFilter): DeckFlashcard[] {
  if (filter === 'all') return cards;
  if (filter === 'unfiled') return cards.filter((c) => !c.folder);
  return cards.filter((c) => c.folder === filter);
}

/**
 * Substring search across every field a user can read on a card, so typing a
 * deck name, a reading, or a remembered fragment of the mined sentence all
 * narrow the same box. Case-insensitive; an empty or whitespace query is not a
 * filter and returns the input untouched.
 */
export function searchDeckCards(cards: DeckFlashcard[], query: string): DeckFlashcard[] {
  const q = query.trim().toLowerCase();
  if (!q) return cards;
  return cards.filter((c) =>
    [c.word, c.reading, c.meaning, c.front, c.back, c.sentence, c.bookTitle].some((field) =>
      field ? field.toLowerCase().includes(q) : false,
    ),
  );
}

export interface BookGroup {
  bookId: string;
  bookTitle: string;
  cards: DeckFlashcard[];
}

export function groupDeckByBook(cards: DeckFlashcard[]): BookGroup[] {
  const map = new Map<string, BookGroup>();
  for (const card of cards) {
    const bookId = card.bookId || 'unknown';
    const bookTitle = card.bookTitle || 'Unknown source';
    const key = `${bookId}::${bookTitle}`;
    const existing = map.get(key);
    if (existing) {
      existing.cards.push(card);
    } else {
      map.set(key, { bookId, bookTitle, cards: [card] });
    }
  }
  return [...map.values()].sort((a, b) => a.bookTitle.localeCompare(b.bookTitle));
}

export function onDeckChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
