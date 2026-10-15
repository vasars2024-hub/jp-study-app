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
  setDeckCardsDueAt,
  updateDeckCard,
  type DeckFlashcard,
} from './flashcardDeck';
import {
  addEvent,
  CATEGORY_COLORS,
  deleteEvent,
  detachOccurrence,
  expandOccurrences,
  daysBetweenKeys,
  eventSpanDays,
  isCalendarDateKey,
  loadEvents,
  normalizeClockTime,
  normalizeEventFields,
  nthOfDateKey,
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
  | 'dedicated-analysis-required';

export type AgentToolCapability =
  | { definition: AgentToolOperationDefinition; available: true }
  | {
      definition: AgentToolOperationDefinition;
      available: false;
      reason: AgentToolUnavailableReason;
    };

/**
 * Declared operations with no adapter in this build, and why. Empty since
 * `flashcard.schedule-reviews` got its adapter (`agentScheduleReviews`); a new declaration
 * without one must be classified here, or `agentToolCapabilityMatrix` throws.
 */
const UNAVAILABLE: Readonly<Partial<Record<AgentToolOperationId, AgentToolUnavailableReason>>> = {};

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
const AGENT_RECURRENCES: readonly RecurrenceFreq[] = ['none', 'daily', 'weekly', 'monthly', 'yearly', 'custom'];
/** `custom` counts days; `weekly` / `monthly` / `yearly` count weeks, months or years. */
const AGENT_CUSTOM_INTERVAL_MAX = 365;
const AGENT_EVERY_INTERVAL_MAX = 99;
/** The longest multi-day event the agent may make: a term, not an open-ended block. */
const AGENT_EVENT_SPAN_MAX_DAYS = 366;
const WEEKDAY_NAMES = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Absent, null and '' all mean "not given", which is what a model sends for an unused field. */
const notGiven = (value: unknown): boolean => value === undefined || value === null || value === '';

/** A whole number, or a string that is one (`"3"`), else NaN. */
function wholeNumber(value: unknown): number {
  const n = typeof value === 'string' && value.trim() ? Number(value) : value;
  return typeof n === 'number' && Number.isInteger(n) ? n : Number.NaN;
}

/** One weekday: 0 (Sunday) … 6 (Saturday), or its English name ('tue', 'Tuesday'); -1 otherwise. */
function weekdayNumber(value: unknown): number {
  if (typeof value === 'string' && /^[a-z]{3,9}$/i.test(value.trim())) {
    const name = value.trim().toLowerCase();
    const index = WEEKDAY_NAMES.indexOf(name.slice(0, 3) as typeof WEEKDAY_NAMES[number]);
    const full = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return index >= 0 && (name.length === 3 || full[index] === name) ? index : -1;
  }
  const n = wholeNumber(value);
  return n >= 0 && n <= 6 ? n : -1;
}

/**
 * The repeat rule an agent asked for, checked against what the Calendar can store: every
 * repeat the Calendar's own editor offers (yearly, every N weeks/months/years, several
 * weekdays, the Nth weekday of the month) and nothing it would silently reinterpret. A
 * present-but-wrong field is an error the model reads, never a rule quietly dropped: the old
 * `'none'` fallback for an unknown `recurrence` turned "yearly" into a one-off event that the
 * model then reported as a yearly one.
 */
function agentRepeatRule(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  date: string,
): Pick<CalendarEvent, 'recurrence' | 'recurrenceInterval' | 'recurrenceWeekdays' | 'recurrenceNth' | 'recurrenceEndDate'> {
  const raw = arguments_.recurrence;
  if (!notGiven(raw) && !AGENT_RECURRENCES.includes(raw as RecurrenceFreq)) {
    throw new Error(t('planner.agent.error.repeat'));
  }
  const recurrence = notGiven(raw) ? 'none' : raw as RecurrenceFreq;
  const counted = recurrence === 'custom' || recurrence === 'weekly' || recurrence === 'monthly' || recurrence === 'yearly';

  let recurrenceInterval: number | undefined;
  if (!notGiven(arguments_.recurrenceInterval)) {
    const every = wholeNumber(arguments_.recurrenceInterval);
    const max = recurrence === 'custom' ? AGENT_CUSTOM_INTERVAL_MAX : AGENT_EVERY_INTERVAL_MAX;
    // `1` is harmless on any repeat (it is the default); anything else must mean something.
    if (!(every >= 1 && every <= max) || (!counted && every !== 1)) {
      throw new Error(t('planner.agent.error.repeatInterval'));
    }
    if (counted) recurrenceInterval = every;
  } else if (recurrence === 'custom') {
    recurrenceInterval = 1;
  }

  let recurrenceWeekdays: number[] | undefined;
  if (!notGiven(arguments_.recurrenceWeekdays)) {
    const list = arguments_.recurrenceWeekdays;
    const days = Array.isArray(list) ? list.map(weekdayNumber) : [];
    // The first date is the first occurrence, so it must be one of the days. The Calendar
    // would otherwise add its weekday silently, and the series would gain a day nobody asked for.
    if (
      recurrence !== 'weekly' || !days.length || days.length > 7 || days.some((day) => day < 0)
      || !days.includes(parseDateKey(date).getDay())
    ) {
      throw new Error(t('planner.agent.error.repeatWeekdays'));
    }
    recurrenceWeekdays = [...new Set(days)].sort((a, b) => a - b);
  }

  let recurrenceNth: number | undefined;
  if (!notGiven(arguments_.recurrenceNth)) {
    const nth = wholeNumber(arguments_.recurrenceNth);
    const position = nthOfDateKey(date);
    // The weekday is the date's own, so the date must BE that weekday of its month.
    const matches = nth === -1 ? position.last : nth >= 1 && nth <= 5 && position.nth === nth;
    if ((recurrence !== 'monthly' && recurrence !== 'yearly') || !matches) {
      throw new Error(t('planner.agent.error.repeatNth'));
    }
    recurrenceNth = nth;
  }

  let recurrenceEndDate: string | undefined;
  if (recurrence !== 'none' && !notGiven(arguments_.recurrenceEndDate)) {
    if (!isCalendarDateKey(arguments_.recurrenceEndDate) || arguments_.recurrenceEndDate < date) {
      throw new Error(t('planner.agent.error.repeatEnd'));
    }
    recurrenceEndDate = arguments_.recurrenceEndDate;
  }

  return {
    recurrence,
    ...(recurrenceInterval !== undefined ? { recurrenceInterval } : {}),
    ...(recurrenceWeekdays ? { recurrenceWeekdays } : {}),
    ...(recurrenceNth !== undefined ? { recurrenceNth } : {}),
    ...(recurrenceEndDate ? { recurrenceEndDate } : {}),
  };
}

/** The last day of a multi-day event, or undefined for one that is over the same day. */
function agentEndDate(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  date: string,
): string | undefined {
  const value = arguments_.endDate;
  if (notGiven(value) || value === date) return undefined;
  if (!isCalendarDateKey(value) || value < date || daysBetweenKeys(date, value) > AGENT_EVENT_SPAN_MAX_DAYS) {
    throw new Error(t('planner.agent.error.endDate'));
  }
  return value;
}

/**
 * What an agent asked to put on the calendar, held to the same rules as the Calendar's own
 * form: a real date (`2026-02-31` is refused, not stored), zero-padded times so the agenda
 * sorts, an end that is not before its start, and a repeat that does not end before it
 * begins. A bad argument is an error the model sees, never an event that silently vanishes
 * from every view. Stored through `normalizeEventFields`, the shape the Calendar's own editor
 * and importer write.
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
  const endDate = agentEndDate(t, arguments_, date);
  // Over several days the end falls on a later day, so an earlier clock time is fine there.
  if (!endDate && !allDay && startTime && endTime && endTime < startTime) {
    throw new Error(t('planner.agent.error.endBeforeStart'));
  }
  const category = AGENT_EVENT_CATEGORIES.includes(arguments_.category as EventCategory)
    ? arguments_.category as EventCategory
    : 'study';
  const repeat = agentRepeatRule(t, arguments_, date);
  return normalizeEventFields({
    title: textArgument(t, arguments_, 'title'),
    description: typeof arguments_.description === 'string'
      ? arguments_.description.slice(0, 500)
      : undefined,
    date,
    ...(endDate ? { endDate } : {}),
    startTime: allDay ? undefined : startTime,
    endTime: allDay ? undefined : endTime,
    allDay,
    color: typeof arguments_.color === 'string' && /^#[0-9a-f]{6}$/i.test(arguments_.color)
      ? arguments_.color
      : CATEGORY_COLORS[category],
    category,
    reminder: agentReminderOffset(arguments_.reminder, defaultReminder),
    ...repeat,
  });
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
      ...(o.endDate ? { endDate: shiftDateKey(o.occurrenceDate, eventSpanDays(o)) } : {}),
      ...(o.allDay ? { allDay: true } : { startTime: o.startTime, endTime: o.endTime }),
      category: o.category,
      recurrence: o.recurrence,
      // The rest of the rule, so the model can describe a series it did not make.
      ...(o.recurrenceInterval && o.recurrenceInterval > 1 ? { recurrenceInterval: o.recurrenceInterval } : {}),
      ...(o.recurrenceWeekdays?.length ? { recurrenceWeekdays: o.recurrenceWeekdays } : {}),
      ...(o.recurrenceNth ? { recurrenceNth: o.recurrenceNth } : {}),
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
  /**
   * A move shifts these too (`rescheduleEventPatch`): a multi-day event keeps its length, "every
   * Tue and Thu" moved a day is every Wed and Fri, "the 2nd Tuesday" follows the date. An Undo
   * that put back only the date left the span, the weekdays and the week of the month moved.
   */
  endDate?: string;
  recurrenceWeekdays?: number[];
  recurrenceNth?: number;
}

