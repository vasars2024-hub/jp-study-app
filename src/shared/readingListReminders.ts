/**
 * Reading Lists §11.3 — which reminder, if any, is due right now.
 *
 * Pure on purpose, and split out of the scheduler for the same reason the rest
 * of this track splits its models out of its surfaces: §11.3's hard rules are
 * *rate* rules — at most one a day across every kind, at most one a week for
 * pace, nothing at all on first run — and a rate rule proven only through a
 * live timer is a rule proven once, slowly, on one machine's clock.
 *
 * The three decisions this file encodes, all straight from §11.3:
 *
 *   · **Everything is off by default.** `defaultReadingReminderSettings()`
 *     returns every kind `false`. A feature that nags before it has been used
 *     once gets turned off and never turned back on, so the default has to be
 *     silence and the settings screen has to be where it stops being silent.
 *   · **One reminder per day, across ALL kinds.** Not one per kind — four kinds
 *     each politely firing once a day is four interruptions, which is the thing
 *     §11.3 is written to prevent. The cap is checked before any kind is even
 *     evaluated.
 *   · **Dismissible forever, from the notification.** `silenced` lives beside
 *     the enable flags rather than replacing them, so "not now, not ever" from
 *     a toast and "off in settings" stay distinguishable — a user who silenced
 *     a kind from a toast can still find it switched off where they expect.
 *
 * This module returns i18n KEYS and structural params, never prose. Main has no
 * catalog and the notification is rendered in a window that does.
 */

import { summarizeReadingList, readingChallengePace } from './readingListViews';
import type { ReadingList, ReadingListsDocument } from './readingLists';

export const READING_REMINDER_KINDS = [
  'new-binding',
  'stalled-book',
  'challenge-pace',
  'daily-read',
] as const;

/**
 * Kinds in the order they are offered, most newsworthy first.
 *
 * §11.3 says a new binding "earns an interrupt" — it is the moment the feature
 * proves itself — so it outranks the three that are only ever a nudge. Daily
 * read is last because it is the one that fires on an ordinary day with nothing
 * to say, and a day that has real news should spend its one slot on the news.
 */
export type ReadingReminderKind = (typeof READING_REMINDER_KINDS)[number];

export interface ReadingReminderSettings {
  enabled: Record<ReadingReminderKind, boolean>;
  /** Local hour, 0..23, at or after which the daily nudge may fire. */
  dailyHour: number;
  /** Days a book at ≥10 % may sit untouched before it counts as stalled. */
  stalledAfterDays: number;
  /** Kinds dismissed forever from a notification. Never fired again. */
  silenced: ReadingReminderKind[];
}

export interface ReadingReminderState {
  /**
   * When reminders became possible at all.
   *
   * §11.3's "nothing fires on first run" is a real clause, not a nicety: the
   * store is created the moment the app boots, so without this a fresh profile
   * that pastes one list is nagged the same evening.
   */
  installedAt: number;
  /** Any kind. The one-per-day gate reads this and nothing else. */
  lastFiredAt?: number;
  lastFiredByKind: Partial<Record<ReadingReminderKind, number>>;
  /**
   * Subjects already nudged — an entry id, a work id. Kept so a stalled book is
   * surfaced once rather than every day for as long as it stays stalled, which
   * is the difference between a reminder and a complaint.
   */
  seen: string[];
}

export type ReadingReminderAction =
  | 'open'
  | 'continue'
  | 'finish'
  | 'abandon'
  | 'silence';

export interface ReadingReminder {
  kind: ReadingReminderKind;
  /** The thing this reminder is about. Recorded in `seen`, never repeated. */
  subjectId: string;
  listId?: string;
  entryId?: string;
  itemId?: string;
  titleKey: string;
  bodyKey: string;
  /** Structural only — counts and names, never a path. */
  params: Record<string, string | number>;
  actions: ReadingReminderAction[];
}

/** One library item, as much of it as a reminder rule needs. */
export interface ReadingReminderItemActivity {
  itemId: string;
  /** 0..1. Absent progress reads as 0, which no rule fires on. */
  percent: number;
  /** Epoch ms of the last save. `undefined` for a book never opened. */
  lastReadAt?: number;
}

/** A work that auto-bound since the last evaluation — §3.1's news. */
export interface ReadingReminderBinding {
  workId: string;
  listId: string;
  entryId: string;
  itemId: string;
  title: string;
}

