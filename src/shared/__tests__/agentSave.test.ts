/**
 * What this gate is for is refusing, so that is what these pin: a session-only
 * context that must never become a durable row, an entity type the effect made
 * up, a word the deck already holds, and an operation the profile has since
 * withdrawn. The success case exists to prove the refusals are not refusing
 * everything.
 */
import { describe, expect, it } from 'vitest';
import {
  AGENT_SAVE_IDLE,
  AGENT_SAVABLE_ENTITY_TYPES,
  agentSaveReduce,
  resolveAgentSave,
  type AgentSaveRun,
  type AgentSaveTarget,
} from '../agentSave';
import type {
  AgentContextItem,
  AgentConversation,
  AgentResultEffect,
} from '../agentWorkspace';

const NOW = 1_700_000_000_000;

const context = (over: Partial<AgentContextItem> = {}): AgentContextItem => ({
  id: 'ctx-word',
  kind: 'dictionary-entry',
  label: '積ん読',
  preview: 'books bought and left unread',
  source: { app: 'dictionary', entityId: '積ん読' },
  sensitivity: 'ordinary',
  retained: true,
  createdAt: NOW,
  ...over,
} as AgentContextItem);

const conversation = (
  effect: AgentResultEffect = { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
  items: AgentContextItem[] = [context()],
  sourceContextIds: string[] = ['ctx-word'],
): AgentConversation => ({
  id: 'chat-1',
  title: 'Chat',
  createdAt: NOW,
  updatedAt: NOW,
  mode: 'assist',
  context: items,
  messages: [{
    id: 'msg-1',
    role: 'assistant' as const,
    status: 'complete' as const,
    text: '',
    createdAt: NOW,
    contextIds: [],
    attachments: [],
    cards: [{
      id: 'card-1',
      kind: 'dictionary' as const,
      title: 'Entry',
      sourceContextIds,
      actions: [{ id: 'action-1', label: 'stored label nobody reads', effect }],
    }],
  }],
} as unknown as AgentConversation);

const resolve = (
  chat = conversation(),
  saved: string[] = [],
  permission: 'read-only' | 'limited-actions' | 'full-automation' = 'full-automation',
  allowed?: readonly ('flashcard.add-cards' | 'flashcard.list-decks')[],
) => resolveAgentSave(chat, 'msg-1', 'card-1', 'action-1', permission, new Set(saved), allowed);

describe('resolveAgentSave', () => {
  it('resolves a dictionary entry and reads the row from the live context', () => {
    expect(resolve()).toEqual({
      ok: true,
      target: {
        entityType: 'flashcard',
        entityId: 'ctx-word',
        word: '積ん読',
        meaning: 'books bought and left unread',
      } satisfies AgentSaveTarget,
    });
  });

  it('shows the context as it is now, not as the card was persisted', () => {
    const renamed = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context({ label: 'edited term', preview: 'edited gloss' })],
    );
    expect(resolve(renamed)).toMatchObject({
      ok: true,
      target: { word: 'edited term', meaning: 'edited gloss' },
    });
  });

  it('never surfaces the stored action label', () => {
    expect(JSON.stringify(resolve())).not.toContain('stored label nobody reads');
  });

  it.each([
    'reading-passage',
    'selected-text',
    'media-cue',
    'study-session',
    'file',
  ] as const)('refuses to make a durable row out of %s context', (kind) => {
    // These are the user's own material, deliberately session-only. A save that
    // accepted one would be the persistence boundary leaking through a button.
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context({ kind })],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'not-savable-kind' });
  });

  it('refuses an entity type the effect made up', () => {
    const chat = conversation({ type: 'save', entityType: 'shell-command', entityId: 'ctx-word' });
    expect(resolve(chat)).toEqual({ ok: false, code: 'unknown-entity-type' });
    expect(AGENT_SAVABLE_ENTITY_TYPES).toEqual(['flashcard']);
  });

  it('refuses an action that is not a save', () => {
    const chat = conversation({ type: 'open-context', contextId: 'ctx-word' });
    expect(resolve(chat)).toEqual({ ok: false, code: 'not-savable' });
  });

  it('refuses an action that is not there', () => {
    expect(
      resolveAgentSave(conversation(), 'msg-1', 'card-1', 'gone', 'full-automation', new Set()),
    ).toEqual({ ok: false, code: 'action-not-found' });
  });

  it('refuses a card that declares no provenance rather than passing it', () => {
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context()],
      [],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'stale-provenance' });
  });

  it('refuses when the named entity has left the shelf', () => {
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-gone' },
      [context()],
      ['ctx-word'],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'entity-not-found' });
  });

  it('refuses an entry with nothing on the front of the card', () => {
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context({ label: '   ' })],
    );
    expect(resolve(chat)).toEqual({ ok: false, code: 'entity-incomplete' });
  });

  it('saves a word with no gloss rather than refusing it', () => {
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context({ preview: '' })],
    );
    expect(resolve(chat)).toMatchObject({ ok: true, target: { meaning: '' } });
  });

  it('refuses a word the deck already holds', () => {
    expect(resolve(conversation(), ['積ん読'])).toEqual({ ok: false, code: 'already-saved' });
  });

  it('compares the trimmed word against the deck, not the raw label', () => {
    const chat = conversation(
      { type: 'save', entityType: 'flashcard', entityId: 'ctx-word' },
      [context({ label: '  積ん読  ' })],
    );
    expect(resolve(chat, ['積ん読'])).toEqual({ ok: false, code: 'already-saved' });
  });

  it('re-authorizes against the permission level as it is now', () => {
    expect(resolve(conversation(), [], 'read-only')).toEqual({
      ok: false,
      code: 'operation-denied',
    });
  });

  it('re-authorizes against the profile’s enabled operations as they are now', () => {
    expect(resolve(conversation(), [], 'full-automation', ['flashcard.list-decks']))
      .toEqual({ ok: false, code: 'operation-denied' });
    expect(resolve(conversation(), [], 'full-automation', ['flashcard.add-cards']).ok).toBe(true);
  });

  it('refuses on permission before it refuses on the deck', () => {
    // Order matters for what the user is told. "You may not do that" is the
    // truer message than "you already did it" when both are true.
    expect(resolve(conversation(), ['積ん読'], 'read-only'))
      .toEqual({ ok: false, code: 'operation-denied' });
  });
});

