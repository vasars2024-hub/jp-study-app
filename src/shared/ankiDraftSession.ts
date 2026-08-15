// Resumable draft sessions — Phase 1's last clause of ANKI_DECK_WORKBENCH_PLAN.md
// ("autosave resumable drafts, and prove cancellation/recovery") and the model
// behind demonstrable acceptance gate 7.
//
// A *session* is one read of one source, paged. The four source adapters
// (`apkgDraftRead`, `csvDraftRead`, `connectDraftRead`, `ankiLocalDeck`) each
// answer one page at a time; this is what remembers which pages already landed
// so an interrupted read resumes instead of restarting.
//
// Pure and I/O-free. The store that writes these to disk is
// `main/anki/draftSessionStore.ts`; keeping the state machine here is what lets
// the interrupt rules be tested without killing a process.
//
// The one rule everything else exists to serve: **a read that stopped early can
// never come back looking finished.** Gate 7 asks for recovery "without a false
// success state or an ambiguous partial result", so `complete` is computed from
// contiguous coverage, never set by a caller, and a session found still
// `reading` by a different process is downgraded to `interrupted` on load.

import type { AnkiDraftDiagnosticCode, AnkiDraftSourceKind } from './ankiDraft';

export const ANKI_DRAFT_SESSION_VERSION = 1;

/**
 * `reading` is the only status a live process may hold, and it is the only one
 * that is not final-until-resumed. `interrupted` is distinct from `cancelled`
 * on purpose: the user chose one of them and did not choose the other, and the
 * workbench offers to resume only the one nobody chose to stop.
 */
export type AnkiDraftSessionStatus =
  | 'reading'
  | 'complete'
  | 'interrupted'
  | 'cancelled'
  | 'failed';

/** A half-open window of note offsets that has been read and persisted. */
export interface AnkiDraftPageRange {
  offset: number;
  count: number;
}

/**
 * Enough to replay the read that produced this session, and nothing more.
 *
 * Deliberately not the request objects themselves: those grow per adapter, and a
 * session persisted by one app version has to stay readable by the next.
 */
export interface AnkiDraftSessionRequest {
  kind: AnkiDraftSourceKind;
  /** `apkg` / `csv`. */
  filePath?: string;
  /** `ankiconnect` search syntax. */
  query?: string;
  /** `local-deck` store id. */
  deckId?: string;
  /** Page size the read used. A resume keeps it so page boundaries stay aligned. */
  noteLimit?: number;
}

export interface AnkiDraftSession {
  version: number;
  id: string;
  status: AnkiDraftSessionStatus;
  sourceKind: AnkiDraftSourceKind;
  /** Display label from `AnkiDraftSource.label` — a deck or profile name, never a path. */
  label: string;
  /**
   * The source's own fingerprint at the time the first page was read. A resume
   * against a different one would splice two different collections together.
   */
  fingerprint?: string;
  request: AnkiDraftSessionRequest;
  /**
   * The process that currently holds `reading`. Not a lock: it is the evidence
   * that decides, on load, whether `reading` is live or a crash leftover.
   */
  ownerPid?: number;
  createdAtMs: number;
  updatedAtMs: number;
  /** Unknown until the first page answers. `complete` is impossible before then. */
  totalNotes?: number;
  pages: AnkiDraftPageRange[];
  /** Set only by `failSession`. Carried so a resumed session can say why it stopped. */
  error?: string;
  /**
   * Deduped diagnostic codes from every page so far. Without this a resumed
   * session would look clean because the page that carried the warning is no
   * longer the page on screen.
   */
  diagnosticCodes: AnkiDraftDiagnosticCode[];
}

// ----- coverage -----------------------------------------------------------------

/**
 * Sort, drop empties, and merge touching or overlapping ranges.
 *
 * Adjacent ranges must merge, not just overlapping ones: pages arrive as
 * `[0,500)` then `[500,1000)`, and if those stayed separate then contiguity —
 * which is what decides `complete` — would never be reached.
 */
