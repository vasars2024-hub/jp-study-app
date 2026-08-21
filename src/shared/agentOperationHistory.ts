/**
 * The durable half of the operation log: what the Agent changed, across
 * restarts.
 *
 * `agentOperationLog.ts` is per-window and dies with the window. That is right
 * for *undo* and wrong for *accountability*. The two questions are different,
 * and this module exists because the second one has never had an answer:
 *
 * - **Undo stays session-only.** An inverse refuses as `superseded` when
 *   anything newer touched the entity it names, and that check is decided from
 *   the log alone. A log restored from disk never witnessed the writes that
 *   happened while the app was closed, so it cannot honestly answer the
 *   supersede question for them — it would say "nothing newer touched this" and
 *   mean "I was not running". Offering a restored entry as undoable would
 *   therefore be a claim the record cannot support, so the persisted entry is
 *   deliberately not shaped to be replayed: no `sequence`, no `invertsSequence`.
 * - **The record is durable.** "What has this thing done to my data" is an audit
 *   question, and an audit trail that resets every time a window closes is not
 *   one. The plan's own trust bullet — controls for retained chats and history
 *   deletion — presumes a history that outlives the session.
 *
 * Rule 1 of the session log carries over intact and gets stricter: ids only,
 * never a copy of the entity. `arguments` are dropped on the way to disk even
 * though the session entry carries them, because they are free text the user
 * typed or a model produced, and durability changes the exposure — a request
 * argument that lived in one window's memory for an hour is a different privacy
 * object from the same string sitting in `operational-v1.json` for ninety days.
 * What survives is the shape of the change: which operation, what it claims it
 * did, to which entity type, naming which ids, when, and in which conversation.
 *
 * An undo is not recorded as a mutation of the entry it reverses. It arrives
 * here as its own entry, under the inverse operation's own id, because that is
 * what happened: two operations ran. Editing the first one after the fact would
 * make this a state projection rather than a record.
 */

import type { AgentOperationClaim, AgentOperationEntry } from './agentOperationLog';
import { AGENT_TOOL_OPERATIONS, type AgentToolOperationId } from './localAgent';

/**
 * One durable record of a completed effect.
 *
 * Every field is required except `conversationId`, which is absent for the same
 * reason it is optional on the session entry: a one-shot tool call from a result
 * card has a call id and no conversation.
 */
export interface AgentOperationHistoryEntry {
  /**
   * The session entry's stable id (`${callId}|${sequence}`), carried through so
   * an append is idempotent. Two windows projecting the same completed step —
   * or one window re-recording after a re-render — must not produce two rows.
   */
  id: string;
  operation: AgentToolOperationId;
  claim: AgentOperationClaim;
  entityType: string;
  entityIds: readonly string[];
  /** When the session log recorded it, not when it reached disk. */
  at: number;
  conversationId?: string;
}

export interface AgentOperationHistory {
  version: 1;
  /** Newest first, matching the session log's order. */
  entries: readonly AgentOperationHistoryEntry[];
}

/**
 * Two bounds, because either alone fails a real profile.
 *
 * The age bound is what a retention promise is made of: a user asked "is it gone
 * yet" and a count cannot answer that. The count bound is what stops a single
 * automation loop from writing tens of thousands of rows into a document the
 * queue and the memory store also live in — a file that is read synchronously on
 * every main-side operational read.
 *
 * Ninety days rather than the queue's thirty: a terminal queue row is evidence
 * of *work*, which stops being interesting once it is done, while this is
 * evidence of a *change to the user's data*, which is exactly what someone comes
 * looking for months later. There is no user-facing dial, deliberately — the
 * privacy control the plan names is deletion, which is exact and immediate,
 * where a retention dial invites the failure the Reading Lens hit (a value on
 * disk that no longer maps to an offered choice) for a surface with a much
 * smaller payoff.
 */
export const AGENT_OPERATION_HISTORY_LIMIT = 500;
export const AGENT_OPERATION_HISTORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;