function placementOf(event: CalendarEvent): CalendarPlacement {
  return {
    date: event.date,
    allDay: Boolean(event.allDay),
    ...(event.startTime ? { startTime: event.startTime } : {}),
    ...(event.endTime ? { endTime: event.endTime } : {}),
    ...(event.recurrenceEndDate ? { recurrenceEndDate: event.recurrenceEndDate } : {}),
    ...(event.endDate ? { endDate: event.endDate } : {}),
    ...(event.recurrenceWeekdays?.length ? { recurrenceWeekdays: [...event.recurrenceWeekdays] } : {}),
    ...(event.recurrenceNth ? { recurrenceNth: event.recurrenceNth } : {}),
  };
}

function readPlacement(value: unknown): CalendarPlacement | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Record<string, unknown>;
  if (!isCalendarDateKey(raw.date) || typeof raw.allDay !== 'boolean') return null;
  const clockOrAbsent = (v: unknown) => v === undefined || normalizeClockTime(v) === v;
  if (!clockOrAbsent(raw.startTime) || !clockOrAbsent(raw.endTime)) return null;
  if (raw.recurrenceEndDate !== undefined && !isCalendarDateKey(raw.recurrenceEndDate)) return null;
  if (raw.endDate !== undefined && !isCalendarDateKey(raw.endDate)) return null;
  const weekdays = raw.recurrenceWeekdays;
  if (weekdays !== undefined && !(Array.isArray(weekdays) && weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6))) return null;
  const nth = raw.recurrenceNth;
  if (nth !== undefined && !(nth === -1 || (Number.isInteger(nth) && (nth as number) >= 1 && (nth as number) <= 5))) return null;
  return {
    date: raw.date,
    allDay: raw.allDay,
    ...(typeof raw.startTime === 'string' ? { startTime: raw.startTime } : {}),
    ...(typeof raw.endTime === 'string' ? { endTime: raw.endTime } : {}),
    ...(typeof raw.recurrenceEndDate === 'string' ? { recurrenceEndDate: raw.recurrenceEndDate } : {}),
    ...(typeof raw.endDate === 'string' ? { endDate: raw.endDate } : {}),
    ...(Array.isArray(weekdays) && weekdays.length ? { recurrenceWeekdays: [...weekdays] as number[] } : {}),
    ...(typeof nth === 'number' ? { recurrenceNth: nth } : {}),
  };
}

