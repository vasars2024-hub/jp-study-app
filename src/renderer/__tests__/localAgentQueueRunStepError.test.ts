/**
 * Audit A5 at the queue boundary: a tool failure that is empty, over 500
 * characters, or a throw from the bookkeeping around the tool must never leave
 * the row `running` under a held lease. Fake lease client, fake handlers.
 */
import { describe, expect, it, vi } from 'vitest';
import { AGENT_STEP_FAILED_FALLBACK, createAgentTask, type AgentTask } from '../../shared/localAgent';
import { enqueueAgentTask, normalizeAgentTaskQueue, type AgentTaskQueue } from '../../shared/localAgentTaskQueue';
import {
  applyAgentRunToQueue,
  failedAgentTaskSnapshot,
  runAgentTaskStep,
  selectAgentQueueRun,
  type AgentQueueExecutionLeaseClient,
} from '../localAgentQueueRun';

function state(queue: AgentTaskQueue) {
  return { version: 1 as const, queue, memory: { version: 1 as const, entries: [] }, automations: [], legacyMigratedAt: null };
}

function fakeLease(queue: AgentTaskQueue) {
  const committed: AgentTask[] = [];
  const client: AgentQueueExecutionLeaseClient = {
    acquire: async () => ({ ok: true, token: 't', expiresAt: Date.now() + 30_000, state: state(queue) }),
    keepAlive: () => () => undefined,
    release: vi.fn(async () => ({ ok: true as const, state: state(queue) })),
    commit: vi.fn(async (_id: string, _token: string, next: AgentTask) => {
      committed.push(next);
      return { ok: true as const, state: state(applyAgentRunToQueue(queue, next)) };
    }),
  };
  return { client, committed };
}

function queued(task: AgentTask): AgentTaskQueue {
  return normalizeAgentTaskQueue(JSON.parse(JSON.stringify(enqueueAgentTask(normalizeAgentTaskQueue(null), task, 0, 10))));
}

function lookupTask(id: string): AgentTask {
  return createAgentTask(id, 'look up', [{
    id: 'look',
    label: 'Look up',
    request: { callId: `call-${id}`, operation: 'dictionary.lookup', arguments: { term: '猫' } },
  }], 10);
}

describe('a failed tool always settles its queue row', () => {
  it.each([
    ['an empty error', () => { throw new Error(''); }, AGENT_STEP_FAILED_FALLBACK],
    ['a 2,000-character error', () => { throw new Error('e'.repeat(2_000)); }, null],
  ])('%s is committed as a bounded failure and the claim is cleared', async (_label, handler, expected) => {
    const queue = queued(lookupTask('t1'));
    const selection = selectAgentQueueRun(queue, 't1');
    if (!selection.ok) throw new Error(selection.reason);
    const lease = fakeLease(queue);
    const result = await runAgentTaskStep(queue, selection.item.task, selection.step, {
      permission: 'read-only',
      allowedOperations: undefined,
      handlers: { 'dictionary.lookup': handler },
      leaseClient: lease.client,
    });
    expect(result.task.status).toBe('failed');
    const error = result.task.steps[0].error ?? '';
    if (expected) expect(error).toBe(expected);
    expect(error.length).toBeGreaterThan(0);
    expect(error.length).toBeLessThanOrEqual(500);
    expect(lease.client.commit).toHaveBeenCalledTimes(1);
    expect(result.queue.items.find((item) => item.id === 't1')?.status).toBe('failed');
  });

  it('releases the lease when the step bookkeeping itself throws', async () => {
    // Two steps; running the SECOND while the first is pending makes `start-step`
    // throw inside `executeAgentTaskStep` — the path that used to rethrow with
    // the lease still held.
    const task = createAgentTask('t2', 'two steps', [
      { id: 'first', label: 'First', request: { callId: 'c1', operation: 'dictionary.lookup', arguments: { term: 'a' } } },
      { id: 'second', label: 'Second', request: { callId: 'c2', operation: 'dictionary.lookup', arguments: { term: 'b' } } },
    ], 10);
    const queue = queued(task);
    const lease = fakeLease(queue);
    await expect(runAgentTaskStep(queue, task, task.steps[1], {
      permission: 'read-only',
      allowedOperations: undefined,
      handlers: { 'dictionary.lookup': () => ({ ok: true }) },
      leaseClient: lease.client,
    })).rejects.toThrow('plan order');
    expect(lease.client.release).toHaveBeenCalledTimes(1);
    expect(lease.client.commit).not.toHaveBeenCalled();
  });

  it('builds a failed snapshot from a pending step, or null when it cannot', () => {
    const failed = failedAgentTaskSnapshot(lookupTask('t3'), 'look', new Error(''), 20);
    expect(failed?.status).toBe('failed');
    expect(failed?.steps[0].error).toBe(AGENT_STEP_FAILED_FALLBACK);
    expect(failedAgentTaskSnapshot(lookupTask('t4'), 'missing', new Error('x'), 20)).toBeNull();
  });
});
