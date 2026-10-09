import type { AgentConversation } from '../shared/agentWorkspace';
import type { AiProviderId } from '../shared/aiProviders';
import type { LocalAgentPlanFailureCode } from '../shared/localAgentRuntime';
import {
  cancelAgentQueueItem,
  enqueueAgentTask,
  pauseAgentQueueItem,
  resumeAgentQueueItem,
  type AgentTaskQueue,
} from '../shared/localAgentTaskQueue';
import {
  createAgentTask,
  evaluateAgentToolAccess,
  type AgentExecutionEvent,
  type AgentTask,
  type AgentToolOperationId,
} from '../shared/localAgent';
import {
  detectAgentStudyIntent,
  STUDY_RECIPE_OPERATIONS,
  studyRecipeSteps,
  type DetectedStudyIntent,
} from '../shared/agentStudyCoach';
import { resolveAgentQueuedStepApproval } from '../shared/agentStepApproval';
import { selectAgentMemoryContext } from '../shared/localAgentMemory';
import { getActiveAgentProfile } from '../shared/localAgentProfiles';
import type { AgentToolRegistryTranslate } from './agentToolRegistry';
import { initAgentOperationalState } from './agentOperationalClient';
import { readAgentStepApprovalContext } from './agentStepApprovalClient';
import { loadLocalAgentMemory } from './localAgentMemoryStore';
import { loadLocalAgentProfiles } from './localAgentProfilesStore';
import { loadLocalAgentSettings } from './localAgentSettingsStore';
import {
  loadLocalAgentTaskQueue,
  saveLocalAgentTaskQueueDurably,
} from './localAgentTaskQueueStore';
import {
  runAgentTaskStep,
  selectAgentQueueRun,
} from './localAgentQueueRun';

export const AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT = 500;
export const AGENT_CONVERSATION_PLAN_CONTEXT_LIMIT = 16;
const CONTEXT_LABEL_LIMIT = 200;
const CONTEXT_PREVIEW_LIMIT = 500;

export type AgentConversationPlanFailureCode =
  | 'invalid-objective'
  | 'planner-disabled'
  | 'planner-unavailable'
  /** No local model, and no cloud key to plan with instead. */
  | 'model-missing'
  | 'ai-off'
  | 'cloud-key-missing'
  | 'spend-budget'
  | 'no-approved-actions'
  | 'task-conflict'
  | 'store-failed';

export type AgentConversationPlanResult =
  | {
      ok: true;
      taskId: string;
      summary: string;
      modelFileName?: string;
      queue: AgentTaskQueue;
      /** Who made the plan: the local model, a cloud model, or a study recipe (no model). */
      planner?: 'local' | 'cloud' | 'recipe';
      /** How long planning took, for the composer's latency line. */
      elapsedMs?: number;
    }
  | {
      ok: false;
      code: AgentConversationPlanFailureCode;
      summary?: string;
    };

export type AgentConversationQueueAction = 'pause' | 'resume' | 'cancel';

export type AgentConversationQueueActionResult =
  | { ok: true; queue: AgentTaskQueue }
  | { ok: false; code: 'task-not-found' | 'invalid-transition' | 'store-failed' };

export type AgentConversationRunAction = 'run-next' | 'confirm' | 'retry';

export type AgentConversationRunFailureCode =
  | 'task-not-found'
  | 'task-not-runnable'
  | 'step-not-found'
  | 'step-not-awaiting'
  | 'step-not-current'
  | 'operation-denied'
  | 'no-pending-step'
  | 'confirmation-required'
  | 'invalid-transition'
  | 'run-failed'
  | 'outcome-not-recorded'
  | 'store-failed';

export type AgentConversationRunResult =
  | {
      ok: true;
      queue: AgentTaskQueue;
      task: AgentTask;
      stepId: string;
      events: AgentExecutionEvent[];
    }
  | {
      ok: false;
      code: AgentConversationRunFailureCode;
      task?: AgentTask;
      stepId?: string;
      events?: AgentExecutionEvent[];
    };

