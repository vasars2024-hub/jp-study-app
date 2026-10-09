// @vitest-environment jsdom
/**
 * Study recipes in the conversation planner: the everyday requests are planned without a
 * model (instantly, and with no model installed), through the same allow-list and queue as
 * a model's plan, and a completed step reads as a cited answer in the plan queue.
 */
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const harness = vi.hoisted(() => ({
  settings: { enabled: true, backend: 'local-gguf', privacyMode: false, memoryEnabled: false, memoryScope: [] as string[] },
  queue: { version: 1 as const, items: [] as unknown[] },
  allowedOperations: [] as string[],
  permission: 'limited-actions' as 'read-only' | 'limited-actions' | 'full-automation',
}));

vi.mock('../i18n', () => ({
  useT: () => ({ t: (key: string, vars?: Record<string, unknown>) => (vars ? `${key}|${JSON.stringify(vars)}` : key), lang: 'en' }),
  t: (key: string) => key,
  getUiLang: () => 'en',
}));
vi.mock('../storage/db', () => ({
  kvGet: async () => undefined,
  kvSet: async () => undefined,
  kvUpdate: async () => undefined,
  kvDelete: async () => undefined,
  kvBatch: async () => undefined,
  kvScanPrefix: async () => [],
}));
vi.mock('../agentOperationalClient', () => ({ initAgentOperationalState: async () => undefined }));
vi.mock('../agentStepApprovalClient', () => ({
  readAgentStepApprovalContext: () => ({
    queue: harness.queue,
    permission: harness.permission,
    allowedOperations: harness.allowedOperations,
    handlers: {},
  }),
}));
vi.mock('../localAgentMemoryStore', () => ({ loadLocalAgentMemory: () => ({}) }));
vi.mock('../localAgentProfilesStore', () => ({ loadLocalAgentProfiles: () => ({}) }));
vi.mock('../localAgentSettingsStore', () => ({ loadLocalAgentSettings: () => harness.settings }));
vi.mock('../../shared/localAgentProfiles', () => ({ getActiveAgentProfile: () => ({ id: 'p', enabledOperations: [] }) }));
vi.mock('../localAgentTaskQueueStore', () => ({
  loadLocalAgentTaskQueue: () => harness.queue,
  saveLocalAgentTaskQueueDurably: async (queue: typeof harness.queue) => {
    harness.queue = queue;
    return { ok: true, requestedGeneration: 1, attemptGeneration: 1 };
  },
}));

import { createAgentConversationPlan } from '../agentConversationPlanner';
import { AgentConversationPlanQueue } from '../components/agent/AgentConversationPlanQueue';
import { createAgentTask, type AgentTask } from '../../shared/localAgent';
import { agentStudyAnswer } from '../../shared/agentStudyCoach';
import type { AgentConversation } from '../../shared/agentWorkspace';
import type { AgentTaskQueue } from '../../shared/localAgentTaskQueue';

const t = (key: string, vars?: Record<string, string | number>) => (vars ? `${key}|${JSON.stringify(vars)}` : key);
const conversation = { id: 'chat-1', title: 'x', mode: 'analyze', createdAt: 1, updatedAt: 1, pinned: false, archived: false, context: [], messages: [] } as unknown as AgentConversation;
const queuedTask = (): AgentTask => (harness.queue.items[0] as { task: AgentTask }).task;

beforeEach(() => {
  localStorage.clear();
  harness.queue = { version: 1, items: [] };
  harness.permission = 'limited-actions';
  harness.allowedOperations = ['study.recommend-next', 'study.plan-week', 'calendar.schedule-sessions', 'study.cards-from-text'];
  (window as unknown as { api: Record<string, unknown> }).api = {};
});

