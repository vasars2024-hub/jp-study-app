/**
 * The grant half of the approval gate.
 *
 * These exist because an independent review found that it had drifted from the
 * review half: it re-checked the step's status and nothing else, so the four
 * other conditions the resolver enforces were unenforced at the only moment
 * that actually runs anything. The regression these pin is the reachable one —
 * cancel a task from the queue panel while its review sits open, then approve.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConversation } from '../../shared/agentWorkspace';
import type { AgentTaskQueue } from '../../shared/localAgentTaskQueue';

const NOW = 1_700_000_000_000;

let queue: AgentTaskQueue;
let permission: string;
let enabledOperations: string[];
let runCalls: unknown[][];
let saved: AgentTaskQueue[];

vi.mock('../localAgentTaskQueueStore', () => ({
  loadLocalAgentTaskQueue: () => queue,
  saveLocalAgentTaskQueue: (next: AgentTaskQueue) => {
    saved.push(next);
    return next;
  },
}));

vi.mock('../localAgentProfilesStore', () => ({
  loadLocalAgentProfiles: () => ({ version: 1, activeProfileId: 'p', profiles: [] }),
}));

vi.mock('../localAgentSettingsStore', () => ({
  loadLocalAgentSettings: () => ({ permission }),
}));

vi.mock('../../shared/localAgentProfiles', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  getActiveAgentProfile: () => ({
    id: 'p',
    permission,
    enabledOperations,
  }),
  effectiveAgentPermission: () => permission,
}));

vi.mock('../agentToolRegistry', () => ({
  createCentralAgentToolRegistry: () => ({}),
  availableAgentToolOperationIds: () => ['flashcard.add-cards', 'flashcard.delete-deck'],
}));

vi.mock('../localAgentQueueRun', () => ({
  runAgentTaskStep: (...args: unknown[]) => {
    runCalls.push(args);
    const task = args[1] as { steps: { id: string; status: string }[] };
    return Promise.resolve({
      queue,
      task: { ...task, steps: task.steps.map((s) => ({ ...s, status: 'completed' })) },
      events: [],
    });
  },
  applyAgentRunToQueue: (q: AgentTaskQueue) => q,
}));

import { grantAgentStepApproval } from '../agentStepApprovalClient';

const t = (key: string): string => key;

function taskQueue(over: { status?: string; stepStatus?: string; currentStepId?: string } = {}): AgentTaskQueue {
  return {
    version: 1,
    items: [{
      id: 'task-1',
      task: {
        id: 'task-1',
        objective: 'Objective',
        status: 'waiting-confirmation',
        steps: [{
          id: 'step-1',
          label: 'Step',
          request: {
            callId: 'call-1',
            operation: 'flashcard.delete-deck',
            arguments: { name: 'Core 2k' },
          },
          status: over.stepStatus ?? 'waiting-confirmation',
        }],
        currentStepId: over.currentStepId ?? 'step-1',
        createdAt: NOW,
        updatedAt: NOW,
      },
      priority: 0,
      status: over.status ?? 'running',
      createdAt: NOW,
      updatedAt: NOW,
    }],
  } as unknown as AgentTaskQueue;
}

const conversation = (): AgentConversation => ({
  id: 'chat-1',
  title: 'Chat',
  createdAt: NOW,
  updatedAt: NOW,
  mode: 'assist',
  context: [{
    id: 'ctx-1',
    kind: 'study-session',
    label: 'Session',
    source: { app: 'flashcards' },
    sensitivity: 'personal',
    retention: 'session',
    createdAt: NOW,
  }],
  messages: [{
    id: 'msg-1',
    role: 'assistant',
    status: 'complete',
    text: '',
    createdAt: NOW,
    contextIds: [],
    attachments: [],
    cards: [{
      id: 'card-1',
      kind: 'plan',
      title: 'Plan',
      sourceContextIds: ['ctx-1'],
      actions: [{
        id: 'action-1',
        label: 'stored',
        effect: { type: 'approve-step', taskId: 'task-1', stepId: 'step-1' },
      }],
    }],
  }],
} as unknown as AgentConversation);

const grant = () => grantAgentStepApproval(conversation(), 'msg-1', 'card-1', 'action-1', t);

beforeEach(() => {
  queue = taskQueue();
  permission = 'full-automation';
  enabledOperations = ['flashcard.add-cards', 'flashcard.delete-deck'];
  runCalls = [];
  saved = [];
});

describe('grantAgentStepApproval', () => {
  it('runs the step when every condition still holds', async () => {
    await expect(grant()).resolves.toEqual({ ok: true });
    expect(runCalls).toHaveLength(1);
  });

  it.each(['cancelled', 'paused', 'completed', 'failed'] as const)(
    'refuses to run a step of a %s queue row, and never calls the runner',
    async (status) => {
      // `cancelAgentQueueItem` and `pauseAgentQueueItem` mark the ROW and leave
      // the task untouched, so the step is still `waiting-confirmation`.
      // Checking only the step is what let a cancelled task's operation execute.
      // `paused` joined this list when the gate was split: the grant runs the
      // step immediately, so approving a paused row silently undid Pause.
      queue = taskQueue({ status });
      await expect(grant()).resolves.toEqual({ ok: false, code: 'task-not-runnable' });
      expect(runCalls).toHaveLength(0);
      expect(saved).toHaveLength(0);
    },
  );

  it('refuses when the profile withdrew the operation after the review', async () => {
    // Previously this reached the runner, which denied it *after* starting the
    // step — failing the whole task instead of refusing the approval. The
    // designed `operation-denied` code was unreachable from this path.
    enabledOperations = ['flashcard.add-cards'];
    await expect(grant()).resolves.toEqual({ ok: false, code: 'operation-denied' });
    expect(runCalls).toHaveLength(0);
  });

  it('refuses when the permission level was narrowed after the review', async () => {
    permission = 'read-only';
    await expect(grant()).resolves.toEqual({ ok: false, code: 'operation-denied' });
    expect(runCalls).toHaveLength(0);
  });

  it('refuses a step that is no longer waiting', async () => {
    queue = taskQueue({ stepStatus: 'completed' });
    await expect(grant()).resolves.toEqual({ ok: false, code: 'step-not-awaiting' });
    expect(runCalls).toHaveLength(0);
  });

  it('refuses a step the task has moved past', async () => {
    queue = taskQueue({ currentStepId: 'step-0' });
    await expect(grant()).resolves.toEqual({ ok: false, code: 'step-not-current' });
    expect(runCalls).toHaveLength(0);
  });

  it('refuses a task the queue no longer holds', async () => {
    queue = { version: 1, items: [] };
    await expect(grant()).resolves.toEqual({ ok: false, code: 'task-not-found' });
    expect(runCalls).toHaveLength(0);
  });

  it('confirms exactly one call id, for exactly one run', async () => {
    await grant();
    const options = runCalls[0][3] as { confirmedCallIds: Set<string> };
    expect([...options.confirmedCallIds]).toEqual(['call-1']);
  });
});
