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
let availableOperations: string[];
let runCalls: unknown[][];
let saved: AgentTaskQueue[];
let runnerRefuses: boolean;
let queueListeners: Set<() => void>;
let profileListeners: Set<() => void>;
let settingsListeners: Set<() => void>;
let operationalHydration: Promise<void>;
let resolveOperationalHydration: () => void;

vi.mock('../localAgentTaskQueueStore', () => ({
  loadLocalAgentTaskQueue: () => queue,
  saveLocalAgentTaskQueue: (next: AgentTaskQueue) => {
    saved.push(next);
    return next;
  },
  onLocalAgentTaskQueueChanged: (listener: () => void) => {
    queueListeners.add(listener);
    return () => queueListeners.delete(listener);
  },
}));

vi.mock('../localAgentProfilesStore', () => ({
  loadLocalAgentProfiles: () => ({ version: 1, activeProfileId: 'p', profiles: [] }),
  onLocalAgentProfilesChanged: (listener: () => void) => {
    profileListeners.add(listener);
    return () => profileListeners.delete(listener);
  },
}));

vi.mock('../localAgentSettingsStore', () => ({
  loadLocalAgentSettings: () => ({ permission }),
  onLocalAgentSettingsChanged: (listener: () => void) => {
    settingsListeners.add(listener);
    return () => settingsListeners.delete(listener);
  },
}));

vi.mock('../agentOperationalClient', () => ({
  initAgentOperationalState: () => operationalHydration,
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
  availableAgentToolOperationIds: () => availableOperations,
}));

vi.mock('../localAgentQueueRun', () => ({
  runAgentTaskStep: (...args: unknown[]) => {
    runCalls.push(args);
    const task = args[1] as { steps: { id: string; status: string }[] };
    if (runnerRefuses) {
      return Promise.resolve({
        queue,
        task,
        events: [],
        refusal: {
          code: 'operation-denied',
          reason: 'The operation was narrowed before execution.',
        },
      });
    }
    return Promise.resolve({
      queue,
      task: { ...task, steps: task.steps.map((s) => ({ ...s, status: 'completed' })) },
      events: [],
    });
  },
  applyAgentRunToQueue: (q: AgentTaskQueue) => q,
}));

import {
  grantAgentStepApproval,
  observeAgentStepApprovalContext,
  readAgentStepApprovalContext,
  type AgentStepApprovalContext,
} from '../agentStepApprovalClient';

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
  availableOperations = ['flashcard.add-cards', 'flashcard.delete-deck'];
  runCalls = [];
  saved = [];
  runnerRefuses = false;
  queueListeners = new Set();
  profileListeners = new Set();
  settingsListeners = new Set();
  operationalHydration = new Promise<void>((resolve) => {
    resolveOperationalHydration = resolve;
  });
});

async function finishOperationalHydration(): Promise<void> {
  resolveOperationalHydration();
  await operationalHydration;
  // The observer publishes from a `.then`, one microtask after the mocked
  // hydration promise settles.
  await Promise.resolve();
}

function emit(listeners: ReadonlySet<() => void>): void {
  for (const listener of [...listeners]) listener();
}

describe('observeAgentStepApprovalContext', () => {
  it('intersects the active profile allow-list with handlers installed in this renderer', () => {
    availableOperations = ['flashcard.add-cards'];
    expect(readAgentStepApprovalContext(t).allowedOperations).toEqual(['flashcard.add-cards']);
  });

  it('stays silent while the operational queue is hydrating, then publishes one fresh context', async () => {
    const seen: AgentStepApprovalContext[] = [];
    const stop = observeAgentStepApprovalContext(t, (context) => seen.push(context));

    expect(seen).toEqual([]);
    expect(queueListeners.size).toBe(1);
    expect(profileListeners.size).toBe(1);
    expect(settingsListeners.size).toBe(1);

    // These values change after observation begins but before hydration lands.
    // The first publication must read them now, not expose the pre-hydration
    // empty queue or a context captured when the listeners were registered.
    queue = { version: 1, items: [] };
    permission = 'read-only';
    enabledOperations = ['flashcard.add-cards'];
    emit(queueListeners);
    emit(profileListeners);
    emit(settingsListeners);
    expect(seen).toEqual([]);

    await finishOperationalHydration();

    expect(seen).toHaveLength(1);
    expect(seen[0].queue.items).toEqual([]);
    expect(seen[0].permission).toBe('read-only');
    expect(seen[0].allowedOperations).toEqual(['flashcard.add-cards']);
    stop();
  });

  it('publishes a freshly read context for queue, settings, and profile changes', async () => {
    const seen: AgentStepApprovalContext[] = [];
    const stop = observeAgentStepApprovalContext(t, (context) => seen.push(context));
    await finishOperationalHydration();
    seen.length = 0;

    queue = { version: 1, items: [] };
    emit(queueListeners);
    expect(seen).toHaveLength(1);
    expect(seen[0].queue.items).toEqual([]);

    permission = 'confirmation-required';
    emit(settingsListeners);
    expect(seen).toHaveLength(2);
    expect(seen[1].permission).toBe('confirmation-required');

    enabledOperations = ['flashcard.add-cards'];
    emit(profileListeners);
    expect(seen).toHaveLength(3);
    expect(seen[2].allowedOperations).toEqual(['flashcard.add-cards']);
    stop();
  });

  it('removes every subscription and ignores captured callbacks after cleanup', async () => {
    const seen: AgentStepApprovalContext[] = [];
    const stop = observeAgentStepApprovalContext(t, (context) => seen.push(context));
    const captured = [
      ...queueListeners,
      ...profileListeners,
      ...settingsListeners,
    ];
    await finishOperationalHydration();
    expect(seen).toHaveLength(1);

    stop();
    expect(queueListeners.size).toBe(0);
    expect(profileListeners.size).toBe(0);
    expect(settingsListeners.size).toBe(0);

    for (const listener of captured) listener();
    expect(seen).toHaveLength(1);
  });
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

  it('propagates a final execution-boundary refusal without writing the queue', async () => {
    // The review resolver and runner normally read the same context, but the
    // execution result is a typed union now. A future asynchronous authority
    // source must not make this consumer persist the untouched task and report
    // a misleading lifecycle error.
    runnerRefuses = true;
    await expect(grant()).resolves.toEqual({ ok: false, code: 'operation-denied' });
    expect(runCalls).toHaveLength(1);
    expect(saved).toHaveLength(0);
  });
});
