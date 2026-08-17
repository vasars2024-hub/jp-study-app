// Stale cards — ANKI_DECK_WORKBENCH_PLAN.md Phase 7, smart recipe 18: "find
// stale cards by last review/due state and preview reset or reschedule options".
//
// Two axes, and the recipe names both, so a verdict must say which one fired:
//
//   * **due state** — `card.due` for a review card is a day number counted from
//     the collection's `crt`, so "how overdue" is `today - due`. Planned, not
//     observed: it says when Anki *intended* to show the card.
//   * **last review** — the revlog's newest `reviewedAtMs` for the card. Observed,
//     not planned: it says when the user actually saw it. A package that carries
//     no `revlog` cannot answer this at all, which is common enough that the
//     recipe reports it by name (`reviewHistory: 'absent'`) instead of quietly
//     calling every card fresh.
//
// The two disagree in exactly the case the recipe exists for: a deck abandoned
// mid-way has cards whose due day passed long ago *and* whose last review is
// older still, while a deck rescheduled by a preset change is deeply overdue
// with recent reviews. Reporting one number would call those the same deck.
//
// Deliberately not a single "staleness score". A score has to weigh a day of
// overdue against a day of silence, there is no defensible exchange rate, and
// the user cannot see which half of it moved.

import type { AnkiCardQueue, AnkiDraft, AnkiDraftCard, AnkiDraftReview } from './ankiDraft';

/**
 * One card's standing, healthiest first. `withheld` is last on purpose — see
 * `STALE_SEVERITY`.
 */
export type StaleVerdict =
  /** Never scheduled: still in the new queue, never reviewed. Cannot be stale. */
  | 'new'
  /** Scheduled and inside both thresholds. */
  | 'active'
  /** Its due day passed at least `overdueDays` ago. */
  | 'overdue'
  /** The user has not reviewed it in at least `dormantDays`. Needs review history. */
  | 'dormant'
  /**
   * Suspended or buried. Anki will not show it whatever its due day says, so
   * the remedy is to unsuspend it and *not* to reschedule it.
   */
  | 'withheld';

/**
 * Worst wins, and `withheld` outranks both stale verdicts because its remedy is
 * different in kind: rescheduling a suspended card writes a number Anki will
 * never read, which is a change that looks like a fix and is not one. Recipe
 * 17's `orphan` outranks its duplicate verdicts for the same reason.
 */
const STALE_SEVERITY = new Map<StaleVerdict, number>([
  ['new', 0],
  ['active', 1],
  ['overdue', 2],
  ['dormant', 3],
  ['withheld', 4],
]);

export const STALE_VERDICTS = ['new', 'active', 'overdue', 'dormant', 'withheld'] as const;

export function parseStaleVerdict(value: string): StaleVerdict | null {
  const key = value.trim().toLowerCase();
  return (STALE_VERDICTS as readonly string[]).includes(key) ? (key as StaleVerdict) : null;
}

/** Queues Anki will not hand a card out from, whatever `type` or `due` say. */
const WITHHELD_QUEUES: ReadonlySet<AnkiCardQueue> = new Set<AnkiCardQueue>([
  'suspended',
  'buried-sibling',
  'buried-user',
]);

const SECONDS_PER_DAY = 86_400;
const MS_PER_DAY = 86_400_000;

/**
 * Smallest threshold either axis accepts. The day boundary here is the
 * collection's *creation* time of day, not its configured rollover hour — the
 * draft never carries `col.conf.rollover` — so any verdict can be one day out.
 * A threshold under a day would therefore be noise dressed as a measurement.
 */
export const MIN_STALE_THRESHOLD_DAYS = 1;

export const DEFAULT_OVERDUE_DAYS = 21;
export const DEFAULT_DORMANT_DAYS = 90;

