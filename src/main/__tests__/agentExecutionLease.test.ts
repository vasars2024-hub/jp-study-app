import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAgentTask } from '../../shared/localAgent';
import type { AgentExecutionLeaseAcquireRequest } from '../../shared/agentExecutionLeaseBridge';
import {
  enqueueAgentTask,
  nextRunnableAgentQueueItem,
  pauseAgentQueueItem,
  resumeAgentQueueItem,
} from '../../shared/localAgentTaskQueue';
import { emptyAgentOperationalState } from '../../shared/agentOperationalState';
import { createAgentExecutionLeaseManager } from '../agentExecutionLease';
import { createAgentOperationalStore, type AgentOperationalStore } from '../agentOperationalStore';

let root = '';
let clock = 1_900_000_000_000;
let store: AgentOperationalStore;

function seed(sensitive = false) {
  const task = createAgentTask('task-1', 'Run exactly once', [{
    id: 'step-1',
    label: 'Run tool',
    request: {
      callId: 'call-1',
      operation: sensitive ? 'flashcard.delete-deck' : 'dictionary.lookup',
      arguments: sensitive ? { name: 'Deck' } : { term: '猫' },
    },
  }], clock);
  const queue = enqueueAgentTask(
    emptyAgentOperationalState().queue,
    task,
    0,
    clock,
    { conversationId: 'chat-1', contextIds: ['ctx-1'] },
  );
  store.write({ ...emptyAgentOperationalState(), queue });
  return store.read().queue.items[0];
}

function request(item = store.read().queue.items[0]): AgentExecutionLeaseAcquireRequest {
  return {
    taskId: item.id,
    origin: item.origin ?? null,
    stepId: item.task.steps[0].id,
    callId: item.task.steps[0].request.callId,
    action: 'run-next',
    expectedStatus: item.status,
    expectedUpdatedAt: item.updatedAt,
    expectedTask: item.task,
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-execution-lease-'));
  clock = 1_900_000_000_000;
  store = createAgentOperationalStore(root, () => clock);
});

afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

describe('main-owned Agent execution lease', () => {
  it('atomically lets only one of two windows claim an exact row and persists the claim', () => {
    const item = seed();
    const manager = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-a');

    const first = manager.acquire(request(item), 11);
    const second = manager.acquire(request(item), 22);

    expect(first).toMatchObject({ ok: true, token: 'token-a' });
    expect(second).toEqual({ ok: false, code: 'lease-held' });
    expect(store.read().queue.items[0]).toMatchObject({
      status: 'running',
      execution: { stepId: 'step-1', callId: 'call-1', action: 'run-next' },
    });
    const claim = store.read().queue.items[0].execution;
    if (!claim) throw new Error('expected durable claim');
    expect(manager.recover({
      taskId: item.id,
      origin: item.origin ?? null,
      stepId: claim.stepId,
      callId: claim.callId,
      startedAt: claim.startedAt,
    })).toEqual({ ok: false, code: 'lease-not-expired' });
  });

  it('refuses stale snapshots and requires the exact one-use sensitive confirmation', () => {
    const item = seed(true);
    const manager = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-a');
    const stale = { ...request(item), expectedUpdatedAt: item.updatedAt + 1 };
    expect(manager.acquire(stale, 1)).toEqual({ ok: false, code: 'stale-snapshot' });

    item.task.steps[0].status = 'waiting-confirmation';
    item.task.status = 'waiting-confirmation';
    store.write({
      ...store.read(),
      queue: { version: 1, items: [{ ...item, task: item.task }] },
    });
    const awaiting = store.read().queue.items[0];
    const confirm = { ...request(awaiting), action: 'confirm' as const };
    expect(manager.acquire(confirm, 1)).toEqual({ ok: false, code: 'confirmation-required' });
    expect(manager.acquire({ ...confirm, confirmedCallId: 'call-1' }, 1)).toMatchObject({ ok: true });
  });

  it('clears a claim only on proven pre-side-effect release or lease-owned commit', () => {
    const item = seed();
    const manager = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-a');
    const acquired = manager.acquire(request(item), 1);
    if (!acquired.ok) throw new Error('expected lease');
    expect(manager.release({ taskId: item.id, token: acquired.token }, 2))
      .toEqual({ ok: false, code: 'lease-not-owned' });
    expect(manager.release({ taskId: item.id, token: acquired.token }, 1)).toMatchObject({ ok: true });
    expect(store.read().queue.items[0]).toMatchObject({ status: 'queued' });
    expect(store.read().queue.items[0].execution).toBeUndefined();

    const again = manager.acquire(request(), 1);
    if (!again.ok) throw new Error('expected second lease');
    expect(manager.commit({
      taskId: item.id,
      token: again.token,
      nextTask: { ...store.read().queue.items[0].task, objective: 'Rewritten plan' },
    }, 1)).toEqual({ ok: false, code: 'invalid-request' });
    const completed = {
      ...store.read().queue.items[0].task,
      status: 'completed' as const,
      steps: store.read().queue.items[0].task.steps.map((step) => ({ ...step, status: 'completed' as const })),
    };
    expect(manager.commit({ taskId: item.id, token: again.token, nextTask: completed }, 1))
      .toMatchObject({ ok: true });
    expect(store.read().queue.items[0]).toMatchObject({ status: 'completed' });
    expect(store.read().queue.items[0].execution).toBeUndefined();
  });

  it('keeps a paused claim in-doubt across expiry/main loss and blocks resume duplicates', () => {
    const item = seed();
    const manager = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-a', 1_000);
    expect(manager.acquire(request(item), 1)).toMatchObject({ ok: true });

    const paused = pauseAgentQueueItem(store.read().queue, item.id, clock + 10);
    store.write(manager.rebaseSave({ ...store.read(), queue: paused }));
    expect(store.read().queue.items[0]).toMatchObject({ status: 'paused', execution: { stepId: 'step-1' } });

    clock += 2_000;
    // Simulate main restart: no in-memory lease survives, only the durable marker.
    const restarted = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-b');
    const resumed = resumeAgentQueueItem(store.read().queue, item.id, clock);
    store.write(restarted.rebaseSave({ ...store.read(), queue: resumed }));
    const afterResume = store.read().queue.items[0];
    expect(afterResume).toMatchObject({ status: 'paused', execution: { stepId: 'step-1' } });
    expect(nextRunnableAgentQueueItem(store.read().queue)).toBeNull();
    expect(restarted.acquire(request(afterResume), 2)).toEqual({ ok: false, code: 'lease-held' });

    const claim = afterResume.execution;
    if (!claim) throw new Error('expected durable claim');
    expect(restarted.recover({
      taskId: item.id,
      origin: afterResume.origin ?? null,
      stepId: claim.stepId,
      callId: claim.callId,
      startedAt: claim.startedAt,
    })).toMatchObject({ ok: true });
    expect(store.read().queue.items[0]).toMatchObject({ status: 'queued' });
    expect(store.read().queue.items[0].execution).toBeUndefined();
  });

  it('rebases a stale queued whole-document save after expiry around the durable claim', () => {
    const item = seed();
    const stale = store.read();
    const manager = createAgentExecutionLeaseManager(() => store, () => clock, () => 'token-a', 1_000);
    expect(manager.acquire(request(item), 1)).toMatchObject({ ok: true });
    clock += 2_000;

    store.write(manager.rebaseSave(stale));
    expect(store.read().queue.items[0]).toMatchObject({
      status: 'running',
      execution: { stepId: 'step-1', callId: 'call-1' },
    });
  });
});
