import { describe, expect, it } from 'vitest';
import {
  agentExecutionTimelineProjection,
  agentOperationDraftFromExecution,
  agentPlanControlTimelineProjection,
} from '../agentExecutionRecord';
import { agentTimelineRecord, type AgentTimelineEntry } from '../agentTimeline';
import { createAgentTask, updateAgentTask, type AgentExecutionEvent } from '../localAgent';

const NOW = 1_700_000_000_000;

function completedTask(
  operation: Parameters<typeof createAgentTask>[2][number]['request']['operation'],
  result: unknown,
  arguments_: Record<string, unknown> = {},
) {
  const queued = createAgentTask('task-1', 'Do the thing', [{
    id: 'step-1',
    label: 'First step',
    request: { callId: 'call-1', operation, arguments: arguments_ },
  }], NOW);
  const running = updateAgentTask(queued, { type: 'start-step', stepId: 'step-1' }, NOW + 1);
  return updateAgentTask(
    running,
    { type: 'complete-step', stepId: 'step-1', result },
    NOW + 2,
  );
}

function event(
  type: AgentExecutionEvent['type'],
  operation: AgentExecutionEvent['operation'] = 'flashcard.add-cards',
): AgentExecutionEvent {
  return {
    type,
    taskId: 'task-1',
    stepId: 'step-1',
    callId: 'call-1',
    operation,
    timestamp: NOW + 2,
    ...(type === 'tool-failed' ? { error: 'failed' } : {}),
  };
}

describe('agentOperationDraftFromExecution', () => {
  it('records exact returned ids with full conversation-plan provenance', () => {
    const task = completedTask(
      'flashcard.add-cards',
      { cards: 12, createdIds: ['card-1', 'card-2', 'card-1'] },
      { bookId: 'novel-7', from: 1, to: 5 },
    );
    expect(agentOperationDraftFromExecution(
      'conversation-1',
      task,
      'step-1',
      [event('tool-started'), event('tool-completed')],
    )).toEqual({
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'flashcard',
      entityIds: ['card-1', 'card-2'],
      // What the step was asked to do. Without it the record says two cards
      // landed but not which book or chapters they were supposed to come from,
      // which is the half the user is actually checking.
      arguments: { bookId: 'novel-7', from: 1, to: 5 },
      callId: 'call-1',
      conversationId: 'conversation-1',
      taskId: 'task-1',
      stepId: 'step-1',
    });
  });

  it('carries the request arguments rather than rebuilding them', () => {
    // Two runs that differ ONLY in the chapters they targeted must produce two
    // distinguishable records — that is the whole point of storing arguments.
    const draft = (from: number, to: number) => agentOperationDraftFromExecution(
      'chat',
      completedTask(
        'flashcard.add-cards',
        { createdIds: ['card-1'] },
        { bookId: 'novel-7', from, to },
      ),
      'step-1',
      [event('tool-completed')],
    );
    expect(draft(1, 5)?.arguments).toEqual({ bookId: 'novel-7', from: 1, to: 5 });
    expect(draft(6, 9)?.arguments).toEqual({ bookId: 'novel-7', from: 6, to: 9 });
  });

  it('requires exactly one matching real completion event', () => {
    const task = completedTask('flashcard.add-cards', { createdIds: ['card-1'] });
    expect(agentOperationDraftFromExecution('chat', task, 'step-1', [])).toBeNull();
    expect(agentOperationDraftFromExecution(
      'chat',
      task,
      'step-1',
      [event('tool-completed'), event('tool-completed')],
    )).toBeNull();
    expect(agentOperationDraftFromExecution(
      'chat',
      task,
      'step-1',
      [{ ...event('tool-completed'), callId: 'some-other-call' }],
    )).toBeNull();
  });

  it('never scavenges an arbitrary result id for an operation without a contract', () => {
    const task = completedTask('settings.apply-theme', {
      id: 'looks-authoritative-but-is-not',
      nested: { createdIds: ['also-not-trusted'] },
    });
    expect(agentOperationDraftFromExecution(
      'chat',
      task,
      'step-1',
      [event('tool-completed', 'settings.apply-theme')],
    )).toBeNull();
  });

  it('refuses a create no-op and malformed returned ids', () => {
    const noOp = completedTask('flashcard.create-deck', { folders: ['Known'] });
    expect(agentOperationDraftFromExecution(
      'chat',
      noOp,
      'step-1',
      [event('tool-completed', 'flashcard.create-deck')],
    )).toBeNull();
    const malformed = completedTask('media.add-item', [{ id: '' }, { id: 42 }]);
    expect(agentOperationDraftFromExecution(
      'chat',
      malformed,
      'step-1',
      [event('tool-completed', 'media.add-item')],
    )).toBeNull();
  });

  it('records tracked non-undoable updates honestly as updates', () => {
    const task = completedTask('study.filter-vocabulary', { workspaceId: 'workspace-7' });
    expect(agentOperationDraftFromExecution(
      'chat',
      task,
      'step-1',
      [event('tool-completed', 'study.filter-vocabulary')],
    )).toMatchObject({
      operation: 'study.filter-vocabulary',
      claim: 'updated',
      entityType: 'study-workspace',
      entityIds: ['workspace-7'],
    });
  });
});

