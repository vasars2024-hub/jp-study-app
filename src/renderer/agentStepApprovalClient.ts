/**
 * The renderer half of the `approve-step` gate: what the Agent surface reads to
 * ask the question, and what it does once the user has answered.
 *
 * The gate itself is `shared/agentStepApproval.ts` and is pure. This module
 * supplies the two live inputs it needs — the main-owned task queue and the
 * profile's effective permission — and, on a grant, performs the single side
 * effect the approval authorizes: running that one step.
 *
 * The grant does not persist a `confirmed` flag, and cannot: `executeAgentTaskStep`
 * overwrites `request.confirmed` from its own `confirmedCallIds` set on every
 * run. That is a deliberate property worth preserving rather than routing
 * around — a confirmation is a decision made once, by a person who was looking
 * at the step, and a persisted one would authorize a re-run nobody watched. So
 * the grant supplies exactly one call id, for exactly one run.
 */

import { runAgentTaskStep } from './localAgentQueueRun';
import {
  loadLocalAgentTaskQueue,
  onLocalAgentTaskQueueChanged,
} from './localAgentTaskQueueStore';
import {
  loadLocalAgentProfiles,
  onLocalAgentProfilesChanged,
} from './localAgentProfilesStore';
import {
  loadLocalAgentSettings,
  onLocalAgentSettingsChanged,
} from './localAgentSettingsStore';
import { initAgentOperationalState } from './agentOperationalClient';
import {
  effectiveAgentPermission,
  getActiveAgentProfile,
} from '../shared/localAgentProfiles';
import {
  availableAgentToolOperationIds,
  type AgentToolRegistryTranslate,
  createCentralAgentToolRegistry,
} from './agentToolRegistry';
import type {
  AgentPermissionLevel,
  AgentToolHandlers,
  AgentToolOperationId,
} from '../shared/localAgent';
import type { AgentTaskQueue } from '../shared/localAgentTaskQueue';
import type { AgentConversation } from '../shared/agentWorkspace';
import {
  resolveAgentStepApproval,
  type AgentStepApprovalFailureCode,
} from '../shared/agentStepApproval';

export interface AgentStepApprovalContext {
  queue: AgentTaskQueue;
  permission: AgentPermissionLevel;
  /**
   * The operations the active profile permits *and* this renderer can actually
   * perform. Both halves matter: a profile may name an operation no handler
   * implements, and a handler may exist for an operation the profile forbids.
   */
  allowedOperations: readonly AgentToolOperationId[];
  handlers: AgentToolHandlers;
}

/**
 * Reads every live input the gate needs, at the moment it is asked.
 *
 * Deliberately not cached and not a hook. The queue is main-owned and changes
 * from other windows, and the profile can be narrowed while a card sits on
 * screen; a value captured when the message rendered would let the user approve
 * against a permission set that no longer exists.
 */
export function readAgentStepApprovalContext(
  t: AgentToolRegistryTranslate,
): AgentStepApprovalContext {
  const handlers = createCentralAgentToolRegistry(t);
  const profile = getActiveAgentProfile(loadLocalAgentProfiles());
  const available = availableAgentToolOperationIds(handlers);
  const enabled = new Set(profile?.enabledOperations ?? []);
  return {
    queue: loadLocalAgentTaskQueue(),
    permission: effectiveAgentPermission(loadLocalAgentSettings().permission, profile),
    allowedOperations: profile ? available.filter((id) => enabled.has(id)) : available,
    handlers,
  };
}

/**
 * Publishes one hydrated, live approval context to a shell-level owner.
 *
 * The subscriptions are installed before hydration so no change can fall into
 * the gap between the main-owned queue load and listener registration. Their
 * callbacks remain muted until hydration resolves; the explicit read after that
 * resolution incorporates any event that arrived while the queue was loading.
 * A shell can pass the resulting snapshot to every historical message instead
 * of installing a queue/profile/settings listener for each card.
 */
export function observeAgentStepApprovalContext(
  t: AgentToolRegistryTranslate,
  listener: (context: AgentStepApprovalContext) => void,
): () => void {
  let active = true;
  let hydrated = false;
  const publish = (): void => {
    if (active && hydrated) listener(readAgentStepApprovalContext(t));
  };

  const offQueue = onLocalAgentTaskQueueChanged(publish);
  const offProfiles = onLocalAgentProfilesChanged(publish);
  const offSettings = onLocalAgentSettingsChanged(publish);

  void initAgentOperationalState().then(() => {
    if (!active) return;
    hydrated = true;
    publish();
  });

  return () => {
    active = false;
    offQueue();
    offProfiles();
    offSettings();
  };
}

export type AgentStepGrantResult =
  | { ok: true }
  | { ok: false; code: AgentStepApprovalFailureCode };

/**
 * Runs the approved step and writes the outcome back onto the queue.
 *
 * The queue is re-read inside rather than taken from the caller's context: the
 * user may have spent a while reading the review, and the write-back must land
 * on the freshest queue or it would revert a pause or a cancel made meanwhile.
 * The step is re-located by id for the same reason — if it stopped waiting while
 * the review was open, this refuses rather than running something else.
 */
export async function grantAgentStepApproval(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
  t: AgentToolRegistryTranslate,
): Promise<AgentStepGrantResult> {
  // The gate again, in full, against inputs read now. An earlier version of this
  // function re-implemented a subset of it — it checked the step's status and
  // not the queue row's — and an independent review found the hole that leaves:
  // `cancelAgentQueueItem` marks the row and never touches the task, so a step
  // of a cancelled task is still `waiting-confirmation` and ran anyway. Review,
  // then cancel from the queue panel, then approve, and the operation executed.
  //
  // Re-implementing part of a gate is how that happens, so nothing is
  // re-implemented here. The resolver is pure precisely so both callers can ask
  // it the same question, and its own header says a gate that resolves
  // differently depending on who is asking is not a gate.
  const context = readAgentStepApprovalContext(t);
  const resolution = resolveAgentStepApproval(
    conversation,
    context.queue,
    messageId,
    cardId,
    actionId,
    context.permission,
    context.allowedOperations,
  );
  if (!resolution.ok) return { ok: false, code: resolution.code };

  const item = context.queue.items.find((entry) => entry.task.id === resolution.approval.taskId);
  const step = item?.task.steps.find((entry) => entry.id === resolution.approval.stepId);
  if (!item || !step) return { ok: false, code: 'step-not-found' };

  let result: Awaited<ReturnType<typeof runAgentTaskStep>>;
  try {
    result = await runAgentTaskStep(context.queue, item.task, step, {
      permission: context.permission,
      allowedOperations: context.allowedOperations,
      handlers: context.handlers,
      // One id, for one run. See the module header.
      confirmedCallIds: new Set([step.request.callId]),
    });
  } catch {
    return { ok: false, code: 'approve-failed' };
  }
  if (result.leaseRefusal) return { ok: false, code: 'step-not-found' };
  if (result.leaseCommitFailure) return { ok: false, code: 'store-failed' };
  if (result.refusal) return { ok: false, code: result.refusal.code };

  // The step ran; whether it *succeeded* is the task's own report, and saying
  // otherwise would make this control the second place a step's outcome is
  // claimed. A step still waiting afterwards means the run refused it.
  const after = result.task.steps.find((entry) => entry.id === resolution.approval.stepId);
  if (after?.status === 'failed') return { ok: false, code: 'approve-failed' };
  if (after?.status === 'waiting-confirmation') return { ok: false, code: 'step-not-awaiting' };
  return { ok: true };
}
