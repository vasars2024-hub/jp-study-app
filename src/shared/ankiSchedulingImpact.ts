// Scheduling impact — ANKI_DECK_WORKBENCH_PLAN.md Phase 7, smart recipe 26:
// "compare current scheduling with a proposed deck preset or FSRS
// desired-retention change and estimate workload impact".
//
// The recipe's verb is *estimate*, so like recipes 8, 15 and 16 this is a
// report and not a tray action. Nothing here writes; there is no journal op and
// no action kind, because the deck-options preset is not part of the draft at
// all (see `provenance` below) and inventing one would be a change the user
// could not undo from the workbench.
//
// Three separate honesty problems, each of which has already produced a wrong
// number somewhere in this repo if answered casually:
//
//   1. **The draft carries no deck preset.** `RawAnkiCardRow` has no `data` and
//      there is no `dconf`/`deck_config` reader anywhere in `ankiDraft.ts`, so
//      neither the current per-day limits nor the current desired retention can
//      be *read*. They are therefore `stated` by the caller, and every result
//      says which of its inputs was read and which was stated. Defaulting to
//      Anki's stock 20/200 silently would make an unstated guess look measured.
//
//   2. **Per-card FSRS stability is unavailable, and it does not matter.** The
//      workload effect of a desired-retention change is a pure interval
//      *multiplier* in which stability cancels — see `retentionIntervalRatio`.
//      So the estimate needs no `cards.data`, and the one thing it cannot do
//      (say what any individual card's new interval is in days) it does not
//      claim to do.
//
//   3. **A retention or preset change moves no already-scheduled card.** Anki
//      applies the new schedule at each card's *next* answer, so the next-N-days
//      forecast built from `card.due` is identical before and after. Reporting a
//      changed horizon forecast would be the most natural lie this recipe could
//      tell, so the horizon is produced once and marked
//      `horizonUnchangedByProposal`, and the comparison lives entirely in the
//      steady-state load.
//
// Steady state is `Σ 1/interval` over the scheduled cards: a card with a 10-day
// interval contributes a tenth of a review per day. That is the only workload
// number here that both axes can move, and it is exact arithmetic on data the
// draft really holds rather than a simulation with unstated assumptions.

import type { AnkiCardQueue, AnkiDraft, AnkiDraftCard } from './ankiDraft';
import { todayDueDay } from './ankiStaleCards';

/**
 * FSRS forgetting curve `R(t) = (1 + FACTOR·t/S)^DECAY`, the FSRS-4.5/5 form.
 *
 * `DECAY` is a constant here and not the user's own value on purpose: FSRS-6
 * learns a per-user decay, it lives in `col.conf`, and the draft reads neither
 * `col.conf` nor `cards.data`. A result therefore states `decay` so a surface
 * can say which curve produced the number instead of implying it is the user's.
 */
export const FSRS_DECAY = -0.5;
export const FSRS_FACTOR = 19 / 81;

/** Anki refuses desired retention outside this band, and so does this module. */
export const MIN_DESIRED_RETENTION = 0.7;
export const MAX_DESIRED_RETENTION = 0.99;

/** Longest horizon a forecast will build. A year of day buckets is already 366 rows. */
export const MAX_FORECAST_DAYS = 365;
export const DEFAULT_FORECAST_DAYS = 30;

/** Queues Anki will not hand a card out from; they contribute no workload at all. */
const WITHHELD_QUEUES: ReadonlySet<AnkiCardQueue> = new Set<AnkiCardQueue>([
  'suspended',
  'buried-sibling',
  'buried-user',
]);

/**
 * Interval at desired retention `r`, in units of stability, from the curve above.
 *
 * `R^(1/DECAY) = 1 + FACTOR·t/S`, so `t/S = (r^(1/DECAY) − 1)/FACTOR`. At
 * `r = 0.9` this is exactly 1, which is the definition of stability and is the
 * assertion that keeps the constants honest.
 */
export function retentionIntervalFactor(r: number): number {
  return (r ** (1 / FSRS_DECAY) - 1) / FSRS_FACTOR;
}

/**
 * How much longer every interval becomes when desired retention moves `from → to`.
 *
 * **Stability cancels.** `t(r) = (S/FACTOR)·(r^(1/DECAY) − 1)` is linear in `S`,
 * so the ratio of two intervals for the same card is a function of the two
 * retentions alone. That is the whole reason this recipe can be answered from a
 * draft that carries no per-card FSRS memory state.
 *
 * Lowering retention lengthens intervals, so `to < from` returns a ratio above 1
 * and the workload falls; `0.90 → 0.85` is ≈1.637 and `0.90 → 0.95` is ≈0.461.
 */