interface QuarantinedAgentPlan {
  conversationId: string;
  itemSnapshot: string;
}

const quarantinedAgentPlans = new Map<string, QuarantinedAgentPlan>();

function queueItemSnapshot(item: AgentTaskQueue['items'][number]): string {
  try {
    return JSON.stringify({
      origin: item.origin,
      execution: item.execution,
      task: item.task,
      status: item.status,
      priority: item.priority,
      createdAt: item.createdAt,
    });
  } catch {
    return '';
  }
}

function quarantineAgentPlan(
  conversationId: string,
  queue: AgentTaskQueue,
  taskId: string,
): void {
  const item = queue.items.find((candidate) => (
    candidate.id === taskId && candidate.origin?.conversationId === conversationId
  ));
  if (!item) return;
  quarantinedAgentPlans.set(taskId, {
    conversationId,
    itemSnapshot: queueItemSnapshot(item),
  });
}

export function isAgentConversationPlanQuarantined(
  conversationId: string,
  taskId: string,
): boolean {
  return quarantinedAgentPlans.get(taskId)?.conversationId === conversationId;
}

/** Retry only the durable save; never the task operation itself. */
export async function retryAgentConversationPlanSave(
  conversationId: string,
  taskId: string,
): Promise<AgentConversationQueueActionResult> {
  const quarantine = quarantinedAgentPlans.get(taskId);
  if (quarantine?.conversationId !== conversationId) {
    return { ok: false, code: 'task-not-found' };
  }
  try {
    const queue = loadLocalAgentTaskQueue();
    const item = queue.items.find((candidate) => (
      candidate.id === taskId && candidate.origin?.conversationId === conversationId
    ));
    if (!item) return { ok: false, code: 'task-not-found' };
    // Never make an older optimistic row durable over a replacement or a newer
    // task transition. The user can inspect the new state instead.
    if (queueItemSnapshot(item) !== quarantine.itemSnapshot) {
      return { ok: false, code: 'invalid-transition' };
    }
    const receipt = await saveLocalAgentTaskQueueDurably(queue);
    if (!receipt.ok) return { ok: false, code: 'store-failed' };
    quarantinedAgentPlans.delete(taskId);
    return { ok: true, queue };
  } catch {
    return { ok: false, code: 'store-failed' };
  }
}

/**
 * The exact shelf subset sent to the local planner. Keeping this pure makes the
 * origin stored beside the task provably identical to the context supplied to
 * planning rather than "whatever happened to be open".
 */
export function agentConversationPlanContext(conversation: AgentConversation): Array<{
  id: string;
  kind: string;
  label: string;
  preview: string;
  route?: string;
}> {
  return conversation.context.slice(-AGENT_CONVERSATION_PLAN_CONTEXT_LIMIT).map((item) => ({
    id: item.id,
    kind: item.kind,
    label: item.label.slice(0, CONTEXT_LABEL_LIMIT),
    preview: item.preview.slice(0, CONTEXT_PREVIEW_LIMIT),
    ...(item.source.route ? { route: item.source.route } : {}),
  }));
}

/**
 * Where the plan is made. Absent is the local model. A local request with no
 * model on disk is planned on `cloudProviderId` when it has a key, so a
 * cloud-only user reaches the Agent's tools too.
 */
export interface AgentConversationPlanOptions {
  target?: 'local' | AiProviderId;
  cloudProviderId?: AiProviderId;
  /** Off to send even a recognised study request to the model (tests, or a user retrying). */
  recipes?: boolean;
  /** A quick action names its recipe outright instead of having its label recognised. */
  studyIntent?: DetectedStudyIntent;
}

