import { describe, expect, it } from 'vitest';
import {
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
  type AgentOperationLog,
} from '../agentOperationLog';
import {
  AGENT_UNDO_IDLE,
  agentOperationWasUndone,
  agentUndoActionForCall,
  agentUndoReduce,
  resolveAgentUndo,
} from '../agentUndo';

function savedLog(): AgentOperationLog {
  return agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
    operation: 'flashcard.add-cards',
    claim: 'created',
    entityType: 'flashcard',
    entityIds: ['card-1'],
    callId: 'save-call',
  }, 100);
}

describe('Agent Undo producer', () => {
  it('offers a destructive typed action only for a currently invertible entry', () => {
    expect(agentUndoActionForCall(savedLog(), 'save-call')).toMatchObject({
      destructive: true,
      effect: { type: 'undo', operationId: 'save-call|0' },
    });
    expect(agentUndoActionForCall(savedLog(), 'missing')).toBeNull();
  });

  it('stops offering the action after its inverse lands', () => {
    const initial = savedLog();
    const reversed = agentOperationLogAppend(initial, {
      operation: 'flashcard.delete-cards',
      claim: 'deleted',
      entityType: 'flashcard',
      entityIds: ['card-1'],
      callId: 'undo-call',
      invertsSequence: 0,
    }, 101);
    expect(agentUndoActionForCall(reversed, 'save-call')).toBeNull();
    expect(agentOperationWasUndone(reversed, 'save-call')).toBe(true);
  });
});

describe('resolveAgentUndo', () => {
  it('re-derives the exact inverse against live entity ids', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'save-call|0',
      'limited-actions',
      new Set(['card-1']),
      ['flashcard.delete-cards'],
    )).toEqual({
      ok: true,
      target: {
        operationId: 'save-call|0',
        sequence: 0,
        operation: 'flashcard.delete-cards',
        entityType: 'flashcard',
        entityIds: ['card-1'],
      },
    });
  });

  it('refuses when the entity disappeared after the action was offered', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'save-call|0',
      'full-automation',
      new Set(),
      ['flashcard.delete-cards'],
    )).toEqual({ ok: false, code: 'entity-not-found' });
  });

  it('refuses when the active profile was narrowed after review', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'save-call|0',
      'full-automation',
      new Set(['card-1']),
      ['flashcard.add-cards'],
    )).toEqual({ ok: false, code: 'operation-denied' });
  });

  it('refuses an operation id that was never logged', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'invented',
      'full-automation',
      new Set(['card-1']),
      ['flashcard.delete-cards'],
    )).toEqual({ ok: false, code: 'entry-not-found' });
  });
});

describe('agentUndoReduce', () => {
  const target = {
    operationId: 'save-call|0',
    sequence: 0,
    operation: 'flashcard.delete-cards' as const,
    entityType: 'flashcard',
    entityIds: ['card-1'],
  };

  it('requires review before confirm and success', () => {
    expect(agentUndoReduce(AGENT_UNDO_IDLE, { type: 'confirm' })).toEqual(AGENT_UNDO_IDLE);
    const reviewed = agentUndoReduce(AGENT_UNDO_IDLE, { type: 'review', target });
    const running = agentUndoReduce(reviewed, { type: 'confirm' });
    expect(running.status).toBe('running');
    expect(agentUndoReduce(running, { type: 'succeeded' }).status).toBe('undone');
  });

  it('keeps a typed failure retryable', () => {
    const reviewed = agentUndoReduce(AGENT_UNDO_IDLE, { type: 'review', target });
    const running = agentUndoReduce(reviewed, { type: 'confirm' });
    const failed = agentUndoReduce(running, { type: 'failed', code: 'undo-failed' });
    expect(failed).toMatchObject({ status: 'failed', attempts: 1, code: 'undo-failed' });
    expect(agentUndoReduce(failed, { type: 'retry' })).toEqual({ status: 'idle', attempts: 1 });
  });
});
