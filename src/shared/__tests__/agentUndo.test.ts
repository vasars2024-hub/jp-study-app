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
  agentUndoInvocations,
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

/** Live ids for whichever entity type the resolver asks about. */
const live = (ids: string[]) => () => new Set(ids);

describe('resolveAgentUndo', () => {
  it('re-derives the exact inverse against live entity ids', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'save-call|0',
      'limited-actions',
      live(['card-1']),
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
      live([]),
      ['flashcard.delete-cards'],
    )).toEqual({ ok: false, code: 'entity-not-found' });
  });

  it('refuses when the active profile was narrowed after review', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'save-call|0',
      'full-automation',
      live(['card-1']),
      ['flashcard.add-cards'],
    )).toEqual({ ok: false, code: 'operation-denied' });
  });

  it('refuses an operation id that was never logged', () => {
    expect(resolveAgentUndo(
      savedLog(),
      'invented',
      'full-automation',
      live(['card-1']),
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

describe('agentUndoInvocations', () => {
  it('gives each inverse the argument shape its own adapter declares', () => {
    expect(agentUndoInvocations('flashcard.delete-cards', ['a', 'b']))
      .toEqual([{ ids: ['a', 'b'] }]);
    expect(agentUndoInvocations('flashcard.delete-deck', ['Mined']))
      .toEqual([{ name: 'Mined' }]);
    expect(agentUndoInvocations('calendar.delete-event', ['e-1']))
      .toEqual([{ id: 'e-1' }]);
    expect(agentUndoInvocations('media.delete-item', ['m-1', 'm-2']))
      .toEqual([{ id: 'm-1' }, { id: 'm-2' }]);
  });

  it('authorizes each inverse with the arguments it will actually receive', () => {
    // `flashcard.delete-deck` declares `name` as required. Authorizing it with
    // `{ids}` — the shape the resolver used to hard-code — is refused, which is
    // what silently blocked every non-flashcard inverse.
    const deckLog = agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
      operation: 'flashcard.create-deck',
      claim: 'created',
      entityType: 'flashcard-deck',
      entityIds: ['Mined'],
      callId: 'save-call',
    }, 100);

    expect(resolveAgentUndo(
      deckLog,
      'save-call|0',
      'full-automation',
      live(['Mined']),
      ['flashcard.delete-deck'],
    )).toMatchObject({ ok: true, target: { operation: 'flashcard.delete-deck' } });
  });

  it('checks the entity type the entry names, not one flat pool of ids', () => {
    const deckLog = agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
      operation: 'flashcard.create-deck',
      claim: 'created',
      entityType: 'flashcard-deck',
      entityIds: ['Mined'],
      callId: 'save-call',
    }, 100);

    const asked: string[] = [];
    const resolution = resolveAgentUndo(
      deckLog,
      'save-call|0',
      'full-automation',
      (entityType) => {
        asked.push(entityType);
        return new Set(entityType === 'flashcard-deck' ? ['Mined'] : []);
      },
      ['flashcard.delete-deck'],
    );

    expect(asked).toEqual(['flashcard-deck']);
    expect(resolution).toMatchObject({ ok: true });
  });
});