describe('agentSaveReduce', () => {
  const target: AgentSaveTarget = {
    entityType: 'flashcard',
    entityId: 'ctx-word',
    word: '積ん読',
    meaning: 'gloss',
  };

  it('confirms only from review, and counts the save as an attempt', () => {
    const reviewed = agentSaveReduce(AGENT_SAVE_IDLE, { type: 'review', target });
    expect(reviewed).toMatchObject({ status: 'review', attempts: 0 });
    expect(agentSaveReduce(reviewed, { type: 'confirm' }))
      .toMatchObject({ status: 'saved', attempts: 1, target });
  });

  it('refuses to confirm from idle, where nothing was ever shown', () => {
    expect(agentSaveReduce(AGENT_SAVE_IDLE, { type: 'confirm' })).toEqual(AGENT_SAVE_IDLE);
  });

  it('records a write that failed after the user confirmed', () => {
    // Without this the card would read "saved" over a deck that gained nothing.
    const saved: AgentSaveRun = { status: 'saved', attempts: 1, target };
    expect(agentSaveReduce(saved, { type: 'failed', code: 'save-failed' }))
      .toEqual({ status: 'failed', attempts: 1, code: 'save-failed' });
  });

  it('sends a retry back to idle so the next attempt re-resolves', () => {
    const failed: AgentSaveRun = { status: 'failed', attempts: 1, code: 'already-saved' };
    expect(agentSaveReduce(failed, { type: 'retry' })).toEqual({ status: 'idle', attempts: 1 });
  });

  it('will not cancel or retry a save that already happened', () => {
    const saved: AgentSaveRun = { status: 'saved', attempts: 1, target };
    expect(agentSaveReduce(saved, { type: 'cancel' })).toEqual(saved);
    expect(agentSaveReduce(saved, { type: 'retry' })).toEqual(saved);
    expect(agentSaveReduce(saved, { type: 'dismiss' })).toEqual({ status: 'idle', attempts: 1 });
  });
});
