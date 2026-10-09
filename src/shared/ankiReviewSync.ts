/**
 * Two-way review sync between Gum's deck and Anki — the pure half.
 *
 * Gum and Anki can both hold the same card: a mined note goes to Anki and to the
 * local deck. Until now only Anki → Gum flowed (intervals became knowledge
 * levels); a review answered in Gum never reached Anki, so the two schedules
 * drifted apart. This module decides, without any I/O, what crosses and when.
 * The AnkiConnect half is `main/anki/reviewSync.ts`; the queue and the timers
 * are `renderer/ankiReviewSync.ts`.
 *
 * LINK. A Gum card and an Anki note are the same card when the Gum card carries
 * `ankiNoteId`. Anki note ids survive AnkiWeb sync unchanged, so the id is the
 * stable key across machines. A Gum card without an id (queued while Anki was
 * away, or refused as a duplicate) is linked by field match — the note type's
 * term field equal to the card's word, within the profile's note type — never
 * by creating a second note.
 *
 * CONFLICT RULES (one owner per card at any time; nothing is ever scheduled twice):
 *
 *  1. Owner. "Anki owns scheduling" on: Anki is the only scheduler. Gum never
 *     pushes an answer and only MIRRORS Anki's state (interval, due, suspended)
 *     for display. Off: Gum is the scheduler; with "Send my Gum reviews to Anki"
 *     on, each Gum answer is replayed into Anki with `answerCards` so Anki's copy
 *     follows. Gum never reads Anki's schedule back into its own in that mode.
 *  2. Newer wins. An answer is skipped (`anki-newer`) when Anki's card was
 *     modified after the Gum review happened — it was reviewed or edited in Anki
 *     (on this machine or another one, via AnkiWeb) and replaying an older answer
 *     on top would double-review it.
 *  3. Latest answer per note. Several Gum answers to one card waiting in the
 *     queue (offline, relearning steps) collapse to the most recent one; the
 *     earlier ones are `superseded`. Replaying "again, good, good" in one burst
 *     would walk Anki's learning steps in seconds.
 *  4. Undo grace. An answer is held for `ANKI_SYNC_UNDO_GRACE_MS` before it is
 *     sent, so Gum's review undo can take it back. Once sent it cannot be undone
 *     in Anki (AnkiConnect has no per-card undo); the local undo still applies.
 *  5. Stale. An answer older than `ANKI_SYNC_REVIEW_MAX_AGE_MS` is dropped
 *     (`stale`): Anki would date it today, which misstates a weeks-old review.
 *  6. Suspended / deleted. A card suspended in Anki is not answered
 *     (`suspended`) — Anki's suspension is the user's decision. A note deleted in
 *     Anki (`note-missing`) unlinks the Gum card, which goes back to Gum's own
 *     schedule; it is listed in the sync panel, never silently dropped.
 *  7. Profile. Note ids belong to one Anki profile's collection. Sync binds to
 *     the first profile it sees and pauses (`profile-mismatch`) when Anki is on
 *     another one, so a switched profile can never answer or unlink the wrong
 *     notes. The user re-binds explicitly.
 *  8. Idempotent. Each answer is keyed by its review-log row id; a key that was
 *     answered is removed in the same step, and a re-run with the same queue
 *     sends nothing twice.
 *  9. Which card. A note with several cards (recognition + production) is
 *     answered on its lowest-ordinal card that is not suspended — the card the
 *     Gum deck mirrors.
 */

import { ANKI_COLLECTION_UNAVAILABLE_MSG, ANKI_UNREACHABLE_MSG } from './anki';
import type { LocalSrsRating } from './localSrs';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Anki's answer buttons: 1 Again, 2 Hard, 3 Good, 4 Easy. */
export type AnkiEase = 1 | 2 | 3 | 4;

export function ankiEaseForRating(rating: LocalSrsRating): AnkiEase {
  switch (rating) {
    case 'again':
      return 1;
    case 'hard':
      return 2;
    case 'easy':
      return 4;
    default:
      return 3;
  }
}

/** AnkiConnect's API version 6 is the one every action here is written against. */
export const ANKI_SYNC_MIN_API_VERSION = 6;
/** Answers older than this are not replayed (rule 5). */
export const ANKI_SYNC_REVIEW_MAX_AGE_MS = 14 * DAY_MS;
/** How long an answer waits before it is sent, so an undo can still take it back (rule 4). */
export const ANKI_SYNC_UNDO_GRACE_MS = 20_000;
/** Answers per `answerCards` request. */
export const ANKI_SYNC_PUSH_BATCH = 100;
/** Sends that failed for a reason other than "Anki is away" before an answer is dropped. */
export const ANKI_SYNC_MAX_ATTEMPTS = 5;
/** Linked notes whose schedule one pull reads. */
export const ANKI_SYNC_PULL_BATCH = 2000;
/** Unlinked Gum cards one link pass looks up. */
export const ANKI_SYNC_LINK_BATCH = 200;