/**
 * A study recipe's task (`shared/agentStudyCoach.ts`): the core requests planned without a
 * model. Every step is checked against the same permission and profile allow-list the
 * executor will check again; one refused step and the request goes to the model planner
 * instead, which may still find a way within what is allowed. Null when nothing was planned.
 */
async function planStudyRecipe(
  objective: string,
  authority: ReturnType<typeof readAgentStepApprovalContext>,
  t: AgentToolRegistryTranslate,
  now: number,
  forced?: DetectedStudyIntent,
): Promise<{ task: AgentTask; summary: string } | null> {
  const detected = forced ?? detectAgentStudyIntent(objective);
  if (!detected) return null;
  const allowed = (operation: AgentToolOperationId): boolean => evaluateAgentToolAccess(
    { callId: 'recipe-check', operation, arguments: {}, confirmed: true },
    authority.permission,
    authority.allowedOperations,
  ).status === 'allowed';
  // The read step must be allowed; a write step is planned only when it is.
  const [readOperation, writeOperation] = STUDY_RECIPE_OPERATIONS[detected.intent];
  if (!allowed(readOperation)) return null;
  const taskId = `agent-recipe-${now.toString(36)}`;
  let extra: Parameters<typeof studyRecipeSteps>[3] = {};
  let count = 0;
  // The write step's content is computed now, so the plan shows exactly what Run will write.
  // Lazy: the coach reads the grammar library and the tokenizer, which only these two need.
  if (detected.intent === 'cards-from-text' && writeOperation && allowed(writeOperation)) {
    const coach = await import('./studyCoachAgentHandlers');
    const found = await coach.findCardCandidates(detected.text ?? '');
    extra = { cards: found.cards };
    count = found.cards.length;
  } else if (detected.intent === 'plan-week' && writeOperation && allowed(writeOperation)) {
    const coach = await import('./studyCoachAgentHandlers');
    const plan = await coach.computeWeekPlan(t);
    extra = { sessions: plan.sessions };
    count = plan.sessions.length;
  }
  const steps = studyRecipeSteps(detected, (key, vars) => t(key, vars), taskId, extra);
  if (!steps.length || steps.some((step) => !allowed(step.request.operation))) return null;
  return {
    task: createAgentTask(taskId, objective, steps, now),
    summary: t(`agent2.recipe.summary.${detected.intent}`, { count }),
  };
}

/** Main's typed refusals, mapped onto the codes this surface translates. */
function planFailureFromResponse(code: LocalAgentPlanFailureCode | undefined): AgentConversationPlanFailureCode {
  switch (code) {
    case 'agent-disabled': return 'planner-disabled';
    case 'model-missing': return 'model-missing';
    case 'ai-off': return 'ai-off';
    case 'cloud-key-missing': return 'cloud-key-missing';
    case 'spend-budget': return 'spend-budget';
    default: return 'planner-unavailable';
  }
}

