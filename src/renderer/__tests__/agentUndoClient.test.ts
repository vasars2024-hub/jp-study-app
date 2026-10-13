// @vitest-environment jsdom
// jsdom because the live-id read now reaches `window.api.listMedia` for the
// media entity type; the other three sources are local stores.
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
} from '../../shared/agentOperationLog';

let deckIds: string[] = ['card-1'];
let folders: string[] = ['Mined'];
let events: string[] = ['event-1'];
let mediaIds: string[] = ['media-1'];
let deleteCalls: unknown[][] = [];
let deleteFailure = false;
/** The calendar inverse refuses the way the real adapter does when the event changed since. */
let calendarChangedSince = false;
let enabledOperations: string[] = [
  'flashcard.delete-cards',
  'flashcard.delete-deck',
  'calendar.delete-event',
  'media.delete-item',
];
let permission = 'full-automation';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => deckIds.map((id) => ({ id })),
  loadDeckFolders: () => folders,
}));

vi.mock('../calendar', () => ({
  loadEvents: () => events.map((id) => ({ id })),
}));

vi.mock('../localAgentProfilesStore', () => ({
  loadLocalAgentProfiles: () => ({
    version: 1,
    activeProfileId: 'test-profile',
    profiles: [{
      id: 'test-profile',
      name: 'Test',
      description: 'Test profile',
      role: 'custom',
      preferredModelFileName: '',
      permission,
      enabledOperations,
      responseLength: 'brief',
      explanationDepth: 'simple',
      language: 'english',
      teachingStyle: 'tutor',
      correctionStyle: 'gentle',
      enabled: true,
      builtIn: false,
    }],
  }),
}));

vi.mock('../localAgentSettingsStore', () => ({
  loadLocalAgentSettings: () => ({ permission }),
}));

vi.mock('../agentToolRegistry', () => ({
  AGENT_UNDO_CHANGED_SINCE: 'changed-since',
  agentCalendarEventFingerprint: (event: { id: string }) => `fp:${event.id}`,
  createCentralAgentToolRegistry: () => ({
    'flashcard.delete-cards': (arguments_: { ids?: unknown }) => {
      deleteCalls.push([arguments_]);
      if (deleteFailure) throw new Error('delete failed');
      const ids = new Set(Array.isArray(arguments_.ids) ? arguments_.ids : []);
      deckIds = deckIds.filter((id) => !ids.has(id));
      return { removed: ids.size };
    },
    // Each of these takes its OWN argument shape, which is the point.
    'flashcard.delete-deck': (arguments_: { name?: unknown }) => {
      deleteCalls.push([arguments_]);
      folders = folders.filter((name) => name !== arguments_.name);
      return { folders };
    },
    'calendar.delete-event': (arguments_: { id?: unknown }) => {
      deleteCalls.push([arguments_]);
      if (calendarChangedSince) throw Object.assign(new Error('edited since'), { code: 'changed-since' });
      events = events.filter((id) => id !== arguments_.id);
      return { events: events.length };
    },
    'media.delete-item': (arguments_: { id?: unknown }) => {
      deleteCalls.push([arguments_]);
      mediaIds = mediaIds.filter((id) => id !== arguments_.id);
      return mediaIds.map((id) => ({ id }));
    },
  }),
  availableAgentToolOperationIds: () => [
    'flashcard.delete-cards',
    'flashcard.delete-deck',
    'calendar.delete-event',
    'media.delete-item',
    // The forward writes, which now authorize the Undo of their own effect.
    'calendar.schedule-session',
    'calendar.schedule-sessions',
    'calendar.create-reminder',
    'flashcard.add-cards',
  ],
}));

import { performAgentUndo, readAgentUndoContext, withAgentUndoBaseline } from '../agentUndoClient';

const t = (key: string): string => key;
const log = () => agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
  operation: 'flashcard.add-cards',
  claim: 'created',
  entityType: 'flashcard',
  entityIds: ['card-1'],
  callId: 'save-call',
}, 100);

const logFor = (
  operation: string,
  entityType: string,
  entityIds: string[],
) => agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
  operation,
  claim: 'created',
  entityType,
  entityIds,
  callId: 'save-call',
} as never, 100);

beforeEach(() => {
  deckIds = ['card-1'];
  folders = ['Mined'];
  events = ['event-1'];
  mediaIds = ['media-1'];
  deleteCalls = [];
  deleteFailure = false;
  calendarChangedSince = false;
  enabledOperations = [
    'flashcard.delete-cards',
    'flashcard.delete-deck',
    'calendar.delete-event',
    'media.delete-item',
  ];
  permission = 'full-automation';
  (window as unknown as { api: Record<string, unknown> }).api = {
    listMedia: async () => mediaIds.map((id) => ({ id })),
  };
});