/** Why a card could not be classified. One reason, the first that applies. */
export type StaleRefusal =
  /**
   * The draft's source reported no `col.crt`, so a review card's `due` day
   * number counts from an unknown origin. Every overdue reading would be
   * wrong by the same unknown offset, so none is produced.
   */
  | 'no-collection-origin'
  /** A threshold below `MIN_STALE_THRESHOLD_DAYS`, or not a finite number. */
  | 'threshold-too-small'
  /**
   * `reset` was asked for. The journal carries `field`, `tags`, `card-due`,
   * `card-deck` and `deck-name` — a reset has to write `type`, `queue`, `reps`,
   * `lapses`, `interval` and `easeFactor` and drop the card's revlog. Writing
   * only `due` would leave a review card holding a review card's interval and
   * ease while claiming it had been forgotten, so this is refused by name
   * before anything is planned rather than half-performed.
   */
  | 'reset-unsupported'
  /** The card is suspended or buried: a new due day changes nothing it shows. */
  | 'withheld'
  /** The card is not a review card, so `due` is a queue position or an epoch second. */
  | 'not-review'
  /** The card is inside both thresholds; there is nothing to reschedule. */
  | 'not-stale';

/**
 * Whether the draft could answer the "last review" axis at all.
 *
 * `present` and `absent` are the two the reader can see. The other two split
 * what the reader reports as an empty log, and the split was forced by real
 * data: all 33 of the user's packages carry the `revlog` table with **zero**
 * rows, and in three of them 676–959 cards hold `reps` up to 41. A card reviewed
 * 41 times and a log saying nobody ever reviewed anything cannot both be true —
 * the history was dropped at export, and `dormant: 0` there is a false claim
 * rather than a clean bill of health.
 */
export type StaleReviewHistory =
  /** The source carried a `revlog` with rows, and they were read. */
  | 'present'
  /** The source carried no `revlog` table at all, so `dormant` can never fire. */
  | 'absent'
  /**
   * The table is there and empty, and no card claims a review either. The deck
   * genuinely has not been studied, so `dormant: 0` is the true answer.
   */
  | 'empty'
  /**
   * The table is there and empty, but cards carry `reps > 0`. The export dropped
   * the history; `dormant` is unanswerable and must not be reported as zero.
   */
  | 'dropped';

/** True when the "last review" axis can produce a verdict at all. */
export function staleHistoryIsReadable(history: StaleReviewHistory): boolean {
  return history === 'present' || history === 'empty';
}

export interface StaleCardFacts {
  cardId: string;
  noteId: string;
  verdict: StaleVerdict;
  /**
   * Days past the card's due day, or `null` when `due` is not a day number
   * (a new/learning card) or the origin is unknown. Negative would mean "not
   * yet due", so it is clamped to `null` — a card due tomorrow is not -1 stale.
   */
  overdueDays: number | null;
  /**
   * The card's `due` as a day number, or `null` when `due` is not one.
   *
   * Separate from `overdueDays` because that one is clamped, and the two
   * therefore answer different questions: `overdueDays` is null for a review
   * card due tomorrow, `dueDay` is not. A remedy that read the clamped value to
   * decide whether a card *has* a day would refuse every dormant card whose due
   * is still in the future — which is the recipe's headline case, a deck the
   * user stopped studying long before its cards came due.
   */
  dueDay: number | null;
  /** Days since the newest revlog entry, or `null` with no history for this card. */
  sinceReviewDays: number | null;
  /** Lapses, carried through so a surface can rank a rescue queue without re-reading cards. */
  lapses: number;
}

export interface StaleTally {
  new: number;
  active: number;
  overdue: number;
  dormant: number;
  withheld: number;
}

export function emptyStaleTally(): StaleTally {
  return { new: 0, active: 0, overdue: 0, dormant: 0, withheld: 0 };
}

export function tallyStaleVerdicts(verdicts: Iterable<StaleVerdict>): StaleTally {
  const tally = emptyStaleTally();
  for (const verdict of verdicts) tally[verdict] += 1;
  return tally;
}

export interface StaleThresholds {
  /** Days past due before a review card reads `overdue`. */
  overdueDays?: number;
  /** Days without a review before a card reads `dormant`. */
  dormantDays?: number;
}

export interface StaleScanInput extends StaleThresholds {
  draft: AnkiDraft;
  /** Wall clock, passed in rather than read, so a scan is reproducible in a test. */
  nowMs: number;
}

