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
  isLocalSrsState,
  limitNewCards,
  type LocalSrsAlgorithm,
  type LocalSrsRating,
  type LocalSrsState,
} from '../shared/localSrs';
import type { FlashcardReviewMode } from '../shared/flashcardReview';
import { localDueForecast, type LocalDueForecast } from '../shared/reviewForecast';
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
  /** The line or two before the example sentence, as context (visual novel mining). */
  contextBefore?: string;
  /** The line or two after it, when they were already captured (visual novel mining). */
  contextAfter?: string;
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
  /**
   * The card's version: the stamp of its newest change (wall-clock ms, strictly
   * increasing per card). Absent on a card nobody changed since versions existed.
   */
  rev?: number;
  /**
   * When each field last changed (`srs`, `known` and `introducedAt` share the
   * `srs` stamp: a review writes them together). Two windows that changed the
   * same card merge field by field, the newer stamp winning, so an edit in one
   * window never overwrites a review in another (`mergeCardVersions`).
   */
  fieldRev?: Record<string, number>;
  /**
   * Typed answers the learner explicitly accepted as correct for this card
   * ("Accept my answer as correct" after a "Why was I wrong?"). `meaning` holds
   * answers to word→meaning questions, `target` answers to meaning→word ones.
   * Only ever added by an explicit user action (`addDeckCardAcceptedAnswer`).
   */
  acceptedAnswers?: { meaning?: string[]; target?: string[] };
  /** Example sentences the learner chose to keep (AI i+1 sentences or corpus ones). */
  exampleSentences?: import('../shared/aiExampleSentences').CardExampleSentence[];
  /** A memory hook the learner approved (leech rescue). */
  mnemonic?: string;
  /** How this card differs from similar ones, as the learner approved it (leech rescue). */
  distinction?: string;
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
  fingerprintLocalDeck,
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
import { ankiOwnsScheduling, hasAnkiTwin, withoutAnkiOwned } from './ankiSchedulingOwner';
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
    return { store: deckStoreFromValue(value), layers };
  } catch {
    return { store: { folders: [], cards: [] }, layers: 0 };
  }
}

/**
 * The acceptance rule of `parseFlashcardDeckStore`, applied to a value that is
 * already an object (an IndexedDB record). The durable read used to round-trip
 * such a record through `JSON.stringify` + `JSON.parse` just to reach this rule
 * — 8 MB each way on a 20,000-card deck, at every boot reconciliation.
 */
