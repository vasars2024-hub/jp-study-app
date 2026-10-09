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
  | 'lexicon'
  /** Desktop companion: drafted over another Windows app (card preview, wheel, mine-last). */
  | 'companion';

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
  filterLocalReviewsDue,
  limitNewCards,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from '../shared/localSrs';
import type { FlashcardReviewMode } from '../shared/flashcardReview';
import {
  adaptStateForAlgorithm,
  isLeechLapse,
  migrateSrsState,
  resetSrsState,
  scheduleReview,
  type ScheduleOptions,
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
  /** Managed scene clip (mp4/webm) mined from the player, loaded on demand like `imagePath`. */
  clipPath?: string;
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
  /**
   * The queued note kept timing out while Anki answered otherwise, so the
   * queue stopped retrying it; "Add to Anki now" puts it back.
   */
  ankiQueueGaveUp?: boolean;
  /** Page / file the card was mined from, when the surface knows one. */
  sourceUrl?: string;
  /** Tags carried in from an imported deck (Anki note tags). */
  tags?: string[];
  /** Normalised word + sentence + source identity; dedupes repeated mines. */
  mineKey?: string;
  /** Study language a dictionary save belongs to (absent = Japanese). */
  studyLang?: string;
  /** When the card was first reviewed — drives the new-cards-per-day cap. */
  introducedAt?: number;
  /**
   * Kept out of every review sitting until the user lets it back in — what a
   * leech becomes when the leech action is "suspend". The schedule is kept, so
   * unsuspending resumes it rather than starting over.
   */
  suspended?: boolean;
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
import { IDB_KEYS, flushPendingMirrors, mirrorToIdb } from './storage/storage';
import * as kv from './storage/db';
import { isOverEncoded, quarantineIfUnrepaired, unwrapOverEncoded } from '../shared/overEncodedJson';
import { emitCompanionEvent } from './environment/companionEvents';
import { logBlanc } from './blancConsole';
import { levelForIntervalDays } from '../shared/anki';
import { getLevel, isManualLevel, setInferredLevel, type WkLevel } from './knownWords';
import { getStudyLang } from './studyEnvironment';
import { getTokenizer, tokenizeSync, tokenizerReady } from './tokenizer';
import { withoutAnkiOwned } from './ankiSchedulingOwner';
import { getActiveProfile } from './profileState';
import { appendReviewLog, removeReviewLogEntry } from './reviewLog';
import { REVIEW_ANSWER_CAP_MS, type ReviewLogEntry, type ReviewLogSource } from '../shared/reviewLog';

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

// ── Per-card durable writes for reviews ─────────────────────────────────────
//
// A grade changes one card, and used to rewrite the whole deck: JSON.stringify
// and localStorage.setItem of 3.7 MB, plus a structured clone of all 10k cards
// into IndexedDB — 0.35-0.63 s per grade. A grade is now written to IndexedDB
// as that one card (`flashcard-deck-card:<id>`, stamped), committed at once,
// and the cache catches up in one write once the grading pauses. The durable
// deck is the whole-deck record plus every card record stamped after it
// (`readDurableDeck`): boot reconciliation and the suspect-base merge read it
// that way, and a backup holds both (every IndexedDB record is in a snapshot).

/** IndexedDB key prefix of the per-card records a review writes. */
export const FLASHCARD_DECK_CARD_PREFIX = 'flashcard-deck-card:';
/**
 * localStorage marker: the `savedAt` of graded cards that are in IndexedDB but
 * not yet in the cache. Another window that sees it treats its cache read as a
 * suspect base, so its next write merges over the durable deck first.
 */
export const FLASHCARD_DECK_JOURNAL_KEY = 'jp-flashcard-deck-journal';
/** Write the cache this long after the last grade (and at least this often). */
const HOT_SETTLE_MS = 1_500;
const HOT_MAX_WAIT_MS = 10_000;

interface DeckCardRecord {
  card: DeckFlashcard;
  /** The deck `savedAt` of the write that produced this card. */
  at: number;
}

function isCardRecord(value: unknown): value is DeckCardRecord {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<DeckCardRecord>;
  return typeof v.at === 'number' && !!v.card && typeof v.card === 'object' && typeof v.card.id === 'string';
}

/** This window's graded cards that the cache does not have yet. */
let hot: { base: DeckFlashcard[]; store: FlashcardDeckStore; dirty: Map<string, DeckFlashcard> } | null = null;
/** How many per-card records the last durable read found (retired after a reconcile). */
let durableRecordsSeen = 0;
/** The cards array of the cache store the last read was built on. */
let lastCacheCards: DeckFlashcard[] | null = null;
let hotTimer: ReturnType<typeof setTimeout> | null = null;
let hotSince = 0;
let hotWrites: Promise<void> = Promise.resolve();

function readJournalMarker(): number | null {
  try {
    const raw = localStorage.getItem(FLASHCARD_DECK_JOURNAL_KEY);
    if (!raw) return null;
    const stamp = Number(raw);
    return Number.isFinite(stamp) ? stamp : null;
  } catch {
    return null;
  }
}

function setJournalMarker(stamp: number | null): void {
  try {
    if (stamp === null) localStorage.removeItem(FLASHCARD_DECK_JOURNAL_KEY);
    else setCacheItem(FLASHCARD_DECK_JOURNAL_KEY, String(stamp));
  } catch {
    /* the marker is for other windows; the durable write stands without it */
  }
}

/** Whether a review may take the per-card path (nothing is being reconciled). */
function canWriteHot(): boolean {
  return !restoring && !pendingVerify && !lastReadSuspect && !unverifiedBase && !overflowStore && lastCacheCards !== null;
}

/** Every per-card record (a platform or test without range reads has none). */
async function readCardRecords(): Promise<DeckCardRecord[]> {
  let entries: Array<[string, unknown]> = [];
  try {
    entries = await kv.kvScanPrefix(FLASHCARD_DECK_CARD_PREFIX);
  } catch {
    return [];
  }
  return entries.map(([, value]) => value).filter(isCardRecord);
}

/**
 * The durable deck: the whole-deck record with every card record stamped after
 * it applied on top. Throws when the whole-deck record cannot be read, exactly
 * as reading it alone did.
 */
export async function readDurableDeck(
  read: (key: string) => Promise<unknown> = kv.kvGet,
): Promise<FlashcardDeckStore | null> {
  const base = normalizeDurableDeck(await read(IDB_KEYS.flashcardDeck));
  const records = await readCardRecords();
  durableRecordsSeen = records.length;
  const baseStamp = base?.savedAt ?? 0;
  const newer = records.filter((record) => record.at > baseStamp).sort((a, b) => a.at - b.at);
  if (!newer.length) return base;
  const cards = base ? [...base.cards] : [];
  const index = new Map(cards.map((card, i) => [card.id, i]));
  const added: DeckFlashcard[] = [];
  for (const { card } of newer) {
    const at = index.get(card.id);
    if (at !== undefined) {
      cards[at] = card;
    } else {
      // A card the whole-deck record does not have yet (added, then graded,
      // before the record caught up): newer than that record, so it is kept.
      const addedAt = added.findIndex((c) => c.id === card.id);
      if (addedAt >= 0) added[addedAt] = card;
      else added.push(card);
    }
  }
  return {
    folders: base?.folders ?? [],
    cards: [...added, ...cards],
    savedAt: Math.max(baseStamp, newer[newer.length - 1].at),
  };
}

/**
 * Drop the card records a whole-deck record stamped `upTo` already contains,
 * once that record has landed. Judged per record inside one transaction, so a
 * record rewritten meanwhile (a newer grade) is kept.
 */
async function retireCardRecords(upTo: number): Promise<void> {
  try {
    await flushPendingMirrors();
    await kv.kvDeleteWhere(FLASHCARD_DECK_CARD_PREFIX, (value) => isCardRecord(value) && value.at <= upTo);
  } catch {
    /* kept: older than the whole-deck record, so never applied over it */
  }
}

/** A review's write: the changed cards to IndexedDB now, the cache later. */
function writeStoreHot(store: FlashcardDeckStore, changed: readonly DeckFlashcard[]): void {
  const previous = hot?.store.savedAt ?? 0;
  store.savedAt = Math.max(Date.now(), previous + 1, (store.savedAt ?? 0) + 1);
  if (!hot) {
    hot = { base: lastCacheCards ?? store.cards, store, dirty: new Map() };
    hotSince = Date.now();
  }
  hot.store = store;
  for (const card of changed) hot.dirty.set(card.id, card);
  setJournalMarker(store.savedAt);
  const at = store.savedAt;
  const records = changed.map((card) => ({
    type: 'put' as const,
    key: `${FLASHCARD_DECK_CARD_PREFIX}${card.id}`,
    value: { card, at } satisfies DeckCardRecord,
  }));
  hotWrites = hotWrites
    .then(() => kv.kvBatch(records))
    .catch((error: unknown) => {
      // Not durable yet: write the cache and the whole-deck record now instead.
      console.error('[deck] per-card write failed; writing the whole deck', error);
      settleHotDeck();
    });
  scheduleHotSettle();
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

function scheduleHotSettle(): void {
  if (hotTimer) clearTimeout(hotTimer);
  const wait = Math.max(0, Math.min(HOT_SETTLE_MS, hotSince + HOT_MAX_WAIT_MS - Date.now()));
  hotTimer = setTimeout(settleHotDeck, wait);
}

/**
 * Bring the cache and the whole-deck record up to date with the graded cards,
 * in one write, then retire the card records it now contains.
 */
export function settleHotDeck(): void {
  if (hotTimer) clearTimeout(hotTimer);
  hotTimer = null;
  if (!hot) return;
  const store = readStore();
  hot = null;
  commitStore(store);
  setJournalMarker(null);
  const upTo = store.savedAt ?? 0;
  void hotWrites.then(() => retireCardRecords(upTo));
}

/** Test seam: wait for the per-card writes issued so far. */
export async function settleHotWritesForTests(): Promise<void> {
  await hotWrites;
}

if (typeof window !== 'undefined') {
  // Leaving: the graded cards are durable already; put them in the cache too
  // (synchronously), so the next start has nothing to reconcile.
  window.addEventListener('pagehide', () => {
    if (!hot) return;
    const store = readStore();
    if (writeCache(store)) {
      hot = null;
      setJournalMarker(null);
    }
  });
  try {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') settleHotDeck();
    });
  } catch {
    /* no document */
  }
}

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

