// Persist draft sessions so an interrupted import resumes — the disk half of
// `shared/ankiDraftSession.ts`, and Phase 1's autosave/recovery clause.
//
// One file, `userData/anki-draft-sessions.json`, written atomically. Not SQLite:
// a session is a few hundred bytes of bookkeeping about pages the adapters can
// re-read at any time, so the failure mode of losing the file is "the read
// restarts", not "the user loses data" — and that does not justify a schema.
//
// The load path is where the honesty rule is enforced. Anything the file still
// calls `reading` was written by a process that never came back to change it, so
// unless that process is this one it becomes `interrupted`. Nothing else in the
// app may set `interrupted`, and nothing may set `complete` at all — coverage
// decides that.

import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

import {
  ANKI_DRAFT_SESSION_VERSION,
  cancelSession,
  describeSessionProgress,
  failSession,
  planResume,
  recordSessionPage,
  reconcileSessionOnLoad,
  startSession,
  type AnkiDraftSession,
  type AnkiDraftSessionProgress,
  type AnkiDraftSessionRequest,
  type DraftSessionPageReport,
  type ResumePlan,
  type StartSessionInput,
} from '../../shared/ankiDraftSession';
import type { AnkiDraftSourceKind } from '../../shared/ankiDraft';

/**
 * Retained sessions, newest first. A user who imports repeatedly should not grow
 * this file forever, and a session older than the last dozen is not something
 * anybody is coming back to resume.
 */
export const MAX_RETAINED_SESSIONS = 24;

interface SessionFile {
  version: number;
  sessions: AnkiDraftSession[];
}

let cache: AnkiDraftSession[] | null = null;

function storePath(): string {
  return path.join(app.getPath('userData'), 'anki-draft-sessions.json');
}

/**
 * Accept only what this version knows how to reason about.
 *
 * A malformed or future-version record is dropped rather than repaired: a
 * half-understood session would produce a resume offset derived from pages this
 * build cannot interpret, and the resulting draft would be silently wrong.
 */
function isUsable(value: unknown): value is AnkiDraftSession {
  const s = value as AnkiDraftSession | null;
  return (
    !!s &&
    typeof s === 'object' &&
    s.version === ANKI_DRAFT_SESSION_VERSION &&
    typeof s.id === 'string' &&
    s.id.length > 0 &&
    Array.isArray(s.pages) &&
    Array.isArray(s.diagnosticCodes) &&
    typeof s.request === 'object' &&
    s.request !== null
  );
}

function load(): AnkiDraftSession[] {
  if (cache) return cache;
  let parsed: SessionFile | null = null;
  try {
    parsed = JSON.parse(fs.readFileSync(storePath(), 'utf8')) as SessionFile;
  } catch {
    // Absent or unreadable is the normal first-run state, not an error.
    parsed = null;
  }
  const now = Date.now();
  const raw = Array.isArray(parsed?.sessions) ? parsed.sessions : [];
  cache = raw
    .filter(isUsable)
    // The whole point of the file. See the module header.
    .map((s) => reconcileSessionOnLoad(s, process.pid, now));
  return cache;
}

function persist(sessions: AnkiDraftSession[]): void {
  const file: SessionFile = { version: ANKI_DRAFT_SESSION_VERSION, sessions };
  const target = storePath();
  const tmp = `${target}.tmp`;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // Write-then-rename: a crash during the write must not turn a readable file
    // of resumable sessions into a truncated one that load() then discards.
    fs.writeFileSync(tmp, JSON.stringify(file, null, 2), 'utf8');
    fs.renameSync(tmp, target);
  } catch (err) {
    console.error('[anki] could not persist draft sessions:', err);
  }
}

function commit(sessions: AnkiDraftSession[]): AnkiDraftSession[] {
  const trimmed = [...sessions]
    .sort((a, b) => b.updatedAtMs - a.updatedAtMs)
    .slice(0, MAX_RETAINED_SESSIONS);
  cache = trimmed;
  persist(trimmed);
  return trimmed;
}

function replace(session: AnkiDraftSession): AnkiDraftSession {
  const others = load().filter((s) => s.id !== session.id);
  commit([session, ...others]);
  return session;
}

/** Test seam. Production never calls this; the cache is otherwise process-lifetime. */
export function resetDraftSessionCache(): void {
  cache = null;
}