// ----- Errors -----------------------------------------------------------------

/**
 * What went wrong, as a kind the UI can explain in the user's language:
 * `unsupported` — AnkiConnect (or Anki) is too old for `answerCards`/`areDue`;
 * `permission` — AnkiConnect is configured with an API key Gum does not send;
 * `version` — the AnkiConnect API version is below 6;
 * `profile-mismatch` — Anki is open on another profile than the one sync is bound to.
 */
export type AnkiSyncErrorKind =
  | 'unreachable'
  | 'collection'
  | 'unsupported'
  | 'permission'
  | 'version'
  | 'profile-mismatch'
  | 'api';

export function classifyAnkiSyncError(message: string | undefined): AnkiSyncErrorKind {
  const text = String(message ?? '');
  if (!text) return 'api';
  if (text === ANKI_UNREACHABLE_MSG) return 'unreachable';
  if (text === ANKI_COLLECTION_UNAVAILABLE_MSG) return 'collection';
  if (/unsupported action|unknown action|has no attribute/i.test(text)) return 'unsupported';
  if (/api ?key|permission|not allowed|forbidden|unauthori[sz]ed/i.test(text)) return 'permission';
  if (/collection is not available|collection not available|CollectionNotAvailable/i.test(text)) return 'collection';
  if (/ECONNREFUSED|fetch failed|timed? ?out|aborted|network|socket hang up/i.test(text)) return 'unreachable';
  return 'api';
}

export interface AnkiSyncProbeResult {
  ok: boolean;
  apiVersion?: number;
  /** Anki's active profile; absent on an AnkiConnect without `getActiveProfile`. */
  profile?: string;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

/** Errors that mean "try again later, keep the queue": nothing about the data is wrong. */
export function isTransientAnkiSyncError(kind: AnkiSyncErrorKind): boolean {
  return kind === 'unreachable' || kind === 'collection';
}

// ----- Push (Gum → Anki) -------------------------------------------------------

export interface AnkiReviewOutboxItem {
  /** The review-log row id: the idempotency key. */
  reviewId: string;
  cardId: string;
  noteId: number;
  ease: AnkiEase;
  /** Epoch ms of the Gum answer. */
  reviewedAt: number;
  queuedAt: number;
  attempts: number;
}

/** One answer as it crosses IPC. */
export interface AnkiReviewPushItem {
  reviewId: string;
  noteId: number;
  ease: AnkiEase;
  reviewedAt: number;
}

export type AnkiReviewPushOutcome =
  | 'answered'
  | 'anki-newer'
  | 'suspended'
  | 'note-missing'
  | 'stale'
  | 'superseded'
  | 'failed';

export interface AnkiReviewPushResult {
  ok: boolean;
  /** Per `reviewId`. Absent ids were not attempted (the whole call failed). */
  outcomes: Record<string, AnkiReviewPushOutcome>;
  /** The Anki profile the answers landed in. */
  profile?: string;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

export interface AnkiReviewPushPlan {
  /** Sent now, oldest first, at most `ANKI_SYNC_PUSH_BATCH`. */
  push: AnkiReviewOutboxItem[];
  /** Review ids replaced by a later answer to the same note (rule 3). */
  superseded: string[];
  /** Review ids too old to replay (rule 5). */
  stale: string[];
  /** Answers still inside the undo grace, or beyond this batch: they wait. */
  waiting: number;
}

/**
 * Decide what one drain sends. Pure: the queue is not modified here.
 * `force` (the user pressed "Sync now") skips the undo grace.
 */
export function planAnkiReviewPush(
  items: readonly AnkiReviewOutboxItem[],
  now: number,
  options: { force?: boolean; batch?: number } = {},
): AnkiReviewPushPlan {
  const batch = Math.max(1, options.batch ?? ANKI_SYNC_PUSH_BATCH);
  const byNote = new Map<number, AnkiReviewOutboxItem[]>();
  const stale: string[] = [];
  for (const item of items) {
    if (now - item.reviewedAt > ANKI_SYNC_REVIEW_MAX_AGE_MS) {
      stale.push(item.reviewId);
      continue;
    }
    const list = byNote.get(item.noteId) ?? [];
    list.push(item);
    byNote.set(item.noteId, list);
  }
  const candidates: AnkiReviewOutboxItem[] = [];
  const superseded: string[] = [];
  let waiting = 0;
  for (const list of byNote.values()) {
    list.sort((a, b) => a.reviewedAt - b.reviewedAt || a.reviewId.localeCompare(b.reviewId));
    const latest = list[list.length - 1];
    // Inside the grace the latest answer may still be undone, and an undo would
    // make the one before it the latest again: nothing for this note moves yet.
    if (!options.force && now - latest.reviewedAt < ANKI_SYNC_UNDO_GRACE_MS) {
      waiting += list.length;
      continue;
    }
    for (const earlier of list.slice(0, -1)) superseded.push(earlier.reviewId);
    candidates.push(latest);
  }
  candidates.sort((a, b) => a.reviewedAt - b.reviewedAt);
  const push = candidates.slice(0, batch);
  waiting += candidates.length - push.length;
  return { push, superseded, stale, waiting };
}

/** The slice of an AnkiConnect `cardsInfo` row the sync reads. */
export interface AnkiSyncCardRow {
  cardId: number;
  note?: number;
  ord?: number;
  queue?: number;
  type?: number;
  /** Epoch SECONDS of the card's last modification (a review is one). */
  mod?: number;
  due?: number;
  interval?: number;
  reps?: number;
  lapses?: number;
  factor?: number;
  deckName?: string;
}

/** Rule 9: the note's lowest-ordinal card that is not suspended, else its lowest-ordinal card. */
export function pickAnkiPrimaryCard<T extends AnkiSyncCardRow>(rows: readonly T[]): T | null {
  const valid = rows.filter((row) => row && typeof row.cardId === 'number');
  if (!valid.length) return null;
  const sorted = [...valid].sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0) || a.cardId - b.cardId);
  return sorted.find((row) => row.queue !== -1) ?? sorted[0];
}

