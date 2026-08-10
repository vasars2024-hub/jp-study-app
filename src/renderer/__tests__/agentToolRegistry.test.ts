// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  t: (key: string): string => key,
}));
import { AGENT_TOOL_OPERATIONS } from '../../shared/localAgent';
import {
  agentToolCapabilityMatrix,
  availableAgentToolOperationIds,
  createCentralAgentToolRegistry,
  type AgentToolCapability,
} from '../agentToolRegistry';
import { addDeckCardsTracked, loadDeck } from '../flashcardDeck';

const t = (key: string): string => key;
const unavailableCapability = (
  entry: AgentToolCapability,
): entry is Extract<AgentToolCapability, { available: false }> => !entry.available;

beforeEach(() => localStorage.clear());

describe('central Agent tool registry', () => {
  it('classifies every declared operation as installed or explicitly unavailable', () => {
    const handlers = createCentralAgentToolRegistry(t);
    const matrix = agentToolCapabilityMatrix(handlers);

    expect(matrix).toHaveLength(AGENT_TOOL_OPERATIONS.length);
    expect(new Set(matrix.map((entry) => entry.definition.id)).size)
      .toBe(AGENT_TOOL_OPERATIONS.length);
    expect(matrix.filter((entry) => entry.available).map((entry) => entry.definition.id).sort())
      .toEqual(Object.keys(handlers).sort());
    expect(availableAgentToolOperationIds(handlers))
      .toHaveLength(AGENT_TOOL_OPERATIONS.length - 3);
  });

  it('does not advertise lookup and queue stubs as grammar, analysis or scheduling', () => {
    const handlers = createCentralAgentToolRegistry(t);
    const matrix = agentToolCapabilityMatrix(handlers);
    const unavailable = Object.fromEntries(matrix
      .filter(unavailableCapability)
      .map((entry) => [entry.definition.id, entry.reason]));

    expect(unavailable).toMatchObject({
      'dictionary.explain-grammar': 'dedicated-analysis-required',
      'dictionary.analyze-sentence': 'dedicated-analysis-required',
      'flashcard.schedule-reviews': 'false-success-stub-removed',
    });
    expect(handlers['dictionary.explain-grammar']).toBeUndefined();
    expect(handlers['dictionary.analyze-sentence']).toBeUndefined();
    expect(handlers['flashcard.schedule-reviews']).toBeUndefined();
  });

  it('records the complete current unavailable surface instead of silently growing it', () => {
    const unavailable = agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
      .filter(unavailableCapability)
      .map((entry) => entry.definition.id)
      .sort();

    // Every remaining entry is unavailable by a decision, not by a missing
    // adapter: two need dedicated analysis, one had a false-success stub removed.
    expect(unavailable).toEqual([
      'dictionary.analyze-sentence',
      'dictionary.explain-grammar',
      'flashcard.schedule-reviews',
    ]);
    expect(new Set(agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
      .filter(unavailableCapability)
      .map((entry) => entry.reason)))
      .not.toContain('adapter-not-implemented');
  });

  it('deletes only the exact flashcard ids supplied to the inverse adapter', async () => {
    const created = addDeckCardsTracked([{
      word: '積ん読',
      reading: 'つんどく',
      meaning: 'unread books',
      source: 'import',
    }, {
      word: '本',
      reading: 'ほん',
      meaning: 'book',
      source: 'import',
    }]);
    const handler = createCentralAgentToolRegistry(t)['flashcard.delete-cards'];
    expect(handler).toBeTypeOf('function');

    await handler?.({ ids: [created[0].id] });

    expect(loadDeck().map((card) => card.id)).toEqual([created[1].id]);
    expect(() => handler?.({ ids: ['missing-card'] })).toThrow();
    expect(loadDeck().map((card) => card.id)).toEqual([created[1].id]);
  });

  it('returns authoritative ids for newly created decks and cards', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const deck = await handlers['flashcard.create-deck']?.({ name: 'Tracked deck' });
    expect(deck).toMatchObject({ createdName: 'Tracked deck' });

    const duplicate = await handlers['flashcard.create-deck']?.({ name: 'Tracked deck' });
    expect(duplicate).not.toHaveProperty('createdName');

    const cards = await handlers['flashcard.add-cards']?.({
      cards: [{ word: '記録', reading: 'きろく', meaning: 'record' }],
    });
    expect(cards).toMatchObject({ cards: 1 });
    expect(cards).toHaveProperty('createdIds');
    const createdIds = (cards as { createdIds: string[] }).createdIds;
    expect(createdIds).toHaveLength(1);
    expect(loadDeck().map((card) => card.id)).toContain(createdIds[0]);
  });
});
