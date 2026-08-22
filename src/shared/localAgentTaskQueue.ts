import type { AgentPermissionLevel, AgentTask } from './localAgent';
import { narrowAgentPermission } from './localAgentProfiles';

export type AgentQueueStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface AgentTaskOrigin {
  conversationId: string;
  contextIds: string[];
}

export interface AgentQueueExecutionClaim {
  version: 1;
  stepId: string;
  callId: string;
  action: 'run-next' | 'confirm' | 'retry';
  previousStatus: 'queued' | 'failed';
  startedAt: number;
  expiresAt: number;
}

export interface AgentQueueItem {
  id: string;
  task: AgentTask;
  /**
   * The workspace source that produced this task. Legacy queue entries have no
   * origin and remain readable, but must not be attributed to an arbitrary
   * conversation later.
   */
  origin?: AgentTaskOrigin;
  /**
   * Durable, main-owned evidence that a renderer was allowed to start this
   * exact step. It is orthogonal to status so Pause/Cancel/Resume cannot erase
   * an in-flight or crash-uncertain side effect.
   */
  execution?: AgentQueueExecutionClaim;
  /**
   * An upper bound on what this specific task may do, independent of the user's
   * live permission and profile. A scheduled automation carries the level it was
   * created under, which the automation list shows the user as that entry's
   * permission; without this the column described nothing, because execution read
   * only the live setting and a later widening silently applied to work the user
   * had authorized at a narrower level.
   *
   * It is a ceiling and never a grant: `runAgentTaskStep` combines it with the
   * live permission by taking the lower of the two, so a stale stored value can
   * never widen a run past what the user currently permits. Absent means "no task
   * bound", which is what every hand-run task and every legacy row is.
   */
  permissionCeiling?: AgentPermissionLevel;
  priority: number;
  status: AgentQueueStatus;
  createdAt: number;
  updatedAt: number;
  error?: string;
}

export interface AgentTaskQueue {
  version: 1;
  items: AgentQueueItem[];
}

export const EMPTY_AGENT_TASK_QUEUE: AgentTaskQueue = { version: 1, items: [] };
export const MAX_AGENT_QUEUE_ITEMS = 100;
export const MAX_AGENT_TASK_ORIGIN_ID_LENGTH = 240;
export const MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS = 100;

function boundedOriginId(value: unknown): string {
  return typeof value === 'string'
    ? value.trim().slice(0, MAX_AGENT_TASK_ORIGIN_ID_LENGTH)
    : '';
}

/**
 * Normalizes the causal coordinates carried beside a queued task. Both fields
 * are required as a unit so malformed partial provenance cannot be mistaken
 * for trustworthy attribution. An empty context list is valid: a conversation
 * can produce a task without attached context.
 */
export function normalizeAgentTaskOrigin(value: unknown): AgentTaskOrigin | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<AgentTaskOrigin>;
  const conversationId = boundedOriginId(raw.conversationId);
  if (!conversationId || !Array.isArray(raw.contextIds)) return null;
  const contextIds = [...new Set(raw.contextIds
    .map((contextId) => boundedOriginId(contextId))
    .filter(Boolean))]
    .slice(0, MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS);
  return { conversationId, contextIds };
}

function normalizeAgentQueueExecutionClaim(value: unknown): AgentQueueExecutionClaim | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<AgentQueueExecutionClaim>;
  const stepId = boundedOriginId(raw.stepId);
  const callId = boundedOriginId(raw.callId);
  const startedAt = safeTimestamp(raw.startedAt, -1);
  const expiresAt = safeTimestamp(raw.expiresAt, -1);
  if (
    raw.version !== 1 || !stepId || !callId || startedAt < 0 || expiresAt < startedAt
    || (raw.action !== 'run-next' && raw.action !== 'confirm' && raw.action !== 'retry')
    || (raw.previousStatus !== 'queued' && raw.previousStatus !== 'failed')
  ) return null;
  return {
    version: 1,
    stepId,
    callId,
    action: raw.action,
    previousStatus: raw.previousStatus,
    startedAt,
    expiresAt,
  };
}

const AGENT_PERMISSION_LEVELS = new Set<AgentPermissionLevel>([
  'read-only',
  'limited-actions',
  'full-automation',
]);

/**
 * An unrecognized stored ceiling is dropped rather than defaulted. Defaulting it
 * to `read-only` would refuse work the user did authorize; defaulting it to
 * `full-automation` would be a grant invented by a parser. Absent is the honest
 * reading of "this row states no bound".
 */
function normalizeAgentPermissionCeiling(value: unknown): AgentPermissionLevel | null {
  return AGENT_PERMISSION_LEVELS.has(value as AgentPermissionLevel)
    ? value as AgentPermissionLevel
    : null;
}

function safeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : fallback;
}

function normalizeStatus(value: unknown): AgentQueueStatus {
  return value === 'running' || value === 'paused' || value === 'completed' || value === 'failed' || value === 'cancelled'
    ? value
    : 'queued';
}

export function normalizeAgentTaskQueue(input: unknown): AgentTaskQueue {
  if (!input || typeof input !== 'object') return { ...EMPTY_AGENT_TASK_QUEUE };
  const raw = input as { items?: unknown };
  const now = Date.now();
  const items = Array.isArray(raw.items) ? raw.items.slice(-MAX_AGENT_QUEUE_ITEMS).flatMap((value): AgentQueueItem[] => {
    if (!value || typeof value !== 'object') return [];
    const item = value as Partial<AgentQueueItem>;
    if (!item.task || typeof item.task !== 'object' || typeof item.id !== 'string' || !item.id.trim()) return [];
    const createdAt = safeTimestamp(item.createdAt, now);
    const origin = normalizeAgentTaskOrigin(item.origin);
    const execution = normalizeAgentQueueExecutionClaim(item.execution);
    const permissionCeiling = normalizeAgentPermissionCeiling(item.permissionCeiling);
    return [{
      id: item.id.trim().slice(0, 120),
      task: item.task as AgentTask,
      ...(origin ? { origin } : {}),
      ...(execution ? { execution } : {}),
      ...(permissionCeiling ? { permissionCeiling } : {}),
      priority: typeof item.priority === 'number' && Number.isFinite(item.priority) ? Math.max(-100, Math.min(100, Math.round(item.priority))) : 0,
      status: normalizeStatus(item.status),
      createdAt,
      updatedAt: safeTimestamp(item.updatedAt, createdAt),
      ...(typeof item.error === 'string' && item.error.trim() ? { error: item.error.trim().slice(0, 500) } : {}),
    }];
  }) : [];
  return { version: 1, items };
}

export function enqueueAgentTask(
  queue: AgentTaskQueue,
  task: AgentTask,
  priority = 0,
  now = Date.now(),
  origin?: AgentTaskOrigin,
  permissionCeiling?: AgentPermissionLevel,
): AgentTaskQueue {
  const existing = queue.items.find((candidate) => candidate.id === task.id);
  const preservedOrigin = origin ?? existing?.origin;
  // Re-enqueuing an id that already carried a ceiling keeps the lower of the
  // two. Dropping the stored bound because this call stated none, or replacing
  // it with a wider one, would both let a re-plan quietly widen authorized work.
  const bound = permissionCeiling && existing?.permissionCeiling
    ? narrowAgentPermission(permissionCeiling, existing.permissionCeiling)
    : permissionCeiling ?? existing?.permissionCeiling;
  const item: AgentQueueItem = {
    id: task.id,
    task,
    ...(preservedOrigin ? { origin: preservedOrigin } : {}),
    ...(bound ? { permissionCeiling: bound } : {}),
    priority: Math.max(-100, Math.min(100, Math.round(priority))),
    status: 'queued',
    createdAt: now,
    updatedAt: now,
  };
  return normalizeAgentTaskQueue({ version: 1, items: [...queue.items.filter((candidate) => candidate.id !== item.id), item] });
}

export function updateAgentQueueItem(queue: AgentTaskQueue, id: string, patch: Partial<Pick<AgentQueueItem, 'task' | 'priority' | 'status' | 'error'>>, now = Date.now()): AgentTaskQueue {
  return normalizeAgentTaskQueue({
    version: 1,
    items: queue.items.map((item) => item.id === id ? { ...item, ...patch, updatedAt: now } : item),
  });
}

export function pauseAgentQueueItem(queue: AgentTaskQueue, id: string, now = Date.now()): AgentTaskQueue {
  return updateAgentQueueItem(queue, id, { status: 'paused' }, now);
}

export function resumeAgentQueueItem(queue: AgentTaskQueue, id: string, now = Date.now()): AgentTaskQueue {
  return updateAgentQueueItem(queue, id, { status: 'queued', error: undefined }, now);
}

export function cancelAgentQueueItem(queue: AgentTaskQueue, id: string, now = Date.now()): AgentTaskQueue {
  return updateAgentQueueItem(queue, id, { status: 'cancelled' }, now);
}

export function prioritizeAgentQueueItem(queue: AgentTaskQueue, id: string, priority = 100, now = Date.now()): AgentTaskQueue {
  return updateAgentQueueItem(queue, id, { priority }, now);
}

export function nextRunnableAgentQueueItem(queue: AgentTaskQueue): AgentQueueItem | null {
  return queue.items
    .filter((item) => item.status === 'queued' && !item.execution)
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0] ?? null;
}
