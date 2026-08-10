/** Renderer live inputs and the single side effect for Agent Undo. */

import {
  effectiveAgentPermission,
  getActiveAgentProfile,
} from '../shared/localAgentProfiles';
import type { AgentPermissionLevel, AgentToolOperationId } from '../shared/localAgent';
import {
  resolveAgentUndo,
  type AgentUndoFailureCode,
  type AgentUndoTarget,
} from '../shared/agentUndo';
import type { AgentOperationDraft, AgentOperationLog } from '../shared/agentOperationLog';
import { loadDeck } from './flashcardDeck';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import { loadLocalAgentSettings } from './localAgentSettingsStore';
import {
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
  type AgentToolRegistryTranslate,
} from './agentToolRegistry';

export interface AgentUndoContext {
  permission: AgentPermissionLevel;
  allowedOperations: readonly AgentToolOperationId[];
  liveEntityIds: ReadonlySet<string>;
}

export function readAgentUndoContext(t: AgentToolRegistryTranslate): AgentUndoContext {
  const profile = getActiveAgentProfile(loadLocalAgentProfiles());
  const handlers = createCentralAgentToolRegistry(t);
  const available = availableAgentToolOperationIds(handlers);
  const enabled = new Set(profile?.enabledOperations ?? []);
  return {
    permission: effectiveAgentPermission(loadLocalAgentSettings().permission, profile),
    allowedOperations: profile ? available.filter((id) => enabled.has(id)) : available,
    liveEntityIds: new Set(loadDeck().map((card) => card.id)),
  };
}

export type AgentUndoResult =
  | { ok: true; operation: AgentOperationDraft }
  | { ok: false; code: AgentUndoFailureCode };

/**
 * Re-resolves the whole gate immediately before invoking the installed inverse
 * adapter. No target shown during review is trusted for execution.
 */
export async function performAgentUndo(
  log: AgentOperationLog,
  operationId: string,
  t: AgentToolRegistryTranslate,
): Promise<AgentUndoResult> {
  let context: AgentUndoContext;
  try {
    context = readAgentUndoContext(t);
  } catch {
    return { ok: false, code: 'store-failed' };
  }
  const resolution = resolveAgentUndo(
    log,
    operationId,
    context.permission,
    context.liveEntityIds,
    context.allowedOperations,
  );
  if (!resolution.ok) return resolution;

  const target: AgentUndoTarget = resolution.target;
  const handler = createCentralAgentToolRegistry(t)[target.operation];
  if (!handler) return { ok: false, code: 'operation-unavailable' };
  try {
    await handler({ ids: [...target.entityIds] });
    const remaining = new Set(loadDeck().map((card) => card.id));
    if (target.entityIds.some((id) => remaining.has(id))) {
      return { ok: false, code: 'undo-failed' };
    }
  } catch {
    return { ok: false, code: 'undo-failed' };
  }

  return {
    ok: true,
    operation: {
      operation: target.operation,
      claim: 'deleted',
      entityType: target.entityType,
      entityIds: [...target.entityIds],
      callId: `undo|${operationId}`,
      invertsSequence: target.sequence,
    },
  };
}