export function retentionIntervalRatio(from: number, to: number): number {
  return retentionIntervalFactor(to) / retentionIntervalFactor(from);
}

export type SchedulingProposal =
  /** An FSRS desired-retention change. Both ends are stated; neither is readable. */
  | { kind: 'retention'; from: number; to: number }
  /**
   * A classic SM-2 preset's interval modifier (`ivlFct`), which multiplies every
   * interval Anki writes. Its workload effect is the same shape as retention's,
   * which is why the two share one code path and differ only in how the
   * multiplier is derived.
   */
  | { kind: 'interval-modifier'; from: number; to: number };

export type SchedulingImpactRefusal =
  /**
   * The draft holds no card with a positive interval, so `Σ 1/interval` has no
   * terms and every comparison would be `0 → 0`. The user's own mined deck is
   * exactly this (recipe 10 measured 0 cards with any SRS state on it), so this
   * is the common case and not an edge: a freshly imported or never-studied
   * deck has no workload to change.
   */
  | 'no-scheduled-cards'
  /** A retention end outside `[MIN_DESIRED_RETENTION, MAX_DESIRED_RETENTION]`, or not finite. */
  | 'retention-out-of-range'
  /** An interval modifier at or below zero, or not finite. */
  | 'modifier-out-of-range'
  /**
   * `col.crt` is absent, so a review card's `due` day counts from an unknown
   * origin and the horizon forecast would be shifted by an unknown number of
   * days. Recipe 18 refuses the same input for the same reason.
   */
  | 'no-collection-origin';

/** One day of the horizon forecast. `day` is a `due` day number, not a date. */
export interface ForecastDay {
  day: number;
  /** Days from today; 0 is today. */
  offset: number;
  cards: number;
}

export interface SchedulingLoad {
  /**
   * Reviews per day at steady state: `Σ 1/interval` over scheduled cards.
   * Not rounded — a 3,000-card deck's load moves in fractions of a review.
   */
  reviewsPerDay: number;
  /** Mean interval in days, `scheduledCards / reviewsPerDay`'s reciprocal-weighted counterpart. */
  meanIntervalDays: number;
}

export interface SchedulingImpactInput {
  draft: AnkiDraft;
  proposal: SchedulingProposal;
  /** Wall clock, passed in rather than read, so a projection is reproducible in a test. */
  nowMs: number;
  /** Horizon length; clamped to `[1, MAX_FORECAST_DAYS]`. */
  forecastDays?: number;
}

export interface SchedulingImpactResult {
  ok: true;
  /**
   * Multiplier applied to every scheduled interval. Above 1 means longer
   * intervals and therefore *less* work.
   */
  intervalRatio: number;
  current: SchedulingLoad;
  proposed: SchedulingLoad;
  /**
   * `proposed.reviewsPerDay − current.reviewsPerDay`. Negative is less work.
   * Reported alongside the ratio because a 12 % cut means different things on a
   * 4-review deck and a 400-review one.
   */
  reviewsPerDayDelta: number;
  /** Cards that contributed a term: review/relearning, not withheld, interval > 0. */
  scheduledCards: number;
  /** Cards excluded, by reason, so the tally sums to the draft's card count. */
  excluded: {
    /** New or learning: no interval to scale. */
    unscheduled: number;
    /** Suspended or buried: Anki will never show them, so they are not workload. */
    withheld: number;
    /** On loan to a filtered deck; their real scheduling lives in `originalDue`. */
    filtered: number;
    /** `interval <= 0`, including Anki's legacy negative-seconds encoding. */
    noInterval: number;
  };
  /**
   * The next-N-days forecast, built once. **A proposal does not change it** —
   * Anki reschedules a card when it is next answered, not when the preset is
   * saved — so there is deliberately no `proposedForecast` to compare it with.
   */
  horizon: ForecastDay[];
  /** Review cards whose due day already passed. They are not in `horizon`. */
  backlogCards: number;
  horizonUnchangedByProposal: true;
  /** Which inputs were read from the draft and which the caller stated. */
  provenance: {
    intervals: 'read';
    /** No `dconf` reader exists, so both ends of every proposal are the caller's. */
    proposal: 'stated';
    /** Constant, not the user's FSRS-6 learned decay. Absent for a modifier proposal. */
    decay?: number;
  };
  todayDay: number;
  forecastDays: number;
}

