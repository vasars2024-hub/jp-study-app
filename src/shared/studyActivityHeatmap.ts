/**
 * Study activity per day, as the Statistics heatmap and the Calendar read it.
 *
 * Every number here already exists somewhere: minutes and reviews and mined lines in the
 * per-day stats store (`renderer/stats.ts`), game answers in the review log (`mode:
 * 'game'`), and due dates on the local deck (`localDueForecast`). What was missing is one
 * place that folds them into "how much did I study that day" and "how much is due that
 * day", so the year view, the 14-day chart and the calendar cannot disagree.
 *
 * Pure: dates in, figures out. Day keys are STUDY days (`YYYY-MM-DD`, `studyDay.ts`: the
 * local calendar rolling over at the configured hour, 4 am by default), the key the stats
 * store writes. A day's figures and "today" are both study days here, so at 01:30 tonight's
 * reviews, games and minutes land on the evening they belong to, and today's cell is that
 * evening rather than an empty calendar date the stats store never writes to.
 */
import {
  shiftStudyDayKey,
  studyDayIndex,
  studyDayIndexOfKey,
  studyDayKey,
  studyDayKeyer,
} from './studyDay';

/** The per-day stats fields this module reads. Every field is optional on disk. */
export interface StudyDayRaw {
  seconds?: number;
  watchSeconds?: number;
  listenSeconds?: number;
  studySeconds?: number;
  reviews?: number;
  mediaMined?: number;
}

export interface StudyDayFigures {
  /** Local `YYYY-MM-DD`. */
  date: string;
  /** Reading + watching + listening + focused study, in whole minutes. */
  minutes: number;
  reviews: number;
  /** Answers given in study games. */
  games: number;
  /** Cards mined from media. */
  mined: number;
}

export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;

export interface HeatmapCell extends StudyDayFigures {
  level: HeatmapLevel;
}

