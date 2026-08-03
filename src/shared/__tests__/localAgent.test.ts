import { describe, expect, it } from 'vitest';
import {
  AGENT_TOOL_OPERATIONS,
  createAgentTask,
  evaluateAgentToolAccess,
  executeAgentTaskStep,
  updateAgentTask,
  type AgentToolRequest,
} from '../localAgent';

function request(
  operation: AgentToolRequest['operation'],
  confirmed = false,
): AgentToolRequest {
  return { callId: `call-${operation}`, operation, arguments: {}, confirmed };
}

describe('local agent safety boundary', () => {
  it('registers operations only under the eight approved tool groups', () => {
    expect(new Set(AGENT_TOOL_OPERATIONS.map((entry) => entry.tool))).toEqual(new Set([
      'media',
      'anime',
      'visual-novel',
      'flashcard',
      'dictionary',
      'calendar',
      'settings',
      'study',
    ]));
  });

  it('allows reads but denies mutations in read-only mode', () => {
    expect(evaluateAgentToolAccess(request('dictionary.lookup'), 'read-only').status).toBe('allowed');
    expect(evaluateAgentToolAccess(request('flashcard.create-deck'), 'read-only')).toMatchObject({
      status: 'denied',
    });
  });

  it('allows ordinary limited actions without confirmation', () => {
    expect(evaluateAgentToolAccess(request('flashcard.create-deck'), 'limited-actions').status).toBe(
      'allowed',
    );
  });

  it('requires confirmation for destructive, external, file, and major changes', () => {
    expect(evaluateAgentToolAccess(request('media.delete-item'), 'full-automation')).toMatchObject({
      status: 'confirmation-required',
      reason: 'delete-data',
    });
    expect(
      evaluateAgentToolAccess(request('anime.fetch-external-metadata'), 'limited-actions'),
    ).toMatchObject({
      status: 'confirmation-required',
      reason: 'external-connection',
    });
    expect(
      evaluateAgentToolAccess(request('media.organize-files'), 'full-automation'),
    ).toMatchObject({
      status: 'confirmation-required',
      reason: 'organize-files',
    });
    expect(
      evaluateAgentToolAccess(request('settings.change-preference'), 'full-automation'),
    ).toMatchObject({
      status: 'confirmation-required',
      reason: 'major-change',
    });
  });

  it('does not let confirmation elevate the configured permission level', () => {
    expect(
      evaluateAgentToolAccess(request('settings.reset', true), 'limited-actions'),
    ).toMatchObject({ status: 'denied' });
    expect(
      evaluateAgentToolAccess(request('settings.reset', true), 'full-automation'),
    ).toMatchObject({ status: 'allowed' });
  });
});

