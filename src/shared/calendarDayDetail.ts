/**
 * What one calendar day holds, folded from the stores that already record it.
 *
 * The Calendar's month grid could say "12 min · 30 rev" on a day and nothing else: not which
 * cards, not which book, not which scene, and no way back to any of them. Every fact needed
 * for that already exists — the per-day stats entry (`renderer/stats.ts`, which now also
 * keeps a per-book and per-show tally for the day), the review log (one row per answer), the
 * deck (when each card was added, when it is due), the mining history (each mined line with
 * its file and cue) and the Arena's recent results. This module is the one place that folds
 * them into a day, so the day panel, its export and its tests read the same figures.
 *
 * Pure: plain data in, plain data out. Day keys are STUDY days (`YYYY-MM-DD`, `studyDay.ts`),
 * the key the stats store writes: a review, a game or a mined card at 01:30 is the evening
 * before, so the day panel lists it on the same day the grid counts it.
 */
import type { ReviewLogEntry } from './reviewLog';
import {
  addLocalDays,
  daysFromToday,
  calendarStudyDay,
  heatmapLevel,
  localDayKey,
  studyActivityScore,
  studyDayFigures,
  studyTodayKey,
  type HeatmapLevel,
  type StudyDayRaw,
} from './studyActivityHeatmap';
import { shiftStudyDayKey, studyDayIndexOfKey, studyDayKey } from './studyDay';

/** A day's stats entry as `renderer/stats.ts` hands it over (every field optional on disk). */
export interface StudyDayActivity extends StudyDayRaw {
  chars?: number;
  reviewsPassed?: number;
  practice?: number;
  practiceCorrect?: number;
  linesStudied?: number;
  /** Per-book reading that day. Absent on days recorded before the tally existed. */
  books?: Readonly<Record<string, { title?: string; seconds?: number; chars?: number }>>;
  /** Per-show watching that day, keyed by the player's resume key. */
  shows?: Readonly<Record<string, { title?: string; seconds?: number }>>;
}

/** The deck fields this module reads. */
export interface DayDeckCard {
  id: string;
  addedAt: number;
  srs?: { dueAt?: number; lastReviewedAt?: number } | null;
}

/** One finished Arena session. */
export interface DayGameResult {
  id: string;
  gameId: string;
  score: number;
  accuracy: number;
  mistakes: number;
  createdAt: number;
}

/** One mined line that can be replayed. Mirrors `renderer/sceneRoundTrip.ts`'s `SceneTarget`. */
export interface DayScene {
  key: string;
  localFilePath: string;
  cueStartSec: number;
  sentence: string;
  title: string;
  at: number;
  cardId?: string;
}

export type CalendarDayKind = 'past' | 'today' | 'future';

export interface CalendarDayBook {
  id: string;
  title: string;
  minutes: number;
  chars: number;
}

export interface CalendarDayShow {
  id: string;
  title: string;
  minutes: number;
}

export interface CalendarDayDetail {
  dateKey: string;
  kind: CalendarDayKind;
  /** The study day whose figures the cell shows (`calendarCell`); null for none. */
  studyKey: string | null;
  /** Graded flashcard reviews. `accuracy` is passed / total, or null with none. */
  reviews: { count: number; passed: number; accuracy: number | null; newCards: number };
  /** Learn / Test / Write / grammar answers (not reviews, not games). */
  practice: { count: number; correct: number };
  /** Arena answers that day, and the sessions finished that day (newest first). */
  games: { answers: number; correct: number; sessions: DayGameResult[] };
  /** Whole minutes per activity. `total` is their sum, the grid's "min" figure. */
  minutes: { reading: number; watching: number; listening: number; study: number; total: number };
  chars: number;
  books: CalendarDayBook[];
  shows: CalendarDayShow[];
  /** Cards mined from video (the stats count) and the replayable scenes mined that day. */
  mined: { count: number; scenes: DayScene[] };
  /** Subtitle lines actively studied in the player. */
  linesStudied: number;
  /** Cards added to the deck that day, any source. */
  addedCards: number;
  /** Reviews due that day (today includes the overdue), from the deck's schedule. */
  due: number;
  /** The day is part of the current streak, the rest day bridging it, or neither. */
  streak: 'streak' | 'rest' | null;
  /** Nothing was studied and nothing is due. */
  empty: boolean;
}

