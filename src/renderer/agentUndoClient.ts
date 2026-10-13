/** Renderer live inputs and the single side effect for Agent Undo. */

import {
  agentUndoAuthority,
  effectiveAgentPermission,
  getActiveAgentProfile,
} from '../shared/localAgentProfiles';
import type { AgentPermissionLevel, AgentToolOperationId } from '../shared/localAgent';
import {
  AGENT_UNDO_RESTORING_OPERATIONS,
  agentUndoInvocations,
  resolveAgentUndo,
  type AgentUndoFailureCode,
  type AgentUndoLiveEntities,
  type AgentUndoTarget,
} from '../shared/agentUndo';
import {
  agentOperationEntryById,
  type AgentOperationDraft,
  type AgentOperationLog,
} from '../shared/agentOperationLog';
import { loadDeck, loadDeckFolders } from './flashcardDeck';
import { loadEvents } from './calendar';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import { loadLocalAgentSettings } from './localAgentSettingsStore';
import {
  AGENT_UNDO_CHANGED_SINCE,
  agentCalendarEventFingerprint,
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
  type AgentToolRegistryTranslate,
} from './agentToolRegistry';

export interface AgentUndoContext {
  permission: AgentPermissionLevel;
  allowedOperations: readonly AgentToolOperationId[];
  liveEntityIds: AgentUndoLiveEntities;
}

/** The one Undo a context is read for: its log entry decides what the Undo is authorized by. */
export interface AgentUndoSubject {
  log: AgentOperationLog;
  operationId: string;
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

/**
 * The permission and allow-list an Undo is checked against, read live.
 *
 * With a `subject`, the Undo of the Agent's OWN write is authorized by that write
 * (`agentUndoAuthority`): a profile that may schedule a session may take back the session
 * it scheduled, without being granted `calendar.delete-event` in general. Before this, every
 * calendar Undo under the Tutor and Automation profiles was offered and then refused.
 */
export async function readAgentUndoContext(
  t: AgentToolRegistryTranslate,
  subject?: AgentUndoSubject,
): Promise<AgentUndoContext> {
  const profile = getActiveAgentProfile(loadLocalAgentProfiles());
  const handlers = createCentralAgentToolRegistry(t);
  const available = availableAgentToolOperationIds(handlers);
  const enabled = new Set(profile?.enabledOperations ?? []);
  const permission = effectiveAgentPermission(loadLocalAgentSettings().permission, profile);
  const allowedOperations = profile ? available.filter((id) => enabled.has(id)) : available;
  const forward = subject ? agentOperationEntryById(subject.log, subject.operationId) : null;
  const authority = forward
    ? agentUndoAuthority(forward.operation, permission, allowedOperations)
    : { permission, allowedOperations };
  return {
    permission: authority.permission,
    // Only an operation this build actually installs can be added by the grant.
    allowedOperations: (authority.allowedOperations ?? allowedOperations).filter((id) => available.includes(id)),
    liveEntityIds: await readLiveEntities(),
  };
}

/**
 * The same draft, with what an Undo of it needs to refuse an edited target: for events the
 * Agent created, a digest of each one as it was made (`agentCalendarEventFingerprint`). Call it
 * when the draft is appended, which is right after the write. Every other draft is returned
 * as is. An id that is not live (nothing to protect) leaves the draft without digests, so its
 * Undo refuses as `entity-not-found` exactly as before.
 */
export function withAgentUndoBaseline(draft: AgentOperationDraft): AgentOperationDraft {
  if (draft.entityType !== 'calendar-event' || draft.claim !== 'created' || draft.inverseArguments?.length) {
    return draft;
  }
  let events: ReturnType<typeof loadEvents>;
  try {
    events = loadEvents();
  } catch {
    return draft;
  }
  const byId = new Map(events.map((event) => [event.id, event]));
  const baseline = draft.entityIds.map((id) => {
    const event = byId.get(id);
    return event ? { id, expect: agentCalendarEventFingerprint(event) } : null;
  });
  if (!baseline.length || baseline.some((call) => call === null)) return draft;
  return { ...draft, inverseArguments: baseline as Array<Record<string, unknown>> };
}

/** The recorded baseline of a CREATED entry, one call per id in the entry's own order. */
function createdBaseline(
  log: AgentOperationLog,
  operationId: string,
  target: AgentUndoTarget,
): Array<Record<string, unknown>> | undefined {
  const entry = agentOperationEntryById(log, operationId);
  const recorded = entry?.claim === 'created' ? entry.inverseArguments : undefined;
  if (!recorded?.length || recorded.length !== target.entityIds.length) return undefined;
  const aligned = recorded.every((call, index) => call.id === target.entityIds[index]);
  return aligned ? recorded.map((call) => ({ ...call })) : undefined;
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
    context = await readAgentUndoContext(t, { log, operationId });
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
  const restoring = AGENT_UNDO_RESTORING_OPERATIONS.has(target.operation);
  const invocations = agentUndoInvocations(
    target.operation,
    target.entityIds,
    target.arguments ?? createdBaseline(log, operationId, target),
  );
  try {
    // One call per invocation: the single-entity deletes take an `id` each, and
    // only `flashcard.delete-cards` accepts the whole list at once.
    //
    // Every target is checked BEFORE the first one is removed, so an Undo of a planned week
    // in which the user edited one session deletes none of them rather than all but one.
    if (target.operation === 'calendar.delete-event') {
      const live = new Map(loadEvents().map((event) => [event.id, event]));
      for (const invocation of invocations) {
        const event = live.get(String(invocation.id));
        if (invocation.expect !== undefined && (!event || agentCalendarEventFingerprint(event) !== invocation.expect)) {
          return { ok: false, code: 'superseded' };
        }
      }
    }
    for (const invocation of invocations) {
      await handler(invocation);
    }
    // Re-read live state for THIS entity type. A removing inverse must leave no id
    // behind; a restoring one (a move put back) checked its own precondition and
    // threw if the event had moved since, so reaching here is its proof.
    if (!restoring) {
      const remaining = (await readLiveEntities())(target.entityType);
      if (target.entityIds.some((id) => remaining.has(id))) {
        return { ok: false, code: 'undo-failed' };
      }
    }
  } catch (error) {
    // "Changed since" is a refusal with a reason the user can act on, not a failure.
    const code = (error as { code?: unknown } | null)?.code;
    return { ok: false, code: code === AGENT_UNDO_CHANGED_SINCE ? 'superseded' : 'undo-failed' };
  }

  return {
    ok: true,
    operation: {
      operation: target.operation,
      claim: restoring ? 'updated' : 'deleted',
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