const OPERATION_IDS: ReadonlySet<string> = new Set(
  AGENT_TOOL_OPERATIONS.map((definition) => definition.id),
);

const CLAIMS: ReadonlySet<string> = new Set<AgentOperationClaim>([
  'created',
  'updated',
  'deleted',
  'read',
]);

export function emptyAgentOperationHistory(): AgentOperationHistory {
  return { version: 1, entries: [] };
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function timestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

/**
 * Re-derives one row, or rejects it.
 *
 * An unknown `operation` is rejected rather than kept as an opaque string: a row
 * naming an operation this build does not have cannot be labelled, cannot be
 * explained, and would render as a raw id — which reads as a bug to a user and
 * hides that the real cause is a downgraded build. Dropping it is the honest
 * loss, and the entry it describes is not recoverable from the row anyway.
 */
function normalizeEntry(input: unknown): AgentOperationHistoryEntry | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const raw = input as Record<string, unknown>;
  const id = text(raw.id);
  const operation = text(raw.operation);
  const claim = text(raw.claim);
  const entityType = text(raw.entityType);
  const at = timestamp(raw.at);
  if (!id || !entityType || at === null) return null;
  if (!OPERATION_IDS.has(operation) || !CLAIMS.has(claim)) return null;
  const entityIds = Array.isArray(raw.entityIds)
    ? [...new Set(raw.entityIds.map(text).filter(Boolean))]
    : [];
  const conversationId = text(raw.conversationId);
  return {
    id,
    operation: operation as AgentToolOperationId,
    claim: claim as AgentOperationClaim,
    entityType,
    entityIds,
    at,
    ...(conversationId ? { conversationId } : {}),
  };
}

/**
 * Total, like every other section normalizer here: a malformed row is dropped
 * and the rest of the history survives. A history that failed closed to empty on
 * one bad row would destroy the record it exists to keep.
 */
export function normalizeAgentOperationHistory(input: unknown): AgentOperationHistory {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return emptyAgentOperationHistory();
  }
  const raw = input as Record<string, unknown>;
  if (raw.version !== 1) return emptyAgentOperationHistory();
  const rows = Array.isArray(raw.entries) ? raw.entries : [];
  const seen = new Set<string>();
  const entries: AgentOperationHistoryEntry[] = [];
  for (const row of rows) {
    const entry = normalizeEntry(row);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  entries.sort((left, right) => right.at - left.at);
  return { version: 1, entries: entries.slice(0, AGENT_OPERATION_HISTORY_LIMIT) };
}

/** The durable projection of a session entry — see the header for what it drops. */
export function agentOperationHistoryEntryFrom(
  entry: AgentOperationEntry,
): AgentOperationHistoryEntry {
  return {
    id: entry.id,
    operation: entry.operation,
    claim: entry.claim,
    entityType: entry.entityType,
    entityIds: [...entry.entityIds],
    at: entry.recordedAt,
    ...(entry.conversationId ? { conversationId: entry.conversationId } : {}),
  };
}

/**
 * Appends one row, newest first, ignoring an id already present.
 *
 * The duplicate check is not defensive tidying: the producer is a React effect
 * over a session log that is itself re-derived on every projection, so the same
 * completed step is offered more than once by construction.
 */
export function agentOperationHistoryAppend(
  history: AgentOperationHistory,
  entry: AgentOperationHistoryEntry,
): AgentOperationHistory {
  if (history.entries.some((existing) => existing.id === entry.id)) return history;
  const entries = [entry, ...history.entries].slice(0, AGENT_OPERATION_HISTORY_LIMIT);
  return { version: 1, entries };
}

/** Drops rows past the retention window. Returns the same object when nothing goes. */
export function pruneAgentOperationHistory(
  history: AgentOperationHistory,
  now = Date.now(),
): AgentOperationHistory {
  const cutoff = now - AGENT_OPERATION_HISTORY_RETENTION_MS;
  const entries = history.entries.filter((entry) => entry.at >= cutoff);
  if (entries.length === history.entries.length) return history;
  return { version: 1, entries };
}