/** Rules 2, 5 and 6 for one answer against the card it would answer. */
export function decideAnkiReviewPush(
  item: Pick<AnkiReviewPushItem, 'reviewedAt'>,
  card: AnkiSyncCardRow | null,
  now: number,
): AnkiReviewPushOutcome | 'push' {
  if (!card) return 'note-missing';
  if (now - item.reviewedAt > ANKI_SYNC_REVIEW_MAX_AGE_MS) return 'stale';
  if (card.queue === -1) return 'suspended';
  if (typeof card.mod === 'number' && Number.isFinite(card.mod) && card.mod * 1000 > item.reviewedAt) {
    return 'anki-newer';
  }
  return 'push';
}

/** Outcomes after which an answer leaves the queue for good. */
export function isFinalAnkiPushOutcome(outcome: AnkiReviewPushOutcome): boolean {
  return outcome !== 'failed';
}

// ----- Pull (Anki → Gum, display only) ---------------------------------------

export type AnkiMirrorState = 'new' | 'learning' | 'review' | 'relearning' | 'suspended' | 'buried';

/** Anki's view of one linked card, as Gum shows it. Never fed to Gum's scheduler (rule 1). */
export interface AnkiScheduleMirror {
  noteId: number;
  cardId: number;
  state: AnkiMirrorState;
  intervalDays: number;
  /** When Anki will show it next; absent for new cards and when Anki's day could not be anchored. */
  dueAt?: number;
  /** Anki says it is due now. */
  isDue: boolean;
  reps: number;
  lapses: number;
  /** Ease factor (2.5 = 250%); absent on new and FSRS-only cards. */
  ease?: number;
  deckName?: string;
  syncedAt: number;
}

export function ankiMirrorState(row: Pick<AnkiSyncCardRow, 'queue' | 'type'>): AnkiMirrorState {
  if (row.queue === -1) return 'suspended';
  if (row.queue === -2 || row.queue === -3) return 'buried';
  if (row.type === 1) return 'learning';
  if (row.type === 3) return 'relearning';
  if (row.type === 2) return 'review';
  return 'new';
}

/**
 * One `cardsInfo` row as a mirror entry. Anki's `due` is a Unix time (seconds)
 * for intraday learning cards and a day number for review / day-learning ones;
 * a day number becomes a date only against `todayDay` (Anki's own day number
 * for today, anchored by the caller), else `dueAt` is left out rather than guessed.
 */
export function ankiMirrorFromCard(
  row: AnkiSyncCardRow,
  context: { todayDay: number | null; dayStartMs: number; isDue: boolean; now: number },
): AnkiScheduleMirror {
  const state = ankiMirrorState(row);
  const due = typeof row.due === 'number' && Number.isFinite(row.due) ? row.due : undefined;
  let dueAt: number | undefined;
  if (due !== undefined && row.type !== 0) {
    if (due > 1_000_000_000) dueAt = due * 1000;
    else if (context.todayDay !== null) dueAt = context.dayStartMs + (due - context.todayDay) * DAY_MS;
  }
  const factor = typeof row.factor === 'number' && row.factor > 0 ? row.factor / 1000 : undefined;
  return {
    noteId: Number(row.note ?? 0),
    cardId: row.cardId,
    state,
    intervalDays: Math.max(0, Math.round(Number(row.interval ?? 0)) || 0),
    ...(dueAt !== undefined ? { dueAt } : {}),
    isDue: context.isDue,
    reps: Math.max(0, Math.floor(Number(row.reps ?? 0)) || 0),
    lapses: Math.max(0, Math.floor(Number(row.lapses ?? 0)) || 0),
    ...(factor !== undefined ? { ease: factor } : {}),
    ...(row.deckName ? { deckName: row.deckName } : {}),
    syncedAt: context.now,
  };
}