describe('local agent controller execution', () => {
  it('runs only a registered adapter and records bounded audit events', async () => {
    const task = createAgentTask('task-1', 'Look up a word', [{
      id: 'lookup',
      label: 'Look up 日本語',
      request: {
        callId: 'call-1',
        operation: 'dictionary.lookup',
        arguments: { term: '日本語' },
      },
    }], 10);
    const timestamps = [20, 35];
    const result = await executeAgentTaskStep(task, 'lookup', {
      permission: 'read-only',
      handlers: {
        'dictionary.lookup': (arguments_) => ({ term: arguments_.term, found: true }),
      },
      now: () => timestamps.shift() ?? 35,
    });
    expect(result.task).toMatchObject({ status: 'completed' });
    expect(result.task.steps[0].result).toEqual({ term: '日本語', found: true });
    expect(result.events).toEqual([
      expect.objectContaining({ type: 'tool-started', timestamp: 20 }),
      expect.objectContaining({ type: 'tool-completed', timestamp: 35, durationMs: 15 }),
    ]);
  });

  it('refuses a queued step the profile no longer enables, even with the permission level intact', async () => {
    // Phase 7. `AgentTask`s are PERSISTED in `AgentTaskQueue`, so a task outlives the profile
    // that authorized it. Before this, the per-operation allow-list was enforced only in
    // `parseLocalAgentModelPlan` — plan time — while execution re-checked the permission
    // LEVEL alone. A task planned while a profile enabled `flashcard.delete-deck` therefore
    // stayed runnable after the user removed that operation from the profile.
    const task = createAgentTask('task-narrowed', 'Remove a deck', [{
      id: 'delete',
      label: 'Delete deck',
      request: {
        callId: 'call-delete',
        operation: 'flashcard.delete-deck',
        arguments: { deckId: 'deck-1' },
      },
    }], 10);
    let calls = 0;
    const handlers = {
      'flashcard.delete-deck': () => {
        calls += 1;
        return { deleted: true };
      },
    };
    // The permission level is unchanged and the call is confirmed: the ONLY thing standing
    // between this task and the handler is the profile's allow-list.
    const result = await executeAgentTaskStep(task, 'delete', {
      permission: 'full-automation',
      allowedOperations: ['dictionary.lookup'],
      handlers,
      confirmedCallIds: new Set(['call-delete']),
      now: () => 20,
    });
    expect(result.task.status).toBe('failed');
    expect(result.task.steps[0].error).toContain('not enabled for the active agent profile');
    expect(calls).toBe(0);
  });

  it('still runs a queued step the profile does enable', async () => {
    // The other half: the allow-list must not deny everything it is handed.
    const task = createAgentTask('task-allowed', 'Look up a word', [{
      id: 'lookup',
      label: 'Look up 日本語',
      request: { callId: 'call-1', operation: 'dictionary.lookup', arguments: { term: '日本語' } },
    }], 10);
    const result = await executeAgentTaskStep(task, 'lookup', {
      permission: 'read-only',
      allowedOperations: ['dictionary.lookup', 'flashcard.delete-deck'],
      handlers: { 'dictionary.lookup': () => ({ found: true }) },
      now: () => 20,
    });
    expect(result.task.status).toBe('completed');
  });

  it('leaves callers with no profile governed by the permission level alone', async () => {
    // `allowedOperations` is optional on purpose: a caller that genuinely has no profile must
    // not be silently denied everything by an empty allow-list it never set.
    const task = createAgentTask('task-noprofile', 'Look up a word', [{
      id: 'lookup',
      label: 'Look up 日本語',
      request: { callId: 'call-1', operation: 'dictionary.lookup', arguments: { term: '日本語' } },
    }], 10);
    const result = await executeAgentTaskStep(task, 'lookup', {
      permission: 'read-only',
      handlers: { 'dictionary.lookup': () => ({ found: true }) },
      now: () => 20,
    });
    expect(result.task.status).toBe('completed');
  });

  it('pauses a sensitive operation until its exact call is confirmed', async () => {
    const task = createAgentTask('task-1', 'Remove a deck', [{
      id: 'delete',
      label: 'Delete deck',
      request: {
        callId: 'call-delete',
        operation: 'flashcard.delete-deck',
        arguments: { deckId: 'deck-1' },
      },
    }], 10);
    let calls = 0;
    const handlers = {
      'flashcard.delete-deck': () => {
        calls += 1;
        return { deleted: true };
      },
    };
    const paused = await executeAgentTaskStep(task, 'delete', {
      permission: 'full-automation',
      handlers,
      now: () => 20,
    });
    expect(paused.task.status).toBe('waiting-confirmation');
    expect(paused.events[0]).toMatchObject({
      type: 'confirmation-required',
      confirmationReason: 'delete-data',
    });
    expect(calls).toBe(0);

    const completed = await executeAgentTaskStep(paused.task, 'delete', {
      permission: 'full-automation',
      handlers,
      confirmedCallIds: new Set(['call-delete']),
      now: () => 30,
    });
    expect(completed.task.status).toBe('completed');
    expect(calls).toBe(1);
  });

  it('fails closed when permission or an approved adapter is missing', async () => {
    const mutationTask = createAgentTask('task-1', 'Create deck', [{
      id: 'create',
      label: 'Create deck',
      request: {
        callId: 'call-create',
        operation: 'flashcard.create-deck',
        arguments: {},
      },
    }]);
    const denied = await executeAgentTaskStep(mutationTask, 'create', {
      permission: 'read-only',
      handlers: { 'flashcard.create-deck': () => ({ created: true }) },
    });
    expect(denied.task.steps[0]).toMatchObject({ status: 'failed' });

    const readTask = createAgentTask('task-2', 'Read settings', [{
      id: 'read',
      label: 'Read settings',
      request: { callId: 'call-read', operation: 'settings.read', arguments: {} },
    }]);
    const missing = await executeAgentTaskStep(readTask, 'read', {
      permission: 'read-only',
      handlers: {},
    });
    expect(missing.task.steps[0].error).toContain('No approved adapter');
  });
});

describe('local agent task plan', () => {
  const buildTask = () => createAgentTask('task-1', 'Prepare an anime study deck', [
    {
      id: 'search',
      label: 'Find anime',
      request: request('anime.search'),
    },
    {
      id: 'deck',
      label: 'Create deck',
      request: request('flashcard.create-deck'),
    },
  ], 100);

  it('tracks ordered progress through completion', () => {
    const started = updateAgentTask(buildTask(), { type: 'start-step', stepId: 'search' }, 110);
    expect(started).toMatchObject({ status: 'running', currentStepId: 'search' });
    const searched = updateAgentTask(
      started,
      { type: 'complete-step', stepId: 'search', result: { matches: 2 } },
      120,
    );
    const deckStarted = updateAgentTask(searched, { type: 'start-step', stepId: 'deck' }, 130);
    const completed = updateAgentTask(
      deckStarted,
      { type: 'complete-step', stepId: 'deck', result: { cards: 20 } },
      140,
    );
    expect(completed.status).toBe('completed');
    expect(completed.steps.map((step) => step.status)).toEqual(['completed', 'completed']);
  });

  it('exposes confirmation and error states', () => {
    const waiting = updateAgentTask(
      buildTask(),
      { type: 'request-confirmation', stepId: 'search' },
      110,
    );
    expect(waiting).toMatchObject({
      status: 'waiting-confirmation',
      currentStepId: 'search',
    });
    const running = updateAgentTask(waiting, { type: 'start-step', stepId: 'search' }, 120);
    const failed = updateAgentTask(
      running,
      { type: 'fail-step', stepId: 'search', error: 'Local index unavailable.' },
      130,
    );
    expect(failed).toMatchObject({ status: 'failed', currentStepId: undefined });
    expect(failed.steps[0]).toMatchObject({
      status: 'failed',
      error: 'Local index unavailable.',
    });
  });

  it('rejects out-of-order execution and oversized plans', () => {
    expect(() => updateAgentTask(buildTask(), { type: 'start-step', stepId: 'deck' })).toThrow(
      'plan order',
    );
    const steps = Array.from({ length: 33 }, (_, index) => ({
      id: `step-${index}`,
      label: `Step ${index}`,
      request: {
        callId: `call-${index}`,
        operation: 'dictionary.lookup' as const,
        arguments: {},
      },
    }));
    expect(() => createAgentTask('large', 'Too large', steps)).toThrow('cannot exceed 32');
  });
});
