import type { AgentTask } from './localAgent';

export type AgentQueueStatus = 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';

export interface AgentQueueItem {
  id: string;
  task: AgentTask;
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
    return [{
      id: item.id.trim().slice(0, 120),
      task: item.task as AgentTask,
      priority: typeof item.priority === 'number' && Number.isFinite(item.priority) ? Math.max(-100, Math.min(100, Math.round(item.priority))) : 0,
      status: normalizeStatus(item.status),
      createdAt,
      updatedAt: safeTimestamp(item.updatedAt, createdAt),
      ...(typeof item.error === 'string' && item.error.trim() ? { error: item.error.trim().slice(0, 500) } : {}),
    }];
  }) : [];
  return { version: 1, items };
}

export function enqueueAgentTask(queue: AgentTaskQueue, task: AgentTask, priority = 0, now = Date.now()): AgentTaskQueue {
  const item: AgentQueueItem = {
    id: task.id,
    task,
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
    .filter((item) => item.status === 'queued')
    .sort((a, b) => b.priority - a.priority || a.createdAt - b.createdAt)[0] ?? null;
}