function applyProjection(
  entries: AgentTimelineEntry[],
  projection: ReturnType<typeof agentExecutionTimelineProjection>,
  start: number,
): AgentTimelineEntry[] {
  return projection.events.reduce(
    (current, projected, index) => agentTimelineRecord(
      current,
      projection.target,
      projected,
      start + index,
    ),
    entries,
  );
}

describe('Agent execution timeline projections', () => {
  it('keeps exact task, step, call and operation provenance', () => {
    const projection = agentExecutionTimelineProjection('conversation-1', event('tool-started'));
    expect(projection.target).toMatchObject({
      conversationId: 'conversation-1',
      taskId: 'task-1',
      stepId: 'step-1',
      callId: 'call-1',
      operation: 'flashcard.add-cards',
      effect: 'execute-step',
    });
    expect(projection.events).toEqual([{ type: 'review' }, { type: 'running' }]);
  });

  it('records retries as another attempt and preserves the first failure', () => {
    let entries: AgentTimelineEntry[] = [];
    entries = applyProjection(entries, agentExecutionTimelineProjection('chat', event('tool-started')), NOW);
    entries = applyProjection(entries, agentExecutionTimelineProjection('chat', event('tool-failed')), NOW + 10);
    entries = applyProjection(entries, agentExecutionTimelineProjection('chat', event('tool-started')), NOW + 20);
    entries = applyProjection(entries, agentExecutionTimelineProjection('chat', event('tool-completed')), NOW + 30);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ attempt: 2, status: 'succeeded' });
    expect(entries[1]).toMatchObject({ attempt: 1, status: 'failed', code: 'tool-failed' });
  });

  it('records a confirmation request as review, never completion', () => {
    const projection = agentExecutionTimelineProjection('chat', event('confirmation-required'));
    const entries = applyProjection([], projection, NOW);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ status: 'review', attempt: 1 });
  });

  it('keeps durable-save recovery distinct from tool execution', () => {
    const failed = agentPlanControlTimelineProjection(
      'chat',
      'task-1',
      'retry-save',
      { ok: false, code: 'store-failed' },
    );
    expect(failed.target).toMatchObject({
      effect: 'plan-save',
      taskId: 'task-1',
      actionId: 'retry-save',
    });
    expect(failed.target).not.toHaveProperty('callId');
    expect(failed.events.at(-1)).toEqual({ type: 'failed', code: 'store-failed' });
  });

  it('records an initial outcome receipt failure as a save, not a tool rerun', () => {
    const failed = agentPlanControlTimelineProjection(
      'chat',
      'task-1',
      'save-outcome',
      { ok: false, code: 'outcome-not-recorded' },
    );
    expect(failed.target).toMatchObject({
      effect: 'plan-save',
      taskId: 'task-1',
      actionId: 'save-outcome',
    });
    expect(failed.target).not.toHaveProperty('callId');
  });
});
