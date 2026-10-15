// @vitest-environment jsdom
/**
 * `flashcard.schedule-reviews` was declared and always disabled ("Unavailable until a real
 * execution adapter exists"). It is a real adapter now: it snoozes the reviews due now, or keeps a
 * daily number of them and snoozes the rest, and it is undoable through the operation log — the
 * same restoring-inverse path as a calendar move.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dueDeckCards,
  loadDeck,
  replaceImportedDeck,
  reviewDeckCard,
  setDeckCardsDueAt,
} from '../flashcardDeck';
import { createCentralAgentToolRegistry } from '../agentToolRegistry';
import { createAgentTask, type AgentExecutionEvent } from '../../shared/localAgent';
import { agentOperationDraftFromExecution } from '../../shared/agentExecutionRecord';
import { agentInverseOperation } from '../../shared/agentInverseOperations';
import { AGENT_UNDO_RESTORING_OPERATIONS, AGENT_UNDO_SUPPORTED_OPERATIONS } from '../../shared/agentUndo';

const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 9, 1, 9);
const t = (key: string, vars?: Record<string, unknown>) => (vars ? `${key}${JSON.stringify(vars)}` : key);

function schedule(arguments_: Record<string, unknown>): Record<string, unknown> {
  const handler = createCentralAgentToolRegistry(t)['flashcard.schedule-reviews'];
  if (!handler) throw new Error('flashcard.schedule-reviews has no adapter');
  return handler(arguments_) as Record<string, unknown>;
}

function dueIds(): string[] {
  return dueDeckCards(loadDeck()).filter((card) => card.srs).map((card) => card.id).sort();
}

beforeEach(() => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  replaceImportedDeck('seed-book', 'Seed', [
    { word: '食べる', reading: 'たべる', meaning: 'to eat', folder: 'verbs', source: 'dictionary' },
    { word: '飲む', reading: 'のむ', meaning: 'to drink', folder: 'verbs', source: 'dictionary' },
    { word: '猫', reading: 'ねこ', meaning: 'cat', folder: 'nouns', source: 'dictionary' },
  ]);
  for (const card of loadDeck()) reviewDeckCard(card.id, 'good', T0);
  // Each card overdue by a different amount, so "most overdue first" is observable.
  const [a, b, c] = loadDeck();
  setDeckCardsDueAt([
    { id: a.id, dueAt: T0 + 2 * DAY },
    { id: b.id, dueAt: T0 + 3 * DAY },
    { id: c.id, dueAt: T0 + 4 * DAY },
  ]);
  vi.setSystemTime(T0 + 10 * DAY);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('flashcard.schedule-reviews', () => {
  it('snoozes every review due now by the given days, and nothing else about the card', () => {
    const before = loadDeck();
    expect(dueIds()).toHaveLength(3);
    const result = schedule({ days: 2 });
    expect(result).toMatchObject({ due: 3, kept: 0, postponed: 3, days: 2 });
    expect(dueIds()).toEqual([]);
    for (const card of loadDeck()) {
      expect(card.srs?.dueAt).toBe(Date.now() + 2 * DAY);
      const was = before.find((entry) => entry.id === card.id);
      expect({ ...card.srs, dueAt: 0 }).toEqual({ ...was?.srs, dueAt: 0 });
    }
  });

  it('keeps the most overdue reviews for today and snoozes the rest (a daily limit)', () => {
    const mostOverdue = loadDeck()[0].id;
    const result = schedule({ keep: 1 });
    expect(result).toMatchObject({ due: 3, kept: 1, postponed: 2, days: 1 });
    expect(dueIds()).toEqual([mostOverdue]);
  });

  it('narrows to one folder, and refuses a folder that does not exist', () => {
    const result = schedule({ days: 3, folder: 'nouns' });
    expect(result).toMatchObject({ postponed: 1, folder: 'nouns' });
    expect(dueIds()).toHaveLength(2);
    expect(() => schedule({ folder: 'no-such-folder' })).toThrow('aiAgent.reviews.folderNotFound');
  });

  it('is undoable through the operation log: the cards go back to where they were due', () => {
    const before = new Map(loadDeck().map((card) => [card.id, card.srs?.dueAt]));
    const result = schedule({ days: 5 });
    const task = createAgentTask('task-r', 'Snooze my reviews', [{
      id: 'step-r',
      label: 'Snooze',
      request: { callId: 'call-r', operation: 'flashcard.schedule-reviews', arguments: { days: 5 } },
    }], T0);
    const completed = {
      ...task,
      status: 'completed' as const,
      steps: task.steps.map((step) => ({ ...step, status: 'completed' as const, result })),
    };
    const events = [{
      type: 'tool-completed',
      taskId: 'task-r',
      stepId: 'step-r',
      callId: 'call-r',
      operation: 'flashcard.schedule-reviews',
      at: T0,
    }] as unknown as AgentExecutionEvent[];
    const draft = agentOperationDraftFromExecution('chat-1', completed, 'step-r', events);
    expect(draft).toMatchObject({ claim: 'updated', entityType: 'flashcard' });
    expect(draft?.entityIds.slice().sort()).toEqual([...before.keys()].sort());
    expect(agentInverseOperation('flashcard.schedule-reviews')).toBe('flashcard.schedule-reviews');
    expect(AGENT_UNDO_SUPPORTED_OPERATIONS.has('flashcard.schedule-reviews')).toBe(true);
    expect(AGENT_UNDO_RESTORING_OPERATIONS.has('flashcard.schedule-reviews')).toBe(true);

    const inverse = draft?.inverseArguments?.[0];
    expect(inverse).toBeDefined();
    expect(schedule(inverse as Record<string, unknown>)).toMatchObject({ restored: 3 });
    for (const card of loadDeck()) expect(card.srs?.dueAt).toBe(before.get(card.id));
  });

  it('refuses the Undo, changing nothing, when a card was reviewed since', () => {
    const result = schedule({ days: 5 });
    const reviewed = loadDeck()[1];
    reviewDeckCard(reviewed.id, 'good');
    const after = new Map(loadDeck().map((card) => [card.id, card.srs?.dueAt]));
    expect(() => schedule({ undo: result.undo })).toThrow('aiAgent.reviews.changedSince');
    for (const card of loadDeck()) expect(card.srs?.dueAt).toBe(after.get(card.id));
  });

  it('reports nothing to undo when no review was due', () => {
    schedule({ days: 1 });
    const second = schedule({ days: 1 });
    expect(second).toMatchObject({ due: 0, postponed: 0, ids: [] });
    expect(second.undo).toBeUndefined();
  });
});
