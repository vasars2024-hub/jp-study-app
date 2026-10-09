// Study-activity statistics, stored in localStorage. We track, per calendar day,
// how many seconds were spent reading and (approximately) how many characters were
// read, plus a per-book tally. The Statistics tab turns this into totals, a
// day-streak, and a simple recent-days chart. Everything is local + offline.
//
// Since Phase 6 slice 8 there is a **second channel**: seconds spent *watching* in
// the adopted media player, with a per-show tally. It is deliberately a separate
// field rather than more `seconds`, because five existing surfaces label that number
// "read" — folding watch time into it would silently make every one of them lie.
// What the two channels *do* share is the definition of an active day: the streak
// and `daysActive` count a day on which either happened, which is the whole point of
// recording watch time at all.

import type { ArenaMistake, GameId, SourceLang } from './games/types';
import type { LevelTier } from '../shared/levelScale';
import type { StudyDayRaw } from '../shared/studyActivityHeatmap';
import type { StudyDayActivity } from '../shared/calendarDayDetail';
import { getStudyLang, STUDY_LANG_EVENT, STUDY_LANG_KEY, type StudyLang } from './studyEnvironment';
import { LANG_TAGS } from '../shared/i18n/core';
import { getUiLang, t } from './i18n';

export const LEGACY_STATS_KEY = 'jp-study-stats-v1';
const GAME_KEY = 'jp-game-progress-v1';

export function statsKey(lang: StudyLang = getStudyLang()): string {
  return `${LEGACY_STATS_KEY}-${lang}`;
}

let statsMigrated = false;

function migrateStatsLegacyOnce(): void {
  if (statsMigrated) return;
  statsMigrated = true;
  try {
    const jaKey = statsKey('ja');
    if (localStorage.getItem(jaKey)) return;
    const legacy = localStorage.getItem(LEGACY_STATS_KEY);
    if (!legacy) return;
    localStorage.setItem(jaKey, legacy);
  } catch {
    /* ignore */
  }
}