export type SchedulingImpactOutcome =
  | { ok: false; refusal: SchedulingImpactRefusal }
  | SchedulingImpactResult;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function resolveRatio(proposal: SchedulingProposal): number | SchedulingImpactRefusal {
  if (proposal.kind === 'retention') {
    for (const end of [proposal.from, proposal.to]) {
      if (!isFiniteNumber(end) || end < MIN_DESIRED_RETENTION || end > MAX_DESIRED_RETENTION) {
        return 'retention-out-of-range';
      }
    }
    return retentionIntervalRatio(proposal.from, proposal.to);
  }
  for (const end of [proposal.from, proposal.to]) {
    if (!isFiniteNumber(end) || end <= 0) return 'modifier-out-of-range';
  }
  return proposal.to / proposal.from;
}

/** Cards Anki counts as scheduled review work. Learning cards have no stable interval yet. */
function isScheduledType(card: AnkiDraftCard): boolean {
  return card.type === 'review' || card.type === 'relearning';
}

/**
 * Compares the draft's current review workload with the workload the proposal
 * would settle at, and forecasts the next `forecastDays` days from real due days.
 */
export function projectSchedulingImpact(input: SchedulingImpactInput): SchedulingImpactOutcome {
  const { draft, proposal, nowMs } = input;

  const ratio = resolveRatio(proposal);
  if (typeof ratio !== 'number') return { ok: false, refusal: ratio };

  // `<= 0`, not just absent. `apkgImport.ts:465` passes `raw.col.crt` straight
  // through, and a real package on this machine — `Ginga Eiyuu Densetsu.apkg` —
  // reports `crt: 0`. Zero is finite, so an `isFinite` guard alone admits a
  // 1970 origin and dates every due day about 20,700 days early: the whole deck
  // lands in `backlogCards` and the horizon renders 30 empty rows, which reads
  // as a measurement rather than as the missing field it is.
  const createdAtSec = draft.source.createdAtSec;
  if (!isFiniteNumber(createdAtSec) || createdAtSec <= 0) {
    return { ok: false, refusal: 'no-collection-origin' };
  }
  const todayDay = todayDueDay(createdAtSec, nowMs);

  const forecastDays = Math.min(
    MAX_FORECAST_DAYS,
    Math.max(1, Math.floor(isFiniteNumber(input.forecastDays) ? input.forecastDays : DEFAULT_FORECAST_DAYS)),
  );

  const excluded = { unscheduled: 0, withheld: 0, filtered: 0, noInterval: 0 };
  const dayCounts = new Map<number, number>();
  let backlogCards = 0;
  let currentLoad = 0;
  let intervalTotal = 0;
  let scheduledCards = 0;

  for (const card of draft.cards) {
    if (card.originalDeckId !== undefined) {
      excluded.filtered += 1;
      continue;
    }
    if (WITHHELD_QUEUES.has(card.queue)) {
      excluded.withheld += 1;
      continue;
    }
    if (!isScheduledType(card)) {
      excluded.unscheduled += 1;
      continue;
    }
    if (!isFiniteNumber(card.interval) || card.interval <= 0) {
      excluded.noInterval += 1;
      continue;
    }

    scheduledCards += 1;
    currentLoad += 1 / card.interval;
    intervalTotal += card.interval;

    if (!isFiniteNumber(card.due)) continue;
    const offset = card.due - todayDay;
    if (offset < 0) {
      backlogCards += 1;
    } else if (offset < forecastDays) {
      dayCounts.set(card.due, (dayCounts.get(card.due) ?? 0) + 1);
    }
  }

  if (scheduledCards === 0) return { ok: false, refusal: 'no-scheduled-cards' };

  const horizon: ForecastDay[] = [];
  for (let offset = 0; offset < forecastDays; offset += 1) {
    const day = todayDay + offset;
    horizon.push({ day, offset, cards: dayCounts.get(day) ?? 0 });
  }

  const proposedLoad = currentLoad / ratio;
  return {
    ok: true,
    intervalRatio: ratio,
    current: { reviewsPerDay: currentLoad, meanIntervalDays: intervalTotal / scheduledCards },
    proposed: {
      reviewsPerDay: proposedLoad,
      meanIntervalDays: (intervalTotal * ratio) / scheduledCards,
    },
    reviewsPerDayDelta: proposedLoad - currentLoad,
    scheduledCards,
    excluded,
    horizon,
    backlogCards,
    horizonUnchangedByProposal: true,
    provenance: {
      intervals: 'read',
      proposal: 'stated',
      ...(proposal.kind === 'retention' ? { decay: FSRS_DECAY } : {}),
    },
    todayDay,
    forecastDays,
  };
}
