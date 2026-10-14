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
 * away, or refused as a duplicate) is linked by field match — the term field a
 * profile writes, equal to the card's word, searched only within that profile's
 * note type AND deck (and, when the card records the deck it went to, only that
 * deck) — never by creating a second note. Linking writes note ids onto Gum
 * cards, so it runs only while sync is on (sending answers, or Anki owning
 * scheduling) or when the user asks for it ("Link existing notes"), and a pass
 * pages through every card that needs it, a batch at a time.
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
 *  3. Every answer, in order. Several Gum answers to one card waiting in the
 *     queue (offline, relearning steps) are ALL replayed, oldest first, in one
 *     `answerCards` request: "again, then good" reaches Anki as a lapse followed
 *     by a pass, so Anki's lapse count, ease and relearning state match what
 *     happened. (Collapsing to the latest answer used to turn that into a
 *     single "good" and lose the lapse.) A note's answers always travel in the
 *     same request — split across two, rule 2 would refuse the second half,
 *     because the first half makes Anki's card newer than it. Anki dates every
 *     replayed answer "now", so the learning-step timings of a burst are
 *     compressed; the sequence of buttons, which decides the state, is exact.
 *     Only when one note has more answers waiting than fit one request
 *     (`ANKI_SYNC_PUSH_BATCH`) are the oldest extras `superseded`.
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
 *     sends nothing twice (a replay that lost its reply meets rule 2: Anki's
 *     card is newer than every answer in it).
 * 10. Errors. "Anki is away" (closed, collection loading, network) and unknown
 *     refusals are retried with a growing pause (`ankiSyncBackoffMs`); the queue
 *     is kept. An AnkiConnect that cannot do the job (too old, API key, old API
 *     version) PAUSES sync instead: the queue is kept, the panel names the fix,
 *     and sync resumes on "Sync now" or when Anki reconnects. Neither kind ever
 *     costs an answer. Only an answer Anki refuses on its own (a per-answer
 *     `failed`) counts attempts, and after `ANKI_SYNC_MAX_ATTEMPTS` it leaves the
 *     queue into the panel's "not sent" list — never silently.
 *  9. Which card. A note with several cards (recognition + production) is
 *     answered on its lowest-ordinal card that is not suspended — the card the
 *     Gum deck mirrors.
 */

import { ANKI_COLLECTION_UNAVAILABLE_MSG, ANKI_UNREACHABLE_MSG } from './anki';
import type { LocalSrsRating } from './localSrs';
import { normalizeDayStartHour, startOfStudyDayIndex, studyDayIndex } from './studyDay';

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
/**
 * Per-answer refusals (Anki answered the request but not this answer) before the
 * answer leaves the queue into the panel's "not sent" list (rule 10).
 */
export const ANKI_SYNC_MAX_ATTEMPTS = 5;
/** Linked notes whose schedule one pull reads. */
export const ANKI_SYNC_PULL_BATCH = 2000;
/** Unlinked Gum cards per link request; a link pass pages through all of them. */
export const ANKI_SYNC_LINK_BATCH = 200;
/** Pause between two link requests of one pass, so a big deck cannot flood AnkiConnect. */
export const ANKI_SYNC_LINK_PAUSE_MS = 250;
/** First retry delay after a retryable failure; doubles per failure up to the max. */
export const ANKI_SYNC_BACKOFF_BASE_MS = 2 * 60_000;
export const ANKI_SYNC_BACKOFF_MAX_MS = 60 * 60_000;

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

/** Errors that mean "Anki is away, try again later": nothing about the data is wrong. */
export function isTransientAnkiSyncError(kind: AnkiSyncErrorKind): boolean {
  return kind === 'unreachable' || kind === 'collection';
}

/**
 * Rule 10: what a whole-request failure does to the queue. `pause` — this
 * AnkiConnect cannot do the job until the user fixes something (update the
 * add-on, remove its API key); retrying on a timer would only fail again.
 * `retry` — Anki is away, on another profile (the run probes first, so
 * switching back resumes it), or refused for a reason we cannot name: try again
 * after `ankiSyncBackoffMs`. Both keep every answer.
 */
export function ankiSyncErrorAction(kind: AnkiSyncErrorKind): 'retry' | 'pause' {
  return kind === 'unsupported' || kind === 'permission' || kind === 'version' ? 'pause' : 'retry';
}

