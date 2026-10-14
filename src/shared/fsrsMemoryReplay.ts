/**
 * Rebuild FSRS memory from the review log: Anki's "reschedule cards on change".
 *
 * A card's stored stability and difficulty are the product of every review it
 * has had, run through whichever weights were in use at the time. Change the
 * weights (a new optimiser fit, back to the defaults) or switch a deck from
 * SM-2 to FSRS and the stored pair no longer means what the new model would
 * say. Anki answers that by replaying each card's review history under the new
 * parameters; this file is that replay, pure and clock-injected.
 *
 * Two operations, both previews until the user applies them:
 *
 * - **memory only** (`rescheduleDue: false`): what switching to FSRS does. Each
 *   card gets the stability/difficulty its history implies; due dates stay put,
 *   so nobody's queue moves under them.
 * - **memory and due dates** (`rescheduleDue: true`): the opt-in "reschedule".
 *   A review card's interval is recomputed from the new stability at the
 *   desired retention and counted from its last review day, exactly as Anki's
 *   reschedule does. Cards inside learning steps keep their step due time.
 *
 * The replay follows the reference (fsrs-rs `memory_state`): the history starts
 * at the card's first review (the last one, if the schedule was ever reset); a
 * review on the same study day as the previous one is a short-term step
 * (w17/w18), anything later is a long-term review over whole study days.
 *
 * A history that does not reach back to the first review (the log was capped,
 * the card was imported with a schedule) starts from fsrs-rs's
 * `memory_state_from_sm2` estimate built from the interval the first logged
 * review had, which is what Anki does with a truncated revlog. A card with no
 * history at all but an SM-2 schedule gets the same estimate from its current
 * ease and interval — never a restart as a new card.
 *
 * Both FSRS versions replay through the same code: the weights decide (see
 * `fsrs.ts`), so an FSRS-6 preset's cards are rebuilt with its fitted decay and
 * same-day term, and the interval of a rescheduled card is read off that
 * preset's own forgetting curve. With presets, each card is replayed under the
 * preset of its deck folder (`configForCard`).
 */
import {
  DEFAULT_FSRS_WEIGHTS,
  fsrsInterval,
  fsrsMemoryFromSm2,
  fsrsReview,
  fsrsShortTermReview,
  type FsrsGrade,
  type FsrsMemory,
} from './fsrs';
import type { LocalSrsRating, LocalSrsState } from './localSrs';
import { startOfStudyDayIndex, studyDayIndex, type StudyDayOptions } from './studyDay';

const GRADE: Record<LocalSrsRating, FsrsGrade> = { again: 1, hard: 2, good: 3, easy: 4 };

/** The review-log fields a replay reads (a subset of `ReviewLogEntry`). */
export interface ReplayLogRow {
  cardId?: string;
  at: number;
  rating?: LocalSrsRating;
  isNew?: boolean;
  /** Only `review` rows are replayed when a mode is given. */
  mode?: string;
  /** The interval the card had before this review, in days. */
  prevIntervalDays?: number;
}

export interface ReplayOptions extends StudyDayOptions {
  weights?: readonly number[];
  /** The retention SM-2 is assumed to have achieved (Anki's "historical retention"). */
  sm2Retention?: number;
  /** Ease for the SM-2 estimate of a truncated history. */
  startEase?: number;
}

export interface FsrsReplayResult {
  memory: FsrsMemory;
  /** Reviews replayed. */
  reviews: number;
  /** Epoch ms of the last replayed review. */
  lastReviewedAt: number;
  /** The history started at a first review; false when it began from an SM-2 estimate. */
  complete: boolean;
}

function isReplayable(row: ReplayLogRow): row is ReplayLogRow & { rating: LocalSrsRating } {
  return (row.mode === undefined || row.mode === 'review')
    && row.rating !== undefined
    && GRADE[row.rating] !== undefined
    && Number.isFinite(row.at);
}

/**
 * Replay one card's reviews (any order; other cards' rows are not filtered
 * here) into a memory state, or null when there is nothing to replay.
 */
