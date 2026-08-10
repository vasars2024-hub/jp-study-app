/**
 * Typed IPC contract for the main-owned queued-step execution lease.
 *
 * A renderer is allowed to choose and authorize work, but it is not allowed to
 * decide that it is the only window running it. Main compares the renderer's
 * exact row snapshot with the operational document and grants one short lease.
 */
import {
  getAgentToolOperation,
  type AgentTask,
  type AgentTaskStatus,
  type AgentTaskStepStatus,
} from './localAgent';
import {
  normalizeAgentTaskOrigin,
  type AgentQueueStatus,
  type AgentTaskOrigin,
} from './localAgentTaskQueue';
import type { AgentOperationalState } from './agentOperationalState';

export const AGENT_EXECUTION_LEASE_CHANNELS = {
  acquire: 'agentExecutionLease:acquire',
  renew: 'agentExecutionLease:renew',
  commit: 'agentExecutionLease:commit',
  release: 'agentExecutionLease:release',
  recover: 'agentExecutionLease:recover',
} as const;

export const AGENT_EXECUTION_LEASE_MS = 30_000;
export const AGENT_EXECUTION_LEASE_RENEW_MS = 10_000;

export type AgentExecutionLeaseAction = 'run-next' | 'confirm' | 'retry';

export interface AgentExecutionLeaseAcquireRequest {
  taskId: string;
  origin: AgentTaskOrigin | null;
  stepId: string;
  callId: string;
  action: AgentExecutionLeaseAction;
  expectedStatus: AgentQueueStatus;
  expectedUpdatedAt: number;
  expectedTask: AgentTask;
  confirmedCallId?: string;
}

export interface AgentExecutionLeaseTokenRequest {
  taskId: string;
  token: string;
}

export interface AgentExecutionLeaseCommitRequest extends AgentExecutionLeaseTokenRequest {
  nextTask: AgentTask;
}

export interface AgentExecutionLeaseRecoverRequest {
  taskId: string;
  origin: AgentTaskOrigin | null;
  stepId: string;
  callId: string;
  startedAt: number;
}

export type AgentExecutionLeaseFailureCode =
  | 'invalid-request'
  | 'task-not-found'
  | 'stale-snapshot'
  | 'step-not-runnable'
  | 'confirmation-required'
  | 'lease-held'
  | 'lease-expired'
  | 'lease-not-owned'
  | 'lease-not-expired'
  | 'write-failed'
  | 'bridge-unavailable';

export type AgentExecutionLeaseAcquireResult =
  | { ok: true; token: string; expiresAt: number; state: AgentOperationalState }
  | { ok: false; code: AgentExecutionLeaseFailureCode };

export type AgentExecutionLeaseRenewResult =
  | { ok: true; token: string; expiresAt: number }
  | { ok: false; code: AgentExecutionLeaseFailureCode };

export type AgentExecutionLeaseReleaseResult =
  | { ok: true; state: AgentOperationalState }
  | { ok: false; code: AgentExecutionLeaseFailureCode };

export type AgentExecutionLeaseCommitResult =
  | { ok: true; state: AgentOperationalState }
  | { ok: false; code: AgentExecutionLeaseFailureCode };

export type AgentExecutionLeaseRecoverResult = AgentExecutionLeaseCommitResult;

const ACTIONS = new Set<AgentExecutionLeaseAction>(['run-next', 'confirm', 'retry']);
const STATUSES = new Set<AgentQueueStatus>([
  'queued', 'running', 'paused', 'completed', 'failed', 'cancelled',
]);
const TASK_STATUSES = new Set<AgentTaskStatus>([
  'queued', 'running', 'waiting-confirmation', 'completed', 'failed', 'cancelled',
]);
const STEP_STATUSES = new Set<AgentTaskStepStatus>([
  'pending', 'running', 'waiting-confirmation', 'completed', 'failed', 'skipped',
]);

function boundedId(value: unknown, max = 240): string | null {
  if (typeof value !== 'string') return null;
  const id = value.trim();
  return id && id.length <= max ? id : null;
}

function finiteTimestamp(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : null;
}

function serializesWithin(value: unknown, bytes: number): boolean {
  try {
    const serialized = JSON.stringify(value);
    return serialized !== undefined && new TextEncoder().encode(serialized).byteLength <= bytes;
  } catch {
    return false;
  }
}

