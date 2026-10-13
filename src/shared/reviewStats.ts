/**
 * Review statistics beyond the daily totals: what Anki's and jpdb's stats
 * pages answer, computed from the review log and the deck the app already has.
 *
 * Pure, clock-injected, and bucketed by STUDY day (`studyDay.ts`: the local
 * calendar, rolling over at the configured hour, 4 am by default, as in Anki)
 * so a chart, the Calendar, the streak and the scheduler agree about which day
 * a review belongs to. A review at 01:30 belongs to the evening before.
 *
 * Card maturity follows Anki: a review of a card whose previous interval was
 * under one day is a learning review (new cards included), 1-20 days is young,
 * 21 days or more is mature. "True retention" is the share of young/mature
 * reviews that were not Again — learning reviews are excluded, because counting
 * a first sighting as a failure would measure how much was added, not how much
 * was kept.
 */
import { fsrsRetrievability } from './fsrs';
import { isRecallReview, type ReviewLogEntry } from './reviewLog';
import { isQueueDue } from './reviewSessionQueue';
import { lastStudyDayKeys, startOfStudyDayKey, studyDayKey, studyDayKeyer } from './studyDay';

const DAY_MS = 24 * 60 * 60 * 1000;
export const REVIEW_MATURE_INTERVAL_DAYS = 21;

/** The study day of `ms` as YYYY-MM-DD (the configured day-start hour). */
export function localDateKey(ms: number): string {
  return studyDayKey(ms);
}

/**
 * `localDateKey` for a whole pass over the log. The day's bounds are kept from
 * the last call, so a run of rows on one day — and a time-ordered log is
 * nothing but such runs — costs one `Date` per day instead of one per row
 * (50,000 rows per chart, re-run on every review). Same answer for every input:
 * the bounds are that study day's own start and end, so DST days are exact.
 */
export function localDateKeyer(): (ms: number) => string {
  return studyDayKeyer();
}

/** Start of the study day `YYYY-MM-DD`: no row before it can fall on or after that day. */
export function startOfLocalDateKey(dateKey: string): number {
  return startOfStudyDayKey(dateKey);
}

/** `count` study days ending today, oldest first. */
export function lastLocalDays(count: number, now: number): string[] {
  return lastStudyDayKeys(count, now);
}

export type ReviewMaturity = 'learning' | 'young' | 'mature';

export function reviewMaturity(entry: Pick<ReviewLogEntry, 'isNew' | 'prevIntervalDays'>): ReviewMaturity {
  const prev = entry.prevIntervalDays ?? 0;
  if (entry.isNew || prev < 1) return 'learning';
  return prev >= REVIEW_MATURE_INTERVAL_DAYS ? 'mature' : 'young';
}

function isReview(entry: ReviewLogEntry): boolean {
  return entry.mode === 'review';
}

export interface DailyReviewStat {
  date: string;
  learning: number;
  young: number;
  mature: number;
  /**
   * Not Again, among that day's recall tests (`graded`). A review graded from
   * a game is counted in the maturity columns but never in a pass rate.
   */
  passed: number;
  /** Reviews that day that were recall tests: the denominator of `passed`. */
  graded: number;
  /** Seconds spent answering, from timed reviews only. */
  seconds: number;
  /** Reviews that day that carried a time. */
  timed: number;
}

/** Reviews per day split by maturity, with answer time, over the last `days` days. */
export function dailyReviewStats(
  entries: readonly ReviewLogEntry[],
  days: number,
  now: number,
): DailyReviewStat[] {
  const rows = lastLocalDays(days, now).map((date) => ({
    date, learning: 0, young: 0, mature: 0, passed: 0, graded: 0, seconds: 0, timed: 0,
  }));
  const index = new Map(rows.map((row) => [row.date, row]));
  // Rows before the window are skipped on a number compare, not a date format.
  const start = startOfLocalDateKey(rows[0].date);
  const dayOf = localDateKeyer();
  for (const entry of entries) {
    if (!isReview(entry) || entry.at < start) continue;
    const row = index.get(dayOf(entry.at));
    if (!row) continue;
    row[reviewMaturity(entry)] += 1;
    if (isRecallReview(entry)) {
      row.graded += 1;
      if (entry.correct) row.passed += 1;
    }
    if (typeof entry.durationMs === 'number') {
      row.seconds += entry.durationMs / 1000;
      row.timed += 1;
    }
  }
  return rows;
}

