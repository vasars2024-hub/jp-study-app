import { randomUUID } from 'node:crypto';
import type { AgentTask } from '../shared/localAgent';
import {
  AGENT_EXECUTION_LEASE_MS,
  type AgentExecutionLeaseAcquireRequest,
  type AgentExecutionLeaseAcquireResult,
  type AgentExecutionLeaseCommitRequest,
  type AgentExecutionLeaseCommitResult,
  type AgentExecutionLeaseReleaseResult,
  type AgentExecutionLeaseRecoverRequest,
  type AgentExecutionLeaseRecoverResult,
  type AgentExecutionLeaseRenewResult,
  type AgentExecutionLeaseTokenRequest,
} from '../shared/agentExecutionLeaseBridge';
import type { AgentOperationalState } from '../shared/agentOperationalState';
import {
  normalizeAgentTaskQueue,
  type AgentQueueItem,
  type AgentQueueStatus,
  type AgentTaskOrigin,
} from '../shared/localAgentTaskQueue';
import type { AgentOperationalStore } from './agentOperationalStore';

interface ActiveLease {
  taskId: string;
  origin: AgentTaskOrigin | null;
  stepId: string;
  callId: string;
  ownerId: number;
  token: string;
  expiresAt: number;
  expectedTask: AgentTask;
  previousStatus: AgentQueueStatus;
}

export interface AgentExecutionLeaseManager {
  acquire(request: AgentExecutionLeaseAcquireRequest, ownerId: number): AgentExecutionLeaseAcquireResult;
  renew(request: AgentExecutionLeaseTokenRequest, ownerId: number): AgentExecutionLeaseRenewResult;
  release(request: AgentExecutionLeaseTokenRequest, ownerId: number): AgentExecutionLeaseReleaseResult;
  commit(request: AgentExecutionLeaseCommitRequest, ownerId: number): AgentExecutionLeaseCommitResult;
  recover(request: AgentExecutionLeaseRecoverRequest): AgentExecutionLeaseRecoverResult;
  /** Protects leased rows from full-document renderer saves while retaining Pause/Cancel. */
  rebaseSave(value: AgentOperationalState): AgentOperationalState;
}

function same(value: unknown, expected: unknown): boolean {
  try {
    return JSON.stringify(value) === JSON.stringify(expected);
  } catch {
    return false;
  }
}

function originOf(item: AgentQueueItem): AgentTaskOrigin | null {
  return item.origin ?? null;
}

function taskStatus(task: AgentTask, current: AgentQueueStatus): AgentQueueStatus {
  if (current === 'paused' || current === 'cancelled') return current;
  if (task.status === 'completed') return 'completed';
  if (task.status === 'failed') return 'failed';
  return 'queued';
}

function sameTaskPlan(expected: AgentTask, next: AgentTask, leasedStepId: string): boolean {
  return expected.id === next.id
    && expected.objective === next.objective
    && expected.createdAt === next.createdAt
    && next.updatedAt >= expected.updatedAt
    && expected.steps.length === next.steps.length
    && expected.steps.every((step, index) => {
      const candidate = next.steps[index];
      return candidate?.id === step.id
        && candidate.label === step.label
        && same(candidate.request, step.request)
        && (step.id === leasedStepId || same(candidate, step));
    });
}