function deckStoreFromValue(value: unknown): FlashcardDeckStore {
  const parsed = (value ?? {}) as Partial<FlashcardDeckStore>;
  return {
    folders: Array.isArray(parsed.folders)
      ? parsed.folders.filter((folder): folder is string => typeof folder === 'string')
      : [],
    cards: Array.isArray(parsed.cards)
      ? parsed.cards.filter((card): card is DeckFlashcard => !!card && typeof card.id === 'string')
      : [],
    ...(typeof parsed.savedAt === 'number' && Number.isFinite(parsed.savedAt)
      ? { savedAt: parsed.savedAt }
      : {}),
  };
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
/**
 * The last cache write that did not fit. Retrying it re-serialised the whole
 * deck (8 MB on 20,000 cards, ~40 ms) on every write only to hit the same
 * quota; while the deck has not shrunk, and for a few minutes, the write is
 * known to overflow and goes straight to the overflow path — exactly what a
 * failed attempt would have done, without the attempt.
 */
let overflowAttempt: { cards: number; at: number } | null = null;
const OVERFLOW_RETRY_MS = 5 * 60_000;

/** `overflowText`, serialised on demand when the write that set it skipped the attempt. */
function overflowBaseText(): string | null {
  if (overflowText === null && overflowStore) {
    try {
      overflowText = JSON.stringify(overflowStore);
    } catch {
      /* stays null: the merge then treats the base as unknown, as before */
    }
  }
  return overflowText;
}
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

// ── Per-card versions ───────────────────────────────────────────────────────
//
// Two windows (Study OS and Blanc) can hold the same card. Writes used to be
// resolved card by card — whichever copy was written last won whole — so an
// edit in one window (its copy predating the grade) silently undid a review
// made in the other, most easily on a deck too big for the cache, where no
// window sees another's writes until it reads IndexedDB. Every change now
// stamps the fields it touched (`fieldRev`) and the card (`rev`), and every
// place two copies of a card meet merges them field by field, newer stamp
// first: the per-card record write, the durable read, the cache catch-up, the
// suspect-base merge and boot reconciliation. A review (the `srs` group) is a
// field like any other, so it survives any edit made elsewhere; two reviews of
// one card keep the later one (both stay in the review log).

/** Fields a review writes together; one stamp, so a merge never splits a schedule. */
const REVIEW_FIELDS: ReadonlySet<string> = new Set(['srs', 'known', 'introducedAt']);
/** Bookkeeping, not content: never stamped or merged as a field. */
const VERSION_FIELDS: ReadonlySet<string> = new Set(['id', 'rev', 'fieldRev']);

function stampKey(field: string): string {
  return REVIEW_FIELDS.has(field) ? 'srs' : field;
}

function sameFieldValue(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false;
  try {
    return JSON.stringify(left) === JSON.stringify(right);
  } catch {
    return false;
  }
}

/**
 * Stamp the fields `next` changed relative to `prev` (same card), in place.
 * `next` must be the new object a write created, never a published snapshot's.
 * A card already stamped by this write (its `rev` moved) is left alone.
 */
export function stampCardChange(prev: DeckFlashcard | undefined, next: DeckFlashcard, now = Date.now()): DeckFlashcard {
  if (!prev || prev === next || prev.id !== next.id) return next;
  if (next.rev !== undefined && next.rev !== prev.rev) return next;
  const before = prev as unknown as Record<string, unknown>;
  const after = next as unknown as Record<string, unknown>;
  const changed = new Set<string>();
  for (const key of Object.keys(before)) {
    if (!VERSION_FIELDS.has(key) && !sameFieldValue(before[key], after[key])) changed.add(stampKey(key));
  }
  for (const key of Object.keys(after)) {
    if (!VERSION_FIELDS.has(key) && !(key in before) && after[key] !== undefined) changed.add(stampKey(key));
  }
  if (!changed.size) return next;
  const stamp = Math.max(now, (prev.rev ?? 0) + 1);
  const fieldRev = { ...prev.fieldRev };
  for (const key of changed) fieldRev[key] = stamp;
  next.rev = stamp;
  next.fieldRev = fieldRev;
  return next;
}

/** `a` holds every stamp of `b` at least as new. */
function stampsCover(a: Record<string, number> | undefined, b: Record<string, number> | undefined): boolean {
  if (!b) return true;
  for (const key in b) if ((a?.[key] ?? 0) < b[key]) return false;
  return true;
}

/**
 * Two copies of one card, merged field by field: each field (review fields as
 * one group) comes from the copy whose stamp for it is newer. On a tie — both
 * unstamped, as every card written before versions existed is — `preferMine`
 * picks `mine` (`theirs` when false). Returns `mine` or `theirs` itself when
 * the preferred copy already holds every newer stamp.
 */
export function mergeCardVersions(theirs: DeckFlashcard, mine: DeckFlashcard, preferMine = true): DeckFlashcard {
  if (theirs === mine) return mine;
  const tr = theirs.fieldRev;
  const mr = mine.fieldRev;
  if (preferMine && stampsCover(mr, tr)) return mine;
  if (!preferMine && stampsCover(tr, mr)) return theirs;
  const left = theirs as unknown as Record<string, unknown>;
  const right = mine as unknown as Record<string, unknown>;
  const out: Record<string, unknown> = { id: mine.id };
  for (const key of new Set([...Object.keys(left), ...Object.keys(right)])) {
    if (VERSION_FIELDS.has(key)) continue;
    const group = stampKey(key);
    const m = mr?.[group] ?? 0;
    const t = tr?.[group] ?? 0;
    const fromMine = m > t || (m === t && preferMine);
    const value = fromMine ? right[key] : left[key];
    if (value !== undefined) out[key] = value;
  }
  const fieldRev: Record<string, number> = { ...tr };
  for (const key in mr) fieldRev[key] = Math.max(fieldRev[key] ?? 0, mr[key]);
  if (Object.keys(fieldRev).length) out.fieldRev = fieldRev;
  const rev = Math.max(mine.rev ?? 0, theirs.rev ?? 0);
  if (rev > 0) out.rev = rev;
  return out as unknown as DeckFlashcard;
}

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
/** The journal stamp this window wrote last: any other value is another window's grades. */
let ownJournalStamp: number | null = null;
/** When a read last found the deck moved by someone else (see `retireCardRecords`). */
let otherWindowSeenAt = 0;
/** The cards array the last `readStore` returned: what a whole write is diffed against for stamps. */
let lastReadCards: readonly DeckFlashcard[] | null = null;

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
  // An overflowed deck (the cache could not hold it: every deck past ~5M
  // characters, i.e. most 20k-card decks) takes the per-card path too. Its base
  // is this window's in-memory copy, which is exactly what `hot.base` tracks,
  // and the per-card records land in IndexedDB like any other grade. Excluding
  // it sent every grade of a large deck through a whole-deck rewrite.
  return !restoring && !pendingVerify && !lastReadSuspect && !unverifiedBase && lastCacheCards !== null;
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
  if (!records.length) return base;
  const baseStamp = base?.savedAt ?? 0;
  const sorted = [...records].sort((a, b) => a.at - b.at);
  const cards = base ? [...base.cards] : [];
  const index = new Map(cards.map((card, i) => [card.id, i]));
  const added: DeckFlashcard[] = [];
  const addedIndex = new Map<string, number>();
  let newest = baseStamp;
  let touched = false;
  for (const { card, at: stamp } of sorted) {
    const newer = stamp > baseStamp;
    const at = index.get(card.id);
    if (at !== undefined) {
      // Merged, not replaced: a record older than the whole-deck record can
      // still hold a field change that record lacks (another window's review,
      // when a stale window wrote the whole deck after it), and a newer one can
      // lack a field change the whole-deck record has. Stamps decide per field;
      // unstamped ties go to whichever was written later.
      const merged = mergeCardVersions(cards[at], card, newer);
      if (merged !== cards[at]) {
        cards[at] = merged;
        touched = true;
      }
    } else if (newer) {
      // A card the whole-deck record does not have yet (added, then graded,
      // before the record caught up): newer than that record, so it is kept.
      const addedAt = addedIndex.get(card.id);
      if (addedAt !== undefined) added[addedAt] = mergeCardVersions(added[addedAt], card, true);
      else {
        addedIndex.set(card.id, added.length);
        added.push(card);
      }
      touched = true;
    }
    if (newer) newest = Math.max(newest, stamp);
  }
  if (!touched) return base;
  return {
    folders: base?.folders ?? [],
    cards: [...added, ...cards],
    savedAt: newest,
  };
}

