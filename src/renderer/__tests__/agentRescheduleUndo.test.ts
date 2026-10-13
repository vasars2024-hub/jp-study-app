// @vitest-environment jsdom
/**
 * Undo for `calendar.reschedule-event`, end to end through the real registry, calendar store,
 * operation log and undo client: a move is put back exactly (dates, times, a series' end), a
 * split-off occurrence is folded back into its series, and an Undo refuses — changing
 * nothing — once the event has been moved again since.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ t: (key: string): string => key }));

const ENABLED = ['calendar.reschedule-event', 'calendar.schedule-session', 'calendar.delete-event'];
vi.mock('../localAgentProfilesStore', () => ({
  loadLocalAgentProfiles: () => ({
    version: 1,
    activeProfileId: 'p',
    profiles: [{
      id: 'p', name: 'P', description: '', role: 'custom', preferredModelFileName: '', permission: 'limited-actions',
      enabledOperations: ENABLED, responseLength: 'brief', explanationDepth: 'simple', language: 'english',
      teachingStyle: 'tutor', correctionStyle: 'gentle', enabled: true, builtIn: false,
    }],
  }),
}));
vi.mock('../localAgentSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../localAgentSettingsStore')>()),
  loadLocalAgentSettings: () => ({ permission: 'limited-actions' }),
}));

import { createCentralAgentToolRegistry } from '../agentToolRegistry';
import { performAgentUndo } from '../agentUndoClient';
import { loadEvents, updateEvent } from '../calendar';
import { AGENT_OPERATION_RECORD_CONTRACTS } from '../../shared/agentExecutionRecord';
import { AGENT_OPERATION_LOG_EMPTY, agentOperationLogAppend, resolveAgentOperationInverse, type AgentOperationLog } from '../../shared/agentOperationLog';
import { agentUndoActionForCall } from '../../shared/agentUndo';

const t = (key: string): string => key;

function logMove(result: unknown, entityId: string): AgentOperationLog {
  const contract = AGENT_OPERATION_RECORD_CONTRACTS['calendar.reschedule-event']!;
  const inverseArguments = contract.inverseArguments?.(result) ?? undefined;
  return agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
    operation: 'calendar.reschedule-event',
    claim: contract.claim,
    entityType: contract.entityType,
    entityIds: [entityId],
    ...(inverseArguments ? { inverseArguments } : {}),
    callId: 'move-call',
  }, 100);
}

beforeEach(() => {
  localStorage.clear();
  (window as unknown as { api: Record<string, unknown> }).api = { listMedia: async () => [] };
});

describe('Undo a calendar move', () => {
  it('puts a moved one-off event back exactly, times included', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const created = await handlers['calendar.schedule-session']!({ title: 'Kanji', date: '2026-10-09', startTime: '19:00' }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: created.id, date: '2026-10-12', startTime: '20:00', endTime: '20:45' });
    const log = logMove(moved, created.id);
    // Offered as an Undo, and resolvable to the same operation aimed back.
    expect(agentUndoActionForCall(log, 'move-call')).toMatchObject({ effect: { type: 'undo' } });
    expect(resolveAgentOperationInverse(log, 0)).toMatchObject({ ok: true, inverse: { operation: 'calendar.reschedule-event' } });

    const result = await performAgentUndo(log, 'move-call|0', t);
    expect(result).toMatchObject({ ok: true, operation: { claim: 'updated', invertsSequence: 0 } });
    const back = loadEvents().find((e) => e.id === created.id)!;
    expect(back).toMatchObject({ date: '2026-10-09', startTime: '19:00', allDay: false });
    // The move had added an end time; restoring the placement takes it away again.
    expect(back.endTime).toBeUndefined();

    // Recorded as undone: a second Undo is refused, not re-run.
    const after = agentOperationLogAppend(log, result.ok ? result.operation : (null as never), 200);
    expect(resolveAgentOperationInverse(after, 0)).toEqual({ ok: false, code: 'already-undone' });
  });

  it('moves a whole series back, its end date with it', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const series = await handlers['calendar.schedule-session']!({
      title: 'Daily', date: '2026-10-05', startTime: '07:00', recurrence: 'daily', recurrenceEndDate: '2026-10-09',
    }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: series.id, date: '2026-10-08' });
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-08', recurrenceEndDate: '2026-10-12' });
    expect(await performAgentUndo(logMove(moved, series.id), 'move-call|0', t)).toMatchObject({ ok: true });
    expect(loadEvents().find((e) => e.id === series.id)).toMatchObject({ date: '2026-10-05', recurrenceEndDate: '2026-10-09' });
  });

  it('folds a split-off occurrence back into its series', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const series = await handlers['calendar.schedule-session']!({
      title: 'Daily', date: '2026-10-05', startTime: '07:00', recurrence: 'daily', recurrenceEndDate: '2026-10-09',
    }) as { id: string };
    const single = await handlers['calendar.reschedule-event']!({
      id: series.id, occurrenceDate: '2026-10-07', date: '2026-10-11', onlyThisOccurrence: true,
    }) as { id: string };
    expect(loadEvents()).toHaveLength(2);
    expect(await performAgentUndo(logMove(single, single.id), 'move-call|0', t)).toMatchObject({ ok: true });
    const events = loadEvents();
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe(series.id);
    expect(events[0].excludedDates ?? []).toEqual([]);
  });

  it('refuses, and changes nothing, when the event was moved again since', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const created = await handlers['calendar.schedule-session']!({ title: 'Kanji', date: '2026-10-09', startTime: '19:00' }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: created.id, date: '2026-10-12' });
    // The user drags it somewhere else in the Calendar — nothing the log could see.
    updateEvent(created.id, { date: '2026-10-20' });
    // A refusal with its reason ("changed since"), not a generic failure.
    expect(await performAgentUndo(logMove(moved, created.id), 'move-call|0', t)).toEqual({ ok: false, code: 'superseded' });
    expect(loadEvents()[0].date).toBe('2026-10-20');
  });

  it('puts a multi-day event back with its length, not just its first day', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const trip = await handlers['calendar.schedule-session']!({
      title: 'Study camp', date: '2026-10-09', endDate: '2026-10-11', startTime: '18:00', endTime: '10:00',
    }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: trip.id, date: '2026-10-16' });
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-16', endDate: '2026-10-18' });

    expect(await performAgentUndo(logMove(moved, trip.id), 'move-call|0', t)).toMatchObject({ ok: true });
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-09', endDate: '2026-10-11', startTime: '18:00', endTime: '10:00' });
  });

  it('puts the weekdays of a multi-weekday series back too', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    // 2026-10-06 is a Tuesday: every Tue and Thu.
    const series = await handlers['calendar.schedule-session']!({
      title: 'Grammar', date: '2026-10-06', startTime: '19:00', recurrence: 'weekly', recurrenceWeekdays: [2, 4],
    }) as { id: string };
    const moved = await handlers['calendar.reschedule-event']!({ id: series.id, date: '2026-10-07' });
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-07', recurrenceWeekdays: [3, 5] });

    expect(await performAgentUndo(logMove(moved, series.id), 'move-call|0', t)).toMatchObject({ ok: true });
    expect(loadEvents()[0]).toMatchObject({ date: '2026-10-06', recurrenceWeekdays: [2, 4] });
  });
});
