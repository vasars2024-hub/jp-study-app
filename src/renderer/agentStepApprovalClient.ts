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

import {
  runAgentTaskStep,
  applyAgentRunToQueue,
} from './localAgentQueueRun';
import { loadLocalAgentTaskQueue, saveLocalAgentTaskQueue } from './localAgentTaskQueueStore';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import { loadLocalAgentSettings } from './localAgentSettingsStore';
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
import type {
  AgentStepApproval,
  AgentStepApprovalFailureCode,
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
  approval: AgentStepApproval,
  context: AgentStepApprovalContext,
): Promise<AgentStepGrantResult> {
  const queue = loadLocalAgentTaskQueue();
  const item = queue.items.find((entry) => entry.task.id === approval.taskId);
  if (!item) return { ok: false, code: 'task-not-found' };
  const step = item.task.steps.find((entry) => entry.id === approval.stepId);
  if (!step) return { ok: false, code: 'step-not-found' };
  if (step.status !== 'waiting-confirmation') return { ok: false, code: 'step-not-awaiting' };

  let result: Awaited<ReturnType<typeof runAgentTaskStep>>;
  try {
    result = await runAgentTaskStep(queue, item.task, step, {
      permission: context.permission,
      allowedOperations: context.allowedOperations,
      handlers: context.handlers,
      // One id, for one run. See the module header.
      confirmedCallIds: new Set([step.request.callId]),
    });
  } catch {
    return { ok: false, code: 'approve-failed' };
  }

  try {
    saveLocalAgentTaskQueue(applyAgentRunToQueue(loadLocalAgentTaskQueue(), result.task));
  } catch {
    return { ok: false, code: 'store-failed' };
  }

  // The step ran; whether it *succeeded* is the task's own report, and saying
  // otherwise would make this control the second place a step's outcome is
  // claimed. A step still waiting afterwards means the run refused it.
  const after = result.task.steps.find((entry) => entry.id === approval.stepId);
  if (after?.status === 'failed') return { ok: false, code: 'approve-failed' };
  if (after?.status === 'waiting-confirmation') return { ok: false, code: 'step-not-awaiting' };
  return { ok: true };
}