/**
 * Drop the card records a whole-deck record stamped `upTo` already contains,
 * once that record has landed. Judged per record inside one transaction, so a
 * record rewritten meanwhile (a newer grade) is kept. With `cards` (the deck
 * that record holds), a record is also kept while that deck's copy of its card
 * lacks one of its field changes — another window's review that this window
 * never saw stays durable until a merge folds it in.
 *
 * While another window has been writing lately, this window's whole-deck
 * record may already have been replaced by that window's (built before this
 * window's change was durable). Then a record must also be held by the
 * whole-deck record actually stored — until then it stays and reads merge it.
 */
async function retireCardRecords(upTo: number, cards?: readonly DeckFlashcard[]): Promise<void> {
  try {
    await flushPendingMirrors();
    const shared = Date.now() - otherWindowSeenAt < OTHER_WINDOW_QUIET_MS;
    let stored: readonly DeckFlashcard[] | null = null;
    if (shared && cards) stored = normalizeDurableDeck(await kv.kvGet(IDB_KEYS.flashcardDeck))?.cards ?? [];
    await kv.kvDeleteWhere(
      FLASHCARD_DECK_CARD_PREFIX,
      (value) => isCardRecord(value)
        && value.at <= upTo
        && (!cards || recordHeldBy(cards, value.card))
        && (!stored || recordHeldBy(stored, value.card)),
    );
  } catch {
    /* kept: merged field by field on the next durable read, so never harmful */
  }
}

/** How long after another window's last sign of writing a retire stays careful. */
const OTHER_WINDOW_QUIET_MS = 60_000;

/** The stamped cards of `cards` holding a field change `durable` lacks. */
function changesMissingFrom(cards: readonly DeckFlashcard[], durable: readonly DeckFlashcard[]): DeckFlashcard[] {
  let byId: Map<string, DeckFlashcard> | null = null;
  const out: DeckFlashcard[] = [];
  for (const card of cards) {
    if (!card.fieldRev) continue;
    byId ??= new Map(durable.map((c) => [c.id, c]));
    const held = byId.get(card.id);
    if (held && !stampsCover(held.fieldRev, card.fieldRev)) out.push(card);
  }
  return out;
}

/** Whether `cards` already holds every field change of a card record. */
function recordHeldBy(cards: readonly DeckFlashcard[], card: DeckFlashcard): boolean {
  if (!card.fieldRev) return true;
  const at = deckCardIndex(cards, card.id);
  // A card the deck no longer has was deleted by a later whole write.
  if (at < 0) return true;
  return stampsCover(cards[at].fieldRev, card.fieldRev);
}

/**
 * A review's write: the changed cards to IndexedDB now, the cache later.
 * `before[i]` is the copy `changed[i]` was made from, for the field stamps.
 */
function writeStoreHot(
  store: FlashcardDeckStore,
  changed: readonly DeckFlashcard[],
  before: ReadonlyArray<DeckFlashcard | undefined> = [],
): void {
  const now = Date.now();
  changed.forEach((card, i) => stampCardChange(before[i], card, now));
  const previous = hot?.store.savedAt ?? 0;
  store.savedAt = Math.max(now, previous + 1, (store.savedAt ?? 0) + 1);
  if (!hot) {
    hot = { base: lastCacheCards ?? store.cards, store, dirty: new Map() };
    hotSince = now;
  }
  hot.store = store;
  for (const card of changed) hot.dirty.set(card.id, card);
  setJournalMarker(store.savedAt);
  ownJournalStamp = store.savedAt;
  putCardRecords(changed, store.savedAt, () => {
    // Not durable yet: write the cache and the whole-deck record now instead.
    settleHotDeck();
  });
  scheduleHotSettle();
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

/**
 * Write `cards` as per-card records, queued behind the earlier ones. A
 * read-modify-write per card: another window may hold a record of the same
 * card (its review) that this window never saw, and the two merge field by
 * field instead of the later put replacing the earlier one.
 */
function putCardRecords(cards: readonly DeckFlashcard[], at: number, onFailure?: () => void): void {
  if (!cards.length) return;
  const write = (): Promise<unknown> => Promise.all(cards.map((card) => kv.kvUpdate(
    `${FLASHCARD_DECK_CARD_PREFIX}${card.id}`,
    (current) => (isCardRecord(current) && current.card.id === card.id
      ? { card: mergeCardVersions(current.card, card, true), at: Math.max(at, current.at) } satisfies DeckCardRecord
      : { card, at } satisfies DeckCardRecord),
  )));
  hotWrites = hotWrites
    .then(write)
    .then(() => undefined)
    .catch((error: unknown) => {
      console.error('[deck] per-card write failed', error);
      onFailure?.();
    });
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
  if (lastReadSuspect || unverifiedBase || pendingVerify) {
    // Another window wrote cards this one has not seen (its grades in
    // IndexedDB, or an overflowed deck): merge over the durable deck first
    // rather than putting this window's copy over theirs.
    writeStore(store);
    return;
  }
  hot = null;
  commitStore(store);
  setJournalMarker(null);
  const upTo = store.savedAt ?? 0;
  const cards = store.cards;
  void hotWrites.then(() => retireCardRecords(upTo, cards));
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
    // Merging needs IndexedDB, which a closing window cannot wait for; the
    // per-card records are durable already and the next start merges them.
    if (lastReadSuspect || unverifiedBase || pendingVerify) return;
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
      otherWindowSeenAt = Date.now();
    }
    lastReadCards = base.cards;
    return base;
  }
  const journal = readJournalMarker();
  if (journal !== null && journal !== ownJournalStamp) {
    // Another window is grading too, and its cards are only in IndexedDB. Ours
    // must not reach the cache or the whole-deck record before a merge with
    // them: the next write (or the catch-up) takes the merging path.
    if (!lastReadSuspect) lastReadSuspect = { baseText: overflowStore ? overflowBaseText() : parsedCache?.raw ?? null };
    otherWindowSeenAt = Date.now();
  }
  if (hot.base !== base.cards) {
    // Another window wrote the cache meanwhile: keep its deck, with our changes
    // merged on top field by field (its review of a card we edited survives).
    const dirty = hot.dirty;
    const cards = base.cards.map((card) => {
      const mine = dirty.get(card.id);
      if (!mine) return card;
      const merged = mergeCardVersions(card, mine, true);
      if (merged !== mine) dirty.set(card.id, merged);
      return merged;
    });
    hot.store = { ...base, cards, savedAt: Math.max(base.savedAt ?? 0, hot.store.savedAt ?? 0) };
    hot.base = base.cards;
    otherWindowSeenAt = Date.now();
  }
  lastReadCards = hot.store.cards;
  return copyStore(hot.store);
}