export function createAgentExecutionLeaseManager(
  resolveStore: () => AgentOperationalStore,
  now: () => number = Date.now,
  tokenFactory: () => string = randomUUID,
  leaseMs = AGENT_EXECUTION_LEASE_MS,
): AgentExecutionLeaseManager {
  const leases = new Map<string, ActiveLease>();

  const active = (taskId: string): ActiveLease | null => {
    const lease = leases.get(taskId);
    if (!lease) return null;
    if (lease.expiresAt > now()) return lease;
    leases.delete(taskId);
    return null;
  };

  const owned = (
    request: AgentExecutionLeaseTokenRequest,
    ownerId: number,
  ): ActiveLease | { ok: false; code: 'lease-expired' | 'lease-not-owned' } => {
    const lease = leases.get(request.taskId);
    if (!lease || lease.expiresAt <= now()) {
      leases.delete(request.taskId);
      return { ok: false, code: 'lease-expired' };
    }
    if (lease.token !== request.token || lease.ownerId !== ownerId) {
      return { ok: false, code: 'lease-not-owned' };
    }
    return lease;
  };

  return {
    acquire: (request, ownerId) => {
      if (active(request.taskId)) return { ok: false, code: 'lease-held' };
      const store = resolveStore();
      const current = store.read();
      const item = current.queue.items.find((candidate) => candidate.id === request.taskId);
      if (!item || !same(originOf(item), request.origin)) return { ok: false, code: 'task-not-found' };
      // A claim survives main/renderer crashes and lease expiry. It is an
      // explicit in-doubt marker, never an automatically recoverable lock.
      if (item.execution) return { ok: false, code: 'lease-held' };
      if (
        item.updatedAt !== request.expectedUpdatedAt
        || item.status !== request.expectedStatus
        || !same(item.task, request.expectedTask)
      ) return { ok: false, code: 'stale-snapshot' };
      const step = item.task.steps.find((candidate) => (
        candidate.id === request.stepId && candidate.request.callId === request.callId
      ));
      if (!step) return { ok: false, code: 'step-not-runnable' };
      const runnable = request.action === 'retry'
        ? item.status === 'failed' && step.status === 'failed'
        : item.status === 'queued' && (
          request.action === 'confirm'
            ? step.status === 'waiting-confirmation'
            : step.status === 'pending'
        );
      if (!runnable) return { ok: false, code: 'step-not-runnable' };
      if (
        request.action === 'confirm'
        && request.confirmedCallId !== request.callId
      ) return { ok: false, code: 'confirmation-required' };
      if (request.action !== 'confirm' && request.confirmedCallId !== undefined) {
        return { ok: false, code: 'invalid-request' };
      }
      const startedAt = now();
      const expiresAt = startedAt + Math.max(1_000, Math.min(leaseMs, 120_000));
      const lease: ActiveLease = {
        taskId: request.taskId,
        origin: request.origin,
        stepId: request.stepId,
        callId: request.callId,
        ownerId,
        token: tokenFactory(),
        expiresAt,
        expectedTask: item.task,
        previousStatus: item.status,
      };
      try {
        const queue = normalizeAgentTaskQueue({
          version: 1,
          items: current.queue.items.map((candidate) => candidate.id === item.id
            ? {
                ...candidate,
                status: 'running',
                updatedAt: startedAt,
                execution: {
                  version: 1,
                  stepId: request.stepId,
                  callId: request.callId,
                  action: request.action,
                  previousStatus: item.status === 'failed' ? 'failed' : 'queued',
                  startedAt,
                  expiresAt,
                },
              }
            : candidate),
        });
        const state = store.write({ ...current, queue });
        leases.set(request.taskId, lease);
        return { ok: true, token: lease.token, expiresAt: lease.expiresAt, state };
      } catch {
        return { ok: false, code: 'write-failed' };
      }
    },

    renew: (request, ownerId) => {
      const lease = owned(request, ownerId);
      if ('ok' in lease) return lease;
      lease.expiresAt = now() + Math.max(1_000, Math.min(leaseMs, 120_000));
      return { ok: true, token: lease.token, expiresAt: lease.expiresAt };
    },

    release: (request, ownerId) => {
      const lease = owned(request, ownerId);
      if ('ok' in lease) return lease;
      const store = resolveStore();
      const current = store.read();
      const item = current.queue.items.find((candidate) => candidate.id === request.taskId);
      if (
        !item || !same(item.task, lease.expectedTask) || !same(originOf(item), lease.origin)
        || item.execution?.stepId !== lease.stepId
        || item.execution?.callId !== lease.callId
      ) {
        return { ok: false, code: 'stale-snapshot' };
      }
      try {
        const queue = normalizeAgentTaskQueue({
          version: 1,
          items: current.queue.items.map((candidate) => candidate.id === item.id
            ? {
                ...candidate,
                status: lease.previousStatus,
                updatedAt: now(),
                execution: undefined,
              }
            : candidate),
        });
        const state = store.write({ ...current, queue });
        leases.delete(request.taskId);
        return { ok: true, state };
      } catch {
        return { ok: false, code: 'write-failed' };
      }
    },

    commit: (request, ownerId) => {
      const lease = owned(request, ownerId);
      if ('ok' in lease) return lease;
      const store = resolveStore();
      const current = store.read();
      const item = current.queue.items.find((candidate) => candidate.id === request.taskId);
      if (!item || !same(originOf(item), lease.origin)) {
        return { ok: false, code: 'task-not-found' };
      }
      if (
        item.execution?.stepId !== lease.stepId
        || item.execution?.callId !== lease.callId
      ) return { ok: false, code: 'stale-snapshot' };
      // Pause/Cancel is allowed during execution. The task itself is the CAS;
      // any other task mutation means a second writer touched this exact work.
      if (!same(item.task, lease.expectedTask)) return { ok: false, code: 'stale-snapshot' };
      if (!sameTaskPlan(item.task, request.nextTask, lease.stepId)) {
        return { ok: false, code: 'invalid-request' };
      }
      const queue = normalizeAgentTaskQueue({
        version: 1,
        items: current.queue.items.map((candidate) => candidate.id === item.id
          ? {
              ...candidate,
              task: request.nextTask,
              status: taskStatus(request.nextTask, candidate.status),
              updatedAt: now(),
              execution: undefined,
            }
          : candidate),
      });
      try {
        const state = store.write({ ...current, queue });
        leases.delete(request.taskId);
        return { ok: true, state };
      } catch {
        // Retain until expiry. The renderer cannot safely retry a tool whose
        // side effect may have happened when its outcome was not committed.
        return { ok: false, code: 'write-failed' };
      }
    },

    recover: (request) => {
      const store = resolveStore();
      const current = store.read();
      const item = current.queue.items.find((candidate) => candidate.id === request.taskId);
      if (!item || !same(originOf(item), request.origin)) return { ok: false, code: 'task-not-found' };
      const claim = item.execution;
      if (
        !claim || claim.stepId !== request.stepId || claim.callId !== request.callId
        || claim.startedAt !== request.startedAt
      ) return { ok: false, code: 'stale-snapshot' };
      if (claim.expiresAt > now()) return { ok: false, code: 'lease-not-expired' };
      const queue = normalizeAgentTaskQueue({
        version: 1,
        items: current.queue.items.map((candidate) => candidate.id === item.id
          ? {
              ...candidate,
              status: claim.previousStatus,
              execution: undefined,
              updatedAt: now(),
            }
          : candidate),
      });
      try {
        const state = store.write({ ...current, queue });
        leases.delete(request.taskId);
        return { ok: true, state };
      } catch {
        return { ok: false, code: 'write-failed' };
      }
    },

    rebaseSave: (value) => {
      const current = resolveStore().read();
      let items = value.queue.items;
      const protectedTaskIds = new Set([
        ...current.queue.items.filter((item) => item.execution).map((item) => item.id),
        ...[...leases.keys()].filter((taskId) => active(taskId)),
      ]);
      for (const taskId of protectedTaskIds) {
        const authoritative = current.queue.items.find((item) => item.id === taskId);
        if (!authoritative) continue;
        const incoming = items.find((item) => item.id === taskId);
        const protectedItem: AgentQueueItem = incoming
          ? {
              ...authoritative,
              priority: incoming.priority,
              status: incoming.status === 'paused' || incoming.status === 'cancelled'
                ? incoming.status
                : authoritative.status,
              updatedAt: incoming.status === 'paused' || incoming.status === 'cancelled'
                ? incoming.updatedAt
                : authoritative.updatedAt,
            }
          : authoritative;
        items = [...items.filter((item) => item.id !== taskId), protectedItem];
      }
      return { ...value, queue: normalizeAgentTaskQueue({ version: 1, items }) };
    },
  };
}