describe('performAgentUndo', () => {
  it('runs the installed inverse and returns an exact inverse log draft', async () => {
    expect(await performAgentUndo(log(), 'save-call|0', t)).toEqual({
      ok: true,
      operation: {
        operation: 'flashcard.delete-cards',
        claim: 'deleted',
        entityType: 'flashcard',
        entityIds: ['card-1'],
        // An undo's one real input is the step it reverses, which is what makes
        // the pair readable in the terminal.
        arguments: { inverts: 0 },
        callId: 'undo|save-call|0',
        invertsSequence: 0,
      },
    });
    expect(deleteCalls).toEqual([[{ ids: ['card-1'] }]]);
    expect(deckIds).toEqual([]);
  });

  it('rechecks the profile immediately before execution', async () => {
    enabledOperations = [];
    expect(await performAgentUndo(log(), 'save-call|0', t))
      .toEqual({ ok: false, code: 'operation-denied' });
    expect(deleteCalls).toHaveLength(0);
  });

  it('refuses when the exact entity no longer exists', async () => {
    deckIds = [];
    expect(await performAgentUndo(log(), 'save-call|0', t))
      .toEqual({ ok: false, code: 'entity-not-found' });
    expect(deleteCalls).toHaveLength(0);
  });

  it('returns a typed failure and no log draft when the inverse throws', async () => {
    deleteFailure = true;
    expect(await performAgentUndo(log(), 'save-call|0', t))
      .toEqual({ ok: false, code: 'undo-failed' });
  });
});

describe('performAgentUndo across entity types', () => {
  it('undoes a created deck with a `name`, not an `ids` array', async () => {
    const result = await performAgentUndo(
      logFor('flashcard.create-deck', 'flashcard-deck', ['Mined']),
      'save-call|0',
      t,
    );

    expect(result).toMatchObject({ ok: true });
    expect(deleteCalls).toEqual([[{ name: 'Mined' }]]);
    expect(folders).toEqual([]);
  });

  it('undoes a scheduled session with an `id`', async () => {
    const result = await performAgentUndo(
      logFor('calendar.schedule-session', 'calendar-event', ['event-1']),
      'save-call|0',
      t,
    );

    expect(result).toMatchObject({ ok: true });
    expect(deleteCalls).toEqual([[{ id: 'event-1' }]]);
    expect(events).toEqual([]);
  });

  it('undoes an added media item, whose live ids come from main', async () => {
    const result = await performAgentUndo(
      logFor('media.add-item', 'media-item', ['media-1']),
      'save-call|0',
      t,
    );

    expect(result).toMatchObject({ ok: true });
    expect(deleteCalls).toEqual([[{ id: 'media-1' }]]);
    expect(mediaIds).toEqual([]);
  });

  it('issues one call per id for a single-entity inverse', async () => {
    mediaIds = ['media-1', 'media-2'];
    await performAgentUndo(
      logFor('media.add-item', 'media-item', ['media-1', 'media-2']),
      'save-call|0',
      t,
    );

    expect(deleteCalls).toEqual([[{ id: 'media-1' }], [{ id: 'media-2' }]]);
    expect(mediaIds).toEqual([]);
  });

  it('checks live ids of the entry\'s OWN type, not the deck', async () => {
    // The deck holds no folder called `Gone`, and the folder list holds no card
    // id — a flat live-id set would refuse both of these for the wrong reason.
    folders = [];
    const missing = await performAgentUndo(
      logFor('flashcard.create-deck', 'flashcard-deck', ['Gone']),
      'save-call|0',
      t,
    );
    expect(missing).toEqual({ ok: false, code: 'entity-not-found' });
    expect(deleteCalls).toEqual([]);

    folders = ['Mined'];
    const present = await performAgentUndo(
      logFor('flashcard.create-deck', 'flashcard-deck', ['Mined']),
      'save-call|0',
      t,
    );
    expect(present).toMatchObject({ ok: true });
  });

  it('still undoes local entity types when the media channel is missing', async () => {
    (window as unknown as { api: Record<string, unknown> }).api = {};

    const result = await performAgentUndo(
      logFor('calendar.create-reminder', 'calendar-event', ['event-1']),
      'save-call|0',
      t,
    );

    expect(result).toMatchObject({ ok: true });
    expect(events).toEqual([]);
  });
});