function readCacheStore(): FlashcardDeckStore {
  lastReadSuspect = null;
  const marker = readOverflowMarker();
  if (overflowStore) {
    const own = overflowStore.savedAt ?? 0;
    if (marker !== null && marker > own) {
      // Another window's newer deck overflowed too and lives only in IndexedDB.
      lastReadSuspect = { baseText: overflowBaseText() };
      if (marker !== DECK_UNVERIFIED) otherWindowSeenAt = Date.now();
      return copyStore(overflowStore);
    }
    if (marker !== null) return copyStore(overflowStore);
    // No marker: another window wrote a deck that fits the cache again. Its
    // copy is the newer one when its stamp is. Parsed once per cache text, not
    // once per read, while this window keeps its own newer overflow copy.
    const raw = safeGetCache();
    let cached: FlashcardDeckStore;
    if (raw !== null && parsedCache?.raw === raw) {
      cached = parsedCache.store;
    } else {
      const parsed = parseFlashcardDeckStore(raw);
      cached = parsed.store;
      // Only a plain value is remembered: an over-encoded one must still reach
      // the self-heal below once it is the copy this window reads.
      if (raw !== null && parsed.layers === 1) rememberParse(raw, cached);
    }
    if ((cached.savedAt ?? 0) <= own) return copyStore(overflowStore);
    overflowStore = null;
    overflowText = null;
    overflowAttempt = null;
  }
  try {
    const raw = localStorage.getItem(FLASHCARD_DECK_STORAGE_KEY);
    if (!raw) {
      lastReadSuspect = { baseText: null };
      return { folders: [], cards: [] };
    }
    if (parsedCache && parsedCache.raw === raw) {
      const store = copyStore(parsedCache.store);
      if (marker !== null && marker > (store.savedAt ?? 0)) {
        lastReadSuspect = { baseText: raw };
        if (marker !== DECK_UNVERIFIED) otherWindowSeenAt = Date.now();
      }
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
      if (marker !== DECK_UNVERIFIED) otherWindowSeenAt = Date.now();
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
  const knownFull = overflowStore !== null
    && overflowAttempt !== null
    && store.cards.length >= overflowAttempt.cards
    && Date.now() - overflowAttempt.at < OVERFLOW_RETRY_MS;
  try {
    if (knownFull) throw new Error('deck cache known to be full');
    text = JSON.stringify(store);
    setCacheItem(FLASHCARD_DECK_STORAGE_KEY, text);
    rememberParse(text, store);
    overflowStore = null;
    overflowText = null;
    overflowAttempt = null;
    setOverflowMarker(unverified ? DECK_UNVERIFIED : null);
    return true;
  } catch {
    if (!knownFull) overflowAttempt = { cards: store.cards.length, at: Date.now() };
    overflowStore = store;
    // Null when the attempt was skipped: `overflowBaseText` serialises it on
    // the rare read that needs it as a merge base.
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
 * written fields it changed and the durable fields it did not (a review made
 * elsewhere survives an edit made here — `mergeCardVersions`); a card it deleted
 * from its base stays deleted; and every durable card its base never had — the
 * deck the empty read could not see — is kept.
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
    if (!durableCard) return card;
    // Field by field, newer stamp first. On an unstamped tie the side that
    // changed the card wins: the durable copy when the writer left the card as
    // it read it, the writer's copy when it edited it.
    return sameCard(baseById.get(card.id), card)
      ? mergeCardVersions(card, durableCard, true)
      : mergeCardVersions(durableCard, card, true);
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
  // Another window may be committing its own merge right now, built before
  // this one landed, and its whole-deck record could replace this one. The
  // field changes the durable copy did not have yet therefore also go out as
  // per-card records, which every read merges in and which are retired only
  // once a stored whole-deck record holds them.
  if (durable) putCardRecords(changesMissingFrom(next.cards, durable.cards), next.savedAt ?? 0);
  // `durable` included every per-card record, so the merged deck supersedes them.
  const upTo = next.savedAt ?? 0;
  const mergedCards = next.cards;
  void hotWrites.then(() => retireCardRecords(upTo, mergedCards));
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

/** Test seam: wait until every held deck write has been checked and committed. */
export async function settleDeckWritesForTests(): Promise<void> {
  while (pendingVerify) await pendingVerify;
}

/**
 * Stamp every card a whole write changed (`stampCardChange`), found by walking
 * the new cards against the snapshot the writer read. Untouched cards keep their
 * object identity through a write, so the walk is a pointer comparison per card;
 * an added card is skipped, a removed one is stepped over (a short look-ahead),
 * and a card replaced in place is compared field by field.
 */
function stampChangedCards(cards: readonly DeckFlashcard[], now: number): void {
  const prev = lastReadCards;
  if (!prev || prev === cards) return;
  let j = 0;
  for (const card of cards) {
    const old = prev[j];
    if (old === card) {
      j += 1;
      continue;
    }
    if (old && old.id === card.id) {
      stampCardChange(old, card, now);
      j += 1;
      continue;
    }
    // A removal before this card: find it a few places ahead.
    let found = -1;
    for (let k = j + 1; k < Math.min(prev.length, j + 17); k += 1) {
      if (prev[k] === card || prev[k]?.id === card.id) {
        found = k;
        break;
      }
    }
    if (found >= 0) {
      if (prev[found] !== card) stampCardChange(prev[found], card, now);
      j = found + 1;
    }
    // Otherwise a new card (nothing to stamp), or one moved far away: left
    // unstamped, which a merge treats as "not changed here".
  }
}

/**
 * `stamp: false` for a write that only adds or removes cards, or changes the
 * folder list: no existing card changed, so the stamp walk is skipped.
 */
function writeStore(store: FlashcardDeckStore, options: { stamp?: boolean } = {}): void {
  if (options.stamp !== false) stampChangedCards(store.cards, Date.now());
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
    const cards = store.cards;
    void hotWrites.then(() => retireCardRecords(upTo, cards));
  }
  window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
}

function normalizeDurableDeck(raw: unknown): FlashcardDeckStore | null {
  if (raw == null) return null;
  // A record is an object already: same rule, no 8 MB JSON round trip. A
  // string (an over-encoded legacy value) still goes through the peeling parser.
  if (typeof raw === 'object') return deckStoreFromValue(raw);
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
      if (durable && durableRecordsSeen) {
        // Card records can hold field changes the newer cache lacks: another
        // window's review that a stale whole-deck write went over before this
        // window closed. Fold them in rather than let the cache's copy win whole.
        const folded = foldDurableCards(current, durable);
        if (folded) {
          folded.savedAt = Math.max(current.savedAt ?? 0, durableStamp) + 1;
          if (!writeCache(folded)) reportCacheFull(folded);
          mirrorToIdb(IDB_KEYS.flashcardDeck, folded);
          settleReconciledRecords(folded);
          window.dispatchEvent(new CustomEvent(FLASHCARD_DECK_EVENT));
          return 'local';
        }
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

/**
 * `current` with every newer field change of `durable` merged in, card by card;
 * null when `current` already holds them all (the usual case: one pointer or
 * stamp comparison per card).
 */
function foldDurableCards(current: FlashcardDeckStore, durable: FlashcardDeckStore): FlashcardDeckStore | null {
  const byId = new Map(durable.cards.map((card) => [card.id, card]));
  let changed = false;
  const cards = current.cards.map((card) => {
    const other = byId.get(card.id);
    if (!other || other === card) return card;
    const merged = mergeCardVersions(other, card, true);
    if (merged !== card) changed = true;
    return merged;
  });
  return changed ? { ...current, cards } : null;
}

/** After a reconcile wrote `store` everywhere: clear the marker and retire the records it holds. */
function settleReconciledRecords(store: FlashcardDeckStore): void {
  const upTo = store.savedAt ?? 0;
  const journal = readJournalMarker();
  if (journal !== null && journal <= upTo) setJournalMarker(null);
  if (durableRecordsSeen) void retireCardRecords(upTo, store.cards);
}

/** Test seam: forget the in-memory overflow copy. */
export function resetDeckMemoryForTests(): void {
  parsedCache = null;
  hot = null;
  lastCacheCards = null;
  lastReadCards = null;
  ownJournalStamp = null;
  otherWindowSeenAt = 0;
  if (hotTimer) clearTimeout(hotTimer);
  hotTimer = null;
  hotWrites = Promise.resolve();
  durableRecordsSeen = 0;
  introducedMemo = null;
  dueLoadMemo = null;
  overflowStore = null;
  overflowText = null;
  overflowAttempt = null;
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
  return buildLocalDeckDraft(store.cards, normalizeDraftField, {
    folders: store.folders,
    ...options,
  });
}

/**
 * The incremental part of a draft rebuild. Stripping a field's HTML is the
 * largest per-field cost of `buildAnkiDraft` (eight regex passes, 160,000
 * fields on a 20,000-card deck), and between two builds almost every field is
 * the same string: those are looked up, only changed fields are stripped
 * again. The draft itself is still assembled whole — its diagnostics (duplicate
 * guids, first-seen media, deck order) are one pass over the collection by
 * design, shared with the .apkg / AnkiConnect / CSV adapters.
 */
const draftFieldMemo = new Map<string, string>();
const DRAFT_FIELD_MEMO_MAX = 250_000;

function normalizeDraftField(raw: string): string {
  if (!raw) return '';
  const known = draftFieldMemo.get(raw);
  if (known !== undefined) return known;
  if (draftFieldMemo.size >= DRAFT_FIELD_MEMO_MAX) draftFieldMemo.clear();
  const value = stripFieldHtml(raw);
  draftFieldMemo.set(raw, value);
  return value;
}

const fingerprintMemo = new WeakMap<readonly DeckFlashcard[], string>();

/**
 * The fingerprint `loadDeckAsAnkiDraft().draft.source.fingerprint` would carry,
 * without building the draft: what "did the deck change since the workbench
 * loaded it" needs. Cached per deck snapshot.
 */
export function loadDeckFingerprint(): string {
  const cards = readStore().cards;
  let print = fingerprintMemo.get(cards);
  if (print === undefined) {
    print = fingerprintLocalDeck(cards.filter((card) => card && typeof card.id === 'string' && card.id));
    fingerprintMemo.set(cards, print);
  }
  return print;
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
  writeStore(store, { stamp: false });
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
  writeStore(store, { stamp: false });
  return store.cards;
}

export function removeDeckCard(id: string): DeckFlashcard[] {
  const store = readStore();
  store.cards = store.cards.filter((c) => c.id !== id);
  writeStore(store, { stamp: false });
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
      | 'exampleSentences'
      | 'mnemonic'
      | 'distinction'
      | 'acceptedAnswers'
    >
  >,
): DeckFlashcard[] {
  const store = readStore();
  const changed: DeckFlashcard[] = [];
  const before: DeckFlashcard[] = [];
  store.cards = store.cards.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...patch };
    changed.push(next);
    before.push(c);
    return next;
  });
  writeChangedCards(store, changed, before);
  return store.cards;
}

/**
 * Persist a write that changed only `changed` (no card added or removed, no
 * folder list change): the per-card path when it is open, like a review —
 * an Anki export marks cards one `updateDeckCard` at a time, and each of those
 * rewrote the whole deck. Anything else, or nothing changed, is a whole write.
 */
function writeChangedCards(
  store: FlashcardDeckStore,
  changed: readonly DeckFlashcard[],
  before: readonly DeckFlashcard[],
): void {
  if (changed.length > 0 && changed.length <= HOT_CARD_LIMIT && canWriteHot()) writeStoreHot(store, changed, before);
  else writeStore(store);
}

/** Above this many changed cards a batch is a whole-deck write anyway. */
const HOT_CARD_LIMIT = 200;

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
  const changed: DeckFlashcard[] = [];
  const before: DeckFlashcard[] = [];
  store.cards = store.cards.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, folder: folder && folder.trim() ? folder.trim() : undefined };
    changed.push(next);
    before.push(c);
    return next;
  });
  writeChangedCards(store, changed, before);
  return store.cards;
}

