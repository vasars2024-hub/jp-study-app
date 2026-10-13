/**
 * The study day: the one definition of "which day is this review on".
 *
 * Anki does not roll the day over at midnight. A study day starts at a
 * configurable hour (4 am by default), so a session that runs past midnight is
 * still "tonight", and a card reviewed at 01:30 and again at 03:50 was reviewed
 * twice on one day. Before this file the app had three answers: the scheduler
 * called anything under 24 hours "the same day", the FSRS optimiser used 4 am
 * study days with a fixed UTC offset, and Statistics, the streak and the
 * new-card budget used local midnight. The optimiser's weights were trained on
 * one rule and applied with another.
 *
 * Everything that asks "same day?", "today's key?" or "when does today end?"
 * goes through here:
 *
 * - the scheduler's short-term/long-term split and FSRS elapsed days;
 * - the optimiser's `deltaDays` (and `fsrsMemoryReplay`);
 * - the new-card budget (`introducedTodayCount`), due-by-day searches;
 * - stats day keys, the streak, and the review-log summaries.
 *
 * Days are counted on the LOCAL calendar, never in 24-hour blocks: a day with
 * a daylight-saving change is 23 or 25 hours long and is still one day.
 *
 * The hour is a setting (Settings → Scheduling). The renderer pushes it here
 * with `setStudyDayStartHour` whenever the scheduling config is read, so pure
 * code that is not handed an hour uses the user's, and code in a worker (the
 * optimiser) is always handed one explicitly.
 */

export const DEFAULT_DAY_START_HOUR = 4;
export const MIN_DAY_START_HOUR = 0;
export const MAX_DAY_START_HOUR = 23;

const DAY_MS = 24 * 60 * 60 * 1000;

let configuredHour = DEFAULT_DAY_START_HOUR;

/** An hour 0..23, or the default for anything else. */
export function normalizeDayStartHour(value: unknown): number {
  const n = Number(value);
  if (value === null || value === undefined || value === '' || !Number.isFinite(n)) return DEFAULT_DAY_START_HOUR;
  return Math.min(MAX_DAY_START_HOUR, Math.max(MIN_DAY_START_HOUR, Math.floor(n)));
}

/** The user's day-start hour, as last pushed by the renderer (default 4). */
export function getStudyDayStartHour(): number {
  return configuredHour;
}

export function setStudyDayStartHour(hour: unknown): void {
  configuredHour = normalizeDayStartHour(hour);
}

export interface StudyDayOptions {
  /** Hour at which a new study day starts; the configured hour when absent. */
  dayStartHour?: number;
  /**
   * A FIXED local-minus-UTC offset in minutes. Only for callers that must not
   * read the host's zone (a test pinned to one offset); everything else uses
   * the local calendar, which is right across daylight-saving changes.
   */
  utcOffsetMinutes?: number;
}

function hourOf(options?: StudyDayOptions | number): number {
  if (typeof options === 'number') return normalizeDayStartHour(options);
  return options?.dayStartHour === undefined ? configuredHour : normalizeDayStartHour(options.dayStartHour);
}

/** Local calendar date of the study day containing `ms`, as a UTC day number. */
function localStudyDayNumber(ms: number, hour: number): number {
  const d = new Date(ms);
  let day = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY_MS;
  if (d.getHours() < hour) day -= 1;
  return day;
}

/**
 * The study day containing `ms`, as a whole number that grows by one per day
 * (days since 1970-01-01 of the study day's calendar date). Differences of two
 * indexes are FSRS's whole elapsed days.
 */
export function studyDayIndex(ms: number, options?: StudyDayOptions | number): number {
  const hour = hourOf(options);
  if (typeof options === 'object' && options?.utcOffsetMinutes !== undefined) {
    return Math.floor((ms + options.utcOffsetMinutes * 60_000 - hour * 3_600_000) / DAY_MS);
  }
  return localStudyDayNumber(ms, hour);
}

/** Whole study days from `from` to `to` (0 = the same study day). */
export function studyDaysBetween(from: number, to: number, options?: StudyDayOptions | number): number {
  return studyDayIndex(to, options) - studyDayIndex(from, options);
}

export function isSameStudyDay(a: number, b: number, options?: StudyDayOptions | number): boolean {
  return studyDayIndex(a, options) === studyDayIndex(b, options);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `YYYY-MM-DD` of a study-day index. */
export function studyDayKeyOfIndex(index: number): string {
  const d = new Date(index * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** The study-day index of a `YYYY-MM-DD` key. */
export function studyDayIndexOfKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y || 1970, (m || 1) - 1, d || 1) / DAY_MS;
}

/** `YYYY-MM-DD` of the study day containing `ms`: what stats, streaks and the budget key on. */
export function studyDayKey(ms: number, options?: StudyDayOptions | number): string {
  return studyDayKeyOfIndex(studyDayIndex(ms, options));
}

/** The key `delta` days after (or before) `key`. */
export function shiftStudyDayKey(key: string, delta: number): string {
  return studyDayKeyOfIndex(studyDayIndexOfKey(key) + Math.round(delta));
}

/** Epoch ms at which study day `index` starts: its calendar date at the start hour, local time. */
export function startOfStudyDayIndex(index: number, options?: StudyDayOptions | number): number {
  const hour = hourOf(options);
  if (typeof options === 'object' && options?.utcOffsetMinutes !== undefined) {
    return index * DAY_MS + hour * 3_600_000 - options.utcOffsetMinutes * 60_000;
  }
  const d = new Date(index * DAY_MS);
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), hour).getTime();
}

export function startOfStudyDay(ms: number, options?: StudyDayOptions | number): number {
  return startOfStudyDayIndex(studyDayIndex(ms, options), options);
}

/** Exclusive end of the study day containing `ms`. */
export function endOfStudyDay(ms: number, options?: StudyDayOptions | number): number {
  return startOfStudyDayIndex(studyDayIndex(ms, options) + 1, options);
}

export function startOfStudyDayKey(key: string, options?: StudyDayOptions | number): number {
  return startOfStudyDayIndex(studyDayIndexOfKey(key), options);
}

/** Exclusive end of the study day `key`. */
export function endOfStudyDayKey(key: string, options?: StudyDayOptions | number): number {
  return startOfStudyDayIndex(studyDayIndexOfKey(key) + 1, options);
}

/** `count` study-day keys ending with the one containing `now`, oldest first. */
export function lastStudyDayKeys(count: number, now: number, options?: StudyDayOptions | number): string[] {
  const today = studyDayIndex(now, options);
  const out: string[] = [];
  for (let i = Math.max(1, Math.floor(count)) - 1; i >= 0; i -= 1) out.push(studyDayKeyOfIndex(today - i));
  return out;
}

/**
 * `studyDayKey` for a whole pass over a time-ordered log: a run of rows on one
 * study day costs one `Date`, not one per row. The bounds are that day's own
 * start and end, so DST days are exact.
 */
export function studyDayKeyer(options?: StudyDayOptions | number): (ms: number) => string {
  const hour = hourOf(options);
  const fixed = typeof options === 'object' ? options : { dayStartHour: hour };
  const resolved: StudyDayOptions = { ...fixed, dayStartHour: hour };
  let from = Number.POSITIVE_INFINITY;
  let to = Number.NEGATIVE_INFINITY;
  let key = '';
  return (ms: number): string => {
    if (ms >= from && ms < to) return key;
    const index = studyDayIndex(ms, resolved);
    key = studyDayKeyOfIndex(index);
    from = startOfStudyDayIndex(index, resolved);
    to = startOfStudyDayIndex(index + 1, resolved);
    return key;
  };
}