export interface StudyHeatmap {
  cells: HeatmapCell[];
  /** Empty slots before the first day so columns are whole weeks (0 = the week starts there). */
  leadingBlanks: number;
  activeDays: number;
  totals: { minutes: number; reviews: number; games: number; mined: number };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Local `YYYY-MM-DD` of a CALENDAR date: for laying out a grid of dates. Never for
 * deciding which day a moment belongs to (that is `studyDayKey`) or which day is today
 * (`studyTodayKey`).
 */
export function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** The study day `now` is on: the key under which the stats store files what happens now. */
export function studyTodayKey(now: Date): string {
  return studyDayKey(now.getTime());
}

/** `date` moved by whole calendar days (DST-safe: it moves the date, not 24 h blocks). */
export function addLocalDays(date: Date, days: number): Date {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

export function studyDayFigures(date: string, raw: StudyDayRaw | undefined, games = 0): StudyDayFigures {
  const seconds = count(raw?.seconds) + count(raw?.watchSeconds) + count(raw?.listenSeconds) + count(raw?.studySeconds);
  return {
    date,
    minutes: Math.round(seconds / 60),
    reviews: Math.round(count(raw?.reviews)),
    games: Math.round(count(games)),
    mined: Math.round(count(raw?.mediaMined)),
  };
}

/**
 * Game answers per study day, from review-log entries: the same day the stats store files
 * the minutes and reviews they are shown beside (a game at 01:30 is the evening before).
 */
export function gameAnswersByDay(
  entries: readonly { at: number; mode: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  const dayOf = studyDayKeyer();
  for (const entry of entries) {
    if (entry.mode !== 'game' || !Number.isFinite(entry.at)) continue;
    const key = dayOf(entry.at);
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}

/**
 * One number for a day's shading. Minutes are the unit; a review or a game answer is
 * worth about fifteen seconds of attention, and a mined card about a minute (find the
 * line, look it up, check the card). The weights only order days against each other —
 * no figure the user reads is computed from them.
 */
export function studyActivityScore(day: Pick<StudyDayFigures, 'minutes' | 'reviews' | 'games' | 'mined'>): number {
  return day.minutes + day.reviews / 4 + day.games / 4 + day.mined;
}

/** Shade 1..4 relative to the busiest day in view; 0 only for a day with nothing. */
export function heatmapLevel(score: number, peak: number): HeatmapLevel {
  if (!(score > 0) || !(peak > 0)) return 0;
  return (1 + Math.min(3, Math.floor((score / peak) * 4))) as HeatmapLevel;
}

/**
 * The last `span` study days ending on the one `end` falls on (inclusive), oldest first,
 * shaded against the busiest of them. `weekStartsOn` is 0 for Sunday, 1 for Monday.
 */
export function buildStudyHeatmap(
  days: Readonly<Record<string, StudyDayRaw | undefined>>,
  games: Readonly<Record<string, number>>,
  end: Date,
  span = 365,
  weekStartsOn = 0,
): StudyHeatmap {
  const length = Math.max(1, Math.floor(span));
  const firstKey = shiftStudyDayKey(studyTodayKey(end), -(length - 1));
  const figures: StudyDayFigures[] = [];
  for (let i = 0; i < length; i += 1) {
    const key = shiftStudyDayKey(firstKey, i);
    figures.push(studyDayFigures(key, days[key], games[key] ?? 0));
  }
  const peak = Math.max(0, ...figures.map(studyActivityScore));
  const totals = { minutes: 0, reviews: 0, games: 0, mined: 0 };
  let activeDays = 0;
  const cells = figures.map((day) => {
    const score = studyActivityScore(day);
    if (score > 0) activeDays += 1;
    totals.minutes += day.minutes;
    totals.reviews += day.reviews;
    totals.games += day.games;
    totals.mined += day.mined;
    return { ...day, level: heatmapLevel(score, peak) };
  });
  return {
    cells,
    leadingBlanks: (new Date(studyDayIndexOfKey(firstKey) * DAY_MS).getUTCDay() - weekStartsOn + 7) % 7,
    activeDays,
    totals,
  };
}

/**
 * Reviews due per study day from a local due forecast (whose offsets are study days).
 * Today carries the overdue cards too: an overdue card is due now, and today is "now".
 */
export function dueByDate(
  forecast: { overdue: number; days: readonly { offsetDays: number; due: number }[] },
  now: Date,
): Record<string, number> {
  const out: Record<string, number> = {};
  const today = studyTodayKey(now);
  for (const day of forecast.days) {
    const due = count(day.due) + (day.offsetDays === 0 ? count(forecast.overdue) : 0);
    if (due > 0) out[shiftStudyDayKey(today, day.offsetDays)] = due;
  }
  if (!forecast.days.some((day) => day.offsetDays === 0) && count(forecast.overdue) > 0) {
    out[today] = count(forecast.overdue);
  }
  return out;
}

/**
 * What a calendar day says about study: minutes and reviews done (today and before —
 * the future has none), and reviews due (today and after — a past day's due count is
 * not knowable from today's schedule). Null when there is nothing to say.
 */
export function calendarStudyDay(
  dateKey: string,
  raw: StudyDayRaw | undefined,
  due: Readonly<Record<string, number>>,
  now: Date,
): { minutes: number; reviews: number; due: number } | null {
  const offset = daysFromToday(dateKey, now);
  const done = offset <= 0 ? studyDayFigures(dateKey, raw) : null;
  const minutes = done?.minutes ?? 0;
  const reviews = done?.reviews ?? 0;
  const dueCount = offset >= 0 ? Math.round(count(due[dateKey])) : 0;
  if (minutes === 0 && reviews === 0 && dueCount === 0) return null;
  return { minutes, reviews, due: dueCount };
}

/**
 * Whole days from the study day `now` is on to `date` (negative in the past). Between
 * midnight and the day-start hour, today is still the evening before: its stats entry,
 * its reviews and its due count all live under that date.
 */
export function daysFromToday(dateKey: string, now: Date): number {
  return studyDayIndexOfKey(dateKey) - studyDayIndex(now.getTime());
}