export function setDeckCardKnown(id: string, known: boolean): DeckFlashcard[] {
  return reviewDeckCard(id, known ? 'good' : 'again');
}

/** At most this many accepted answers per side, so the list cannot grow without bound. */
const MAX_ACCEPTED_ANSWERS = 20;

/**
 * Accept a typed answer as correct for one card from now on. Only ever called
 * from an explicit "Accept my answer as correct" press — an AI verdict alone
 * never reaches here. Returns whether the card changed (false for an unknown
 * card, an empty answer, or one already accepted).
 */
export function addDeckCardAcceptedAnswer(id: string, side: 'meaning' | 'target', answer: string): boolean {
  const text = answer.replace(/\s+/g, ' ').trim().slice(0, 120);
  if (!text) return false;
  const store = readStore();
  const changed: DeckFlashcard[] = [];
  const before: DeckFlashcard[] = [];
  store.cards = store.cards.map((c) => {
    if (c.id !== id) return c;
    const list = c.acceptedAnswers?.[side] ?? [];
    if (list.includes(text) || list.length >= MAX_ACCEPTED_ANSWERS) return c;
    const next = { ...c, acceptedAnswers: { ...c.acceptedAnswers, [side]: [...list, text] } };
    changed.push(next);
    before.push(c);
    return next;
  });
  if (!changed.length) return false;
  writeChangedCards(store, changed, before);
  return true;
}