export type StaleScanResult =
  | { ok: false; refusal: StaleRefusal }
  | {
      ok: true;
      cards: StaleCardFacts[];
      tally: StaleTally;
      reviewHistory: StaleReviewHistory;
      /** The thresholds actually used, defaults resolved, so a surface can state them. */
      overdueDays: number;
      dormantDays: number;
      /** Today as a `due` day number, so a reschedule and a verdict share one origin. */
      todayDay: number;
    };

function resolveThreshold(value: number | undefined, fallback: number): number | null {
  if (value === undefined) return fallback;
  if (!Number.isFinite(value)) return null;
  const days = Math.trunc(value);
  return days < MIN_STALE_THRESHOLD_DAYS ? null : days;
}

/**
 * Today as a `due` day number: whole days from the collection's creation to now.
 * The same conversion Anki's own scheduler does, minus the rollover hour it has
 * and the draft does not — see `MIN_STALE_THRESHOLD_DAYS`.
 */
export function todayDueDay(createdAtSec: number, nowMs: number): number {
  return Math.floor((nowMs / 1000 - createdAtSec) / SECONDS_PER_DAY);
}

/**
 * Newest review per card. One pass over the revlog rather than a sort: the log
 * of a real collection runs to hundreds of thousands of rows and only its
 * maximum per card is wanted.
 */
export function newestReviewByCard(
  reviews: readonly AnkiDraftReview[],
): ReadonlyMap<string, number> {
  const newest = new Map<string, number>();
  for (const review of reviews) {
    const seen = newest.get(review.cardId);
    if (seen === undefined || review.reviewedAtMs > seen) newest.set(review.cardId, review.reviewedAtMs);
  }
  return newest;
}

/**
 * Classify every card in the draft.
 *
 * Pure: it reads a draft and returns a description. Nothing is written — a
 * surface turns the result into `card-due` ops through `planStaleReschedule`.
 */
export function scanStaleCards(input: StaleScanInput): StaleScanResult {
  const { draft, nowMs } = input;
  const overdueDays = resolveThreshold(input.overdueDays, DEFAULT_OVERDUE_DAYS);
  const dormantDays = resolveThreshold(input.dormantDays, DEFAULT_DORMANT_DAYS);
  if (overdueDays === null || dormantDays === null) {
    return { ok: false, refusal: 'threshold-too-small' };
  }
  // `<= 0` and not merely absent. Measured on a real package while building
  // recipe 26: `Ginga Eiyuu Densetsu.apkg` reports `crt: 0`, which
  // `apkgImport.ts:465` passes straight through. Zero is finite, so the
  // isFinite test alone admitted a 1970 origin and made `todayDay` about
  // 20,700 — every review card then reads `overdue` by twenty thousand days,
  // which is a number, not a refusal, and the surface has no way to doubt it.
  const createdAtSec = draft.source.createdAtSec;
  if (typeof createdAtSec !== 'number' || !Number.isFinite(createdAtSec) || createdAtSec <= 0) {
    return { ok: false, refusal: 'no-collection-origin' };
  }

  const todayDay = todayDueDay(createdAtSec, nowMs);
  const newest = newestReviewByCard(draft.reviews ?? []);

  const cards: StaleCardFacts[] = [];
  let anyReps = false;
  for (const card of draft.cards) {
    if (card.reps > 0) anyReps = true;
    cards.push(classifyCard(card, { todayDay, nowMs, newest, overdueDays, dormantDays }));
  }

  // `undefined` is "no revlog table"; `[]` is "table present, no rows". The
  // second is only good news when the cards agree with it — see
  // `StaleReviewHistory`.
  const reviewHistory: StaleReviewHistory =
    draft.reviews === undefined
      ? 'absent'
      : draft.reviews.length > 0
        ? 'present'
        : anyReps
          ? 'dropped'
          : 'empty';

  return {
    ok: true,
    cards,
    tally: tallyStaleVerdicts(cards.map((c) => c.verdict)),
    reviewHistory,
    overdueDays,
    dormantDays,
    todayDay,
  };
}