/** Strictly bounds the task-sized payload before main compares or persists it. */
export function isBoundedAgentExecutionTask(value: unknown): value is AgentTask {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const task = value as Partial<AgentTask>;
  if (
    !boundedId(task.id, 500)
    || typeof task.objective !== 'string' || !task.objective.trim() || task.objective.length > 500
    || !TASK_STATUSES.has(task.status as AgentTaskStatus)
    || !Array.isArray(task.steps) || task.steps.length < 1 || task.steps.length > 32
    || finiteTimestamp(task.createdAt) === null || finiteTimestamp(task.updatedAt) === null
    || (task.currentStepId !== undefined && !boundedId(task.currentStepId, 500))
    || !serializesWithin(value, 512 * 1024)
  ) return false;
  const stepIds = new Set<string>();
  const callIds = new Set<string>();
  return task.steps.every((step) => {
    if (!step || typeof step !== 'object' || Array.isArray(step)) return false;
    const id = boundedId(step.id, 500);
    const callId = boundedId(step.request?.callId, 500);
    if (
      !id || stepIds.has(id)
      || typeof step.label !== 'string' || !step.label.trim() || step.label.length > 500
      || !STEP_STATUSES.has(step.status as AgentTaskStepStatus)
      || !callId || callIds.has(callId)
      || !getAgentToolOperation(step.request?.operation)
      || !step.request.arguments || typeof step.request.arguments !== 'object'
      || Array.isArray(step.request.arguments)
      || !serializesWithin(step.request.arguments, 64 * 1024)
      || (step.error !== undefined && (typeof step.error !== 'string' || step.error.length > 2_000))
      || (step.result !== undefined && !serializesWithin(step.result, 256 * 1024))
    ) return false;
    stepIds.add(id);
    callIds.add(callId);
    return true;
  });
}

export function normalizeAgentExecutionLeaseAcquireRequest(
  value: unknown,
): AgentExecutionLeaseAcquireRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<AgentExecutionLeaseAcquireRequest>;
  const taskId = boundedId(raw.taskId, 120);
  const stepId = boundedId(raw.stepId, 120);
  const callId = boundedId(raw.callId, 160);
  const expectedUpdatedAt = finiteTimestamp(raw.expectedUpdatedAt);
  const origin = raw.origin === null ? null : normalizeAgentTaskOrigin(raw.origin);
  if (
    !taskId || !stepId || !callId || expectedUpdatedAt === null
    || !ACTIONS.has(raw.action as AgentExecutionLeaseAction)
    || !STATUSES.has(raw.expectedStatus as AgentQueueStatus)
    || (raw.origin !== null && !origin)
    || !isBoundedAgentExecutionTask(raw.expectedTask)
  ) return null;
  const confirmedCallId = raw.confirmedCallId === undefined
    ? undefined
    : boundedId(raw.confirmedCallId, 160);
  if (raw.confirmedCallId !== undefined && !confirmedCallId) return null;
  return {
    taskId,
    origin,
    stepId,
    callId,
    action: raw.action as AgentExecutionLeaseAction,
    expectedStatus: raw.expectedStatus as AgentQueueStatus,
    expectedUpdatedAt,
    expectedTask: raw.expectedTask,
    ...(confirmedCallId ? { confirmedCallId } : {}),
  };
}

export function normalizeAgentExecutionLeaseTokenRequest(
  value: unknown,
): AgentExecutionLeaseTokenRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<AgentExecutionLeaseTokenRequest>;
  const taskId = boundedId(raw.taskId, 120);
  const token = boundedId(raw.token, 200);
  return taskId && token ? { taskId, token } : null;
}

export function normalizeAgentExecutionLeaseCommitRequest(
  value: unknown,
): AgentExecutionLeaseCommitRequest | null {
  const token = normalizeAgentExecutionLeaseTokenRequest(value);
  if (!token || !value || typeof value !== 'object' || Array.isArray(value)) return null;
  const nextTask = (value as Partial<AgentExecutionLeaseCommitRequest>).nextTask;
  if (!isBoundedAgentExecutionTask(nextTask)) return null;
  return { ...token, nextTask };
}

export function normalizeAgentExecutionLeaseRecoverRequest(
  value: unknown,
): AgentExecutionLeaseRecoverRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<AgentExecutionLeaseRecoverRequest>;
  const taskId = boundedId(raw.taskId, 120);
  const stepId = boundedId(raw.stepId, 120);
  const callId = boundedId(raw.callId, 160);
  const startedAt = finiteTimestamp(raw.startedAt);
  const origin = raw.origin === null ? null : normalizeAgentTaskOrigin(raw.origin);
  if (!taskId || !stepId || !callId || startedAt === null || (raw.origin !== null && !origin)) {
    return null;
  }
  return { taskId, origin, stepId, callId, startedAt };
}
