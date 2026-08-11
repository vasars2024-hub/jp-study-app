// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  settings: {
    version: 1 as const,
    enabled: true,
    backend: 'local-gguf' as const,
    modelFileName: 'planner.gguf',
    modelMode: 'standard' as const,
    acceleration: 'auto' as const,
    contextSize: 8192,
    memoryLimitMb: 2048,
    resourceMode: 'balanced' as const,
    cpuLimitPct: 80,
    gpuLimitPct: 80,
    maxConcurrentTasks: 1,
    backgroundProcessing: false,
    permission: 'limited-actions' as const,
    memoryEnabled: true,
    memoryScope: ['user-preference' as const, 'learning' as const, 'application' as const],
    chatHistory: 'full' as const,
    privacyMode: false,
    debugMode: false,
  },
  profile: {
    id: 'test-profile',
    name: 'Test profile',
    description: 'Test',
    role: 'custom' as const,
    preferredModelFileName: '',
    permission: 'limited-actions' as const,
    enabledOperations: ['dictionary.lookup'],
    responseLength: 'balanced' as const,
    explanationDepth: 'standard' as const,
    language: 'english' as const,
    teachingStyle: 'tutor' as const,
    correctionStyle: 'gentle' as const,
    enabled: true,
  },
  queue: { version: 1 as const, items: [] as unknown[] },
  saveCalls: [] as unknown[],
  saveThrows: false,
  durableOk: true,
  initThrows: false,
  allowedOperations: ['dictionary.lookup'],
  permission: 'limited-actions' as 'read-only' | 'limited-actions' | 'full-automation',
  handlers: {} as Record<string, (arguments_: Readonly<Record<string, unknown>>) => Promise<unknown> | unknown>,
  memories: [{ id: 'memory-1', text: 'cat' }],
  leaseExpected: null as null | { taskId: string; origin: unknown; task: unknown },
}));

vi.mock('../i18n', () => ({
  useT: () => ({
    t: (key: string, vars?: Record<string, string | number>) => (
      vars && 'count' in vars ? `${key}=${vars.count}` : key
    ),
  }),
}));

vi.mock('../agentOperationalClient', () => ({
  initAgentOperationalState: async () => {
    if (harness.initThrows) throw new Error('store failed');
  },
}));

vi.mock('../agentExecutionLeaseClient', () => ({
  acquireAgentExecutionLease: async (request: {
    taskId: string;
    expectedTask: { status: string };
  }) => {
    const item = (harness.queue.items as Array<Record<string, unknown>>)
      .find((candidate) => candidate.id === request.taskId);
    if (!item) return { ok: false, code: 'task-not-found' };
    harness.leaseExpected = { taskId: request.taskId, origin: item.origin, task: item.task };
    harness.queue = {
      ...harness.queue,
      items: (harness.queue.items as Array<Record<string, unknown>>).map((candidate) => (
        candidate.id === request.taskId ? { ...candidate, status: 'running' } : candidate
      )),
    };
    return {
      ok: true,
      token: 'lease-1',
      expiresAt: Date.now() + 30_000,
      state: { version: 1, queue: harness.queue, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null },
    };
  },
  keepAgentExecutionLeaseAlive: () => () => undefined,
  releaseAgentExecutionLease: async (taskId: string) => {
    harness.queue = {
      ...harness.queue,
      items: (harness.queue.items as Array<Record<string, unknown>>).map((candidate) => (
        candidate.id === taskId ? { ...candidate, status: 'queued' } : candidate
      )),
    };
    return { ok: true, state: { version: 1, queue: harness.queue, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null } };
  },
  commitAgentExecutionLease: async (taskId: string, _token: string, nextTask: { status: string }) => {
    if (!harness.durableOk) return { ok: false, code: 'write-failed' };
    const current = (harness.queue.items as Array<Record<string, unknown>>)
      .find((candidate) => candidate.id === taskId);
    if (
      !current
      || JSON.stringify(current.origin) !== JSON.stringify(harness.leaseExpected?.origin)
      || JSON.stringify(current.task) !== JSON.stringify(harness.leaseExpected?.task)
    ) return { ok: false, code: 'stale-snapshot' };
    harness.queue = {
      ...harness.queue,
      items: (harness.queue.items as Array<Record<string, unknown>>).map((candidate) => candidate.id === taskId
        ? {
            ...candidate,
            task: nextTask,
            status: candidate.status === 'paused' || candidate.status === 'cancelled'
              ? candidate.status
              : nextTask.status === 'completed' ? 'completed' : nextTask.status === 'failed' ? 'failed' : 'queued',
          }
        : candidate),
    };
    return { ok: true, state: { version: 1, queue: harness.queue, memory: { version: 1, entries: [] }, automations: [], legacyMigratedAt: null } };
  },
}));