export async function createAgentConversationPlan(
  conversation: AgentConversation,
  rawObjective: string,
  t: AgentToolRegistryTranslate,
  options: AgentConversationPlanOptions = {},
): Promise<AgentConversationPlanResult> {
  const objective = rawObjective.trim();
  if (!objective || objective.length > AGENT_CONVERSATION_PLAN_OBJECTIVE_LIMIT) {
    return { ok: false, code: 'invalid-objective' };
  }

  const settings = loadLocalAgentSettings();
  if (!settings.enabled || settings.backend === 'disabled') {
    return { ok: false, code: 'planner-disabled' };
  }

  let authority: ReturnType<typeof readAgentStepApprovalContext>;
  let profile: ReturnType<typeof getActiveAgentProfile>;
  try {
    await initAgentOperationalState();
    authority = readAgentStepApprovalContext(t);
    profile = getActiveAgentProfile(loadLocalAgentProfiles());
  } catch {
    return { ok: false, code: 'store-failed' };
  }

  const disclosedContext = settings.privacyMode
    ? []
    : agentConversationPlanContext(conversation);

  // The everyday study requests are planned here, with no model: instantly, offline, and
  // through the same queue and approval controls as a model's plan.
  const startedAt = Date.now();
  if (options.recipes !== false) {
    let recipe: Awaited<ReturnType<typeof planStudyRecipe>> = null;
    try {
      recipe = await planStudyRecipe(objective, authority, t, startedAt, options.studyIntent);
    } catch {
      recipe = null;
    }
    if (recipe) {
      return enqueueConversationPlan(conversation, disclosedContext, recipe.task, recipe.summary, {
        planner: 'recipe',
        elapsedMs: Date.now() - startedAt,
      });
    }
  }

  const plan = window.api?.localAgentPlan;
  if (typeof plan !== 'function') {
    return { ok: false, code: 'planner-unavailable' };
  }

  let response: Awaited<ReturnType<typeof plan>>;
  try {
    response = await plan({
      objective,
      settings,
      profile,
      availableOperations: authority.allowedOperations,
      // Narrowed by scope here so an out-of-scope memory is never selected in
      // the first place, and enforced again in main, which is the choke point
      // every producer shares. This half is selection; that half is the rule.
      memories: settings.memoryEnabled && settings.memoryScope.length > 0
        ? selectAgentMemoryContext(loadLocalAgentMemory(), objective, {
          maxCharacters: 4_000,
          categories: settings.memoryScope,
        })
        : [],
      ...(options.target ? { target: options.target } : {}),
      ...(options.cloudProviderId ? { cloudProviderId: options.cloudProviderId } : {}),
      applicationState: disclosedContext.length > 0
        ? {
            agentConversation: {
              mode: conversation.mode,
              context: disclosedContext,
            },
          }
        : {},
    });
  } catch {
    // Deliberately keep backend/model exception text out of the renderer. It
    // can contain a local model path; the localized code is the safe surface.
    return { ok: false, code: 'planner-unavailable' };
  }

  // The code, never `response.error`: that string is English and can name a
  // local model path.
  if (!response.ok) return { ok: false, code: planFailureFromResponse(response.code) };
  if (!response.task) {
    return {
      ok: false,
      code: 'no-approved-actions',
      ...(response.summary ? { summary: response.summary.slice(0, 500) } : {}),
    };
  }

  return enqueueConversationPlan(
    conversation,
    disclosedContext,
    response.task,
    response.summary || response.task.objective,
    {
      ...(response.modelFileName ? { modelFileName: response.modelFileName } : {}),
      ...(response.planner ? { planner: response.planner } : {}),
      elapsedMs: typeof response.elapsedMs === 'number' ? response.elapsedMs : Date.now() - startedAt,
    },
  );
}

/** Queue a planned task under its conversation, durably — one path for model and recipe plans. */
async function enqueueConversationPlan(
  conversation: AgentConversation,
  disclosedContext: ReturnType<typeof agentConversationPlanContext>,
  task: AgentTask,
  summary: string,
  meta: { modelFileName?: string; planner?: 'local' | 'cloud' | 'recipe'; elapsedMs?: number },
): Promise<AgentConversationPlanResult> {
  let pendingQueue: AgentTaskQueue | null = null;
  try {
    const currentQueue = loadLocalAgentTaskQueue();
    // A model/backend replaying an id must not replace a task from another
    // conversation or inherit its provenance through the generic queue helper.
    if (currentQueue.items.some((item) => item.id === task.id)) {
      return { ok: false, code: 'task-conflict' };
    }
    const queue = enqueueAgentTask(
      currentQueue,
      task,
      0,
      Date.now(),
      {
        conversationId: conversation.id,
        contextIds: disclosedContext.map((item) => item.id),
      },
    );
    pendingQueue = queue;
    const receipt = await saveLocalAgentTaskQueueDurably(queue);
    if (!receipt.ok) {
      quarantineAgentPlan(conversation.id, queue, task.id);
      return { ok: false, code: 'store-failed' };
    }
    quarantinedAgentPlans.delete(task.id);
    return {
      ok: true,
      taskId: task.id,
      summary: summary.slice(0, 500),
      ...(meta.modelFileName ? { modelFileName: meta.modelFileName } : {}),
      ...(meta.planner ? { planner: meta.planner } : {}),
      ...(typeof meta.elapsedMs === 'number' ? { elapsedMs: meta.elapsedMs } : {}),
      queue,
    };
  } catch {
    if (pendingQueue) quarantineAgentPlan(conversation.id, pendingQueue, task.id);
    return { ok: false, code: 'store-failed' };
  }
}