export function replayFsrsMemory(
  rows: readonly ReplayLogRow[],
  options: ReplayOptions = {},
): FsrsReplayResult | null {
  const weights = options.weights ?? DEFAULT_FSRS_WEIGHTS;
  const list = rows.filter(isReplayable).sort((a, b) => a.at - b.at);
  if (!list.length) return null;
  // A later "first review" means the schedule was reset: only that life counts.
  let start = 0;
  for (let i = list.length - 1; i >= 0; i -= 1) {
    if (list[i].isNew) {
      start = i;
      break;
    }
  }
  const history = list.slice(start);
  const complete = history[0].isNew === true;
  let memory: FsrsMemory | null = null;
  let lastDay = 0;
  let replayed = 0;
  for (let i = 0; i < history.length; i += 1) {
    const row = history[i];
    const grade = GRADE[row.rating];
    const day = studyDayIndex(row.at, options);
    if (i === 0) {
      const prev = row.prevIntervalDays ?? 0;
      if (!complete && prev >= 1) {
        // Truncated: the state before this review is SM-2's, estimated.
        const before = fsrsMemoryFromSm2(options.startEase ?? 2.5, prev, options.sm2Retention ?? 0.9, weights);
        memory = fsrsReview(before, grade, Math.round(prev), weights);
      } else {
        memory = fsrsReview(null, grade, 0, weights);
      }
    } else if (memory) {
      const delta = day - lastDay;
      memory = delta <= 0
        ? fsrsShortTermReview(memory, grade, weights)
        : fsrsReview(memory, grade, delta, weights);
    }
    lastDay = day;
    replayed += 1;
  }
  if (!memory) return null;
  return { memory, reviews: replayed, lastReviewedAt: history[history.length - 1].at, complete };
}

/** A card as the planner needs it. */
export interface ReplayCard {
  id: string;
  suspended?: boolean;
  srs?: LocalSrsState | null;
  /** The deck folder, which decides the card's preset when `configForCard` is given. */
  folder?: string;
}

export interface FsrsReplayConfig extends StudyDayOptions {
  weights?: readonly number[];
  desiredRetention: number;
  maximumIntervalDays: number;
  sm2Retention?: number;
}

export type FsrsReplaySource = 'log' | 'sm2' | 'kept';

export interface FsrsReplayEntry {
  id: string;
  source: FsrsReplaySource;
  /** The card's `lastReviewedAt` when planned: applying skips a card reviewed since. */
  lastReviewedAt: number;
  before: { stability?: number; difficulty?: number; intervalDays: number; dueAt: number };
  after: { stability: number; difficulty: number; intervalDays: number; dueAt: number };
}

export interface FsrsReplayPlan {
  entries: FsrsReplayEntry[];
  /** Scheduled cards considered. */
  considered: number;
  /** Entries whose memory came from the log / from an SM-2 estimate / was kept as stored. */
  fromLog: number;
  fromSm2: number;
  kept: number;
  /** Cards whose due date the plan moves (always 0 for a memory-only plan). */
  moved: number;
  /** Due now (or overdue), before and after applying. */
  dueBefore: number;
  dueAfter: number;
  /** Mean review interval, in days, before and after (review cards only). */
  meanIntervalBefore: number | null;
  meanIntervalAfter: number | null;
}

const EPSILON = 1e-6;

function sameMemory(a: { stability?: number; difficulty?: number }, b: FsrsMemory): boolean {
  return a.stability !== undefined && a.difficulty !== undefined
    && Math.abs(a.stability - b.stability) < EPSILON
    && Math.abs(a.difficulty - b.difficulty) < EPSILON;
}

/**
 * What a replay would do to every scheduled, unsuspended card, without doing
 * it. `rescheduleDue` false is the memory-only conversion; true also moves
 * review cards' due dates to `last review day + new interval`.
 */