interface ClassifyContext {
  todayDay: number;
  nowMs: number;
  newest: ReadonlyMap<string, number>;
  overdueDays: number;
  dormantDays: number;
}

function classifyCard(card: AnkiDraftCard, ctx: ClassifyContext): StaleCardFacts {
  const lastReviewMs = ctx.newest.get(card.id);
  const sinceReviewDays =
    lastReviewMs === undefined ? null : Math.floor((ctx.nowMs - lastReviewMs) / MS_PER_DAY);

  // Only a review card's `due` is a day number. A learning card's is an epoch
  // second and a new card's is a queue position, so subtracting `todayDay` from
  // either produces a number in the millions or a plausible-looking lie.
  const isDayNumber = card.type === 'review' || card.type === 'relearning';
  const dueDay = isDayNumber ? card.due : null;
  const rawOverdue = dueDay === null ? null : ctx.todayDay - dueDay;
  const overdueDays = rawOverdue !== null && rawOverdue > 0 ? rawOverdue : null;

  const facts = {
    cardId: card.id,
    noteId: card.noteId,
    overdueDays,
    dueDay,
    sinceReviewDays,
    lapses: card.lapses,
  };

  // Withheld first: it is the one verdict whose remedy is not a reschedule, so
  // it must not be masked by an overdue reading the user would then act on.
  if (WITHHELD_QUEUES.has(card.queue)) return { ...facts, verdict: 'withheld' };

  // A card that has never been reviewed and is still new is not stale by any
  // reading of the word. Checked against the revlog too, because a card
  // *returned* to the new queue by a forget has a review history and a user who
  // asks for stale cards means that one.
  if (card.type === 'new' && card.reps === 0 && lastReviewMs === undefined) {
    return { ...facts, verdict: 'new' };
  }

  const worst: StaleVerdict[] = ['active'];
  if (sinceReviewDays !== null && sinceReviewDays >= ctx.dormantDays) worst.push('dormant');
  if (overdueDays !== null && overdueDays >= ctx.overdueDays) worst.push('overdue');

  let verdict: StaleVerdict = 'active';
  for (const candidate of worst) {
    if ((STALE_SEVERITY.get(candidate) ?? 0) > (STALE_SEVERITY.get(verdict) ?? 0)) verdict = candidate;
  }
  return { ...facts, verdict };
}

// ----- the Browser predicate's context ----------------------------------------

/**
 * Per-**note** verdicts for the Browser's `stale:` predicate. A row is a note
 * and a verdict belongs to a card, so a note takes its worst card's verdict —
 * the same rule recipe 17 uses, and for the same reason: a note with one
 * dormant card is a note the user has stopped seeing.
 *
 * Precomputed like `SiblingAuditContext`: the revlog pass is per-draft, not
 * per-row, so recomputing it per keystroke would walk the whole log thousands
 * of times.
 */
export type StaleContext = ReadonlyMap<string, StaleVerdict>;

export function buildStaleContext(
  draft: AnkiDraft,
  nowMs: number,
  thresholds: StaleThresholds = {},
): StaleContext | null {
  const scan = scanStaleCards({ draft, nowMs, ...thresholds });
  if (!scan.ok) return null;
  const byNote = new Map<string, StaleVerdict>();
  for (const facts of scan.cards) {
    const seen = byNote.get(facts.noteId);
    if (seen === undefined || (STALE_SEVERITY.get(facts.verdict) ?? 0) > (STALE_SEVERITY.get(seen) ?? 0)) {
      byNote.set(facts.noteId, facts.verdict);
    }
  }
  // A note with no cards at all gets no entry rather than a fabricated `new`:
  // `orphan-card`/`note-without-cards` are the draft's own diagnostics for that,
  // and answering `stale:` for it would invent a schedule it does not have.
  return byNote;
}

// ----- the remedy preview -----------------------------------------------------

export type StaleRemedyMode = 'reschedule' | 'reset';

export interface StaleReschedule {
  noteId: string;
  cardId: string;
  verdict: StaleVerdict;
  /** The card's `due` day before the move. */
  before: number;
  /** The day it receives. Always `todayDay` or later — never a day in the past. */
  after: number;
  overdueDays: number;
}

