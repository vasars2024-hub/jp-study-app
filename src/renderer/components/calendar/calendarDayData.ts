/**
 * The Calendar day view's data and its ways back to the source.
 *
 * `shared/calendarDayDetail.ts` folds the stores into a day; this module reads those stores
 * (and keeps the read current), and owns every "take me there" the panel offers: the deck
 * narrowed to the day's cards, a book in the reader, a mined line in the player, a game in
 * the Arena, a review sitting brought forward, and a reminder on the day. Each one reuses the
 * owner's own hand-off rather than inventing a new route.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  buildCalendarDayDetail,
  streakRunDates,
  type CalendarDayDetail,
  type DayGameResult,
  type DayScene,
} from '../../../shared/calendarDayDetail';
import { daysFromToday, dueByDate } from '../../../shared/studyActivityHeatmap';
import { localDueForecast } from '../../../shared/reviewForecast';
import type { ReviewLogEntry } from '../../../shared/reviewLog';
import { READING_WORKSPACE_SCHEMA_VERSION } from '../../../shared/readingWorkspace';
import { continueWatchingPathFromKey } from '../../../shared/seanimeContinueWatching';
import {
  GAME_PROGRESS_EVENT,
  getActiveStudyDates,
  getStreakRestDates,
  getStudyDayActivity,
  loadGameProgress,
  onStatsChanged,
} from '../../stats';
import { loadDeck, onDeckChanged } from '../../flashcardDeck';
import { loadReviewLog, onReviewLogChanged } from '../../reviewLog';
import { openInAdoptedPlayer, openSceneAt, readMiningHistory, recentMinedScenes } from '../../sceneRoundTrip';
import { requestFlashcardsFocus } from '../../openIntents';
import { SECTION_OPEN_EVENT, openSectionSurface } from '../../sectionSurface';
import { addEvent, CATEGORY_COLORS, deleteEvent, loadEvents, type CalendarEvent } from '../../calendar';
import { writeLocalStorage } from '../../localStorageWrite';
import { requestArenaGame } from '../../games/arenaIntent';
import type { GameId } from '../../games/types';

/** Days of schedule the day view reads ahead: the month grid's six weeks, and a year view's horizon. */
const FORECAST_HORIZON_DAYS = 400;
/** Every mined scene the history and deck can name; the day filter narrows it. */
const SCENE_LIMIT = 2000;

/** Re-render when any store the day reads changes. */
function useDayStoresVersion(): number {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = (): void => setVersion((v) => v + 1);
    const offStats = onStatsChanged(bump);
    const offDeck = onDeckChanged(bump);
    const offLog = onReviewLogChanged(bump);
    window.addEventListener(GAME_PROGRESS_EVENT, bump);
    return () => {
      offStats();
      offDeck();
      offLog();
      window.removeEventListener(GAME_PROGRESS_EVENT, bump);
    };
  }, []);
  return version;
}