export interface RetentionCell {
  passed: number;
  total: number;
}

export function retentionRate(cell: RetentionCell): number | null {
  return cell.total > 0 ? cell.passed / cell.total : null;
}

export interface WeeklyRetention {
  /** Local date of the week's first day (the week ends on `now`'s day). */
  weekStart: string;
  young: RetentionCell;
  mature: RetentionCell;
}

/** True retention per 7-day block, oldest first, the last block ending today. */
export function weeklyRetention(
  entries: readonly ReviewLogEntry[],
  weeks: number,
  now: number,
): WeeklyRetention[] {
  const count = Math.max(1, Math.floor(weeks));
  const dates = lastLocalDays(count * 7, now);
  const blocks: WeeklyRetention[] = [];
  const dateToBlock = new Map<string, WeeklyRetention>();
  for (let w = 0; w < count; w += 1) {
    const block: WeeklyRetention = {
      weekStart: dates[w * 7],
      young: { passed: 0, total: 0 },
      mature: { passed: 0, total: 0 },
    };
    blocks.push(block);
    for (let d = 0; d < 7; d += 1) dateToBlock.set(dates[w * 7 + d], block);
  }
  const start = startOfLocalDateKey(dates[0]);
  const dayOf = localDateKeyer();
  for (const entry of entries) {
    // Retention is about recall tests: a game-graded review is not one.
    if (!isRecallReview(entry) || entry.at < start) continue;
    const maturity = reviewMaturity(entry);
    if (maturity === 'learning') continue;
    const block = dateToBlock.get(dayOf(entry.at));
    if (!block) continue;
    block[maturity].total += 1;
    if (entry.correct) block[maturity].passed += 1;
  }
  return blocks;
}

/** Interval buckets for retention-by-interval, in days of the interval BEFORE the review. */
export const INTERVAL_BUCKETS: ReadonlyArray<{ min: number; max: number }> = [
  { min: 1, max: 1 },
  { min: 2, max: 3 },
  { min: 4, max: 7 },
  { min: 8, max: 14 },
  { min: 15, max: 30 },
  { min: 31, max: 90 },
  { min: 91, max: 180 },
  { min: 181, max: Number.POSITIVE_INFINITY },
];

export interface IntervalRetention extends RetentionCell {
  min: number;
  max: number;
}

/**
 * True retention by the length of the interval the card had just waited —
 * whether long gaps are being survived, which a single retention figure hides.
 */
export function retentionByInterval(
  entries: readonly ReviewLogEntry[],
  since = 0,
): IntervalRetention[] {
  const rows: IntervalRetention[] = INTERVAL_BUCKETS.map((b) => ({ ...b, passed: 0, total: 0 }));
  for (const entry of entries) {
    if (!isRecallReview(entry) || entry.at < since || entry.isNew) continue;
    // A sub-day "interval" (a step, or SM-2's half-day Hard) is learning, not a
    // gap the card survived.
    if ((entry.prevIntervalDays ?? 0) < 1) continue;
    const prev = Math.round(entry.prevIntervalDays ?? 0);
    const row = rows.find((r) => prev >= r.min && prev <= r.max);
    if (!row) continue;
    row.total += 1;
    if (entry.correct) row.passed += 1;
  }
  return rows;
}

export interface HourlyStat {
  hour: number;
  reviews: number;
  passed: number;
}

