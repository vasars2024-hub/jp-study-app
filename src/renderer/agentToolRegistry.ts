import {
  AGENT_TOOL_OPERATIONS,
  type AgentToolHandlers,
  type AgentToolOperationDefinition,
  type AgentToolOperationId,
} from '../shared/localAgent';
import type { TVars } from '../shared/i18n/core';
import { searchAgentKnowledge } from '../shared/localAgentKnowledge';
import { DEFAULT_LOCAL_AGENT_SETTINGS, type LocalAgentSettings } from '../shared/localAgentSettings';
import { presetById, sanitizeThemeOverrides } from '../shared/blancTheme';
import { sanitizeCustomCss } from '../shared/blancCustomCss';
import { loadLocalAgentMemory } from './localAgentMemoryStore';
import { loadLocalAgentSettings, saveLocalAgentSettings } from './localAgentSettingsStore';
import { mineAgentCards } from './studyMiningRoutes';
import {
  createDeckFolder,
  deleteDeckFolder,
  dueDeckCards,
  knowledgeLemma,
  loadDeck,
  loadDeckFolders,
  removeDeckCards,
  updateDeckCard,
  type DeckFlashcard,
} from './flashcardDeck';
import {
  addEvent,
  CATEGORY_COLORS,
  deleteEvent,
  detachOccurrence,
  expandOccurrences,
  isCalendarDateKey,
  loadEvents,
  normalizeClockTime,
  normalizeRecurrenceInterval,
  parseDateKey,
  REMINDER_OFFSETS,
  rescheduleEventPatch,
  shiftDateKey,
  toDateKey,
  updateEvent,
  type CalendarEvent,
  type EventCategory,
  type RecurrenceFreq,
  type ReminderOffset,
} from './calendar';
import { getSummary } from './stats';
import { getStudyLang } from './studyEnvironment';
import { getLevel, knowledgeCounts, WK_LEVELS } from './knownWords';
import { buildLocalAgentKnowledgeSnapshot } from './localAgentKnowledge';
import { applyBlancTheme } from './blancThemeApply';
import { applyBlancCustomCss } from './blancCustomCssApply';
import { loadToolboxSettings, saveToolboxSettings } from './toolboxSettings';
import { recordBlancThemeHistory, undoBlancThemeHistory } from './blancThemeHistoryStore';
import {
  agentThemeTargetsBlanc,
  applyAppTheme,
  previewAppTheme,
  refuseAppCustomCss,
  resetAppTheme,
  undoAppTheme,
} from './agentAppThemeTools';
import { createStudyAgentHandlers } from './studyAgentHandlers';
import { createVisualNovelAgentHandlers } from './visualNovelAgentHandlers';
import { createMediaAgentHandlers } from './mediaAgentHandlers';
import { createAnimeAgentHandlers } from './animeAgentHandlers';
import { createCardStudioAgentHandlers } from './cardStudioAgentHandlers';
import { createStudyCoachAgentHandlers } from './studyCoachAgentHandlers';

export type AgentToolRegistryTranslate = (key: string, vars?: TVars) => string;

export type AgentToolUnavailableReason =
  | 'adapter-not-implemented'
  | 'dedicated-analysis-required'
  | 'false-success-stub-removed';

export type AgentToolCapability =
  | { definition: AgentToolOperationDefinition; available: true }
  | {
      definition: AgentToolOperationDefinition;
      available: false;
      reason: AgentToolUnavailableReason;
    };

const UNAVAILABLE: Readonly<Partial<Record<AgentToolOperationId, AgentToolUnavailableReason>>> = {
  'flashcard.schedule-reviews': 'false-success-stub-removed',
};

function textArgument(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: string,
): string {
  const value = arguments_[name];
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(t('blanc.agent.error.needsArgument', { name }));
  }
  return value.trim().slice(0, 500);
}

function safeCardPatch(t: AgentToolRegistryTranslate, value: unknown): Partial<DeckFlashcard> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(t('blanc.agent.error.cardPatchObject'));
  }
  const raw = value as Record<string, unknown>;
  const patch: Partial<DeckFlashcard> = {};
  for (const key of [
    'word',
    'reading',
    'meaning',
    'sentence',
    'front',
    'back',
    'folder',
    'jlptLevel',
    'sceneReference',
  ]) {
    if (typeof raw[key] === 'string') patch[key as keyof DeckFlashcard] = raw[key] as never;
  }
  return patch;
}