export interface CalendarDayDetailInput {
  /** The CALENDAR date of the cell (`calendarCell` says which study day it shows). */
  dateKey: string;
  now: Date;
  /** The stats entry of the cell's study day (`calendarCell(dateKey, now).studyKey`). */
  day?: StudyDayActivity | null;
  /** Review-log rows; only the ones on `dateKey` are read. */
  reviewLog?: readonly ReviewLogEntry[];
  deck?: readonly DayDeckCard[];
  games?: readonly DayGameResult[];
  scenes?: readonly DayScene[];
  /** Reviews due per day (`dueByDate`). */
  dueByDay?: Readonly<Record<string, number>>;
  streakDates?: ReadonlySet<string>;
  restDates?: ReadonlySet<string>;
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function minutes(seconds: unknown): number {
  return Math.round(count(seconds) / 60);
}

function onDay(at: number, dateKey: string): boolean {
  return Number.isFinite(at) && studyDayKey(at) === dateKey;
}

/** The kind of a STUDY day key relative to the study day `now` is on. */
export function calendarDayKind(dateKey: string, now: Date): CalendarDayKind {
  const offset = daysFromToday(dateKey, now);
  return offset < 0 ? 'past' : offset === 0 ? 'today' : 'future';
}

/** What a Calendar cell (a CALENDAR date) is, and which study day's figures it shows. */
export interface CalendarCell {
  kind: CalendarDayKind;
  /** The study day filed under this cell, or null when the cell shows events only. */
  studyKey: string | null;
}

/**
 * The one rule mapping Calendar cells (calendar dates) onto study days (`studyDay.ts`).
 *
 * Events belong to their calendar date, and the learner's "today" is the calendar date: the
 * grid highlights it, opens on it, and the Today button goes there. Study figures are filed
 * by STUDY day, which starts at the day-start hour (4 am by default). From midnight to that
 * hour the two differ — at 00:30 on Oct 14 the study day is still Oct 13 — so:
 *
 * - the calendar date's cell (Oct 14) is 'today' and shows the CURRENT study day (Oct 13's
 *   key): reviews and minutes done tonight, what is due by its end, the Review button;
 * - the cell before it (Oct 13), whose study day that is, is 'past' and shows events only,
 *   so the same figures are never shown twice under two kinds;
 * - the study day that starts at the day-start hour (Oct 14's key) has no cell until then:
 *   its cards become "due today" at 4 am, exactly when the Review queue offers them.
 *
 * Outside that window (and always with a midnight day start) every cell shows its own key.
 */
export function calendarCell(dateKey: string, now: Date): CalendarCell {
  const calendarToday = localDayKey(now);
  const studyToday = studyTodayKey(now);
  const offset = studyDayIndexOfKey(dateKey) - studyDayIndexOfKey(calendarToday);
  if (offset === 0) return { kind: 'today', studyKey: studyToday };
  if (offset > 0) return { kind: 'future', studyKey: dateKey };
  return { kind: 'past', studyKey: dateKey === studyToday ? null : dateKey };
}

/**
 * A study-day-keyed record (stats days, game answers, media activity) re-filed by Calendar
 * cell per `calendarCell`: between midnight and the day-start hour the current study day's
 * entry moves to the calendar date and leaves the cell before it. Otherwise the same object.
 */
export function byCalendarCell<T>(byStudyDay: Readonly<Record<string, T>>, now: Date): Record<string, T> {
  const calendarToday = localDayKey(now);
  const studyToday = studyTodayKey(now);
  if (calendarToday === studyToday) return byStudyDay as Record<string, T>;
  const out: Record<string, T> = { ...byStudyDay };
  delete out[studyToday];
  delete out[calendarToday];
  if (byStudyDay[studyToday] !== undefined) out[calendarToday] = byStudyDay[studyToday];
  return out;
}

/**
 * Streak dates for the grid's markers: a streak that includes the current study day also
 * marks the calendar date (both cells read as studied; a gap would read as a broken streak).
 */
export function streakDatesByCalendarCell(dates: ReadonlySet<string>, now: Date): ReadonlySet<string> {
  const calendarToday = localDayKey(now);
  const studyToday = studyTodayKey(now);
  if (calendarToday === studyToday || !dates.has(studyToday)) return dates;
  return new Set([...dates, calendarToday]);
}

/** `calendarStudyDay` for a Calendar cell: the month grid's "12 min · 30 rev · 5 due" line. */
export function calendarCellStudyDay(
  dateKey: string,
  days: Readonly<Record<string, StudyDayRaw | undefined>>,
  due: Readonly<Record<string, number>>,
  now: Date,
): { minutes: number; reviews: number; due: number } | null {
  const { studyKey } = calendarCell(dateKey, now);
  return studyKey ? calendarStudyDay(studyKey, days[studyKey], due, now) : null;
}

export function buildCalendarDayDetail(input: CalendarDayDetailInput): CalendarDayDetail {
  const { dateKey: cellKey, now } = input;
  const { kind, studyKey } = calendarCell(cellKey, now);
  // Every study fact below is read under the cell's study day (see `calendarCell`).
  const dateKey = studyKey ?? cellKey;
  // The future has no history; a past day has nothing due that today's schedule can know;
  // a cell whose study day is shown on today's cell has neither.
  const history = kind !== 'future' && studyKey !== null;
  const day = history ? input.day ?? null : null;

  // Reviews: the log knows new cards and exact accuracy; the stats entry is the fallback for
  // days before the log existed, and the authority on the count otherwise shown in the grid.
  let logReviews = 0;
  let logPassed = 0;
  let newCards = 0;
  let practiceCount = 0;
  let practiceCorrect = 0;
  let gameAnswers = 0;
  let gameCorrect = 0;
  if (history) {
    for (const row of input.reviewLog ?? []) {
      if (!onDay(row.at, dateKey)) continue;
      if (row.mode === 'review') {
        logReviews += 1;
        if (row.correct) logPassed += 1;
        if (row.isNew) newCards += 1;
      } else if (row.mode === 'game') {
        gameAnswers += 1;
        if (row.correct) gameCorrect += 1;
      } else {
        practiceCount += 1;
        if (row.correct) practiceCorrect += 1;
      }
    }
  }
  const statReviews = Math.round(count(day?.reviews));
  const statPassed = Math.round(count(day?.reviewsPassed));
  const useLog = logReviews > 0;
  const reviewCount = useLog ? logReviews : statReviews;
  const reviewPassed = useLog ? logPassed : Math.min(statPassed, statReviews);
  if (!practiceCount && !gameAnswers && day) {
    // No log rows for the day: the stats entry's practice tally includes game answers.
    practiceCount = Math.round(count(day.practice));
    practiceCorrect = Math.min(practiceCount, Math.round(count(day.practiceCorrect)));
  }

  const figures = studyDayFigures(dateKey, day ?? undefined);
  const reading = minutes(day?.seconds);
  const watching = minutes(day?.watchSeconds);
  const listening = minutes(day?.listenSeconds);
  const study = minutes(day?.studySeconds);

  const books: CalendarDayBook[] = Object.entries(day?.books ?? {})
    .map(([id, book]) => ({
      id,
      title: (book?.title ?? '').trim() || id,
      minutes: minutes(book?.seconds),
      chars: Math.round(count(book?.chars)),
    }))
    .filter((book) => book.minutes > 0 || book.chars > 0)
    .sort((a, b) => b.chars - a.chars || b.minutes - a.minutes);
  const shows: CalendarDayShow[] = Object.entries(day?.shows ?? {})
    .map(([id, show]) => ({ id, title: (show?.title ?? '').trim() || id, minutes: minutes(show?.seconds) }))
    .filter((show) => show.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);

  const scenes = history
    ? (input.scenes ?? []).filter((scene) => onDay(scene.at, dateKey)).sort((a, b) => a.at - b.at)
    : [];
  const sessions = history
    ? (input.games ?? []).filter((game) => onDay(game.createdAt, dateKey)).sort((a, b) => b.createdAt - a.createdAt)
    : [];
  const addedCards = history ? (input.deck ?? []).filter((card) => onDay(card.addedAt, dateKey)).length : 0;
  const due = kind === 'past' || !studyKey ? 0 : Math.round(count(input.dueByDay?.[studyKey]));
  const streak = input.restDates?.has(dateKey) ? 'rest' : input.streakDates?.has(dateKey) ? 'streak' : null;

  const detail: CalendarDayDetail = {
    dateKey: cellKey,
    kind,
    studyKey,
    reviews: {
      count: reviewCount,
      passed: reviewPassed,
      accuracy: reviewCount > 0 ? reviewPassed / reviewCount : null,
      newCards,
    },
    practice: { count: practiceCount, correct: practiceCorrect },
    games: { answers: gameAnswers, correct: gameCorrect, sessions },
    minutes: { reading, watching, listening, study, total: figures.minutes },
    chars: Math.round(count(day?.chars)),
    books,
    shows,
    mined: { count: Math.max(figures.mined, scenes.length), scenes },
    linesStudied: Math.round(count(day?.linesStudied)),
    addedCards,
    due,
    streak,
    empty: false,
  };
  detail.empty = calendarDayIsEmpty(detail);
  return detail;
}

/** Nothing studied, nothing added, nothing due. */
export function calendarDayIsEmpty(detail: CalendarDayDetail): boolean {
  return (
    detail.reviews.count === 0
    && detail.practice.count === 0
    && detail.games.answers === 0
    && detail.games.sessions.length === 0
    && detail.minutes.total === 0
    && detail.chars === 0
    && detail.mined.count === 0
    && detail.linesStudied === 0
    && detail.addedCards === 0
    && detail.due === 0
  );
}

/**
 * The dates of the current streak, newest first: today (or yesterday when today is not
 * studied yet) and back while each day is active or a rest day the streak spent. Mirrors
 * `computeStreakDetail` in `renderer/stats.ts`, which hands over the rest dates it chose.
 */
export function streakRunDates(
  activeDates: ReadonlySet<string>,
  restDates: ReadonlySet<string>,
  now: Date,
): string[] {
  const out: string[] = [];
  // Study-day keys, as `computeStreakDetail` walks them: at 01:30 today is the evening before.
  let key = studyTodayKey(now);
  if (!activeDates.has(key)) key = shiftStudyDayKey(key, -1);
  for (let guard = 0; guard < 3660; guard += 1) {
    if (!activeDates.has(key) && !restDates.has(key)) break;
    out.push(key);
    key = shiftStudyDayKey(key, -1);
  }
  // A trailing rest date with no active day before it is not part of a run.
  while (out.length && restDates.has(out[out.length - 1])) out.pop();
  return out;
}

/** Heat level per day key for the given keys, shaded against the busiest of them. */
export function heatLevelsFor(
  keys: readonly string[],
  days: Readonly<Record<string, StudyDayRaw | undefined>>,
  games: Readonly<Record<string, number>> = {},
): Record<string, HeatmapLevel> {
  const scores = keys.map((key) => studyActivityScore(studyDayFigures(key, days[key], games[key] ?? 0)));
  const peak = Math.max(0, ...scores);
  const out: Record<string, HeatmapLevel> = {};
  keys.forEach((key, i) => {
    out[key] = heatmapLevel(scores[i], peak);
  });
  return out;
}

export interface YearHeatMonth {
  /** 0..11 */
  month: number;
  /** Empty slots before the 1st so columns are weekdays. */
  leadingBlanks: number;
  days: { date: string; level: HeatmapLevel; minutes: number; reviews: number; games: number; mined: number }[];
}

/** Twelve month blocks of one year, every day shaded against the busiest day of that year. */
export function yearHeatmap(
  year: number,
  days: Readonly<Record<string, StudyDayRaw | undefined>>,
  games: Readonly<Record<string, number>> = {},
  weekStartsOn = 0,
): YearHeatMonth[] {
  const keys: string[] = [];
  for (let d = new Date(year, 0, 1); d.getFullYear() === year; d = addLocalDays(d, 1)) keys.push(localDayKey(d));
  const levels = heatLevelsFor(keys, days, games);
  return Array.from({ length: 12 }, (_, month) => {
    const first = new Date(year, month, 1);
    const monthDays = keys
      .filter((key) => Number(key.slice(5, 7)) === month + 1)
      .map((key) => {
        const figures = studyDayFigures(key, days[key], games[key] ?? 0);
        return {
          date: key,
          level: levels[key],
          minutes: figures.minutes,
          reviews: figures.reviews,
          games: figures.games,
          mined: figures.mined,
        };
      });
    return { month, leadingBlanks: (first.getDay() - weekStartsOn + 7) % 7, days: monthDays };
  });
}

type Translate = (key: string, vars?: Record<string, string | number>) => string;

/** The day as Markdown lines, in the UI language. Study content (titles, lines) is verbatim. */
export function formatCalendarDaySummary(detail: CalendarDayDetail, t: Translate, dateLabel: string): string {
  const lines: string[] = [`## ${dateLabel}`];
  if (detail.streak === 'streak') lines.push(`- ${t('cal2.day.inStreak')}`);
  if (detail.streak === 'rest') lines.push(`- ${t('cal2.day.restDay')}`);
  if (detail.reviews.count > 0) {
    lines.push(`- ${t('cal2.day.reviewsLine', {
      count: detail.reviews.count,
      accuracy: Math.round((detail.reviews.accuracy ?? 0) * 100),
    })}`);
  }
  if (detail.reviews.newCards > 0) lines.push(`- ${t('cal2.day.newCards', { count: detail.reviews.newCards })}`);
  if (detail.addedCards > 0) lines.push(`- ${t('cal2.day.addedCards', { count: detail.addedCards })}`);
  if (detail.practice.count > 0) lines.push(`- ${t('cal2.day.practiceLine', { count: detail.practice.count, correct: detail.practice.correct })}`);
  if (detail.minutes.total > 0) {
    lines.push(`- ${t('cal2.day.minutesTotal', { count: detail.minutes.total })}`);
    const parts: Array<[string, number]> = [
      ['cal2.day.minutes.reading', detail.minutes.reading],
      ['cal2.day.minutes.watching', detail.minutes.watching],
      ['cal2.day.minutes.listening', detail.minutes.listening],
      ['cal2.day.minutes.study', detail.minutes.study],
    ];
    for (const [key, value] of parts) if (value > 0) lines.push(`  - ${t(key, { count: value })}`);
  }
  if (detail.chars > 0) lines.push(`- ${t('cal2.day.chars', { count: detail.chars })}`);
  for (const book of detail.books) {
    lines.push(`  - ${book.title}: ${t('cal2.day.bookMeta', { minutes: book.minutes, chars: book.chars })}`);
  }
  for (const show of detail.shows) lines.push(`  - ${show.title}: ${t('cal2.day.minutes.watching', { count: show.minutes })}`);
  if (detail.mined.count > 0) lines.push(`- ${t('cal2.day.mined', { count: detail.mined.count })}`);
  for (const scene of detail.mined.scenes) lines.push(`  - ${scene.sentence} (${scene.title})`);
  if (detail.linesStudied > 0) lines.push(`- ${t('cal2.day.linesStudied', { count: detail.linesStudied })}`);
  if (detail.games.answers > 0 || detail.games.sessions.length > 0) {
    lines.push(`- ${t('cal2.day.gamesLine', { count: detail.games.answers, correct: detail.games.correct })}`);
  }
  if (detail.due > 0) lines.push(`- ${t('cal2.day.due', { count: detail.due })}`);
  if (lines.length === 1) lines.push(`- ${t('cal2.day.nothing')}`);
  return lines.join('\n');
}

/** A month: totals first, then every day that has something to say. */
export function formatCalendarMonthSummary(
  details: readonly CalendarDayDetail[],
  t: Translate,
  monthLabel: string,
  dayLabel: (dateKey: string) => string,
): string {
  const active = details.filter((detail) => !detail.empty && detail.kind !== 'future');
  const totals = active.reduce(
    (sum, detail) => ({
      minutes: sum.minutes + detail.minutes.total,
      reviews: sum.reviews + detail.reviews.count,
      passed: sum.passed + detail.reviews.passed,
      mined: sum.mined + detail.mined.count,
      chars: sum.chars + detail.chars,
    }),
    { minutes: 0, reviews: 0, passed: 0, mined: 0, chars: 0 },
  );
  const head = [
    `# ${t('cal2.export.monthTitle', { month: monthLabel })}`,
    '',
    `- ${t('cal2.export.activeDays', { count: active.length })}`,
    `- ${t('cal2.day.minutesTotal', { count: totals.minutes })}`,
    `- ${t('cal2.day.reviewsLine', {
      count: totals.reviews,
      accuracy: totals.reviews ? Math.round((totals.passed / totals.reviews) * 100) : 0,
    })}`,
    `- ${t('cal2.day.mined', { count: totals.mined })}`,
    `- ${t('cal2.day.chars', { count: totals.chars })}`,
  ];
  const body = details
    .filter((detail) => !detail.empty)
    .map((detail) => formatCalendarDaySummary(detail, t, dayLabel(detail.dateKey)));
  return [...head, '', ...body.flatMap((block) => [block, ''])].join('\n').trimEnd() + '\n';
}

/** Every date key of a calendar month (`month` 0..11). */
export function monthDateKeys(year: number, month: number): string[] {
  const out: string[] = [];
  for (let d = new Date(year, month, 1); d.getMonth() === month; d = addLocalDays(d, 1)) out.push(localDayKey(d));
  return out;
}
