/**
 * Completed practice sessions.
 *
 * The old modal discarded everything on close: you could not tell whether you
 * had practised today, what you got wrong, or whether last week went better.
 *
 * Kept deliberately small. This records **what happened in a session**, not a
 * scheduling state — there is no due date, interval or ease here. Per-point
 * knowledge lives in `grammarFamiliarity`, and scheduling is Anki's job, which
 * this app already exports to. A history that also claimed to know what was due
 * would be a third opinion competing with both.
 *
 * Same storage discipline as the rest of Phase 3: a versioned envelope, a
 * forward-mapping parser that keeps an unversioned legacy payload rather than
 * dropping it, and a bounded list so a long-running profile cannot grow this
 * without limit.
 */

import { IDB_KEYS, mirrorToIdb } from './storage/storage';
import type { MasteredMode, QuestionType, SessionDirection } from './grammarSession';

export const HISTORY_LS_KEY = 'jp-grammarx-session-history-v1';
export const HISTORY_VERSION = 1;
const HISTORY_CHANGED_EVENT = 'grammar-session-history-changed';
/** Newest-first cap. Old sessions are dropped, never silently rewritten. */
export const MAX_SESSION_RECORDS = 100;

export interface SessionRecord {
  /** Completion time, epoch ms. Also the identity for display ordering. */
  at: number;
  requested: number;
  delivered: number;
  correct: number;
  direction: SessionDirection;
  types: QuestionType[];
  mastered: MasteredMode;
  /** Point ids answered wrong, so a follow-up session can target them. */
  missed: string[];
}

export type SessionHistory = readonly SessionRecord[];

interface Envelope {
  v: number;
  s: SessionRecord[];
}

/** Newest first, capped. */
export function appendSession(history: SessionHistory, record: SessionRecord): SessionRecord[] {
  return [record, ...history].slice(0, MAX_SESSION_RECORDS);
}

export interface HistoryStats {
  sessions: number;
  answered: number;
  correct: number;
  /** 0..1; 0 when nothing has been answered, never NaN. */
  accuracy: number;
  lastAt: number;
}

export function historyStats(history: SessionHistory): HistoryStats {
  let answered = 0;
  let correct = 0;
  for (const r of history) {
    answered += r.delivered;
    correct += r.correct;
  }
  return {
    sessions: history.length,
    answered,
    correct,
    accuracy: answered ? correct / answered : 0,
    lastAt: history.length ? history[0].at : 0,
  };
}

/** Ids missed in the most recent `withinSessions` sessions, most recent first. */
export function recentlyMissed(history: SessionHistory, withinSessions = 5): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const r of history.slice(0, withinSessions)) {
    for (const id of r.missed) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

// ---- persistence -----------------------------------------------------------

function coerceRecord(v: unknown): SessionRecord | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Partial<SessionRecord>;
  const at = Number(r.at);
  if (!Number.isFinite(at) || at <= 0) return null;
  const delivered = Math.max(0, Math.floor(Number(r.delivered)) || 0);
  const correct = Math.min(delivered, Math.max(0, Math.floor(Number(r.correct)) || 0));
  return {
    at,
    requested: Math.max(0, Math.floor(Number(r.requested)) || 0),
    delivered,
    correct,
    direction: (r.direction ?? 'mixed') as SessionDirection,
    types: Array.isArray(r.types) ? (r.types.filter((t) => typeof t === 'string') as QuestionType[]) : [],
    mastered: (r.mastered ?? 'exclude') as MasteredMode,
    missed: Array.isArray(r.missed) ? r.missed.filter((m): m is string => typeof m === 'string') : [],
  };
}

function readRecords(list: unknown): SessionRecord[] {
  if (!Array.isArray(list)) return [];
  const out: SessionRecord[] = [];
  for (const v of list) {
    const r = coerceRecord(v);
    if (r) out.push(r);
  }
  return out.slice(0, MAX_SESSION_RECORDS);
}

export function parseSessionHistory(raw: string | null): SessionRecord[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    // v0: a bare array, written before the envelope existed.
    if (Array.isArray(parsed)) return readRecords(parsed);
    if (!parsed || typeof parsed !== 'object') return [];
    const env = parsed as Partial<Envelope>;
    if (typeof env.v === 'number') return readRecords(env.s);
    return [];
  } catch {
    return [];
  }
}

export function loadSessionHistory(): SessionRecord[] {
  try {
    return parseSessionHistory(localStorage.getItem(HISTORY_LS_KEY));
  } catch {
    return [];
  }
}

export function saveSessionHistory(history: SessionHistory): void {
  const envelope: Envelope = { v: HISTORY_VERSION, s: [...history] };
  try {
    localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(envelope));
    mirrorToIdb(IDB_KEYS.grammarSessionHistory, envelope);
  } catch {
    /* storage full or unavailable — the in-memory history still stands */
  }
  window.dispatchEvent(new CustomEvent(HISTORY_CHANGED_EVENT));
}

/** Keep Study recommendations current when a Grammar session finishes. */
export function onSessionHistoryChanged(callback: () => void): () => void {
  window.addEventListener(HISTORY_CHANGED_EVENT, callback);
  const onStorage = (event: StorageEvent): void => {
    if (event.key === HISTORY_LS_KEY) callback();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    window.removeEventListener(HISTORY_CHANGED_EVENT, callback);
    window.removeEventListener('storage', onStorage);
  };
}