/** Wait before retry number `failures` (1-based): doubling from the base, capped. */
export function ankiSyncBackoffMs(failures: number): number {
  const n = Math.max(1, Math.floor(failures) || 1);
  return Math.min(ANKI_SYNC_BACKOFF_MAX_MS, ANKI_SYNC_BACKOFF_BASE_MS * 2 ** Math.min(n - 1, 16));
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
  /**
   * Sent now, oldest first, at most `ANKI_SYNC_PUSH_BATCH`: every waiting answer
   * of each note it includes, in review order (rule 3).
   */
  push: AnkiReviewOutboxItem[];
  /** Review ids that cannot be replayed: a note with more answers waiting than one request holds (rule 3). */
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
  const groups: AnkiReviewOutboxItem[][] = [];
  const superseded: string[] = [];
  let waiting = 0;
  for (const list of byNote.values()) {
    list.sort(compareAnkiAnswers);
    const latest = list[list.length - 1];
    // Inside the grace the latest answer may still be undone. Sending the
    // earlier ones now would make Anki's card newer than the latest, and rule 2
    // would then refuse it: nothing for this note moves yet.
    if (!options.force && now - latest.reviewedAt < ANKI_SYNC_UNDO_GRACE_MS) {
      waiting += list.length;
      continue;
    }
    if (list.length > batch) {
      for (const extra of list.slice(0, list.length - batch)) superseded.push(extra.reviewId);
      groups.push(list.slice(list.length - batch));
    } else {
      groups.push(list);
    }
  }
  // Oldest note first; a note's answers are never split across two requests.
  groups.sort((a, b) => compareAnkiAnswers(a[0], b[0]));
  const push: AnkiReviewOutboxItem[] = [];
  for (const group of groups) {
    if (push.length + group.length > batch) {
      waiting += group.length;
      continue;
    }
    push.push(...group);
  }
  push.sort(compareAnkiAnswers);
  return { push, superseded, stale, waiting };
}

/** Review order: when it was answered, then the review id (stable for answers in one millisecond). */
export function compareAnkiAnswers(
  a: Pick<AnkiReviewPushItem, 'reviewedAt' | 'reviewId'>,
  b: Pick<AnkiReviewPushItem, 'reviewedAt' | 'reviewId'>,
): number {
  return a.reviewedAt - b.reviewedAt || a.reviewId.localeCompare(b.reviewId);
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

export interface AnkiMirrorContext {
  /** Anki's own day number for today, or null when it could not be anchored. */
  todayDay: number | null;
  isDue: boolean;
  now: number;
  /**
   * The hour a study day starts (Gum's Settings → Scheduling, 4 am by default,
   * which is also Anki's default "next day starts at"). A day number is a STUDY
   * day: at 02:00 Anki's "today" is still yesterday's date, and a card due
   * tomorrow is due from 04:00 tomorrow, not from midnight.
   */
  dayStartHour?: number;
}

/**
 * When a card due on Anki day `due` becomes due, given Anki's `todayDay`: the
 * START of the study day that many days after the one containing `now`, on the
 * local calendar (so a daylight-saving change is still one day).
 */
export function ankiDayToDueAt(due: number, todayDay: number, now: number, dayStartHour?: number): number {
  const hour = normalizeDayStartHour(dayStartHour);
  return startOfStudyDayIndex(studyDayIndex(now, hour) + (due - todayDay), hour);
}

/**
 * One `cardsInfo` row as a mirror entry. Anki's `due` is a Unix time (seconds)
 * for intraday learning cards and a day number for review / day-learning ones;
 * a day number becomes a date only against `todayDay` (Anki's own day number
 * for today, anchored by the caller), else `dueAt` is left out rather than
 * guessed. A dated day number is due from the start of its study day
 * (`ankiDayToDueAt`), as Anki shows it.
 */
export function ankiMirrorFromCard(row: AnkiSyncCardRow, context: AnkiMirrorContext): AnkiScheduleMirror {
  const state = ankiMirrorState(row);
  const due = typeof row.due === 'number' && Number.isFinite(row.due) ? row.due : undefined;
  let dueAt: number | undefined;
  if (due !== undefined && row.type !== 0) {
    if (due > 1_000_000_000) dueAt = due * 1000;
    else if (context.todayDay !== null) dueAt = ankiDayToDueAt(due, context.todayDay, context.now, context.dayStartHour);
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

/**
 * Whether a mirrored card is due by its date alone, for an AnkiConnect without
 * `areDue`. Every dated card is due once its `dueAt` has passed: an intraday
 * step at its minute, a day card from the start of its study day. (This used
 * to add a day minus a millisecond to day cards anchored at midnight, which
 * called a card due tomorrow due all day today.)
 */
export function ankiMirrorDueByDate(mirror: Pick<AnkiScheduleMirror, 'dueAt' | 'state'>, now: number): boolean {
  if (mirror.dueAt === undefined || mirror.state === 'suspended' || mirror.state === 'buried') return false;
  return mirror.dueAt <= now;
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
  /** The Anki deck the card was sent to, when recorded: only that deck is searched. */
  deck?: string;
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
