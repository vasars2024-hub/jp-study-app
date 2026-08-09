/**
 * Permission-gated step approval: the resolver, the failure codes and the
 * lifecycle for the `approve-step` effect.
 *
 * `approve-step` has been in `AgentResultEffect` since the workspace contracts
 * landed and has been inert ever since — a type with no producer, no permission
 * rule and no failure path. This module is what an approval has to survive
 * before anything acts on it, and it is deliberately built the same way
 * `agentNavigation.ts` is:
 *
 * 1. **The stored effect is a reference, never an instruction.** A card action
 *    carries a `taskId` and a `stepId` and nothing else that matters. Every word
 *    the user is shown — the objective, the step label, the operation — is read
 *    back out of the *live* `AgentTaskQueue` at review time. The persisted
 *    `label` on the action is never displayed and never consulted, exactly as
 *    the navigation card's stored label is never allowed to name a place.
 * 2. **Approval is re-authorized at the approval boundary.** `localAgent.ts`
 *    already documents why `evaluateAgentToolAccess` must run at *both*
 *    planning and execution: tasks persist across profile edits, so a step
 *    planned while `flashcard.delete-deck` was enabled stays in the queue after
 *    the user removes it. A user-facing approval is a third boundary with the
 *    same exposure and gets the same check, against the profile as it is *now*.
 * 3. **Fail closed on every absence.** A missing task, a missing step, a step
 *    that is not the one the task is actually waiting on, a card with no live
 *    provenance — each is a refusal with its own code, never a fall-through.
 *
 * There is deliberately no `execute` here. Resolving an approval says the user
 * may grant it; running the step is the task runner's job, behind its own
 * confirmed request. Keeping the two apart is what stops this module from
 * becoming a second, weaker path into tool execution.
 *
 * The gate comes in two shapes because two surfaces grant this permission.
 * `resolveAgentQueuedStepApproval` is the whole rule and needs only the queue,
 * a `taskId` and a `stepId`; `resolveAgentStepApproval` is that same rule with
 * the card's own preconditions in front of it. The card shape came first, and
 * for a while it was the *only* shape — which is why the Blanc queue panel,
 * which has no conversation to pass it, ended up asking a shorter question of
 * its own. Anything that decides whether a step may run belongs in the queued
 * half, so there is no second place for it to be decided differently.
 */

import type { AgentConversation } from './agentWorkspace';
import {
  evaluateAgentToolAccess,
  type AgentPermissionLevel,
  type AgentTask,
  type AgentTaskStep,
  type AgentToolOperationId,
} from './localAgent';
import type { AgentQueueItem, AgentTaskQueue } from './localAgentTaskQueue';

/**
 * Everything the conversation-free half can refuse.
 *
 * Split out so a caller that has no card — the Blanc queue panel — can map every
 * refusal it is able to see, exhaustively, without inventing text for codes it
 * can never reach. The full union below is built *from* this one rather than
 * repeating its members, so the two cannot drift.
 */
export type AgentQueuedStepApprovalFailureCode =
  | 'task-not-found'
  | 'task-not-runnable'
  | 'step-not-found'
  | 'step-not-awaiting'
  | 'step-not-current'
  | 'operation-denied';

export type AgentStepApprovalFailureCode =
  | AgentQueuedStepApprovalFailureCode
  | 'invalid-request'
  | 'conversation-not-found'
  | 'action-not-found'
  | 'not-approvable'
  | 'stale-provenance'
  | 'busy'
  | 'approve-failed'
  | 'store-failed'
  | 'bridge-unavailable';

/**
 * What the user is asked to approve, built entirely from the live task.
 *
 * `objective` and `label` are the task's and the step's own text. They are study
 * data written by the planner, not chrome, so they are shown verbatim and are
 * not translated — the surrounding labels are. `operation` is an id, which the
 * renderer resolves to a translated operation name the same way the navigation
 * card resolves a section id to `palette.section.*`.
 */
export interface AgentStepApproval {
  taskId: string;
  stepId: string;
  objective: string;
  label: string;
  operation: AgentToolOperationId;
  /** True when the operation's own definition demands a confirmation sentence. */
  confirmation: boolean;
}

export type AgentStepApprovalResolution =
  | { ok: true; approval: AgentStepApproval }
  | { ok: false; code: AgentStepApprovalFailureCode };

/** The same answer, narrowed to the codes the conversation-free half can give. */
export type AgentQueuedStepApprovalResolution =
  | { ok: true; approval: AgentStepApproval }
  | { ok: false; code: AgentQueuedStepApprovalFailureCode };

/**
 * A queue item whose task may run its next step *now*.
 *
 * Approving a step of a cancelled, failed or completed task would grant
 * permission for work that will never run — a control that claims to do
 * something it does not do, which is the exact failure the navigation gate was
 * built to avoid.
 *
 * `paused` is refused for the opposite reason: that work *would* run. Every
 * caller of this gate executes the step the moment the grant is given, so a
 * paused row whose step could still be approved is a second control that
 * silently undoes Pause — the same class of hole as the cancelled one commit
 * 042ef46 closed, and the rule `selectAgentQueueRun` already states in its own
 * docstring ("Pause has to keep meaning paused, or the queue's controls would be
 * decoration again"). Resume is one click; running work the user stopped is not
 * undoable.
 */