/** The review log, loaded once and kept current (IndexedDB, so it arrives after first paint). */
function useReviewLogRows(version: number): readonly ReviewLogEntry[] {
  const [rows, setRows] = useState<readonly ReviewLogEntry[]>([]);
  useEffect(() => {
    let alive = true;
    void loadReviewLog()
      .then((entries) => {
        if (alive) setRows(entries.slice());
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [version]);
  return rows;
}

function recentGames(): DayGameResult[] {
  return loadGameProgress().recent.map((entry) => ({
    id: entry.id,
    gameId: entry.gameId,
    score: entry.score,
    accuracy: entry.accuracy,
    mistakes: entry.mistakes.length,
    createdAt: entry.createdAt,
  }));
}

function minedScenes(): DayScene[] {
  try {
    return recentMinedScenes(loadDeck(), readMiningHistory(), SCENE_LIMIT);
  } catch {
    return [];
  }
}

/** Everything the day panel shows, current as the stores change. */
export function useCalendarDayDetail(dateKey: string): CalendarDayDetail {
  const version = useDayStoresVersion();
  const reviewLog = useReviewLogRows(version);
  return useMemo(() => {
    const now = new Date();
    const deck = loadDeck();
    const horizon = Math.min(FORECAST_HORIZON_DAYS, Math.max(42, daysFromToday(dateKey, now) + 1));
    const restDates = getStreakRestDates();
    return buildCalendarDayDetail({
      dateKey,
      now,
      day: getStudyDayActivity(dateKey),
      reviewLog,
      deck,
      games: recentGames(),
      scenes: minedScenes(),
      dueByDay: dueByDate(localDueForecast(deck, horizon, now.getTime()), now),
      streakDates: new Set(streakRunDates(getActiveStudyDates(), restDates, now)),
      restDates,
    });
    // `version` is the change signal for every synchronous store read above.
  }, [dateKey, reviewLog, version]);
}

/** The month's day details, for the month export. Synchronous stores plus the given log rows. */
export function monthDayDetails(
  dateKeys: readonly string[],
  reviewLog: readonly ReviewLogEntry[],
  now = new Date(),
): CalendarDayDetail[] {
  const deck = loadDeck();
  const games = recentGames();
  const scenes = minedScenes();
  const restDates = getStreakRestDates();
  const streakDates = new Set(streakRunDates(getActiveStudyDates(), restDates, now));
  const dueByDay = dueByDate(localDueForecast(deck, 42, now.getTime()), now);
  return dateKeys.map((dateKey) => buildCalendarDayDetail({
    dateKey,
    now,
    day: getStudyDayActivity(dateKey),
    reviewLog,
    deck,
    games,
    scenes,
    dueByDay,
    streakDates,
    restDates,
  }));
}

/** The current streak's dates and the rest days in it, for the month grid's markers. */
export function useStreakMarkers(version: number): { streak: ReadonlySet<string>; rest: ReadonlySet<string> } {
  return useMemo(() => {
    const rest = getStreakRestDates();
    return { streak: new Set(streakRunDates(getActiveStudyDates(), rest, new Date())), rest };
    // `version` is the stats store's change signal.
  }, [version]);
}

/* ------------------------------------------------------------------ *
 * The ways back.
 * ------------------------------------------------------------------ */

export type DeckDayFilter = 'added' | 'reviewed';

/** The deck, narrowed to the cards added (or last reviewed) on the day. */
export function openDeckForDay(dateKey: string, kind: DeckDayFilter): void {
  requestFlashcardsFocus({ folder: null, cardId: null, search: `${kind}:${dateKey}` });
}

/** A review sitting over the cards due by the end of the day, started now. */
export function studyAheadUntil(dateKey: string): void {
  requestFlashcardsFocus({ folder: null, cardId: null, review: 'ahead', aheadUntil: dateKey });
}

/** Today's due cards: the deck's own review, as the Flashcards window opens it. */
export function openTodaysReviews(): void {
  openSectionSurface('flashcards');
}

/**
 * A book in the reader, where it was left. The Library takes a Reading-workspace route with
 * `intent: 'open'` (the Files app sends the same one); without a desktop shell to claim it
 * the Library still opens, one click short of the book.
 */
export function openBookFromCalendar(itemId: string): void {
  const claimed = !window.dispatchEvent(
    new CustomEvent(SECTION_OPEN_EVENT, {
      detail: { version: READING_WORKSPACE_SCHEMA_VERSION, section: 'library', intent: 'open', itemId },
      cancelable: true,
    }),
  );
  if (!claimed) openSectionSurface('library');
}

/** The file behind a watched-show key, when it is a local file the player can reopen. */
export function showFilePath(showKey: string): string {
  return continueWatchingPathFromKey(showKey);
}

/** Reopen a watched file at the player's own resume point. */
export function resumeShowFromCalendar(showKey: string, notify?: (message: string) => void): void {
  const path = showFilePath(showKey);
  if (path) void openInAdoptedPlayer(path, undefined, notify);
}

/** A mined line, with the shared run-up. */
export function playSceneFromCalendar(scene: DayScene, notify?: (message: string) => void): void {
  void openSceneAt(scene, notify);
}

/** The Arena, on that game (a one-shot handoff, so a cold Arena still lands on it). */
export function openGameFromCalendar(gameId: GameId): void {
  requestArenaGame({ gameId });
}

/* ------------------------------------------------------------------ *
 * Study reminders — ordinary calendar events, so the existing reminder scheduler (which runs
 * in the primary window, tray included, and raises a system notification when the window is
 * not focused) delivers them. Nothing here schedules anything itself.
 * ------------------------------------------------------------------ */

const STUDY_REMINDER_ID_KEY = 'jp-calendar-study-reminder-id';
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** `HH:MM` plus `minutes`, clamped to the same day. */
export function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = Math.min(23 * 60 + 59, Math.max(0, h * 60 + m + minutes));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** The event a study reminder is: a timed reminder that notifies at its start. */
export function studyReminderEvent(input: {
  dateKey: string;
  time: string;
  title: string;
  daily: boolean;
}): Omit<CalendarEvent, 'id' | 'createdAt'> {
  const time = TIME.test(input.time) ? input.time : '09:00';
  return {
    title: input.title,
    date: input.dateKey,
    startTime: time,
    endTime: addMinutesToTime(time, 15),
    allDay: false,
    color: CATEGORY_COLORS.reminder,
    category: 'reminder',
    reminder: 'at',
    recurrence: input.daily ? 'daily' : 'none',
  };
}

/** A one-off reminder on the day. */
export function addDayStudyReminder(dateKey: string, time: string, title: string): CalendarEvent {
  return addEvent(studyReminderEvent({ dateKey, time, title, daily: false }));
}

/** The daily study reminder this view created, when it still exists. */
export function currentDailyStudyReminder(): CalendarEvent | null {
  let id: string | null = null;
  try {
    id = localStorage.getItem(STUDY_REMINDER_ID_KEY);
  } catch {
    id = null;
  }
  if (!id) return null;
  return loadEvents().find((event) => event.id === id && event.recurrence === 'daily') ?? null;
}

/** Turn the daily study reminder on at `time` (replacing an earlier one) from `dateKey`. */
export function setDailyStudyReminder(dateKey: string, time: string, title: string): CalendarEvent {
  const existing = currentDailyStudyReminder();
  if (existing) deleteEvent(existing.id);
  const created = addEvent(studyReminderEvent({ dateKey, time, title, daily: true }));
  writeLocalStorage(STUDY_REMINDER_ID_KEY, created.id);
  return created;
}

export function clearDailyStudyReminder(): void {
  const existing = currentDailyStudyReminder();
  if (existing) deleteEvent(existing.id);
  try {
    localStorage.removeItem(STUDY_REMINDER_ID_KEY);
  } catch {
    /* storage unavailable: the event is gone either way */
  }
}

/* ------------------------------------------------------------------ *
 * Export.
 * ------------------------------------------------------------------ */

/** Save `text` as a Markdown file through the browser's download path. */
export function saveMarkdownFile(fileName: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Copy to the clipboard; false when the clipboard refused. */
export async function copySummaryText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