/**
 * Reviews by local hour of day — when the user studies, and how well. Recall
 * tests only: `passed / reviews` is a pass rate, and a game-graded review is
 * not one.
 */
export function hourlyBreakdown(entries: readonly ReviewLogEntry[], since = 0): HourlyStat[] {
  const rows = Array.from({ length: 24 }, (_, hour) => ({ hour, reviews: 0, passed: 0 }));
  for (const entry of entries) {
    if (!isRecallReview(entry) || entry.at < since) continue;
    const row = rows[new Date(entry.at).getHours()];
    row.reviews += 1;
    if (entry.correct) row.passed += 1;
  }
  return rows;
}

export interface AnswerTimeSummary {
  timed: number;
  totalSeconds: number;
  /** Mean seconds per timed review, or null when nothing was timed. */
  averageSeconds: number | null;
}

export function answerTimeSummary(entries: readonly ReviewLogEntry[], since = 0): AnswerTimeSummary {
  let timed = 0;
  let total = 0;
  for (const entry of entries) {
    if (!isReview(entry) || entry.at < since || typeof entry.durationMs !== 'number') continue;
    timed += 1;
    total += entry.durationMs / 1000;
  }
  return { timed, totalSeconds: total, averageSeconds: timed ? total / timed : null };
}

/** One local day's minutes by activity. */
export interface ActivityMinutes {
  date: string;
  reading: number;
  watching: number;
  listening: number;
  study: number;
  reviews: number;
}

export interface StudyDaySeconds {
  seconds?: number;
  watchSeconds?: number;
  listenSeconds?: number;
  studySeconds?: number;
}

/**
 * Minutes per activity per day: reading, watching, listening and other study
 * from the daily stats, and review time from the timed review rows.
 */
export function activityMinutesByDay(
  days: Readonly<Record<string, StudyDaySeconds>>,
  reviewDays: readonly DailyReviewStat[],
  count: number,
  now: number,
): ActivityMinutes[] {
  const reviewSeconds = new Map(reviewDays.map((d) => [d.date, d.seconds]));
  const minutes = (s: number | undefined): number => (Number.isFinite(s) && (s ?? 0) > 0 ? (s ?? 0) / 60 : 0);
  return lastLocalDays(count, now).map((date) => {
    const day = days[date] ?? {};
    return {
      date,
      reading: minutes(day.seconds),
      watching: minutes(day.watchSeconds),
      listening: minutes(day.listenSeconds),
      study: minutes(day.studySeconds),
      reviews: minutes(reviewSeconds.get(date)),
    };
  });
}

export interface DeckStatCard {
  id: string;
  deckKey: string;
  suspended?: boolean;
  srs?: { dueAt: number; intervalDays: number; lapses: number; phase?: string } | null;
}

export interface DeckStat {
  deckKey: string;
  cards: number;
  newCards: number;
  learning: number;
  young: number;
  mature: number;
  suspended: number;
  dueNow: number;
  reviews: number;
  retention: RetentionCell;
}

export interface DeckStatOptions {
  /**
   * Each deck's Due as the review queue would present it (the renderer passes
   * `reviewSessionCounts`: new-card limit, Anki-owned cards, suspended cards
   * and learn-ahead all applied). When absent, Due is computed here with the
   * queue's due rule and `newAllowance` new cards per deck.
   */
  dueByDeck?: ReadonlyMap<string, number>;
  /** New cards a deck may count as due when `dueByDeck` is absent (default: all). */
  newAllowance?: number;
  /** The learn-ahead limit for cards in their steps (default 20 minutes). */
  learnAheadMinutes?: number;
}

/**
 * Per-deck counts and the last window's reviews and true retention, joining
 * the log to the deck by card id. Sorted by reviews, then size.
 *
 * Due follows the queue (bug 39: it counted every new card, 3,001 shown
 * against 21 in the queue).
 */
