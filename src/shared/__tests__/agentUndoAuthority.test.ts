/**
 * Scorecard bug 9: Undo of the Agent's own write is authorized by the write.
 *
 * The inverse of a calendar write is `calendar.delete-event`, which needs full automation and
 * which no built-in write profile enables, so every calendar Undo was offered and then refused.
 * These tests hold the invariant the fix exists for, against the REAL built-in profiles: every
 * write a built-in may make, and whose Undo the result card offers, can be undone under that
 * profile, while nothing beyond that one inverse is granted.
 */
import { describe, expect, it } from 'vitest';
import {
  agentUndoAuthority,
  DEFAULT_AGENT_PROFILES,
  effectiveAgentPermission,
} from '../localAgentProfiles';
import {
  AGENT_INVERSE_OPERATIONS,
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
} from '../agentOperationLog';
import { AGENT_UNDO_SUPPORTED_OPERATIONS, resolveAgentUndo } from '../agentUndo';
import type { AgentPermissionLevel, AgentToolOperationId } from '../localAgent';

function logOf(operation: AgentToolOperationId) {
  return agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
    operation,
    // A move is undone from its recorded way back; every other write from its created ids.
    claim: operation === 'calendar.reschedule-event' ? 'updated' : 'created',
    entityType: 'calendar-event',
    entityIds: ['event-1'],
    ...(operation === 'calendar.reschedule-event'
      ? { inverseArguments: [{ id: 'event-1', date: '2026-10-09', undo: { kind: 'restore' } }] }
      : {}),
    callId: 'call',
  }, 1);
}

const live = () => new Set(['event-1']);

describe('agentUndoAuthority', () => {
  for (const profile of DEFAULT_AGENT_PROFILES) {
    const permission = effectiveAgentPermission('full-automation', profile);
    const undoable = profile.enabledOperations.filter((operation) => {
      const inverse = AGENT_INVERSE_OPERATIONS[operation];
      return Boolean(inverse && AGENT_UNDO_SUPPORTED_OPERATIONS.has(inverse));
    });
    for (const operation of undoable) {
      it(`${profile.name} can undo its own ${operation}`, () => {
        const authority = agentUndoAuthority(operation, permission, profile.enabledOperations);
        const resolution = resolveAgentUndo(
          logOf(operation),
          'call|0',
          authority.permission,
          live,
          authority.allowedOperations,
        );
        expect(resolution).toMatchObject({ ok: true });
      });
    }
  }

  it('was refused before: the Tutor alone does not allow deleting events', () => {
    const tutor = DEFAULT_AGENT_PROFILES.find((profile) => profile.id === 'study-tutor')!;
    expect(tutor.enabledOperations).not.toContain('calendar.delete-event');
    expect(resolveAgentUndo(logOf('calendar.schedule-session'), 'call|0', tutor.permission, live, tutor.enabledOperations))
      .toEqual({ ok: false, code: 'operation-denied' });
  });

  it('adds exactly the registered inverse and raises the level only to what it needs', () => {
    const allowed: AgentToolOperationId[] = ['calendar.schedule-session'];
    const authority = agentUndoAuthority('calendar.schedule-session', 'limited-actions', allowed);
    expect(authority).toEqual({
      permission: 'full-automation',
      allowedOperations: ['calendar.schedule-session', 'calendar.delete-event'],
    });
    // The caller's list is not mutated.
    expect(allowed).toEqual(['calendar.schedule-session']);
  });

  it('grants nothing when the write itself is no longer allowed', () => {
    const narrowed: AgentToolOperationId[] = ['calendar.list'];
    expect(agentUndoAuthority('calendar.schedule-session', 'limited-actions', narrowed))
      .toEqual({ permission: 'limited-actions', allowedOperations: narrowed });
    expect(agentUndoAuthority('calendar.schedule-session', 'read-only', ['calendar.schedule-session']))
      .toEqual({ permission: 'read-only', allowedOperations: ['calendar.schedule-session'] });
  });

  it('grants nothing at a permission level this build does not define', () => {
    const unknown = 'root' as AgentPermissionLevel;
    expect(agentUndoAuthority('calendar.schedule-session', unknown, ['calendar.schedule-session']))
      .toEqual({ permission: unknown, allowedOperations: ['calendar.schedule-session'] });
  });

  it('grants nothing for an operation with no inverse, or for an undo entry itself', () => {
    expect(agentUndoAuthority('calendar.list', 'full-automation', ['calendar.list']))
      .toEqual({ permission: 'full-automation', allowedOperations: ['calendar.list'] });
    expect(agentUndoAuthority('calendar.delete-event', 'limited-actions', ['calendar.delete-event']))
      .toEqual({ permission: 'limited-actions', allowedOperations: ['calendar.delete-event'] });
  });

  it('with no profile allow-list, still narrows nothing and widens only the level', () => {
    expect(agentUndoAuthority('calendar.create-reminder', 'limited-actions'))
      .toEqual({ permission: 'full-automation' });
  });
});