/**
 * The reminder offset an agent asked for. A reminder that never notifies is
 * not a reminder, so `calendar.create-reminder` defaults to "at the time";
 * a study session defaults to no notification, as the Calendar's own form does.
 */
export function agentReminderOffset(value: unknown, fallback: ReminderOffset): ReminderOffset {
  return typeof value === 'string' && (REMINDER_OFFSETS as readonly string[]).includes(value)
    ? (value as ReminderOffset)
    : fallback;
}

/** An optional `HH:MM` argument: absent is fine, present-but-unreadable is refused. */
function optionalClock(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  name: 'startTime' | 'endTime',
): string | undefined {
  const value = arguments_[name];
  if (value === undefined || value === null || value === '') return undefined;
  const clock = normalizeClockTime(value);
  if (!clock) throw new Error(t('planner.agent.error.time', { name }));
  return clock;
}

const AGENT_EVENT_CATEGORIES: readonly EventCategory[] = ['study', 'exam', 'assignment', 'reminder', 'personal'];
const AGENT_RECURRENCES: readonly RecurrenceFreq[] = ['none', 'daily', 'weekly', 'monthly', 'custom'];

/**
 * What an agent asked to put on the calendar, held to the same rules as the Calendar's own
 * form: a real date (`2026-02-31` is refused, not stored), zero-padded times so the agenda
 * sorts, an end that is not before its start, and a repeat that does not end before it
 * begins. A bad argument is an error the model sees, never an event that silently vanishes
 * from every view.
 */
function safeCalendarEntry(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  defaultReminder: ReminderOffset = 'none',
): Omit<CalendarEvent, 'id' | 'createdAt'> {
  const date = textArgument(t, arguments_, 'date');
  if (!isCalendarDateKey(date)) {
    throw new Error(t('blanc.agent.error.calendarDate'));
  }
  const startTime = optionalClock(t, arguments_, 'startTime');
  const endTime = optionalClock(t, arguments_, 'endTime');
  const allDay = arguments_.allDay === true || !startTime;
  if (!allDay && startTime && endTime && endTime < startTime) {
    throw new Error(t('planner.agent.error.endBeforeStart'));
  }
  const category = AGENT_EVENT_CATEGORIES.includes(arguments_.category as EventCategory)
    ? arguments_.category as EventCategory
    : 'study';
  const recurrence = AGENT_RECURRENCES.includes(arguments_.recurrence as RecurrenceFreq)
    ? arguments_.recurrence as RecurrenceFreq
    : 'none';
  let recurrenceEndDate: string | undefined;
  if (recurrence !== 'none' && arguments_.recurrenceEndDate !== undefined && arguments_.recurrenceEndDate !== '') {
    if (!isCalendarDateKey(arguments_.recurrenceEndDate) || arguments_.recurrenceEndDate < date) {
      throw new Error(t('planner.agent.error.repeatEnd'));
    }
    recurrenceEndDate = arguments_.recurrenceEndDate;
  }
  return {
    title: textArgument(t, arguments_, 'title'),
    description: typeof arguments_.description === 'string'
      ? arguments_.description.slice(0, 500)
      : undefined,
    date,
    startTime: allDay ? undefined : startTime,
    endTime: allDay ? undefined : endTime,
    allDay,
    color: typeof arguments_.color === 'string' && /^#[0-9a-f]{6}$/i.test(arguments_.color)
      ? arguments_.color
      : CATEGORY_COLORS[category],
    category,
    reminder: agentReminderOffset(arguments_.reminder, defaultReminder),
    recurrence,
    ...(recurrence === 'custom'
      ? { recurrenceInterval: normalizeRecurrenceInterval(Number(arguments_.recurrenceInterval ?? 1)) }
      : {}),
    ...(recurrenceEndDate ? { recurrenceEndDate } : {}),
  };
}

