// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({
  t: (key: string): string => key,
}));
import { AGENT_TOOL_OPERATIONS } from '../../shared/localAgent';
import {
  agentCalendarEventFingerprint,
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
      .toHaveLength(AGENT_TOOL_OPERATIONS.length);
  });

  it('installs review scheduling and the grammar analysis', () => {
    const handlers = createCentralAgentToolRegistry(t);
    // A real adapter now (`agentScheduleReviews`), with its own Undo; see agentScheduleReviews.test.ts.
    expect(handlers['flashcard.schedule-reviews']).toBeTypeOf('function');
    // The study coach answers these from the grammar library (`studyCoachAgentHandlers.ts`).
    expect(handlers['dictionary.explain-grammar']).toBeTypeOf('function');
    expect(handlers['dictionary.analyze-sentence']).toBeTypeOf('function');
  });

  it('records the complete current unavailable surface instead of silently growing it', () => {
    const unavailable = agentToolCapabilityMatrix(createCentralAgentToolRegistry(t))
      .filter(unavailableCapability)
      .map((entry) => entry.definition.id)
      .sort();

    // Nothing is declared without an adapter any more: review scheduling, the last
    // entry, has one.
    expect(unavailable).toEqual([]);
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

describe('calendar tool: every repeat the Calendar offers, validated', () => {
  const schedule = () => createCentralAgentToolRegistry(t)['calendar.schedule-session']!;
  const stored = () => JSON.parse(localStorage.getItem('jp-calendar-events') ?? '[]') as Array<Record<string, unknown>>;

  it('makes a yearly event, every N years, and the Nth weekday of the month', async () => {
    expect(await schedule()({ title: 'Birthday', date: '2026-10-12', recurrence: 'yearly' }))
      .toMatchObject({ recurrence: 'yearly' });
    expect(await schedule()({ title: 'Olympics', date: '2028-07-14', recurrence: 'yearly', recurrenceInterval: 4 }))
      .toMatchObject({ recurrence: 'yearly', recurrenceInterval: 4 });
    // 2026-10-13 is the 2nd Tuesday of October; 2026-10-27 the last.
    expect(await schedule()({ title: 'Club', date: '2026-10-13', recurrence: 'monthly', recurrenceNth: '2' }))
      .toMatchObject({ recurrence: 'monthly', recurrenceNth: 2 });
    expect(await schedule()({ title: 'Review', date: '2026-10-27', recurrence: 'monthly', recurrenceNth: -1 }))
      .toMatchObject({ recurrenceNth: -1 });
    expect(await schedule()({ title: 'Every other month', date: '2026-10-05', recurrence: 'monthly', recurrenceInterval: 2 }))
      .toMatchObject({ recurrence: 'monthly', recurrenceInterval: 2 });
  });

  it('makes one weekly series on several weekdays, by number or by name', async () => {
    // 2026-10-06 is a Tuesday.
    expect(await schedule()({
      title: 'Grammar', date: '2026-10-06', startTime: '19:00', recurrence: 'weekly', recurrenceWeekdays: [4, 2],
    })).toMatchObject({ recurrence: 'weekly', recurrenceWeekdays: [2, 4] });
    expect(await schedule()({
      title: 'Kanji', date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: ['tue', 'Friday'], recurrenceInterval: 2,
    })).toMatchObject({ recurrenceWeekdays: [2, 5], recurrenceInterval: 2 });
    // The series lands on the days asked, and only those.
    const listed = await createCentralAgentToolRegistry(t)['calendar.list']!({ from: '2026-10-05', to: '2026-10-11' }) as {
      occurrences: Array<{ title: string; date: string; recurrenceWeekdays?: number[] }>;
    };
    expect(listed.occurrences.filter((o) => o.title === 'Grammar').map((o) => o.date)).toEqual(['2026-10-06', '2026-10-08']);
    expect(listed.occurrences.find((o) => o.title === 'Grammar')?.recurrenceWeekdays).toEqual([2, 4]);
  });

  it('makes a multi-day event, where a timed end earlier in the day is fine', async () => {
    const camp = await schedule()({ title: 'Study camp', date: '2026-10-09', endDate: '2026-10-11', startTime: '18:00', endTime: '10:00' });
    expect(camp).toMatchObject({ date: '2026-10-09', endDate: '2026-10-11', startTime: '18:00', endTime: '10:00' });
    // Over several days without an end time: that day's end, as the Calendar's editor stores it.
    expect(await schedule()({ title: 'Trip', date: '2026-10-09', endDate: '2026-10-10', startTime: '09:00' }))
      .toMatchObject({ endTime: '23:59' });
    // The same day is not multi-day.
    expect(await schedule()({ title: 'Read', date: '2026-10-09', endDate: '2026-10-09' })).not.toHaveProperty('endDate');
    const listed = await createCentralAgentToolRegistry(t)['calendar.list']!({ from: '2026-10-09', to: '2026-10-09' }) as {
      occurrences: Array<{ title: string; endDate?: string }>;
    };
    expect(listed.occurrences.find((o) => o.title === 'Study camp')?.endDate).toBe('2026-10-11');
  });

  it('refuses a rule it cannot store instead of quietly making a one-off', () => {
    const before = stored().length;
    const refuse = (extra: Record<string, unknown>, key: string) => {
      expect(() => schedule()({ title: 'x', date: '2026-10-06', ...extra })).toThrow(key);
    };
    refuse({ recurrence: 'fortnightly' }, 'planner.agent.error.repeat');
    refuse({ recurrence: 'custom', recurrenceInterval: 0 }, 'planner.agent.error.repeatInterval');
    refuse({ recurrence: 'custom', recurrenceInterval: 400 }, 'planner.agent.error.repeatInterval');
    refuse({ recurrence: 'weekly', recurrenceInterval: 1.5 }, 'planner.agent.error.repeatInterval');
    refuse({ recurrence: 'daily', recurrenceInterval: 3 }, 'planner.agent.error.repeatInterval');
    // Weekdays: weekly only, real days, and the first date must be one of them (a Tuesday here).
    refuse({ recurrence: 'monthly', recurrenceWeekdays: [2] }, 'planner.agent.error.repeatWeekdays');
    refuse({ recurrence: 'weekly', recurrenceWeekdays: [1, 3] }, 'planner.agent.error.repeatWeekdays');
    refuse({ recurrence: 'weekly', recurrenceWeekdays: [2, 7] }, 'planner.agent.error.repeatWeekdays');
    refuse({ recurrence: 'weekly', recurrenceWeekdays: 'tue' }, 'planner.agent.error.repeatWeekdays');
    refuse({ recurrence: 'weekly', recurrenceWeekdays: ['tuesdays'] }, 'planner.agent.error.repeatWeekdays');
    // Nth: monthly or yearly only, and the date must be that weekday of its month (the 6th is the 1st Tuesday).
    refuse({ recurrence: 'monthly', recurrenceNth: 2 }, 'planner.agent.error.repeatNth');
    refuse({ recurrence: 'monthly', recurrenceNth: -1 }, 'planner.agent.error.repeatNth');
    refuse({ recurrence: 'weekly', recurrenceNth: 1 }, 'planner.agent.error.repeatNth');
    refuse({ recurrence: 'yearly', recurrenceNth: 6 }, 'planner.agent.error.repeatNth');
    // Multi-day: a real later date, at most a year on.
    refuse({ endDate: '2026-10-05' }, 'planner.agent.error.endDate');
    refuse({ endDate: '2026-02-31' }, 'planner.agent.error.endDate');
    refuse({ endDate: '2028-10-06' }, 'planner.agent.error.endDate');
    expect(stored()).toHaveLength(before);
  });

  it('stores only what the rule uses, like the Calendar editor', async () => {
    await schedule()({ title: 'Plain weekly', date: '2026-10-06', recurrence: 'weekly', recurrenceWeekdays: [2], recurrenceInterval: 1 });
    const [event] = stored();
    expect(event).toMatchObject({ recurrence: 'weekly' });
    expect(event).not.toHaveProperty('recurrenceWeekdays');
    expect(event).not.toHaveProperty('recurrenceInterval');
  });

  it('refuses to delete, through Undo, an event edited since the digest was taken', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const made = await handlers['calendar.schedule-session']!({ title: 'Read', date: '2026-10-09' }) as { id: string };
    const digest = agentCalendarEventFingerprint(stored()[0] as never);
    localStorage.setItem('jp-calendar-events', JSON.stringify([{ ...stored()[0], description: 'bring the book' }]));

    expect(() => handlers['calendar.delete-event']!({ id: made.id, expect: digest })).toThrow('planner.agent.error.editedSince');
    expect(stored()).toHaveLength(1);
    // The digest is of the event, not of one serialization of it: key order does not matter.
    const reordered = Object.fromEntries(Object.entries(stored()[0]).reverse());
    expect(agentCalendarEventFingerprint(reordered as never)).toBe(agentCalendarEventFingerprint(stored()[0] as never));
    // Without `expect` (the model's own delete) nothing changes.
    expect(await handlers['calendar.delete-event']!({ id: made.id })).toMatchObject({ removed: made.id });
  });
});
