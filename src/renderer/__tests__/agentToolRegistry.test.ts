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

  it('holds calendar writes to the Calendar form rules instead of storing broken events', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const schedule = handlers['calendar.schedule-session']!;
    // Shaped like a date and not one; an unreadable time; an end before the start.
    expect(() => schedule({ title: 'x', date: '2026-02-31' })).toThrow('blanc.agent.error.calendarDate');
    expect(() => schedule({ title: 'x', date: '2026-10-09', startTime: '7pm' })).toThrow('planner.agent.error.time');
    expect(() => schedule({ title: 'x', date: '2026-10-09', startTime: '19:00', endTime: '18:00' }))
      .toThrow('planner.agent.error.endBeforeStart');
    expect(() => schedule({ title: 'x', date: '2026-10-09', recurrence: 'weekly', recurrenceEndDate: '2026-10-01' }))
      .toThrow('planner.agent.error.repeatEnd');
    // A loose `9:00` is padded so the agenda sorts it before `10:00`.
    const padded = await schedule({ title: 'Read', date: '2026-10-09', startTime: '9:00', endTime: '9:45' });
    expect(padded).toMatchObject({ startTime: '09:00', endTime: '09:45', allDay: false });
    // No start time means an all-day entry, as the argument hint promises.
    const allDay = await handlers['calendar.create-reminder']!({ title: 'JLPT fee', date: '2026-10-09' });
    expect(allDay).toMatchObject({ allDay: true, category: 'reminder' });
    // Repeats are planned, not dropped.
    const weekly = await schedule({
      title: 'Grammar', date: '2026-10-05', startTime: '19:00', recurrence: 'custom', recurrenceInterval: 3, category: 'exam',
    });
    expect(weekly).toMatchObject({ recurrence: 'custom', recurrenceInterval: 3, category: 'exam' });
  });

  it('lists occurrences in a window, recurring events expanded, and says when it cut the list', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    await handlers['calendar.schedule-session']!({ title: 'Daily', date: '2026-10-01', startTime: '07:00', recurrence: 'daily' });
    const listed = await handlers['calendar.list']!({ from: '2026-10-01', to: '2026-10-07' }) as {
      occurrences: Array<{ date: string }>;
      truncated?: number;
    };
    expect(listed.occurrences.map((o) => o.date)).toEqual([
      '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06', '2026-10-07',
    ]);
    expect(listed.truncated).toBeUndefined();
    // A daily event over a year: 365 occurrences, listed up to the cap and the rest counted.
    const long = await handlers['calendar.list']!({ from: '2026-10-01', to: '2027-09-30' }) as {
      occurrences: unknown[];
      truncated?: number;
    };
    expect(long.occurrences.length + (long.truncated ?? 0)).toBe(365);
    expect(long.truncated).toBeGreaterThan(0);
    expect(() => handlers['calendar.list']!({ from: '2026-10-07', to: '2026-10-01' })).toThrow();
  });

  it('moves events, and refuses to delete or modify what does not exist', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const created = await handlers['calendar.schedule-session']!({
      title: 'Review', date: '2026-10-09', startTime: '19:00', endTime: '19:30',
    }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: created.id, date: '2026-10-11', startTime: '20:00', endTime: '20:30' });
    expect(moved).toMatchObject({ event: { date: '2026-10-11', startTime: '20:00', endTime: '20:30' } });
    expect(() => handlers['calendar.reschedule-event']!({ id: created.id, date: '2026-10-11', endTime: '19:00' }))
      .toThrow('planner.agent.error.endBeforeStart');
    expect(() => handlers['calendar.reschedule-event']!({ id: 'nope', date: '2026-10-11' }))
      .toThrow('planner.agent.error.eventNotFound');
    expect(() => handlers['calendar.delete-event']!({ id: 'nope' })).toThrow('planner.agent.error.eventNotFound');
    expect(await handlers['calendar.delete-event']!({ id: created.id })).toMatchObject({ removed: created.id });

    // One date of a repeating session moves on its own; the series keeps the rest.
    const series = await handlers['calendar.schedule-session']!({
      title: 'Daily', date: '2026-10-05', startTime: '07:00', recurrence: 'daily', recurrenceEndDate: '2026-10-09',
    }) as { id: string };
    const single = await handlers['calendar.reschedule-event']!({
      id: series.id, occurrenceDate: '2026-10-07', date: '2026-10-11', onlyThisOccurrence: true,
    }) as { id: string; seriesId: string };
    expect(single.seriesId).toBe(series.id);
    const listed = await handlers['calendar.list']!({ from: '2026-10-05', to: '2026-10-11' }) as { occurrences: Array<{ id: string; date: string }> };
    expect(listed.occurrences.filter((o) => o.id === series.id).map((o) => o.date))
      .toEqual(['2026-10-05', '2026-10-06', '2026-10-08', '2026-10-09']);
    expect(listed.occurrences.find((o) => o.id === single.id)?.date).toBe('2026-10-11');

    const [card] = addDeckCardsTracked([{ word: '猫', reading: 'ねこ', meaning: 'cat', source: 'import' }]);
    expect(() => handlers['flashcard.modify-cards']!({ id: 'missing', patch: { meaning: 'x' } }))
      .toThrow('blanc.agent.error.cardNotFound');
    expect(() => handlers['flashcard.modify-cards']!({ id: card.id, patch: { nothing: 1 } }))
      .toThrow('planner.agent.error.emptyPatch');
    expect(await handlers['flashcard.modify-cards']!({ id: card.id, patch: { meaning: 'a cat' } }))
      .toMatchObject({ modified: card.id, fields: ['meaning'] });
    expect(loadDeck().find((c) => c.id === card.id)?.meaning).toBe('a cat');
  });

  it('looks words up in the study language and says plainly when there is no entry', async () => {
    const lookupTerm = vi.fn(async (query: string) => (
      query === '猫' ? { query, entries: [{ term: '猫', reading: 'ねこ', senses: [] }] } : { query, entries: [] }
    ));
    const previous = (window as unknown as { api?: unknown }).api;
    (window as unknown as { api: unknown }).api = { ...(previous as object), lookupTerm };
    localStorage.setItem('jp-study-lang', 'ja');
    try {
      const handlers = createCentralAgentToolRegistry(t);
      expect(await handlers['dictionary.lookup']!({ term: '猫', limit: 50 })).toMatchObject({ term: '猫', found: true });
      expect(lookupTerm).toHaveBeenLastCalledWith('猫', 10, expect.stringMatching(/^(ja|zh|ru)$/));
      expect(await handlers['dictionary.lookup']!({ term: 'zzz' })).toMatchObject({ found: false });
      expect(lookupTerm).toHaveBeenLastCalledWith('zzz', 5, expect.any(String));
    } finally {
      (window as unknown as { api?: unknown }).api = previous;
    }
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