const samePlacement = (a: CalendarPlacement, b: CalendarPlacement): boolean => (
  a.date === b.date && a.allDay === b.allDay && a.startTime === b.startTime
  && a.endTime === b.endTime && a.recurrenceEndDate === b.recurrenceEndDate
  && a.endDate === b.endDate && a.recurrenceNth === b.recurrenceNth
  && (a.recurrenceWeekdays ?? []).join(',') === (b.recurrenceWeekdays ?? []).join(',')
);

/** The `code` an Undo refusal carries, so the client can say "changed since" rather than "failed". */
export const AGENT_UNDO_CHANGED_SINCE = 'changed-since';

/** An Undo that would overwrite (or delete) a change made since. Nothing was changed. */
function changedSince(t: AgentToolRegistryTranslate, key: string): Error {
  return Object.assign(new Error(t(key)), { code: AGENT_UNDO_CHANGED_SINCE });
}

/** A stored value with its object keys sorted, so the same event always serializes the same way. */
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort()
      .filter((key) => record[key] !== undefined)
      .map((key) => [key, canonical(record[key])]));
  }
  return value;
}

/**
 * A short digest of an event exactly as stored: any edit (title, notes, time, reminder,
 * repeat) changes it. Taken when the Agent creates an event and checked again before an Undo
 * deletes it, so Undo never deletes an event the user has edited since. A digest and not a
 * copy: nothing in it can restore, or leak, what the event said (FNV-1a, two seeds).
 */
