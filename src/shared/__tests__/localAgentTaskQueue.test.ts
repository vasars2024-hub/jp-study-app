import { describe, expect, it } from 'vitest';
import type { AgentTask } from '../localAgent';
import {
  cancelAgentQueueItem,
  enqueueAgentTask,
  MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS,
  MAX_AGENT_TASK_ORIGIN_ID_LENGTH,
  nextRunnableAgentQueueItem,
  normalizeAgentTaskOrigin,
  normalizeAgentTaskQueue,
  pauseAgentQueueItem,
  prioritizeAgentQueueItem,
  resumeAgentQueueItem,
  updateAgentQueueItem,
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

  it('normalizes bounded task origins and omits incomplete or legacy provenance', () => {
    expect(normalizeAgentTaskOrigin({
      conversationId: `  ${'c'.repeat(MAX_AGENT_TASK_ORIGIN_ID_LENGTH + 20)}  `,
      contextIds: [' ctx-one ', 'ctx-one', '', 7, `x${'y'.repeat(MAX_AGENT_TASK_ORIGIN_ID_LENGTH + 20)}`],
    })).toEqual({
      conversationId: 'c'.repeat(MAX_AGENT_TASK_ORIGIN_ID_LENGTH),
      contextIds: [
        'ctx-one',
        `x${'y'.repeat(MAX_AGENT_TASK_ORIGIN_ID_LENGTH - 1)}`,
      ],
    });

    expect(normalizeAgentTaskOrigin(null)).toBeNull();
    expect(normalizeAgentTaskOrigin({ conversationId: 'chat' })).toBeNull();
    expect(normalizeAgentTaskOrigin({ contextIds: [] })).toBeNull();
    expect(normalizeAgentTaskOrigin({ conversationId: 'chat', contextIds: 'ctx' })).toBeNull();
    expect(normalizeAgentTaskOrigin({ conversationId: '   ', contextIds: [] })).toBeNull();

    const queue = normalizeAgentTaskQueue({
      items: [
        { id: 'legacy', task: task('legacy') },
        { id: 'partial', task: task('partial'), origin: { conversationId: 'chat' } },
      ],
    });
    expect(queue.items[0]).not.toHaveProperty('origin');
    expect(queue.items[1]).not.toHaveProperty('origin');
  });

  it('deduplicates normalized context ids and caps their count', () => {
    const contextIds = Array.from(
      { length: MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS + 10 },
      (_, index) => ` ctx-${index} `,
    );
    contextIds.splice(1, 0, 'ctx-0');
    const origin = normalizeAgentTaskOrigin({ conversationId: ' chat ', contextIds });

    expect(origin?.conversationId).toBe('chat');
    expect(origin?.contextIds).toHaveLength(MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS);
    expect(origin?.contextIds.slice(0, 3)).toEqual(['ctx-0', 'ctx-1', 'ctx-2']);
    expect(new Set(origin?.contextIds).size).toBe(MAX_AGENT_TASK_ORIGIN_CONTEXT_IDS);
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

  it('preserves origin through normalization, replacement, and every state update', () => {
    const origin = { conversationId: ' chat-one ', contextIds: [' ctx-one ', 'ctx-one'] };
    let queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task('one'),
      0,
      10,
      origin,
    );
    const normalizedOrigin = { conversationId: 'chat-one', contextIds: ['ctx-one'] };
    expect(queue.items[0].origin).toEqual(normalizedOrigin);

    queue = normalizeAgentTaskQueue(JSON.parse(JSON.stringify(queue)));
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
    queue = updateAgentQueueItem(queue, 'one', {
      task: { ...task('one'), status: 'running' },
      status: 'running',
    }, 15);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
    queue = pauseAgentQueueItem(queue, 'one', 20);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
    queue = prioritizeAgentQueueItem(queue, 'one', 50, 30);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
    queue = resumeAgentQueueItem(queue, 'one', 40);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
    queue = cancelAgentQueueItem(queue, 'one', 50);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);

    queue = enqueueAgentTask(queue, { ...task('one'), objective: 'replacement' }, 0, 60);
    expect(queue.items[0].origin).toEqual(normalizedOrigin);
  });
});