/**
 * Queue controls resolve from the freshest main-backed snapshot and require
 * exact conversation origin. A stale inspector cannot pause somebody else's
 * plan merely because it retained an old task id.
 */
export async function updateAgentConversationPlanQueue(
  conversationId: string,
  taskId: string,
  action: AgentConversationQueueAction,
  now = Date.now(),
): Promise<AgentConversationQueueActionResult> {
  let nextForReceipt: AgentTaskQueue | null = null;
  try {
    const queue = loadLocalAgentTaskQueue();
    const item = queue.items.find((candidate) => (
      candidate.id === taskId
      && candidate.origin?.conversationId === conversationId
    ));
    if (!item) return { ok: false, code: 'task-not-found' };
    if (isAgentConversationPlanQuarantined(conversationId, taskId)) {
      return { ok: false, code: 'store-failed' };
    }
    const valid = action === 'pause'
      ? item.status === 'queued' || item.status === 'running'
      : action === 'resume'
        ? item.status === 'paused' && !item.execution
        : item.status === 'queued' || item.status === 'running' || item.status === 'paused';
    if (!valid) return { ok: false, code: 'invalid-transition' };
    const next = action === 'pause'
      ? pauseAgentQueueItem(queue, taskId, now)
      : action === 'resume'
        ? resumeAgentQueueItem(queue, taskId, now)
        : cancelAgentQueueItem(queue, taskId, now);
    nextForReceipt = next;
    const receipt = await saveLocalAgentTaskQueueDurably(next);
    if (!receipt.ok) {
      quarantineAgentPlan(conversationId, next, taskId);
      return { ok: false, code: 'store-failed' };
    }
    quarantinedAgentPlans.delete(taskId);
    return { ok: true, queue: next };
  } catch {
    if (nextForReceipt) quarantineAgentPlan(conversationId, nextForReceipt, taskId);
    return { ok: false, code: 'store-failed' };
  }
}

function failedAgentTaskRetry(task: AgentTask, now: number): AgentTask | null {
  if (task.status !== 'failed') return null;
  const failedIndex = task.steps.findIndex((step) => step.status === 'failed');
  if (failedIndex < 0) return null;
  if (task.steps.slice(0, failedIndex).some((step) => step.status !== 'completed')) return null;
  return {
    ...task,
    status: 'queued',
    currentStepId: undefined,
    updatedAt: now,
    steps: task.steps.map((step, index) => index === failedIndex
      ? { ...step, status: 'pending', result: undefined, error: undefined }
      : step),
  };
}

/**
 * Runs one control from a conversation plan against live operational state.
 *
 * Main atomically checks the exact origin/task/row snapshot and persists a
 * durable `running` claim before the renderer may resolve a tool handler. Its
 * lease-owned commit preserves Pause/Cancel and refuses any other mutation.
 */
