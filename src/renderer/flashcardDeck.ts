// Local deck store for EPUB-mined flashcards with user folders and auto book groups.

export type FlashcardSource =
  | 'dictionary'
  | 'epub'
  | 'epub-ai'
  | 'import'
  | 'csv'
  | 'jiten'
  | 'extension'
  | 'media'
  /** Video player subtitle line (VideoCore mining panel). */
  | 'subtitle'
  /** A lyric line mined from the music player. */
  | 'lyrics'
  /** Sentence analysis (app or Reading Lens host). */
  | 'analysis'
  /** Reading Lens reader panel glance. */
  | 'reader'
  /** Lexicon workbench harvest row. */
  | 'lexicon';

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
  countIntroducedToday,
  filterLocalReviewsDue,
  limitNewCards,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from '../shared/localSrs';
import type { FlashcardReviewMode } from '../shared/flashcardReview';
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
  /** Who said the example line (visual novel captures carry a speaker). */
  characterName?: string;
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
  /**
   * Mined while Anki was unreachable: the local card is the study copy, and the
   * Anki half is waiting in the mining queue (`studyMining.ts`). Cleared when
   * the note is created, or when Anki reports it as a duplicate.
   */
  ankiPending?: boolean;
  /** Anki already held a matching note when this card was pushed. */
  ankiDuplicate?: boolean;
  /** Page / file the card was mined from, when the surface knows one. */
  sourceUrl?: string;
  /** Normalised word + sentence + source identity; dedupes repeated mines. */
  mineKey?: string;
  /** Study language a dictionary save belongs to (absent = Japanese). */
  studyLang?: string;
  /** When the card was first reviewed — drives the new-cards-per-day cap. */
  introducedAt?: number;
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
  /**
   * Wall-clock stamp of the write that produced this copy. The deck has two
   * homes (localStorage cache + IndexedDB) and boot reconciliation keeps
   * whichever is newer, so a stale cache can never overwrite the durable copy.
   * Absent on every store written before the stamp existed (reads as 0).
   */
  savedAt?: number;
}

import {
  buildLocalDeckDraft,
  type BuildLocalDeckOptions,
  type LocalDeckDraftResult,
} from '../shared/ankiLocalDeck';
import { stripFieldHtml } from '../shared/apkgParse';
import { IDB_KEYS, mirrorToIdb } from './storage/storage';
import { kvGet } from './storage/db';
import { isOverEncoded, quarantineIfUnrepaired, unwrapOverEncoded } from '../shared/overEncodedJson';
import { emitCompanionEvent } from './environment/companionEvents';
import { logBlanc } from './blancConsole';
import { levelForIntervalDays } from '../shared/anki';
import { setInferredLevel, type WkLevel } from './knownWords';
import { getActiveProfile } from './profileState';
import { appendReviewLog, removeReviewLogEntry } from './reviewLog';
import type { ReviewLogEntry } from '../shared/reviewLog';

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
        ...(typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
          ? { savedAt: parsed.savedAt }
          : {}),
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

/**
 * The deck when localStorage could not hold it. Set when a cache write hits
 * the quota (the durable IndexedDB copy still takes the write) and when boot
 * reconciliation restores a durable copy the cache has no room for. While it
 * is set it is the authoritative copy for this window: reading the cache would
 * return the last value that happened to fit, and the next write would then
 * mirror that stale value over the durable copy.
 */
let overflowStore: FlashcardDeckStore | null = null;
/** `overflowStore` as JSON: the base of a later three-way merge. */
let overflowText: string | null = null;
/** True while boot reconciliation is deciding between the two copies. */
let restoring = false;
/** Cards created while reconciliation was reading the durable copy. */
let createdWhileRestoring = new Set<string>();

/**
 * localStorage marker holding the `savedAt` of the newest deck write that did
 * not fit in the cache. `overflowStore` lives in ONE window's memory; every
 * other window would read the stale cache and mirror it over the durable copy.
 * A window that sees a marker newer than what it holds reads IndexedDB before
 * its next write reaches the durable copy (see `writeStore`).
 *
 * `DECK_UNVERIFIED` is the same marker for a write whose base was unreadable:
 * the cache has it, IndexedDB does not yet, and nobody may treat that cache as
 * a base (not another window, not boot reconciliation after a crash) until it
 * has been merged with the durable copy.
 */