export function agentCalendarEventFingerprint(event: CalendarEvent): string {
  const text = JSON.stringify(canonical(event));
  let a = 0x811c9dc5;
  let b = (0x01000193 ^ text.length) >>> 0;
  for (let i = 0; i < text.length; i += 1) {
    const c = text.charCodeAt(i);
    a = Math.imul(a ^ c, 0x01000193) >>> 0;
    b = Math.imul(b ^ c, 0x5bd1e995) >>> 0;
  }
  return `${a.toString(16).padStart(8, '0')}${b.toString(16).padStart(8, '0')}`;
}

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
  if (!expect || !samePlacement(placementOf(event), expect)) throw changedSince(t, 'planner.agent.error.movedSince');
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
    endDate: restore.endDate,
    // Only on a series that has the field at all: a one-off never gains a repeat rule.
    ...(event.recurrence === 'weekly' ? { recurrenceWeekdays: restore.recurrenceWeekdays } : {}),
    ...(event.recurrence === 'monthly' || event.recurrence === 'yearly' ? { recurrenceNth: restore.recurrenceNth } : {}),
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
  // A multi-day event ends on a later day, where an earlier clock time is fine.
  if (!event.allDay && !eventSpanDays(event) && nextStart && nextEnd && nextEnd < nextStart) {
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

const DAY_MS = 24 * 60 * 60 * 1000;
/** One call moves at most this many reviews, so its Undo record stays a bounded size. */
const SCHEDULE_REVIEWS_LIMIT = 300;

function boundedInteger(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(number) ? Math.max(min, Math.min(max, Math.round(number))) : fallback;
}

interface ReviewMove {
  id: string;
  /** Where the card was due before the move: what Undo puts back. */
  dueAt: number;
  /** Where the move put it: Undo refuses unless the card is still exactly there. */
  expect: number;
}

function readReviewMoves(value: unknown): ReviewMove[] | null {
  if (!Array.isArray(value) || !value.length || value.length > SCHEDULE_REVIEWS_LIMIT) return null;
  const moves: ReviewMove[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== 'object') return null;
    const move = raw as Record<string, unknown>;
    if (typeof move.id !== 'string' || !Number.isFinite(move.dueAt) || !Number.isFinite(move.expect)) return null;
    moves.push({ id: move.id, dueAt: move.dueAt as number, expect: move.expect as number });
  }
  return moves;
}