vi.mock('../agentStepApprovalClient', () => ({
  readAgentStepApprovalContext: () => ({
    queue: harness.queue,
    permission: harness.permission,
    allowedOperations: harness.allowedOperations,
    handlers: harness.handlers,
  }),
}));

vi.mock('../localAgentMemoryStore', () => ({ loadLocalAgentMemory: () => ({}) }));
vi.mock('../localAgentProfilesStore', () => ({ loadLocalAgentProfiles: () => ({}) }));
vi.mock('../localAgentSettingsStore', () => ({ loadLocalAgentSettings: () => harness.settings }));
vi.mock('../../shared/localAgentMemory', () => ({
  selectAgentMemoryContext: () => harness.memories,
}));
vi.mock('../../shared/localAgentProfiles', () => ({
  getActiveAgentProfile: () => harness.profile,
}));
vi.mock('../localAgentTaskQueueStore', () => ({
  loadLocalAgentTaskQueue: () => harness.queue,
  saveLocalAgentTaskQueue: (queue: unknown) => {
    harness.saveCalls.push(queue);
    if (harness.saveThrows) throw new Error('C:\\private\\queue.json');
    harness.queue = queue as typeof harness.queue;
    return harness.queue;
  },
  saveLocalAgentTaskQueueDurably: async (queue: unknown) => {
    harness.saveCalls.push(queue);
    harness.queue = queue as typeof harness.queue;
    if (harness.saveThrows) throw new Error('C:\\private\\queue.json');
    return harness.durableOk
      ? { ok: true, requestedGeneration: 1, attemptGeneration: 1 }
      : { ok: false, code: 'write-failed', requestedGeneration: 1, attemptGeneration: 1 };
  },
}));

import { createAgentTask } from '../../shared/localAgent';
import {
  enqueueAgentTask,
  normalizeAgentTaskQueue,
  type AgentQueueItem,
} from '../../shared/localAgentTaskQueue';
import type { AgentConversation } from '../../shared/agentWorkspace';
import {
  AGENT_CONVERSATION_PLAN_CONTEXT_LIMIT,
  agentConversationPlanContext,
  createAgentConversationPlan,
  isAgentConversationPlanQuarantined,
  retryAgentConversationPlanSave,
  runAgentConversationPlan,
  updateAgentConversationPlanQueue,
} from '../agentConversationPlanner';
import { AgentConversationPlanQueue } from '../components/agent/AgentConversationPlanQueue';

const t = (key: string): string => key;
const queueItems = (): AgentQueueItem[] => harness.queue.items as AgentQueueItem[];

function conversation(id = 'chat-1', contextCount = 18): AgentConversation {
  return {
    id,
    title: 'Planner test',
    mode: 'analyze',
    createdAt: 1,
    updatedAt: 1,
    pinned: false,
    archived: false,
    context: Array.from({ length: contextCount }, (_, index) => ({
      id: `ctx-${index}`,
      kind: 'reading-passage' as const,
      label: `Label ${index} ${'l'.repeat(220)}`,
      preview: `Preview ${index} ${'p'.repeat(520)}`,
      source: {
        app: 'reading',
        ...(index === contextCount - 1 ? { route: 'chapter/1' } : {}),
      },
      sensitivity: 'ordinary' as const,
      retained: true,
      createdAt: index + 1,
    })),
    messages: [],
  };
}