/** The calendar's occurrences in a window (recurring events expanded), for `calendar.list`. */
function agentCalendarList(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const today = new Date();
  const fromKey = arguments_.from === undefined ? toDateKey(today) : arguments_.from;
  if (!isCalendarDateKey(fromKey)) throw new Error(t('blanc.agent.error.calendarDate'));
  const toKey = arguments_.to === undefined ? shiftDateKey(fromKey, 30) : arguments_.to;
  if (!isCalendarDateKey(toKey) || toKey < fromKey) throw new Error(t('blanc.agent.error.calendarDate'));
  // A year at most: the expansion is per day for daily events.
  const end = toKey > shiftDateKey(fromKey, 366) ? shiftDateKey(fromKey, 366) : toKey;
  const events = loadEvents();
  const occurrences = expandOccurrences(events, parseDateKey(fromKey), parseDateKey(end));
  const LIMIT = 200;
  return {
    from: fromKey,
    to: end,
    totalEvents: events.length,
    occurrences: occurrences.slice(0, LIMIT).map((o) => ({
      id: o.id,
      title: o.title,
      date: o.occurrenceDate,
      ...(o.allDay ? { allDay: true } : { startTime: o.startTime, endTime: o.endTime }),
      category: o.category,
      recurrence: o.recurrence,
      reminder: o.reminder,
    })),
    // Said, not silently cut: the model must know the list is partial.
    ...(occurrences.length > LIMIT ? { truncated: occurrences.length - LIMIT } : {}),
  };
}

/**
 * Where an event sits: the only fields a move changes, and all an Undo of one may restore.
 * Not a copy of the event — its title, notes and reminder are never captured or written back.
 */
interface CalendarPlacement {
  date: string;
  allDay: boolean;
  startTime?: string;
  endTime?: string;
  recurrenceEndDate?: string;
}

function placementOf(event: CalendarEvent): CalendarPlacement {
  return {
    date: event.date,
    allDay: Boolean(event.allDay),
    ...(event.startTime ? { startTime: event.startTime } : {}),
    ...(event.endTime ? { endTime: event.endTime } : {}),
    ...(event.recurrenceEndDate ? { recurrenceEndDate: event.recurrenceEndDate } : {}),
  };
}

function readPlacement(value: unknown): CalendarPlacement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isCalendarDateKey(raw.date) || typeof raw.allDay !== 'boolean') return null;
  const clockOrAbsent = (v: unknown) => v === undefined || normalizeClockTime(v) === v;
  if (!clockOrAbsent(raw.startTime) || !clockOrAbsent(raw.endTime)) return null;
  if (raw.recurrenceEndDate !== undefined && !isCalendarDateKey(raw.recurrenceEndDate)) return null;
  return {
    date: raw.date,
    allDay: raw.allDay,
    ...(typeof raw.startTime === 'string' ? { startTime: raw.startTime } : {}),
    ...(typeof raw.endTime === 'string' ? { endTime: raw.endTime } : {}),
    ...(typeof raw.recurrenceEndDate === 'string' ? { recurrenceEndDate: raw.recurrenceEndDate } : {}),
  };
}

const samePlacement = (a: CalendarPlacement, b: CalendarPlacement): boolean => (
  a.date === b.date && a.allDay === b.allDay && a.startTime === b.startTime
  && a.endTime === b.endTime && a.recurrenceEndDate === b.recurrenceEndDate
);

/**
 * The inverse of a move (Undo), carried in the same gated operation: `undo.restore` puts the
 * event back where it was, `undo.rejoin` folds a split-off occurrence back into its series.
 * Both refuse unless the event still sits exactly where the move put it (`undo.expect`), so
 * an Undo can never overwrite a change made since — by the user or by anything else.
 */
function agentUndoReschedule(
  t: AgentToolRegistryTranslate,
  id: string,
  undo: Record<string, unknown>,
): Record<string, unknown> {
  const event = loadEvents().find((candidate) => candidate.id === id);
  if (!event) throw new Error(t('planner.agent.error.eventNotFound'));
  const expect = readPlacement(undo.expect);
  if (!expect || !samePlacement(placementOf(event), expect)) throw new Error(t('planner.agent.error.movedSince'));
  if (undo.kind === 'rejoin') {
    const seriesId = typeof undo.seriesId === 'string' ? undo.seriesId : '';
    const series = loadEvents().find((candidate) => candidate.id === seriesId);
    if (!series || !isCalendarDateKey(undo.occurrenceDate)) throw new Error(t('planner.agent.error.eventNotFound'));
    const occurrenceDate = undo.occurrenceDate;
    const excludedDates = (series.excludedDates ?? []).filter((key) => key !== occurrenceDate);
    updateEvent(seriesId, { excludedDates: excludedDates.length ? excludedDates : undefined });
    deleteEvent(id);
    return { id: seriesId, rejoined: id, occurrenceDate };
  }
  const restore = readPlacement(undo.restore);
  if (undo.kind !== 'restore' || !restore) throw new Error(t('blanc.agent.error.needsArgument', { name: 'undo' }));
  updateEvent(id, {
    date: restore.date,
    allDay: restore.allDay,
    startTime: restore.startTime,
    endTime: restore.endTime,
    recurrenceEndDate: restore.recurrenceEndDate,
  });
  return { id, restored: restore };
}

