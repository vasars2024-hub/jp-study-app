// @vitest-environment jsdom
/**
 * Scorecard bug 9, end to end through the real registry, calendar store, record contracts,
 * operation log and undo client, under the REAL built-in Study Tutor profile at its own
 * permission level (limited actions):
 *
 *  - Undo of the sessions the Agent scheduled removes them. It used to be refused every
 *    time: the Tutor does not enable `calendar.delete-event`, which needs full automation.
 *  - Undo still refuses, deleting nothing, once the user has edited one of those events.
 *  - Undo still refuses once the user has narrowed the profile so the write is not allowed.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../i18n', () => ({ t: (key: string): string => key }));

let profileStore: unknown;
vi.mock('../localAgentProfilesStore', () => ({
  loadLocalAgentProfiles: () => profileStore,
}));
vi.mock('../localAgentSettingsStore', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../localAgentSettingsStore')>()),
  loadLocalAgentSettings: () => ({ permission: 'limited-actions' }),
}));

import { createCentralAgentToolRegistry } from '../agentToolRegistry';
import { performAgentUndo, withAgentUndoBaseline } from '../agentUndoClient';
import { loadEvents, updateEvent } from '../calendar';
import { AGENT_OPERATION_RECORD_CONTRACTS } from '../../shared/agentExecutionRecord';
import { AGENT_OPERATION_LOG_EMPTY, agentOperationLogAppend, type AgentOperationLog } from '../../shared/agentOperationLog';
import { EMPTY_AGENT_PROFILE_STORE, setAgentProfileOperations } from '../../shared/localAgentProfiles';
import type { AgentToolOperationId } from '../../shared/localAgent';

const t = (key: string): string => key;

/** What the plan queue and the shell do after a completed step: contract → baseline → log. */
function record(operation: AgentToolOperationId, result: unknown): AgentOperationLog {
  const contract = AGENT_OPERATION_RECORD_CONTRACTS[operation]!;
  const draft = withAgentUndoBaseline({
    operation,
    claim: contract.claim,
    entityType: contract.entityType,
    entityIds: contract.entityIds(result),
    callId: 'plan-call',
  });
  return agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, draft, 100);
}

beforeEach(() => {
  localStorage.clear();
  profileStore = EMPTY_AGENT_PROFILE_STORE;
  (window as unknown as { api: Record<string, unknown> }).api = { listMedia: async () => [] };
});

describe('Undo a calendar write under the Study Tutor', () => {
  it('removes the week of sessions the Agent scheduled', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const result = await handlers['calendar.schedule-sessions']!({
      sessions: [
        { title: 'Kanji', date: '2026-10-12', startTime: '19:00', endTime: '19:30' },
        { title: 'Grammar', date: '2026-10-13', startTime: '19:00', endTime: '19:30' },
      ],
    });
    expect(loadEvents()).toHaveLength(2);

    const undone = await performAgentUndo(record('calendar.schedule-sessions', result), 'plan-call|0', t);
    expect(undone).toMatchObject({ ok: true, operation: { operation: 'calendar.delete-event', claim: 'deleted' } });
    expect(loadEvents()).toEqual([]);
  });

  it('removes a yearly reminder it made (the new repeat options round-trip through Undo)', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    // 2026-11-10 is the 2nd Tuesday of November.
    const made = await handlers['calendar.create-reminder']!({
      title: 'JLPT application', date: '2026-11-10', recurrence: 'yearly', recurrenceNth: 2,
    });
    expect(loadEvents()[0]).toMatchObject({ recurrence: 'yearly', recurrenceNth: 2 });
    expect(await performAgentUndo(record('calendar.create-reminder', made), 'plan-call|0', t)).toMatchObject({ ok: true });
    expect(loadEvents()).toEqual([]);
  });

  it('refuses, deleting none of them, once the user edited one; allows it again once the edit is undone', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const result = await handlers['calendar.schedule-sessions']!({
      sessions: [
        { title: 'Kanji', date: '2026-10-12', startTime: '19:00' },
        { title: 'Grammar', date: '2026-10-13', startTime: '19:00' },
      ],
    }) as { createdIds: string[] };
    const log = record('calendar.schedule-sessions', result);
    // The user renames one session in the Calendar: nothing the operation log can see.
    const [first] = result.createdIds;
    updateEvent(first, { title: 'Kanji with Aiko' });

    expect(await performAgentUndo(log, 'plan-call|0', t)).toEqual({ ok: false, code: 'superseded' });
    expect(loadEvents()).toHaveLength(2);
    expect(loadEvents().find((event) => event.id === first)?.title).toBe('Kanji with Aiko');

    updateEvent(first, { title: 'Kanji' });
    expect(await performAgentUndo(log, 'plan-call|0', t)).toMatchObject({ ok: true });
    expect(loadEvents()).toEqual([]);
  });

  it('refuses once the user switched the write off for the profile', async () => {
    const handlers = createCentralAgentToolRegistry(t);
    const made = await handlers['calendar.schedule-session']!({ title: 'Read', date: '2026-10-12' });
    const log = record('calendar.schedule-session', made);
    const tutor = EMPTY_AGENT_PROFILE_STORE.profiles[0];
    profileStore = {
      ...EMPTY_AGENT_PROFILE_STORE,
      profiles: [setAgentProfileOperations(tutor, tutor.enabledOperations.filter((op) => op !== 'calendar.schedule-session'))],
    };

    expect(await performAgentUndo(log, 'plan-call|0', t)).toEqual({ ok: false, code: 'operation-denied' });
    expect(loadEvents()).toHaveLength(1);
  });
});