export interface StaleRemedySkip {
  cardId: string;
  noteId: string;
  refusal: StaleRefusal;
}

export interface StaleRemedyPlan {
  moves: StaleReschedule[];
  skips: StaleRemedySkip[];
  /** Moves whose `after` equals `before` are still moves; this counts the rest. */
  changedCards: number;
}

export type StaleRemedyResult =
  | { ok: false; refusal: StaleRefusal }
  | { ok: true; plan: StaleRemedyPlan };

export interface StaleRemedyInput {
  scan: Extract<StaleScanResult, { ok: true }>;
  mode: StaleRemedyMode;
  /**
   * Days to spread the backlog over, starting today. `1` puts every stale card
   * due today, which is the honest default only for a handful of cards — a
   * 3,000-card backlog dumped on one day is a wall the user will abandon again,
   * which is the state this recipe found.
   */
  spreadDays?: number;
  /** Cards to act on. Absent means every `overdue`/`dormant` card in the scan. */
  cardIds?: readonly string[];
}

export const DEFAULT_STALE_SPREAD_DAYS = 14;

/**
 * The `card-due` moves a reschedule would make, and every card it refused with
 * the reason. `reset` is refused whole — see `reset-unsupported`.
 */
export function planStaleRemedy(input: StaleRemedyInput): StaleRemedyResult {
  if (input.mode === 'reset') return { ok: false, refusal: 'reset-unsupported' };

  const spread = Number.isFinite(input.spreadDays)
    ? Math.max(1, Math.trunc(input.spreadDays as number))
    : DEFAULT_STALE_SPREAD_DAYS;
  const wanted = input.cardIds ? new Set(input.cardIds) : null;
  const { cards, todayDay } = input.scan;

  const eligible: StaleCardFacts[] = [];
  const skips: StaleRemedySkip[] = [];
  for (const facts of cards) {
    if (wanted && !wanted.has(facts.cardId)) continue;
    const seat = { cardId: facts.cardId, noteId: facts.noteId };
    if (facts.verdict === 'withheld') {
      skips.push({ ...seat, refusal: 'withheld' });
      continue;
    }
    // `dueDay` and not `overdueDays`: the latter is clamped at zero, so reading
    // it here would call a review card due tomorrow "not a review card" and
    // refuse every dormant card whose due has not arrived yet — the recipe's
    // headline case. `dueDay === null` is exactly "its `due` is not a day
    // number", which is new and learning cards and nothing else.
    if (facts.dueDay === null) {
      skips.push({ ...seat, refusal: 'not-review' });
      continue;
    }
    if (facts.verdict !== 'overdue' && facts.verdict !== 'dormant') {
      skips.push({ ...seat, refusal: 'not-stale' });
      continue;
    }
    eligible.push(facts);
  }

  // Longest overdue first, so the cards the user is furthest behind on come back
  // first. Ties broken by card id only — a stable order, because an unstable one
  // makes the same preview produce a different deck every time it is opened.
  eligible.sort((a, b) => {
    const byOverdue = (b.overdueDays ?? 0) - (a.overdueDays ?? 0);
    if (byOverdue !== 0) return byOverdue;
    return a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0;
  });

  const moves: StaleReschedule[] = [];
  let changedCards = 0;
  eligible.forEach((facts, index) => {
    // Round-robin across the window rather than filling day 1 then day 2: the
    // worst cards should not all land together, and an even split keeps each
    // day's load within one card of every other day's.
    const after = todayDay + (index % spread);
    // The card's real day, not `todayDay - overdueDays`. Those agree on an
    // overdue card by construction and disagree on a dormant one whose due is
    // still ahead, where the derived form would report a `before` in the past.
    const before = facts.dueDay ?? todayDay;
    moves.push({
      noteId: facts.noteId,
      cardId: facts.cardId,
      verdict: facts.verdict,
      before,
      after,
      overdueDays: facts.overdueDays ?? 0,
    });
    if (after !== before) changedCards += 1;
  });

  return { ok: true, plan: { moves, skips, changedCards } };
}
