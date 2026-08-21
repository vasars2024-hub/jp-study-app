/**
 * The durable half of the operation log.
 *
 * Three properties carry the whole module, and each fails silently if it breaks:
 *
 * - **The projection loses what must not be persisted.** `arguments` are free
 *   text and `sequence`/`invertsSequence` are what an undo runs against. A
 *   projection that carried either would either widen the privacy exposure or
 *   make a restored row look replayable — and both would look correct in a UI.
 * - **The append is idempotent by id and returns the identical object.** The
 *   producer is an effect over a log that is re-offered on every projection, so
 *   a duplicate is the normal case, not the error case. Returning the same
 *   reference is what stops a no-op from scheduling a persist.
 * - **Normalization is total.** One malformed row must cost one row, never the
 *   record. A history that failed closed to empty would destroy exactly the
 *   evidence it exists to keep.
 */
import { describe, expect, it } from 'vitest';

import {
  AGENT_OPERATION_HISTORY_LIMIT,
  AGENT_OPERATION_HISTORY_RETENTION_MS,
  agentOperationHistoryAppend,
  agentOperationHistoryEntryFrom,
  emptyAgentOperationHistory,
  normalizeAgentOperationHistory,
  pruneAgentOperationHistory,
  type AgentOperationHistoryEntry,
} from '../agentOperationHistory';
import type { AgentOperationEntry } from '../agentOperationLog';
import {
  emptyAgentOperationalState,
  normalizeAgentOperationalState,
  pruneAgentOperationalState,
} from '../agentOperationalState';

const NOW = 1_800_000_000_000;

function entry(overrides: Partial<AgentOperationHistoryEntry> = {}): AgentOperationHistoryEntry {
  return {
    id: 'call-1|0',
    operation: 'flashcard.create-deck',
    claim: 'created',
    entityType: 'deck',
    entityIds: ['deck-1'],
    at: NOW,
    ...overrides,
  };
}

describe('the durable projection', () => {
  it('drops arguments and every replay field', () => {
    const session: AgentOperationEntry = {
      sequence: 7,
      id: 'call-9|7',
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'card',
      entityIds: ['card-1', 'card-2'],
      arguments: { deckId: 'deck-1', sentence: 'a sentence the user typed' },
      callId: 'call-9',
      conversationId: 'conv-1',
      taskId: 'task-1',
      stepId: 'step-1',
      recordedAt: NOW,
      invertsSequence: 3,
    };

    const projected = agentOperationHistoryEntryFrom(session);

    expect(projected).toEqual({
      id: 'call-9|7',
      operation: 'flashcard.add-cards',
      claim: 'created',
      entityType: 'card',
      entityIds: ['card-1', 'card-2'],
      at: NOW,
      conversationId: 'conv-1',
    });
    // Named individually, because `toEqual` on a shape someone later widens
    // would still pass while quietly persisting the field again.
    expect('arguments' in projected).toBe(false);
    expect('sequence' in projected).toBe(false);
    expect('invertsSequence' in projected).toBe(false);
  });

  it('copies the ids rather than sharing the session entry list', () => {
    const ids = ['deck-1'];
    const projected = agentOperationHistoryEntryFrom({
      sequence: 0,
      id: 'call-1|0',
      operation: 'flashcard.create-deck',
      claim: 'created',
      entityType: 'deck',
      entityIds: ids,
      callId: 'call-1',
      recordedAt: NOW,
    });
    ids.push('deck-2');
    expect(projected.entityIds).toEqual(['deck-1']);
  });

  it('omits conversationId for a one-shot call rather than storing an empty string', () => {
    const projected = agentOperationHistoryEntryFrom({
      sequence: 0,
      id: 'call-1|0',
      operation: 'flashcard.create-deck',
      claim: 'created',
      entityType: 'deck',
      entityIds: [],
      callId: 'call-1',
      recordedAt: NOW,
    });
    expect('conversationId' in projected).toBe(false);
  });
});

describe('append', () => {
  it('puts the newest row first', () => {
    const history = agentOperationHistoryAppend(
      agentOperationHistoryAppend(emptyAgentOperationHistory(), entry({ id: 'a' })),
      entry({ id: 'b' }),
    );
    expect(history.entries.map((row) => row.id)).toEqual(['b', 'a']);
  });

  it('returns the identical object for an id already present', () => {
    const first = agentOperationHistoryAppend(emptyAgentOperationHistory(), entry({ id: 'a' }));
    const again = agentOperationHistoryAppend(first, entry({ id: 'a', entityIds: ['deck-9'] }));
    expect(again).toBe(first);
  });

  it('drops the oldest row at the bound', () => {
    let history = emptyAgentOperationHistory();
    for (let index = 0; index <= AGENT_OPERATION_HISTORY_LIMIT; index += 1) {
      history = agentOperationHistoryAppend(history, entry({ id: `row-${index}`, at: NOW + index }));
    }
    expect(history.entries).toHaveLength(AGENT_OPERATION_HISTORY_LIMIT);
    expect(history.entries[0].id).toBe(`row-${AGENT_OPERATION_HISTORY_LIMIT}`);
    expect(history.entries.some((row) => row.id === 'row-0')).toBe(false);
  });
});

