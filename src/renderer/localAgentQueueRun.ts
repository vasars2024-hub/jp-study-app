/**
 * The renderer's ONE agent execution boundary, and the rule that takes work out of the
 * persisted queue — Phase 7 slice 51.
 *
 * Until this module existed, `AgentTaskQueue` was a dead end. `LocalAgentPanel` gated *Run next
 * approved step* and *Confirm sensitive step* on its in-memory `task`, whose only writers were
 * `plan()` and a previous execution; nothing took an item out of the queue and made it the live
 * task, and `nextRunnableAgentQueueItem` — exported, unit-tested, and evidently designed to be
 * the selector — was referenced by no production module at all. A queue item could be listed,
 * paused, prioritized and cancelled, but never resumed into execution. Slice 48 measured that
 * live (`disabled=true` on both controls with two tasks queued); slice 51 measured it again as
 * a reachability walk, which reported the definition file as the sole production reference.
 *
 * That is why this file, and not a `setTask(item.task)` inside the panel, is the fix. Slice 47e
 * hardened the execution boundary precisely because "a queued task outlives the profile that
 * authorized it" — a story that could not actually happen while a persisted task could never be
 * run. Making the queue runnable makes 47e's case reachable for the first time, so the new path
 * must go through the same rule rather than around it:
 *
 *   - `runAgentTaskStep` is the only place in `src/renderer` that calls `executeAgentTaskStep`,
 *     which is the only thing that calls `evaluateAgentToolAccess` with the profile allow-list.
 *     Both panel verbs and the queue verb funnel through here, so they cannot drift apart —
 *     the failure mode 47e fixed was two boundaries checking two different things.
 *   - `allowedOperations` is a REQUIRED property of `AgentQueueRunOptions` whose type admits
 *     `undefined`. A caller must state what the profile allows, even when the answer is "there
 *     is no profile"; it cannot be forgotten into a silent full-access default. It stays
 *     *optional* on `AgentExecutionOptions` itself, because 47e deliberately kept a caller with
 *     genuinely no profile governed by the permission level alone.
 *
 * Selection is kept separate from execution on purpose. `selectAgentQueueRun` decides *which*
 * work is eligible and never decides what that work may do; authorization stays outside this
 * module, in `evaluateAgentToolAccess`, exactly as Phase 7 requires.
 */
import {
  executeAgentTaskStep,
  type AgentExecutionEvent,
  type AgentPermissionLevel,
  type AgentTask,
  type AgentTaskStep,
  type AgentToolHandlers,
  type AgentToolOperationId,
} from '../shared/localAgent';
import {
  nextRunnableAgentQueueItem,
  updateAgentQueueItem,
  type AgentQueueItem,
  type AgentQueueStatus,
  type AgentTaskQueue,
} from '../shared/localAgentTaskQueue';

/** `next` is what *Run next approved step* runs; `confirm` is what *Confirm sensitive step* runs. */
export type AgentStepPick = 'next' | 'confirm';

export type AgentQueueRunRefusal =
  | 'no-runnable-item'
  | 'item-not-found'
  | 'item-not-runnable'
  | 'no-pending-step';

export type AgentQueueRunSelection =
  | { ok: true; item: AgentQueueItem; step: AgentTaskStep }
  | { ok: false; reason: AgentQueueRunRefusal };

export interface AgentQueueRunOptions {
  permission: AgentPermissionLevel;
  /**
   * The active profile's `enabledOperations`. Required, and nullable rather than optional, so
   * that no call site can reach a tool without having said what the profile permits — see the
   * file header.
   */
  allowedOperations: readonly AgentToolOperationId[] | undefined;
  handlers: AgentToolHandlers;
  confirmedCallIds?: ReadonlySet<string>;
  now?: () => number;
}

export interface AgentQueueRunResult {
  queue: AgentTaskQueue;
  task: AgentTask;
  events: AgentExecutionEvent[];
}

export function pendingAgentTaskStep(task: AgentTask, pick: AgentStepPick): AgentTaskStep | null {
  return task.steps.find((candidate) => (
    pick === 'confirm'
      ? candidate.status === 'waiting-confirmation'
      : candidate.status === 'pending' || candidate.status === 'waiting-confirmation'
  )) ?? null;
}

/**
 * How a task's own status reads back onto the queue row it came from.
 *
 * `current` is the row's status before the run. A row the user paused or
 * cancelled keeps that status: those two are the user's decision about the
 * *row*, not a report about the task, and nothing the task did while the
 * decision was being made overrides it. Without this the function returned
 * `queued` for both, so a completed step folded a cancelled task back into the
 * queue as runnable work — resurrecting a task the user had stopped, and
 * silently undoing a pause. That is exactly what `applyAgentRunToQueue`'s own
 * docstring says must not happen.
 */
export function agentQueueStatusForTask(
  task: AgentTask,
  current?: AgentQueueStatus,
): AgentQueueStatus {
  if (current === 'cancelled' || current === 'paused') return current;
  if (task.status === 'completed') return 'completed';
  if (task.status === 'failed') return 'failed';
  return 'queued';
}

/**
 * Write an execution outcome back onto its queue row. Exported separately from
 * `runAgentTaskStep` so the panel can apply it against the FRESHEST queue inside a functional
 * state update: the queue's Pause and Cancel buttons stay live while a step is in flight, and
 * folding in a queue captured before the `await` would quietly revert them.
 */
export function applyAgentRunToQueue(queue: AgentTaskQueue, task: AgentTask): AgentTaskQueue {
  const current = queue.items.find((item) => item.id === task.id)?.status;
  return updateAgentQueueItem(queue, task.id, {
    task,
    status: agentQueueStatusForTask(task, current),
  });
}

/**
 * The eligible piece of queued work: a specific row when `id` is given, otherwise the highest
 * priority one, oldest first. A paused or cancelled row is refused rather than silently run —
 * Pause has to keep meaning paused, or the queue's controls would be decoration again.
 */
export function selectAgentQueueRun(queue: AgentTaskQueue, id?: string): AgentQueueRunSelection {
  const item = id === undefined
    ? nextRunnableAgentQueueItem(queue)
    : queue.items.find((candidate) => candidate.id === id) ?? null;
  if (!item) return { ok: false, reason: id === undefined ? 'no-runnable-item' : 'item-not-found' };
  if (item.status !== 'queued') return { ok: false, reason: 'item-not-runnable' };
  const step = pendingAgentTaskStep(item.task, 'next');
  if (!step) return { ok: false, reason: 'no-pending-step' };
  return { ok: true, item, step };
}

/**
 * Run one step and write the outcome back onto the queue, so a refusal or a completion survives
 * the session that produced it instead of living only in component state.
 */
export async function runAgentTaskStep(
  queue: AgentTaskQueue,
  task: AgentTask,
  step: AgentTaskStep,
  options: AgentQueueRunOptions,
): Promise<AgentQueueRunResult> {
  const result = await executeAgentTaskStep(task, step.id, {
    permission: options.permission,
    // Re-checked at EXECUTION, not only when the plan was built: a queued task outlives the
    // profile that authorized it, and since slice 51 such a task can genuinely be run.
    allowedOperations: options.allowedOperations,
    handlers: options.handlers,
    ...(options.confirmedCallIds ? { confirmedCallIds: options.confirmedCallIds } : {}),
    ...(options.now ? { now: options.now } : {}),
  });
  return {
    queue: applyAgentRunToQueue(queue, result.task),
    task: result.task,
    events: result.events,
  };
}
