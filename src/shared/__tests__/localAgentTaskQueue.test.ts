import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../localAgent';
import {
  enqueueAgentTask,
  nextRunnableAgentQueueItem,
  normalizeAgentTaskQueue,
  pauseAgentQueueItem,
  prioritizeAgentQueueItem,
  resumeAgentQueueItem,
} from '../localAgentTaskQueue';

const task = (id: string): AgentTask => ({
  id,
  objective: id,
  status: 'queued',
  createdAt: 1,
  updatedAt: 1,
  steps: [],
});

describe('local agent task queue', () => {
  it('normalizes malformed entries and caps the queue', () => {
    const queue = normalizeAgentTaskQueue({ items: [{ id: 'ok', task: task('ok') }, null, { id: '' }] });
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0].status).toBe('queued');
  });

  it('orders runnable work by priority, then creation time', () => {
    let queue = normalizeAgentTaskQueue(null);
    queue = enqueueAgentTask(queue, task('old'), 0, 1);
    queue = enqueueAgentTask(queue, task('high'), 10, 20);
    expect(nextRunnableAgentQueueItem(queue)?.id).toBe('high');
  });

  it('supports pause, resume and prioritization', () => {
    let queue = enqueueAgentTask(normalizeAgentTaskQueue(null), task('one'));
    queue = pauseAgentQueueItem(queue, 'one');
    expect(nextRunnableAgentQueueItem(queue)).toBeNull();
    queue = prioritizeAgentQueueItem(queue, 'one', 50);
    queue = resumeAgentQueueItem(queue, 'one');
    expect(nextRunnableAgentQueueItem(queue)?.priority).toBe(50);
  });
});