describe('normalization', () => {
  it('drops one malformed row and keeps the rest', () => {
    const history = normalizeAgentOperationHistory({
      version: 1,
      entries: [
        entry({ id: 'good', at: NOW }),
        { ...entry({ id: 'unknown-op' }), operation: 'flashcard.invent-deck' },
        { ...entry({ id: 'bad-claim' }), claim: 'mutated' },
        { ...entry({ id: 'no-time' }), at: 'yesterday' },
        { ...entry({ id: '' }) },
        'not an object',
      ],
    });
    expect(history.entries.map((row) => row.id)).toEqual(['good']);
  });

  it('dedupes by id and orders newest first', () => {
    const history = normalizeAgentOperationHistory({
      version: 1,
      entries: [
        entry({ id: 'old', at: NOW - 5_000 }),
        entry({ id: 'new', at: NOW }),
        entry({ id: 'new', at: NOW + 5_000 }),
      ],
    });
    expect(history.entries.map((row) => row.id)).toEqual(['new', 'old']);
    expect(history.entries[0].at).toBe(NOW);
  });

  it('refuses a document at another version instead of guessing at its rows', () => {
    expect(normalizeAgentOperationHistory({ version: 2, entries: [entry()] }).entries).toEqual([]);
    expect(normalizeAgentOperationHistory(null).entries).toEqual([]);
    expect(normalizeAgentOperationHistory([entry()]).entries).toEqual([]);
  });
});

describe('retention', () => {
  it('drops a row past the window and keeps one exactly on the cutoff', () => {
    const history = normalizeAgentOperationHistory({
      version: 1,
      entries: [
        entry({ id: 'inside', at: NOW - AGENT_OPERATION_HISTORY_RETENTION_MS }),
        entry({ id: 'outside', at: NOW - AGENT_OPERATION_HISTORY_RETENTION_MS - 1 }),
      ],
    });
    const pruned = pruneAgentOperationHistory(history, NOW);
    expect(pruned.entries.map((row) => row.id)).toEqual(['inside']);
  });

  // The negative control: a pruner that always rebuilt would look identical in
  // every assertion above, and would make every load emit a change event.
  it('returns the identical object when nothing is past the window', () => {
    const history = normalizeAgentOperationHistory({ version: 1, entries: [entry()] });
    expect(pruneAgentOperationHistory(history, NOW)).toBe(history);
  });
});

describe('the operational document', () => {
  it('round-trips the history through JSON', () => {
    const state = {
      ...emptyAgentOperationalState(),
      history: agentOperationHistoryAppend(emptyAgentOperationHistory(), entry()),
    };
    const restored = normalizeAgentOperationalState(JSON.parse(JSON.stringify(state)));
    expect(restored.history?.entries.map((row) => row.id)).toEqual(['call-1|0']);
  });

  it('prunes the history alongside the queue', () => {
    const state = {
      ...emptyAgentOperationalState(),
      history: normalizeAgentOperationHistory({
        version: 1,
        entries: [
          entry({ id: 'inside', at: NOW }),
          entry({ id: 'outside', at: NOW - AGENT_OPERATION_HISTORY_RETENTION_MS - 1 }),
        ],
      }),
    };
    const pruned = pruneAgentOperationalState(state, NOW);
    expect(pruned.history?.entries.map((row) => row.id)).toEqual(['inside']);
    expect(pruned.queue).toBe(state.queue);
  });

  // Identity here is what stops every operational read from rewriting the file.
  it('returns the identical state when neither section has anything to drop', () => {
    const state = {
      ...emptyAgentOperationalState(),
      history: normalizeAgentOperationHistory({ version: 1, entries: [entry()] }),
    };
    expect(pruneAgentOperationalState(state, NOW)).toBe(state);
  });

  it('gives a document written before the section existed an empty history', () => {
    const legacy = { ...emptyAgentOperationalState() } as Record<string, unknown>;
    delete legacy.history;
    expect(normalizeAgentOperationalState(legacy).history).toEqual(emptyAgentOperationHistory());
  });
});
