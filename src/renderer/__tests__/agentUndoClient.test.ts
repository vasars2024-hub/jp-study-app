import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AGENT_OPERATION_LOG_EMPTY,
  agentOperationLogAppend,
} from '../../shared/agentOperationLog';

let deckIds: string[] = ['card-1'];
let deleteCalls: unknown[][] = [];
let deleteFailure = false;
let enabledOperations: string[] = ['flashcard.delete-cards'];
let permission = 'full-automation';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => deckIds.map((id) => ({ id })),
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
  }),
  availableAgentToolOperationIds: () => ['flashcard.delete-cards'],
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

beforeEach(() => {
  deckIds = ['card-1'];
  deleteCalls = [];
  deleteFailure = false;
  enabledOperations = ['flashcard.delete-cards'];
  permission = 'full-automation';
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
