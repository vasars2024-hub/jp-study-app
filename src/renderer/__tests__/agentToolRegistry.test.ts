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
      .toHaveLength(AGENT_TOOL_OPERATIONS.length - 1);
  });

  it('does not advertise the queue stub as scheduling, and installs the grammar analysis', () => {
    const handlers = createCentralAgentToolRegistry(t);
    const matrix = agentToolCapabilityMatrix(handlers);
    const unavailable = Object.fromEntries(matrix
      .filter(unavailableCapability)
      .map((entry) => [entry.definition.id, entry.reason]));

    expect(unavailable).toMatchObject({
      'flashcard.schedule-reviews': 'false-success-stub-removed',
    });
    expect(handlers['flashcard.schedule-reviews']).toBeUndefined();
    // The study coach answers these from the grammar library (`studyCoachAgentHandlers.ts`).
    expect(handlers['dictionary.explain-grammar']).toBeTypeOf('function');
    expect(handlers['dictionary.analyze-sentence']).toBeTypeOf('function');
  });

  it('records the complete current unavailable surface instead of silently growing it', () => {
    const unavailable = agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
      .filter(unavailableCapability)
      .map((entry) => entry.definition.id)
      .sort();

    // The one remaining entry is unavailable by a decision, not by a missing
    // adapter: its false-success stub was removed.
    expect(unavailable).toEqual([
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

  it('creates reminders that actually notify, honouring a requested offset', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const plain = await handlers['calendar.create-reminder']?.({ title: 'Kanji', date: '2026-10-09', startTime: '09:00' });
    expect(plain).toMatchObject({ category: 'reminder', reminder: 'at' });
    const early = await handlers['calendar.create-reminder']?.({ title: 'JLPT', date: '2026-10-09', reminder: '1h' });
    expect(early).toMatchObject({ reminder: '1h' });
    const bogus = await handlers['calendar.create-reminder']?.({ title: 'x', date: '2026-10-09', reminder: '3 weeks' });
    expect(bogus).toMatchObject({ reminder: 'at' });
    const session = await handlers['calendar.schedule-session']?.({ title: 'Read', date: '2026-10-09' });
    expect(session).toMatchObject({ reminder: 'none' });
  });

  it('answers read-only stats and known-word questions', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const summary = await handlers['study.stats-summary']?.({});
    expect(summary).toMatchObject({ streak: expect.any(Number), knownWords: { known: expect.any(Number) } });
    expect(summary).toHaveProperty('cardsDue');
    const { setLevel } = await import('../knownWords');
    setLevel('猫', 3);
    const word = await handlers['study.known-words']?.({ word: '猫' });
    expect(word).toMatchObject({ word: '猫', level: 3, counts: { known: 1 } });
    expect(await handlers['study.known-words']?.({})).not.toHaveProperty('word');
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
