/** Renderer live inputs and the single side effect for Agent Undo. */

import {
  effectiveAgentPermission,
  getActiveAgentProfile,
} from '../shared/localAgentProfiles';
import type { AgentPermissionLevel, AgentToolOperationId } from '../shared/localAgent';
import {
  agentUndoInvocations,
  resolveAgentUndo,
  type AgentUndoFailureCode,
  type AgentUndoLiveEntities,
  type AgentUndoTarget,
} from '../shared/agentUndo';
import type { AgentOperationDraft, AgentOperationLog } from '../shared/agentOperationLog';
import { loadDeck, loadDeckFolders } from './flashcardDeck';
import { loadEvents } from './calendar';
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
  liveEntityIds: AgentUndoLiveEntities;
}

/**
 * Live ids per entity type, read fresh at review time and again after the
 * inverse runs. `media-item` is the reason this is async: its ids come from
 * main, and a resolver that could not await would have to leave media out or
 * answer from a stale copy.
 *
 * An unknown entity type yields an EMPTY set, so it refuses as
 * `entity-not-found` rather than passing a check nothing performed.
 */
async function readLiveEntities(): Promise<AgentUndoLiveEntities> {
  // A missing or failing media channel must not take the three local entity
  // types down with it — an Undo of a deck or a calendar event does not need
  // main at all.
  const media = await Promise.resolve()
    .then(() => window.api?.listMedia?.() ?? [])
    .catch(() => []);
  const byType = new Map<string, ReadonlySet<string>>([
    ['flashcard', new Set(loadDeck().map((card) => card.id))],
    ['flashcard-deck', new Set(loadDeckFolders())],
    ['calendar-event', new Set(loadEvents().map((event) => event.id))],
    ['media-item', new Set(media.map((item) => item.id))],
  ]);
  return (entityType) => byType.get(entityType) ?? new Set<string>();
}

export async function readAgentUndoContext(
  t: AgentToolRegistryTranslate,
): Promise<AgentUndoContext> {
  const profile = getActiveAgentProfile(loadLocalAgentProfiles());
  const handlers = createCentralAgentToolRegistry(t);
  const available = availableAgentToolOperationIds(handlers);
  const enabled = new Set(profile?.enabledOperations ?? []);
  return {
    permission: effectiveAgentPermission(loadLocalAgentSettings().permission, profile),
    allowedOperations: profile ? available.filter((id) => enabled.has(id)) : available,
    liveEntityIds: await readLiveEntities(),
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
    context = await readAgentUndoContext(t);
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
    // One call per invocation: the single-entity deletes take an `id` each, and
    // only `flashcard.delete-cards` accepts the whole list at once.
    for (const invocation of agentUndoInvocations(target.operation, target.entityIds)) {
      await handler(invocation);
    }
    // Re-read live state for THIS entity type. Every supported inverse removes,
    // so a surviving id means the adapter reported success without doing it.
    const remaining = (await readLiveEntities())(target.entityType);
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
      // An undo has one real input: the step it reverses. Naming it is what
      // makes the terminal's two lines readable as a pair rather than as an
      // unexplained delete that appeared after a create.
      arguments: { inverts: target.sequence },
      callId: `undo|${operationId}`,
      invertsSequence: target.sequence,
    },
  };
}
