// @vitest-environment node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { emptyAgentWorkspaceState } from '../../shared/agentWorkspace';
import { createAgentSessionContextStore } from '../agentSessionContext';
import {
  createAgentWorkspaceStore,
  prepareAgentWorkspaceForPersistence,
  type AgentWorkspaceStore,
} from '../agentWorkspaceStore';

let root = '';
let store: AgentWorkspaceStore;

function document() {
  return {
    version: 1,
    revision: 0,
    activeConversationId: 'chat-1',
    conversations: [{
      id: 'chat-1',
      title: 'Retained chat',
      mode: 'study',
      createdAt: 100,
      updatedAt: 200,
      context: [{
        id: 'ctx-keep',
        kind: 'reading-passage',
        label: 'Retained passage',
        preview: '保存する',
        source: { app: 'reading' },
        sensitivity: 'ordinary',
        retained: true,
        createdAt: 100,
      }, {
        id: 'ctx-session',
        kind: 'selected-text',
        label: 'Session only',
        preview: '秘密',
        source: { app: 'reading' },
        sensitivity: 'sensitive',
        retained: false,
        createdAt: 100,
      }],
      messages: [{
        id: 'message-1',
        conversationId: 'chat-1',
        role: 'user',
        status: 'complete',
        text: 'Explain this.',
        createdAt: 100,
        updatedAt: 100,
        contextIds: ['ctx-keep', 'ctx-session'],
        attachments: [{
          id: 'file-keep',
          kind: 'document',
          name: 'retained.txt',
          sensitivity: 'ordinary',
          retained: true,
        }, {
          id: 'file-session',
          kind: 'image',
          name: 'session.png',
          sensitivity: 'sensitive',
          retained: false,
        }],
        cards: [{
          id: 'card-1',
          kind: 'reading',
          title: 'Reading result repeats 秘密',
          summary: 'Derived from session-only context: 秘密',
          sourceContextIds: ['ctx-keep', 'ctx-session'],
          actions: [{
            id: 'open-session-context',
            label: 'Open',
            effect: { type: 'open-context', contextId: 'ctx-session' },
          }],
        }, {
          id: 'card-retained',
          kind: 'reading',
          title: 'Retained result',
          sourceContextIds: ['ctx-keep'],
          actions: [{
            id: 'open-retained-context',
            label: 'Open retained',
            effect: { type: 'open-context', contextId: 'ctx-keep' },
          }, {
            id: 'open-missing-context',
            label: 'Open missing',
            effect: { type: 'open-context', contextId: 'ctx-session' },
          }],
        }],
        provider: {
          target: { kind: 'cloud', providerId: 'gemini-2.5-flash' },
          cloud: true,
          contextIds: ['ctx-keep', 'ctx-session'],
          attachmentIds: ['file-keep', 'file-session'],
          inputChars: 50,
          startedAt: 100,
        },
      }],
    }, {
      id: 'chat-2',
      title: 'Second chat',
      mode: 'ask',
      createdAt: 300,
      updatedAt: 300,
      context: [],
      messages: [],
    }],
  };
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-workspace-store-'));
  // An explicit session store per test. The default is a process singleton, so
  // sharing it would carry one test's session-only context into the next.
  store = createAgentWorkspaceStore(root, createAgentSessionContextStore());
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('main-owned Agent workspace store', () => {
  it('starts empty for missing, corrupt, or future documents', () => {
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
    fs.mkdirSync(path.dirname(store.filePath), { recursive: true });
    fs.writeFileSync(store.filePath, '{bad json', 'utf8');
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
    fs.writeFileSync(store.filePath, JSON.stringify({ version: 99, conversations: [] }), 'utf8');
    expect(store.read()).toEqual(emptyAgentWorkspaceState());
  });

  it('atomically writes normalized state and leaves no temporary file', () => {
    const saved = store.write(document());
    expect(saved.activeConversationId).toBe('chat-1');
    expect(saved.revision).toBe(1);
    expect(store.read()).toEqual(saved);
    expect(fs.existsSync(store.filePath)).toBe(true);
    expect(fs.readdirSync(path.dirname(store.filePath))).toEqual(['workspace-v1.json']);
  });

  it('refuses a stale compare-and-swap and preserves the newer document', () => {
    const base = store.write(document());
    const pinned = store.compareAndWrite({
      ...base,
      conversations: base.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, pinned: true } : conversation
      )),
    });
    expect(pinned).toMatchObject({ ok: true, state: { revision: 2 } });

    const stale = store.compareAndWrite({
      ...base,
      conversations: base.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, mode: 'analyze' } : conversation
      )),
    });
    expect(stale).toMatchObject({ ok: false, state: { revision: 2 } });
    if (stale.ok) throw new Error('expected stale compare-and-swap to be refused');
    expect(stale.state.conversations.find((conversation) => conversation.id === 'chat-1'))
      .toMatchObject({ pinned: true, mode: 'study' });
    expect(store.read()).toEqual(stale.state);

    const rebased = store.compareAndWrite({
      ...stale.state,
      conversations: stale.state.conversations.map((conversation) => (
        conversation.id === 'chat-1' ? { ...conversation, mode: 'analyze' } : conversation
      )),
    });
    expect(rebased).toMatchObject({ ok: true, state: { revision: 3 } });
    expect(rebased.state.conversations.find((conversation) => conversation.id === 'chat-1'))
      .toMatchObject({ pinned: true, mode: 'analyze' });
  });

  it('never persists session-only context, attachments, or dangling references', () => {
    const persisted = prepareAgentWorkspaceForPersistence(document());
    const conversation = persisted.conversations[0];
    const message = conversation.messages[0];

    expect(conversation.context.map((item) => item.id)).toEqual(['ctx-keep']);
    expect(message.contextIds).toEqual(['ctx-keep']);
    expect(message.attachments.map((item) => item.id)).toEqual(['file-keep']);
    expect(message.cards.map((card) => card.id)).toEqual(['card-retained']);
    expect(message.cards[0].sourceContextIds).toEqual(['ctx-keep']);
    expect(message.cards[0].actions.map((action) => action.id))
      .toEqual(['open-retained-context']);
    expect(message.provider).toMatchObject({
      contextIds: ['ctx-keep'],
      attachmentIds: ['file-keep'],
    });
  });

  it('keeps session-only context live in memory while the file stays retained-only', () => {
    const saved = store.write(document());
    const ids = (state: typeof saved): string[] =>
      state.conversations[0].context.map((item) => item.id);

    // The whole point of the slice: the caller gets both halves back.
    expect(ids(saved)).toEqual(['ctx-keep', 'ctx-session']);
    expect(ids(store.read())).toEqual(['ctx-keep', 'ctx-session']);

    // ...and the bytes on disk carry only the retained half. Asserted on the raw
    // text, not on a parsed round trip, so a normalizer cannot launder it.
    const raw = fs.readFileSync(store.filePath, 'utf8');
    expect(raw).toContain('ctx-keep');
    expect(raw).not.toContain('ctx-session');
    expect(raw).not.toContain('秘密');
    expect(raw).not.toContain('card-1');
    expect(JSON.parse(raw).conversations[0].context).toHaveLength(1);
  });

  it('loses session-only context across a restart and keeps the retained half', () => {
    store.write(document());
    // A new store on the same root with its own session half is what a restart
    // looks like: the file survives, the memory does not.
    const restarted = createAgentWorkspaceStore(root, createAgentSessionContextStore());
    expect(restarted.read().conversations[0].context.map((item) => item.id))
      .toEqual(['ctx-keep']);
  });

  it('removes a session-only item when a save stops listing it', () => {
    store.write(document());
    const current = store.read();
    const trimmed = {
      ...current,
      conversations: current.conversations.map((conversation) => (
        conversation.id === 'chat-1'
          ? {
              ...conversation,
              context: conversation.context.filter((item) => item.id !== 'ctx-session'),
            }
          : conversation
      )),
    };
    // Replace-not-union: a removal reaches the store as a document that simply no
    // longer lists the item, so a union would make the remove control a no-op.
    expect(store.write(trimmed).conversations[0].context.map((item) => item.id))
      .toEqual(['ctx-keep']);
    expect(store.read().conversations[0].context.map((item) => item.id)).toEqual(['ctx-keep']);
  });

  it('deletes one conversation without stripping another conversation\'s session context', () => {
    const base = document();
    base.conversations[1].context = [{
      id: 'ctx-session-2',
      kind: 'media-cue',
      label: 'Session cue',
      preview: '字幕',
      source: { app: 'media' },
      sensitivity: 'personal',
      retained: false,
      createdAt: 300,
    }];
    store.write(base);
    expect(store.read().conversations[1].context.map((item) => item.id)).toEqual(['ctx-session-2']);

    // `deleteConversation` re-derives the session half from the document it writes,
    // so reading the file's view instead of the merged one would quietly drop this.
    const afterDelete = store.deleteConversation('chat-1');
    expect(afterDelete.conversations.map((item) => item.id)).toEqual(['chat-2']);
    expect(afterDelete.conversations[0].context.map((item) => item.id)).toEqual(['ctx-session-2']);
    expect(store.read().conversations[0].context.map((item) => item.id)).toEqual(['ctx-session-2']);
  });

  it('drops session-only context when history is cleared', () => {
    store.write(document());
    expect(store.clear()).toEqual({ ...emptyAgentWorkspaceState(), revision: 2 });
    // Re-creating the conversation must not resurrect the old session item.
    const revived = store.write({
      version: 1,
      activeConversationId: 'chat-1',
      conversations: [{ id: 'chat-1', title: 'Revived', mode: 'ask', createdAt: 400, updatedAt: 400, context: [], messages: [] }],
    });
    expect(revived.conversations[0].context).toEqual([]);
  });

  it('deletes an active conversation safely and can clear all history', () => {
    store.write(document());
    const afterDelete = store.deleteConversation('chat-1');
    expect(afterDelete.conversations.map((item) => item.id)).toEqual(['chat-2']);
    expect(afterDelete.activeConversationId).toBe('chat-2');
    expect(store.read()).toEqual(afterDelete);

    expect(store.clear()).toEqual({ ...emptyAgentWorkspaceState(), revision: 3 });
    expect(store.read()).toEqual({ ...emptyAgentWorkspaceState(), revision: 3 });
  });
});