export function planFsrsReplay<C extends ReplayCard>(
  cards: readonly C[],
  log: readonly ReplayLogRow[],
  shared: FsrsReplayConfig,
  now: number,
  rescheduleDue: boolean,
  configForCard?: (card: C) => FsrsReplayConfig,
): FsrsReplayPlan {
  const byCard = new Map<string, ReplayLogRow[]>();
  for (const row of log) {
    if (!row.cardId) continue;
    const list = byCard.get(row.cardId);
    if (list) list.push(row);
    else byCard.set(row.cardId, [row]);
  }
  const plan: FsrsReplayPlan = {
    entries: [], considered: 0, fromLog: 0, fromSm2: 0, kept: 0, moved: 0,
    dueBefore: 0, dueAfter: 0, meanIntervalBefore: null, meanIntervalAfter: null,
  };
  let sumBefore = 0;
  let sumAfter = 0;
  let reviewCards = 0;
  const day = { dayStartHour: shared.dayStartHour, utcOffsetMinutes: shared.utcOffsetMinutes };
  for (const card of cards) {
    const srs = card.srs;
    if (card.suspended || !srs) continue;
    const config = configForCard?.(card) ?? shared;
    const weights = config.weights ?? DEFAULT_FSRS_WEIGHTS;
    plan.considered += 1;
    if (srs.dueAt <= now) plan.dueBefore += 1;
    let memory: FsrsMemory | null = null;
    let source: FsrsReplaySource = 'kept';
    const replay = replayFsrsMemory(byCard.get(card.id) ?? [], {
      ...day,
      weights,
      sm2Retention: config.sm2Retention,
      startEase: srs.ease,
    });
    if (replay) {
      memory = replay.memory;
      source = 'log';
    } else if (srs.stability !== undefined && srs.difficulty !== undefined && srs.algorithm === 'fsrs') {
      memory = { stability: srs.stability, difficulty: srs.difficulty };
    } else if (srs.intervalDays >= 1) {
      memory = fsrsMemoryFromSm2(srs.ease, srs.intervalDays, config.sm2Retention ?? 0.9, weights);
      source = 'sm2';
    }
    const inSteps = srs.phase !== undefined || srs.intervalDays < 1;
    if (!memory) {
      if (srs.dueAt <= now) plan.dueAfter += 1;
      continue;
    }
    let intervalDays = srs.intervalDays;
    let dueAt = srs.dueAt;
    if (rescheduleDue && !inSteps) {
      const raw = fsrsInterval(memory.stability, config.desiredRetention, weights);
      intervalDays = Math.min(config.maximumIntervalDays, Math.max(1, Math.round(raw)));
      dueAt = startOfStudyDayIndex(studyDayIndex(srs.lastReviewedAt, day) + intervalDays, day);
    }
    if (!inSteps) {
      reviewCards += 1;
      sumBefore += srs.intervalDays;
      sumAfter += intervalDays;
    }
    if (dueAt <= now) plan.dueAfter += 1;
    const memoryChanged = !sameMemory(srs, memory) || srs.algorithm !== 'fsrs';
    const dueChanged = dueAt !== srs.dueAt || intervalDays !== srs.intervalDays;
    if (!memoryChanged && !dueChanged) continue;
    if (source === 'log') plan.fromLog += 1;
    else if (source === 'sm2') plan.fromSm2 += 1;
    else plan.kept += 1;
    if (dueChanged) plan.moved += 1;
    plan.entries.push({
      id: card.id,
      source,
      lastReviewedAt: srs.lastReviewedAt,
      before: { stability: srs.stability, difficulty: srs.difficulty, intervalDays: srs.intervalDays, dueAt: srs.dueAt },
      after: { stability: memory.stability, difficulty: memory.difficulty, intervalDays, dueAt },
    });
  }
  if (reviewCards) {
    plan.meanIntervalBefore = sumBefore / reviewCards;
    plan.meanIntervalAfter = sumAfter / reviewCards;
  }
  return plan;
}

/**
 * One planned entry onto a card's state, or null when the card has been
 * reviewed (or reset) since the plan was made: a stale plan never overwrites a
 * newer review.
 */
export function applyFsrsReplayEntry(
  srs: LocalSrsState | undefined | null,
  entry: FsrsReplayEntry,
): LocalSrsState | null {
  if (!srs || srs.lastReviewedAt !== entry.lastReviewedAt) return null;
  return {
    ...srs,
    version: 2,
    algorithm: 'fsrs',
    stability: entry.after.stability,
    difficulty: entry.after.difficulty,
    intervalDays: entry.after.intervalDays,
    dueAt: entry.after.dueAt,
  };
}