const RUNNABLE_QUEUE_STATUS: ReadonlySet<AgentQueueItem['status']> = new Set<AgentQueueItem['status']>([
  'queued',
  'running',
]);

function approvalEffect(
  conversation: AgentConversation,
  messageId: string,
  cardId: string,
  actionId: string,
): { taskId: string; stepId: string } | AgentStepApprovalFailureCode {
  const message = conversation.messages.find((entry) => entry.id === messageId);
  const card = message?.cards.find((entry) => entry.id === cardId);
  const action = card?.actions.find((entry) => entry.id === actionId);
  if (!message || !card || !action) return 'action-not-found';
  if (action.effect.type !== 'approve-step') return 'not-approvable';
  // Provenance is the card's, and an empty list is not a pass. This mirrors the
  // navigation resolver rather than the persistence rule it grew out of: a card
  // declaring no source has nothing to check, so it gets refused rather than
  // treated as trivially satisfied.
  if (card.sourceContextIds.length === 0) return 'stale-provenance';
  if (!card.sourceContextIds.some((contextId) => (
    conversation.context.some((item) => item.id === contextId)
  ))) {
    return 'stale-provenance';
  }
  return { taskId: action.effect.taskId, stepId: action.effect.stepId };
}

function liveStep(
  task: AgentTask,
  stepId: string,
): AgentTaskStep | AgentQueuedStepApprovalFailureCode {
  const step = task.steps.find((entry) => entry.id === stepId);
  if (!step) return 'step-not-found';
  // Two separate refusals, because they mean different things to the user. A
  // step that is not waiting for confirmation is not asking; a step that is
  // waiting but is not the current one would be approved out of order, granting
  // permission for work whose predecessor has not run.
  if (step.status !== 'waiting-confirmation') return 'step-not-awaiting';
  if (task.currentStepId !== undefined && task.currentStepId !== stepId) return 'step-not-current';
  return step;
}

/**
 * The whole question, minus the card: may *this* step of *this* task run right
 * now, for a user with this permission and this allow-list?
 *
 * Everything here is about live state — the queue row's status, the step's
 * status, whether the step is the one the task is actually on, and what the
 * profile permits today. None of it needs a conversation, and requiring one is
 * what kept the second approval path from asking the gate at all: the Blanc
 * queue panel has no `AgentConversation`, no message and no card, so the only
 * shape of this gate it could reach was the card-shaped one it could not call.
 * It answered the question itself instead, and checked one of the four things.
 *
 * So this is the gate, and the two callers differ only in how they arrive at a
 * `taskId` and a `stepId`: a card reads them out of a stored effect, the panel
 * out of the step the user is looking at. Both are references, never
 * instructions — every word shown and every decision made is re-read from the
 * live queue here.
 *
 * Pure and side-effect free, like the resolver it was extracted from.
 */
export function resolveAgentQueuedStepApproval(
  queue: AgentTaskQueue,
  taskId: string,
  stepId: string,
  permission: AgentPermissionLevel,
  allowedOperations?: readonly AgentToolOperationId[],
): AgentQueuedStepApprovalResolution {
  const item = queue.items.find((entry) => entry.task.id === taskId);
  if (!item) return { ok: false, code: 'task-not-found' };
  if (!RUNNABLE_QUEUE_STATUS.has(item.status)) return { ok: false, code: 'task-not-runnable' };

  const step = liveStep(item.task, stepId);
  if (typeof step === 'string') return { ok: false, code: step };

  // The third boundary. `confirmed` is deliberately not set: asking whether the
  // user *may* approve must not be answered by pretending they already have.
  // A `confirmation-required` decision is therefore the expected success here,
  // and only `denied` refuses.
  const decision = evaluateAgentToolAccess(
    { ...step.request, confirmed: false },
    permission,
    allowedOperations,
  );
  if (decision.status === 'denied') return { ok: false, code: 'operation-denied' };

  return {
    ok: true,
    approval: {
      taskId: item.task.id,
      stepId: step.id,
      // Read from the live task, not from whatever the caller was holding. If
      // the planner rewrote the objective or the step label after the card was
      // persisted — or after the panel last rendered — the user approves what
      // the task says today.
      objective: item.task.objective,
      label: step.label,
      operation: step.request.operation,
      confirmation: decision.status === 'confirmation-required',
    },
  };
}

/**
 * Resolves one stored `approve-step` action against the conversation and the
 * task queue as they are *now*.
 *
 * The card-shaped half: it turns a message/card/action triple into the
 * `taskId`/`stepId` pair the gate above works on, refusing on its own grounds
 * (no such action, not an approval, provenance that no longer holds) and then
 * asking the same gate everything else. It deliberately adds no live check of
 * its own — a second copy of one of those checks is precisely the drift this
 * split exists to end.
 *
 * Pure and side-effect free. The review step and the granted approval both call
 * it, and the only difference between them is what the caller does afterwards —
 * the same shape as `resolveAgentNavigation`, for the same reason: a gate that
 * resolves differently depending on who is asking is not a gate.
 */