describe('study recipes in the planner', () => {
  it('plans "Plan my week" with no model: a read step, then the exact sessions to confirm', async () => {
    const result = await createAgentConversationPlan(conversation, 'Plan my week', t);
    expect(result).toMatchObject({ ok: true, planner: 'recipe' });
    if (!result.ok) return;
    expect(typeof result.elapsedMs).toBe('number');
    const task = queuedTask();
    expect(task.steps.map((s) => s.request.operation)).toEqual(['study.plan-week', 'calendar.schedule-sessions']);
    const sessions = task.steps[1].request.arguments.sessions as unknown[];
    expect(sessions.length).toBeGreaterThan(0);
    expect(result.summary).toContain('agent2.recipe.summary.plan-week');
    expect((harness.queue.items[0] as { origin: unknown }).origin).toEqual({ conversationId: 'chat-1', contextIds: [] });
  });

  it('takes a quick action by name, and plans only the read step when the write is not allowed', async () => {
    harness.allowedOperations = ['study.recommend-next', 'study.cards-from-text'];
    const recommend = await createAgentConversationPlan(conversation, 'anything at all', t, { studyIntent: { intent: 'recommend' } });
    expect(recommend.ok).toBe(true);
    expect(queuedTask().steps.map((s) => s.request.operation)).toEqual(['study.recommend-next']);

    harness.queue = { version: 1, items: [] };
    const cards = await createAgentConversationPlan(conversation, 'Make cards from this text: 猫', t);
    expect(cards.ok).toBe(true);
    expect(queuedTask().steps.map((s) => s.request.operation)).toEqual(['study.cards-from-text']);
  });

  it('hands a request the profile does not allow to the model planner instead', async () => {
    harness.allowedOperations = ['dictionary.lookup'];
    const plan = vi.fn(async () => ({ ok: true, task: createAgentTask('m1', 'x', [{
      id: 's1', label: 'Look up', request: { callId: 'c1', operation: 'dictionary.lookup', arguments: { term: '猫' } },
    }], 1), summary: 'model plan', planner: 'local', elapsedMs: 4200 }));
    (window as unknown as { api: Record<string, unknown> }).api = { localAgentPlan: plan };
    const result = await createAgentConversationPlan(conversation, 'What should I study now?', t);
    expect(plan).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ ok: true, planner: 'local', elapsedMs: 4200 });
  });

  it('says the planner is unavailable for anything else when no model is reachable', async () => {
    expect(await createAgentConversationPlan(conversation, 'Translate my notes into Spanish', t))
      .toEqual({ ok: false, code: 'planner-unavailable' });
    // …while the study requests still plan.
    expect((await createAgentConversationPlan(conversation, 'What should I study now?', t)).ok).toBe(true);
  });

  it('is still refused when the Agent is switched off', async () => {
    harness.settings.enabled = false;
    try {
      expect(await createAgentConversationPlan(conversation, 'What should I study now?', t))
        .toEqual({ ok: false, code: 'planner-disabled' });
    } finally {
      harness.settings.enabled = true;
    }
  });
});

describe('a completed study step reads as a cited answer', () => {
  it('shows the answer, what it is based on, and opens the step by itself', async () => {
    const task = createAgentTask('task-a', 'What should I study now?', [{
      id: 'step-1', label: 'Recommend', request: { callId: 'call-1', operation: 'study.recommend-next', arguments: {} },
    }], 1);
    const done: AgentTask = {
      ...task,
      status: 'completed',
      steps: [{
        ...task.steps[0],
        status: 'completed',
        result: {
          answer: agentStudyAnswer('agent2.answer.recommend', [{ key: 'agent2.rec.reviews', vars: { count: 3, minutes: 1 } }], [
            { source: 'deck', key: 'agent2.cite.deckQueue', vars: { due: 3, learning: 0, fresh: 0 } },
          ], [{ kind: 'open-section', section: 'flashcards', labelKey: 'agent2.action.reviews' }]),
        },
      }],
    };
    const queue: AgentTaskQueue = {
      version: 1,
      items: [{ id: 'task-a', task: done, status: 'completed', priority: 0, createdAt: 1, updatedAt: 1, origin: { conversationId: 'chat-1', contextIds: [] } }],
    } as unknown as AgentTaskQueue;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => {
      root.render(createElement(AgentConversationPlanQueue, { conversationId: 'chat-1', queue, disabled: false, onFailure: () => undefined }));
    });
    const details = host.querySelector('details.agent-plan-details') as HTMLDetailsElement;
    expect(details.open).toBe(true);
    const answer = host.querySelector('.agent-study-answer')!;
    expect(answer.textContent).toContain('agent2.answer.recommend');
    expect(answer.textContent).toContain('agent2.rec.reviews');
    expect(host.querySelector('.agent-study-sources')!.textContent).toContain('agent2.cite.deckQueue');
    // The raw JSON preview is not shown for an answer.
    expect(host.textContent).not.toContain('agent.plan.result');
    const opened: unknown[] = [];
    const onOpen = (event: Event) => opened.push((event as CustomEvent).detail);
    window.addEventListener('os:open', onOpen);
    await act(async () => (answer.querySelector('button') as HTMLButtonElement).click());
    window.removeEventListener('os:open', onOpen);
    expect(opened).toEqual(['flashcards']);
    await act(async () => root.unmount());
    host.remove();
  });
});
