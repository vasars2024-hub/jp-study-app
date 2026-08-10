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
  ],
}));

import { performAgentUndo } from '../agentUndoClient';

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