export function mergePageRanges(ranges: readonly AnkiDraftPageRange[]): AnkiDraftPageRange[] {
  const clean = ranges
    .map((r) => ({ offset: Math.max(0, Math.floor(r.offset)), count: Math.max(0, Math.floor(r.count)) }))
    .filter((r) => r.count > 0)
    .sort((a, b) => a.offset - b.offset);

  const out: AnkiDraftPageRange[] = [];
  for (const range of clean) {
    const last = out[out.length - 1];
    if (last && range.offset <= last.offset + last.count) {
      const end = Math.max(last.offset + last.count, range.offset + range.count);
      last.count = end - last.offset;
    } else {
      out.push({ ...range });
    }
  }
  return out;
}

/** Distinct note offsets read so far. Not the sum of page sizes — pages can overlap. */
export function coveredNoteCount(session: AnkiDraftSession): number {
  return mergePageRanges(session.pages).reduce((sum, r) => sum + r.count, 0);
}

/**
 * The first offset not yet read, or `null` when there is nothing left.
 *
 * A gap in the middle wins over the end. Pages can land out of order (a user
 * jumps to the last page of a big deck, then scrolls back), and resuming at the
 * end would leave that hole permanently unread while coverage looked healthy.
 */
export function nextResumeOffset(session: AnkiDraftSession): number | null {
  const merged = mergePageRanges(session.pages);
  const total = session.totalNotes;

  let cursor = 0;
  for (const range of merged) {
    if (range.offset > cursor) return cursor;
    cursor = Math.max(cursor, range.offset + range.count);
  }
  if (total === undefined) return cursor;
  return cursor < total ? cursor : null;
}

/**
 * Whether every note has been read.
 *
 * Contiguous-from-zero, not `covered >= total`: with a gap in the middle those
 * two disagree exactly when it matters, and the second one is the false success
 * gate 7 forbids. A `totalNotes` of 0 is a legitimately empty complete read.
 */
export function sessionCoversEverything(session: AnkiDraftSession): boolean {
  if (session.totalNotes === undefined) return false;
  if (session.totalNotes === 0) return true;
  return nextResumeOffset(session) === null;
}

// ----- transitions ---------------------------------------------------------------

export interface StartSessionInput {
  id: string;
  sourceKind: AnkiDraftSourceKind;
  label: string;
  request: AnkiDraftSessionRequest;
  fingerprint?: string;
  ownerPid?: number;
  nowMs: number;
}

export function startSession(input: StartSessionInput): AnkiDraftSession {
  return {
    version: ANKI_DRAFT_SESSION_VERSION,
    id: input.id,
    status: 'reading',
    sourceKind: input.sourceKind,
    label: input.label,
    fingerprint: input.fingerprint,
    request: { ...input.request },
    ownerPid: input.ownerPid,
    createdAtMs: input.nowMs,
    updatedAtMs: input.nowMs,
    pages: [],
    diagnosticCodes: [],
  };
}

/**
 * What a caller says about a page it received. Named separately from
 * `RecordPageInput` because it crosses IPC, where the clock is the main
 * process's and a renderer-supplied `nowMs` would be a second source of truth.
 */
export interface DraftSessionPageReport {
  offset: number;
  count: number;
  totalNotes?: number;
  fingerprint?: string;
  diagnosticCodes?: readonly AnkiDraftDiagnosticCode[];
}

export interface RecordPageInput extends DraftSessionPageReport {
  nowMs: number;
}

/**
 * Fold one delivered page into the session.
 *
 * Returns a new object rather than mutating: the store persists whatever this
 * returns, and an in-place update that then fails to write would leave memory
 * and disk disagreeing about how much was read.
 *
 * A page recorded against a `cancelled` or `failed` session is ignored. An
 * adapter's in-flight request can answer after the user cancelled, and letting
 * that late answer revive the session is precisely the ambiguous partial result.
 */
export function recordSessionPage(
  session: AnkiDraftSession,
  page: RecordPageInput,
): AnkiDraftSession {
  if (session.status === 'cancelled' || session.status === 'failed') return session;

  const pages = mergePageRanges([...session.pages, { offset: page.offset, count: page.count }]);
  const totalNotes = page.totalNotes ?? session.totalNotes;
  const codes = [...session.diagnosticCodes];
  for (const code of page.diagnosticCodes ?? []) {
    if (!codes.includes(code)) codes.push(code);
  }

  const next: AnkiDraftSession = {
    ...session,
    pages,
    totalNotes,
    diagnosticCodes: codes,
    fingerprint: session.fingerprint ?? page.fingerprint,
    updatedAtMs: page.nowMs,
    status: 'reading',
  };
  // Computed, never passed in. See the module header.
  if (sessionCoversEverything(next)) {
    next.status = 'complete';
    next.ownerPid = undefined;
  }
  return next;
}