/**
 * "Add to review now" (the Game Arena's post-game review): bring a scheduled card's due
 * time forward to `now`, so it is in today's reviews. Nothing else about its schedule
 * changes — the next real review grades it as usual. A card with no schedule is already
 * due by definition and is left as it is. Returns whether a card moved.
 */
export function dueDeckCardNow(id: string, now = Date.now()): boolean {
  const store = readStore();
  const index = deckCardIndex(store.cards, id);
  if (index < 0) return false;
  const card = store.cards[index];
  if (!card.srs || !Number.isFinite(card.srs.dueAt) || card.srs.dueAt <= now) return false;
  const next: DeckFlashcard = { ...card, srs: { ...card.srs, dueAt: now } };
  const before = store.cards;
  store.cards = replaceCardAt(before, index, next);
  carryDueLoad(before, store.cards, card, next);
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
  // Built once per snapshot and day, then carried across each grade
  // (`carryDueLoad`): it was a full deck scan per graded card.
  if (!dueLoadMemo || dueLoadMemo.cards !== cards || dueLoadMemo.from !== from) {
    const perDay = new Map<number, number>();
    for (const card of cards) {
      const offset = dueDayOffset(card, from);
      if (offset !== null) perDay.set(offset, (perDay.get(offset) ?? 0) + 1);
    }
    dueLoadMemo = { cards, from, perDay };
  }
  const perDay = dueLoadMemo.perDay;
  return (dayOffset) => perDay.get(dayOffset) ?? 0;
}