export function resolveAgentStepApproval(
  conversation: AgentConversation,
  queue: AgentTaskQueue,
  messageId: string,
  cardId: string,
  actionId: string,
  permission: AgentPermissionLevel,
  allowedOperations?: readonly AgentToolOperationId[],
): AgentStepApprovalResolution {
  const effect = approvalEffect(conversation, messageId, cardId, actionId);
  if (typeof effect === 'string') return { ok: false, code: effect };
  return resolveAgentQueuedStepApproval(
    queue,
    effect.taskId,
    effect.stepId,
    permission,
    allowedOperations,
  );
}

/* ---------- Producer ------------------------------------------------------ */

/**
 * The step a card may offer to approve, or `null`.
 *
 * This lives beside the resolver on purpose. A producer that decided "waiting on
 * the user" by its own reading of the queue would eventually disagree with the
 * gate, and the visible form of that disagreement is a button that exists and
 * always refuses. Both sides ask the same two questions here: is the queue item
 * still runnable, and is its *current* step the one waiting.
 *
 * Selection is FIFO over the oldest queue item, tie-broken by id. It is
 * deliberately independent of the reply it will be attached to: the card offers
 * the approval that has been blocking longest, not one chosen by anything the
 * provider wrote. Only one is ever offered, because a message that sprouted four
 * approve buttons would be a queue view, and the queue already has one.
 */
export function pendingAgentStepApproval(
  queue: AgentTaskQueue,
): { taskId: string; stepId: string } | null {
  const waiting = queue.items
    .filter((item) => {
      if (!RUNNABLE_QUEUE_STATUS.has(item.status)) return false;
      const stepId = item.task.currentStepId;
      if (!stepId) return false;
      const step = item.task.steps.find((entry) => entry.id === stepId);
      return step?.status === 'waiting-confirmation';
    })
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  const chosen = waiting[0];
  if (!chosen?.task.currentStepId) return null;
  return { taskId: chosen.task.id, stepId: chosen.task.currentStepId };
}

/* ---------- Lifecycle ----------------------------------------------------- */

export type AgentStepApprovalStatus =
  | 'idle'
  | 'review'
  | 'granted'
  | 'failed'
  | 'cancelled';

export interface AgentStepApprovalRun {
  status: AgentStepApprovalStatus;
  /** Approvals granted so far. A retry is a second approval, not a free redo. */
  attempts: number;
  approval?: AgentStepApproval;
  code?: AgentStepApprovalFailureCode;
}

export type AgentStepApprovalEvent =
  | { type: 'review'; approval: AgentStepApproval }
  | { type: 'refused'; code: AgentStepApprovalFailureCode }
  | { type: 'grant' }
  | { type: 'cancel' }
  | { type: 'failed'; code: AgentStepApprovalFailureCode }
  | { type: 'retry' }
  | { type: 'dismiss' };

export const AGENT_STEP_APPROVAL_IDLE: AgentStepApprovalRun = { status: 'idle', attempts: 0 };

/**
 * The whole permitted lifecycle, as one total function.
 *
 * There is no separate `running` state. `granted` spans the moment the approval
 * is given and the single step run it authorizes, because nothing the user can
 * press in between would mean anything: a granted approval cannot be withdrawn
 * once the step is executing, and offering a cancel there would be a button that
 * claims to stop something it does not stop. That is the same reasoning by which
 * `agentNavigationReduce` accepts neither `cancel` nor `approve` while running.
 * Cancel belongs to `review`, the state where nothing has happened yet.
 */
export function agentStepApprovalReduce(
  run: AgentStepApprovalRun,
  event: AgentStepApprovalEvent,
): AgentStepApprovalRun {
  switch (event.type) {
    case 'review':
      return { status: 'review', attempts: run.attempts, approval: event.approval };
    case 'refused':
      return { status: 'failed', attempts: run.attempts, code: event.code };
    case 'grant':
      // Only from review. A grant from `idle` would be an approval for something
      // that was never resolved and never shown.
      return run.status === 'review' && run.approval
        ? { status: 'granted', attempts: run.attempts + 1, approval: run.approval }
        : run;
    case 'cancel':
      return run.status === 'review' ? { status: 'cancelled', attempts: run.attempts } : run;
    case 'failed':
      // From `granted` as well as `review`: the run the grant authorized is the
      // most likely thing to fail, and a failure that could not be recorded
      // would leave the card reading "approved" over a step that never ran.
      return run.status === 'review' || run.status === 'granted'
        ? { status: 'failed', attempts: run.attempts, code: event.code }
        : run;
    case 'retry':
      // Back to idle rather than straight to review: the second attempt
      // re-resolves against the live queue and asks again, so a retry cannot
      // reuse an approval the user gave for a step that has since changed.
      return run.status === 'failed' || run.status === 'cancelled'
        ? { status: 'idle', attempts: run.attempts }
        : run;
    case 'dismiss':
      return run.status === 'granted' ? { status: 'idle', attempts: run.attempts } : run;
    default:
      return run;
  }
}