export const FLASHCARD_DECK_OVERFLOW_KEY = 'jp-flashcard-deck-overflow';
const DECK_UNVERIFIED = Number.MAX_SAFE_INTEGER;

/**
 * Set by `readStore` when what it returned is not a safe base for a durable
 * write: the cache is missing or unreadable (while IndexedDB may still hold the
 * deck), or another window's newer deck lives only in IndexedDB. `baseText` is
 * the JSON the caller's copy was parsed from, for the three-way merge.
 */
let lastReadSuspect: { baseText: string | null } | null = null;
/** Base of the first suspect write while its durable check runs. */
let pendingBase: { baseText: string | null } | null = null;
let pendingVerify: Promise<void> | null = null;
/** The durable copy could not be read: keep guarding writes from this base. */
let unverifiedBase: { baseText: string | null } | null = null;

/** Emitted when a deck write could not reach localStorage (quota / blocked). */
export const FLASHCARD_DECK_STORAGE_EVENT = 'flashcard-deck-storage';

export interface FlashcardDeckStorageIssue {
  kind: 'cache-full';
  cards: number;
}

function readOverflowMarker(): number | null {
  try {
    const raw = localStorage.getItem(FLASHCARD_DECK_OVERFLOW_KEY);
    if (!raw) return null;
    const stamp = Number(raw);
    return Number.isFinite(stamp) ? stamp : null;
  } catch {
    return null;
  }
}

function copyStore(store: FlashcardDeckStore): FlashcardDeckStore {
  return { ...store, cards: store.cards, folders: store.folders };
}

function safeGetCache(): string | null {
  try {
    return localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY);
  } catch {
    return null;
  }
}

function readStore(): FlashcardDeckStore {
  lastReadSuspect = null;
  const marker = readOverflowMarker();
  if (overflowStore) {
    const own = overflowStore.savedAt ?? 0;
    if (marker !== null && marker > own) {
      // Another window's newer deck overflowed too and lives only in IndexedDB.
      lastReadSuspect = { baseText: overflowText };
      return copyStore(overflowStore);
    }
    if (marker !== null) return copyStore(overflowStore);
    // No marker: another window wrote a deck that fits the cache again. Its
    // copy is the newer one when its stamp is.
    const cached = parseFlashcardDeckStore(safeGetCache()).store;
    if ((cached.savedAt ?? 0) <= own) return copyStore(overflowStore);
    overflowStore = null;
    overflowText = null;
  }
  try {
    const raw = localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY);
    if (!raw) {
      lastReadSuspect = { baseText: null };
      return { folders: [], cards: [] };
    }
    // v1.0 audit 5.1 — this key accumulated one JSON layer per boot from an old
    // migration-runner bug. A single parse then yields a *string*, both checks
    // below fail, and a real deck reads as empty (measured: 3,221 cards gone,
    // 37.25 MB of text, 5.2 s of blocked main thread per read).
    const { store, layers } = parseFlashcardDeckStore(raw);
    if (layers === 0) {
      lastReadSuspect = { baseText: null };
    } else if (marker !== null && marker > (store.savedAt ?? 0)) {
      lastReadSuspect = { baseText: raw };
    }
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
        lastReadSuspect = { baseText: null };
      }
    }
    return store;
  } catch {
    lastReadSuspect = { baseText: null };
    return { folders: [], cards: [] };
  }
}

/**
 * Write the synchronous cache; false when it could not hold the deck. On
 * overflow the deck stays in this window's memory and the marker tells every
 * other window that its cache is stale.
 */
function writeCache(store: FlashcardDeckStore, unverified = false): boolean {
  let text: string | null = null;
  try {
    text = JSON.stringify(store);
    setCacheItem(FLASHCARD_DECK_STORAGE_KEY, text);
    overflowStore = null;
    overflowText = null;
    setOverflowMarker(unverified ? DECK_UNVERIFIED : null);
    return true;
  } catch {
    overflowStore = store;
    overflowText = text;
    setOverflowMarker(unverified ? DECK_UNVERIFIED : store.savedAt ?? 0);
    return false;
  }
}

/**
 * The deck's cache keys are a synchronous cache in front of IndexedDB, not the
 * durable home: a refused write is handled by the caller (overflow), so the
 * guarded writer's toast would be wrong here (see the raw-write ratchet).
 */
function setCacheItem(key: string, value: string): void {
  localStorage.setItem(key, value);
}