/**
 * The last parse of the cache, by the exact text it came from. The deck is one
 * 3.7 MB JSON string on a 10k-card profile and nearly every surface reads it —
 * the Flashcards window parsed it ~43 times per render (every due count asked
 * `loadDeck()` again). A read whose text is the text we last parsed or wrote
 * returns that parse. Keyed on the text itself rather than on a stamp, so a
 * write from any source (another window, a restore, a test) invalidates it
 * with no extra bookkeeping; comparing the text is one pointer check when
 * Blink hands back the same string, a memcmp otherwise — never a parse.
 */
let parsedCache: { raw: string; store: FlashcardDeckStore } | null = null;

function rememberParse(raw: string, store: FlashcardDeckStore): void {
  parsedCache = { raw, store: copyStore(store) };
}

/**
 * The deck as this window must see it: the cache, plus this window's graded
 * cards that are durable in IndexedDB but not yet in the cache (`hot`), and
 * marked suspect when another window's grades are in that state.
 */
function readStore(): FlashcardDeckStore {
  const base = readCacheStore();
  lastCacheCards = base.cards;
  if (!hot) {
    const journal = readJournalMarker();
    if (!lastReadSuspect && journal !== null && journal > (base.savedAt ?? 0)) {
      // Another window graded cards the cache does not have yet: they are in
      // IndexedDB, so a write from here merges over the durable deck first.
      lastReadSuspect = { baseText: parsedCache?.raw ?? null };
    }
    return base;
  }
  if (hot.base !== base.cards) {
    // Another window wrote the cache meanwhile: keep its deck, with our grades on top.
    const dirty = hot.dirty;
    const cards = base.cards.map((card) => dirty.get(card.id) ?? card);
    hot.store = { ...base, cards, savedAt: Math.max(base.savedAt ?? 0, hot.store.savedAt ?? 0) };
    hot.base = base.cards;
  }
  return copyStore(hot.store);
}

