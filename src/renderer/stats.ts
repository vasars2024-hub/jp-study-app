// Reading statistics, stored in localStorage. We track, per calendar day, how
// many seconds were spent reading and (approximately) how many characters were
// read, plus a per-book tally. The Statistics tab turns this into totals, a
// day-streak, and a simple recent-days chart. Everything is local + offline.

import type { ArenaMistake, GameId, SourceLang } from './games/types';
import type { LevelTier } from '../shared/levelScale';
import { getStudyLang, type StudyLang } from './studyEnvironment';

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
}
interface BookEntry {
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
interface StatsData {
  days: Record<string, DayEntry>; // key = YYYY-MM-DD (local)
  books: Record<string, BookEntry>; // key = library item id
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
export const GAME_PROGRESS_EVENT = 'jp-game-progress-changed';

export interface ReadingDelta {
  bookId: string;
  title: string;
  seconds: number;
  chars: number;
}

export interface DayStat {
  date: string; // YYYY-MM-DD
  seconds: number;
  chars: number;
}
export interface BookStat {
  id: string;
  title: string;
  seconds: number;
  chars: number;
  lastRead: number;
}
export interface StatsSummary {
  totalSeconds: number;
  totalChars: number;
  daysActive: number;
  streak: number; // consecutive days ending today (or yesterday)
  todaySeconds: number;
  todayChars: number;
  recent: DayStat[]; // last 14 days, oldest → newest (includes empty days)
  books: BookStat[]; // most-recently-read first
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
    if (!raw) return { days: {}, books: {} };
    const parsed = JSON.parse(raw) as Partial<StatsData>;
    return { days: parsed.days ?? {}, books: parsed.books ?? {} };
  } catch {
    return { days: {}, books: {} };
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

/** Consecutive days (ending today or yesterday) that have any reading time. */
function computeStreak(days: Record<string, DayEntry>): number {
  let streak = 0;
  const cursor = new Date();
  // Allow the streak to "end" yesterday if nothing's been read yet today.
  if (!days[dayKey(cursor)]) cursor.setDate(cursor.getDate() - 1);
  for (;;) {
    const e = days[dayKey(cursor)];
    if (e && e.seconds > 0) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}

export function getSummary(): StatsSummary {
  const data = load();
  const dayKeys = Object.keys(data.days);

  let totalSeconds = 0;
  let totalChars = 0;
  for (const k of dayKeys) {
    totalSeconds += data.days[k].seconds;
    totalChars += data.days[k].chars;
  }

  const todayK = dayKey(new Date());
  const today = data.days[todayK] ?? { seconds: 0, chars: 0 };

  const recent: DayStat[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const k = dayKey(d);
    const e = data.days[k] ?? { seconds: 0, chars: 0 };
    recent.push({ date: k, seconds: e.seconds, chars: e.chars });
  }

  const books: BookStat[] = Object.entries(data.books)
    .map(([id, b]) => ({ id, title: b.title, seconds: b.seconds, chars: b.chars, lastRead: b.lastRead }))
    .sort((a, b) => b.lastRead - a.lastRead);

  return {
    totalSeconds,
    totalChars,
    daysActive: dayKeys.filter((k) => data.days[k].seconds > 0).length,
    streak: computeStreak(data.days),
    todaySeconds: today.seconds,
    todayChars: today.chars,
    recent,
    books,
  };
}

export function getSyncPayload(): StatsSyncPayload {
  const data = load();
  const key = todayDayKey();
  const today = data.days[key] ?? { seconds: 0, chars: 0 };
  return {
    dayKey: key,
    todayChars: today.chars,
    streak: computeStreak(data.days),
  };
}

export function resetStats(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** "1h 23m", "12m", "45s" — compact human duration. */
export function formatDuration(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

/** "12,345" grouped thousands. */
export function formatNumber(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