export interface AnkiSchedulePullEntry {
  noteId: number;
  /** null: the note no longer exists in this collection (confirmed twice). */
  mirror: AnkiScheduleMirror | null;
}

export interface AnkiSchedulePullResult {
  ok: boolean;
  entries: AnkiSchedulePullEntry[];
  profile?: string;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

/** Linked cards Anki says are due now, in mirror order. */
export function countAnkiMirrorsDue(mirrors: Iterable<AnkiScheduleMirror>): { due: number; suspended: number; total: number } {
  let due = 0;
  let suspended = 0;
  let total = 0;
  for (const mirror of mirrors) {
    total += 1;
    if (mirror.state === 'suspended') suspended += 1;
    else if (mirror.isDue) due += 1;
  }
  return { due, suspended, total };
}

// ----- Link discovery (cards created on another machine) -----------------------

export interface AnkiLinkRequest {
  /** The Gum card id. */
  key: string;
  term: string;
  reading?: string;
}

export interface AnkiLinkMatch {
  key: string;
  noteId: number | null;
  /** More than one note matched equally well; the one picked is the oldest. */
  ambiguous?: boolean;
}

export interface AnkiLinkResult {
  ok: boolean;
  matches: AnkiLinkMatch[];
  profile?: string;
  errorKind?: AnkiSyncErrorKind;
  error?: string;
}

export interface AnkiLinkCandidate {
  noteId: number;
  /** Carries the app tag: a note Gum itself created (on any machine). */
  appTagged: boolean;
  /** The note's text mentions the card's reading. */
  readingMatches?: boolean;
}

/**
 * Which existing note a Gum card is. Notes Gum created win over notes the user
 * made by hand, a reading match narrows homographs, and among equals the oldest
 * note (lowest id) is the canonical one — AnkiWeb keeps ids, so every machine
 * picks the same note.
 */
export function pickAnkiLinkCandidate(candidates: readonly AnkiLinkCandidate[]): { noteId: number | null; ambiguous: boolean } {
  if (!candidates.length) return { noteId: null, ambiguous: false };
  let pool = [...candidates];
  const tagged = pool.filter((c) => c.appTagged);
  if (tagged.length) pool = tagged;
  const reading = pool.filter((c) => c.readingMatches);
  if (reading.length) pool = reading;
  pool.sort((a, b) => a.noteId - b.noteId);
  return { noteId: pool[0].noteId, ambiguous: pool.length > 1 };
}

// ----- Status summary -----------------------------------------------------------

export interface AnkiDeckLinkSummary {
  deck: string;
  /** Gum cards linked to an Anki note by id. */
  linked: number;
  /** Waiting in the mining queue. */
  pending: number;
  /** Known to be in Anki (exported or a duplicate) but not linked by id yet. */
  unlinked: number;
}

export interface AnkiLinkFlags {
  ankiDeck?: string;
  ankiNoteId?: number;
  ankiPending?: boolean;
  ankiDuplicate?: boolean;
  ankiExported?: boolean;
}

/** Per-deck mapping summary for the sync panel. `fallbackDeck` names cards with no recorded deck. */
export function summarizeAnkiDeckLinks(
  cards: readonly AnkiLinkFlags[],
  fallbackDeck: string,
): AnkiDeckLinkSummary[] {
  const rows = new Map<string, AnkiDeckLinkSummary>();
  for (const card of cards) {
    const linked = typeof card.ankiNoteId === 'number' && card.ankiNoteId > 0;
    const pending = card.ankiPending === true;
    const unlinked = !linked && !pending && (card.ankiDuplicate === true || card.ankiExported === true);
    if (!linked && !pending && !unlinked) continue;
    const deck = card.ankiDeck?.trim() || fallbackDeck;
    const row = rows.get(deck) ?? { deck, linked: 0, pending: 0, unlinked: 0 };
    if (linked) row.linked += 1;
    else if (pending) row.pending += 1;
    else row.unlinked += 1;
    rows.set(deck, row);
  }
  return [...rows.values()].sort((a, b) => a.deck.localeCompare(b.deck));
}

/** Cards a link pass should look up: Anki has (or will have) them, Gum has no id. */
export function needsAnkiLink(card: AnkiLinkFlags & { word?: string }): boolean {
  if (typeof card.ankiNoteId === 'number' && card.ankiNoteId > 0) return false;
  if (!card.word?.trim()) return false;
  return card.ankiPending === true || card.ankiDuplicate === true || card.ankiExported === true;
}
