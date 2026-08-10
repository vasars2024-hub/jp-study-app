/**
 * The operation log: what the Agent actually changed, and whether any of it can
 * honestly be taken back.
 *
 * `undo` has been in `AgentResultEffect` since the workspace contracts landed
 * and is the last of the inert effects. It stayed inert for a reason the other
 * two did not share: `navigate`, `approve-step` and `save` each resolve against
 * something the workspace already holds — a section registry, the task queue,
 * the context shelf — and `undo` resolves against a record of past operations
 * that did not exist. This module is that record, and nothing more. It has no
 * producer, no card, no channel and no caller; wiring it is the next slice, and
 * doing it here would put an undo button in front of a design that has not been
 * reviewed yet.
 *
 * Three rules decide the shape:
 *
 * 1. **Ids only, never a copy of the entity.** `agentSave.ts` stores a context
 *    id and re-reads the word and the gloss from the live shelf, so a save can
 *    never write back a value the user has since edited. An operation log has
 *    the same exposure and a sharper version of it: a log that captured the old
 *    value of a row *is* a stale copy by construction, and restoring one would
 *    silently revert edits nobody asked to lose. So an entry names what was
 *    touched and refuses to remember what it looked like.
 * 2. **An inverse is an operation the registry already exposes, or there is no
 *    inverse.** `AGENT_INVERSE_OPERATIONS` maps a forward operation to the
 *    reverse operation the tool registry defines. This is not a convenience: it
 *    means the undo of a gated action is itself a gated action, subject to
 *    `evaluateAgentToolAccess` against the profile as it is at undo time, with
 *    no second, weaker path into tool execution. An operation with no entry in
 *    that table is not "hard to undo" — it is not invertible, and the honest
 *    answer for it is a refusal.
 * 3. **Undoing onto state that moved is the defect this exists to prevent.** If
 *    anything newer touched an entity the entry names, the inverse refuses as
 *    `superseded`. A best-effort undo that ran anyway would discard whatever
 *    happened in between, which is a worse outcome than the one the user was
 *    trying to reverse.
 *
 * What this module deliberately does **not** do is look at live state. It
 * answers "what would the inverse of this be", expressed as ids, from the log
 * alone. Whether that inverse can run *today* — whether the deck still exists,
 * whether the profile still permits the reverse operation — is the future
 * resolver's job, exactly as `agentSave.ts` splits the stored effect from the
 * live resolution. `entity-not-found` is in the failure vocabulary for that
 * resolver to raise; nothing in this file can raise it, and that seam is the
 * point.
 */

import type { AgentToolOperationId } from './localAgent';

/**
 * What an effect claims it did to the entities it names.
 *
 * Only `created` can be inverted from ids alone: deleting what was created
 * needs nothing but the ids. `updated` and `deleted` would need the prior value
 * to restore, and rule 1 says this log does not have one — so they are recorded
 * honestly and refused honestly rather than half-supported. `read` changed
 * nothing and has nothing to undo.
 */
export type AgentOperationClaim = 'created' | 'updated' | 'deleted' | 'read';

/**
 * Forward operation to the reverse operation the tool registry already exposes.
 *
 * Every value here is a real `AgentToolOperationId` with its own permission
 * floor and its own confirmation rule. An operation absent from this table has
 * no inverse — see rule 2 in the file header. In particular there is no entry
 * for a delete: the registry has no "restore" for anything, and inventing one
 * out of a log that stores ids only would be a lie about what can be recovered.
 */
export const AGENT_INVERSE_OPERATIONS: Readonly<
  Partial<Record<AgentToolOperationId, AgentToolOperationId>>
> = {
  'flashcard.create-deck': 'flashcard.delete-deck',
  'flashcard.add-cards': 'flashcard.delete-cards',
  'media.add-item': 'media.delete-item',
  'calendar.schedule-session': 'calendar.delete-event',
  'calendar.create-reminder': 'calendar.delete-event',
  'study.filter-vocabulary': 'study.undo-filter',
  'settings.apply-theme': 'settings.undo-theme',
  'settings.apply-css': 'settings.reset-css',
};

/** The reverse operation, or `null` when the forward one cannot be undone. */
export function agentInverseOperation(
  operation: AgentToolOperationId,
): AgentToolOperationId | null {
  return AGENT_INVERSE_OPERATIONS[operation] ?? null;
}