/** Move an event (a repeating one moves as a series) and optionally change its times. */
function agentRescheduleEvent(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
  const id = textArgument(t, arguments_, 'id');
  if (arguments_.undo && typeof arguments_.undo === 'object' && !Array.isArray(arguments_.undo)) {
    return agentUndoReschedule(t, id, arguments_.undo as Record<string, unknown>);
  }
  const event = loadEvents().find((candidate) => candidate.id === id);
  if (!event) throw new Error(t('planner.agent.error.eventNotFound'));
  const date = textArgument(t, arguments_, 'date');
  if (!isCalendarDateKey(date)) throw new Error(t('blanc.agent.error.calendarDate'));
  // The occurrence being moved: a repeating event's named one, else its first date.
  const from = isCalendarDateKey(arguments_.occurrenceDate) ? arguments_.occurrenceDate : event.date;
  const startTime = optionalClock(t, arguments_, 'startTime');
  const endTime = optionalClock(t, arguments_, 'endTime');
  const nextStart = startTime ?? event.startTime;
  const nextEnd = endTime ?? event.endTime;
  if (!event.allDay && nextStart && nextEnd && nextEnd < nextStart) {
    throw new Error(t('planner.agent.error.endBeforeStart'));
  }
  const times: Partial<CalendarEvent> = {
    ...(startTime ? { startTime, allDay: false } : {}),
    ...(endTime ? { endTime } : {}),
  };
  // One date of a repeating event: split it off as its own event, the series keeps the rest.
  if (event.recurrence !== 'none' && arguments_.onlyThisOccurrence === true) {
    if (!isCalendarDateKey(arguments_.occurrenceDate)) {
      throw new Error(t('blanc.agent.error.needsArgument', { name: 'occurrenceDate' }));
    }
    const split = detachOccurrence(event, arguments_.occurrenceDate, date);
    if (!split) throw new Error(t('blanc.agent.error.calendarDate'));
    updateEvent(id, split.seriesPatch);
    const single = addEvent({ ...split.single, ...times });
    return {
      id: single.id,
      seriesId: id,
      event: single,
      movedSeries: false,
      // What Undo needs: fold the occurrence back in, if it is still where this put it.
      undo: { kind: 'rejoin', seriesId: id, occurrenceDate: arguments_.occurrenceDate, expect: placementOf(single) },
    };
  }
  const patch: Partial<CalendarEvent> = { ...(rescheduleEventPatch(event, from, date) ?? {}), ...times };
  if (!Object.keys(patch).length) return { id, unchanged: true };
  updateEvent(id, patch);
  const next = loadEvents().find((candidate) => candidate.id === id);
  return {
    id,
    event: next,
    movedSeries: event.recurrence !== 'none',
    ...(next ? { undo: { kind: 'restore', restore: placementOf(event), expect: placementOf(next) } } : {}),
  };
}

/** Compact, read-only study statistics for the agent (no per-book titles beyond the top five). */
function agentStatsSummary(): Record<string, unknown> {
  const summary = getSummary();
  const counts = knowledgeCounts();
  return {
    streak: summary.streak,
    daysActive: summary.daysActive,
    today: {
      readingMinutes: Math.round(summary.todaySeconds / 60),
      charactersRead: summary.todayChars,
      watchMinutes: Math.round(summary.todayWatchSeconds / 60),
      studyMinutes: Math.round(summary.todayStudySeconds / 60),
      reviews: summary.todayReviews,
    },
    total: {
      readingMinutes: Math.round(summary.totalSeconds / 60),
      charactersRead: summary.totalChars,
      watchMinutes: Math.round(summary.totalWatchSeconds / 60),
      studyMinutes: Math.round(summary.totalStudySeconds / 60),
      reviews: summary.totalReviews,
      retention: summary.totalReviews > 0 ? Math.round((summary.totalReviewsPassed / summary.totalReviews) * 100) / 100 : null,
    },
    knownWords: { learning: counts[1], familiar: counts[2], known: counts[3] },
    cardsDue: dueDeckCards(loadDeck()).length,
    lastTwoWeeks: summary.recent.map((day) => ({
      date: day.date,
      readingMinutes: Math.round(day.seconds / 60),
      reviews: day.reviews,
    })),
    recentBooks: summary.books.slice(0, 5).map((book) => ({ title: book.title, charactersRead: book.chars })),
  };
}

