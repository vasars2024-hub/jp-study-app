/**
 * Permission-gated Undo for deterministic Agent effects.
 *
 * The operation log stores ids only. This module turns one retained entry into
 * an explicit result-card action, resolves that action against live entity
 * existence, and re-checks the inverse operation against the active permission
 * and profile allow-list. It never restores a captured value.
 */

import {
  resolveAgentOperationInverseById,
  type AgentOperationInverseFailureCode,
  type AgentOperationLog,
} from './agentOperationLog';
import {
  evaluateAgentToolAccess,
  type AgentPermissionLevel,
  type AgentToolOperationId,
} from './localAgent';
import type { AgentResultCardAction } from './agentWorkspace';

/** Inverses with an installed, live-state-aware renderer adapter in this slice. */
export const AGENT_UNDO_SUPPORTED_OPERATIONS: ReadonlySet<AgentToolOperationId> = new Set([
  'flashcard.delete-cards',
]);

export type AgentUndoFailureCode = AgentOperationInverseFailureCode
  | 'operation-unavailable'
  | 'operation-denied'
  | 'busy'
  | 'undo-failed'
  | 'store-failed';

export interface AgentUndoTarget {
  operationId: string;
  sequence: number;
  operation: AgentToolOperationId;
  entityType: string;
  entityIds: readonly string[];
}

export type AgentUndoResolution =
  | { ok: true; target: AgentUndoTarget }
  | { ok: false; code: AgentUndoFailureCode };

/**
 * Produces a typed action only while the named effect is currently invertible.
 * The label is deliberately non-authoritative; the UI supplies localized chrome
 * and the resolver derives the target from the log again.
 */
export function agentUndoActionForCall(
  log: AgentOperationLog,
  callId: string,
): AgentResultCardAction | null {
  const entry = log.entries.find((candidate) => candidate.callId === callId);
  if (!entry) return null;
  const resolution = resolveAgentOperationInverseById(log, entry.id);
  if (!resolution.ok || !AGENT_UNDO_SUPPORTED_OPERATIONS.has(resolution.inverse.operation)) {
    return null;
  }
  return {
    id: `undo-${entry.id}`,
    label: entry.entityType,
    effect: { type: 'undo', operationId: entry.id },
    destructive: true,
  };
}

/** Whether the retained operation has already been reversed. */
export function agentOperationWasUndone(log: AgentOperationLog, callId: string): boolean {
  const entry = log.entries.find((candidate) => candidate.callId === callId);
  return Boolean(entry && log.entries.some((candidate) => candidate.invertsSequence === entry.sequence));
}

/**
 * Resolves one deterministic Undo action against the log, live entities and
 * authorization as they exist now. `liveEntityIds` are scoped to `entityType`
 * by the caller; no content or stale row snapshot crosses this boundary.
 */
export function resolveAgentUndo(
  log: AgentOperationLog,
  operationId: string,
  permission: AgentPermissionLevel,
  liveEntityIds: ReadonlySet<string>,
  allowedOperations?: readonly AgentToolOperationId[],
): AgentUndoResolution {
  const resolution = resolveAgentOperationInverseById(log, operationId);
  if (!resolution.ok) return resolution;
  const inverse = resolution.inverse;
  if (!AGENT_UNDO_SUPPORTED_OPERATIONS.has(inverse.operation)) {
    return { ok: false, code: 'operation-unavailable' };
  }
  if (inverse.entityIds.some((id) => !liveEntityIds.has(id))) {
    return { ok: false, code: 'entity-not-found' };
  }
  const decision = evaluateAgentToolAccess(
    {
      callId: `undo-${operationId}`,
      operation: inverse.operation,
      arguments: { ids: [...inverse.entityIds] },
    },
    permission,
    allowedOperations,
  );
  if (decision.status === 'denied') return { ok: false, code: 'operation-denied' };
  return {
    ok: true,
    target: {
      operationId,
      sequence: inverse.sequence,
      operation: inverse.operation,
      entityType: inverse.entityType,
      entityIds: [...inverse.entityIds],
    },
  };
}

export type AgentUndoStatus = 'idle' | 'review' | 'running' | 'undone' | 'failed' | 'cancelled';

export interface AgentUndoRun {
  status: AgentUndoStatus;
  attempts: number;
  target?: AgentUndoTarget;
  code?: AgentUndoFailureCode;
}

export type AgentUndoEvent =
  | { type: 'review'; target: AgentUndoTarget }
  | { type: 'refused'; code: AgentUndoFailureCode }
  | { type: 'confirm' }
  | { type: 'succeeded' }
  | { type: 'cancel' }
  | { type: 'failed'; code: AgentUndoFailureCode }
  | { type: 'retry' };

export const AGENT_UNDO_IDLE: AgentUndoRun = { status: 'idle', attempts: 0 };

export function agentUndoReduce(run: AgentUndoRun, event: AgentUndoEvent): AgentUndoRun {
  switch (event.type) {
    case 'review':
      return { status: 'review', attempts: run.attempts, target: event.target };
    case 'refused':
      return { status: 'failed', attempts: run.attempts, code: event.code };
    case 'confirm':
      return run.status === 'review' && run.target
        ? { status: 'running', attempts: run.attempts + 1, target: run.target }
        : run;
    case 'succeeded':
      return run.status === 'running'
        ? { status: 'undone', attempts: run.attempts, target: run.target }
        : run;
    case 'cancel':
      return run.status === 'review'
        ? { status: 'cancelled', attempts: run.attempts, target: run.target }
        : run;
    case 'failed':
      return run.status === 'running'
        ? { status: 'failed', attempts: run.attempts, target: run.target, code: event.code }
        : run;
    case 'retry':
      return run.status === 'failed' || run.status === 'cancelled'
        ? { status: 'idle', attempts: run.attempts }
        : run;
  }
}
