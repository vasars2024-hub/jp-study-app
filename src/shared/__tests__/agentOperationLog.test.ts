/**
 * An operation log earns its keep by refusing, so that is what these pin: an
 * entry the bound dropped, an operation that was never invertible, an inverse
 * already applied, and — the one this whole design exists for — an entry whose
 * entity something newer has since touched. The success case exists to prove
 * the refusals are not refusing everything.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_INVERSE_OPERATIONS,
  AGENT_OPERATION_LOG_EMPTY,
  AGENT_OPERATION_LOG_LIMIT,
  agentInverseOperation,
  agentOperationEntry,
  agentOperationLogAppend,
  resolveAgentOperationInverse,
  type AgentOperationDraft,
  type AgentOperationLog,
} from '../agentOperationLog';

const NOW = 1_700_000_000_000;

const draft = (over: Partial<AgentOperationDraft> = {}): AgentOperationDraft => ({
  operation: 'flashcard.add-cards',
  claim: 'created',
  entityType: 'flashcard',
  entityIds: ['card-1'],
  callId: 'call-1',
  ...over,
});

const logOf = (...drafts: AgentOperationDraft[]): AgentOperationLog => (
  drafts.reduce(
    (log, entry, index) => agentOperationLogAppend(log, entry, NOW + index),
    AGENT_OPERATION_LOG_EMPTY,
  )
);

describe('agentOperationLogAppend', () => {
  it('assigns a monotonic sequence and keeps the newest first', () => {
    const log = logOf(draft({ callId: 'a' }), draft({ callId: 'b' }));
    expect(log.entries.map((entry) => entry.sequence)).toEqual([1, 0]);
    expect(log.entries[0]).toMatchObject({ callId: 'b', id: 'b|1', recordedAt: NOW + 1 });
    expect(log).toMatchObject({ appended: 2, dropped: 0 });
  });

  it('never mutates what is already in the log', () => {
    const first = logOf(draft());
    const second = agentOperationLogAppend(first, draft({ callId: 'b' }), NOW + 1);
    expect(first.entries).toHaveLength(1);
    expect(second.entries[1]).toEqual(first.entries[0]);
  });

  it('copies the id list rather than aliasing the caller’s array', () => {
    const ids = ['card-1'];
    const log = agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, draft({ entityIds: ids }), NOW);
    ids.push('card-2');
    expect(log.entries[0].entityIds).toEqual(['card-1']);
  });

  it('drops the oldest at the bound and counts what it dropped', () => {
    const drafts = Array.from({ length: AGENT_OPERATION_LOG_LIMIT + 3 }, (_unused, index) => (
      draft({ callId: `call-${index}`, entityIds: [`card-${index}`] })
    ));
    const log = logOf(...drafts);
    expect(log.entries).toHaveLength(AGENT_OPERATION_LOG_LIMIT);
    expect(log).toMatchObject({ appended: AGENT_OPERATION_LOG_LIMIT + 3, dropped: 3 });
    // The newest survive; the sequence counter keeps running past the drop.
    expect(log.entries[0].sequence).toBe(AGENT_OPERATION_LOG_LIMIT + 2);
    expect(agentOperationEntry(log, 2)).toBeNull();
    expect(agentOperationEntry(log, 3)).not.toBeNull();
  });
});

describe('agentInverseOperation', () => {
  it('maps a forward operation to one the tool registry already exposes', () => {
    expect(agentInverseOperation('flashcard.create-deck')).toBe('flashcard.delete-deck');
    expect(agentInverseOperation('settings.apply-theme')).toBe('settings.undo-theme');
  });

  it('has no inverse for a delete, because ids alone cannot restore one', () => {
    expect(agentInverseOperation('flashcard.delete-deck')).toBeNull();
    expect(agentInverseOperation('media.delete-item')).toBeNull();
    expect(Object.keys(AGENT_INVERSE_OPERATIONS)).not.toContain('flashcard.delete-deck');
  });

  it('has no inverse for a read', () => {
    expect(agentInverseOperation('dictionary.lookup')).toBeNull();
  });
});

describe('resolveAgentOperationInverse', () => {
  it('resolves an inverse expressed only as ids', () => {
    const log = logOf(draft({ entityIds: ['card-1', 'card-2'], taskId: 'task-1', stepId: 'step-1' }));
    expect(resolveAgentOperationInverse(log, 0)).toEqual({
      ok: true,
      inverse: {
        sequence: 0,
        operation: 'flashcard.modify-cards',
        entityType: 'flashcard',
        entityIds: ['card-1', 'card-2'],
        taskId: 'task-1',
        stepId: 'step-1',
      },
    });
  });

  it('omits the task fields for a one-shot call rather than inventing them', () => {
    const resolution = resolveAgentOperationInverse(logOf(draft()), 0);
    expect(resolution).toEqual({
      ok: true,
      inverse: {
        sequence: 0,
        operation: 'flashcard.modify-cards',
        entityType: 'flashcard',
        entityIds: ['card-1'],
      },
    });
  });

  it('refuses a sequence that is not one', () => {
    const log = logOf(draft());
    expect(resolveAgentOperationInverse(log, -1)).toEqual({ ok: false, code: 'invalid-request' });
    expect(resolveAgentOperationInverse(log, 1.5)).toEqual({ ok: false, code: 'invalid-request' });
    expect(resolveAgentOperationInverse(log, Number.NaN))
      .toEqual({ ok: false, code: 'invalid-request' });
  });

  it('refuses an entry that never existed', () => {
    expect(resolveAgentOperationInverse(logOf(draft()), 7))
      .toEqual({ ok: false, code: 'entry-not-found' });
    expect(resolveAgentOperationInverse(AGENT_OPERATION_LOG_EMPTY, 0))
      .toEqual({ ok: false, code: 'entry-not-found' });
  });

  it('refuses an entry the bound rolled past, distinctly from one that never was', () => {
    const drafts = Array.from({ length: AGENT_OPERATION_LOG_LIMIT + 1 }, (_unused, index) => (
      draft({ callId: `call-${index}`, entityIds: [`card-${index}`] })
    ));
    const log = logOf(...drafts);
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'log-rolled' });
  });

  it('refuses an operation with no inverse in the registry', () => {
    const log = logOf(draft({ operation: 'flashcard.delete-deck', claim: 'created' }));
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'not-invertible' });
  });

  it.each(['updated', 'deleted', 'read'] as const)(
    'refuses to invert a %s claim, which would need a value this log does not keep',
    (claim) => {
      expect(resolveAgentOperationInverse(logOf(draft({ claim })), 0))
        .toEqual({ ok: false, code: 'not-invertible' });
    },
  );

  it('refuses an entry that acted on nothing', () => {
    expect(resolveAgentOperationInverse(logOf(draft({ entityIds: [] })), 0))
      .toEqual({ ok: false, code: 'entity-not-named' });
  });

  it('refuses an entry an inverse already landed on', () => {
    const log = logOf(
      draft(),
      draft({
        callId: 'undo-1',
        operation: 'flashcard.modify-cards',
        claim: 'deleted',
        entityIds: ['card-1'],
        invertsSequence: 0,
      }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'already-undone' });
  });

  it('refuses when something newer touched the same entity', () => {
    // The defect this module exists to prevent: undoing onto state that moved
    // would discard whatever happened in between.
    const log = logOf(
      draft({ entityIds: ['card-1'] }),
      draft({
        callId: 'call-2',
        operation: 'flashcard.modify-cards',
        claim: 'updated',
        entityIds: ['card-1'],
      }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'superseded' });
  });

  it('supersedes on any shared id, not only on a whole-for-whole match', () => {
    const log = logOf(
      draft({ entityIds: ['card-1', 'card-2'] }),
      draft({
        callId: 'call-2',
        operation: 'flashcard.modify-cards',
        claim: 'updated',
        entityIds: ['card-2', 'card-9'],
      }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'superseded' });
  });

  it('does not supersede on an entity nobody else touched', () => {
    const log = logOf(
      draft({ entityIds: ['card-1'] }),
      draft({ callId: 'call-2', claim: 'updated', entityIds: ['card-9'] }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toMatchObject({ ok: true });
  });

  it('does not supersede on a read, because looking is not touching', () => {
    const log = logOf(
      draft({ entityIds: ['card-1'] }),
      draft({
        callId: 'call-2',
        operation: 'dictionary.lookup',
        claim: 'read',
        entityIds: ['card-1'],
      }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toMatchObject({ ok: true });
  });

  it('is not superseded by an entry older than it', () => {
    const log = logOf(
      draft({ callId: 'call-0', claim: 'updated', entityIds: ['card-1'] }),
      draft({ callId: 'call-1', entityIds: ['card-1'] }),
    );
    expect(resolveAgentOperationInverse(log, 1)).toMatchObject({ ok: true });
  });

  it('says “never undoable” before it says “something changed”', () => {
    // Order matters for what the user is told: `superseded` would imply the undo
    // was possible if only they had been quicker.
    const log = logOf(
      draft({ operation: 'flashcard.delete-deck', entityIds: ['deck-1'] }),
      draft({ callId: 'call-2', claim: 'updated', entityIds: ['deck-1'] }),
    );
    expect(resolveAgentOperationInverse(log, 0)).toEqual({ ok: false, code: 'not-invertible' });
  });

  it('reads no live state: the same log always gives the same answer', () => {
    const log = logOf(draft());
    expect(resolveAgentOperationInverse(log, 0)).toEqual(resolveAgentOperationInverse(log, 0));
  });
});
