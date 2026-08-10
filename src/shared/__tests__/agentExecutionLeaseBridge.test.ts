import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createAgentTask } from '../localAgent';
import {
  isBoundedAgentExecutionTask,
  normalizeAgentExecutionLeaseAcquireRequest,
  normalizeAgentExecutionLeaseCommitRequest,
  AGENT_EXECUTION_LEASE_CHANNELS,
} from '../agentExecutionLeaseBridge';

const task = () => createAgentTask('task-1', 'Look up', [{
  id: 'step-1',
  label: 'Lookup',
  request: { callId: 'call-1', operation: 'dictionary.lookup', arguments: { term: '猫' } },
}], 10);

describe('Agent execution lease bridge', () => {
  it('normalizes an exact bounded snapshot and origin', () => {
    expect(normalizeAgentExecutionLeaseAcquireRequest({
      taskId: ' task-1 ',
      origin: { conversationId: ' chat-1 ', contextIds: ['ctx-1', 'ctx-1'] },
      stepId: 'step-1',
      callId: 'call-1',
      action: 'run-next',
      expectedStatus: 'queued',
      expectedUpdatedAt: 10.9,
      expectedTask: task(),
    })).toMatchObject({
      taskId: 'task-1',
      origin: { conversationId: 'chat-1', contextIds: ['ctx-1'] },
      expectedUpdatedAt: 10,
    });
  });

  it('rejects oversized/untrusted task and commit payloads', () => {
    const oversized = task();
    oversized.steps[0].request.arguments = { term: 'x'.repeat(70 * 1024) };
    expect(isBoundedAgentExecutionTask(oversized)).toBe(false);
    expect(normalizeAgentExecutionLeaseCommitRequest({
      taskId: 'task-1',
      token: 'token',
      nextTask: oversized,
    })).toBeNull();
    expect(normalizeAgentExecutionLeaseAcquireRequest({
      taskId: 'task-1',
      origin: { conversationId: '', contextIds: [] },
      stepId: 'step-1',
      callId: 'call-1',
      action: 'run-next',
      expectedStatus: 'queued',
      expectedUpdatedAt: 10,
      expectedTask: task(),
    })).toBeNull();
  });

  it('keeps main, preload, and renderer declarations on the same channel set', () => {
    const root = resolve(__dirname, '../../..');
    const main = readFileSync(resolve(root, 'src/main/agentOperationalIpc.ts'), 'utf8');
    const preload = readFileSync(resolve(root, 'src/preload.ts'), 'utf8');
    const declaration = readFileSync(resolve(root, 'src/renderer/window.d.ts'), 'utf8');
    for (const channel of Object.values(AGENT_EXECUTION_LEASE_CHANNELS)) {
      expect(main).toContain(channel.split(':')[1]);
      expect(preload).toContain(`'${channel}'`);
    }
    for (const method of ['Acquire', 'Renew', 'Commit', 'Release', 'Recover']) {
      expect(declaration).toContain(`agentExecutionLease${method}`);
    }
  });
});