export function listDraftSessions(): AnkiDraftSession[] {
  return [...load()].sort((a, b) => b.updatedAtMs - a.updatedAtMs);
}

export function getDraftSession(id: string): AnkiDraftSession | undefined {
  return load().find((s) => s.id === id);
}

export interface BeginDraftSessionRequest {
  sourceKind: AnkiDraftSourceKind;
  label: string;
  request: AnkiDraftSessionRequest;
  fingerprint?: string;
}

/**
 * Start a session, or hand back the one already open for the same source.
 *
 * Reusing by `(kind, filePath|query|deckId)` is what makes autosave work without
 * a session id in the UI: reopening the same file after a crash finds the
 * interrupted session instead of starting a second one beside it and reading
 * everything twice. A fingerprint mismatch is not checked here — `resume` is
 * where that decision belongs, because starting fresh is always legal.
 */
export function beginDraftSession(input: BeginDraftSessionRequest): AnkiDraftSession {
  const key = sourceKey(input.sourceKind, input.request);
  const existing = load().find(
    (s) => sourceKey(s.sourceKind, s.request) === key && s.status !== 'complete' && s.status !== 'cancelled',
  );
  const now = Date.now();
  if (existing) {
    return replace({ ...existing, status: 'reading', ownerPid: process.pid, updatedAtMs: now });
  }
  const start: StartSessionInput = {
    id: `${input.sourceKind}-${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    sourceKind: input.sourceKind,
    label: input.label,
    request: input.request,
    fingerprint: input.fingerprint,
    ownerPid: process.pid,
    nowMs: now,
  };
  return replace(startSession(start));
}

/** Unit separator, as in `ANKI_FIELD_SEP` — a path or query may contain a space. */
const SOURCE_KEY_SEP = String.fromCharCode(31);

function sourceKey(kind: AnkiDraftSourceKind, request: AnkiDraftSessionRequest): string {
  return [kind, request.filePath ?? '', request.query ?? '', request.deckId ?? ''].join(SOURCE_KEY_SEP);
}

export function recordDraftSessionPage(
  id: string,
  page: DraftSessionPageReport,
): AnkiDraftSession | undefined {
  const session = getDraftSession(id);
  if (!session) return undefined;
  return replace(recordSessionPage(session, { ...page, nowMs: Date.now() }));
}

export function cancelDraftSession(id: string): AnkiDraftSession | undefined {
  const session = getDraftSession(id);
  if (!session) return undefined;
  return replace(cancelSession(session, Date.now()));
}

export function failDraftSession(id: string, error: string): AnkiDraftSession | undefined {
  const session = getDraftSession(id);
  if (!session) return undefined;
  return replace(failSession(session, error, Date.now()));
}

/** Forget a session outright. The pages were never data; only bookkeeping is lost. */
export function deleteDraftSession(id: string): boolean {
  const before = load();
  const after = before.filter((s) => s.id !== id);
  if (after.length === before.length) return false;
  commit(after);
  return true;
}

export interface DraftSessionResumeResult {
  plan: ResumePlan;
  session?: AnkiDraftSession;
  progress?: AnkiDraftSessionProgress;
}

/**
 * Where to pick this session up, having re-checked the source.
 *
 * A verdict other than `ok` leaves the session untouched — in particular
 * `source-changed` does not delete it, so the surface can say what happened
 * before the user agrees to start over.
 */
export function resumeDraftSession(id: string, currentFingerprint?: string): DraftSessionResumeResult {
  const session = getDraftSession(id);
  if (!session) return { plan: { verdict: 'nothing-to-resume' } };
  const plan = planResume(session, currentFingerprint);
  if (plan.verdict !== 'ok') {
    return { plan, session, progress: describeSessionProgress(session) };
  }
  const live = replace({ ...session, status: 'reading', ownerPid: process.pid, updatedAtMs: Date.now() });
  return { plan, session: live, progress: describeSessionProgress(live) };
}

export interface DraftSessionSummary {
  session: AnkiDraftSession;
  progress: AnkiDraftSessionProgress;
}

/** What a surface lists: every session with its derived progress alongside. */
export function summarizeDraftSessions(): DraftSessionSummary[] {
  return listDraftSessions().map((session) => ({
    session,
    progress: describeSessionProgress(session),
  }));
}