export interface ReadingReminderInput {
  now: number;
  document: ReadingListsDocument;
  settings: ReadingReminderSettings;
  state: ReadingReminderState;
  activity: {
    /** Newest `lastReadAt` anywhere in the library. `null` if nothing ever was. */
    lastReadAt: number | null;
    items: readonly ReadingReminderItemActivity[];
  };
  newBindings?: readonly ReadingReminderBinding[];
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;
/** §11.3's stalled rule is explicit about the floor: ≥10 %, not "started". */
const STALLED_MIN_PERCENT = 0.1;
/** Seen subjects are capped so a long-lived profile cannot grow the file forever. */
const SEEN_LIMIT = 200;

export function defaultReadingReminderSettings(): ReadingReminderSettings {
  return {
    enabled: {
      'new-binding': false,
      'stalled-book': false,
      'challenge-pace': false,
      'daily-read': false,
    },
    dailyHour: 20,
    stalledAfterDays: 14,
    silenced: [],
  };
}

export function createReadingReminderState(now: number): ReadingReminderState {
  return { installedAt: now, lastFiredByKind: {}, seen: [] };
}

function clampHour(value: unknown, fallback: number): number {
  const hour = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : fallback;
  return Math.min(23, Math.max(0, hour));
}

/**
 * Repair rather than reject, exactly as `readingLists.ts` normalizes the
 * document: a hand-edited or half-written settings file must degrade to "the
 * defaults for the parts I could not read", never to a throw inside a scheduler
 * tick that then never runs again.
 */
export function normalizeReadingReminderSettings(value: unknown): ReadingReminderSettings {
  const defaults = defaultReadingReminderSettings();
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return defaults;
  const raw = value as Record<string, unknown>;
  const rawEnabled =
    typeof raw.enabled === 'object' && raw.enabled !== null
      ? (raw.enabled as Record<string, unknown>)
      : {};
  const enabled = { ...defaults.enabled };
  for (const kind of READING_REMINDER_KINDS) {
    if (rawEnabled[kind] === true) enabled[kind] = true;
  }
  const silenced = Array.isArray(raw.silenced)
    ? READING_REMINDER_KINDS.filter((kind) => (raw.silenced as unknown[]).includes(kind))
    : [];
  const stalled =
    typeof raw.stalledAfterDays === 'number' && Number.isFinite(raw.stalledAfterDays)
      ? Math.min(365, Math.max(1, Math.floor(raw.stalledAfterDays)))
      : defaults.stalledAfterDays;
  return {
    enabled,
    dailyHour: clampHour(raw.dailyHour, defaults.dailyHour),
    stalledAfterDays: stalled,
    silenced,
  };
}

export function normalizeReadingReminderState(
  value: unknown,
  now: number,
): ReadingReminderState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return createReadingReminderState(now);
  }
  const raw = value as Record<string, unknown>;
  const installedAt =
    typeof raw.installedAt === 'number' && Number.isFinite(raw.installedAt)
      ? raw.installedAt
      : now;
  const lastFiredByKind: Partial<Record<ReadingReminderKind, number>> = {};
  const rawByKind =
    typeof raw.lastFiredByKind === 'object' && raw.lastFiredByKind !== null
      ? (raw.lastFiredByKind as Record<string, unknown>)
      : {};
  for (const kind of READING_REMINDER_KINDS) {
    const at = rawByKind[kind];
    if (typeof at === 'number' && Number.isFinite(at)) lastFiredByKind[kind] = at;
  }
  const seen = Array.isArray(raw.seen)
    ? raw.seen.filter((id): id is string => typeof id === 'string' && id.length > 0)
    : [];
  return {
    installedAt,
    ...(typeof raw.lastFiredAt === 'number' && Number.isFinite(raw.lastFiredAt)
      ? { lastFiredAt: raw.lastFiredAt }
      : {}),
    lastFiredByKind,
    seen: seen.slice(-SEEN_LIMIT),
  };
}

/**
 * Same LOCAL calendar day, not "within 24 hours".
 *
 * A user who was reminded at 23:50 should be eligible again the next evening,
 * not silenced until midnight the day after. Local, because the clause is about
 * the user's day.
 */
function sameLocalDay(a: number, b: number): boolean {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate()
  );
}

function offered(settings: ReadingReminderSettings, kind: ReadingReminderKind): boolean {
  return settings.enabled[kind] === true && !settings.silenced.includes(kind);
}

function newBindingReminder(input: ReadingReminderInput): ReadingReminder | null {
  for (const binding of input.newBindings ?? []) {
    if (input.state.seen.includes(binding.workId)) continue;
    return {
      kind: 'new-binding',
      subjectId: binding.workId,
      listId: binding.listId,
      entryId: binding.entryId,
      itemId: binding.itemId,
      titleKey: 'readingLists.reminder.newBinding.title',
      bodyKey: 'readingLists.reminder.newBinding.body',
      params: { title: binding.title },
      actions: ['open', 'silence'],
    };
  }
  return null;
}

function stalledBookReminder(input: ReadingReminderInput): ReadingReminder | null {
  const cutoff = input.now - input.settings.stalledAfterDays * DAY_MS;
  const byItem = new Map(input.activity.items.map((item) => [item.itemId, item]));
  for (const list of input.document.lists) {
    if (list.archivedAt !== undefined) continue;
    for (const entry of list.entries) {
      if (entry.state !== 'reading') continue;
      if (input.state.seen.includes(entry.id)) continue;
      const work = input.document.works.find((candidate) => candidate.id === entry.workId);
      if (!work) continue;
      for (const itemId of work.boundItemIds) {
        const activity = byItem.get(itemId);
        if (!activity || activity.lastReadAt === undefined) continue;
        if (activity.percent < STALLED_MIN_PERCENT) continue;
        if (activity.lastReadAt > cutoff) continue;
        return {
          kind: 'stalled-book',
          subjectId: entry.id,
          listId: list.id,
          entryId: entry.id,
          itemId,
          titleKey: 'readingLists.reminder.stalled.title',
          bodyKey: 'readingLists.reminder.stalled.body',
          params: {
            title: work.titleRaw,
            days: Math.floor((input.now - activity.lastReadAt) / DAY_MS),
            percent: Math.round(activity.percent * 100),
          },
          // The same three answers §4.2's soft finish offers, because it is the
          // same question asked in a different place — not a second decision.
          actions: ['continue', 'finish', 'abandon', 'silence'],
        };
      }
    }
  }
  return null;
}