export function deckStats(
  cards: readonly DeckStatCard[],
  entries: readonly ReviewLogEntry[],
  since: number,
  now: number,
  options: DeckStatOptions = {},
): DeckStat[] {
  const allowance = options.newAllowance === undefined || !Number.isFinite(options.newAllowance)
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(options.newAllowance));
  const newTaken = new Map<string, number>();
  const byDeck = new Map<string, DeckStat>();
  const deckOf = new Map<string, string>();
  for (const card of cards) {
    deckOf.set(card.id, card.deckKey);
    let row = byDeck.get(card.deckKey);
    if (!row) {
      row = {
        deckKey: card.deckKey, cards: 0, newCards: 0, learning: 0, young: 0, mature: 0,
        suspended: 0, dueNow: 0, reviews: 0, retention: { passed: 0, total: 0 },
      };
      byDeck.set(card.deckKey, row);
    }
    row.cards += 1;
    if (card.suspended) {
      row.suspended += 1;
      continue;
    }
    const srs = card.srs;
    if (!srs) {
      row.newCards += 1;
      const taken = newTaken.get(card.deckKey) ?? 0;
      if (taken < allowance) {
        newTaken.set(card.deckKey, taken + 1);
        row.dueNow += 1;
      }
      continue;
    }
    if (srs.phase || srs.intervalDays < 1) row.learning += 1;
    else if (srs.intervalDays >= REVIEW_MATURE_INTERVAL_DAYS) row.mature += 1;
    else row.young += 1;
    if (isQueueDue(srs, now, options.learnAheadMinutes)) row.dueNow += 1;
  }
  if (options.dueByDeck) {
    for (const row of byDeck.values()) row.dueNow = options.dueByDeck.get(row.deckKey) ?? 0;
  }
  for (const entry of entries) {
    if (!isReview(entry) || entry.at < since || !entry.cardId) continue;
    const key = deckOf.get(entry.cardId);
    const row = key === undefined ? undefined : byDeck.get(key);
    if (!row) continue;
    row.reviews += 1;
    if (!isRecallReview(entry) || reviewMaturity(entry) === 'learning') continue;
    row.retention.total += 1;
    if (entry.correct) row.retention.passed += 1;
  }
  return [...byDeck.values()].sort((a, b) => b.reviews - a.reviews || b.cards - a.cards);
}

export interface RecallEstimate {
  /** FSRS cards counted (scheduled, not suspended, with a memory state). */
  cards: number;
  /** Mean predicted recall probability right now. */
  average: number | null;
  /** Sum of recall probabilities: how many of these cards you would likely recall now. */
  expectedKnown: number;
  /** Cards per recall band, lowest first: <70, 70-80, 80-90, 90-95, >=95 (%). */
  bands: number[];
}

export const RECALL_BANDS: readonly number[] = [0.7, 0.8, 0.9, 0.95];

/**
 * FSRS's own view of the deck now: each card's predicted recall from its
 * stability and the time since its last review (Anki's "retrievability").
 */
export function recallEstimate(
  cards: ReadonlyArray<{ suspended?: boolean; srs?: { stability?: number; lastReviewedAt: number } | null }>,
  now: number,
): RecallEstimate {
  const bands = new Array<number>(RECALL_BANDS.length + 1).fill(0);
  let count = 0;
  let sum = 0;
  for (const card of cards) {
    const s = card.srs?.stability;
    if (card.suspended || typeof s !== 'number' || !card.srs) continue;
    const r = fsrsRetrievability(s, Math.max(0, (now - card.srs.lastReviewedAt) / DAY_MS));
    count += 1;
    sum += r;
    let band = RECALL_BANDS.findIndex((edge) => r < edge);
    if (band < 0) band = RECALL_BANDS.length;
    bands[band] += 1;
  }
  return { cards: count, average: count ? sum / count : null, expectedKnown: sum, bands };
}