function setOverflowMarker(stamp: number | null): void {
  try {
    if (stamp === null) localStorage.removeItem(FLASHCARD_DECK_OVERFLOW_KEY);
    else setCacheItem(FLASHCARD_DECK_OVERFLOW_KEY, String(stamp));
  } catch {
    /* the cache is so full that even the marker does not fit */
  }
}

function reportCacheFull(store: FlashcardDeckStore): void {
  try {
    window.dispatchEvent(new CustomEvent<FlashcardDeckStorageIssue>(FLASHCARD_DECK_STORAGE_EVENT, {
      detail: { kind: 'cache-full', cards: store.cards.length },
    }));
  } catch {
    /* non-browser context */
  }
}

function sameCard(left: DeckFlashcard | undefined, right: DeckFlashcard | undefined): boolean {
  if (!left || !right) return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Three-way merge of a write whose base could not be trusted.
 *
 * `base` is what the writer read (empty when the cache was missing), `written`
 * what it wants to store, `durable` the IndexedDB copy. A card the writer did
 * not touch keeps its durable version; a card it added or edited keeps the
 * written one; a card it deleted from its base stays deleted; and every durable
 * card its base never had — the deck the empty read could not see — is kept.
 */
export function mergeDeckOverDurable(
  base: FlashcardDeckStore,
  written: FlashcardDeckStore,
  durable: FlashcardDeckStore,
): FlashcardDeckStore {
  const baseById = new Map(base.cards.map((card) => [card.id, card]));
  const durableById = new Map(durable.cards.map((card) => [card.id, card]));
  const writtenIds = new Set(written.cards.map((card) => card.id));
  const cards = written.cards.map((card) => {
    const durableCard = durableById.get(card.id);
    return durableCard && sameCard(baseById.get(card.id), card) ? durableCard : card;
  });
  for (const card of durable.cards) {
    if (!writtenIds.has(card.id) && !baseById.has(card.id)) cards.push(card);
  }
  const folders = [
    ...written.folders,
    ...durable.folders.filter((folder) => !written.folders.includes(folder) && !base.folders.includes(folder)),
  ];
  return {
    folders,
    cards,
    savedAt: Math.max(written.savedAt ?? 0, (durable.savedAt ?? 0) + 1),
  };
}

/** Cache + durable home for a store whose base is trusted. */
function commitStore(store: FlashcardDeckStore): void {
  if (!writeCache(store)) {
    // localStorage full. Keep the deck in memory so the next read is not the
    // stale cached value, and tell the user: silently degrading is how a deck
    // used to lose cards.
    reportCacheFull(store);
  }
  // Write-through to IndexedDB: durable home for deck data. localStorage is
  // just the synchronous cache (see storage/storage.ts). Held while boot
  // reconciliation runs, which writes the winner to both homes itself.
  if (!restoring) mirrorToIdb(IDB_KEYS.flashcardDeck, store);
}

/**
 * Settle the held writes against the durable copy: read IndexedDB, merge the
 * current deck over it, and commit to both homes. When IndexedDB cannot be read
 * nothing is mirrored and later writes stay guarded — a copy that could not be
 * seen is never overwritten.
 */
async function verifyPendingWrite(read: (key: string) => Promise<unknown>): Promise<void> {
  let durable: FlashcardDeckStore | null = null;
  let readable = true;
  try {
    durable = normalizeDurableDeck(await read(IDB_KEYS.flashcardDeck));
  } catch {
    readable = false;
  }
  const base = pendingBase;
  pendingBase = null;
  // Everything this window wrote meanwhile is in the cache (or overflow copy).
  const written = readStore();
  lastReadSuspect = null;
  if (!readable) {
    unverifiedBase = base;
    return;
  }
  unverifiedBase = null;
  const next = durable && (durable.cards.length || durable.folders.length)
    ? mergeDeckOverDurable(parseFlashcardDeckStore(base?.baseText ?? null).store, written, durable)
    : written;
  if (next.cards.length !== written.cards.length) {
    logBlanc('warn', 'deck', 'A deck write was based on an unreadable or stale copy; merged it with the durable deck', {
      written: written.cards.length,
      durable: durable?.cards.length ?? 0,
      merged: next.cards.length,
    });
  }
  commitStore(next);
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

/** Test seam: wait until every held deck write has been checked and committed. */
export async function settleDeckWritesForTests(): Promise<void> {
  while (pendingVerify) await pendingVerify;
}

function writeStore(store: FlashcardDeckStore): void {
  const suspect = lastReadSuspect ?? unverifiedBase;
  lastReadSuspect = null;
  const previous = overflowStore?.savedAt ?? 0;
  // Strictly increasing, so two writes in one millisecond still order.
  store.savedAt = Math.max(Date.now(), previous + 1, (store.savedAt ?? 0) + 1);
  if (!restoring && (suspect || pendingVerify)) {
    // The base this write was built on may be missing cards the durable copy
    // has (an emptied or unreadable cache, or another window's overflowed
    // deck). The cache takes it now, marked unverified; IndexedDB only gets
    // it merged with its own copy: a one-card deck with a newer stamp must
    // never be mirrored over the deck.
    if (!pendingVerify) pendingBase = suspect;
    if (!writeCache(store, true)) reportCacheFull(store);
    if (!pendingVerify) {
      pendingVerify = verifyPendingWrite(kvGet).finally(() => {
        pendingVerify = null;
      });
    }
    window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
    return;
  }
  commitStore(store);
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

function normalizeDurableDeck(raw: unknown): FlashcardDeckStore | null {
  if (raw == null) return null;
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return parseFlashcardDeckStore(text).store;
}

export type DeckRestoreOutcome = 'durable' | 'local' | 'empty';

/**
 * Boot reconciliation between the localStorage cache and the IndexedDB copy.
 *
 * The deck used to be read from localStorage only: the IndexedDB copy was
 * written on every change and never read back, so a cache that lost its value
 * (cleared site data, a quota failure the write swallowed) showed an empty or
 * stale deck, and the next write mirrored that over the durable copy.
 *
 * Rule: the copy with the newer `savedAt` wins. Stores written before the stamp
 * existed both read as 0, and then the larger deck wins, because the only way
 * the durable copy can be larger is that the cache lost cards. Cards created in
 * this window while the durable copy was being read are merged into the winner.
 */
export async function restoreDeckFromIdb(
  read: (key: string) => Promise<unknown> = kvGet,
): Promise<DeckRestoreOutcome> {
  if (restoring) return 'local';
  restoring = true;
  createdWhileRestoring = new Set();
  const local = readStore();
  const localStamp = local.savedAt ?? 0;
  let durable: FlashcardDeckStore | null = null;
  try {
    durable = normalizeDurableDeck(await read(IDB_KEYS.flashcardDeck));
  } catch {
    durable = null;
  }
  try {
    const durableStamp = durable?.savedAt ?? 0;
    const durableWins = !!durable && (
      durableStamp > localStamp
      || (durableStamp === localStamp && durable.cards.length > local.cards.length)
    );
    const current = readStore();
    if (!durable || !durableWins) {
      if (!current.cards.length && !current.folders.length) return 'empty';
      if (durable && readOverflowMarker() === DECK_UNVERIFIED && (durable.cards.length || durable.folders.length)) {
        // A write built on an unreadable cache never reached the durable copy
        // (the window closed first). Its newer stamp must not win outright:
        // merge it over the durable deck instead.
        const merged = mergeDeckOverDurable({ folders: [], cards: [] }, current, durable);
        if (!writeCache(merged)) reportCacheFull(merged);
        mirrorToIdb(IDB_KEYS.flashcardDeck, merged);
        window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
        return 'durable';
      }
      // The cache is the newer copy (or the only one): make sure the durable
      // home has it, since a quota failure or an old build may never have
      // mirrored it.
      if (!durable || (current.savedAt ?? 0) > durableStamp) {
        mirrorToIdb(IDB_KEYS.flashcardDeck, current);
      }
      return 'local';
    }
    const known = new Set(durable.cards.map((card) => card.id));
    const createdMeanwhile = current.cards.filter(
      (card) => !known.has(card.id) && createdWhileRestoring.has(card.id),
    );
    const durableFolders = durable.folders;
    const winner: FlashcardDeckStore = {
      folders: [...durableFolders, ...current.folders.filter((f) => !durableFolders.includes(f) && createdMeanwhile.some((c) => c.folder === f))],
      cards: [...createdMeanwhile, ...durable.cards],
      savedAt: Math.max(durableStamp, current.savedAt ?? 0),
    };
    if (!writeCache(winner)) reportCacheFull(winner);
    if (createdMeanwhile.length) mirrorToIdb(IDB_KEYS.flashcardDeck, winner);
    logBlanc('info', 'deck', 'Restored the local deck from its durable copy', {
      cards: winner.cards.length,
      cachedCards: local.cards.length,
    });
    window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
    return 'durable';
  } finally {
    restoring = false;
    createdWhileRestoring = new Set();
  }
}

/** Test seam: forget the in-memory overflow copy. */
export function resetDeckMemoryForTests(): void {
  overflowStore = null;
  overflowText = null;
  restoring = false;
  lastReadSuspect = null;
  pendingBase = null;
  pendingVerify = null;
  unverifiedBase = null;
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
  if (restoring) for (const card of created) createdWhileRestoring.add(card.id);
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
      | 'ankiPending'
      | 'ankiDuplicate'
      | 'sourceUrl'
      | 'bookTitle'
    >
  >,
): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.map((c) => (c.id === id ? { ...c, ...patch } : c));
  writeStore(store);
  return store.cards;
}

/**
 * Write the Deck Workbench's field edits back into the deck, in one persisted
 * write. Only the six text fields a workbench edit can carry are accepted
 * (`shared/ankiWorkbenchPersistence.ts` decides which); ids that are no longer
 * in the deck are reported rather than recreated.
 */
export function applyDeckFieldPatches(
  patches: ReadonlyArray<{
    id: string;
    patch: Partial<Pick<DeckFlashcard, 'word' | 'reading' | 'meaning' | 'sentence' | 'front' | 'back'>>;
  }>,
): { updated: string[]; missing: string[]; cards: DeckFlashcard[] } {
  const store = readStore();
  const byId = new Map(patches.map((entry) => [entry.id, entry.patch]));
  const updated: string[] = [];
  store.cards = store.cards.map((card) => {
    const patch = byId.get(card.id);
    if (!patch) return card;
    updated.push(card.id);
    return { ...card, ...patch };
  });
  const found = new Set(updated);
  const missing = patches.map((entry) => entry.id).filter((id) => !found.has(id));
  if (updated.length) writeStore(store);
  return { updated, missing, cards: store.cards };
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

/**
 * The known-word key a review may speak for, or null.
 *
 * Only single-word cards: a sentence, grammar or kanji card is not evidence
 * about one lemma, and grading "猫が好きです" as a word would put a sentence
 * into the knowledge store that every reader highlight then consults.
 */
export function reviewKnowledgeWord(card: Pick<DeckFlashcard, 'word' | 'sentence' | 'studyKind'>): string | null {
  if (card.studyKind && card.studyKind !== 'vocabulary') return null;
  const word = (card.word ?? '').trim();
  if (!word || word.length > 16) return null;
  if (/[\s。．、，！？!?「」『』()（）]/.test(word)) return null;
  if (card.sentence && card.sentence.trim() === word && word.length > 6) return null;
  return word;
}

/** What one review changed, kept so the review can be taken back. */
export interface DeckReviewUndo {
  cardId: string;
  word: string;
  rating: LocalSrsRating;
  /** The card exactly as it was before the review. */
  previous: DeckFlashcard;
  log: ReviewLogEntry;
  /** Knowledge level before the review changed it, when it did. */
  knowledge?: { word: string; previous: WkLevel };
}

const REVIEW_UNDO_LIMIT = 50;
let reviewUndoStack: DeckReviewUndo[] = [];

/** The most recent review that can still be undone in this window. */
export function peekReviewUndo(): DeckReviewUndo | null {
  return reviewUndoStack[reviewUndoStack.length - 1] ?? null;
}

/** Persist one local review judgement and its next due time atomically. */
export function reviewDeckCard(
  id: string,
  rating: LocalSrsRating,
  reviewedAt = Date.now(),
): DeckFlashcard[] {
  const store = readStore();
  const index = store.cards.findIndex((card) => card.id === id);
  if (index < 0) return store.cards;
  const previous = store.cards[index];
  const next: DeckFlashcard = {
    ...previous,
    known: rating !== 'again' || undefined,
    // Through the seam, never a scheduler directly: the algorithm setting
    // stops meaning anything on whichever path skips it.
    srs: scheduleReview(previous.srs, rating, loadSchedulingConfig(), reviewedAt),
    // First review ever: this card now counts against today's new-card cap.
    ...(previous.srs === undefined && previous.introducedAt === undefined
      ? { introducedAt: reviewedAt }
      : {}),
  };
  store.cards = store.cards.map((card, i) => (i === index ? next : card));
  writeStore(store);
  // A real review action ("Got it"), distinct from folder/import edits — the
  // one flashcard-deck event the city bridge's telemetry collector counts.
  emitCompanionEvent('flashcard');

  // A review is evidence about the word, exactly as an Anki review is: the
  // same interval thresholds decide the level, and a level the user set by
  // hand is never overridden (setInferredLevel skips manual entries).
  let knowledge: DeckReviewUndo['knowledge'];
  const word = reviewKnowledgeWord(next);
  if (word) {
    const level: WkLevel = rating === 'again'
      ? 1
      : levelForIntervalDays(next.srs?.intervalDays ?? 0, getActiveProfile().deckParams.thresholds);
    const prior = setInferredLevel(word, level);
    if (prior !== null) knowledge = { word, previous: prior };
  }
  const log = appendReviewLog({
    at: reviewedAt,
    mode: 'review',
    cardId: id,
    word: next.word,
    rating,
    correct: rating !== 'again',
    prevIntervalDays: previous.srs?.intervalDays ?? 0,
    intervalDays: next.srs?.intervalDays ?? 0,
    ...(previous.srs === undefined ? { isNew: true } : {}),
  });
  reviewUndoStack.push({ cardId: id, word: next.word, rating, previous, log, knowledge });
  if (reviewUndoStack.length > REVIEW_UNDO_LIMIT) reviewUndoStack = reviewUndoStack.slice(-REVIEW_UNDO_LIMIT);
  return store.cards;
}

/**
 * Take back the most recent review: the card's schedule, its known flag, the
 * review-log row and any knowledge level it moved all return to what they were.
 * Returns the undone step (so a review surface can put the card back in front
 * of the user), or null when there is nothing to undo.
 */
export function undoLastReview(): { undo: DeckReviewUndo; cards: DeckFlashcard[] } | null {
  const undo = reviewUndoStack.pop();
  if (!undo) return null;
  const store = readStore();
  let restored = false;
  store.cards = store.cards.map((card) => {
    if (card.id !== undo.cardId) return card;
    restored = true;
    // Only the fields the review wrote: an edit made since (a new meaning,
    // attached audio) must survive the undo.
    const next: DeckFlashcard = { ...card, known: undo.previous.known, srs: undo.previous.srs };
    if (undo.previous.introducedAt === undefined) delete next.introducedAt;
    if (next.known === undefined) delete next.known;
    if (next.srs === undefined) delete next.srs;
    return next;
  });
  if (restored) writeStore(store);
  removeReviewLogEntry(undo.log);
  if (undo.knowledge) setInferredLevel(undo.knowledge.word, undo.knowledge.previous);
  return { undo, cards: store.cards };
}

/** Test seam. */
export function resetReviewUndoForTests(): void {
  reviewUndoStack = [];
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
 * The cards a review session started from `bookKey` would actually contain.
 *
 * One predicate, so the number beside a source in the picker and the number on
 * the Start review button are the same question asked once. D310: the picker
 * counted `filteredDeck` — folder AND the find-box query — while the session
 * pool is folder-only, so typing anything in the find box moved every number in
 * the picker and none of the cards in the session. Measured live: a query
 * matching nothing showed "All in current folder (0)" directly above
 * "Start review (4)".
 *
 * `pool` is the folder-scoped deck (`filterDeckCards(epubCards, folderFilter)`),
 * never the searched one — search is deliberately not a session filter.
 */
export function reviewSessionCards(
  pool: DeckFlashcard[],
  bookKey: string,
  dueOnly: boolean,
  mode: FlashcardReviewMode,
): DeckFlashcard[] {
  const byBook = filterDeckByBook(pool, bookKey);
  const due = dueOnly ? dueDeckCards(byBook) : byBook;
  return mode === 'audio' ? due.filter((card) => card.audioDataUrl || card.audioPath) : due;
}

/**
 * The cards due now, with today's new-card allowance applied.
 *
 * Reads the active study profile's `deckParams.newPerDay`, which the profile
 * editor validated and nothing ever read. The allowance is deck-wide: cards
 * introduced today in one folder use up the same daily budget as another.
 */
export function dueDeckCards<T extends { srs?: unknown }>(
  cards: readonly T[],
  now = Date.now(),
  newPerDay: number | undefined = getActiveProfile().deckParams.newPerDay,
  introducedToday: number = countIntroducedToday(loadDeck(), now),
): T[] {
  return limitNewCards(filterLocalReviewsDue(cards, now), newPerDay, introducedToday);
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
