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

/**
 * Where a card's Japanese TEXT came from, which is a different question from
 * which surface created it (`FlashcardSource`).
 *
 * A machine transcript and a human-authored subtitle line both arrive as
 * `source: 'media'`, and one of them can be wrong about what was actually said.
 * The vocabulary is the one the mining-unification work settled on, so the two
 * do not diverge: human subs / auto captions / transcript / book text.
 *
 * Optional and additive. Absent means "not recorded", never "human".
 */
export type FlashcardTextProvenance =
  | 'human-subs'
  | 'auto-captions'
  | 'transcript'
  | 'book-text';

import {
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from '../shared/localSrs';
import {
  adaptStateForAlgorithm,
  migrateSrsState,
  resetSrsState,
  scheduleReview,
} from '../shared/flashcardScheduling';
import { loadSchedulingConfig } from './flashcardScheduling';

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
  /**
   * What `sceneReference` and `audioPath` are worth on a transcript-derived card.
   * Absent on every other source, and on transcript cards written before the
   * field existed — which is why the review surface treats only the explicit
   * `chunk-estimated` value as a claim, and says nothing when it is missing.
   */
  timingFidelity?: import('../shared/transcriptionIpc').TranscriptCardTiming;
  /** Where the Japanese text itself came from. See `FlashcardTextProvenance`. */
  textProvenance?: FlashcardTextProvenance;
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

/**
 * Persisted renderer-owned deck shape.
 *
 * Exported for read-only catalogue consumers such as the Files app. The deck
 * remains owned by this module; exposing its shape does not give another
 * surface a second writer.
 */
export interface FlashcardDeckStore {
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

/** Stable localStorage key shared with read-only Files catalogue consumers. */
export const FLASHCARD_DECK_STORAGE_KEY = 'jp-flashcard-deck';
/** Emitted after this module has persisted a deck change. */
export const FLASHCARD_DECK_EVENT = 'flashcard-deck-changed';

export interface ParsedFlashcardDeckStore {
  store: FlashcardDeckStore;
  /** Successful JSON layers; greater than one means the legacy over-encoding defect. */
  layers: number;
}

/**
 * Parse the established store without reading or mutating browser storage.
 *
 * Files needs the same acceptance rule as the deck itself: one parser prevents
 * an over-encoded live deck from becoming 0 rows in one surface and 3,238 in
 * another. Invalid rows are skipped exactly as the existing reader skipped
 * them, and an unreadable value is an honest empty result.
 */
export function parseFlashcardDeckStore(raw: string | null): ParsedFlashcardDeckStore {
  try {
    const { value, layers } = unwrapOverEncoded<Partial<FlashcardDeckStore>>(raw);
    const parsed = (value ?? {}) as Partial<FlashcardDeckStore>;
    return {
      store: {
        folders: Array.isArray(parsed.folders)
          ? parsed.folders.filter((folder): folder is string => typeof folder === 'string')
          : [],
        cards: Array.isArray(parsed.cards)
          ? parsed.cards.filter((card): card is DeckFlashcard => !!card && typeof card.id === 'string')
          : [],
      },
      layers,
    };
  } catch {
    return { store: { folders: [], cards: [] }, layers: 0 };
  }
}

function newId(): string {
  return `fc-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function readStore(): FlashcardDeckStore {
  try {
    const raw = localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY);
    if (!raw) return { folders: [], cards: [] };
    // v1.0 audit 5.1 — this key accumulated one JSON layer per boot from an old
    // migration-runner bug. A single parse then yields a *string*, both checks
    // below fail, and a real deck reads as empty (measured: 3,221 cards gone,
    // 37.25 MB of text, 5.2 s of blocked main thread per read).
    const { store, layers } = parseFlashcardDeckStore(raw);
    // Self-heal once, so the cost is paid a single time rather than per read.
    // Only when peeling actually recovered a deck — never write back an empty
    // store over a value we simply failed to understand.
    if (isOverEncoded(layers)) {
      if (store.cards.length > 0 || store.folders.length > 0) {
        try {
          localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(store));
          mirrorToIdb(IDB_KEYS.flashcardDeck, store);
        } catch {
          /* quota — the value stays as it was and the next read peels again */
        }
      } else {
        // Damaged and unrecoverable. The first deck write would overwrite it,
        // so keep a copy — this is the loss that happened to the CSV draft.
        quarantineIfUnrepaired(localStorage, FLASHCARD_DECK_STORAGE_KEY, layers);
      }
    }
    return store;
  } catch {
    return { folders: [], cards: [] };
  }
}

function writeStore(store: FlashcardDeckStore): void {
  try {
    localStorage.setItem(FLASHCARD_DECK_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* localStorage full — the IndexedDB mirror below still persists it */
  }
  // Write-through to IndexedDB: durable home for deck data. localStorage is
  // just the synchronous cache (see storage/storage.ts).
  mirrorToIdb(IDB_KEYS.flashcardDeck, store);
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
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

/**
 * Write generated readings onto many cards with one persisted deck write.
 *
 * Separate from the audio batch rather than a generic field patcher: a reading
 * is the one field an import may already have authored, so this refuses to
 * overwrite a non-empty one even if a caller asks. The selection in
 * `shared/flashcardAutoReading` filters those out first; this is the guard that
 * makes the rule true regardless of who calls.
 */
export function updateDeckCardReadingBatch(
  updates: ReadonlyArray<{ id: string; reading: string }>,
): DeckFlashcard[] {
  if (!updates.length) return loadDeck();
  const byId = new Map(updates.map((update) => [update.id, update.reading]));
  const store = readStore();
  store.cards = store.cards.map((card) => {
    const reading = byId.get(card.id);
    if (!reading || (card.reading ?? '').trim()) return card;
    return { ...card, reading };
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
      // Through the seam, never a scheduler directly: the algorithm setting
      // stops meaning anything on whichever path skips it.
      srs: scheduleReview(card.srs, rating, loadSchedulingConfig(), reviewedAt),
    };
  });
  if (!reviewed) return store.cards;
  writeStore(store);
  // A real review action ("Got it"), distinct from folder/import edits — the
  // one flashcard-deck event the city bridge's telemetry collector counts.
  emitCompanionEvent('flashcard');
  return store.cards;
}

export interface SchedulingSweepReport {
  /** Cards whose stored schedule actually changed. */
  changed: number;
  /** Cards with no schedule at all: already new, nothing to convert or forget. */
  unscheduled: number;
  /** Cards the sweep looked at — the folder's size, not the deck's, when scoped. */
  total: number;
}

/**
 * Bring every scheduled card under `algorithm`, once, on request.
 *
 * Returns what it did as numbers, because "converted your deck" with no count
 * is exactly the unverifiable claim this app keeps finding. Cards already under
 * the algorithm are not rewritten, so running it twice reports zero the second
 * time rather than churning the store.
 */
export function convertDeckSchedule(algorithm: LocalSrsAlgorithm): SchedulingSweepReport {
  const store = readStore();
  let changed = 0;
  let unscheduled = 0;
  store.cards = store.cards.map((card): DeckFlashcard => {
    const current = migrateSrsState(card.srs);
    if (!current) {
      unscheduled += 1;
      return card;
    }
    const adapted = adaptStateForAlgorithm(current, algorithm);
    if (adapted === card.srs) return card;
    changed += 1;
    return { ...card, srs: adapted };
  });
  const report = { changed, unscheduled, total: store.cards.length };
  if (changed > 0) writeStore(store);
  return report;
}

/**
 * Forget every schedule in the deck, or in one folder of it.
 *
 * Irreversible from this side — the review history lives nowhere else — so the
 * caller confirms first. The cards, their audio and their text are untouched:
 * only the schedule goes, which returns them to the unseen state every reader
 * in the app already understands.
 */
export function resetDeckSchedule(folder?: string): SchedulingSweepReport {
  const store = readStore();
  let changed = 0;
  let unscheduled = 0;
  let considered = 0;
  store.cards = store.cards.map((card): DeckFlashcard => {
    if (folder !== undefined && card.folder !== folder) return card;
    considered += 1;
    if (card.srs === undefined) {
      unscheduled += 1;
      return card;
    }
    changed += 1;
    return { ...card, srs: resetSrsState() };
  });
  const report = { changed, unscheduled, total: considered };
  if (changed > 0) writeStore(store);
  return report;
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

/**
 * The cards one practice sitting draws from.
 *
 * One seam rather than four call sites. A mode that forgot to apply the filter
 * would quietly practise the whole deck, and a mode practising 3,000 cards
 * looks exactly like a mode practising the 40 you chose until you count them.
 */
export function loadPracticeDeck(filter: DeckFolderFilter = 'all'): DeckFlashcard[] {
  return filterDeckCards(loadDeck(), filter);
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
  window.addEventListener(FLASHCARD_DECK_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(FLASHCARD_DECK_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
