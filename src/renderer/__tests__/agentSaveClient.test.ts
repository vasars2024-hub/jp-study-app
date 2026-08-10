/**
 * Confirmation-time Save authorization. Review state is intentionally absent:
 * this suite changes live inputs immediately before the grant and proves the
 * write follows those inputs rather than anything shown earlier.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AgentConversation } from '../../shared/agentWorkspace';

let deck: Array<Record<string, unknown>> = [];
let addCalls: unknown[][] = [];
let addFailure = false;
let enabledOperations: string[] = ['flashcard.add-cards', 'flashcard.delete-cards'];
let permission = 'full-automation';

vi.mock('../flashcardDeck', () => ({
  loadDeck: () => deck,
  addDeckCardsTracked: (entries: Array<Record<string, unknown>>) => {
    addCalls.push(entries);
    if (addFailure) throw new Error('write failed');
    const created = entries.map((entry, index) => ({
      ...entry,
      id: `created-${index + 1}`,
      addedAt: 100 + index,
    }));
    deck = [...created, ...deck];
    return created;
  },
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
    'flashcard.add-cards': () => undefined,
    'flashcard.delete-cards': () => undefined,
  }),
  availableAgentToolOperationIds: () => ['flashcard.add-cards', 'flashcard.delete-cards'],
}));

import { grantAgentSave } from '../agentSaveClient';

const t = (key: string): string => key;

function conversation(): AgentConversation {
  return {
    id: 'chat-1',
    title: 'Dictionary',
    mode: 'study',
    createdAt: 1,
    updatedAt: 1,
    pinned: false,
    archived: false,
    context: [{
      id: 'ctx-word',
      kind: 'dictionary-entry',
      label: '積ん読',
      preview: 'books bought and left unread',
      source: { app: 'dictionary' },
      sensitivity: 'ordinary',
      retained: true,
      createdAt: 1,
    }],
    messages: [{
      id: 'msg-1',
      conversationId: 'chat-1',
      role: 'assistant',
      status: 'complete',
      text: 'Definition',
      createdAt: 1,
      updatedAt: 1,
      contextIds: ['ctx-word'],
      attachments: [],
      cards: [{
        id: 'card-1',
        kind: 'dictionary',
        title: '積ん読',
        sourceContextIds: ['ctx-word'],
        actions: [{
          id: 'save-1',
          label: 'ignored',
          effect: { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
        }],
      }],
    }],
  };
}

const grant = (chat = conversation()) => (
  grantAgentSave(chat, 'msg-1', 'card-1', 'save-1', t)
);

beforeEach(() => {
  deck = [];
  addCalls = [];
  addFailure = false;
  enabledOperations = ['flashcard.add-cards', 'flashcard.delete-cards'];
  permission = 'full-automation';
});

describe('grantAgentSave', () => {
  it('refuses when the active profile was narrowed after review', () => {
    enabledOperations = ['flashcard.delete-cards'];
    expect(grant()).toEqual({ ok: false, code: 'operation-denied' });
    expect(addCalls).toHaveLength(0);
  });

  it('refuses when the source context left after review', () => {
    const chat = conversation();
    chat.context = [];
    expect(grant(chat)).toEqual({ ok: false, code: 'stale-provenance' });
    expect(addCalls).toHaveLength(0);
  });

  it('refuses a duplicate that arrived after review', () => {
    deck = [{ id: 'other', word: '積ん読', addedAt: 5 }];
    expect(grant()).toEqual({ ok: false, code: 'already-saved' });
    expect(addCalls).toHaveLength(0);
  });

  it('returns the exact created row id as an append-only operation draft', () => {
    expect(grant()).toEqual({
      ok: true,
      operation: {
        operation: 'flashcard.add-cards',
        claim: 'created',
        entityType: 'flashcard',
        entityIds: ['created-1'],
        // The row as written, so the pipeline terminal can show WHICH word this
        // step saved rather than only that one card appeared.
        arguments: { word: '積ん読', meaning: 'books bought and left unread' },
        callId: 'save|chat-1|msg-1|card-1|save-1',
      },
    });
    expect(addCalls).toHaveLength(1);
  });

  it('returns a typed failure and no operation when the deck write fails', () => {
    addFailure = true;
    expect(grant()).toEqual({ ok: false, code: 'save-failed' });
  });
});