/** The user stopped it. Pages already read stay — cancelling is not discarding. */
export function cancelSession(session: AnkiDraftSession, nowMs: number): AnkiDraftSession {
  if (session.status === 'complete') return session;
  return { ...session, status: 'cancelled', ownerPid: undefined, updatedAtMs: nowMs };
}

/** The read threw. `error` is what the resumed session shows instead of a blank stop. */
export function failSession(
  session: AnkiDraftSession,
  error: string,
  nowMs: number,
): AnkiDraftSession {
  if (session.status === 'complete') return session;
  return { ...session, status: 'failed', error, ownerPid: undefined, updatedAtMs: nowMs };
}

/**
 * What a session found on disk actually is, now.
 *
 * `reading` on disk means the process that wrote it never got to write anything
 * else — it was killed, or the app quit mid-read. If that process is not this
 * one, the status is a leftover and the session is `interrupted`. This is the
 * single rule that stops a crashed half-read from reopening as a live one.
 *
 * `livePid` matching is deliberately the whole test. A timestamp heuristic
 * ("stale after N seconds") would mislabel a genuinely slow read of a
 * 155,383-note collection as a crash.
 */
export function reconcileSessionOnLoad(
  session: AnkiDraftSession,
  livePid: number,
  nowMs: number,
): AnkiDraftSession {
  if (session.status !== 'reading') return session;
  if (session.ownerPid !== undefined && session.ownerPid === livePid) return session;
  return { ...session, status: 'interrupted', ownerPid: undefined, updatedAtMs: nowMs };
}

// ----- resuming ------------------------------------------------------------------

export type ResumeVerdict =
  | 'ok'
  | 'nothing-to-resume'
  | 'source-changed'
  | 'cancelled-by-user'
  | 'already-complete';

export interface ResumePlan {
  verdict: ResumeVerdict;
  /** Present only when `verdict` is `ok`. */
  offset?: number;
  limit?: number;
}

/**
 * Whether and where this session can pick up.
 *
 * `currentFingerprint` is re-read from the live source, not trusted from the
 * session: a `.apkg` can be replaced on disk and an Anki collection edited
 * while the app was closed, and resuming across that would interleave notes
 * from two different collections into one draft with no diagnostic saying so.
 * When it differs the caller must restart the read, which is why
 * `source-changed` is its own verdict and not an error.
 */
export function planResume(
  session: AnkiDraftSession,
  currentFingerprint?: string,
): ResumePlan {
  if (session.status === 'complete') return { verdict: 'already-complete' };
  if (session.status === 'cancelled') return { verdict: 'cancelled-by-user' };
  if (
    session.fingerprint !== undefined &&
    currentFingerprint !== undefined &&
    session.fingerprint !== currentFingerprint
  ) {
    return { verdict: 'source-changed' };
  }

  const offset = nextResumeOffset(session);
  if (offset === null) return { verdict: 'nothing-to-resume' };
  return { verdict: 'ok', offset, limit: session.request.noteLimit };
}

export interface AnkiDraftSessionProgress {
  status: AnkiDraftSessionStatus;
  covered: number;
  totalNotes?: number;
  /** 0-100, integer. Absent while `totalNotes` is unknown — never guessed as 0. */
  percent?: number;
  resumeOffset: number | null;
  /** True only for a session a user could meaningfully continue. */
  resumable: boolean;
  diagnosticCodes: AnkiDraftDiagnosticCode[];
  error?: string;
}

/** The shape a surface renders. Derived, so it can never disagree with the session. */
export function describeSessionProgress(session: AnkiDraftSession): AnkiDraftSessionProgress {
  const covered = coveredNoteCount(session);
  const total = session.totalNotes;
  const resumeOffset = nextResumeOffset(session);
  return {
    status: session.status,
    covered,
    totalNotes: total,
    percent: total === undefined ? undefined : total === 0 ? 100 : Math.floor((covered / total) * 100),
    resumeOffset,
    resumable:
      (session.status === 'interrupted' || session.status === 'failed') && resumeOffset !== null,
    diagnosticCodes: [...session.diagnosticCodes],
    error: session.error,
  };
}