export async function runAgentConversationPlan(
  conversationId: string,
  taskId: string,
  action: AgentConversationRunAction,
  t: AgentToolRegistryTranslate,
  now = Date.now(),
): Promise<AgentConversationRunResult> {
  let authority: ReturnType<typeof readAgentStepApprovalContext>;
  try {
    await initAgentOperationalState();
    authority = readAgentStepApprovalContext(t);
  } catch {
    return { ok: false, code: 'store-failed' };
  }

  const item = authority.queue.items.find((candidate) => (
    candidate.id === taskId
    && candidate.origin?.conversationId === conversationId
  ));
  if (!item) return { ok: false, code: 'task-not-found' };
  if (isAgentConversationPlanQuarantined(conversationId, taskId)) {
    return { ok: false, code: 'store-failed' };
  }
  let source = item.task;
  let step = source.steps.find((candidate) => candidate.status === 'waiting-confirmation') ?? null;
  let confirmedCallIds: ReadonlySet<string> | undefined;

  if (action === 'run-next') {
    const selection = selectAgentQueueRun(authority.queue, taskId);
    if (!selection.ok) {
      return {
        ok: false,
        code: selection.reason === 'item-not-found' || selection.reason === 'no-runnable-item'
          ? 'task-not-found'
          : selection.reason === 'item-not-runnable'
            ? 'task-not-runnable'
            : selection.reason,
      };
    }
    source = selection.item.task;
    step = selection.step;
    // A second click on Run next is not an implicit grant. Only the explicit
    // Confirm control below is allowed to supply the one-use call id.
    if (step.status === 'waiting-confirmation') {
      return { ok: false, code: 'confirmation-required' };
    }
  } else if (action === 'confirm') {
    if (!step) return { ok: false, code: 'step-not-awaiting' };
    const resolution = resolveAgentQueuedStepApproval(
      authority.queue,
      taskId,
      step.id,
      authority.permission,
      authority.allowedOperations,
    );
    if (!resolution.ok) return { ok: false, code: resolution.code };
    source = item.task;
    step = source.steps.find((candidate) => candidate.id === resolution.approval.stepId) ?? null;
    if (!step) return { ok: false, code: 'step-not-found' };
    confirmedCallIds = new Set([step.request.callId]);
  } else {
    if (item.status !== 'failed') return { ok: false, code: 'invalid-transition' };
    const retry = failedAgentTaskRetry(item.task, now);
    if (!retry) return { ok: false, code: 'invalid-transition' };
    source = retry;
    step = retry.steps.find((candidate) => candidate.status === 'pending') ?? null;
    if (!step) return { ok: false, code: 'no-pending-step' };
    // Retry deliberately carries no confirmation. A sensitive failed step must
    // stop at waiting-confirmation and be approved again.
  }

  if (!step) return { ok: false, code: 'no-pending-step' };
  let result: Awaited<ReturnType<typeof runAgentTaskStep>>;
  try {
    result = await runAgentTaskStep(authority.queue, source, step, {
      permission: authority.permission,
      allowedOperations: authority.allowedOperations,
      handlers: authority.handlers,
      ...(confirmedCallIds ? { confirmedCallIds } : {}),
      leaseAction: action,
    });
  } catch {
    return { ok: false, code: 'run-failed' };
  }
  if (result.leaseRefusal) {
    const code = result.leaseRefusal.code;
    return {
      ok: false,
      code: code === 'task-not-found'
        ? 'task-not-found'
        : code === 'confirmation-required'
          ? 'confirmation-required'
          : code === 'stale-snapshot' || code === 'step-not-runnable' || code === 'lease-held'
            ? 'invalid-transition'
            : 'run-failed',
    };
  }
  if (result.refusal) return { ok: false, code: result.refusal.code };
  if (result.leaseCommitFailure) {
    // Main has already persisted the row as `running`. Keep that in-doubt state
    // quarantined: the tool may have completed and blind Retry is unsafe.
    quarantineAgentPlan(conversationId, result.queue, taskId);
    return {
      ok: false,
      code: 'outcome-not-recorded',
      task: result.task,
      stepId: step.id,
      events: result.events,
    };
  }
  quarantinedAgentPlans.delete(taskId);
  return {
    ok: true,
    queue: result.queue,
    task: result.task,
    stepId: step.id,
    events: result.events,
  };
}