/** The day (from local midnight `from`) a card adds review load to, or null. */
function dueDayOffset(card: DeckFlashcard, from: number): number | null {
  const due = card.srs?.dueAt;
  if (card.suspended || typeof due !== 'number' || !Number.isFinite(due) || due < from) return null;
  // Local calendar days, not 24-hour blocks: across a DST change a day is 23 or 25 hours,
  // and dividing elapsed time put a card due just after midnight on the previous day.
  const a = new Date(from);
  const b = new Date(due);
  return Math.round(
    (Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()))
      / (24 * 60 * 60 * 1000),
  );
}

/**
 * Test seam: the review-load map a grade on `cards` would use, sorted by day.
 * `fresh` drops the carried map first, so a test can compare the two.
 */
export function dueLoadEntriesForTests(
  cards: readonly DeckFlashcard[],
  now: number,
  fresh = false,
): Array<[number, number]> {
  if (fresh) dueLoadMemo = null;
  dueLoadFor(cards, now);
  return [...(dueLoadMemo?.perDay ?? new Map<number, number>())].sort((a, b) => a[0] - b[0]);
}

/** `dueLoadFor`'s map for one snapshot of the deck (see `dueLoadFor`). */
let dueLoadMemo: { cards: readonly DeckFlashcard[]; from: number; perDay: Map<number, number> } | null = null;

/**
 * Carry the load map from `before` to `after`, two snapshots that differ only
 * in `previous` being replaced by `next`: the same map a fresh scan of `after`
 * would build, at the cost of two lookups.
 */
function carryDueLoad(
  before: readonly DeckFlashcard[],
  after: readonly DeckFlashcard[],
  previous: DeckFlashcard,
  next: DeckFlashcard,
): void {
  if (!dueLoadMemo || dueLoadMemo.cards !== before) return;
  const { from } = dueLoadMemo;
  const perDay = new Map(dueLoadMemo.perDay);
  const was = dueDayOffset(previous, from);
  if (was !== null) {
    const count = (perDay.get(was) ?? 0) - 1;
    if (count > 0) perDay.set(was, count);
    else perDay.delete(was);
  }
  const now = dueDayOffset(next, from);
  if (now !== null) perDay.set(now, (perDay.get(now) ?? 0) + 1);
  dueLoadMemo = { cards: after, from, perDay };
}

// ── Memoised selectors over one deck snapshot ───────────────────────────────
//
// A snapshot's `cards` array is never edited once a write has published it:
// every write builds a new array, and replaces (never edits) the cards it
// changes. What is derived from one array can therefore be cached on that
// array's identity, valid for exactly as long as it is the current deck. Every
// lookup is still verified against the array, so a caller that sorted a
// snapshot in place costs a rebuild, never a wrong card.

const idIndexMemo = new WeakMap<readonly DeckFlashcard[], Map<string, number>>();

function buildIdIndex(cards: readonly DeckFlashcard[]): Map<string, number> {
  const index = new Map<string, number>();
  cards.forEach((card, i) => {
    // First occurrence, as `findIndex` answered.
    if (!index.has(card.id)) index.set(card.id, i);
  });
  idIndexMemo.set(cards, index);
  return index;
}

/** Position of card `id` in this snapshot, or -1 (`findIndex` without the scan). */
export function deckCardIndex(cards: readonly DeckFlashcard[], id: string): number {
  let index = idIndexMemo.get(cards) ?? buildIdIndex(cards);
  let at = index.get(id);
  if (at !== undefined && cards[at]?.id !== id) {
    index = buildIdIndex(cards);
    at = index.get(id);
  }
  if (at === undefined) {
    // Not indexed: confirm against the array before answering "absent".
    const found = cards.findIndex((card) => card.id === id);
    if (found >= 0) buildIdIndex(cards);
    return found;
  }
  return at;
}

/** One card of the current deck by id, through the snapshot's index. */
export function findDeckCard(id: string): DeckFlashcard | undefined {
  const cards = loadDeck();
  const at = deckCardIndex(cards, id);
  return at >= 0 ? cards[at] : undefined;
}

