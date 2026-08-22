// @vitest-environment jsdom
/**
 * The main application's background automation claimant.
 *
 * The defect it closes is not subtle and is not about code shape: until this
 * host existed, a scheduled automation ran only while the user was sitting on
 * Blanc's agent panel, and everywhere else in the app the fire reached nobody.
 * So the assertions below are about observable outcomes — a queue row that
 * exists, a claim that is or is not taken — rather than about calls being made.
 *
 * The two negative controls carry most of the weight:
 *
 * - a disabled agent must NOT claim, or main records the fire `delivered` when
 *   nothing could possibly have run it;
 * - the host must NOT execute, only enqueue. A scheduled intent is not standing
 *   consent to run tool operations unattended.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AgentAutomation } from '../../shared/localAgentAutomation';
import type { AgentTaskQueue } from '../../shared/localAgentTaskQueue';

const EMPTY_AGENT_TASK_QUEUE: AgentTaskQueue = { version: 1, items: [] };

const NOW = 1_700_000_000_000;

const AUTOMATION: AgentAutomation = {
  id: 'auto-1',
  name: 'Morning review',
  objective: 'summarise yesterday',
  frequency: 'daily',
  time: '08:00',
  permission: 'read-only',
  enabled: true,
  createdAt: NOW,
};

const TASK = {
  id: 'task-1',
  objective: 'summarise yesterday',
  status: 'queued',
  createdAt: NOW,
  updatedAt: NOW,
  steps: [],
};

const state = vi.hoisted(() => ({
  settings: {
    enabled: true,
    backend: 'local-gguf',
    permission: 'full-automation',
    memoryEnabled: false,
    memoryScope: [] as string[],
  },
  // Literal, not the imported constant: `vi.hoisted` runs before the module
  // imports are initialized.
  queue: { version: 1, items: [] } as AgentTaskQueue,
  saved: [] as AgentTaskQueue[],
  receiptOk: true,
  settingsListeners: [] as Array<(next: unknown) => void>,
}));

vi.mock('../localAgentSettingsStore', () => ({
  loadLocalAgentSettings: () => state.settings,
  onLocalAgentSettingsChanged: (listener: (next: unknown) => void) => {
    state.settingsListeners.push(listener);
    return () => {
      state.settingsListeners = state.settingsListeners.filter((item) => item !== listener);
    };
  },
}));

vi.mock('../localAgentTaskQueueStore', () => ({
  loadLocalAgentTaskQueue: () => state.queue,
  saveLocalAgentTaskQueueDurably: (queue: AgentTaskQueue) => {
    state.saved.push(queue);
    if (state.receiptOk) state.queue = queue;
    return Promise.resolve(
      state.receiptOk ? { ok: true } : { ok: false, code: 'write-failed' },
    );
  },
}));

vi.mock('../agentOperationalClient', () => ({
  initAgentOperationalState: () => Promise.resolve(),
}));

vi.mock('../agentStepApprovalClient', () => ({
  readAgentStepApprovalContext: () => ({
    queue: state.queue,
    permission: 'full-automation',
    allowedOperations: ['deck.list'],
    handlers: {},
  }),
}));

vi.mock('../localAgentProfilesStore', () => ({ loadLocalAgentProfiles: () => ({ version: 1, profiles: [], activeId: '' }) }));
vi.mock('../localAgentMemoryStore', () => ({ loadLocalAgentMemory: () => ({ version: 1, entries: [] }) }));
vi.mock('../i18n', () => ({ t: (key: string) => key }));

import {
  installLocalAgentAutomationHost,
  runScheduledAutomation,
} from '../localAgentAutomationHost';
import {
  resetLocalAgentTriggerHandlersForTesting,
  selectLocalAgentTriggerHandler,
} from '../localAgentTriggerRunner';

interface Api {
  plan: ReturnType<typeof vi.fn>;
  claim: ReturnType<typeof vi.fn>;
  release: ReturnType<typeof vi.fn>;
  fire: (entry?: AgentAutomation) => void;
}

function installApi(planResult: unknown): Api {
  let listener: ((entry: AgentAutomation) => void) | null = null;
  const plan = vi.fn(() => Promise.resolve(planResult));
  const claim = vi.fn(() => Promise.resolve(true));
  const release = vi.fn(() => Promise.resolve(true));
  (globalThis as Record<string, unknown>).api = {
    localAgentPlan: plan,
    onLocalAgentTrigger: (cb: (entry: AgentAutomation) => void) => {
      listener = cb;
      return () => {
        listener = null;
      };
    },
    localAgentClaimTriggers: claim,
    localAgentReleaseTriggers: release,
  };
  return { plan, claim, release, fire: (entry = AUTOMATION) => listener?.(entry) };
}

describe('runScheduledAutomation', () => {
  let api: Api;

  beforeEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    state.settings = {
      enabled: true,
      backend: 'local-gguf',
      permission: 'full-automation',
      memoryEnabled: false,
      memoryScope: [],
    };
    state.queue = EMPTY_AGENT_TASK_QUEUE;
    state.saved = [];
    state.receiptOk = true;
    state.settingsListeners = [];
    api = installApi({ ok: true, task: TASK });
  });

  afterEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    delete (globalThis as Record<string, unknown>).api;
  });

  it('enqueues the planned task and carries the automation permission as a ceiling', async () => {
    const result = await runScheduledAutomation(AUTOMATION, NOW);

    expect(result).toEqual({ ok: true, taskId: 'task-1' });
    expect(state.saved).toHaveLength(1);
    const [item] = state.saved[0].items;
    expect(item.id).toBe('task-1');
    // The whole point of the ceiling: the level the automation was authored
    // under still binds when the task is run later, from another window.
    expect(item.permissionCeiling).toBe('read-only');
  });

  it('narrows the planning request to the automation permission', async () => {
    state.settings.permission = 'full-automation';

    await runScheduledAutomation({ ...AUTOMATION, permission: 'read-only' }, NOW);

    // Negative control for the ceiling: a live setting of `full-automation`
    // must NOT reach the planner for a read-only automation, or main builds the
    // approved-operation set from a level the user never authorized here.
    expect(api.plan.mock.calls[0][0].settings.permission).toBe('read-only');
  });

  it('refuses without planning when the agent is disabled', async () => {
    state.settings.enabled = false;

    const result = await runScheduledAutomation(AUTOMATION, NOW);

    expect(result).toEqual({ ok: false, code: 'agent-disabled' });
    expect(api.plan).not.toHaveBeenCalled();
    expect(state.saved).toHaveLength(0);
  });

  it('reports no-approved-action rather than enqueuing an empty plan', async () => {
    api = installApi({ ok: true, summary: 'nothing to do' });

    const result = await runScheduledAutomation(AUTOMATION, NOW);

    expect(result).toEqual({ ok: false, code: 'no-approved-action' });
    expect(state.saved).toHaveLength(0);
  });

  it('refuses a replayed task id instead of replacing the queued row', async () => {
    await runScheduledAutomation(AUTOMATION, NOW);
    const result = await runScheduledAutomation(AUTOMATION, NOW + 1000);

    expect(result).toEqual({ ok: false, code: 'task-conflict' });
    expect(state.queue.items).toHaveLength(1);
  });

  it('reports store-failed when main refuses the durable write', async () => {
    state.receiptOk = false;

    const result = await runScheduledAutomation(AUTOMATION, NOW);

    // An unattended run has nobody to notice a reverted queue, so an
    // uncommitted enqueue must not be reported as a plan that landed.
    expect(result).toEqual({ ok: false, code: 'store-failed' });
  });

  it('reports planner-unavailable when the planner throws', async () => {
    (globalThis as Record<string, unknown>).api = {
      ...(globalThis as Record<string, unknown>).api as object,
      localAgentPlan: () => Promise.reject(new Error('C:\\models\\secret.gguf missing')),
    };

    const result = await runScheduledAutomation(AUTOMATION, NOW);

    expect(result).toEqual({ ok: false, code: 'planner-unavailable' });
  });
});

describe('installLocalAgentAutomationHost', () => {
  let api: Api;

  beforeEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    state.settings = {
      enabled: true,
      backend: 'local-gguf',
      permission: 'full-automation',
      memoryEnabled: false,
      memoryScope: [],
    };
    state.queue = EMPTY_AGENT_TASK_QUEUE;
    state.saved = [];
    state.receiptOk = true;
    state.settingsListeners = [];
    api = installApi({ ok: true, task: TASK });
  });

  afterEach(() => {
    resetLocalAgentTriggerHandlersForTesting();
    delete (globalThis as Record<string, unknown>).api;
  });

  it('claims and turns a fire into a queue row with no UI open', async () => {
    const uninstall = installLocalAgentAutomationHost();
    expect(api.claim).toHaveBeenCalledTimes(1);

    api.fire();
    await vi.waitFor(() => expect(state.saved).toHaveLength(1));
    expect(state.saved[0].items[0].id).toBe('task-1');

    uninstall();
    expect(api.release).toHaveBeenCalledTimes(1);
  });

  it('does not claim while the agent is disabled', () => {
    state.settings.enabled = false;

    const uninstall = installLocalAgentAutomationHost();

    // The negative control. Claiming here would let main record the fire
    // `delivered` when nothing could have run it; leaving it unclaimed keeps
    // the recorded outcome `missed`, which is the truth.
    expect(api.claim).not.toHaveBeenCalled();
    expect(selectLocalAgentTriggerHandler()).toBeNull();
    uninstall();
  });

  it('starts claiming when the agent is enabled without a restart', () => {
    state.settings.enabled = false;
    const uninstall = installLocalAgentAutomationHost();
    expect(api.claim).not.toHaveBeenCalled();

    state.settings = { ...state.settings, enabled: true };
    for (const listener of state.settingsListeners) listener(state.settings);

    expect(api.claim).toHaveBeenCalledTimes(1);
    uninstall();
  });

  it('stops claiming when the agent is disabled without a restart', () => {
    const uninstall = installLocalAgentAutomationHost();
    expect(api.claim).toHaveBeenCalledTimes(1);

    state.settings = { ...state.settings, enabled: false };
    for (const listener of state.settingsListeners) listener(state.settings);

    expect(api.release).toHaveBeenCalledTimes(1);
    expect(selectLocalAgentTriggerHandler()).toBeNull();
    uninstall();
  });

  it('enqueues and never executes the planned steps', async () => {
    const uninstall = installLocalAgentAutomationHost();
    api.fire();
    await vi.waitFor(() => expect(state.saved).toHaveLength(1));

    // A scheduled intent is not unattended consent. The row must arrive
    // `queued` with no execution claim on it.
    const [item] = state.saved[0].items;
    expect(item.status).toBe('queued');
    expect(item.execution).toBeUndefined();
    uninstall();
  });
});
