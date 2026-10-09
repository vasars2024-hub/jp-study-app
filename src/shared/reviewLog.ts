// Review log: one row per graded flashcard review, practice or grammar answer.
//
// The deck stores only each card's CURRENT schedule, so "how many reviews did I
// do this week, and how many did I remember" had no answer anywhere — the
// Statistics window could show reading and watching time and nothing about the
// study the app is built around. This is the pure half: the row shape, its
// validation and the summaries Statistics draws. Persistence lives in
// `renderer/reviewLog.ts`.

import type { LocalSrsRating } from './localSrs';

/**
 * `grammar` rows are answers in the grammar practice test: they count toward the
 * day's study like any practice answer, and are summarised on their own so the
 * flashcard practice line keeps meaning flashcards.
 */
export type ReviewLogMode = 'review' | 'learn' | 'test' | 'write' | 'grammar' | 'game';

/**
 * Where a `review` row came from when it was not a review surface. `game`: a
 * Game Arena answer that graded a due card (only with the opt-in setting). Such
 * a row moved the schedule, but a multiple-choice pick is not a recall test, so
 * it is kept out of FSRS training and out of true-retention figures.
 */
export type ReviewLogSource = 'game';

export interface ReviewLogEntry {
  id: string;
  /** Epoch ms of the answer. */
  at: number;
  mode: ReviewLogMode;
  cardId?: string;
  /** Grammar point id, for `grammar` rows. */
  grammarId?: string;
  word?: string;
  /** Scheduler rating, for `review` rows. */
  rating?: LocalSrsRating;
  /** Remembered / answered correctly. For reviews: anything but Again. */
  correct: boolean;
  /** Interval (days) before and after the review; absent on practice rows. */
  prevIntervalDays?: number;
  intervalDays?: number;
  /** First time the card was ever reviewed. */
  isNew?: boolean;
  /**
   * Milliseconds from the card being shown to the grade, capped like Anki's
   * answer timer (`REVIEW_ANSWER_CAP_MS`). Absent on rows written before the
   * timer existed and on surfaces that do not time answers.
   */
  durationMs?: number;
  /** Set when the row was not written by a review surface (see `ReviewLogSource`). */
  source?: ReviewLogSource;
}

/**
 * A real recall test on a review surface: what true retention and the FSRS
 * optimiser may read. Practice rows (`learn`, `test`, `game`, ...) and reviews
 * graded from a game are not.
 */
export function isRecallReview(entry: Pick<ReviewLogEntry, 'mode' | 'source'>): boolean {
  return entry.mode === 'review' && entry.source === undefined;
}

/** Longest answer a review row records: one idle minute is not one minute of study. */
export const REVIEW_ANSWER_CAP_MS = 60_000;

/** Bound on stored rows: roughly a year of heavy daily review. */
export const REVIEW_LOG_LIMIT = 50_000;

const MODES: readonly ReviewLogMode[] = ['review', 'learn', 'test', 'write', 'grammar', 'game'];
const RATINGS: readonly LocalSrsRating[] = ['again', 'hard', 'good', 'easy'];

function finite(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function normalizeReviewLogEntry(value: unknown): ReviewLogEntry | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<ReviewLogEntry>;
  const at = finite(raw.at);
  if (typeof raw.id !== 'string' || !raw.id || at === undefined) return null;
  if (!MODES.includes(raw.mode as ReviewLogMode)) return null;
  const entry: ReviewLogEntry = {
    id: raw.id,
    at,
    mode: raw.mode as ReviewLogMode,
    correct: raw.correct === true,
  };
  if (typeof raw.cardId === 'string' && raw.cardId) entry.cardId = raw.cardId;
  if (typeof raw.grammarId === 'string' && raw.grammarId) entry.grammarId = raw.grammarId.slice(0, 200);
  if (typeof raw.word === 'string' && raw.word) entry.word = raw.word.slice(0, 120);
  if (RATINGS.includes(raw.rating as LocalSrsRating)) entry.rating = raw.rating;
  const prev = finite(raw.prevIntervalDays);
  const next = finite(raw.intervalDays);
  if (prev !== undefined) entry.prevIntervalDays = prev;
  if (next !== undefined) entry.intervalDays = next;
  if (raw.isNew === true) entry.isNew = true;
  const duration = finite(raw.durationMs);
  if (duration !== undefined && duration >= 0) entry.durationMs = Math.min(REVIEW_ANSWER_CAP_MS, Math.round(duration));
  if (raw.source === 'game') entry.source = 'game';
  return entry;
}