/**
 * `flashcard.schedule-reviews`: snooze the reviews due now by `days`, or keep `keep` of the most
 * overdue and snooze the rest (a limit for today), optionally in one folder. Only scheduled cards
 * the queue would show now are moved — never a new card, a suspended one, or one Anki schedules —
 * and only their due time changes. The result carries its own way back (`undo`), which
 * `agentExecutionRecord` turns into an Undo of the same operation; that Undo refuses, changing
 * nothing, if any of the cards was reviewed or moved since.
 */
function agentScheduleReviews(
  t: AgentToolRegistryTranslate,
  arguments_: Readonly<Record<string, unknown>>,
  now = Date.now(),
): Record<string, unknown> {
  if (arguments_.undo && typeof arguments_.undo === 'object' && !Array.isArray(arguments_.undo)) {
    const undo = arguments_.undo as Record<string, unknown>;
    const moves = undo.kind === 'restore' ? readReviewMoves(undo.cards) : null;
    if (!moves) throw new Error(t('blanc.agent.error.needsArgument', { name: 'undo' }));
    const live = new Map(loadDeck().map((card) => [card.id, card]));
    // Every card is checked before the first one moves: all of them go back, or none do.
    for (const move of moves) {
      if (live.get(move.id)?.srs?.dueAt !== move.expect) throw changedSince(t, 'aiAgent.reviews.changedSince');
    }
    const restored = setDeckCardsDueAt(moves.map((move) => ({ id: move.id, dueAt: move.dueAt })));
    return { restored: restored.length, ids: restored };
  }
  const days = boundedInteger(arguments_.days, 1, 30, 1);
  const keep = boundedInteger(arguments_.keep, 0, 10_000, 0);
  const folder = typeof arguments_.folder === 'string' && arguments_.folder.trim()
    ? arguments_.folder.trim().slice(0, 120)
    : null;
  const deck = loadDeck();
  // A folder exists when it was created (even empty) or when a card sits in it.
  if (folder && !loadDeckFolders().includes(folder) && !deck.some((card) => card.folder === folder)) {
    throw new Error(t('aiAgent.reviews.folderNotFound', { folder }));
  }
  const due = dueDeckCards(deck, now)
    .filter((card) => card.srs && Number.isFinite(card.srs.dueAt) && (!folder || card.folder === folder))
    // Most overdue first: those are the ones a daily limit keeps.
    .sort((a, b) => (a.srs?.dueAt ?? 0) - (b.srs?.dueAt ?? 0));
  const postponed = due.slice(keep, keep + SCHEDULE_REVIEWS_LIMIT);
  const dueAt = now + days * DAY_MS;
  const moves: ReviewMove[] = postponed.map((card) => ({ id: card.id, dueAt: card.srs?.dueAt ?? now, expect: dueAt }));
  const moved = new Set(setDeckCardsDueAt(moves.map((move) => ({ id: move.id, dueAt: move.expect }))));
  const done = moves.filter((move) => moved.has(move.id));
  return {
    due: due.length,
    kept: Math.min(keep, due.length),
    postponed: done.length,
    days,
    ...(folder ? { folder } : {}),
    ...(due.length - keep > SCHEDULE_REVIEWS_LIMIT ? { leftDue: due.length - keep - SCHEDULE_REVIEWS_LIMIT } : {}),
    ids: done.map((move) => move.id),
    ...(done.length ? { undo: { kind: 'restore', cards: done } } : {}),
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
    'flashcard.schedule-reviews': (arguments_) => agentScheduleReviews(t, arguments_),
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
      const event = loadEvents().find((candidate) => candidate.id === id);
      if (!event) {
        throw new Error(t('planner.agent.error.eventNotFound'));
      }
      // Undo of an event the Agent made passes the digest taken when it was made: an event
      // the user has edited since is theirs now, and is not deleted.
      if (arguments_.expect !== undefined && arguments_.expect !== agentCalendarEventFingerprint(event)) {
        throw changedSince(t, 'planner.agent.error.editedSince');
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
