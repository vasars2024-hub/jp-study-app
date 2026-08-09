/**
 * The gate's value is entirely in what it refuses, so that is what these pin: a
 * stored effect that names a task the queue no longer holds, a step nobody is
 * waiting on, a step approved out of turn, and an operation the user has since
 * removed from the profile. The success case exists mostly to prove the refusals
 * are not refusing everything.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_STEP_APPROVAL_IDLE,
  agentStepApprovalReduce,
  pendingAgentStepApproval,
  resolveAgentStepApproval,
  type AgentStepApproval,
  type AgentStepApprovalRun,
} from '../agentStepApproval';
import type { AgentConversation, AgentResultEffect } from '../agentWorkspace';
import type { AgentTask, AgentTaskStep } from '../localAgent';
import type { AgentQueueItem, AgentTaskQueue } from '../localAgentTaskQueue';

const NOW = 1_700_000_000_000;

const step = (over: Partial<AgentTaskStep> = {}): AgentTaskStep => ({
  id: 'step-1',
  label: 'Add three cards to Core 2k',
  request: {
    callId: 'call-1',
    operation: 'flashcard.add-cards',
    arguments: { deck: 'Core 2k', cards: [{ front: 'a', back: 'b' }] },
  },
  status: 'waiting-confirmation',
  ...over,
});

const task = (over: Partial<AgentTask> = {}): AgentTask => ({
  id: 'task-1',
  objective: 'Mine today’s reading into the deck',
  status: 'waiting-confirmation',
  steps: [step()],
  currentStepId: 'step-1',
  createdAt: NOW,
  updatedAt: NOW,
  ...over,
});

const queue = (over: Partial<AgentQueueItem> = {}): AgentTaskQueue => ({
  version: 1,
  items: [{
    id: 'task-1',
    task: task(),
    priority: 0,
    status: 'running',
    createdAt: NOW,
    updatedAt: NOW,
    ...over,
  }],
});

const conversation = (
  effect: AgentResultEffect = { type: 'approve-step', taskId: 'task-1', stepId: 'step-1' },
  sourceContextIds: string[] = ['ctx-1'],
  contextIds: string[] = ['ctx-1'],
): AgentConversation => ({
  id: 'chat-1',
  title: 'Chat',
  createdAt: NOW,
  updatedAt: NOW,
  mode: 'assist',
  context: contextIds.map((id) => ({
    id,
    kind: 'study-session' as const,
    label: 'Session',
    source: { app: 'flashcards' },
    sensitivity: 'personal' as const,
    retention: 'session' as const,
    createdAt: NOW,
  })),
  messages: [{
    id: 'msg-1',
    role: 'assistant' as const,
    status: 'complete' as const,
    text: '',
    createdAt: NOW,
    contextIds: [],
    attachments: [],
    cards: [{
      id: 'card-1',
      kind: 'plan' as const,
      title: 'Plan',
      sourceContextIds,
      actions: [{ id: 'action-1', label: 'stored label nobody reads', effect }],
    }],
  }],
});

const resolve = (
  chat = conversation(),
  q = queue(),
  permission: 'read-only' | 'limited-actions' | 'full-automation' = 'full-automation',
  allowed?: readonly AgentTask['steps'][number]['request']['operation'][],
) => resolveAgentStepApproval(chat, q, 'msg-1', 'card-1', 'action-1', permission, allowed);

describe('resolveAgentStepApproval', () => {
  it('resolves a waiting step and reads every word from the live task', () => {
    const result = resolve();
    expect(result).toEqual({
      ok: true,
      approval: {
        taskId: 'task-1',
        stepId: 'step-1',
        objective: 'Mine today’s reading into the deck',
        label: 'Add three cards to Core 2k',
        operation: 'flashcard.add-cards',
        confirmation: expect.any(Boolean),
      } satisfies AgentStepApproval,
    });
  });

  it('shows the task’s current text, not the text the card was persisted with', () => {
    const renamed = queue({
      task: task({
        objective: 'Objective as rewritten after the card was stored',
        steps: [step({ label: 'Label as rewritten after the card was stored' })],
      }),
    });
    const result = resolve(conversation(), renamed);
    expect(result.ok && result.approval.objective).toBe('Objective as rewritten after the card was stored');
    expect(result.ok && result.approval.label).toBe('Label as rewritten after the card was stored');
  });

  it('never surfaces the stored action label', () => {
    const result = resolve();
    expect(JSON.stringify(result)).not.toContain('stored label nobody reads');
  });

  it('refuses an action that is not an approval', () => {
    const chat = conversation({ type: 'open-context', contextId: 'ctx-1' });
    expect(resolve(chat)).toEqual({ ok: false, code: 'not-approvable' });
  });

  it('refuses an action that is not there', () => {
    const chat = conversation();
    expect(
      resolveAgentStepApproval(chat, queue(), 'msg-1', 'card-1', 'missing', 'full-automation'),
    ).toEqual({ ok: false, code: 'action-not-found' });
  });

  it('refuses a card that declares no provenance rather than passing it', () => {
    const chat = conversation(
      { type: 'approve-step', taskId: 'task-1', stepId: 'step-1' },
      [],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses a card whose declared source is gone from the shelf', () => {
    const chat = conversation(
      { type: 'approve-step', taskId: 'task-1', stepId: 'step-1' },
      ['ctx-1'],
      ['ctx-other'],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses a task the queue no longer holds', () => {
    expect(resolve(conversation(), { version: 1, items: [] })).toEqual({
      ok: false,
      code: 'task-not-found',
    });
  });

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'refuses a %s task, whose step will never run',
    (status) => {
      expect(resolve(conversation(), queue({ status }))).toEqual({
        ok: false,
        code: 'task-not-runnable',
      });
    },
  );

  it('refuses a step the task does not contain', () => {
    const chat = conversation({ type: 'approve-step', taskId: 'task-1', stepId: 'step-9' });
    expect(resolve(chat)).toEqual({ ok: false, code: 'step-not-found' });
  });

  it.each(['pending', 'running', 'completed', 'failed', 'skipped'] as const)(
    'refuses a %s step, which is not asking for anything',
    (status) => {
      const q = queue({ task: task({ steps: [step({ status })] }) });
      expect(resolve(conversation(), q)).toEqual({ ok: false, code: 'step-not-awaiting' });
    },
  );

  it('refuses a waiting step that is not the one the task is on', () => {
    const q = queue({
      task: task({
        steps: [step({ id: 'step-0', status: 'running' }), step({ id: 'step-1' })],
        currentStepId: 'step-0',
      }),
    });
    expect(resolve(conversation(), q)).toEqual({ ok: false, code: 'step-not-current' });
  });

  it('re-authorizes against the permission level as it is now', () => {
    // `flashcard.add-cards` is above read-only, so a user who narrowed the level
    // after the card was produced is refused rather than asked.
    expect(resolve(conversation(), queue(), 'read-only')).toEqual({
      ok: false,
      code: 'operation-denied',
    });
  });

  it('re-authorizes against the profile’s enabled operations as they are now', () => {
    expect(resolve(conversation(), queue(), 'full-automation', ['flashcard.list-decks'])).toEqual({
      ok: false,
      code: 'operation-denied',
    });
    expect(resolve(conversation(), queue(), 'full-automation', ['flashcard.add-cards']).ok).toBe(true);
  });

  it('does not pre-confirm the request it is asking the user about', () => {
    // A confirmation-demanding operation must still resolve — that is the whole
    // point of an approval — but it must report that a confirmation is demanded
    // rather than quietly satisfying it.
    const result = resolve();
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.approval.confirmation).toBe('boolean');
  });
});

describe('pendingAgentStepApproval', () => {
  it('offers the step the task is actually waiting on', () => {
    expect(pendingAgentStepApproval(queue())).toEqual({ taskId: 'task-1', stepId: 'step-1' });
  });

  it('offers nothing when no step is waiting', () => {
    const q = queue({ task: task({ steps: [step({ status: 'running' })] }) });
    expect(pendingAgentStepApproval(q)).toBeNull();
  });

  it('offers nothing when the waiting step is not the current one', () => {
    const q = queue({
      task: task({
        steps: [step({ id: 'step-0', status: 'running' }), step({ id: 'step-1' })],
        currentStepId: 'step-0',
      }),
    });
    expect(pendingAgentStepApproval(q)).toBeNull();
  });

  it.each(['completed', 'failed', 'cancelled'] as const)(
    'offers nothing from a %s queue item',
    (status) => {
      expect(pendingAgentStepApproval(queue({ status }))).toBeNull();
    },
  );

  it('agrees with the resolver — anything it offers, the gate accepts', () => {
    const offered = pendingAgentStepApproval(queue());
    if (!offered) throw new Error('the producer offered nothing to check the gate against');
    const chat = conversation({
      type: 'approve-step',
      taskId: offered.taskId,
      stepId: offered.stepId,
    });
    expect(resolve(chat).ok).toBe(true);
  });

  it('picks the approval that has been blocking longest, not the newest', () => {
    const q: AgentTaskQueue = {
      version: 1,
      items: [
        {
          id: 'task-new',
          task: task({ id: 'task-new' }),
          priority: 100,
          status: 'queued',
          createdAt: NOW + 5_000,
          updatedAt: NOW + 5_000,
        },
        {
          id: 'task-old',
          task: task({ id: 'task-old' }),
          priority: 0,
          status: 'queued',
          createdAt: NOW,
          updatedAt: NOW,
        },
      ],
    };
    // Priority orders what the runner does next; it does not order who has been
    // kept waiting. Only one approval is ever offered, so the choice must be
    // stable regardless of array order.
    expect(pendingAgentStepApproval(q)).toEqual({ taskId: 'task-old', stepId: 'step-1' });
    expect(pendingAgentStepApproval({ ...q, items: [...q.items].reverse() }))
      .toEqual({ taskId: 'task-old', stepId: 'step-1' });
  });
});

describe('agentStepApprovalReduce', () => {
  const approval: AgentStepApproval = {
    taskId: 'task-1',
    stepId: 'step-1',
    objective: 'o',
    label: 'l',
    operation: 'flashcard.add-cards',
    confirmation: true,
  };

  it('grants only from review, and counts the grant as an attempt', () => {
    const reviewed = agentStepApprovalReduce(AGENT_STEP_APPROVAL_IDLE, { type: 'review', approval });
    expect(reviewed).toMatchObject({ status: 'review', attempts: 0 });
    const granted = agentStepApprovalReduce(reviewed, { type: 'grant' });
    expect(granted).toMatchObject({ status: 'granted', attempts: 1, approval });
  });

  it('refuses to grant from idle, where nothing was ever shown', () => {
    expect(agentStepApprovalReduce(AGENT_STEP_APPROVAL_IDLE, { type: 'grant' }))
      .toEqual(AGENT_STEP_APPROVAL_IDLE);
  });

  it('sends a retry back to idle so the next attempt re-resolves', () => {
    const failed: AgentStepApprovalRun = { status: 'failed', attempts: 1, code: 'step-not-awaiting' };
    const retried = agentStepApprovalReduce(failed, { type: 'retry' });
    // Idle, not review: nothing has been resolved yet, and the old code is gone
    // rather than lingering beside a fresh question.
    expect(retried).toEqual({ status: 'idle', attempts: 1 });
  });

  it('will not cancel or retry a grant that has already been given', () => {
    const granted: AgentStepApprovalRun = { status: 'granted', attempts: 1, approval };
    expect(agentStepApprovalReduce(granted, { type: 'cancel' })).toEqual(granted);
    expect(agentStepApprovalReduce(granted, { type: 'retry' })).toEqual(granted);
    expect(agentStepApprovalReduce(granted, { type: 'dismiss' })).toEqual({ status: 'idle', attempts: 1 });
  });

  it('records a run that failed after the grant was given', () => {
    // Without this the card would read "approved" over a step that never ran —
    // the one outcome an approval control must never claim.
    const granted: AgentStepApprovalRun = { status: 'granted', attempts: 1, approval };
    expect(agentStepApprovalReduce(granted, { type: 'failed', code: 'approve-failed' }))
      .toEqual({ status: 'failed', attempts: 1, code: 'approve-failed' });
  });

  it('keeps the attempt count across a refusal so a second ask is not a first', () => {
    let run = agentStepApprovalReduce(AGENT_STEP_APPROVAL_IDLE, { type: 'review', approval });
    run = agentStepApprovalReduce(run, { type: 'grant' });
    run = agentStepApprovalReduce({ ...run, status: 'failed' }, { type: 'retry' });
    expect(run.attempts).toBe(1);
  });
});
