/**
 * The writing help's memory (docs/AI_AUDIT.md N19, round 2), kept on the device
 * per profile and study language:
 *
 * - Correction history: every checked text with its edits (what was changed,
 *   to what, of which kind) and the overall comment, newest first and capped. A
 *   text checked again replaces its earlier entry. From it, the kinds of mistake
 *   the learner makes most (particles ×5, conjugation ×3) — the thing a single
 *   correction cannot show.
 * - Journal days: the study days (4 am rollover, `studyDay.ts`) on which a
 *   journal entry was complete — every prompted word used and at least the
 *   target number of sentences, as `checkJournalEntry` decides without a model —
 *   and from them the current and best streak.
 *
 * Pure: the renderer store (`writingHistoryStore.ts`) and the tests share it.
 */
import { shiftStudyDayKey, studyDayIndexOfKey } from './studyDay';
import { WRITING_EDIT_KINDS, type WritingCorrectionResult, type WritingEditKind } from './aiWritingCorrection';

export const WRITING_HISTORY_CAP = 60;
export const JOURNAL_DAYS_CAP = 400;
/** Text kept per entry: enough to recognise it, not a second copy of the note. */
export const WRITING_HISTORY_TEXT_MAX = 400;

export interface WritingHistoryEdit {
  original: string;
  corrected: string;
  explanation: string;
  kind: WritingEditKind;
}

export interface WritingHistoryEntry {
  at: number;
  text: string;
  edits: WritingHistoryEdit[];
  overall: string;
}

export interface WritingHistory {
  version: 1;
  entries: WritingHistoryEntry[];
  /** `YYYY-MM-DD` study days with a complete journal entry, ascending. */
  journalDays: string[];
}

export function emptyWritingHistory(): WritingHistory {
  return { version: 1, entries: [], journalDays: [] };
}

function str(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  const chars = [...value];
  return chars.length > max ? chars.slice(0, max).join('') : value;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

export function normalizeWritingHistory(raw: unknown): WritingHistory {
  if (!raw || typeof raw !== 'object') return emptyWritingHistory();
  const value = raw as Record<string, unknown>;
  const entries: WritingHistoryEntry[] = [];
  for (const item of Array.isArray(value.entries) ? value.entries : []) {
    if (!item || typeof item !== 'object') continue;
    const entry = item as Record<string, unknown>;
    const text = str(entry.text, WRITING_HISTORY_TEXT_MAX);
    const at = typeof entry.at === 'number' && Number.isFinite(entry.at) ? entry.at : 0;
    if (!text) continue;
    const edits: WritingHistoryEdit[] = [];
    for (const rawEdit of Array.isArray(entry.edits) ? entry.edits : []) {
      if (!rawEdit || typeof rawEdit !== 'object') continue;
      const edit = rawEdit as Record<string, unknown>;
      const original = str(edit.original, 200);
      const corrected = str(edit.corrected, 300);
      if (!original) continue;
      const kind = (WRITING_EDIT_KINDS as readonly unknown[]).includes(edit.kind) ? edit.kind as WritingEditKind : 'other';
      edits.push({ original, corrected, explanation: str(edit.explanation, 300), kind });
    }
    entries.push({ at, text, edits, overall: str(entry.overall, 400) });
  }
  entries.sort((a, b) => b.at - a.at);
  const days = Array.isArray(value.journalDays)
    ? [...new Set(value.journalDays.filter((day): day is string => typeof day === 'string' && DAY_KEY.test(day)))].sort()
    : [];
  return { version: 1, entries: entries.slice(0, WRITING_HISTORY_CAP), journalDays: days.slice(-JOURNAL_DAYS_CAP) };
}

/** Adds a checked text (replacing an earlier check of the same text), newest first. */
export function recordWritingCorrection(history: WritingHistory, result: WritingCorrectionResult, at: number): WritingHistory {
  const text = str(result.text, WRITING_HISTORY_TEXT_MAX);
  if (!text) return history;
  const entry: WritingHistoryEntry = {
    at,
    text,
    edits: result.edits.map((edit) => ({
      original: str(edit.original, 200),
      corrected: str(edit.corrected, 300),
      explanation: str(edit.explanation, 300),
      kind: edit.kind,
    })),
    overall: str(result.overall, 400),
  };
  const rest = history.entries.filter((old) => old.text !== text);
  return { ...history, entries: [entry, ...rest].slice(0, WRITING_HISTORY_CAP) };
}

/** The kinds of mistake across the history, most frequent first (ties in the kinds' own order). */
export function mistakeKindCounts(history: WritingHistory): Array<{ kind: WritingEditKind; count: number }> {
  const counts = new Map<WritingEditKind, number>();
  for (const entry of history.entries) for (const edit of entry.edits) counts.set(edit.kind, (counts.get(edit.kind) ?? 0) + 1);
  return WRITING_EDIT_KINDS
    .map((kind) => ({ kind, count: counts.get(kind) ?? 0 }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);
}

/** Marks `dayKey` as a journal day (idempotent). */
export function recordJournalDay(history: WritingHistory, dayKey: string): WritingHistory {
  if (!DAY_KEY.test(dayKey) || history.journalDays.includes(dayKey)) return history;
  return { ...history, journalDays: [...history.journalDays, dayKey].sort().slice(-JOURNAL_DAYS_CAP) };
}

export interface JournalStreak {
  /** Consecutive days up to today, or up to yesterday while today is still open. */
  current: number;
  best: number;
  /** Today already has a complete entry. */
  today: boolean;
  total: number;
}

/** The journal streak on `todayKey`: a day without an entry yet does not break it until it is over. */
export function journalStreak(days: readonly string[], todayKey: string): JournalStreak {
  const set = new Set(days.filter((day) => DAY_KEY.test(day)));
  const today = set.has(todayKey);
  let current = 0;
  let cursor = today ? todayKey : shiftStudyDayKey(todayKey, -1);
  while (set.has(cursor)) {
    current += 1;
    cursor = shiftStudyDayKey(cursor, -1);
  }
  const sorted = [...set].sort();
  let best = 0;
  let run = 0;
  let previous = Number.NaN;
  for (const day of sorted) {
    const index = studyDayIndexOfKey(day);
    run = index === previous + 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = index;
  }
  return { current, best: Math.max(best, current), today, total: set.size };
}