/** Known-word counts, or one word's level (looked up by lemma, as the reader does). */
function agentKnownWords(arguments_: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const counts = knowledgeCounts();
  const base = { counts: { learning: counts[1], familiar: counts[2], known: counts[3] } };
  const raw = typeof arguments_.word === 'string' ? arguments_.word.trim().slice(0, 40) : '';
  if (!raw) return base;
  const lemma = knowledgeLemma(raw);
  const level = Math.max(getLevel(raw), getLevel(lemma));
  return { ...base, word: raw, lemma, level, levelName: WK_LEVELS[level] };
}

/**
 * The one installed adapter map for both Blanc and the first-class Agent.
 * Authorization remains in `runAgentTaskStep`; this module only answers the
 * separate question "does a real adapter exist?".
 */
export function createCentralAgentToolRegistry(t: AgentToolRegistryTranslate): AgentToolHandlers {
  const handlers: AgentToolHandlers = {
    ...createStudyAgentHandlers(),
    ...createVisualNovelAgentHandlers(t),
    ...createMediaAgentHandlers(t),
    ...createAnimeAgentHandlers(t),
    ...createCardStudioAgentHandlers(t),
    // The study coach: what to study now, cards from a text, grammar of a sentence, today's
    // mined words in a game, a week of sessions — each answer citing the data it read.
    ...createStudyCoachAgentHandlers(t),
    // In the STUDY language: without it a Chinese or Russian learner's lookup was routed by
    // guesswork. A miss is said outright (`found: false`) so the model never invents a gloss.
    'dictionary.lookup': async (arguments_) => {
      const term = textArgument(t, arguments_, 'term');
      const limit = typeof arguments_.limit === 'number' && Number.isFinite(arguments_.limit)
        ? Math.min(10, Math.max(1, Math.trunc(arguments_.limit)))
        : 5;
      const result = await window.api.lookupTerm(term, limit, getStudyLang());
      const entries = Array.isArray(result?.entries) ? result.entries : [];
      return { ...result, term, found: entries.length > 0 };
    },
    'dictionary.search-knowledge': async (arguments_) => {
      const query = textArgument(t, arguments_, 'query');
      const [deck, media, library] = await Promise.all([
        Promise.resolve(loadDeck()),
        window.api.listMedia(),
        window.api.listLibrary(),
      ]);
      const snapshot = buildLocalAgentKnowledgeSnapshot({
        deck,
        media,
        library,
        calendar: loadEvents(),
        memory: loadLocalAgentMemory(),
      });
      return searchAgentKnowledge(snapshot, query, {
        limit: typeof arguments_.limit === 'number' ? arguments_.limit : 20,
      });
    },
    'flashcard.list-decks': () => ({ folders: loadDeckFolders(), cards: loadDeck().length }),
    'flashcard.create-deck': (arguments_) => {
      const name = textArgument(t, arguments_, 'name');
      const existed = loadDeckFolders().includes(name);
      const folders = createDeckFolder(name);
      return {
        folders,
        ...(!existed && folders.includes(name) ? { createdName: name } : {}),
      };
    },
    'flashcard.add-cards': async (arguments_) => {
      if (!Array.isArray(arguments_.cards) || arguments_.cards.length < 1) {
        throw new Error(t('blanc.agent.error.needsCards'));
      }
      const cards = arguments_.cards.slice(0, 50).map((raw) => {
        if (!raw || typeof raw !== 'object') throw new Error(t('blanc.agent.error.cardObject'));
        const card = raw as Record<string, unknown>;
        return {
          word: textArgument(t, card, 'word'),
          reading: typeof card.reading === 'string' ? card.reading.slice(0, 200) : '',
          meaning: typeof card.meaning === 'string' ? card.meaning.slice(0, 500) : '',
          sentence: typeof card.sentence === 'string' ? card.sentence.slice(0, 500) : undefined,
          folder: typeof card.folder === 'string' ? card.folder.slice(0, 120) : undefined,
        };
      });
      // Through mineToStudy: a card the deck already holds is found, not doubled,
      // and only the rows this call actually made are reported as created.
      const mined = await mineAgentCards(cards);
      return {
        cards: loadDeck().length,
        createdIds: mined.filter((result) => result.created).map((result) => result.card.id),
      };
    },
    'flashcard.delete-cards': (arguments_) => {
      if (!Array.isArray(arguments_.ids)) {
        throw new Error(t('blanc.agent.error.needsArgument', { name: 'ids' }));
      }
      const ids = [...new Set(arguments_.ids
        .filter((value): value is string => typeof value === 'string' && Boolean(value.trim()))
        .map((value) => value.trim()))].slice(0, 50);
      if (!ids.length) throw new Error(t('blanc.agent.error.needsArgument', { name: 'ids' }));
      const before = loadDeck();
      const existing = new Set(before.map((card) => card.id));
      if (ids.some((id) => !existing.has(id))) {
        throw new Error(t('blanc.agent.error.cardNotFound'));
      }
      return { cards: removeDeckCards(ids).length, removed: ids.length };
    },
    // Same honesty rule as delete: an unknown id or an empty patch is an error, not a
    // "modified" that changed nothing.
    'flashcard.modify-cards': (arguments_) => {
      const id = textArgument(t, arguments_, 'id');
      const patch = safeCardPatch(t, arguments_.patch);
      if (!Object.keys(patch).length) throw new Error(t('planner.agent.error.emptyPatch'));
      if (!loadDeck().some((card) => card.id === id)) throw new Error(t('blanc.agent.error.cardNotFound'));
      return { cards: updateDeckCard(id, patch).length, modified: id, fields: Object.keys(patch) };
    },
    'flashcard.delete-deck': (arguments_) => (
      deleteDeckFolder(textArgument(t, arguments_, 'name'))
    ),
    'calendar.list': (arguments_) => agentCalendarList(t, arguments_),
    'calendar.schedule-session': (arguments_) => addEvent(safeCalendarEntry(t, arguments_)),
    'calendar.create-reminder': (arguments_) => {
      const entry = safeCalendarEntry(t, arguments_, 'at');
      return addEvent({ ...entry, category: 'reminder', color: CATEGORY_COLORS.reminder });
    },
    'calendar.reschedule-event': (arguments_) => agentRescheduleEvent(t, arguments_),
    'study.stats-summary': () => agentStatsSummary(),
    'study.known-words': (arguments_) => agentKnownWords(arguments_),
    // Refused when the id names nothing: "deleted" for an event that never existed was a
    // false success the model then reported to the user.
    'calendar.delete-event': (arguments_) => {
      const id = textArgument(t, arguments_, 'id');
      if (!loadEvents().some((event) => event.id === id)) {
        throw new Error(t('planner.agent.error.eventNotFound'));
      }
      return { removed: id, events: deleteEvent(id).length };
    },
    'settings.read': () => loadLocalAgentSettings(),
    'settings.change-preference': (arguments_) => {
      const key = textArgument(t, arguments_, 'key') as keyof LocalAgentSettings;
      const allowed: Array<keyof LocalAgentSettings> = [
        'enabled',
        'modelFileName',
        'modelMode',
        'contextSize',
        'memoryLimitMb',
        'resourceMode',
        'cpuLimitPct',
        'gpuLimitPct',
        'maxConcurrentTasks',
        'backgroundProcessing',
        'permission',
        'memoryEnabled',
        'privacyMode',
        'debugMode',
      ];
      if (!allowed.includes(key)) throw new Error(t('blanc.agent.error.preferenceLocked'));
      return saveLocalAgentSettings({ [key]: arguments_.value } as Partial<LocalAgentSettings>);
    },
    'settings.configure-module': (arguments_) => {
      const key = textArgument(t, arguments_, 'key') as keyof LocalAgentSettings;
      if (!['enabled', 'memoryEnabled', 'privacyMode', 'debugMode'].includes(key)) {
        throw new Error(t('blanc.agent.error.moduleLocked'));
      }
      return saveLocalAgentSettings({ [key]: arguments_.value } as Partial<LocalAgentSettings>);
    },
    'settings.reset': () => saveLocalAgentSettings(DEFAULT_LOCAL_AGENT_SETTINGS),
    // Each theme tool acts on the shell it runs in: Blanc's toolbox theme inside
    // Blanc, the app theme (Study OS / Aero / Wired) everywhere else. They used
    // to style Blanc from every window and report success (audit A9).
    'settings.preview-theme': (arguments_) => {
      if (!agentThemeTargetsBlanc()) return previewAppTheme(arguments_, t);
      const current = loadToolboxSettings();
      const preset = typeof arguments_.preset === 'string' && presetById(arguments_.preset)
        ? arguments_.preset
        : current.themePreset;
      const overrides = sanitizeThemeOverrides(arguments_.overrides);
      applyBlancTheme(preset, overrides);
      return { preview: true, preset, overrides };
    },
    'settings.apply-theme': (arguments_) => {
      if (!agentThemeTargetsBlanc()) return applyAppTheme(arguments_, t);
      const current = loadToolboxSettings();
      const preset = typeof arguments_.preset === 'string' && presetById(arguments_.preset)
        ? arguments_.preset
        : current.themePreset;
      const overrides = sanitizeThemeOverrides(arguments_.overrides);
      recordBlancThemeHistory(current);
      const next = saveToolboxSettings({ themePreset: preset, themeOverrides: overrides });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { applied: true, preset: next.themePreset, overrides: next.themeOverrides };
    },
    'settings.reset-theme': () => {
      if (!agentThemeTargetsBlanc()) return resetAppTheme();
      recordBlancThemeHistory(loadToolboxSettings());
      const next = saveToolboxSettings({ themePreset: 'default', themeOverrides: {} });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { reset: true };
    },
    'settings.undo-theme': () => {
      if (!agentThemeTargetsBlanc()) return undoAppTheme(t);
      const previous = undoBlancThemeHistory();
      if (!previous) throw new Error(t('blanc.agent.error.noThemeHistory'));
      const next = saveToolboxSettings({
        themePreset: previous.preset,
        themeOverrides: previous.overrides,
      });
      applyBlancTheme(next.themePreset, next.themeOverrides);
      return { restored: true, preset: next.themePreset, overrides: next.themeOverrides };
    },
    'settings.preview-css': (arguments_) => {
      if (!agentThemeTargetsBlanc()) return refuseAppCustomCss(t);
      const css = sanitizeCustomCss(arguments_.css);
      applyBlancCustomCss(css);
      return { preview: true, characters: css.length };
    },
    'settings.apply-css': (arguments_) => {
      if (!agentThemeTargetsBlanc()) return refuseAppCustomCss(t);
      const css = sanitizeCustomCss(arguments_.css);
      const next = saveToolboxSettings({ customCss: css });
      applyBlancCustomCss(next.customCss);
      return { applied: true, characters: next.customCss.length };
    },
    'settings.reset-css': () => {
      if (!agentThemeTargetsBlanc()) return refuseAppCustomCss(t);
      const next = saveToolboxSettings({ customCss: '' });
      applyBlancCustomCss(next.customCss);
      return { reset: true };
    },
    'media.search': async (arguments_) => {
      const query = typeof arguments_.query === 'string'
        ? arguments_.query.toLocaleLowerCase().trim()
        : '';
      const items = await window.api.listMedia();
      return items.filter((item) => (
        !query || `${item.title} ${item.path}`.toLocaleLowerCase().includes(query)
      )).slice(0, 100);
    },
    'media.add-item': async (arguments_) => {
      if (!Array.isArray(arguments_.paths) || !arguments_.paths.length) {
        throw new Error(t('blanc.agent.error.needsPaths'));
      }
      const paths = arguments_.paths
        .filter((value): value is string => typeof value === 'string')
        .slice(0, 20);
      if (!paths.length) throw new Error(t('blanc.agent.error.noValidPaths'));
      return window.api.importPaths(paths);
    },
    'media.delete-item': (arguments_) => (
      window.api.removeMedia(textArgument(t, arguments_, 'id'))
    ),
  };
  return handlers;
}

export function agentToolCapabilityMatrix(
  handlers: AgentToolHandlers,
): AgentToolCapability[] {
  return AGENT_TOOL_OPERATIONS.map((definition) => {
    if (handlers[definition.id]) return { definition, available: true };
    const reason = UNAVAILABLE[definition.id];
    if (!reason) {
      throw new Error(`Agent operation ${definition.id} is neither installed nor classified.`);
    }
    return { definition, available: false, reason };
  });
}

export function availableAgentToolOperationIds(
  handlers: AgentToolHandlers,
): AgentToolOperationId[] {
  return agentToolCapabilityMatrix(handlers)
    .filter((entry): entry is Extract<AgentToolCapability, { available: true }> => entry.available)
    .map((entry) => entry.definition.id);
}