/**
 * One completed effect, as the log remembers it.
 *
 * `entityIds` are ids and stay ids. `taskId`/`stepId` are optional because not
 * every operation runs inside a planned task — a one-shot tool call from a card
 * has a `callId` and nothing else.
 */
export interface AgentOperationEntry {
  /** Monotonic, assigned on append. This is what an `undo` effect names. */
  sequence: number;
  /** Stable and derived, so a test and a UI key can both name one. */
  id: string;
  operation: AgentToolOperationId;
  claim: AgentOperationClaim;
  entityType: string;
  entityIds: readonly string[];
  /**
   * What the step was ASKED to do, as opposed to what it reports having done.
   *
   * The pipeline terminal needs both: `entityIds` answer "did something land",
   * and only these answer "did it aim at the book and the chapters the user
   * meant". A step that created three cards from the wrong chapter is
   * indistinguishable from a correct one without them.
   *
   * Optional because not every effect has arguments — an undo takes none beyond
   * the entry it reverses — and because an entry recorded before this field
   * existed is still a valid record, not a broken one.
   */
  arguments?: Readonly<Record<string, unknown>>;
  callId: string;
  /** Exact conversation origin when the operation came from a conversation plan. */
  conversationId?: string;
  taskId?: string;
  stepId?: string;
  recordedAt: number;
  /** Set when this entry is itself the inverse of an earlier one. */
  invertsSequence?: number;
}

/** An entry as a caller supplies it; the log assigns the rest. */
export type AgentOperationDraft = Omit<AgentOperationEntry, 'sequence' | 'id' | 'recordedAt'>;

export interface AgentOperationLog {
  /** Newest first, the same order `agentTimeline` keeps its attempts in. */
  entries: readonly AgentOperationEntry[];
  /** Total ever appended. Also the sequence the next append will take. */
  appended: number;
  /** How many the bound has dropped, so a rolled-past entry is distinguishable. */
  dropped: number;
}

/**
 * The same bound `AGENT_TIMELINE_LIMIT` uses, and picked the same way: this is
 * per-workspace state that a long session would otherwise grow without limit,
 * and the recent entries are the only ones an undo is plausibly aimed at.
 * Keeping the two numbers equal is deliberate — an entry that has fallen out of
 * the timeline the user is reading should not still be offered as undoable.
 */
export const AGENT_OPERATION_LOG_LIMIT = 200;

export const AGENT_OPERATION_LOG_EMPTY: AgentOperationLog = {
  entries: [],
  appended: 0,
  dropped: 0,
};

/**
 * Appends one completed effect. Append-only: nothing already in the log is
 * mutated, for the reason `agentTimeline` never mutates a terminal attempt — a
 * record that can be edited after the fact is not a record.
 */
export function agentOperationLogAppend(
  log: AgentOperationLog,
  draft: AgentOperationDraft,
  now: number,
): AgentOperationLog {
  const sequence = log.appended;
  const entry: AgentOperationEntry = {
    ...draft,
    entityIds: [...draft.entityIds],
    // Copied for the same reason `entityIds` is: the caller usually passes the
    // live `step.request.arguments`, and a record that changes when its source
    // is edited later is not a record. The copy is shallow, which covers exactly
    // what the terminal renders — the keys, the primitives, and an array's
    // length. A nested array's CONTENTS are still shared and are not part of the
    // record's guarantee.
    ...(draft.arguments ? { arguments: { ...draft.arguments } } : {}),
    sequence,
    id: `${draft.callId}|${sequence}`,
    recordedAt: now,
  };
  const entries = [entry, ...log.entries];
  const kept = entries.slice(0, AGENT_OPERATION_LOG_LIMIT);
  return {
    entries: kept,
    appended: log.appended + 1,
    dropped: log.dropped + (entries.length - kept.length),
  };
}

/** The entry with that sequence, or `null` if it is not retained. */
export function agentOperationEntry(
  log: AgentOperationLog,
  sequence: number,
): AgentOperationEntry | null {
  return log.entries.find((entry) => entry.sequence === sequence) ?? null;
}

/** The retained entry with this stable id, or `null` when it is absent. */
export function agentOperationEntryById(
  log: AgentOperationLog,
  id: string,
): AgentOperationEntry | null {
  return log.entries.find((entry) => entry.id === id) ?? null;
}