interface DayEntry {
  seconds: number;
  chars: number;
  /** Watched seconds. Optional: every day written before slice 8 lacks it. */
  watchSeconds?: number;
  /** Seconds of music listened to (the Music app / mini player). */
  listenSeconds?: number;
  /** Flashcard reviews graded that day (any scheduler rating). */
  reviews?: number;
  /** Of `reviews`, how many were not Again — the retention numerator. */
  reviewsPassed?: number;
  /** Learn / Test / Write answers that day. */
  practice?: number;
  practiceCorrect?: number;
  /**
   * Seconds of active study that is neither reading nor watching: Game Arena
   * sessions, and study-mode time in the player. Kept apart from both so a
   * game session never inflates "time read" and study time never hides in
   * "time watched".
   */
  studySeconds?: number;
  /** Cards mined from the video player that day. Optional: older days lack it. */
  mediaMined?: number;
  /** Distinct subtitle lines actively studied in the player that day. */
  linesStudied?: number;
  /**
   * That day's reading per book (library item id) and watching per show (resume key), so the
   * Calendar's day view can say WHAT was read or watched and open it. Optional: days recorded
   * before the tally existed carry only the totals above.
   */
  books?: Record<string, { title: string; seconds: number; chars: number }>;
  shows?: Record<string, { title: string; seconds: number }>;
}
interface BookEntry {
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
interface ShowEntry {
  title: string;
  seconds: number;
  lastWatched: number;
}
interface StatsData {
  days: Record<string, DayEntry>; // key = YYYY-MM-DD (local)
  books: Record<string, BookEntry>; // key = library item id
  shows: Record<string, ShowEntry>; // key = videoCoreResumeKey (the Phase 6 join key)
}

export interface GameHighScore {
  gameId: GameId;
  level: LevelTier;
  sourceLang: SourceLang;
  score: number;
  accuracy: number;
  updatedAt: number;
}

export interface GameBadge {
  id: string;
  label: string;
  description: string;
  awardedAt: number;
}

export interface GameResultRecord {
  id: string;
  gameId: GameId;
  level: LevelTier;
  sourceLang: SourceLang;
  score: number;
  accuracy: number;
  mistakes: ArenaMistake[];
  createdAt: number;
}

export interface GameProgressData {
  xp: number;
  streak: number;
  lastPlayedDay?: string;
  highScores: Record<string, GameHighScore>;
  badges: GameBadge[];
  recent: GameResultRecord[];
}

export interface RecordGameResultInput {
  gameId: GameId;
  level: LevelTier;
  sourceLang: SourceLang;
  score: number;
  accuracy: number;
  mistakes: ArenaMistake[];
}

export interface StatsSyncPayload {
  dayKey: string;
  todayChars: number;
  streak: number;
}

/** Fired on window after each recordReading() flush; detail = ReadingDelta. */
export const READING_RECORDED_EVENT = 'jp-reading-recorded';
/**
 * Fired on window after each recordWatching() flush; detail = WatchDelta.
 *
 * Deliberately *not* `READING_RECORDED_EVENT` with `chars: 0`. Companions, achievements
 * and the city bridge all listen to that one and read the delta as reading; a zero-char
 * reading event is a lie they would each have to learn to disbelieve. Surfaces that want
 * both activities subscribe to both, which is one line and says what it means.
 */
export const WATCH_RECORDED_EVENT = 'jp-watch-recorded';
export const STATS_RESET_EVENT = 'jp-study-stats-reset';
/** Fired on window after each recordListening() flush; detail = ListenDelta. */
export const LISTEN_RECORDED_EVENT = 'jp-listen-recorded';
/** Fired on window after a flashcard review or practice answer is recorded. */
export const REVIEW_RECORDED_EVENT = 'jp-review-recorded';
export const GAME_PROGRESS_EVENT = 'jp-game-progress-changed';

/** Keep every statistics host current, including separate reader/player windows. */
export function onStatsChanged(refresh: () => void): () => void {
  const events = [
    READING_RECORDED_EVENT,
    WATCH_RECORDED_EVENT,
    REVIEW_RECORDED_EVENT,
    STUDY_RECORDED_EVENT,
    MEDIA_STUDY_RECORDED_EVENT,
    STATS_RESET_EVENT,
    STUDY_LANG_EVENT,
    REST_DAY_CHANGED_EVENT,
  ];
  const onStorage = (event: StorageEvent): void => {
    if (event.storageArea && event.storageArea !== localStorage) return;
    if (event.key === null || event.key === statsKey() || event.key === STUDY_LANG_KEY) refresh();
  };
  let day = todayDayKey();
  const clock = window.setInterval(() => {
    const next = todayDayKey();
    if (next !== day) {
      day = next;
      refresh();
    }
  }, 60_000);
  events.forEach((event) => window.addEventListener(event, refresh));
  window.addEventListener('storage', onStorage);
  window.addEventListener('focus', refresh);
  return () => {
    events.forEach((event) => window.removeEventListener(event, refresh));
    window.removeEventListener('storage', onStorage);
    window.removeEventListener('focus', refresh);
    window.clearInterval(clock);
  };
}

export interface ReadingDelta {
  bookId: string;
  title: string;
  seconds: number;
  chars: number;
}

export interface WatchDelta {
  showId: string;
  title: string;
  seconds: number;
}

export interface DayStat {
  date: string; // YYYY-MM-DD
  seconds: number;
  chars: number;
  watchSeconds: number;
  /** Flashcard reviews graded that day. */
  reviews: number;
  reviewsPassed: number;
  /** Active study seconds (games, player study mode). */
  studySeconds: number;
  /** Cards mined from the video player. Optional so hand-built summaries stay valid. */
  mediaMined?: number;
  /** Distinct subtitle lines studied in the player. */
  linesStudied?: number;
}
export interface BookStat {
  id: string;
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
export interface ShowStat {
  id: string;
  title: string;
  seconds: number;
  lastWatched: number;
}
export interface StatsSummary {
  totalSeconds: number;
  totalChars: number;
  /** Watched seconds across every recorded day. Never folded into `totalSeconds`. */
  totalWatchSeconds: number;
  /** Days with reading **or** watching — see the file header. */
  daysActive: number;
  streak: number; // consecutive days ending today (or yesterday), either activity
  todaySeconds: number;
  todayChars: number;
  todayWatchSeconds: number;
  /** Music listened to today / across every recorded day. Its own channel, like watching. */
  todayListenSeconds?: number;
  totalListenSeconds?: number;
  /** Active study seconds (games, player study mode), today and in total. */
  todayStudySeconds: number;
  totalStudySeconds: number;
  /** Flashcard reviews graded today, and across every recorded day. */
  todayReviews: number;
  totalReviews: number;
  totalReviewsPassed: number;
  /**
   * Cards mined from the video player, today / last 7 days (incl. today) / all time.
   * Optional (always set by `getSummary`) so hand-built summaries stay valid.
   */
  todayMediaMined?: number;
  weekMediaMined?: number;
  totalMediaMined?: number;
  /** Distinct subtitle lines studied in the player, today / last 7 days / all time. */
  todayLinesStudied?: number;
  weekLinesStudied?: number;
  totalLinesStudied?: number;
  recent: DayStat[]; // last 14 days, oldest → newest (includes empty days)
  books: BookStat[]; // most-recently-read first
  shows: ShowStat[]; // most-recently-watched first
}

/** Local calendar date as YYYY-MM-DD (not UTC, so "today" matches the user). */
function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayDayKey(): string {
  return dayKey(new Date());
}

function load(): StatsData {
  migrateStatsLegacyOnce();
  try {
    const raw = localStorage.getItem(statsKey());
    if (!raw) return { days: {}, books: {}, shows: {} };
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    return { days: parsed.days ?? {}, books: parsed.books ?? {}, shows: parsed.shows ?? {} };
  } catch {
    return { days: {}, books: {}, shows: {} };
  }
}

function save(d: StatsData): void {
  try {
    localStorage.setItem(statsKey(), JSON.stringify(d));
  } catch {
    /* storage full/unavailable — stats just won't persist */
  }
}

function emptyGameProgress(): GameProgressData {
  return { xp: 0, streak: 0, highScores: {}, badges: [], recent: [] };
}

export function loadGameProgress(): GameProgressData {
  try {
    const raw = localStorage.getItem(GAME_KEY);
    if (!raw) return emptyGameProgress();
    const parsed = JSON.parse(raw) as Partial<GameProgressData>;
    return {
      xp: Math.max(0, Math.round(Number(parsed.xp) || 0)),
      streak: Math.max(0, Math.round(Number(parsed.streak) || 0)),
      lastPlayedDay: typeof parsed.lastPlayedDay === 'string' ? parsed.lastPlayedDay : undefined,
      highScores: parsed.highScores && typeof parsed.highScores === 'object' ? parsed.highScores : {},
      badges: Array.isArray(parsed.badges) ? parsed.badges.filter((b) => b && typeof b.id === 'string') : [],
      recent: Array.isArray(parsed.recent) ? parsed.recent.filter((r) => r && typeof r.id === 'string') : [],
    };
  } catch {
    return emptyGameProgress();
  }
}

function saveGameProgress(progress: GameProgressData): void {
  try {
    localStorage.setItem(GAME_KEY, JSON.stringify(progress));
  } catch {
    /* progress just won't persist */
  }
  try {
    window.dispatchEvent(new CustomEvent(GAME_PROGRESS_EVENT));
  } catch {
    /* tests/non-browser context */
  }
}

function highScoreKey(gameId: GameId, level: LevelTier, sourceLang: SourceLang): string {
  return `${gameId}|${level}|${sourceLang}`;
}

function hasBadge(progress: GameProgressData, id: string): boolean {
  return progress.badges.some((badge) => badge.id === id);
}

function award(progress: GameProgressData, id: string, label: string, description: string, at: number): void {
  if (hasBadge(progress, id)) return;
  progress.badges.push({ id, label, description, awardedAt: at });
}

function awardGameBadges(progress: GameProgressData, input: RecordGameResultInput, at: number): void {
  if (progress.recent.length === 0) {
    award(progress, 'arena-first-clear', 'First Clear', 'Finished a Game Arena session.', at);
  }
  if (input.score >= 90) {
    award(progress, 'arena-ace', 'Arena Ace', 'Scored 90 or higher in a fast game.', at);
  }
  if (input.gameId === 'kanji-reading' && input.score >= 90) {
    award(progress, 'kanji-scholar', 'Kanji Scholar', 'Scored 90 or higher in Kanji Reading Attack.', at);
  }
  if (input.gameId === 'particle-panic' && input.score >= 90) {
    award(progress, 'grammar-warden', 'Grammar Warden', 'Scored 90 or higher in Particle Panic.', at);
  }
  if (input.gameId === 'mirror-writing' && input.score >= 85) {
    award(progress, 'flow-master', 'Flow Master', 'Earned 85 or higher in Mirror Writing.', at);
  }
}

function isYesterday(day: string | undefined, today: string): boolean {
  if (!day) return false;
  const d = new Date(`${today}T00:00:00`);
  d.setDate(d.getDate() - 1);
  return dayKey(d) === day;
}

export function recordGameResult(input: RecordGameResultInput): GameProgressData {
  const progress = loadGameProgress();
  const at = Date.now();
  const today = todayDayKey();
  progress.streak =
    progress.lastPlayedDay === today
      ? progress.streak || 1
      : isYesterday(progress.lastPlayedDay, today)
        ? progress.streak + 1
        : 1;
  progress.lastPlayedDay = today;
  progress.xp += Math.max(5, Math.round(input.score + input.accuracy * 25));

  const key = highScoreKey(input.gameId, input.level, input.sourceLang);
  const prior = progress.highScores[key];
  if (!prior || input.score > prior.score) {
    progress.highScores[key] = {
      gameId: input.gameId,
      level: input.level,
      sourceLang: input.sourceLang,
      score: input.score,
      accuracy: input.accuracy,
      updatedAt: at,
    };
  }

  awardGameBadges(progress, input, at);
  progress.recent = [
    {
      id: `game-${at.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      gameId: input.gameId,
      level: input.level,
      sourceLang: input.sourceLang,
      score: input.score,
      accuracy: input.accuracy,
      mistakes: input.mistakes.slice(0, 20),
      createdAt: at,
    },
    ...progress.recent,
  ].slice(0, 30);

  saveGameProgress(progress);
  return progress;
}

export function resetGameProgress(): void {
  try {
    localStorage.removeItem(GAME_KEY);
  } catch {
    /* ignore */
  }
  saveGameProgress(emptyGameProgress());
}

/**
 * Add a chunk of reading to today's totals and the book's tally. Called
 * periodically by the reader (every few seconds and on close). `seconds` and
 * `chars` are the amounts accrued *since the last call*.
 */
export function recordReading(
  bookId: string,
  title: string,
  seconds: number,
  chars: number,
): void {
  if (seconds <= 0 && chars <= 0) return;
  const data = load();
  const key = dayKey(new Date());

  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  day.seconds += Math.max(0, seconds);
  day.chars += Math.max(0, chars);
  if (bookId) {
    const books = day.books && typeof day.books === 'object' ? day.books : {};
    const dayBook = books[bookId] ?? { title, seconds: 0, chars: 0 };
    dayBook.title = title || dayBook.title;
    dayBook.seconds += Math.max(0, seconds);
    dayBook.chars += Math.max(0, chars);
    books[bookId] = dayBook;
    day.books = books;
  }
  data.days[key] = day;

  const book = data.books[bookId] ?? { title, seconds: 0, chars: 0, lastRead: 0 };
  book.title = title || book.title;
  book.seconds += Math.max(0, seconds);
  book.chars += Math.max(0, chars);
  book.lastRead = Date.now();
  data.books[bookId] = book;

  save(data);

  // Let listeners (the city engine bridge) react to fresh reading activity
  // without the readers having to know the city exists.
  try {
    window.dispatchEvent(
      new CustomEvent<ReadingDelta>(READING_RECORDED_EVENT, {
        detail: { bookId, title, seconds, chars },
      }),
    );
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/**
 * Add a chunk of watching to today's totals and the show's tally.
 *
 * Called by the media player's watch-time accumulator (`shared/seanimeWatchTime.ts`) on
 * its flush schedule and once more when playback ends. `showId` is the Phase 6 join key
 * (`videoCoreResumeKey`), so a show's tally lines up with its continue-watching row, its
 * readiness row and its mined cards rather than being a fourth identity for the same file.
 */
export function recordWatching(showId: string, title: string, seconds: number): void {
  if (!showId || !(seconds > 0)) return;
  const data = load();
  const key = dayKey(new Date());

  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  day.watchSeconds = (day.watchSeconds ?? 0) + seconds;
  const shows = day.shows && typeof day.shows === 'object' ? day.shows : {};
  const dayShow = shows[showId] ?? { title, seconds: 0 };
  dayShow.title = title || dayShow.title;
  dayShow.seconds += seconds;
  shows[showId] = dayShow;
  day.shows = shows;
  data.days[key] = day;

  const show = data.shows[showId] ?? { title, seconds: 0, lastWatched: 0 };
  show.title = title || show.title;
  show.seconds += seconds;
  show.lastWatched = Date.now();
  data.shows[showId] = show;

  save(data);

  try {
    window.dispatchEvent(
      new CustomEvent<WatchDelta>(WATCH_RECORDED_EVENT, {
        detail: { showId, title, seconds },
      }),
    );
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

export interface ListenDelta {
  trackId: string;
  title: string;
  seconds: number;
}

/**
 * Add a chunk of music listening to today's totals.
 *
 * Called by the music player's accumulator (`renderer/musicListening.ts`, the same
 * rules as `recordWatching`'s). A separate `listenSeconds` field for the reason watch
 * time has its own: surfaces label `seconds` "read" and `watchSeconds` "watched".
 * It does not count toward the streak — background music is not a study day on its own.
 */
export function recordListening(trackId: string, title: string, seconds: number): void {
  if (!trackId || !(seconds > 0)) return;
  const data = load();
  const key = dayKey(new Date());
  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  day.listenSeconds = Math.round(((day.listenSeconds ?? 0) + seconds) * 100) / 100;
  data.days[key] = day;
  save(data);
  try {
    window.dispatchEvent(
      new CustomEvent<ListenDelta>(LISTEN_RECORDED_EVENT, { detail: { trackId, title, seconds } }),
    );
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

export const STUDY_RECORDED_EVENT = 'jp-study-time-recorded';

/**
 * Add active study time to today's totals — a Game Arena session, or time in
 * the player's study mode. Its own channel, so it counts toward the streak and
 * Statistics without being passed off as reading or watching.
 */
export function recordStudyTime(seconds: number, at = Date.now()): void {
  if (!(seconds > 0)) return;
  const data = load();
  const key = dayKey(new Date(at));
  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  day.studySeconds = (day.studySeconds ?? 0) + Math.round(seconds);
  data.days[key] = day;
  save(data);
  try {
    window.dispatchEvent(new CustomEvent(STUDY_RECORDED_EVENT, { detail: { seconds } }));
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/**
 * Fired on window after recordMediaMined() / recordLinesStudied(); detail = MediaStudyDelta.
 * Counts as activity, so streak watchers listen to it like the review event.
 */
export const MEDIA_STUDY_RECORDED_EVENT = 'jp-media-study-recorded';

export interface MediaStudyDelta {
  kind: 'mined' | 'lines';
  count: number;
}

/** A finite count >= 0, for day fields read back from storage of unknown vintage. */
function dayCount(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
}

function recordMediaStudy(kind: MediaStudyDelta['kind'], count: number, at: number): void {
  const step = Math.round(Number(count));
  if (!(step > 0)) return;
  const data = load();
  const key = dayKey(new Date(Number.isFinite(at) ? at : Date.now()));
  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  if (kind === 'mined') day.mediaMined = dayCount(day.mediaMined) + step;
  else day.linesStudied = dayCount(day.linesStudied) + step;
  data.days[key] = day;
  save(data);
  try {
    window.dispatchEvent(
      new CustomEvent<MediaStudyDelta>(MEDIA_STUDY_RECORDED_EVENT, { detail: { kind, count: step } }),
    );
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/**
 * Count cards mined from the video player toward the day's totals. Called by the
 * mining panel once per newly created card. A day with only mining is an active day.
 */
export function recordMediaMined(count = 1, at = Date.now()): void {
  recordMediaStudy('mined', count, at);
}

/**
 * Count distinct subtitle lines the learner actively studied in the player
 * (replayed, looked up, dictated, shadowed, mined). The caller de-duplicates per
 * line per session; this only accumulates. Counts toward the streak.
 */
export function recordLinesStudied(count = 1, at = Date.now()): void {
  recordMediaStudy('lines', count, at);
}

/**
 * Count flashcard reviews (or practice answers) toward today's totals.
 *
 * Reviews are study: a day spent clearing the deck used to leave the streak
 * broken because only reading and watching time counted. `undo` takes one back
 * out again when the review it recorded is undone.
 */
export function recordReviewActivity(
  kind: 'review' | 'practice',
  passed: boolean,
  at = Date.now(),
  undo = false,
): void {
  const data = load();
  const key = dayKey(new Date(at));
  const day = data.days[key] ?? { seconds: 0, chars: 0 };
  const step = undo ? -1 : 1;
  if (kind === 'review') {
    day.reviews = Math.max(0, (day.reviews ?? 0) + step);
    if (passed) day.reviewsPassed = Math.max(0, (day.reviewsPassed ?? 0) + step);
  } else {
    day.practice = Math.max(0, (day.practice ?? 0) + step);
    if (passed) day.practiceCorrect = Math.max(0, (day.practiceCorrect ?? 0) + step);
  }
  data.days[key] = day;
  save(data);
  try {
    window.dispatchEvent(new CustomEvent(REVIEW_RECORDED_EVENT));
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/** A day counts as active if any channel — reading, watching, reviewing — recorded on it. */
function dayIsActive(entry: DayEntry | undefined): boolean {
  return !!entry && (
    entry.seconds > 0
    || (entry.watchSeconds ?? 0) > 0
    || (entry.reviews ?? 0) > 0
    || (entry.practice ?? 0) > 0
    || (entry.studySeconds ?? 0) > 0
    || dayCount(entry.mediaMined) > 0
    || dayCount(entry.linesStudied) > 0
  );
}

const REST_DAY_KEY = 'jp-study-streak-rest-day';
/** Fired on window when the rest-day allowance is switched, so open surfaces recount the streak. */
export const REST_DAY_CHANGED_EVENT = 'jp-study-rest-day-changed';

/** Whether one missed day per week is forgiven by the streak. Opt-in, off by default. */
export function getRestDayEnabled(): boolean {
  try {
    return localStorage.getItem(REST_DAY_KEY) === '1';
  } catch {
    return false;
  }
}

export function setRestDayEnabled(enabled: boolean): void {
  try {
    if (enabled) localStorage.setItem(REST_DAY_KEY, '1');
    else localStorage.removeItem(REST_DAY_KEY);
  } catch {
    /* storage unavailable — the allowance just won't persist */
  }
  try {
    window.dispatchEvent(new CustomEvent(REST_DAY_CHANGED_EVENT));
  } catch {
    /* non-browser context (tests) — ignore */
  }
}

/**
 * Consecutive days (ending today or yesterday) with reading, watching or reviewing.
 *
 * With `restDays`, a single missed day bridges the streak when the day before it was active,
 * at most once in any seven days. The rest day itself is not counted as a day studied.
 * A rest taken yesterday holds the streak while today is still unstudied, the same way a
 * plain streak may end yesterday.
 */
export function computeStreakDetail(
  days: Record<string, DayEntry>,
  restDays = false,
): { streak: number; restDates: string[] } {
  const restDates: string[] = [];
  let streak = 0;
  let steps = 0;
  let lastRest = -Infinity;
  const cursor = new Date();
  // Allow the streak to "end" yesterday if nothing's been studied yet today.
  if (!dayIsActive(days[dayKey(cursor)])) {
    cursor.setDate(cursor.getDate() - 1);
    steps += 1;
  }
  for (;;) {
    if (dayIsActive(days[dayKey(cursor)])) {
      streak += 1;
    } else if (restDays && steps - lastRest >= 7 && (streak > 0 || steps === 1)) {
      const before = new Date(cursor);
      before.setDate(before.getDate() - 1);
      if (!dayIsActive(days[dayKey(before)])) break;
      lastRest = steps;
      restDates.push(dayKey(cursor));
    } else {
      break;
    }
    cursor.setDate(cursor.getDate() - 1);
    steps += 1;
  }
  return { streak, restDates };
}

export function computeStreak(days: Record<string, DayEntry>, restDays = false): number {
  return computeStreakDetail(days, restDays).streak;
}

/** Dates (YYYY-MM-DD) the weekly rest day is currently spending to keep the streak alive. */
export function getStreakRestDates(): Set<string> {
  return new Set(computeStreakDetail(load().days, getRestDayEnabled()).restDates);
}

export function getSummary(): StatsSummary {
  const data = load();
  const dayKeys = Object.keys(data.days);

  let totalSeconds = 0;
  let totalChars = 0;
  let totalWatchSeconds = 0;
  let totalListenSeconds = 0;
  let totalReviews = 0;
  let totalReviewsPassed = 0;
  let totalStudySeconds = 0;
  let totalMediaMined = 0;
  let totalLinesStudied = 0;
  for (const k of dayKeys) {
    totalMediaMined += dayCount(data.days[k].mediaMined);
    totalLinesStudied += dayCount(data.days[k].linesStudied);
    totalStudySeconds += data.days[k].studySeconds ?? 0;
    totalSeconds += data.days[k].seconds;
    totalChars += data.days[k].chars;
    totalWatchSeconds += data.days[k].watchSeconds ?? 0;
    totalListenSeconds += data.days[k].listenSeconds ?? 0;
    totalReviews += data.days[k].reviews ?? 0;
    totalReviewsPassed += data.days[k].reviewsPassed ?? 0;
  }

  const todayK = dayKey(new Date());
  const today = data.days[todayK] ?? { seconds: 0, chars: 0 };

  const recent: DayStat[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const e = data.days[k] ?? { seconds: 0, chars: 0 };
    recent.push({
      date: k,
      seconds: e.seconds,
      chars: e.chars,
      watchSeconds: e.watchSeconds ?? 0,
      reviews: e.reviews ?? 0,
      reviewsPassed: e.reviewsPassed ?? 0,
      studySeconds: e.studySeconds ?? 0,
      mediaMined: dayCount(e.mediaMined),
      linesStudied: dayCount(e.linesStudied),
    });
  }
  const week = recent.slice(-7);
  const weekMediaMined = week.reduce((sum, d) => sum + (d.mediaMined ?? 0), 0);
  const weekLinesStudied = week.reduce((sum, d) => sum + (d.linesStudied ?? 0), 0);

  const books: BookStat[] = Object.entries(data.books)
    .map(([id, b]) => ({ id, title: b.title, seconds: b.seconds, chars: b.chars, lastRead: b.lastRead }))
    .sort((a, b) => b.lastRead - a.lastRead);

  const shows: ShowStat[] = Object.entries(data.shows)
    .map(([id, s]) => ({ id, title: s.title, seconds: s.seconds, lastWatched: s.lastWatched }))
    .sort((a, b) => b.lastWatched - a.lastWatched);

  return {
    totalSeconds,
    totalChars,
    totalWatchSeconds,
    daysActive: dayKeys.filter((k) => dayIsActive(data.days[k])).length,
    streak: computeStreak(data.days, getRestDayEnabled()),
    todaySeconds: today.seconds,
    todayChars: today.chars,
    todayWatchSeconds: today.watchSeconds ?? 0,
    todayListenSeconds: today.listenSeconds ?? 0,
    totalListenSeconds,
    todayStudySeconds: today.studySeconds ?? 0,
    totalStudySeconds,
    todayReviews: today.reviews ?? 0,
    totalReviews,
    totalReviewsPassed,
    todayMediaMined: dayCount(today.mediaMined),
    weekMediaMined,
    totalMediaMined,
    todayLinesStudied: dayCount(today.linesStudied),
    weekLinesStudied,
    totalLinesStudied,
    recent,
    books,
    shows,
  };
}

/**
 * Just the `shows` tally, for surfaces that only need what a file is *called*.
 *
 * `getSummary()` would answer this too, but it also walks fourteen days, recomputes the
 * streak and sorts the book list — and the continue-watching palette group has to build
 * itself in the single tick the palette opens. This is the same read without that work.
 *
 * Sorted most-recently-watched first, matching `getSummary().shows`, so a consumer that
 * later switches between the two sees the same order.
 */
export function getWatchedShowTitles(): ShowStat[] {
  const data = load();
  return Object.entries(data.shows)
    .map(([id, s]) => ({ id, title: s.title, seconds: s.seconds, lastWatched: s.lastWatched }))
    .sort((a, b) => b.lastWatched - a.lastWatched);
}

export interface DayMediaActivity {
  watchSeconds: number;
  mediaMined: number;
  linesStudied: number;
  studySeconds: number;
}

/**
 * Player activity per day (YYYY-MM-DD), only for days that have any — watch time,
 * cards mined from video, lines studied and study-mode seconds. One storage read,
 * for the calendar's month grid.
 */
export function getMediaActivityByDay(): Record<string, DayMediaActivity> {
  const out: Record<string, DayMediaActivity> = {};
  for (const [key, e] of Object.entries(load().days)) {
    if (!e || typeof e !== 'object') continue;
    const watchSeconds = Math.max(0, Number(e.watchSeconds) || 0);
    const mediaMined = dayCount(e.mediaMined);
    const linesStudied = dayCount(e.linesStudied);
    const studySeconds = Math.max(0, Number(e.studySeconds) || 0);
    if (watchSeconds > 0 || mediaMined > 0 || linesStudied > 0) {
      out[key] = { watchSeconds, mediaMined, linesStudied, studySeconds };
    }
  }
  return out;
}

/**
 * Every recorded day's time and counts (YYYY-MM-DD), one storage read: the Statistics
 * year heatmap and the Calendar's per-day study line (`shared/studyActivityHeatmap.ts`).
 */
export function getStudyDaysByKey(): Record<string, StudyDayRaw> {
  const out: Record<string, StudyDayRaw> = {};
  for (const [key, e] of Object.entries(load().days)) {
    if (!e || typeof e !== 'object') continue;
    out[key] = {
      seconds: e.seconds,
      watchSeconds: e.watchSeconds,
      listenSeconds: e.listenSeconds,
      studySeconds: e.studySeconds,
      reviews: e.reviews,
      mediaMined: dayCount(e.mediaMined),
    };
  }
  return out;
}

/**
 * One day's whole entry — totals, review and practice tallies, and the per-book and per-show
 * reading/watching — for the Calendar's day view (`shared/calendarDayDetail.ts`). Null for a
 * day with nothing recorded.
 */
export function getStudyDayActivity(key: string): StudyDayActivity | null {
  const e = load().days[key];
  if (!e || typeof e !== 'object') return null;
  return {
    seconds: e.seconds,
    chars: e.chars,
    watchSeconds: e.watchSeconds,
    listenSeconds: e.listenSeconds,
    studySeconds: e.studySeconds,
    reviews: e.reviews,
    reviewsPassed: e.reviewsPassed,
    practice: e.practice,
    practiceCorrect: e.practiceCorrect,
    mediaMined: dayCount(e.mediaMined),
    linesStudied: dayCount(e.linesStudied),
    ...(e.books && typeof e.books === 'object' ? { books: e.books } : {}),
    ...(e.shows && typeof e.shows === 'object' ? { shows: e.shows } : {}),
  };
}

/** Every day (YYYY-MM-DD) that counts as studied for the streak, as `computeStreak` judges it. */
export function getActiveStudyDates(): Set<string> {
  const days = load().days;
  return new Set(Object.keys(days).filter((key) => dayIsActive(days[key])));
}

export function getSyncPayload(): StatsSyncPayload {
  const data = load();
  const key = todayDayKey();
  const today = data.days[key] ?? { seconds: 0, chars: 0 };
  return {
    dayKey: key,
    todayChars: today.chars,
    streak: computeStreak(data.days, getRestDayEnabled()),
  };
}

/**
 * Clear every recorded day, book and show for the **current study language**.
 *
 * Was `localStorage.removeItem(KEY)` against a `KEY` that does not exist in this module —
 * a `ReferenceError` swallowed by the `catch`, so the Statistics tab's Reset button had
 * been a silent no-op. It also predates the per-language split: the live key is
 * `statsKey()`, and clearing the legacy one would have missed every language.
 */
export function resetStats(): void {
  try {
    localStorage.removeItem(statsKey());
    window.dispatchEvent(new CustomEvent(STATS_RESET_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * "1h 23m", "12m", "45s" — compact human duration, in the interface language.
 *
 * The unit letters used to be `s`/`m`/`h` literals, so a Russian tooltip read
 * `чтение 20m` and a Japanese one `読書20m` (D155). They now come from
 * `stats.duration.{s,m,hm}`, following `vnPanel.duration.*`: the abbreviated
 * unit is invariant in all four languages, so no CLDR plural arm is needed —
 * Russian writes `20 мин` for every count.
 *
 * Reads the language rather than taking it as an argument, for the same reason
 * `formatNumber` below does: ~25 call sites across Statistics, Blanc and the
 * scraper pages, every one of which already re-renders on a language switch.
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return t('stats.duration.s', { seconds: s });
  const m = Math.floor(s / 60);
  if (m < 60) return t('stats.duration.m', { minutes: m });
  const h = Math.floor(m / 60);
  return t('stats.duration.hm', { hours: h, minutes: m % 60 });
}

/**
 * "12,345" grouped thousands — grouped the way the interface language groups
 * them, so Russian reads `13 200` rather than the `13,200` a pinned `'en-US'`
 * produced on every surface (D211).
 *
 * Reads the language rather than taking it as an argument: these are ~60 call
 * sites across widgets, scraper panels and both shells, and every one of them
 * already re-renders on a language switch through `useT()`.
 */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString(LANG_TAGS[getUiLang()]);
}
