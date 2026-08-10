import {
  AGENT_EXECUTION_LEASE_RENEW_MS,
  type AgentExecutionLeaseAcquireRequest,
  type AgentExecutionLeaseAcquireResult,
  type AgentExecutionLeaseCommitResult,
  type AgentExecutionLeaseFailureCode,
  type AgentExecutionLeaseReleaseResult,
  type AgentExecutionLeaseRenewResult,
  type AgentExecutionLeaseRecoverRequest,
  type AgentExecutionLeaseRecoverResult,
} from '../shared/agentExecutionLeaseBridge';
import type { AgentTask } from '../shared/localAgent';
import { applyAgentOperationalStateFromMain } from './agentOperationalClient';

interface LeaseBridge {
  agentExecutionLeaseAcquire(request: AgentExecutionLeaseAcquireRequest): Promise<AgentExecutionLeaseAcquireResult>;
  agentExecutionLeaseRenew(request: { taskId: string; token: string }): Promise<AgentExecutionLeaseRenewResult>;
  agentExecutionLeaseCommit(request: {
    taskId: string;
    token: string;
    nextTask: AgentTask;
  }): Promise<AgentExecutionLeaseCommitResult>;
  agentExecutionLeaseRelease(request: {
    taskId: string;
    token: string;
  }): Promise<AgentExecutionLeaseReleaseResult>;
  agentExecutionLeaseRecover(request: AgentExecutionLeaseRecoverRequest): Promise<AgentExecutionLeaseRecoverResult>;
}

function bridge(): Partial<LeaseBridge> | null {
  return typeof window === 'undefined'
    ? null
    : ((window as { api?: Partial<LeaseBridge> }).api ?? null);
}

function unavailable(): { ok: false; code: AgentExecutionLeaseFailureCode } {
  return { ok: false, code: 'bridge-unavailable' };
}

export async function acquireAgentExecutionLease(
  request: AgentExecutionLeaseAcquireRequest,
): Promise<AgentExecutionLeaseAcquireResult> {
  const method = bridge()?.agentExecutionLeaseAcquire;
  if (typeof method !== 'function') return unavailable();
  try {
    const result = await method(request);
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return unavailable();
    if (result.ok) applyAgentOperationalStateFromMain(result.state);
    return result;
  } catch {
    return unavailable();
  }
}

export function keepAgentExecutionLeaseAlive(taskId: string, token: string): () => void {
  const method = bridge()?.agentExecutionLeaseRenew;
  if (typeof method !== 'function') return () => undefined;
  const timer = globalThis.setInterval(() => {
    void method({ taskId, token }).catch(() => undefined);
  }, AGENT_EXECUTION_LEASE_RENEW_MS);
  return () => globalThis.clearInterval(timer);
}

export async function commitAgentExecutionLease(
  taskId: string,
  token: string,
  nextTask: AgentTask,
): Promise<AgentExecutionLeaseCommitResult> {
  const method = bridge()?.agentExecutionLeaseCommit;
  if (typeof method !== 'function') return unavailable();
  try {
    const result = await method({ taskId, token, nextTask });
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return unavailable();
    if (result.ok) applyAgentOperationalStateFromMain(result.state);
    return result;
  } catch {
    return unavailable();
  }
}

export async function releaseAgentExecutionLease(
  taskId: string,
  token: string,
): Promise<AgentExecutionLeaseReleaseResult> {
  const method = bridge()?.agentExecutionLeaseRelease;
  if (typeof method !== 'function') return unavailable();
  try {
    const result = await method({ taskId, token });
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return unavailable();
    if (result.ok) applyAgentOperationalStateFromMain(result.state);
    return result;
  } catch {
    return unavailable();
  }
}

export async function recoverAgentExecutionClaim(
  request: AgentExecutionLeaseRecoverRequest,
): Promise<AgentExecutionLeaseRecoverResult> {
  const method = bridge()?.agentExecutionLeaseRecover;
  if (typeof method !== 'function') return unavailable();
  try {
    const result = await method(request);
    if (!result || typeof result !== 'object' || typeof result.ok !== 'boolean') return unavailable();
    if (result.ok) applyAgentOperationalStateFromMain(result.state);
    return result;
  } catch {
    return unavailable();
  }
}