export function normalizeReviewLog(value: unknown): ReviewLogEntry[] {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' && Array.isArray((value as { entries?: unknown }).entries)
      ? (value as { entries: unknown[] }).entries
      : [];
  const out: ReviewLogEntry[] = [];
  const seen = new Set<string>();
  for (const row of list) {
    const entry = normalizeReviewLogEntry(row);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    out.push(entry);
  }
  out.sort((a, b) => a.at - b.at);
  return out.length > REVIEW_LOG_LIMIT ? out.slice(out.length - REVIEW_LOG_LIMIT) : out;
}

export interface ReviewDaySummary {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  reviews: number;
  passed: number;
}

export interface ReviewLogSummary {
  /** `days` entries, oldest first, including empty days. */
  perDay: ReviewDaySummary[];
  /** Reviews inside the window. */
  reviews: number;
  /** Mean reviews per day across the window, one decimal. */
  dailyAverage: number;
  /**
   * Share of reviews of already-learned cards (interval of at least one day
   * before the review) that were remembered, 0..1 — or null when there were
   * none. New and relearning cards are excluded: counting a card's first
   * sighting as a "failure to retain" would make retention a measure of how
   * much new material was added.
   */
  retention: number | null;
  /** How many reviews the retention figure is based on. */
  retentionSample: number;
  practiceAnswers: number;
  practiceCorrect: number;
  /** Grammar practice answers inside the window (not in `practiceAnswers`). */
  grammarAnswers: number;
  grammarCorrect: number;
  /** Game Arena answers inside the window (in neither of the above). */
  gameAnswers: number;
  gameCorrect: number;
}

function localDayKey(ms: number): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function summarizeReviewLog(
  entries: readonly ReviewLogEntry[],
  days = 30,
  now = Date.now(),
): ReviewLogSummary {
  const span = Math.max(1, Math.floor(days));
  const perDay: ReviewDaySummary[] = [];
  const index = new Map<string, ReviewDaySummary>();
  for (let i = span - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const row = { date: localDayKey(d.getTime()), reviews: 0, passed: 0 };
    perDay.push(row);
    index.set(row.date, row);
  }
  let reviews = 0;
  let matureReviews = 0;
  let maturePassed = 0;
  let practiceAnswers = 0;
  let practiceCorrect = 0;
  let grammarAnswers = 0;
  let grammarCorrect = 0;
  let gameAnswers = 0;
  let gameCorrect = 0;
  for (const entry of entries) {
    const bucket = index.get(localDayKey(entry.at));
    if (!bucket) continue;
    if (entry.mode === 'review') {
      bucket.reviews += 1;
      if (entry.correct) bucket.passed += 1;
      reviews += 1;
      if (isRecallReview(entry) && !entry.isNew && (entry.prevIntervalDays ?? 0) >= 1) {
        matureReviews += 1;
        if (entry.correct) maturePassed += 1;
      }
    } else if (entry.mode === 'grammar') {
      grammarAnswers += 1;
      if (entry.correct) grammarCorrect += 1;
    } else if (entry.mode === 'game') {
      gameAnswers += 1;
      if (entry.correct) gameCorrect += 1;
    } else {
      practiceAnswers += 1;
      if (entry.correct) practiceCorrect += 1;
    }
  }
  return {
    perDay,
    reviews,
    dailyAverage: Math.round((reviews / span) * 10) / 10,
    retention: matureReviews ? maturePassed / matureReviews : null,
    retentionSample: matureReviews,
    practiceAnswers,
    practiceCorrect,
    grammarAnswers,
    grammarCorrect,
    gameAnswers,
    gameCorrect,
  };
}