function task(id = 'task-1') {
  return createAgentTask(id, 'Look up the selected term', [{
    id: 'step-1',
    label: 'Look up the term',
    request: {
      callId: 'call-1',
      operation: 'dictionary.lookup',
      arguments: { term: '猫' },
    },
  }], 10);
}

describe('Agent conversation planner', () => {
  beforeEach(() => {
    harness.settings.enabled = true;
    harness.settings.backend = 'local-gguf';
    harness.settings.privacyMode = false;
    harness.settings.memoryEnabled = true;
    harness.queue = { version: 1, items: [] };
    harness.saveCalls = [];
    harness.saveThrows = false;
    harness.durableOk = true;
    harness.initThrows = false;
    harness.allowedOperations = ['dictionary.lookup'];
    harness.permission = 'limited-actions';
    harness.handlers = {};
    harness.leaseExpected = null;
    (window as unknown as { api: Record<string, unknown> }).api = {};
  });

  it('bounds the exact disclosed shelf subset', () => {
    const disclosed = agentConversationPlanContext(conversation());
    expect(disclosed).toHaveLength(AGENT_CONVERSATION_PLAN_CONTEXT_LIMIT);
    expect(disclosed[0].id).toBe('ctx-2');
    expect(disclosed.at(-1)).toMatchObject({ id: 'ctx-17', route: 'chapter/1' });
    expect(disclosed.every((item) => item.label.length <= 200)).toBe(true);
    expect(disclosed.every((item) => item.preview.length <= 500)).toBe(true);
  });

  it('plans with the live allow-list and stores explicit conversation/context origin', async () => {
    const existing = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task('existing'),
      0,
      1,
      { conversationId: 'chat-other', contextIds: [] },
    );
    harness.queue = existing;
    let request: Record<string, unknown> | null = null;
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async (raw: Record<string, unknown>) => {
        request = raw;
        return { ok: true, task: task(), summary: 'One safe step', modelFileName: 'planner.gguf' };
      };

    const result = await createAgentConversationPlan(conversation(), '  Look up 猫  ', t);

    expect(result.ok).toBe(true);
    expect(request).toMatchObject({
      objective: 'Look up 猫',
      availableOperations: ['dictionary.lookup'],
      memories: harness.memories,
      applicationState: {
        agentConversation: {
          mode: 'analyze',
          context: expect.any(Array),
        },
      },
    });
    expect(harness.queue.items).toHaveLength(2);
    const queued = queueItems().find((item) => item.id === 'task-1');
    expect(queued.origin).toEqual({
      conversationId: 'chat-1',
      contextIds: Array.from({ length: 16 }, (_, index) => `ctx-${index + 2}`),
    });
    expect(queueItems().find((item) => item.id === 'existing')?.origin)
      .toEqual({ conversationId: 'chat-other', contextIds: [] });
  });

  it('sends and attributes no shelf context in privacy mode', async () => {
    harness.settings.privacyMode = true;
    let request: Record<string, unknown> | null = null;
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async (raw: Record<string, unknown>) => {
        request = raw;
        return { ok: true, task: task() };
      };

    const result = await createAgentConversationPlan(conversation(), 'Look up 猫', t);

    expect(result.ok).toBe(true);
    expect(request).toMatchObject({ applicationState: {} });
    expect(queueItems()[0].origin).toEqual({
      conversationId: 'chat-1',
      contextIds: [],
    });
  });

  it('refuses a replayed task id instead of replacing or inheriting another origin', async () => {
    const original = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-other', contextIds: ['other-context'] },
    );
    harness.queue = original;
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async () => ({ ok: true, task: task() });

    const result = await createAgentConversationPlan(conversation(), 'Look up 猫', t);

    expect(result).toEqual({ ok: false, code: 'task-conflict' });
    expect(harness.saveCalls).toHaveLength(0);
    expect(harness.queue).toBe(original);
    expect(queueItems()[0].origin?.conversationId).toBe('chat-other');
  });

  it('does not expose a backend path and distinguishes planner and store failures', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async () => ({ ok: false, error: 'Failed at C:\\private\\planner.gguf' });
    const plannerFailure = await createAgentConversationPlan(conversation(), 'Look up 猫', t);
    expect(plannerFailure).toEqual({ ok: false, code: 'planner-unavailable' });
    expect(JSON.stringify(plannerFailure)).not.toContain('private');

    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async () => ({ ok: true, task: task() });
    harness.saveThrows = true;
    const storeFailure = await createAgentConversationPlan(conversation(), 'Look up 猫', t);
    expect(storeFailure).toEqual({ ok: false, code: 'store-failed' });
    expect(JSON.stringify(storeFailure)).not.toContain('private');
    expect(isAgentConversationPlanQuarantined('chat-1', 'task-1')).toBe(true);
    harness.saveThrows = false;
    expect((await retryAgentConversationPlanSave('chat-1', 'task-1')).ok).toBe(true);
  });

  it('requires a durable main receipt for creation, controls, and executed outcomes', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async () => ({ ok: true, task: task() });
    harness.durableOk = false;
    expect(await createAgentConversationPlan(conversation(), 'Look up 猫', t))
      .toEqual({ ok: false, code: 'store-failed' });
    expect(isAgentConversationPlanQuarantined('chat-1', 'task-1')).toBe(true);
    harness.handlers = { 'dictionary.lookup': vi.fn() };
    expect(await runAgentConversationPlan('chat-1', 'task-1', 'run-next', t))
      .toEqual({ ok: false, code: 'store-failed' });
    expect(harness.handlers['dictionary.lookup']).not.toHaveBeenCalled();
    harness.durableOk = true;
    expect((await retryAgentConversationPlanSave('chat-1', 'task-1')).ok).toBe(true);

    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    harness.durableOk = false;
    expect(await updateAgentConversationPlanQueue('chat-1', 'task-1', 'pause'))
      .toEqual({ ok: false, code: 'store-failed' });
    expect(isAgentConversationPlanQuarantined('chat-1', 'task-1')).toBe(true);
    harness.durableOk = true;
    expect((await retryAgentConversationPlanSave('chat-1', 'task-1')).ok).toBe(true);

    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    harness.handlers = { 'dictionary.lookup': () => ({ entries: [] }) };
    harness.durableOk = false;
    expect(await runAgentConversationPlan('chat-1', 'task-1', 'run-next', t))
      .toMatchObject({ ok: false, code: 'outcome-not-recorded', stepId: 'step-1' });
    // The tool returned but main could not commit its outcome. The durable
    // claim remains in-doubt/running so an ordinary retry cannot duplicate it.
    expect(queueItems()[0].status).toBe('running');
    expect(isAgentConversationPlanQuarantined('chat-1', 'task-1')).toBe(true);
    harness.durableOk = true;
    expect((await retryAgentConversationPlanSave('chat-1', 'task-1')).ok).toBe(true);
  });

  it('returns a bounded no-action summary without writing the queue', async () => {
    (window as unknown as { api: Record<string, unknown> }).api.localAgentPlan =
      async () => ({ ok: true, summary: 's'.repeat(700) });
    const result = await createAgentConversationPlan(conversation(), 'Explain this', t);
    expect(result).toMatchObject({ ok: false, code: 'no-approved-actions' });
    expect(result.ok || result.summary?.length).toBe(500);
    expect(harness.saveCalls).toHaveLength(0);
  });

  it('re-reads the queue and only controls queued work with exact conversation origin', async () => {
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: ['ctx-1'] },
    );
    await expect(updateAgentConversationPlanQueue('chat-other', 'task-1', 'pause', 20)).resolves
      .toEqual({ ok: false, code: 'task-not-found' });
    expect((await updateAgentConversationPlanQueue('chat-1', 'task-1', 'pause', 20)).ok).toBe(true);
    expect(queueItems()[0].status).toBe('paused');
    expect(queueItems()[0].origin)
      .toEqual({ conversationId: 'chat-1', contextIds: ['ctx-1'] });
    await expect(updateAgentConversationPlanQueue('chat-1', 'task-1', 'pause', 30)).resolves
      .toEqual({ ok: false, code: 'invalid-transition' });
    expect((await updateAgentConversationPlanQueue('chat-1', 'task-1', 'resume', 40)).ok).toBe(true);
    expect((await updateAgentConversationPlanQueue('chat-1', 'task-1', 'cancel', 50)).ok).toBe(true);
    expect(queueItems()[0].status).toBe('cancelled');
  });

  it('runs only exact-origin work and revalidates the active profile at the click', async () => {
    const handler = vi.fn(() => ({ entries: [] }));
    harness.handlers = { 'dictionary.lookup': handler };
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );

    expect(await runAgentConversationPlan('chat-other', 'task-1', 'run-next', t))
      .toEqual({ ok: false, code: 'task-not-found' });
    expect(handler).not.toHaveBeenCalled();

    harness.allowedOperations = [];
    expect(await runAgentConversationPlan('chat-1', 'task-1', 'run-next', t))
      .toEqual({ ok: false, code: 'operation-denied' });
    expect(handler).not.toHaveBeenCalled();
    expect(queueItems()[0].status).toBe('queued');

    harness.allowedOperations = ['dictionary.lookup'];
    expect((await runAgentConversationPlan('chat-1', 'task-1', 'run-next', t)).ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(queueItems()[0]).toMatchObject({
      status: 'completed',
      task: { status: 'completed' },
      origin: { conversationId: 'chat-1', contextIds: [] },
    });
  });

  it('stops sensitive work for explicit live-gated confirmation', async () => {
    const sensitiveTask = createAgentTask('sensitive', 'Delete one item', [{
      id: 'delete-step',
      label: 'Delete item',
      request: {
        callId: 'delete-call',
        operation: 'media.delete-item',
        arguments: { id: 'media-1' },
      },
    }], 10);
    const handler = vi.fn(() => ({ deleted: true }));
    harness.permission = 'full-automation';
    harness.allowedOperations = ['media.delete-item'];
    harness.handlers = { 'media.delete-item': handler };
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      sensitiveTask,
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );

    expect((await runAgentConversationPlan('chat-1', 'sensitive', 'run-next', t)).ok).toBe(true);
    expect(queueItems()[0].task.status).toBe('waiting-confirmation');
    expect(handler).not.toHaveBeenCalled();
    expect(await runAgentConversationPlan('chat-1', 'sensitive', 'run-next', t))
      .toEqual({ ok: false, code: 'confirmation-required' });
    expect(handler).not.toHaveBeenCalled();

    expect((await runAgentConversationPlan('chat-1', 'sensitive', 'confirm', t)).ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(queueItems()[0].status).toBe('completed');
  });

  it('retries only the failed step and asks again for sensitive retries', async () => {
    const handler = vi.fn()
      .mockRejectedValueOnce(new Error('first attempt failed'))
      .mockResolvedValueOnce({ entries: [] });
    harness.handlers = { 'dictionary.lookup': handler };
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );

    expect((await runAgentConversationPlan('chat-1', 'task-1', 'run-next', t)).ok).toBe(true);
    expect(queueItems()[0]).toMatchObject({ status: 'failed', task: { status: 'failed' } });
    expect((await runAgentConversationPlan('chat-1', 'task-1', 'retry', t)).ok).toBe(true);
    expect(handler).toHaveBeenCalledTimes(2);
    expect(queueItems()[0].status).toBe('completed');

    const sensitiveTask = createAgentTask('sensitive-retry', 'Delete one item', [{
      id: 'delete-step',
      label: 'Delete item',
      request: {
        callId: 'delete-call',
        operation: 'media.delete-item',
        arguments: { id: 'media-1' },
      },
    }], 10);
    harness.permission = 'full-automation';
    harness.allowedOperations = ['media.delete-item'];
    harness.handlers = { 'media.delete-item': vi.fn() };
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      {
        ...sensitiveTask,
        status: 'failed',
        steps: [{ ...sensitiveTask.steps[0], status: 'failed', error: 'failed after approval' }],
      },
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    harness.queue = {
      ...harness.queue,
      items: queueItems().map((item) => ({ ...item, status: 'failed' })),
    };

    expect((await runAgentConversationPlan('chat-1', 'sensitive-retry', 'retry', t)).ok).toBe(true);
    expect(queueItems()[0].task.status).toBe('waiting-confirmation');
    expect(harness.handlers['media.delete-item']).not.toHaveBeenCalled();
  });

  it('preserves a pause made while an asynchronous step is running', async () => {
    let release: ((value: unknown) => void) | null = null;
    harness.handlers = {
      'dictionary.lookup': () => new Promise((resolve) => { release = resolve; }),
    };
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );

    const running = runAgentConversationPlan('chat-1', 'task-1', 'run-next', t);
    await vi.waitFor(() => expect(release).not.toBeNull());
    expect((await updateAgentConversationPlanQueue('chat-1', 'task-1', 'pause')).ok).toBe(true);
    release?.({ entries: [] });
    expect((await running).ok).toBe(true);
    expect(queueItems()[0]).toMatchObject({ status: 'paused', task: { status: 'completed' } });
  });

  it('rejects exact-origin and task drift while a handler is awaiting', async () => {
    let release: ((value: unknown) => void) | null = null;
    const queue = () => enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task(),
      0,
      1,
      { conversationId: 'chat-1', contextIds: ['ctx-1'] },
    );
    harness.handlers = {
      'dictionary.lookup': () => new Promise((resolve) => { release = resolve; }),
    };
    harness.queue = queue();

    const originRun = runAgentConversationPlan('chat-1', 'task-1', 'run-next', t);
    await vi.waitFor(() => expect(release).not.toBeNull());
    harness.queue = {
      ...harness.queue,
      items: queueItems().map((item) => ({
        ...item,
        origin: { conversationId: 'chat-1', contextIds: ['ctx-replaced'] },
      })),
    };
    release?.({ entries: [] });
    expect(await originRun).toMatchObject({
      ok: false,
      code: 'outcome-not-recorded',
      stepId: 'step-1',
    });
    expect(queueItems()[0].origin?.contextIds).toEqual(['ctx-replaced']);
    harness.queue = {
      ...queue(),
      items: queue().items.map((item) => ({ ...item, status: 'running' as const })),
    };
    expect((await retryAgentConversationPlanSave('chat-1', 'task-1')).ok).toBe(true);

    release = null;
    harness.queue = queue();
    const taskRun = runAgentConversationPlan('chat-1', 'task-1', 'run-next', t);
    await vi.waitFor(() => expect(release).not.toBeNull());
    harness.queue = {
      ...harness.queue,
      items: queueItems().map((item) => ({
        ...item,
        task: { ...item.task, objective: 'Replacement task' },
      })),
    };
    release?.({ entries: [] });
    expect(await taskRun).toMatchObject({
      ok: false,
      code: 'outcome-not-recorded',
      stepId: 'step-1',
    });
    expect(queueItems()[0].task.objective).toBe('Replacement task');
  });
});