/** `cards` with the card at `index` replaced by `next`; the id index carries over. */
function replaceCardAt(cards: readonly DeckFlashcard[], index: number, next: DeckFlashcard): DeckFlashcard[] {
  const out = cards.slice();
  const previous = out[index];
  out[index] = next;
  const ids = idIndexMemo.get(cards);
  if (ids && previous && previous.id === next.id) idIndexMemo.set(out, ids);
  return out;
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
  const index = deckCardIndex(store.cards, id);
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
  const before = store.cards;
  store.cards = replaceCardAt(before, index, next);
  carryDueLoad(before, store.cards, previous, next);
  // One card changed: write that card durably now, the whole deck later.
  if (canWriteHot()) writeStoreHot(store, [next], [previous]);
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
  let undone: DeckFlashcard | undefined;
  store.cards = store.cards.map((card) => {
    if (card.id !== undo.cardId) return card;
    undone = card;
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
    if (canWriteHot()) writeStoreHot(store, [restored], [undone]);
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

/** The deck's own review load per coming day, as the Flashcards queue will present it. */
export interface DeckDueForecast extends LocalDueForecast {
  /** Never-studied cards waiting beyond today's new-card allowance — not due today. */
  newWaiting: number;
}

/**
 * Reviews due per local day, counted the way `dueDeckCards` counts today's queue.
 *
 * The raw `localDueForecast` treats EVERY card the same: a suspended leech, a card Anki
 * schedules ("Anki owns scheduling") and each of 3,000 never-studied imports all read as
 * due now — so the Calendar printed "3,000 due" over a day whose Review button opened 20.
 * Here a suspended or Anki-owned card is due nowhere, scheduled cards fall on their own
 * local day, and unscheduled cards count only up to what is left of today's new-card
 * allowance (the rest are reported as `newWaiting`, never as due).
 */
export function deckDueForecast(
  cards: readonly DeckFlashcard[],
  days: number,
  now = Date.now(),
  newPerDay: number | undefined = getActiveProfile().deckParams.newPerDay,
  introducedToday: number = introducedTodayCount(now),
): DeckDueForecast {
  const scheduled: DeckFlashcard[] = [];
  let unscheduled = 0;
  for (const card of withoutAnkiOwned(cards)) {
    if (card.suspended) continue;
    if (isLocalSrsState(card.srs)) scheduled.push(card);
    else unscheduled += 1;
  }
  const forecast = localDueForecast(scheduled, days, now);
  const allowance = newPerDay === undefined || !Number.isFinite(newPerDay)
    ? unscheduled
    : Math.min(unscheduled, Math.max(0, Math.floor(newPerDay) - Math.max(0, introducedToday)));
  return {
    ...forecast,
    overdue: forecast.overdue + allowance,
    total: scheduled.length + unscheduled,
    newWaiting: unscheduled - allowance,
  };
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
  // One pass over the pool, answering for every source at once what
  // `dueDeckCards` + the audio filter would answer for that source's cards: it
  // used to run the whole due filter (and its SRS validation) once per source,
  // twice over every card. Each source has its own new-card budget, spent in
  // deck order, exactly as `limitNewCards` spends it on that source's list.
  const newPerDay = getActiveProfile().deckParams.newPerDay;
  const budget = newPerDay === undefined || !Number.isFinite(newPerDay)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(newPerDay) - Math.max(0, introducedTodayCount(now)));
  const ankiOwned = ankiOwnsScheduling();
  const all = { count: 0, newTaken: 0 };
  const tallies = new Map<string, { count: number; newTaken: number }>();
  for (const card of pool) {
    const key = `${card.bookId || 'unknown'}::${card.bookTitle || 'Unknown source'}`;
    let tally = tallies.get(key);
    if (!tally) {
      tally = { count: 0, newTaken: 0 };
      tallies.set(key, tally);
    }
    const audioOk = mode !== 'audio' || Boolean(card.audioDataUrl || card.audioPath);
    if (!dueOnly) {
      if (audioOk) {
        all.count += 1;
        tally.count += 1;
      }
      continue;
    }
    if (card.suspended || (ankiOwned && hasAnkiTwin(card))) continue;
    const scheduled = isLocalSrsState(card.srs);
    if (scheduled && (card.srs as LocalSrsState).dueAt > now) continue;
    tallyDueCard(all, scheduled, audioOk, budget);
    tallyDueCard(tally, scheduled, audioOk, budget);
  }
  const counts = new Map<string, number>([['all', all.count]]);
  for (const [key, tally] of tallies) counts.set(key, tally.count);
  return counts;
}

/** One due card into a source's count: a new card only while that source's budget lasts. */
function tallyDueCard(
  tally: { count: number; newTaken: number },
  scheduled: boolean,
  audioOk: boolean,
  budget: number,
): void {
  if (!scheduled) {
    if (tally.newTaken >= budget) return;
    tally.newTaken += 1;
  }
  if (audioOk) tally.count += 1;
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
  // The separator cannot be matched across: a query holding it (nobody types
  // U+0000) takes the per-field path, which is the same answer.
  if (q.includes(SEARCH_FIELD_SEPARATOR)) {
    return cards.filter((c) => searchFields(c).some((field) => (field ? normalizeSearchField(field).includes(q) : false)));
  }
  return cards.filter((c) => searchHaystack(c).includes(q));
}

const SEARCH_FIELD_SEPARATOR = '\u0000';

function searchFields(c: DeckFlashcard): Array<string | undefined> {
  return [c.word, c.reading, c.meaning, c.front, c.back, c.sentence, c.bookTitle];
}

function normalizeSearchField(field: string): string {
  return field.normalize('NFKC').toLowerCase();
}

/**
 * Every searchable field of a card, each normalised exactly as the per-field
 * test did, joined by a separator no normalised query contains. Cached per card
 * object: a card is replaced, never edited, when it changes, so the cache
 * cannot go stale — and a 20,000-card search stops being 140,000 Unicode
 * normalisations per keystroke.
 */
const haystacks = new WeakMap<DeckFlashcard, string>();

function searchHaystack(c: DeckFlashcard): string {
  let text = haystacks.get(c);
  if (text === undefined) {
    text = searchFields(c).map((field) => (field ? normalizeSearchField(field) : '')).join(SEARCH_FIELD_SEPARATOR);
    haystacks.set(c, text);
  }
  return text;
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