describe("Undo of the Agent's own write (scorecard bug 9)", () => {
  // The built-in Tutor's shape: it may schedule sessions, it may NOT delete events, and it
  // runs at limited actions while `calendar.delete-event` needs full automation.
  const tutorLike = () => {
    enabledOperations = ['calendar.schedule-session', 'calendar.schedule-sessions', 'calendar.create-reminder'];
    permission = 'limited-actions';
  };

  it('undoes a scheduled session under a profile that may schedule but not delete events', async () => {
    tutorLike();
    const result = await performAgentUndo(
      logFor('calendar.schedule-session', 'calendar-event', ['event-1']),
      'save-call|0',
      t,
    );

    expect(result).toMatchObject({ ok: true, operation: { operation: 'calendar.delete-event', claim: 'deleted' } });
    expect(events).toEqual([]);
  });

  it('grants only the registered inverse, only for that entry, and only what the write needs', async () => {
    tutorLike();
    const own = await readAgentUndoContext(t, {
      log: logFor('calendar.schedule-sessions', 'calendar-event', ['event-1']),
      operationId: 'save-call|0',
    });
    expect(own.permission).toBe('full-automation');
    expect(own.allowedOperations).toContain('calendar.delete-event');
    expect(own.allowedOperations).not.toContain('flashcard.delete-cards');

    // Without a subject nothing is granted: deleting events in general stays refused.
    const general = await readAgentUndoContext(t);
    expect(general.permission).toBe('limited-actions');
    expect(general.allowedOperations).not.toContain('calendar.delete-event');
  });

  it('still refuses when the profile no longer allows the write itself', async () => {
    tutorLike();
    enabledOperations = ['calendar.list'];
    expect(await performAgentUndo(logFor('calendar.schedule-session', 'calendar-event', ['event-1']), 'save-call|0', t))
      .toEqual({ ok: false, code: 'operation-denied' });
    expect(deleteCalls).toHaveLength(0);
    expect(events).toEqual(['event-1']);
  });

  it("still refuses below the write's own permission level", async () => {
    tutorLike();
    permission = 'read-only';
    expect(await performAgentUndo(logFor('calendar.schedule-session', 'calendar-event', ['event-1']), 'save-call|0', t))
      .toEqual({ ok: false, code: 'operation-denied' });
    expect(deleteCalls).toHaveLength(0);
  });

  it('records a digest of each created event, and only for created calendar events', () => {
    events = ['event-1', 'event-2'];
    const draft = {
      operation: 'calendar.schedule-sessions',
      claim: 'created',
      entityType: 'calendar-event',
      entityIds: ['event-1', 'event-2'],
      callId: 'plan-call',
    } as const;
    expect(withAgentUndoBaseline(draft as never).inverseArguments).toEqual([
      { id: 'event-1', expect: 'fp:event-1' },
      { id: 'event-2', expect: 'fp:event-2' },
    ]);
    const cards = { ...draft, operation: 'flashcard.add-cards', entityType: 'flashcard' };
    expect(withAgentUndoBaseline(cards as never)).toBe(cards);
    // An id that is not live: nothing to protect, and the Undo will refuse it anyway.
    expect(withAgentUndoBaseline({ ...draft, entityIds: ['gone'] } as never).inverseArguments).toBeUndefined();
  });

  it('refuses, deleting none of them, when the user edited one of the created events since', async () => {
    tutorLike();
    events = ['event-1', 'event-2'];
    const edited = agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
      operation: 'calendar.schedule-sessions',
      claim: 'created',
      entityType: 'calendar-event',
      entityIds: ['event-1', 'event-2'],
      // event-2's digest no longer matches: the user changed it after the Agent made it.
      inverseArguments: [{ id: 'event-1', expect: 'fp:event-1' }, { id: 'event-2', expect: 'fp:before-edit' }],
      callId: 'save-call',
    }, 100);

    expect(await performAgentUndo(edited, 'save-call|0', t)).toEqual({ ok: false, code: 'superseded' });
    expect(deleteCalls).toEqual([]);
    expect(events).toEqual(['event-1', 'event-2']);
  });

  it('passes the digest to the inverse when the events are unchanged', async () => {
    tutorLike();
    const unchanged = agentOperationLogAppend(AGENT_OPERATION_LOG_EMPTY, {
      operation: 'calendar.schedule-session',
      claim: 'created',
      entityType: 'calendar-event',
      entityIds: ['event-1'],
      inverseArguments: [{ id: 'event-1', expect: 'fp:event-1' }],
      callId: 'save-call',
    }, 100);

    expect(await performAgentUndo(unchanged, 'save-call|0', t)).toMatchObject({ ok: true });
    expect(deleteCalls).toEqual([[{ id: 'event-1', expect: 'fp:event-1' }]]);
  });

  it('says "changed since" when the inverse itself refuses for that reason', async () => {
    tutorLike();
    calendarChangedSince = true;
    expect(await performAgentUndo(logFor('calendar.schedule-session', 'calendar-event', ['event-1']), 'save-call|0', t))
      .toEqual({ ok: false, code: 'superseded' });
    expect(events).toEqual(['event-1']);
    // A plain adapter error is still a failure, not a refusal.
    permission = 'full-automation';
    enabledOperations = ['flashcard.delete-cards'];
    deleteFailure = true;
    expect(await performAgentUndo(log(), 'save-call|0', t)).toEqual({ ok: false, code: 'undo-failed' });
  });
});