describe('Agent conversation plan queue surface', () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it('renders only exact-origin rows and hides legacy, foreign, and dangling rows', async () => {
    const own = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      { ...task('own'), objective: 'Own plan' },
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    const foreign = enqueueAgentTask(
      own,
      { ...task('foreign'), objective: 'Foreign plan' },
      0,
      2,
      { conversationId: 'deleted-chat', contextIds: [] },
    );
    const queue = enqueueAgentTask(
      foreign,
      { ...task('legacy'), objective: 'Legacy plan' },
      0,
      3,
    );

    await act(async () => {
      root.render(createElement(AgentConversationPlanQueue, {
        conversationId: 'chat-1',
        queue,
        disabled: false,
        onFailure: () => undefined,
      }));
    });

    expect(host.textContent).toContain('Own plan');
    expect(host.textContent).not.toContain('Foreign plan');
    expect(host.textContent).not.toContain('Legacy plan');
    expect(host.textContent).toContain('agent.plan.action.runNext');
  });

  it('shows an in-doubt durable claim without runnable controls', async () => {
    const claimed = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task('claimed'),
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    harness.queue = {
      ...claimed,
      items: claimed.items.map((item) => ({
        ...item,
        status: 'paused' as const,
        execution: {
          version: 1 as const,
          stepId: 'step-1',
          callId: 'call-1',
          action: 'run-next' as const,
          previousStatus: 'queued' as const,
          startedAt: 1,
          expiresAt: Date.now() + 30_000,
        },
      })),
    };

    await act(async () => {
      root.render(createElement(AgentConversationPlanQueue, {
        conversationId: 'chat-1',
        queue: harness.queue,
        disabled: false,
        onFailure: () => undefined,
      }));
    });

    expect(host.textContent).toContain('agent.plan.executionInDoubt');
    expect(host.textContent).toContain('agent.plan.action.recoverVerified');
    expect([...host.querySelectorAll('button')].find(
      (button) => button.textContent === 'agent.plan.action.recoverVerified',
    )?.disabled).toBe(true);
    expect(host.textContent).not.toContain('common.resume');
    expect(host.textContent).not.toContain('agent.plan.action.runNext');
  });

  it('quarantines an undurable row behind save-only recovery controls', async () => {
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      task('quarantined'),
      0,
      1,
      { conversationId: 'chat-1', contextIds: ['ctx-1'] },
    );
    harness.durableOk = false;
    expect(await updateAgentConversationPlanQueue('chat-1', 'quarantined', 'pause'))
      .toEqual({ ok: false, code: 'store-failed' });

    await act(async () => {
      root.render(createElement(AgentConversationPlanQueue, {
        conversationId: 'chat-1',
        queue: harness.queue,
        disabled: false,
        onFailure: () => undefined,
      }));
    });

    expect(host.textContent).toContain('agent.plan.quarantined');
    expect(host.textContent).toContain('agent.plan.action.retrySave');
    expect(host.textContent).not.toContain('common.resume');
    expect(host.textContent).not.toContain('agent.plan.action.runNext');

    harness.durableOk = true;
    expect((await retryAgentConversationPlanSave('chat-1', 'quarantined')).ok).toBe(true);
  });

  it('publishes exact executor events and an id-backed operation from the real run control', async () => {
    const cardTask = createAgentTask('cards', 'Create one card', [{
      id: 'step-cards',
      label: 'Create the card',
      request: {
        callId: 'call-cards',
        operation: 'flashcard.add-cards',
        arguments: { cards: [{ front: '猫', back: 'cat' }] },
      },
    }], 10);
    harness.queue = enqueueAgentTask(
      normalizeAgentTaskQueue(null),
      cardTask,
      0,
      1,
      { conversationId: 'chat-1', contextIds: [] },
    );
    harness.allowedOperations = ['flashcard.add-cards'];
    harness.handlers = {
      'flashcard.add-cards': async () => ({ cards: 1, createdIds: ['card-7'] }),
    };
    const onTimeline = vi.fn();
    const onOperation = vi.fn();

    await act(async () => {
      root.render(createElement(AgentConversationPlanQueue, {
        conversationId: 'chat-1',
        queue: harness.queue,
        disabled: false,
        onFailure: () => undefined,
        onTimeline,
        onOperation,
      }));
    });
    const runButton = [...host.querySelectorAll('button')]
      .find((button) => button.textContent === 'agent.plan.action.runNext');
    expect(runButton).toBeDefined();
    await act(async () => {
      runButton?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onTimeline).toHaveBeenCalledTimes(2);
    expect(onTimeline.mock.calls[0][0].target).toMatchObject({
      conversationId: 'chat-1',
      taskId: 'cards',
      stepId: 'step-cards',
      callId: 'call-cards',
      operation: 'flashcard.add-cards',
    });
    expect(onOperation).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 'chat-1',
      taskId: 'cards',
      stepId: 'step-cards',
      callId: 'call-cards',
      entityIds: ['card-7'],
    }));
  });
});