function readCacheStore(): FlashcardDeckStore {
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
    if (parsedCache && parsedCache.raw === raw) {
      const store = copyStore(parsedCache.store);
      if (marker !== null && marker > (store.savedAt ?? 0)) lastReadSuspect = { baseText: raw };
      return store;
    }
    // v1.0 audit 5.1 — this key accumulated one JSON layer per boot from an old
    // migration-runner bug. A single parse then yields a *string*, both checks
    // below fail, and a real deck reads as empty (measured: 3,221 cards gone,
    // 37.25 MB of text, 5.2 s of blocked main thread per read).
    const { store, layers } = parseFlashcardDeckStore(raw);
    if (layers === 1) rememberParse(raw, store);
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
    rememberParse(text, store);
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
    durable = await readDurableDeck(read);
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
  // `durable` included every per-card record, so the merged deck supersedes them.
  const upTo = next.savedAt ?? 0;
  void hotWrites.then(() => retireCardRecords(upTo));
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

/** Test seam: wait until every held deck write has been checked and committed. */
export async function settleDeckWritesForTests(): Promise<void> {
  while (pendingVerify) await pendingVerify;
}

function writeStore(store: FlashcardDeckStore): void {
  const suspect = lastReadSuspect ?? unverifiedBase;
  lastReadSuspect = null;
  // A whole-deck write carries any graded cards still waiting for the cache
  // (`readStore` returned them), so it settles them too.
  const wasHot = hot !== null;
  if (wasHot) {
    hot = null;
    if (hotTimer) clearTimeout(hotTimer);
    hotTimer = null;
    setJournalMarker(null);
  }
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
      pendingVerify = verifyPendingWrite(kv.kvGet).finally(() => {
        pendingVerify = null;
      });
    }
    window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
    return;
  }
  commitStore(store);
  if (wasHot && !restoring) {
    const upTo = store.savedAt ?? 0;
    void hotWrites.then(() => retireCardRecords(upTo));
  }
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
  read: (key: string) => Promise<unknown> = kv.kvGet,
): Promise<DeckRestoreOutcome> {
  if (restoring) return 'local';
  restoring = true;
  createdWhileRestoring = new Set();
  const local = readStore();
  const localStamp = local.savedAt ?? 0;
  let durable: FlashcardDeckStore | null = null;
  try {
    durable = await readDurableDeck(read);
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
        settleReconciledRecords(current);
      } else if (durableRecordsSeen && (current.savedAt ?? 0) >= durableStamp) {
        // The cache already holds what the card records say (a window wrote it
        // on leaving): fold them into the whole-deck record.
        mirrorToIdb(IDB_KEYS.flashcardDeck, current);
        settleReconciledRecords(current);
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
    if (createdMeanwhile.length || durableRecordsSeen) {
      // Card records (grades from a window that closed before its cache write)
      // are folded into the whole-deck record, then retired.
      mirrorToIdb(IDB_KEYS.flashcardDeck, winner);
      settleReconciledRecords(winner);
    }
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

/** After a reconcile wrote `store` everywhere: clear the marker and retire the records it holds. */
function settleReconciledRecords(store: FlashcardDeckStore): void {
  const upTo = store.savedAt ?? 0;
  const journal = readJournalMarker();
  if (journal !== null && journal <= upTo) setJournalMarker(null);
  if (durableRecordsSeen) void retireCardRecords(upTo);
}

/** Test seam: forget the in-memory overflow copy. */
export function resetDeckMemoryForTests(): void {
  parsedCache = null;
  hot = null;
  lastCacheCards = null;
  if (hotTimer) clearTimeout(hotTimer);
  hotTimer = null;
  hotWrites = Promise.resolve();
  durableRecordsSeen = 0;
  introducedMemo = null;
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
      | 'clipPath'
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
      | 'ankiQueueGaveUp'
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
 * "Add to review now" (the Game Arena's post-game review): bring a scheduled card's due
 * time forward to `now`, so it is in today's reviews. Nothing else about its schedule
 * changes — the next real review grades it as usual. A card with no schedule is already
 * due by definition and is left as it is. Returns whether a card moved.
 */
export function dueDeckCardNow(id: string, now = Date.now()): boolean {
  const store = readStore();
  const index = store.cards.findIndex((card) => card.id === id);
  if (index < 0) return false;
  const card = store.cards[index];
  if (!card.srs || !Number.isFinite(card.srs.dueAt) || card.srs.dueAt <= now) return false;
  const next: DeckFlashcard = { ...card, srs: { ...card.srs, dueAt: now } };
  store.cards = store.cards.map((entry, i) => (i === index ? next : entry));
  if (canWriteHot()) writeStoreHot(store, [next]);
  else writeStore(store);
  return true;
}

/**
 * The known-word key a review may speak for, or null.
 *
 * Only single-word cards: a sentence, grammar or kanji card is not evidence
 * about one lemma, and grading "猫が好きです" as a word would put a sentence
 * into the knowledge store that every reader highlight then consults.
 */
export function reviewKnowledgeWord(
  card: Pick<DeckFlashcard, 'word' | 'sentence' | 'studyKind'> & Partial<Pick<DeckFlashcard, 'studyLang'>>,
): string | null {
  if (card.studyKind && card.studyKind !== 'vocabulary') return null;
  // The knowledge store is per study language: a Chinese card reviewed while
  // studying Japanese must not land in the Japanese store (or vice versa).
  const cardLang = card.studyLang || 'ja';
  if (cardLang !== getStudyLang()) return null;
  const word = (card.word ?? '').trim();
  if (!word || word.length > 16) return null;
  // 〜/～ marks a grammar pattern ("〜てしまう"): grammar cards saved before
  // they carried `studyKind: 'grammar'` are still recognised by it.
  if (/[\s。．、，！？!?「」『』()（）〜～~]/.test(word)) return null;
  if (card.sentence && card.sentence.trim() === word && word.length > 6) return null;
  return cardLang === 'ja' ? knowledgeLemma(word) : word;
}

/**
 * The lemma the knowledge store keys a Japanese word under, exactly as the
 * reader and the Anki sync do: "食べた" is graded as "食べる", so every
 * inflected form highlights. Only a word that is ONE content token (plus
 * inflection) is reduced — a compound such as 日本語 stays whole rather than
 * collapsing to its first part. Unchanged while the tokenizer is not built.
 */
export function knowledgeLemma(word: string): string {
  if (!tokenizerReady()) return word;
  let tokens: ReturnType<typeof tokenizeSync>;
  try {
    tokens = tokenizeSync(word);
  } catch {
    return word;
  }
  if (!tokens.length || !tokens[0].content) return word;
  if (tokens.filter((token) => token.content).length !== 1) return word;
  const lemma = tokens[0].lemma;
  return lemma && lemma !== '*' ? lemma : word;
}

/**
 * What a passing review of a SENTENCE card may speak for, or null.
 *
 * `reviewKnowledgeWord` keeps sentences out of the store, so a sentence deck
 * used to leave known words untouched however well it went. The rule here is
 * deliberately conservative: a sentence card with its own target word speaks
 * for that word only; a pure sentence card (the word IS the line) speaks for
 * its content words, and only to nudge the ones already being learned
 * (`sentenceKnowledgeNudges`). One Good on a sentence never marks a word Known.
 */
export type SentenceKnowledgeTarget =
  | { kind: 'word'; word: string }
  | { kind: 'sentence'; text: string };

export function sentenceKnowledgeTarget(
  card: Pick<DeckFlashcard, 'word' | 'sentence' | 'studyKind'> & Partial<Pick<DeckFlashcard, 'studyLang'>>,
): SentenceKnowledgeTarget | null {
  const word = (card.word ?? '').trim();
  const sentence = (card.sentence ?? '').trim();
  const isSentenceCard = card.studyKind === 'sentence' || (!card.studyKind && !!sentence && sentence === word);
  if (!isSentenceCard) return null;
  // A plain short card whose sentence equals its word is already graded as a word.
  if (!card.studyKind && reviewKnowledgeWord(card)) return null;
  const cardLang = card.studyLang || 'ja';
  if (cardLang !== getStudyLang()) return null;
  // A target word needs a separate sentence; with no sentence the word IS the line.
  if (word && sentence && word !== sentence && word.length <= 16 && !/[\s。．、，！？!?「」『』()（）〜～~]/.test(word)) {
    return { kind: 'word', word: cardLang === 'ja' ? knowledgeLemma(word) : word };
  }
  const text = sentence || word;
  // Content-word nudges need the Japanese tokenizer.
  if (!text || cardLang !== 'ja') return null;
  return { kind: 'sentence', text };
}

/** At most this many words move per sentence review. */
const SENTENCE_NUDGE_LIMIT = 8;

/**
 * The words a passing review of a pure sentence nudges: distinct content-word
 * lemmas the learner already has at Learning (1), raised to Familiar (2). New
 * words stay new (one sentence is not evidence about a word never studied),
 * Familiar and Known stay put, and a hand-set level is never touched.
 */
export function sentenceKnowledgeNudges(
  tokens: ReadonlyArray<{ lemma: string; surface?: string; content: boolean }>,
  levelOf: (word: string) => WkLevel,
  isManual: (word: string) => boolean,
  limit = SENTENCE_NUDGE_LIMIT,
): Array<{ word: string; level: WkLevel }> {
  const seen = new Set<string>();
  const out: Array<{ word: string; level: WkLevel }> = [];
  for (const token of tokens) {
    if (!token.content) continue;
    const lemma = token.lemma && token.lemma !== '*' ? token.lemma : (token.surface ?? '');
    if (!lemma || seen.has(lemma)) continue;
    seen.add(lemma);
    if (isManual(lemma) || levelOf(lemma) !== 1) continue;
    out.push({ word: lemma, level: 2 });
    if (out.length >= limit) break;
  }
  return out;
}

/**
 * Apply a passing sentence review to the knowledge store; every change is
 * recorded into `changes` so the review can be undone. Never blocks the review:
 * without a built tokenizer the nudge waits for it off the review path.
 */
function applySentenceKnowledge(
  target: SentenceKnowledgeTarget,
  intervalDays: number,
  changes: Array<{ word: string; previous: WkLevel }>,
): void {
  if (target.kind === 'word') {
    // Only ever raises: a sentence missed may have been missed for another word.
    const level = levelForIntervalDays(intervalDays, getActiveProfile().deckParams.thresholds);
    if (level <= getLevel(target.word)) return;
    const prior = setInferredLevel(target.word, level);
    if (prior !== null) changes.push({ word: target.word, previous: prior });
    return;
  }
  const nudge = (): void => {
    let tokens: ReturnType<typeof tokenizeSync>;
    try {
      tokens = tokenizeSync(target.text);
    } catch {
      return;
    }
    for (const { word, level } of sentenceKnowledgeNudges(tokens, getLevel, isManualLevel)) {
      const prior = setInferredLevel(word, level);
      if (prior !== null) changes.push({ word, previous: prior });
    }
  };
  if (tokenizerReady()) nudge();
  else void getTokenizer().then(nudge, () => undefined);
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
  /** Levels a sentence-card review moved (may fill in after the tokenizer loads). */
  sentenceKnowledge?: Array<{ word: string; previous: WkLevel }>;
  /** Set when this review made the card a leech: what the leech action did. */
  leech?: { tagged: boolean; suspended: boolean };
}

/** What a review surface knows about one answer beyond its rating. */
export interface DeckReviewDetails {
  /** Milliseconds from the card being shown to the grade. Capped when logged. */
  durationMs?: number;
  /** Not a review surface (a Game Arena answer): kept out of FSRS training and true retention. */
  source?: ReviewLogSource;
}

/** The tag a leech gets, as in Anki. */
export const LEECH_TAG = 'leech';

/**
 * Reviews already due on each day from `now`, for load balancing. Built only
 * when spreading is switched on, once per graded card.
 */
function dueLoadFor(cards: readonly DeckFlashcard[], now: number): (dayOffset: number) => number {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  const perDay = new Map<number, number>();
  for (const card of cards) {
    const due = card.srs?.dueAt;
    if (card.suspended || typeof due !== 'number' || !Number.isFinite(due) || due < from) continue;
    const offset = Math.floor((due - from) / (24 * 60 * 60 * 1000));
    perDay.set(offset, (perDay.get(offset) ?? 0) + 1);
  }
  return (dayOffset) => perDay.get(dayOffset) ?? 0;
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
  details: DeckReviewDetails = {},
): DeckFlashcard[] {
  const store = readStore();
  const index = store.cards.findIndex((card) => card.id === id);
  if (index < 0) return store.cards;
  const previous = store.cards[index];
  const config = loadSchedulingConfig();
  // Fuzz is seeded from the card id; the load map is only built when the user
  // asked for reviews to be spread.
  const options: ScheduleOptions = config.fuzz
    ? { fuzzKey: id, dueLoad: dueLoadFor(store.cards, reviewedAt) }
    : {};
  const next: DeckFlashcard = {
    ...previous,
    known: rating !== 'again' || undefined,
    // Through the seam, never a scheduler directly: the algorithm setting
    // stops meaning anything on whichever path skips it.
    srs: scheduleReview(previous.srs, rating, config, reviewedAt, options),
    // First review ever: this card now counts against today's new-card cap.
    ...(previous.srs === undefined && previous.introducedAt === undefined
      ? { introducedAt: reviewedAt }
      : {}),
  };
  // A lapse that reaches a leech point tags the card and, when the user chose
  // it, suspends it. Undo restores both (it restores the whole previous card's
  // tag list and suspension).
  let leech: DeckReviewUndo['leech'];
  const lapses = next.srs?.lapses ?? 0;
  if (lapses > (previous.srs?.lapses ?? 0) && isLeechLapse(lapses, config.leechThreshold)) {
    const tags = previous.tags ?? [];
    const tagged = !tags.includes(LEECH_TAG);
    if (tagged) next.tags = [...tags, LEECH_TAG];
    const suspended = config.leechAction === 'suspend' && !previous.suspended;
    if (suspended) next.suspended = true;
    leech = { tagged, suspended };
  }
  store.cards = store.cards.map((card, i) => (i === index ? next : card));
  // One card changed: write that card durably now, the whole deck later.
  if (canWriteHot()) writeStoreHot(store, [next]);
  else writeStore(store);
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
  let sentenceKnowledge: DeckReviewUndo['sentenceKnowledge'];
  if (!word && (rating === 'good' || rating === 'easy')) {
    const target = sentenceKnowledgeTarget(next);
    if (target) {
      sentenceKnowledge = [];
      applySentenceKnowledge(target, next.srs?.intervalDays ?? 0, sentenceKnowledge);
    }
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
    ...(typeof details.durationMs === 'number' && Number.isFinite(details.durationMs) && details.durationMs >= 0
      ? { durationMs: Math.min(REVIEW_ANSWER_CAP_MS, Math.round(details.durationMs)) }
      : {}),
    ...(details.source ? { source: details.source } : {}),
  });
  reviewUndoStack.push({ cardId: id, word: next.word, rating, previous, log, knowledge, sentenceKnowledge, leech });
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
  let restored: DeckFlashcard | null = null;
  store.cards = store.cards.map((card) => {
    if (card.id !== undo.cardId) return card;
    // Only the fields the review wrote: an edit made since (a new meaning,
    // attached audio) must survive the undo.
    const next: DeckFlashcard = { ...card, known: undo.previous.known, srs: undo.previous.srs };
    if (undo.previous.introducedAt === undefined) delete next.introducedAt;
    if (next.known === undefined) delete next.known;
    if (next.srs === undefined) delete next.srs;
    // The leech action is part of the review, so it is taken back with it.
    if (undo.leech?.tagged) {
      const tags = (next.tags ?? []).filter((tag) => tag !== LEECH_TAG);
      if (tags.length) next.tags = tags;
      else delete next.tags;
    }
    if (undo.leech?.suspended) delete next.suspended;
    restored = next;
    return next;
  });
  if (restored) {
    if (canWriteHot()) writeStoreHot(store, [restored]);
    else writeStore(store);
  }
  removeReviewLogEntry(undo.log);
  if (undo.knowledge) setInferredLevel(undo.knowledge.word, undo.knowledge.previous);
  // Newest first, so a word moved twice ends at its oldest level.
  for (const change of [...(undo.sentenceKnowledge ?? [])].reverse()) setInferredLevel(change.word, change.previous);
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

/**
 * Several decks at once — a "mix" sitting (two episodes' sentence decks and a
 * book, say). The same key as `filterDeckByBook`, asked of a set; an empty
 * set is an empty mix, never "all".
 */
export function filterDeckByBooks(cards: DeckFlashcard[], bookKeys: readonly string[]): DeckFlashcard[] {
  if (bookKeys.includes('all')) return cards;
  const wanted = new Set(bookKeys);
  return cards.filter((c) => wanted.has(`${c.bookId || 'unknown'}::${c.bookTitle || 'Unknown source'}`));
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

import { legacyDeckBookId, type ImportDeckEntry } from '../shared/deckImport';
import { planDeckUpsert, type DeckUpsertGroup } from '../shared/deckUpsert';

export interface DeckUpsertOptions {
  /** Delete group cards the file no longer has. The UI confirms this first. */
  removeMissing?: boolean;
  /** Match cards stored under the pre-2026-09 id for the same title too. */
  legacy?: DeckUpsertGroup['legacy'];
}

export interface DeckUpsertResult {
  added: DeckFlashcard[];
  updated: number;
  unchanged: number;
  removed: number;
  /** Group cards the file does not have (kept unless `removeMissing`). */
  missing: number;
}

/** What `upsertImportedDeck` would do, without writing. */
export function previewDeckUpsert(
  bookId: string,
  entries: readonly Omit<DeckFlashcard, 'id' | 'addedAt'>[],
  options: Pick<DeckUpsertOptions, 'legacy'> = {},
): { added: number; updated: number; unchanged: number; missing: number } {
  const plan = planDeckUpsert(readStore().cards, { bookId, legacy: options.legacy }, entries);
  return {
    added: plan.added.length,
    updated: plan.updated.length,
    unchanged: plan.unchanged.length,
    missing: plan.missing.length,
  };
}

/**
 * Import a deck file as an update of the cards it made before: matched cards
 * keep their id and review state and take the file's text, new rows become new
 * cards, and nothing is deleted unless `removeMissing` says so. See
 * `shared/deckUpsert.ts`. One persisted write.
 */
export function upsertImportedDeck(
  bookId: string,
  entries: readonly Omit<DeckFlashcard, 'id' | 'addedAt'>[],
  options: DeckUpsertOptions = {},
): DeckUpsertResult {
  const store = readStore();
  const plan = planDeckUpsert(store.cards, { bookId, legacy: options.legacy }, entries);
  const replaced = new Map(plan.updated.map((c) => [c.id, c]));
  const removedIds = options.removeMissing ? new Set(plan.missing.map((c) => c.id)) : new Set<string>();
  const now = Date.now();
  const created: DeckFlashcard[] = plan.added.map((entry, index) => ({
    ...entry,
    bookId,
    id: newId(),
    addedAt: now + index,
  }));
  for (const card of created) {
    if (card.folder && !store.folders.includes(card.folder)) store.folders = [...store.folders, card.folder];
  }
  store.cards = [
    ...created,
    ...store.cards
      .filter((c) => !removedIds.has(c.id))
      .map((c) => replaced.get(c.id) ?? c),
  ];
  if (restoring) for (const card of created) createdWhileRestoring.add(card.id);
  if (created.length || replaced.size || removedIds.size) writeStore(store);
  return {
    added: created,
    updated: plan.updated.length,
    unchanged: plan.unchanged.length,
    removed: removedIds.size,
    missing: plan.missing.length,
  };
}

/**
 * The import path of the CSV editor and the deck import panel. An update, not
 * a replacement: before 2026-09 this went through `replaceImportedDeck`, which
 * reset the review progress of every card in the deck on each re-import.
 */
export function importDeckFromEntries(
  entries: ImportDeckEntry[],
  options: Omit<DeckUpsertOptions, 'legacy'> = {},
): DeckUpsertResult {
  if (!entries.length) return { added: [], updated: 0, unchanged: 0, removed: 0, missing: 0 };
  const bookId = entries[0].bookId;
  const bookTitle = entries[0].bookTitle;
  return upsertImportedDeck(bookId, entries, {
    ...options,
    legacy: { bookId: legacyDeckBookId(bookTitle), bookTitle },
  });
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
  bookKey: string | readonly string[],
  dueOnly: boolean,
  mode: FlashcardReviewMode,
): DeckFlashcard[] {
  const byBook = typeof bookKey === 'string' ? filterDeckByBook(pool, bookKey) : filterDeckByBooks(pool, bookKey);
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
export function dueDeckCards<T extends { srs?: unknown; ankiNoteId?: number; ankiExported?: boolean; ankiPending?: boolean; ankiDuplicate?: boolean; suspended?: boolean }>(
  cards: readonly T[],
  now = Date.now(),
  newPerDay: number | undefined = getActiveProfile().deckParams.newPerDay,
  introducedToday: number = introducedTodayCount(now),
): T[] {
  // "Anki owns scheduling": a card with an Anki twin is reviewed there only.
  // A suspended card (a leech the user chose to park) is due nowhere.
  const live = withoutAnkiOwned(cards).filter((card) => !card.suspended);
  return limitNewCards(filterLocalReviewsDue(live, now), newPerDay, introducedToday);
}

let introducedMemo: { cards: readonly DeckFlashcard[]; from: number; stamps: number[] } | null = null;

/**
 * Cards introduced today across the whole deck — the new-card budget already
 * spent. Same answer as `countIntroducedToday(loadDeck(), now)`, but the scan is
 * done once per deck version and day: it was a default parameter, so every due
 * count parsed and scanned the whole deck again.
 */
export function introducedTodayCount(now = Date.now()): number {
  const cards = loadDeck();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const from = start.getTime();
  if (!introducedMemo || introducedMemo.cards !== cards || introducedMemo.from !== from) {
    const stamps: number[] = [];
    for (const card of cards) {
      if (typeof card.introducedAt === 'number' && card.introducedAt >= from) stamps.push(card.introducedAt);
    }
    stamps.sort((a, b) => a - b);
    introducedMemo = { cards, from, stamps };
  }
  // Introduced at or before `now` (binary search over today's stamps).
  const { stamps } = introducedMemo;
  let lo = 0;
  let hi = stamps.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (stamps[mid] <= now) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/**
 * `reviewSessionCards(pool, key, dueOnly, mode).length` for every source the
 * review picker offers — `'all'` and each `bookId::bookTitle` in `pool` — in
 * one pass. The picker asked the predicate once per <option>, and each ask
 * scanned the pool and parsed the whole deck.
 */
export function reviewSessionCounts(
  pool: DeckFlashcard[],
  dueOnly: boolean,
  mode: FlashcardReviewMode,
  now = Date.now(),
): Map<string, number> {
  const newPerDay = getActiveProfile().deckParams.newPerDay;
  const introduced = introducedTodayCount(now);
  const sessionSize = (cards: DeckFlashcard[]): number => {
    const due = dueOnly ? dueDeckCards(cards, now, newPerDay, introduced) : cards;
    return mode === 'audio' ? due.filter((card) => card.audioDataUrl || card.audioPath).length : due.length;
  };
  const byBook = new Map<string, DeckFlashcard[]>();
  for (const card of pool) {
    const key = `${card.bookId || 'unknown'}::${card.bookTitle || 'Unknown source'}`;
    const list = byBook.get(key);
    if (list) list.push(card);
    else byBook.set(key, [card]);
  }
  const counts = new Map<string, number>([['all', sessionSize(pool)]]);
  for (const [key, cards] of byBook) counts.set(key, sessionSize(cards));
  return counts;
}

/** Lapses at which a card counts as a leech (Anki's default threshold). */
export const LEECH_LAPSE_THRESHOLD = 8;

/** The user's leech threshold (Settings), defaulting to Anki's eight. */
export function leechThreshold(): number {
  return loadSchedulingConfig().leechThreshold;
}

export function isLeechCard(card: Pick<DeckFlashcard, 'srs'>): boolean {
  return (card.srs?.lapses ?? 0) >= leechThreshold();
}

/** What the find box holds while it is narrowed to leeches. */
export const LEECH_QUERY = 'is:leech';
/** What the find box holds while it is narrowed to suspended cards. */
export const SUSPENDED_QUERY = 'is:suspended';

/**
 * Suspend or unsuspend cards. The schedule is untouched either way, so a card
 * let back in picks up where it was. Returns how many cards actually changed.
 */
export function setDeckCardsSuspended(ids: readonly string[], suspended: boolean): number {
  const wanted = new Set(ids);
  const store = readStore();
  const changed: DeckFlashcard[] = [];
  store.cards = store.cards.map((card) => {
    if (!wanted.has(card.id) || Boolean(card.suspended) === suspended) return card;
    const next: DeckFlashcard = { ...card };
    if (suspended) next.suspended = true;
    else delete next.suspended;
    changed.push(next);
    return next;
  });
  if (changed.length) {
    if (canWriteHot()) writeStoreHot(store, changed);
    else writeStore(store);
  }
  return changed.length;
}

/**
 * `added:2026-10-07`, `reviewed:2026-10-07`, `due:2026-10-09` — the deck narrowed to one local
 * day. The Calendar's day view links here ("show these cards"), and the same words typed in
 * the find box do the same thing. `due:` is every scheduled card due by the end of that day.
 */
export const DECK_DATE_QUERY = /^(added|reviewed|due):(\d{4}-\d{2}-\d{2})$/;
export type DeckDateQueryKind = 'added' | 'reviewed' | 'due';

function localDateKeyOf(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** The end (exclusive) of a local `YYYY-MM-DD`, in epoch ms. */
export function endOfLocalDay(dateKey: string): number {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, (m || 1) - 1, (d || 1) + 1).getTime();
}

export function deckCardMatchesDate(
  card: Pick<DeckFlashcard, 'addedAt' | 'srs'>,
  kind: DeckDateQueryKind,
  dateKey: string,
): boolean {
  if (kind === 'added') return Number.isFinite(card.addedAt) && localDateKeyOf(card.addedAt) === dateKey;
  const srs = card.srs;
  if (!srs || typeof srs !== 'object') return false;
  if (kind === 'reviewed') {
    return Number.isFinite(srs.lastReviewedAt) && srs.lastReviewedAt > 0 && localDateKeyOf(srs.lastReviewedAt) === dateKey;
  }
  return Number.isFinite(srs.dueAt) && srs.dueAt < endOfLocalDay(dateKey);
}

/**
 * "Study ahead": the scheduled cards due by the end of `dateKey`, soonest first, without the
 * cards Anki schedules. New cards are not included — studying ahead brings reviews forward,
 * it does not spend tomorrow's new-card allowance today.
 */
export function aheadDeckCards<T extends Pick<DeckFlashcard, 'srs' | 'ankiNoteId' | 'ankiExported' | 'ankiPending' | 'ankiDuplicate' | 'suspended'>>(
  cards: readonly T[],
  dateKey: string,
): T[] {
  const until = endOfLocalDay(dateKey);
  return withoutAnkiOwned(cards)
    .filter((card) => !card.suspended && card.srs && Number.isFinite(card.srs.dueAt) && card.srs.dueAt < until)
    .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0));
}

/**
 * Substring search across every field a user can read on a card, so typing a
 * deck name, a reading, or a remembered fragment of the mined sentence all
 * narrow the same box. Case- and Unicode-width-insensitive (including composed
 * dakuten); an empty or whitespace query returns the input untouched.
 * `is:leech` instead narrows the deck to cards that keep failing.
 */
export function searchDeckCards(cards: DeckFlashcard[], query: string): DeckFlashcard[] {
  const q = query.normalize('NFKC').trim().toLowerCase();
  if (!q) return cards;
  if (q === LEECH_QUERY) {
    const threshold = leechThreshold();
    return cards.filter((card) => (card.srs?.lapses ?? 0) >= threshold);
  }
  if (q === SUSPENDED_QUERY) return cards.filter((card) => card.suspended === true);
  const dated = DECK_DATE_QUERY.exec(q);
  if (dated) return cards.filter((c) => deckCardMatchesDate(c, dated[1] as DeckDateQueryKind, dated[2]));
  return cards.filter((c) =>
    [c.word, c.reading, c.meaning, c.front, c.back, c.sentence, c.bookTitle].some((field) =>
      field ? field.normalize('NFKC').toLowerCase().includes(q) : false,
    ),
  );
}

/** Grouping sentinel for cards with no source title; show t('flash.unknownSource') at render time. */
export const UNKNOWN_BOOK_TITLE = 'Unknown source';

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

/** Storage keys whose change (from another window) can change what `loadDeck` returns. */
const DECK_STORAGE_KEYS = new Set<string | null>([FLASHCARD_DECK_STORAGE_KEY, FLASHCARD_DECK_OVERFLOW_KEY, null]);

export function onDeckChanged(cb: () => void): () => void {
  const handler = (): void => cb();
  // Any other key's `storage` event is someone else's data. Re-reading the deck
  // for each of them (theme, known words, every setting) re-parsed 3.7 MB each.
  const storageHandler = (e: StorageEvent): void => {
    if (DECK_STORAGE_KEYS.has(e.key)) cb();
  };
  window.addEventListener(FLASHCARD_DECK_EVENT, handler);
  window.addEventListener('storage', storageHandler);
  return () => {
    window.removeEventListener(FLASHCARD_DECK_EVENT, handler);
    window.removeEventListener('storage', storageHandler);
  };
}