function challengePaceReminder(input: ReadingReminderInput): ReadingReminder | null {
  const lastWeekly = input.state.lastFiredByKind['challenge-pace'];
  if (lastWeekly !== undefined && input.now - lastWeekly < WEEK_MS) return null;
  for (const list of input.document.lists) {
    if (list.archivedAt !== undefined) continue;
    if (list.target?.by === undefined) continue;
    const summary = summarizeReadingList(list, input.document.works);
    const pace = readingChallengePace(summary, list.target, input.now, list.createdAt);
    if (!pace || pace.requiredPerDay === null) continue;
    if (pace.remaining === 0) continue;
    const elapsedDays = Math.max(1, (input.now - list.createdAt) / DAY_MS);
    const measuredPerDay = summary.finished / elapsedDays;
    // The nudge is for a rate that has RISEN above what the user is managing.
    // Firing whenever any remainder exists would nag from day one of every
    // challenge, which is §11.3's "quiet" clause read backwards.
    if (pace.requiredPerDay <= measuredPerDay) continue;
    return {
      kind: 'challenge-pace',
      subjectId: list.id,
      listId: list.id,
      titleKey: 'readingLists.reminder.pace.title',
      bodyKey: 'readingLists.reminder.pace.body',
      params: {
        list: list.name,
        books: pace.remaining,
        days: Math.max(0, pace.daysLeft),
      },
      actions: ['open', 'silence'],
    };
  }
  return null;
}

function dailyReadReminder(input: ReadingReminderInput): ReadingReminder | null {
  if (new Date(input.now).getHours() < input.settings.dailyHour) return null;
  const { lastReadAt } = input.activity;
  // Silent on a day you already read. That silence IS the feature (§11.3).
  if (lastReadAt !== null && sameLocalDay(lastReadAt, input.now)) return null;
  const unfinished = input.document.lists.some(
    (list: ReadingList) =>
      list.archivedAt === undefined
      && list.entries.some((entry) => entry.state === 'reading' || entry.state === 'owned'),
  );
  // Nothing to read is not a thing to be nudged about; it is a thing to be
  // offered, and the widgets already offer it.
  if (!unfinished) return null;
  return {
    kind: 'daily-read',
    // One per day is the cap, so the day is the subject.
    subjectId: `daily:${new Date(input.now).toDateString()}`,
    titleKey: 'readingLists.reminder.daily.title',
    bodyKey: 'readingLists.reminder.daily.body',
    params: {},
    actions: ['open', 'silence'],
  };
}

const EVALUATORS: Record<
  ReadingReminderKind,
  (input: ReadingReminderInput) => ReadingReminder | null
> = {
  'new-binding': newBindingReminder,
  'stalled-book': stalledBookReminder,
  'challenge-pace': challengePaceReminder,
  'daily-read': dailyReadReminder,
};

/**
 * The one reminder due now, or `null` — which is the answer on almost every tick
 * and is the correct one.
 */
export function evaluateReadingReminders(input: ReadingReminderInput): ReadingReminder | null {
  // Nothing on first run: not before the feature is a day old, and never while
  // there is no list to be reminded about.
  if (input.now - input.state.installedAt < DAY_MS) return null;
  if (input.document.lists.length === 0) return null;
  // One a day, across every kind, checked before any kind is evaluated.
  if (input.state.lastFiredAt !== undefined && sameLocalDay(input.state.lastFiredAt, input.now)) {
    return null;
  }
  for (const kind of READING_REMINDER_KINDS) {
    if (!offered(input.settings, kind)) continue;
    const reminder = EVALUATORS[kind](input);
    if (reminder) return reminder;
  }
  return null;
}

export function recordReadingReminderFired(
  state: ReadingReminderState,
  reminder: ReadingReminder,
  now: number,
): ReadingReminderState {
  const seen = state.seen.includes(reminder.subjectId)
    ? state.seen
    : [...state.seen, reminder.subjectId].slice(-SEEN_LIMIT);
  return {
    ...state,
    lastFiredAt: now,
    lastFiredByKind: { ...state.lastFiredByKind, [reminder.kind]: now },
    seen,
  };
}

/** "Not now, not ever", from the notification itself — §11.3's dismissal. */
export function silenceReadingReminderKind(
  settings: ReadingReminderSettings,
  kind: ReadingReminderKind,
): ReadingReminderSettings {
  if (settings.silenced.includes(kind)) return settings;
  return { ...settings, silenced: [...settings.silenced, kind] };
}