export type AgentOperationInverseFailureCode =
  | 'invalid-request'
  | 'entry-not-found'
  | 'log-rolled'
  | 'not-invertible'
  | 'entity-not-named'
  | 'already-undone'
  | 'superseded'
  /**
   * Raised only by the future live resolver. It is declared here so the two
   * halves share one vocabulary, exactly as `agentSave`'s codes span its
   * resolver and its lifecycle — nothing in this module can produce it, because
   * nothing in this module reads live state.
   */
  | 'entity-not-found';

/**
 * What undoing an entry would mean, expressed only as ids and an operation id.
 *
 * There is no payload and no restored value, by rule 1. The resolver that
 * eventually runs this re-derives everything it needs from live state and
 * re-authorizes `operation` at the moment of action.
 */
export interface AgentOperationInverse {
  /** The entry being undone. */
  sequence: number;
  operation: AgentToolOperationId;
  entityType: string;
  entityIds: readonly string[];
  taskId?: string;
  stepId?: string;
}

export type AgentOperationInverseResolution =
  | { ok: true; inverse: AgentOperationInverse }
  | { ok: false; code: AgentOperationInverseFailureCode };

/**
 * Whether an inverse is even definable for a retained entry, and what it is.
 *
 * Every refusal is its own code because they mean different things to the user:
 * an entry that rolled out of the log is a limit they can understand, an
 * operation that was never invertible is a permanent no, and a superseded entry
 * is a warning that something else moved underneath it.
 *
 * The order is chosen so the truest sentence wins. "That was never undoable"
 * outranks "something changed since", because the latter would imply undo were
 * possible if only they had been quicker.
 */
export function resolveAgentOperationInverse(
  log: AgentOperationLog,
  sequence: number,
): AgentOperationInverseResolution {
  if (!Number.isInteger(sequence) || sequence < 0) {
    return { ok: false, code: 'invalid-request' };
  }
  if (sequence >= log.appended) return { ok: false, code: 'entry-not-found' };

  const entry = agentOperationEntry(log, sequence);
  // Retained sequences are contiguous, so anything below the appended count and
  // not present fell off the bound rather than never having existed.
  if (!entry) return { ok: false, code: 'log-rolled' };

  if (entry.claim !== 'created') return { ok: false, code: 'not-invertible' };
  const inverse = agentInverseOperation(entry.operation);
  if (!inverse) return { ok: false, code: 'not-invertible' };
  // An entry that acted on nothing has no inverse to aim at. Refusing beats
  // resolving to an inverse over an empty id list, which would run and claim to
  // have undone something.
  if (entry.entityIds.length === 0) return { ok: false, code: 'entity-not-named' };

  const newer = log.entries.filter((other) => other.sequence > sequence);
  if (newer.some((other) => other.invertsSequence === sequence)) {
    return { ok: false, code: 'already-undone' };
  }
  // Supersession is decided from the log alone: any later entry that named one
  // of the same ids moved the state this inverse would land on. `read` is
  // excluded because looking at a row is not touching it.
  const touched = new Set(entry.entityIds);
  if (newer.some((other) => (
    other.claim !== 'read' && other.entityIds.some((id) => touched.has(id))
  ))) {
    return { ok: false, code: 'superseded' };
  }

  return {
    ok: true,
    inverse: {
      sequence,
      operation: inverse,
      entityType: entry.entityType,
      entityIds: [...entry.entityIds],
      ...(entry.taskId !== undefined ? { taskId: entry.taskId } : {}),
      ...(entry.stepId !== undefined ? { stepId: entry.stepId } : {}),
    },
  };
}

/** Resolves the persisted `undo.operationId` without trusting it as a sequence. */
export function resolveAgentOperationInverseById(
  log: AgentOperationLog,
  operationId: string,
): AgentOperationInverseResolution {
  if (typeof operationId !== 'string' || !operationId.trim()) {
    return { ok: false, code: 'invalid-request' };
  }
  const entry = agentOperationEntryById(log, operationId);
  if (!entry) return { ok: false, code: 'entry-not-found' };
  return resolveAgentOperationInverse(log, entry.sequence);
}

/** Newest currently invertible entry, used by the deterministic card producer. */
export function latestAgentOperationInverse(
  log: AgentOperationLog,
): { entry: AgentOperationEntry; inverse: AgentOperationInverse } | null {
  for (const entry of log.entries) {
    const resolution = resolveAgentOperationInverse(log, entry.sequence);
    if (resolution.ok) return { entry, inverse: resolution.inverse };
  }
  return null;
}
